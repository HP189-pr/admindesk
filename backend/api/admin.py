
from django.contrib import admin
from .domain_cash_register import Receipt, ReceiptItem, FeeType, normalize_receipt_no, split_receipt
from django.db import models as djmodels
from .domain_emp import EmpProfile, LeaveType, LeaveEntry, LeavePeriod, LeaveAllocation
from .domain_logs import UserActivityLog, ErrorLog
from .domain_degree import StudentDegree, ConvocationMaster
from .domain_fees_ledger import StudentFeesLedger
import csv
import io
import re

class ReceiptItemInline(admin.TabularInline):
    model = ReceiptItem
    extra = 0
    fields = ("fee_type", "amount", "remark")
    autocomplete_fields = ("fee_type",)

@admin.register(EmpProfile)
class EmpProfileAdmin(admin.ModelAdmin):
    list_display = ('emp_id', 'emp_short', 'emp_name', 'emp_designation', 'status', 'username', 'usercode', 'el_balance', 'sl_balance', 'cl_balance', 'vacation_balance')
    search_fields = ('emp_id', 'emp_short', 'emp_name', 'username', 'usercode')
    list_filter = ('status', 'leave_group', 'department_joining', 'institute_id')

def _assign_user_field(obj, user, field_name: str):
    """Set `field_name` on `obj` to `user` or `user.username` depending on field type."""
    try:
        field = obj._meta.get_field(field_name)
        ftype = field.get_internal_type()
        if ftype in ('CharField', 'TextField'):
            try:
                setattr(obj, field_name, getattr(user, 'username', str(user)))
            except Exception:
                setattr(obj, field_name, str(user))
        else:
            setattr(obj, field_name, user)
    except Exception:
        try:
            setattr(obj, field_name, getattr(user, 'username', str(user)))
        except Exception:
            pass

@admin.register(LeaveType)
class LeaveTypeAdmin(admin.ModelAdmin):
    list_display = ('leave_code', 'leave_name', 'main_type', 'annual_allocation', 'is_half', 'is_active')
    search_fields = ('leave_code', 'leave_name')
    list_filter = ('main_type', 'is_active')

@admin.register(LeaveEntry)
class LeaveEntryAdmin(admin.ModelAdmin):
    list_display = ('leave_report_no', 'emp', 'leave_type', 'start_date', 'end_date', 'total_days', 'status', 'created_by', 'approved_by')
    search_fields = ('leave_report_no', 'emp__emp_name', 'leave_type__leave_name')
    list_filter = ('status', 'leave_type', 'emp')


@admin.register(LeavePeriod)
class LeavePeriodAdmin(admin.ModelAdmin):
    list_display = ('period_name', 'start_date', 'end_date', 'created_at')
    search_fields = ('period_name',)
    list_filter = ('start_date',)


@admin.register(LeaveAllocation)
class LeaveAllocationAdmin(admin.ModelAdmin):
    list_display = (
        'id', 'emp_id_field', 'leave_code_field', 'period_id_field', 'apply_to',
        'allocated', 'allocated_start_date', 'allocated_end_date',
        'created_at', 'updated_at'
    )
    list_display_links = ('id',)
    list_editable = ('allocated', 'allocated_start_date', 'allocated_end_date')
    search_fields = ('emp__emp_name', 'leave_code', 'emp__emp_id')
    list_filter = ('period', 'apply_to', 'leave_code')
    readonly_fields = ('created_at', 'updated_at')
    fields = (
        'apply_to', 'emp', 'leave_code', 'period',
        'allocated', 'allocated_start_date', 'allocated_end_date',
        'created_at', 'updated_at'
    )
    raw_id_fields = ('emp', 'period')

    def emp_id_field(self, obj):
        """Display emp_id for employee-specific allocations, or 'ALL' for global"""
        try:
            if str(obj.apply_to).upper() == 'ALL':
                return 'ALL'
            return obj.emp.emp_id if obj.emp else 'N/A'
        except Exception:
            return 'N/A'
    emp_id_field.short_description = 'emp_id'
    
    def period_id_field(self, obj):
        """Display period ID"""
        try:
            return obj.period.id if obj.period else None
        except Exception:
            return None
    period_id_field.short_description = 'period_id'

    def leave_code_field(self, obj):
        """Display leave_code"""
        try:
            return obj.leave_code or ''
        except Exception:
            return ''
    leave_code_field.short_description = 'leave_code'

    def allocated_field(self, obj):
        """Display allocated only for employee-specific allocations"""
        try:
            if obj.profile is None:
                return ''
            return obj.allocated if obj.allocated else ''
        except Exception:
            return ''
    allocated_field.short_description = 'allocated'

    def period_id_field(self, obj):
        try:
            return getattr(obj, 'period_id', None)
        except Exception:
            return None
    period_id_field.short_description = 'period_id'

from .domain_emp import LeaveEntry, LeaveAllocation


class LeaveAllocationInline(admin.TabularInline):
    model = LeaveAllocation
    extra = 0
    fields = (
        'leave_code', 'period', 'allocated',
        'allocated_start_date', 'allocated_end_date'
    )
    readonly_fields = ()


class LeaveEntryInline(admin.TabularInline):
    model = LeaveEntry
    extra = 0
    fields = ('leave_report_no', 'leave_type', 'start_date', 'end_date', 'total_days', 'status')
    readonly_fields = ('leave_report_no', 'total_days')

EmpProfileAdmin.inlines = getattr(EmpProfileAdmin, 'inlines', ()) + (LeaveAllocationInline, LeaveEntryInline)

@admin.register(UserActivityLog)
class UserActivityLogAdmin(admin.ModelAdmin):
    list_display = ('id', 'user', 'module', 'action', 'path', 'method', 'status_code', 'created_at')
    readonly_fields = ('created_at', 'updated_at')
    search_fields = ('user__username', 'module', 'action', 'path')


@admin.register(ErrorLog)
class ErrorLogAdmin(admin.ModelAdmin):
    list_display = ('id', 'user', 'path', 'method', 'message', 'created_at')
    readonly_fields = ('created_at', 'updated_at')
    search_fields = ('user__username', 'path', 'message')

import base64
from decimal import Decimal, InvalidOperation
from io import BytesIO, StringIO
from datetime import datetime, date, timedelta
from typing import Any, Dict, List, Optional

from django.contrib import admin, messages
from django.contrib.auth import get_user_model
from django.db import transaction
from django.http import JsonResponse, HttpResponse
from django.shortcuts import render
from django.urls import path, reverse
from django.utils import timezone
from django.views.decorators.csrf import csrf_exempt

try:  # Optional pandas (Excel support)
    import pandas as pd  # type: ignore
except Exception:  # pragma: no cover
    pd = None  # type: ignore

from .models import (
    MainBranch, SubBranch, Module, Menu, UserPermission, Institute, Enrollment,
    AdmissionCancel, DocRec, PayPrefixRule, Eca, InstLetterMain, InstLetterStudent,
    MigrationRecord, ProvisionalRecord, StudentProfile, Verification, FeeType,
    Receipt
)
from .models import ProvisionalStatus
from .cash_register import ReceiptNumberService

User = get_user_model()

from .admin_excelupload import ExcelUploadMixin

class CommonAdminMixin(ExcelUploadMixin, admin.ModelAdmin):
    """Adds reusable change templates + Excel upload link (if pandas installed)."""
    change_list_template = "subbranch/reusable_change_list.html"
    change_form_template = "subbranch/reusable_change_form.html"

    def add_view(self, request, form_url='', extra_context=None):  # type: ignore[override]
        extra_context = extra_context or {}
        if pd:
            try:
                extra_context["upload_excel_url"] = reverse(
                    f"admin:{self.model._meta.app_label}_{self.model._meta.model_name}_upload_excel"
                )
            except Exception:
                extra_context["upload_excel_url"] = "../upload-excel/"
        return super().add_view(request, form_url, extra_context=extra_context)

    def changelist_view(self, request, extra_context=None):  # type: ignore[override]
        extra_context = extra_context or {}
        if pd:
            extra_context["upload_excel_url"] = reverse(
                f"admin:{self.model._meta.app_label}_{self.model._meta.model_name}_upload_excel"
            )
        return super().changelist_view(request, extra_context=extra_context)

@admin.register(DocRec)
class DocRecAdmin(CommonAdminMixin):
    list_display = ("id", "apply_for", "doc_rec_id", "pay_by", "pay_rec_no_pre", "pay_rec_no", "pay_amount", "createdat")
    list_filter = ("apply_for", "pay_by", "createdat")
    search_fields = ("doc_rec_id", "pay_rec_no", "pay_rec_no_pre")
    readonly_fields = ("doc_rec_id", "pay_rec_no_pre", "createdat", "updatedat")

@admin.register(PayPrefixRule)
class PayPrefixRuleAdmin(admin.ModelAdmin):
    list_display = ("id", "pay_by", "year_full", "pattern", "is_active", "priority", "createdat", "updatedat")
    list_filter = ("pay_by", "year_full", "is_active")
    search_fields = ("pattern",)
    ordering = ("-is_active", "pay_by", "-year_full", "-priority", "-id")

@admin.register(Eca)
class EcaAdmin(admin.ModelAdmin):
    list_display = ("id", "doc_rec", "eca_name", "eca_ref_no", "eca_send_date", "created_by", "createdat")
    list_filter = ("eca_send_date", "created_by", "createdat")
    search_fields = ("eca_name", "eca_ref_no", "doc_rec__doc_rec_id")
    autocomplete_fields = ("doc_rec", "created_by")
    readonly_fields = ("createdat", "updatedat")
    def save_model(self, request, obj, form, change):  # type: ignore[override]
        if not change and not obj.created_by:
            _assign_user_field(obj, request.user, 'created_by')
        super().save_model(request, obj, form, change)

@admin.register(InstLetterMain)
class InstLetterMainAdmin(admin.ModelAdmin):
    list_display = ("id", "doc_rec", "inst_veri_number", "inst_veri_date", "institute", "rec_inst_city", "doc_types", 'rec_inst_sfx_name', 'rec_inst_phone', 'iv_status')
    list_filter = ("inst_veri_date", "institute", 'iv_status')

@admin.register(MigrationRecord)
class MigrationRecordAdmin(CommonAdminMixin):
    list_display = ("id", "mg_number", "mg_date", "student_name", "enrollment", "institute", "maincourse", "subcourse", "mg_status", "doc_rec", "pay_rec_no", "created_by", "created_at")
    list_filter = ("mg_status", "mg_date", "institute")
    # doc_rec is stored as a varchar (doc_rec_id string) so search on the field directly
    search_fields = ("mg_number", "student_name", "enrollment__enrollment_no", "doc_rec")
    # remove doc_rec from autocomplete_fields because it's not a FK anymore
    autocomplete_fields = ("enrollment", "institute", "maincourse", "subcourse", "created_by")
    readonly_fields = ("created_at", "updated_at")
    def save_model(self, request, obj, form, change):  # type: ignore[override]
        if not change and not obj.created_by:
            _assign_user_field(obj, request.user, 'created_by')
        super().save_model(request, obj, form, change)

@admin.register(ProvisionalRecord)
class ProvisionalRecordAdmin(CommonAdminMixin):
    list_display = ("id", "prv_number", "prv_date", "student_name", "enrollment", "institute", "maincourse", "subcourse", "prv_status", "doc_rec", "pay_rec_no", "created_by", "created_at")
    list_filter = ("prv_status", "prv_date", "institute")
    search_fields = ("prv_number", "student_name", "enrollment__enrollment_no", "doc_rec")
    autocomplete_fields = ("enrollment", "institute", "maincourse", "subcourse", "created_by")
    readonly_fields = ("created_at", "updated_at")
    def save_model(self, request, obj, form, change):  # type: ignore[override]
        if not change and not obj.created_by:
            _assign_user_field(obj, request.user, 'created_by')
        super().save_model(request, obj, form, change)

@admin.register(MainBranch)
class MainBranchAdmin(CommonAdminMixin):
    list_display = ("id", "maincourse_id", "course_code", "course_name", "created_at", "updated_at")
    search_fields = ("maincourse_id", "course_name", "course_code")
    list_filter = ("created_at", "updated_at")
    readonly_fields = ("created_at", "updated_at")

@admin.register(SubBranch)
class SubBranchAdmin(CommonAdminMixin):
    list_display = ("id", "subcourse_id", "subcourse_name", "maincourse", "created_at", "updated_at")
    search_fields = ("subcourse_id", "subcourse_name", "maincourse__course_name")
    list_filter = ("maincourse", "created_at", "updated_at")
    readonly_fields = ("created_at", "updated_at")
    autocomplete_fields = ("maincourse",)

@admin.register(Module)
class ModuleAdmin(admin.ModelAdmin):
    list_display = ('moduleid', 'name', 'created_at', 'updated_at', 'updated_by')
    search_fields = ('name__icontains',)
    list_filter = ('created_at', 'updated_at')
    readonly_fields = ('created_at', 'updated_at')

@admin.register(Menu)
class MenuAdmin(admin.ModelAdmin):
    list_display = ('menuid', 'name', 'module', 'created_at', 'updated_at', 'updated_by')
    search_fields = ('name', 'menuid')


@admin.register(FeeType)
class FeeTypeAdmin(CommonAdminMixin):
    list_display = ("code", "name", "is_active", "created_at", "updated_at")
    search_fields = ("code", "name")
    list_filter = ("is_active",)
    ordering = ("code",)
    readonly_fields = ("created_at", "updated_at")


@admin.register(Receipt)
class ReceiptAdmin(CommonAdminMixin):
    inlines = [ReceiptItemInline]
    list_display = ("receipt_no_full", "rec_ref", "rec_no", "date", "payment_mode", "total_amount", "created_by", "created_at")
    search_fields = ("receipt_no_full", "rec_ref", "remark__icontains")
    list_filter = ("payment_mode", "date")
    readonly_fields = ("receipt_no_full", "rec_ref", "rec_no", "created_by", "created_at", "updated_at")
    autocomplete_fields = ()
    ordering = ("-date", "-rec_ref", "-rec_no")
    date_hierarchy = "date"

    def save_model(self, request, obj, form, change):  # type: ignore[override]
        if not change:
            if not getattr(obj, "created_by", None):
                _assign_user_field(obj, request.user, 'created_by')
            if not getattr(obj, "receipt_no_full", None):
                entry_date = obj.date or timezone.now().date()
                with transaction.atomic():
                    seq_vals = ReceiptNumberService.next_numbers(obj.payment_mode, entry_date, lock=True)
                obj.rec_ref = seq_vals["rec_ref"]
                obj.rec_no = seq_vals["rec_no"]
                obj.receipt_no_full = seq_vals["receipt_no_full"]
        normalized_full = normalize_receipt_no(getattr(obj, "receipt_no_full", None))
        if normalized_full:
            obj.receipt_no_full = normalized_full
        super().save_model(request, obj, form, change)

try:
    admin.site.unregister(EmpProfile)
except Exception:
    pass


@admin.register(EmpProfile)
class EmpProfileUploadAdmin(CommonAdminMixin):
    list_display = (
        'emp_id', 'emp_name', 'emp_designation', 'status', 'username', 'usercode',
        'el_balance_display', 'sl_balance_display', 'cl_balance_display', 'vacation_balance_display',
        'actual_joining_display'
    )
    search_fields = ('emp_id', 'emp_name', 'username', 'usercode')
    list_filter = ('status', 'leave_group', 'department_joining', 'institute_id')
    inlines = (LeaveAllocationInline, LeaveEntryInline)

    def _fmt_decimal(self, val):
        try:
            from decimal import Decimal
            if val is None:
                return ''
            d = val if isinstance(val, Decimal) else Decimal(str(val))
            if d == d.to_integral():
                return str(int(d))
            return str(d.normalize())
        except Exception:
            return str(val)

    def _fmt_date(self, val):
        if not val:
            return ''
        try:
            return val.strftime('%d-%m-%Y')
        except Exception:
            return str(val)

    def el_balance_display(self, obj):
        return self._fmt_decimal(getattr(obj, 'el_balance', None))
    el_balance_display.short_description = 'EL Balance'

    def sl_balance_display(self, obj):
        return self._fmt_decimal(getattr(obj, 'sl_balance', None))
    sl_balance_display.short_description = 'SL Balance'

    def cl_balance_display(self, obj):
        return self._fmt_decimal(getattr(obj, 'cl_balance', None))
    cl_balance_display.short_description = 'CL Balance'

    def vacation_balance_display(self, obj):
        return self._fmt_decimal(getattr(obj, 'vacation_balance', None))
    vacation_balance_display.short_description = 'Vacation'

    def actual_joining_display(self, obj):
        return self._fmt_date(getattr(obj, 'actual_joining', None))
    actual_joining_display.short_description = 'Joining Date'


try:
    admin.site.unregister(LeaveEntry)
except Exception:
    pass


@admin.register(LeaveEntry)
class LeaveEntryUploadAdmin(CommonAdminMixin):
    list_display = ('leave_report_no', 'emp', 'emp_name', 'leave_type', 'start_date', 'end_date', 'total_days', 'status', 'report_date', 'leave_remark', 'created_by', 'approved_by')
    search_fields = ('leave_report_no', 'emp__emp_name', 'leave_type__leave_name')
    list_filter = ('status', 'leave_type', 'emp')
    readonly_fields = ('leave_report_no', 'total_days')

@admin.register(UserPermission)
class UserPermissionAdmin(admin.ModelAdmin):
    list_display = ('permitid', 'user', 'module', 'menu', 'can_view', 'can_edit', 'can_delete', 'can_create', 'created_at')
    search_fields = ('user__username__icontains', 'module__name__icontains', 'menu__name__icontains')
    list_filter = ('module', 'menu', 'can_view', 'can_edit', 'can_delete', 'can_create')
    readonly_fields = ('created_at',)
    autocomplete_fields = ('user', 'module', 'menu')

@admin.register(Institute)
class InstituteAdmin(CommonAdminMixin):
    list_display = ("institute_id", "institute_code", "institute_name", "institute_campus", "institute_address", "institute_city", "created_at", "updated_at", "updated_by")
    search_fields = ("institute_code", "institute_name", "institute_campus", "institute_city")
    list_filter = ("created_at", "updated_at", "institute_campus", "institute_city")
    readonly_fields = ("created_at", "updated_at")

@admin.register(Enrollment)
class EnrollmentAdmin(CommonAdminMixin):
    list_display = ("student_name", "institute", "batch", "subcourse", "maincourse", "enrollment_no", "temp_enroll_no", "enrollment_date", "admission_date", "created_at", "updated_at", "updated_by")
    search_fields = ("student_name", "enrollment_no", "temp_enroll_no")
    list_filter = ("institute", "batch", "maincourse", "subcourse", "enrollment_date", "admission_date")
    readonly_fields = ("created_at", "updated_at")

@admin.register(AdmissionCancel)
class AdmissionCancelAdmin(CommonAdminMixin):
    list_display = ("id", "enrollment", "student_name", "inward_no", "inward_date", "outward_no", "outward_date", "status", "created_at")
    search_fields = ("enrollment__enrollment_no", "enrollment__temp_enroll_no", "student_name", "inward_no", "outward_no")
    list_filter = ("status", "inward_date", "outward_date", "created_at")
    readonly_fields = ("created_at",)
    autocomplete_fields = ("enrollment",)

@admin.register(InstLetterStudent)
class InstLetterStudentAdmin(admin.ModelAdmin):
    list_display = ("id", "doc_rec", "sr_no", "enrollment", "student_name",  "study_mode", "verification_status")
    list_filter = ("verification_status",  "study_mode")
    search_fields = ("doc_rec__doc_rec_id", "enrollment__enrollment_no", "student_name")
    autocomplete_fields = ("doc_rec", "enrollment")

@admin.register(StudentProfile)
class StudentProfileAdmin(CommonAdminMixin):
    list_display = ("id", "enrollment", "gender", "birth_date", "city1", "city2", "contact_no", "abc_id", "photo_uploaded", "is_d2d", "updated_at")
    search_fields = ("enrollment__enrollment_no", "enrollment__student_name", "abc_id", "aadhar_no", "mobile_adhar", "name_adhar", "mother_name", "father_name", "category")
    list_filter = ("gender", "city1", "city2", "photo_uploaded", "is_d2d", "category")
    readonly_fields = ("created_at", "updated_at")
    autocomplete_fields = ("enrollment",)

@admin.register(Verification)
class VerificationAdmin(CommonAdminMixin):
    list_display = (
        "date_display",
        "enrollment_no",
        "second_enrollment_id",
        "student_name",
        "tr_count",
        "ms_count",
        "dg_count",
        "moi_count",
        "backlog_count",
        "status",
        "done_date_display",
        "final_no",
        "mail_flag",
        "seq",
        "doc_rec_remark",
        "eca_required_flag",
        "eca_name",
        "eca_ref_no",
        "eca_send_date",
        "eca_status",
        "eca_resubmit_date",
    )
    search_fields = ("doc_rec__doc_rec_id", "enrollment_no", "student_name", "final_no")
    list_filter = ("status", "doc_rec_date")
    autocomplete_fields = ("doc_rec",)
    readonly_fields = ("createdat", "updatedat")

    def date_display(self, obj):
        try:
            d = getattr(obj, 'doc_rec_date', None)
        except Exception:
            d = None
        return d.strftime('%d-%m-%Y') if d else '-'
    date_display.short_description = 'Date'

    def done_date_display(self, obj):
        return obj.vr_done_date.strftime('%d-%m-%Y') if obj.vr_done_date else '-'
    done_date_display.short_description = 'Done Date'

    def mail_flag(self, obj):
        return 'Y' if (obj.mail_status or '').upper() == 'SENT' else 'N'
    mail_flag.short_description = 'Mail'

    def eca_required_flag(self, obj):
        return 'Y' if obj.eca_required else 'N'
    eca_required_flag.short_description = 'ECA Req'

    def doc_rec_remark(self, obj):
        val = None
        try:
            val = getattr(obj, 'doc_rec_remark', None)
        except Exception:
            val = None
        if not val and getattr(obj, 'doc_rec', None):
            try:
                val = getattr(obj.doc_rec, 'doc_rec_remark', None)
            except Exception:
                val = None
        if val is None:
            return ''
        s = str(val)
        if s.lower() == 'nan':
            return ''
        return s
    doc_rec_remark.short_description = 'Doc Rec Remark'

    def seq(self, obj):
        return obj.pk
    seq.short_description = 'Sequence'

    def save_model(self, request, obj, form, change):  # type: ignore[override]
        if not change and not getattr(obj, 'updatedby', None):
            try:
                _assign_user_field(obj, request.user, 'updatedby')
            except Exception:
                pass
        super().save_model(request, obj, form, change)
        try:
            new_remark = form.cleaned_data.get('doc_rec_remark')
        except Exception:
            new_remark = None
        if new_remark is not None and getattr(obj, 'doc_rec', None):
            try:
                if isinstance(obj.doc_rec, str):
                    dr = DocRec.objects.filter(doc_rec_id=obj.doc_rec).first()
                    if dr:
                        dr.doc_rec_remark = new_remark
                        dr.save()
                else:
                    obj.doc_rec.doc_rec_remark = new_remark
                    obj.doc_rec.save()
            except Exception:
                pass

    def get_form(self, request, obj=None, **kwargs):
        form = super().get_form(request, obj, **kwargs)
        from django import forms
        class WrappedForm(form):
            doc_rec_remark = forms.CharField(required=False, label='Doc Rec Remark')
            def __init__(self_inner, *a, **kw):
                super().__init__(*a, **kw)
                if obj and getattr(obj, 'doc_rec', None):
                    try:
                        if isinstance(obj.doc_rec, str):
                            dr = DocRec.objects.filter(doc_rec_id=obj.doc_rec).first()
                            if dr:
                                self_inner.fields['doc_rec_remark'].initial = dr.doc_rec_remark
                        else:
                            self_inner.fields['doc_rec_remark'].initial = obj.doc_rec.doc_rec_remark
                    except Exception:
                        pass
        return WrappedForm

@admin.register(ConvocationMaster)
class ConvocationMasterAdmin(admin.ModelAdmin):
    """Admin for Convocation Master"""
    list_display = ('convocation_no', 'convocation_title', 'convocation_date', 'month_year')
    list_display_links = ('convocation_no', 'convocation_title')
    search_fields = ('convocation_no', 'convocation_title', 'month_year')
    list_filter = ('convocation_date',)
    ordering = ('-convocation_date',)
    
    fieldsets = (
        ('Convocation Details', {
            'fields': ('convocation_no', 'convocation_title', 'convocation_date', 'month_year')
        }),
    )


@admin.register(StudentDegree)
class StudentDegreeAdmin(CommonAdminMixin):
    """Admin for Student Degree with Excel bulk upload"""
    list_display = (
        'dg_sr_no', 'enrollment_no', 'student_name_dg', 'degree_name',
        'specialisation', 'convocation_no', 'last_exam_year', 'class_obtain'
    )
    list_display_links = ('dg_sr_no', 'enrollment_no')
    search_fields = (
        'dg_sr_no', 'enrollment_no', 'student_name_dg', 'degree_name',
        'institute_name_dg', 'seat_last_exam'
    )
    list_filter = ('convocation_no', 'last_exam_year', 'degree_name', 'class_obtain', 'dg_gender')
    ordering = ('-id',)
    list_per_page = 50
    
    fieldsets = (
        ('Basic Information', {
            'fields': ('dg_sr_no', 'enrollment_no', 'student_name_dg', 'dg_gender', 'dg_address')
        }),
        ('Degree Details', {
            'fields': (
                'degree_name', 'specialisation', 'institute_name_dg',
                'seat_last_exam', 'last_exam_month', 'last_exam_year', 'class_obtain'
            )
        }),
        ('Additional Information', {
            'fields': ('course_language', 'dg_rec_no', 'convocation_no')
        }),
    )
    
    actions = ['export_to_csv']
    
    def export_to_csv(self, request, queryset):
        """Export selected degrees to CSV"""
        from django.http import HttpResponse
        
        response = HttpResponse(content_type='text/csv')
        response['Content-Disposition'] = 'attachment; filename="student_degrees.csv"'
        
        writer = csv.writer(response)
        writer.writerow([
            'dg_sr_no', 'enrollment_no', 'student_name_dg', 'dg_address',
            'institute_name_dg', 'degree_name', 'specialisation', 'seat_last_exam',
            'last_exam_month', 'last_exam_year', 'class_obtain', 'course_language',
            'dg_rec_no', 'dg_gender', 'convocation_no'
        ])

        for degree in queryset:
            writer.writerow([
                degree.dg_sr_no or '',
                degree.enrollment_no or '',
                degree.student_name_dg or '',
                degree.dg_address or '',
                degree.institute_name_dg or '',
                degree.degree_name or '',
                degree.specialisation or '',
                degree.seat_last_exam or '',
                degree.last_exam_month or '',
                degree.last_exam_year or '',
                degree.class_obtain or '',
                degree.course_language or '',
                degree.dg_rec_no or '',
                degree.dg_gender or '',
                degree.convocation_no or '',
            ])
        
        return response
    
    export_to_csv.short_description = "Export selected to CSV"

@admin.register(StudentFeesLedger)
class StudentFeesLedgerAdmin(CommonAdminMixin):
    list_display = ("receipt_no", "enrollment", "receipt_date", "term", "amount", "created_by", "created_at")
    search_fields = ("receipt_no", "enrollment__enrollment_no", "enrollment__temp_enroll_no", "enrollment__student_name")
    list_filter = ("receipt_date", "term")
    readonly_fields = ("created_at", "updated_at") if hasattr(StudentFeesLedger, 'updated_at') else ("created_at",)
    autocomplete_fields = ("enrollment",)

    def save_model(self, request, obj, form, change):  # type: ignore[override]
        if not change and not getattr(obj, "created_by", None):
            _assign_user_field(obj, request.user, 'created_by')
        super().save_model(request, obj, form, change)

