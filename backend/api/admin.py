from django.contrib import admin
from django.db import models as djmodels
from .domain_emp import EmpProfile, LeaveType, LeaveEntry, LeavePeriod, LeaveAllocation
from .domain_logs import UserActivityLog, ErrorLog
from .domain_degree import StudentDegree, ConvocationMaster
import csv
import io

@admin.register(EmpProfile)
class EmpProfileAdmin(admin.ModelAdmin):
    list_display = ('emp_id', 'emp_short', 'emp_name', 'emp_designation', 'status', 'username', 'usercode', 'el_balance', 'sl_balance', 'cl_balance', 'vacation_balance')
    search_fields = ('emp_id', 'emp_short', 'emp_name', 'username', 'usercode')
    list_filter = ('status', 'leave_group', 'department_joining', 'institute_id')
    # allow inline management of allocations and leave entries from the employee page
    # Inlines are defined later and injected here via ModelAdmin.inlines assignment below.

# Helper to assign a user value to a model field that may be either a FK or a CharField.
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
    # Allow quick edits for allocation numeric/date columns directly in the changelist
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
            if obj.apply_to == 'ALL':
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


# ============================================================================
# REMOVED: LeaveBalanceSnapshot Admin
# LeaveBalanceSnapshot removed - using live balance engine (leave_engine.py)
# ============================================================================


# Inline admin registrations so allocations and leave entries can be edited on EmpProfile page
from .domain_emp import LeaveEntry, LeaveAllocation


class LeaveAllocationInline(admin.TabularInline):
    model = LeaveAllocation
    extra = 0
    fields = (
        'leave_type', 'period', 'allocated',
        'allocated_start_date', 'allocated_end_date'
    )
    readonly_fields = ()


class LeaveEntryInline(admin.TabularInline):
    model = LeaveEntry
    extra = 0
    fields = ('leave_report_no', 'leave_type', 'start_date', 'end_date', 'total_days', 'status')
    readonly_fields = ('leave_report_no', 'total_days')


# Attach inlines to EmpProfileAdmin (ensure tuple concatenation)
EmpProfileAdmin.inlines = getattr(EmpProfileAdmin, 'inlines', ()) + (LeaveAllocationInline, LeaveEntryInline)

# register logs
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
"""
File: backend/api/admin.py
Purpose: Django admin registrations + reusable AJAX Excel import logic.

Notes:
 - This file was de-duplicated and cleaned (multiple earlier duplicate @admin.register
     sections removed). Only one registration per model now.
 - Business logic unchanged; only structural / cosmetic cleanup for maintainability.
 - ExcelUploadMixin provides secure, whitelisted bulk import (AJAX only).
 - Further refactors (splitting per-domain admin modules) can be done in a later phase
     without breaking current imports.
"""

import base64
from decimal import Decimal, InvalidOperation
from io import BytesIO
from datetime import datetime, date, timedelta
from typing import Any, Dict, List

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
    DocRec, PayPrefixRule, Eca, InstVerificationMain, InstVerificationStudent,
    MigrationRecord, ProvisionalRecord, StudentProfile, Verification, FeeType,
    CashRegister
)
from .models import ProvisionalStatus
from .cash_register import ReceiptNumberService

User = get_user_model()

# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def _sanitize(v: Any) -> str:
    if v is None:
        return ""
    return str(v).replace("\r", " ").replace("\n", " ")

def parse_excel_date(val: Any):  # Robust NaT/variant-safe parser (kept lightweight)
    """Parse diverse Excel/CSV cell date values into a python date.

    Handles:
      - pandas.Timestamp (tz-aware or naive)
      - pandas.NaT or other NA markers => None
      - Excel serial numbers (>25000 heuristic)
      - Common string formats (Y-m-d, d-m-Y, d/m/Y, Y/m/d)
      - datetime / date objects
    Guaranteed to return either a date instance or None (never pandas NaT), preventing
    downstream Django DateField assignment errors like 'NaTType does not support utcoffset'.
    """
    if val is None:
        return None
    # Fast-path for already-correct types
    if isinstance(val, date) and not isinstance(val, datetime):
        return val
    if isinstance(val, datetime):
        # Strip tz if present then take .date()
        if getattr(val, 'tzinfo', None) is not None:
            try:
                val = val.replace(tzinfo=None)
            except Exception:
                pass
        return val.date()

    # Optional pandas handling
    try:  # pragma: no cover (environment conditional)
        import pandas as pd  # type: ignore
    except Exception:  # pragma: no cover
        pd = None  # type: ignore

    if pd is not None:
        try:
            if pd.isna(val):  # Covers NaTType, numpy.nan, <NA>
                return None
        except Exception:
            pass
        # pandas.Timestamp
        if isinstance(val, pd.Timestamp):  # type: ignore[attr-defined]
            try:
                py_dt = val.to_pydatetime()
                if getattr(py_dt, 'tzinfo', None) is not None:
                    py_dt = py_dt.replace(tzinfo=None)
                return py_dt.date()
            except Exception:
                return None

    # Excel serial number (rough heuristic) - only if numeric and large enough
    if isinstance(val, (int, float)):
        try:
            if val > 25000:  # ~1958-07-22 onward
                origin = datetime(1899, 12, 30)
                return (origin + timedelta(days=int(val))).date()
        except Exception:
            pass

    # Text normalization & sentinel markers
    sval = str(val).strip()
    if sval.lower() in ("nat", "nan", "null", "none", "<na>") or sval == "":
        return None

    # Try common explicit formats (day-first and year-first variants)
    for fmt in ("%Y-%m-%d", "%d-%m-%Y", "%d/%m/%Y", "%Y/%m/%d", "%m/%d/%Y", "%d.%m.%Y"):
        try:
            return datetime.strptime(sval, fmt).date()
        except Exception:
            continue
    return None


def _clean_cell(val: Any):
    """Normalize a cell value from pandas/Excel into a safe Python value.

    - Converts pandas NaN/NaT and common sentinel strings to None
    - Strips strings and returns None for empty strings
    - Returns the original value for non-string values (after NaN check)
    """
    if val is None:
        return None
    try:
        # pandas/numpy NA check
        import pandas as _pd  # type: ignore
        if _pd is not None:
            try:
                if _pd.isna(val):
                    return None
            except Exception:
                pass
    except Exception:
        pass
    s = str(val).strip()
    if s == "" or s.lower() in ("nan", "none", "<na>"):
        return None
    return s


def _row_value(row, column_name: str):
    """Return the scalar value for a column in a DataFrame row.

    When alias renames create duplicate column headers pandas exposes the row
    values as a Series. We collapse those duplicates by picking the last
    non-empty value so we always feed scalars into downstream parsers.
    """
    if row is None or not column_name:
        return None
    try:
        value = row.get(column_name)
    except Exception:
        return None
    if pd is not None:
        try:
            series_cls = getattr(pd, "Series", None)
        except Exception:
            series_cls = None
        if series_cls is not None and isinstance(value, series_cls):
            try:
                seq = list(value.tolist())
            except Exception:
                seq = list(value)
            for item in reversed(seq):
                if item is None:
                    continue
                if isinstance(item, str) and not item.strip():
                    continue
                return item
            return None
    if isinstance(value, (list, tuple)):
        for item in value:
            if item is None:
                continue
            if isinstance(item, str) and not item.strip():
                continue
            return item
        return None
    return value


def _parse_boolean_cell(val: Any):
    """Best-effort bool parser for Excel uploads."""
    if val is None:
        return None
    if isinstance(val, bool):
        return val
    try:
        sval = str(val).strip()
    except Exception:
        sval = str(val)
    if sval == "":
        return None
    lowered = sval.lower()
    if lowered in {"1", "true", "t", "yes", "y", "active", "enabled"}:
        return True
    if lowered in {"0", "false", "f", "no", "n", "inactive", "disabled"}:
        return False
    raise ValueError(f"Unrecognized boolean value: {val}")


def resolve_docrec(raw_doc_rec_id: Any):
    """Try to resolve a DocRec object from a raw imported doc_rec_id.

    Strategies (in order):
    - exact stripped match
    - case-insensitive match (`iexact`)
    - normalized alphanumeric lowercase match against recent DocRec rows

    Returns DocRec instance or None.
    """
    if raw_doc_rec_id is None:
        return None
    try:
        k = str(raw_doc_rec_id).strip()
    except Exception:
        k = str(raw_doc_rec_id)
    if not k:
        return None
    try:
        dr = DocRec.objects.filter(doc_rec_id=k).first()
        if dr:
            return dr
    except Exception:
        dr = None
    try:
        dr = DocRec.objects.filter(doc_rec_id__iexact=k).first()
        if dr:
            return dr
    except Exception:
        dr = None
    # Fallback: normalized alphanumeric comparison (best-effort)
    try:
        import re
        norm = re.sub(r'[^0-9a-zA-Z]', '', k).lower()
        if norm:
            for cand in DocRec.objects.all()[:20000]:
                try:
                    if re.sub(r'[^0-9a-zA-Z]', '', str(cand.doc_rec_id)).lower() == norm:
                        return cand
                except Exception:
                    continue
    except Exception:
        pass
    return None


def _normalize_choice(raw: Any, choices_cls):
    """Map a raw incoming status/choice string to a valid internal choice value.

    Accepts either the stored value (e.g. 'DONE') or the human label (e.g. 'Done'),
    case-insensitive, and with a best-effort alphanumeric-normalized match.
    Returns the internal choice value (e.g. 'DONE') or None if no match.
    """
    if raw is None:
        return None
    try:
        s = str(raw).strip()
        if not s:
            return None
    except Exception:
        s = str(raw)
    try:
        import re
        cand_norm = re.sub(r'[^0-9a-zA-Z]', '', s).lower()
        # Accept either a choices class with .choices or a raw sequence of tuples
        choices_seq = None
        if hasattr(choices_cls, 'choices'):
            choices_seq = choices_cls.choices
        else:
            choices_seq = choices_cls
        for val, label in choices_seq:
            try:
                if s.lower() == str(val).lower() or s.lower() == str(label).lower():
                    return val
                # normalized compare
                lab_norm = re.sub(r'[^0-9a-zA-Z]', '', str(label)).lower()
                if cand_norm and lab_norm and cand_norm == lab_norm:
                    return val
            except Exception:
                continue
        # final fallback: compare against value uppercased
        su = s.upper()
        for val, _ in choices_cls.choices:
            try:
                if su == str(val):
                    return val
            except Exception:
                continue
    except Exception:
        return None
    return None

# ---------------------------------------------------------------------------
# Import spec (whitelist + required keys)
# ---------------------------------------------------------------------------

def get_import_spec(model) -> Dict[str, Any]:
    specs: Dict[type, Dict[str, Any]] = {
        MainBranch: {"allowed_columns": ["maincourse_id", "course_code", "course_name"], "required_keys": ["maincourse_id"], "create_requires": ["maincourse_id"]},
        SubBranch: {"allowed_columns": ["subcourse_id", "subcourse_name", "maincourse_id"], "required_keys": ["subcourse_id", "maincourse_id"], "create_requires": ["subcourse_id", "maincourse_id"]},
        Institute: {"allowed_columns": ["institute_id", "institute_code", "institute_name", "institute_campus", "institute_address", "institute_city"], "required_keys": ["institute_id"], "create_requires": ["institute_id", "institute_code"]},
        Enrollment: {"allowed_columns": ["enrollment_no", "student_name", "batch", "institute_id", "subcourse_id", "maincourse_id", "temp_enroll_no", "enrollment_date", "admission_date"], "required_keys": ["enrollment_no"], "create_requires": ["enrollment_no", "student_name", "batch", "institute_id", "subcourse_id", "maincourse_id"]},
            # Employee (EmpProfile) bulk upload
            EmpProfile: {"allowed_columns": ["emp_id", "emp_name", "emp_designation", "username", "usercode", "actual_joining", "emp_birth_date", "usr_birth_date", "department_joining", "institute_id", "status", "el_balance", "sl_balance", "cl_balance", "vacation_balance", "joining_year_allocation_el", "joining_year_allocation_cl", "joining_year_allocation_sl", "joining_year_allocation_vac", "leave_calculation_date", "emp_short"], "required_keys": ["emp_id"], "create_requires": ["emp_id", "emp_name"]},
            # LeaveEntry bulk upload
            LeaveEntry: {"allowed_columns": ["leave_report_no", "emp_id", "leave_code", "start_date", "end_date", "total_days", "reason", "status", "created_by", "approved_by", "approved_at"], "required_keys": ["leave_report_no"], "create_requires": ["leave_report_no", "emp_id", "leave_code", "start_date"]},
        StudentProfile: {"allowed_columns": ["enrollment_no", "gender", "birth_date", "address1", "address2", "city1", "city2", "contact_no", "email", "fees", "hostel_required", "aadhar_no", "abc_id", "mobile_adhar", "name_adhar", "mother_name", "category", "photo_uploaded", "is_d2d", "program_medium"], "required_keys": ["enrollment_no"], "create_requires": ["enrollment_no"]},
    FeeType: {"allowed_columns": ["code", "name", "is_active"], "required_keys": ["code", "name"], "create_requires": ["code", "name"]},
    CashRegister: {"allowed_columns": ["receipt_no_full", "rec_ref", "rec_no", "date", "payment_mode", "fee_type", "fee_type_code", "amount", "remark"], "required_keys": ["date", "payment_mode", "amount"], "create_requires": ["date", "payment_mode", "amount"]},
    DocRec: {"allowed_columns": ["apply_for", "doc_rec_id", "pay_by", "pay_rec_no_pre", "pay_rec_no", "pay_amount", "doc_rec_date", "doc_rec_remark"], "required_keys": ["apply_for", "doc_rec_id", "pay_by"], "create_requires": ["apply_for", "doc_rec_id", "pay_by"]},
    MigrationRecord: {"allowed_columns": ["doc_rec_id", "enrollment_no", "student_name", "institute_id", "maincourse_id", "subcourse_id", "mg_number", "mg_date", "exam_year", "admission_year", "exam_details", "mg_status", "pay_rec_no"], "required_keys": ["doc_rec_id"], "create_requires": ["doc_rec_id"]},
    ProvisionalRecord: {"allowed_columns": ["doc_rec_id", "enrollment_no", "student_name", "institute_id", "maincourse_id", "subcourse_id", "prv_number", "prv_date", "class_obtain", "prv_degree_name", "passing_year", "prv_status", "pay_rec_no"], "required_keys": ["doc_rec_id"], "create_requires": ["doc_rec_id"]},
    Verification: {"allowed_columns": ["doc_rec_id", "date", "enrollment_no", "second_enrollment_no", "student_name", "no_of_transcript", "no_of_marksheet", "no_of_degree", "no_of_moi", "no_of_backlog", "status", "final_no", "pay_rec_no", "vr_done_date", "mail_status", "eca_required", "eca_name", "eca_ref_no", "eca_submit_date", "eca_remark", "doc_rec_remark"], "required_keys": ["doc_rec_id"], "create_requires": ["doc_rec_id"]},
    StudentDegree: {"allowed_columns": ["dg_sr_no", "enrollment_no", "student_name_dg", "dg_address", "institute_name_dg", "degree_name", "specialisation", "seat_last_exam", "last_exam_month", "last_exam_year", "class_obtain", "course_language", "dg_rec_no", "dg_gender", "convocation_no"], "required_keys": ["enrollment_no"], "create_requires": ["enrollment_no"]},
    }
    for klass, spec in specs.items():
        if issubclass(model, klass):
            return spec
    return {"allowed_columns": [], "required_keys": [], "create_requires": []}


COLUMN_ALIAS_MAP: Dict[type, Dict[str, str]] = {
    CashRegister: {
        "fee_code": "fee_type_code",
        "feecode": "fee_type_code",
        "fee code": "fee_type_code",
        "cash_rec_no": "receipt_no_full",
        "cash rec no": "receipt_no_full",
        "cashrecno": "receipt_no_full",
        "receipt_no": "receipt_no_full",
        "receipt no": "receipt_no_full",
    },
}


def _build_allowed_maps(model):
    spec = get_import_spec(model)
    allowed_set = set(spec["allowed_columns"])
    allowed_map = {str(col).lower(): col for col in allowed_set}
    alias_map: Dict[str, str] = {}
    for klass, aliases in COLUMN_ALIAS_MAP.items():
        if issubclass(model, klass):
            for alias, target in aliases.items():
                if target in allowed_set:
                    alias_map[alias.lower()] = target
    return spec, allowed_set, allowed_map, alias_map


def _resolve_column_name(raw, allowed_map, alias_map):
    key = str(raw).strip().lower()
    if not key:
        return None
    return allowed_map.get(key) or alias_map.get(key)

# ---------------------------------------------------------------------------
# AJAX Excel Upload Mixin
# ---------------------------------------------------------------------------

class ExcelUploadMixin:
    upload_template = "subbranch/upload_excel_page.html"

    def get_urls(self):  # type: ignore[override]
        urls = super().get_urls()  # type: ignore
        # Wrap upload view with csrf_exempt but still enforce admin auth via admin_view.
        # This avoids "CSRF token incorrect length" errors for JS FormData posts when the
        # front-end script fails to include the token, while still restricting to staff users.
        secured_upload = self.admin_site.admin_view(csrf_exempt(self.upload_excel))
        my = [
            path("upload-excel/", secured_upload, name=f"{self.model._meta.app_label}_{self.model._meta.model_name}_upload_excel"),
            path("download-template/", self.admin_site.admin_view(self.download_template), name=f"{self.model._meta.app_label}_{self.model._meta.model_name}_download_template"),
        ]
        return my + urls

    def download_template(self, request):  # type: ignore
        spec = get_import_spec(self.model)
        header = ",".join(spec["allowed_columns"]) + "\n"
        resp = HttpResponse(header, content_type="text/csv")
        resp["Content-Disposition"] = f"attachment; filename={self.model._meta.model_name}_template.csv"
        return resp

    def upload_excel(self, request):  # type: ignore
        if not pd:
            messages.error(request, "Pandas not installed. Excel upload disabled.")
            return render(request, self.upload_template, {
                "title": f"Upload Excel for {self.model._meta.verbose_name}",
                "download_url": reverse(f"admin:{self.model._meta.app_label}_{self.model._meta.model_name}_download_template"),
            })

        if request.method == "POST" and request.headers.get("X-Requested-With") == "XMLHttpRequest":
            action = request.POST.get("action")
            try:
                # ---- init ----
                if action == "init":
                    up = request.FILES.get("file")
                    if not up:
                        return JsonResponse({"error": "No file uploaded"}, status=400)
                    # Basic guards (size + extension)
                    MAX_UPLOAD_BYTES = 20 * 1024 * 1024  # 20MB
                    if up.size > MAX_UPLOAD_BYTES:
                        return JsonResponse({"error": f"File too large (> {MAX_UPLOAD_BYTES // (1024*1024)}MB)"}, status=413)
                    allowed_ext = {".xlsx", ".xls"}
                    ext = ("." + up.name.rsplit(".", 1)[-1].lower()) if "." in up.name else ""
                    if ext not in allowed_ext:
                        return JsonResponse({"error": "Unsupported file type. Use .xlsx or .xls"}, status=415)
                    request.session["excel_data"] = base64.b64encode(up.read()).decode("utf-8")
                    up.seek(0)
                    try:
                        sheets = list(pd.read_excel(up, sheet_name=None, nrows=0).keys())
                    except Exception as e:
                        return JsonResponse({"error": f"Read error: {e}"}, status=400)
                    return JsonResponse({"sheets": sheets})

                # ---- columns ----
                if action == "columns":
                    sheet = request.POST.get("sheet")
                    encoded = request.session.get("excel_data")
                    if not encoded:
                        return JsonResponse({"error": "Session expired"}, status=400)
                    spec, allowed, allowed_map, alias_map = _build_allowed_maps(self.model)
                    required_keys = spec["required_keys"]

                    # Try to detect the correct header row. Some Excel files include title rows
                    # above the real header which causes pandas to read columns as Unnamed.
                    # We'll try header rows 0..2 and pick the one that yields the most matches
                    # against the allowed whitelist.
                    best_header = 0
                    best_score = -1
                    frames = None
                    read_err = None
                    for try_h in (0, 1, 2):
                        try:
                            frames_try = pd.read_excel(BytesIO(base64.b64decode(encoded)), sheet_name=None, header=try_h, nrows=0)
                        except Exception as e:
                            read_err = e
                            continue
                        if sheet not in frames_try:
                            continue
                        cols_try = [str(c).strip() for c in frames_try[sheet].columns]
                        usable_try = [c for c in cols_try if _resolve_column_name(c, allowed_map, alias_map)]
                        score = len(usable_try)
                        # prefer header with more usable allowed columns
                        if score > best_score:
                            best_score = score
                            best_header = try_h
                            frames = frames_try

                    if frames is None:
                        # final attempt without header override to bubble up the original error
                        try:
                            frames = pd.read_excel(BytesIO(base64.b64decode(encoded)), sheet_name=None, nrows=0)
                        except Exception as e:
                            return JsonResponse({"error": f"Read error: {e}"}, status=400)

                    if sheet not in frames:
                        return JsonResponse({"error": "Sheet not found"}, status=404)

                    # Persist detected header row per-sheet in session so preview/commit use same
                    header_map = request.session.get('excel_header_rows', {})
                    header_map[str(sheet)] = int(best_header)
                    request.session['excel_header_rows'] = header_map

                    cols_present = [str(c).strip() for c in frames[sheet].columns]
                    usable: List[str] = []
                    unrecognized: List[str] = []
                    mapped_seen = set()
                    for col in cols_present:
                        resolved = _resolve_column_name(col, allowed_map, alias_map)
                        if resolved:
                            usable.append(col)
                            mapped_seen.add(resolved)
                        else:
                            unrecognized.append(col)
                    required_missing = [rk for rk in required_keys if rk not in mapped_seen]
                    return JsonResponse({
                        "columns": usable,
                        "unrecognized": unrecognized,
                        "required_keys": required_keys,
                        "required_missing": required_missing,
                        "detected_header": header_map.get(str(sheet), 0),
                    })

                # Debug helper: return raw column names Pandas sees for diagnosis
                if action == "debug_columns":
                    sheet = request.POST.get("sheet")
                    encoded = request.session.get("excel_data")
                    if not encoded:
                        return JsonResponse({"error": "Session expired"}, status=400)
                    try:
                        # Try with the stored header row first
                        header_map = request.session.get('excel_header_rows', {})
                        header_row = header_map.get(str(sheet), 0)
                        frames = pd.read_excel(BytesIO(base64.b64decode(encoded)), sheet_name=None, header=header_row)
                    except Exception:
                        try:
                            frames = pd.read_excel(BytesIO(base64.b64decode(encoded)), sheet_name=None)
                        except Exception as e:
                            return JsonResponse({"error": f"Read error: {e}"}, status=400)
                    if sheet not in frames:
                        return JsonResponse({"error": "Sheet not found"}, status=404)
                    raw_cols = [str(c) for c in frames[sheet].columns]
                    return JsonResponse({"raw_columns": raw_cols, "detected_header": header_map.get(str(sheet), 0)})

                # ---- preview ----
                if action == "preview":
                    sheet = request.POST.get("sheet")
                    selected = request.POST.getlist("columns[]")
                    if not selected:
                        return JsonResponse({"error": "Select at least one column"}, status=400)
                    encoded = request.session.get("excel_data")
                    if not encoded:
                        return JsonResponse({"error": "Session expired"}, status=400)
                    # Respect any detected header row for this sheet (fallback to 0)
                    header_map = request.session.get('excel_header_rows', {})
                    header_row = header_map.get(str(sheet), 0)
                    try:
                        frames = pd.read_excel(BytesIO(base64.b64decode(encoded)), sheet_name=None, header=header_row)
                    except Exception as e:
                        return JsonResponse({"error": f"Read error: {e}"}, status=400)
                    if sheet not in frames:
                        return JsonResponse({"error": "Sheet not found"}, status=404)
                    df = frames[sheet]
                    # Normalize column names (strip accidental whitespace) to match allowed columns
                    try:
                        df.columns = [str(c).strip() for c in df.columns]
                    except Exception:
                        pass

                    # Replace literal string sentinels that may appear in Excel cells
                    try:
                        if pd is not None:
                            df = df.replace({r'^\s*nan\s*$': None, r'^\s*NaN\s*$': None, r'^\s*None\s*$': None, '<NA>': None}, regex=True)
                    except Exception:
                        pass
                    total = len(df.index)
                    preview_df = df[selected].head(50).fillna("")
                    rows = [list(map(_sanitize, r)) for r in preview_df.values.tolist()]
                    return JsonResponse({
                        "columns": selected,
                        "rows": rows,
                        "preview_rows": len(rows),
                        "total_rows": total,
                    })

                # ---- commit ----
                if action == "commit":
                    sheet = request.POST.get("sheet")
                    selected = request.POST.getlist("columns[]")
                    if not selected:
                        return JsonResponse({"error": "No columns selected"}, status=400)
                    encoded = request.session.get("excel_data")
                    if not encoded:
                        return JsonResponse({"error": "Session expired"}, status=400)
                    # Respect detected header row if available when committing
                    header_map = request.session.get('excel_header_rows', {})
                    header_row = header_map.get(str(sheet), 0)
                    try:
                        frames = pd.read_excel(BytesIO(base64.b64decode(encoded)), sheet_name=None, header=header_row)
                    except Exception as e:
                        return JsonResponse({"error": f"Read error: {e}"}, status=400)
                    if sheet not in frames:
                        return JsonResponse({"error": "Sheet not found"}, status=404)
                    spec, allowed, allowed_map, alias_map = _build_allowed_maps(self.model)
                    required = set(spec["required_keys"])
                    normalized_selection: List[str] = []
                    for raw in selected:
                        resolved = _resolve_column_name(raw, allowed_map, alias_map)
                        if resolved:
                            normalized_selection.append(resolved)
                    chosen = normalized_selection
                    if not required.issubset(chosen):
                        return JsonResponse({"error": "All required columns must be selected"}, status=400)
                    df = frames[sheet]
                    try:
                        df.columns = [str(c).strip() for c in df.columns]
                    except Exception:
                        pass
                    if allowed_map:
                        try:
                            rename_map = {}
                            for col in list(df.columns):
                                resolved = _resolve_column_name(col, allowed_map, alias_map)
                                if resolved and resolved != col:
                                    rename_map[col] = resolved
                            if rename_map:
                                df.rename(columns=rename_map, inplace=True)
                        except Exception:
                            pass
                    # Clean numeric/foreign-key like id columns so pandas.nan does not get passed
                    try:
                        if pd is not None:
                            for fk_col in ("institute_id", "maincourse_id", "subcourse_id"):
                                if fk_col in df.columns:
                                    # Replace NA/NaN/None with Python None
                                    df[fk_col] = df[fk_col].apply(lambda v: None if (pd.isna(v) or (isinstance(v, str) and str(v).strip().lower() in ("nan","none","<na>"))) else v)
                    except Exception:
                        # be tolerant: proceed without vectorized cleaning if something fails
                        pass
                    # Clean decimal-like numeric columns (avoid passing 'nan' strings to DecimalField)
                    try:
                        if pd is not None:
                            # Common decimal columns across models (EmpProfile, LeaveAllocation snapshot, etc.)
                            decimal_cols = [
                                "el_balance", "sl_balance", "cl_balance", "vacation_balance",
                                "joining_year_allocation_el", "joining_year_allocation_cl", "joining_year_allocation_sl", "joining_year_allocation_vac",
                                "total_days", "pay_amount", "allocated",
                            ]
                            for c in decimal_cols:
                                if c in df.columns:
                                    try:
                                        # coerce non-numeric (including pandas NA/NaN and strings like 'nan') to NaN
                                        df[c] = pd.to_numeric(df[c], errors='coerce')
                                        # replace NaN with 0 to satisfy DecimalField (most balance fields default to 0)
                                        df[c] = df[c].fillna(0)
                                    except Exception:
                                        # best-effort: fallback to per-cell cleaning
                                        def _clean_num(v):
                                            try:
                                                if pd.isna(v):
                                                    return 0
                                            except Exception:
                                                pass
                                            try:
                                                s = str(v).strip()
                                                if s.lower() in ("", "nan", "none", "<na>"):
                                                    return 0
                                                return float(s)
                                            except Exception:
                                                return 0
                                        df[c] = df[c].apply(_clean_num)
                    except Exception:
                        # tolerate any issues here and continue; row-level handling will still skip bad rows
                        pass
                    # Vectorized date normalization to plain date objects (prevents NaTType tz issues)
                    if pd is not None:
                        def _normalize(col_names):
                            for c in col_names:
                                if c in df.columns:
                                    try:
                                        df[c] = pd.to_datetime(df[c], errors='coerce', dayfirst=True).dt.date
                                    except Exception:
                                        pass
                        # sheet_norm not yet defined here; derive directly
                        sheet_lc = (sheet or "").lower().replace(" ", "")
                        # Generic date columns across sheets
                        _normalize(["doc_rec_date","date","birth_date"])  # safe no-op if absent
                        if sheet_lc == "enrollment":
                            _normalize(["enrollment_date","admission_date"])
                        elif sheet_lc == "migration":
                            _normalize(["mg_date"])
                        elif sheet_lc == "provisional":
                            _normalize(["prv_date"])
                    counts = {"created": 0, "updated": 0, "skipped": 0}
                    log: List[Dict[str, Any]] = []
                    def add_log(rn, status, msg, ref=None):
                        log.append({"row": rn, "status": status, "message": msg, "ref": ref})
                    sheet_norm = sheet.lower().replace(" ", "")
                    eff = set(chosen)
                    try:
                        if issubclass(self.model, MainBranch) and sheet_norm == "maincourse":
                            for i, (_, r) in enumerate(df.iterrows(), start=2):
                                mc = str(r.get("maincourse_id") or "").strip()
                                if not mc:
                                    counts["skipped"] += 1; add_log(i, "skipped", "Missing maincourse_id"); continue
                                obj, created = MainBranch.objects.update_or_create(
                                    maincourse_id=mc,
                                    defaults={
                                        **({"course_code": r.get("course_code")} if "course_code" in eff else {}),
                                        **({"course_name": r.get("course_name")} if "course_name" in eff else {}),
                                        "updated_by": request.user,
                                    }
                                )
                                if created: counts["created"] += 1; add_log(i, "created", "Created", mc)
                                else: counts["updated"] += 1; add_log(i, "updated", "Updated", mc)
                        elif issubclass(self.model, SubBranch) and sheet_norm == "subcourse":
                            for i, (_, r) in enumerate(df.iterrows(), start=2):
                                sb = str(r.get("subcourse_id") or "").strip()
                                mc = str(r.get("maincourse_id") or "").strip()
                                if not (sb and mc):
                                    counts["skipped"] += 1; add_log(i, "skipped", "Missing subcourse_id/maincourse_id"); continue
                                main = MainBranch.objects.filter(maincourse_id=mc).first()
                                if not main:
                                    counts["skipped"] += 1; add_log(i, "skipped", f"maincourse {mc} not found"); continue
                                obj, created = SubBranch.objects.update_or_create(
                                    subcourse_id=sb,
                                    defaults={
                                        **({"subcourse_name": r.get("subcourse_name")} if "subcourse_name" in eff else {}),
                                        **({"maincourse": main} if "maincourse_id" in eff else {}),
                                        "updated_by": request.user,
                                    }
                                )
                                if created: counts["created"] += 1; add_log(i, "created", "Created", sb)
                                else: counts["updated"] += 1; add_log(i, "updated", "Updated", sb)
                        elif issubclass(self.model, Institute):  # relax sheet name requirement
                            for i, (_, r) in enumerate(df.iterrows(), start=2):
                                iid = _clean_cell(r.get("institute_id"))
                                if iid in (None, ""):
                                    counts["skipped"] += 1; add_log(i, "skipped", "Missing institute_id"); continue
                                obj, created = Institute.objects.update_or_create(
                                    institute_id=iid,
                                    defaults={
                                        **({"institute_code": r.get("institute_code")} if "institute_code" in eff else {}),
                                        **({"institute_name": r.get("institute_name")} if "institute_name" in eff else {}),
                                        **({"institute_campus": r.get("institute_campus")} if "institute_campus" in eff else {}),
                                        **({"institute_address": r.get("institute_address")} if "institute_address" in eff else {}),
                                        **({"institute_city": r.get("institute_city")} if "institute_city" in eff else {}),
                                        "updated_by": request.user,
                                    }
                                )
                                if created: counts["created"] += 1; add_log(i, "created", "Created", iid)
                                else: counts["updated"] += 1; add_log(i, "updated", "Updated", iid)
                        elif issubclass(self.model, Enrollment) and sheet_norm == "enrollment":
                            for i, (_, r) in enumerate(df.iterrows(), start=2):
                                try:
                                    en = str(r.get("enrollment_no") or "").strip()
                                    if not en:
                                        counts["skipped"] += 1; add_log(i, "skipped", "Missing enrollment_no"); continue
                                    inst_key = _clean_cell(r.get("institute_id")) if "institute_id" in eff else None
                                    sub_key = _clean_cell(r.get("subcourse_id")) if "subcourse_id" in eff else None
                                    main_key = _clean_cell(r.get("maincourse_id")) if "maincourse_id" in eff else None
                                    inst = Institute.objects.filter(institute_id=inst_key).first() if inst_key else None
                                    sub = SubBranch.objects.filter(subcourse_id=sub_key).first() if sub_key else None
                                    main = MainBranch.objects.filter(maincourse_id=main_key).first() if main_key else None
                                    if ("institute_id" in eff and not inst) or ("subcourse_id" in eff and not sub) or ("maincourse_id" in eff and not main):
                                        counts["skipped"] += 1; add_log(i, "skipped", "Related FK missing"); continue
                                    # Parse dates robustly; skip problematic conversions (NaTType etc.)
                                    def _safe_date(cell):
                                        try:
                                            d = parse_excel_date(cell)
                                            if hasattr(d, 'to_pydatetime'):
                                                d = d.to_pydatetime()
                                            if isinstance(d, datetime):
                                                if d.tzinfo is not None:
                                                    d = d.replace(tzinfo=None)
                                                return d.date()
                                            return d if isinstance(d, date) else None
                                        except Exception:
                                            return None
                                    enroll_dt = _safe_date(r.get("enrollment_date")) if "enrollment_date" in eff else None
                                    adm_dt = _safe_date(r.get("admission_date")) if "admission_date" in eff else None
                                    obj, created = Enrollment.objects.update_or_create(
                                        enrollment_no=en,
                                        defaults={
                                            **({"student_name": r.get("student_name")} if "student_name" in eff else {}),
                                            **({"batch": r.get("batch")} if "batch" in eff else {}),
                                            **({"institute": inst} if getattr(inst, 'pk', None) is not None and "institute_id" in eff else {}),
                                            **({"subcourse": sub} if getattr(sub, 'pk', None) is not None and "subcourse_id" in eff else {}),
                                            **({"maincourse": main} if getattr(main, 'pk', None) is not None and "maincourse_id" in eff else {}),
                                            **({"temp_enroll_no": r.get("temp_enroll_no")} if "temp_enroll_no" in eff else {}),
                                            **({"enrollment_date": enroll_dt} if enroll_dt and "enrollment_date" in eff else {}),
                                            **({"admission_date": adm_dt} if adm_dt and "admission_date" in eff else {}),
                                            "updated_by": request.user,
                                        }
                                    )
                                    if created: counts["created"] += 1; add_log(i, "created", "Created", en)
                                    else: counts["updated"] += 1; add_log(i, "updated", "Updated", en)
                                except Exception as row_err:
                                    # Attempt recovery for NaTType/utcoffset errors by retrying without date fields
                                    err_txt = str(row_err)
                                    if 'NaTType' in err_txt or 'utcoffset' in err_txt:
                                        try:
                                            obj, created = Enrollment.objects.update_or_create(
                                                enrollment_no=str(r.get("enrollment_no") or '').strip(),
                                                defaults={
                                                    **({"student_name": r.get("student_name")} if "student_name" in eff else {}),
                                                    **({"batch": r.get("batch")} if "batch" in eff else {}),
                                                    **({"institute": inst} if 'inst' in locals() and getattr(inst, 'pk', None) is not None and "institute_id" in eff else {}),
                                                    **({"subcourse": sub} if 'sub' in locals() and getattr(sub, 'pk', None) is not None and "subcourse_id" in eff else {}),
                                                    **({"maincourse": main} if 'main' in locals() and getattr(main, 'pk', None) is not None and "maincourse_id" in eff else {}),
                                                    **({"temp_enroll_no": r.get("temp_enroll_no")} if "temp_enroll_no" in eff else {}),
                                                    # intentionally omit enrollment_date / admission_date
                                                    "updated_by": request.user,
                                                }
                                            )
                                            if created: counts["created"] += 1; add_log(i, "created", "Recovered without dates", r.get("enrollment_no"))
                                            else: counts["updated"] += 1; add_log(i, "updated", "Recovered without dates", r.get("enrollment_no"))
                                            continue
                                        except Exception as recover_err:
                                            counts["skipped"] += 1; add_log(i, "skipped", f"Row error: {recover_err}", str(r.get("enrollment_no") or '').strip()); continue
                                    counts["skipped"] += 1; add_log(i, "skipped", f"Row error: {row_err}", str(r.get("enrollment_no") or '').strip())
                                    continue
                        elif issubclass(self.model, DocRec) and sheet_norm in ("docrec", "doc_rec"):
                            for i, (_, r) in enumerate(df.iterrows(), start=2):
                                apply_for = str(r.get("apply_for") or "").strip().upper()
                                pay_by = str(r.get("pay_by") or "").strip().upper()
                                doc_rec_id = str(r.get("doc_rec_id") or "").strip()
                                if not (apply_for and pay_by and doc_rec_id):
                                    counts["skipped"] += 1; add_log(i, "skipped", "Missing apply_for/pay_by/doc_rec_id"); continue
                                pay_rec_no_pre = str(r.get("pay_rec_no_pre") or "").strip()
                                pay_rec_no = str(r.get("pay_rec_no") or "").strip() or None
                                pay_amount = None
                                if "pay_amount" in eff:
                                    try:
                                        raw_pay = r.get("pay_amount")
                                        if str(raw_pay).strip() not in ("", "None"):
                                            pay_amount = float(raw_pay)
                                    except Exception:
                                        pay_amount = None
                                doc_date = parse_excel_date(r.get("doc_rec_date")) if "doc_rec_date" in eff else None
                                # Resolve existing DocRec robustly to avoid duplicate doc_rec_id variants
                                obj = resolve_docrec(doc_rec_id)
                                created = False
                                if not obj:
                                    try:
                                        obj = DocRec.objects.create(
                                            doc_rec_id=doc_rec_id,
                                            doc_rec_date=doc_date,
                                            apply_for=apply_for,
                                            created_by=request.user,
                                        )
                                        created = True
                                        # If additional fields were in the selected columns, set them now
                                        if "pay_rec_no_pre" in eff: obj.pay_rec_no_pre = pay_rec_no_pre
                                        if "pay_rec_no" in eff: obj.pay_rec_no = pay_rec_no
                                        if "pay_amount" in eff and (pay_amount is not None): obj.pay_amount = pay_amount or 0
                                        if "doc_rec_date" in eff and doc_date: obj.doc_rec_date = doc_date
                                        obj.save()
                                    except Exception as e:
                                        counts["skipped"] += 1; add_log(i, "skipped", f"Failed create docrec: {e}"); continue
                                else:
                                    # existing DocRec found: update fields if allowed
                                    if "apply_for" in eff: obj.apply_for = apply_for
                                    if "pay_by" in eff: obj.pay_by = pay_by
                                    if "pay_rec_no_pre" in eff: obj.pay_rec_no_pre = pay_rec_no_pre
                                    if "pay_rec_no" in eff: obj.pay_rec_no = pay_rec_no
                                    if "pay_amount" in eff and (pay_amount is not None): obj.pay_amount = pay_amount or 0
                                    if "doc_rec_date" in eff and doc_date: obj.doc_rec_date = doc_date
                                    try:
                                        obj.save()
                                    except Exception:
                                        pass
                                if created: counts["created"] += 1; add_log(i, "created", "Created", doc_rec_id)
                                else: counts["updated"] += 1; add_log(i, "updated", "Updated", doc_rec_id)
                        elif issubclass(self.model, FeeType):
                            for i, (_, r) in enumerate(df.iterrows(), start=2):
                                code = _clean_cell(r.get("code")) if "code" in eff else None
                                name = _clean_cell(r.get("name")) if "name" in eff else None
                                if not code or not name:
                                    counts["skipped"] += 1; add_log(i, "skipped", "Missing code/name"); continue
                                code = str(code).upper()
                                try:
                                    is_active = _parse_boolean_cell(r.get("is_active")) if "is_active" in eff else None
                                except ValueError as bool_err:
                                    counts["skipped"] += 1; add_log(i, "skipped", f"Invalid is_active: {bool_err}"); continue
                                defaults = {"name": name}
                                if is_active is not None:
                                    defaults["is_active"] = is_active
                                obj, created = FeeType.objects.update_or_create(code=code, defaults=defaults)
                                if created: counts["created"] += 1; add_log(i, "created", "Created", code)
                                else: counts["updated"] += 1; add_log(i, "updated", "Updated", code)
                        elif issubclass(self.model, CashRegister):
                            if "fee_type_code" not in eff and "fee_type" not in eff:
                                return JsonResponse({"error": "Select fee_type_code or fee_type column"}, status=400)
                            valid_modes = {choice[0] for choice in CashRegister.PAYMENT_MODE_CHOICES}
                            for i, (_, r) in enumerate(df.iterrows(), start=2):
                                payment_raw = _clean_cell(_row_value(r, "payment_mode")) if "payment_mode" in eff else None
                                payment_mode = (payment_raw or "").upper()
                                if payment_mode not in valid_modes:
                                    counts["skipped"] += 1; add_log(i, "skipped", "Invalid payment_mode"); continue
                                entry_date = parse_excel_date(_row_value(r, "date")) if "date" in eff else None
                                if not entry_date:
                                    counts["skipped"] += 1; add_log(i, "skipped", "Missing/invalid date"); continue
                                amount_raw = _row_value(r, "amount") if "amount" in eff else None
                                try:
                                    amount_val = Decimal(str(amount_raw))
                                except (InvalidOperation, TypeError):
                                    counts["skipped"] += 1; add_log(i, "skipped", "Invalid amount"); continue
                                fee_obj = None
                                if "fee_type" in eff:
                                    fee_pk = _clean_cell(_row_value(r, "fee_type"))
                                    if fee_pk not in (None, ""):
                                        try:
                                            fee_obj = FeeType.objects.filter(pk=int(float(str(fee_pk)))).first()
                                        except Exception:
                                            fee_obj = FeeType.objects.filter(pk=fee_pk).first()
                                if not fee_obj and "fee_type_code" in eff:
                                    fee_code = _clean_cell(_row_value(r, "fee_type_code"))
                                    if fee_code:
                                        fee_obj = FeeType.objects.filter(code__iexact=str(fee_code)).first()
                                if not fee_obj:
                                    counts["skipped"] += 1; add_log(i, "skipped", "Fee type not found"); continue
                                remark = _clean_cell(_row_value(r, "remark")) if "remark" in eff else None

                                rec_ref = _clean_cell(_row_value(r, "rec_ref")) if "rec_ref" in eff else None
                                rec_no_raw = _clean_cell(_row_value(r, "rec_no")) if "rec_no" in eff else None
                                rec_no_value = None
                                if rec_no_raw not in (None, ""):
                                    try:
                                        rec_no_value = int(str(rec_no_raw).strip())
                                    except Exception:
                                        counts["skipped"] += 1; add_log(i, "skipped", "Invalid rec_no"); continue
                                full_from_column = CashRegister.normalize_receipt_no(_clean_cell(_row_value(r, "receipt_no_full"))) if "receipt_no_full" in eff else None
                                receipt_no_full = full_from_column
                                if not receipt_no_full and rec_ref and rec_no_value is not None:
                                    receipt_no_full = CashRegister.merge_reference_and_number(rec_ref, f"{rec_no_value:06d}")
                                if receipt_no_full and (not rec_ref or rec_no_value is None):
                                    ref_guess, num_guess = CashRegister.split_receipt(receipt_no_full)
                                    if not rec_ref:
                                        rec_ref = ref_guess
                                    if rec_no_value is None and num_guess is not None:
                                        rec_no_value = num_guess

                                obj = None
                                if receipt_no_full:
                                    obj = CashRegister.objects.filter(receipt_no_full=receipt_no_full).first()
                                if not obj and rec_ref and rec_no_value is not None:
                                    obj = CashRegister.objects.filter(rec_ref=rec_ref, rec_no=rec_no_value).first()

                                try:
                                    if obj:
                                        obj.date = entry_date
                                        obj.payment_mode = payment_mode
                                        obj.fee_type = fee_obj
                                        obj.amount = amount_val
                                        if remark is not None:
                                            obj.remark = remark
                                        if rec_ref:
                                            obj.rec_ref = rec_ref
                                        if rec_no_value is not None:
                                            obj.rec_no = rec_no_value
                                        if receipt_no_full:
                                            obj.receipt_no_full = receipt_no_full
                                        obj.save()
                                        created = False
                                    else:
                                        if rec_ref is None or rec_no_value is None:
                                            with transaction.atomic():
                                                auto_vals = ReceiptNumberService.next_numbers(payment_mode, entry_date, lock=True)
                                            rec_ref = rec_ref or auto_vals["rec_ref"]
                                            rec_no_value = rec_no_value if rec_no_value is not None else auto_vals["rec_no"]
                                            receipt_no_full = receipt_no_full or auto_vals["receipt_no_full"]
                                        if not receipt_no_full and rec_ref and rec_no_value is not None:
                                            receipt_no_full = CashRegister.merge_reference_and_number(rec_ref, f"{rec_no_value:06d}")
                                        if not receipt_no_full:
                                            counts["skipped"] += 1; add_log(i, "skipped", "Unable to resolve receipt number"); continue
                                        obj = CashRegister.objects.create(
                                            rec_ref=rec_ref or "",
                                            rec_no=rec_no_value,
                                            receipt_no_full=receipt_no_full,
                                            date=entry_date,
                                            payment_mode=payment_mode,
                                            fee_type=fee_obj,
                                            amount=amount_val,
                                            remark=remark or "",
                                            created_by=request.user,
                                        )
                                        created = True
                                except Exception as row_err:
                                    counts["skipped"] += 1; add_log(i, "skipped", f"Row error: {row_err}"); continue
                                ref = obj.receipt_no_full
                                if created:
                                    counts["created"] += 1; add_log(i, "created", "Created", ref)
                                else:
                                    counts["updated"] += 1; add_log(i, "updated", "Updated", ref)
                        elif issubclass(self.model, MigrationRecord) and sheet_norm == "migration":
                            auto_create = bool(str(request.POST.get('auto_create_docrec', '')).strip())
                            for i, (_, r) in enumerate(df.iterrows(), start=2):
                                doc_rec_id_raw = _clean_cell(r.get("doc_rec_id"))
                                dr = resolve_docrec(doc_rec_id_raw)
                                if not dr:
                                    if auto_create:
                                        doc_date = parse_excel_date(r.get("doc_rec_date")) if "doc_rec_date" in eff else None
                                        try:
                                            dr = DocRec.objects.create(
                                                doc_rec_date=doc_date,
                                                apply_for='MG',
                                                created_by=request.user,
                                            )
                                            add_log(i, "created", "Auto-created DocRec", dr.doc_rec_id)
                                        except Exception as e:
                                            counts["skipped"] += 1; add_log(i, "skipped", f"Failed create docrec: {e}"); continue
                                    else:
                                        counts["skipped"] += 1; add_log(i, "skipped", "doc_rec_id not found"); continue
                                # Parse enrollment and supporting relationships using cleaned cells
                                enr_key = _clean_cell(r.get("enrollment_no")) if "enrollment_no" in eff else None
                                enr = Enrollment.objects.filter(enrollment_no__iexact=str(enr_key).strip()).first() if enr_key else None
                                inst_key = _clean_cell(r.get("institute_id")) if "institute_id" in eff else None
                                main_key = _clean_cell(r.get("maincourse_id")) if "maincourse_id" in eff else None
                                sub_key = _clean_cell(r.get("subcourse_id")) if "subcourse_id" in eff else None
                                inst = Institute.objects.filter(institute_id=inst_key).first() if inst_key else None
                                main = MainBranch.objects.filter(maincourse_id=main_key).first() if main_key else None
                                sub = SubBranch.objects.filter(subcourse_id=sub_key).first() if sub_key else None
                                if enr:
                                    # Try to auto-fill fk relations from enrollment if not provided explicitly
                                    try:
                                        if not inst and getattr(enr, 'institute', None):
                                            inst = enr.institute
                                    except Exception:
                                        pass
                                    try:
                                        if not main and getattr(enr, 'maincourse', None):
                                            main = enr.maincourse
                                    except Exception:
                                        pass
                                    try:
                                        if not sub and getattr(enr, 'subcourse', None):
                                            sub = enr.subcourse
                                    except Exception:
                                        pass

                                # Normalize mg_status and mg_date
                                mg_status_raw = _clean_cell(r.get("mg_status")) or ''
                                mg_status = str(mg_status_raw).strip().upper()
                                mg_date = parse_excel_date(r.get("mg_date")) if "mg_date" in eff and _clean_cell(r.get("mg_date")) is not None else None
                                # If mg_status is blank for non-cancel records, default to ISSUED
                                if mg_status == '':
                                    mg_status = 'ISSUED'
                                    mg_status_raw = 'ISSUED'

                                # If status is CANCEL (case-insensitive) then only minimal fields are required
                                is_cancel = mg_status == 'CANCEL'
                                # Validate presence of mg_number always
                                mn = _clean_cell(r.get("mg_number"))
                                if not mn:
                                    counts["skipped"] += 1; add_log(i, "skipped", "Missing mg_number"); continue
                                # For non-cancel records: require enrollment_no / student_name only if the
                                # corresponding columns were selected by the user (in `eff`). If the user did
                                # not include these FK columns (they are expected to exist in Enrollment table),
                                # don't fail the row just because the sheet omitted them.
                                if not is_cancel:
                                    # enrollment_no required only if provided in the column selection
                                    if "enrollment_no" in eff:
                                        enr_key_present = bool(_clean_cell(r.get("enrollment_no")))
                                        if not enr_key_present:
                                            counts["skipped"] += 1; add_log(i, "skipped", "Missing enrollment_no for non-cancel record"); continue
                                    # student_name required only if provided in the column selection
                                    if "student_name" in eff:
                                        student_name_present = bool(_clean_cell(r.get("student_name")))
                                        if not student_name_present:
                                            counts["skipped"] += 1; add_log(i, "skipped", "Missing student_name for non-cancel record"); continue
                                # mg_date is required only if the column is selected
                                if not is_cancel and "mg_date" in eff and not mg_date:
                                    counts["skipped"] += 1; add_log(i, "skipped", "Missing mg_date"); continue

                                # Prevent duplicate MigrationRecord for same enrollment (if enrollment provided and not cancel)
                                if enr and not is_cancel:
                                    existing_for_enr = MigrationRecord.objects.filter(enrollment=enr).first()
                                    if existing_for_enr:
                                        counts["skipped"] += 1; add_log(i, "skipped", f"Migration already exists for enrollment {enr.enrollment_no}"); continue

                                # store doc_rec as doc_rec_id string
                                obj, created = MigrationRecord.objects.get_or_create(doc_rec=(dr.doc_rec_id if dr else None), defaults={})
                                # Populate fields (keep tolerant): for CANCEL store only minimal fields
                                if "enrollment_no" in eff and enr:
                                    obj.enrollment = enr
                                if not is_cancel:
                                    # student_name may be absent in sheet; fall back to enrollment or existing value
                                    if "student_name" in eff:
                                        obj.student_name = (_clean_cell(r.get("student_name")) or (enr.student_name if enr else getattr(obj, 'student_name', '')))
                                else:
                                    # For CANCEL rows ensure student_name is at least empty string so
                                    # model.full_clean() (which runs on save) does not reject the row.
                                    try:
                                        if not getattr(obj, 'student_name', None):
                                            obj.student_name = ''
                                    except Exception:
                                        obj.student_name = ''
                                    if inst: obj.institute = inst
                                    if main: obj.maincourse = main
                                    if sub: obj.subcourse = sub
                                    if "exam_year" in eff:
                                        obj.exam_year = _clean_cell(r.get("exam_year"))
                                    if "admission_year" in eff:
                                        obj.admission_year = _clean_cell(r.get("admission_year"))
                                    if "exam_details" in eff:
                                        obj.exam_details = _clean_cell(r.get("exam_details"))
                                    if mg_date: obj.mg_date = mg_date
                                # Always store mg_number and mg_status if provided
                                # mg_number already validated; ensure it's saved
                                obj.mg_number = str(mn).strip()
                                if "mg_status" in eff and mg_status_raw not in (None, ''):
                                    obj.mg_status = mg_status_raw or getattr(obj, 'mg_status', None)
                                if "pay_rec_no" in eff:
                                    obj.pay_rec_no = _clean_cell(r.get("pay_rec_no")) or (dr.pay_rec_no if dr else getattr(obj, 'pay_rec_no', None))

                                # If doc_rec_remark present in sheet, sync it to DocRec
                                if "doc_rec_remark" in eff:
                                    remark_val = r.get("doc_rec_remark")
                                    if remark_val is not None:
                                        try:
                                            dr.doc_rec_remark = remark_val
                                            dr.save(update_fields=['doc_rec_remark'])
                                        except Exception:
                                            pass

                                # Ensure FK fields are valid model instances / PKs (defensive against NaN from Excel)
                                try:
                                    # helper: coerce invalid FK PKs (nan, 'nan', <NA>) to None
                                    for fk in ('institute', 'maincourse', 'subcourse'):
                                        pk_attr = fk + '_id'
                                        try:
                                            val = getattr(obj, pk_attr, None)
                                        except Exception:
                                            val = None
                                        if val is None:
                                            setattr(obj, fk, None)
                                        else:
                                            try:
                                                # allow numeric or numeric-string PKs
                                                int(val)
                                            except Exception:
                                                setattr(obj, fk, None)
                                except Exception:
                                    # if anything goes wrong, clear the FK fields to avoid type errors
                                    try:
                                        obj.institute = None
                                    except Exception:
                                        pass
                                    try:
                                        obj.maincourse = None
                                    except Exception:
                                        pass
                                    try:
                                        obj.subcourse = None
                                    except Exception:
                                        pass
                                if not obj.created_by: _assign_user_field(obj, request.user, 'created_by')
                                obj.save()
                                if created: counts["created"] += 1; add_log(i, "created", "Created", dr.doc_rec_id)
                                else: counts["updated"] += 1; add_log(i, "updated", "Updated", dr.doc_rec_id)
                        elif issubclass(self.model, ProvisionalRecord) and sheet_norm == "provisional":
                            auto_create = bool(str(request.POST.get('auto_create_docrec', '')).strip())
                            for i, (_, r) in enumerate(df.iterrows(), start=2):
                                dr = resolve_docrec(str(r.get("doc_rec_id")))
                                if not dr:
                                    if auto_create:
                                        doc_date = parse_excel_date(r.get("doc_rec_date")) if "doc_rec_date" in eff else None
                                        try:
                                            dr = DocRec.objects.create(
                                                doc_rec_date=doc_date,
                                                apply_for='PR',
                                                created_by=request.user,
                                            )
                                            add_log(i, "created", "Auto-created DocRec", dr.doc_rec_id)
                                        except Exception as e:
                                            counts["skipped"] += 1; add_log(i, "skipped", f"Failed create docrec: {e}"); continue
                                    else:
                                        counts["skipped"] += 1; add_log(i, "skipped", "doc_rec_id not found"); continue
                                enr = Enrollment.objects.filter(enrollment_no__iexact=str(r.get("enrollment_no")).strip()).first() if "enrollment_no" in eff and str(r.get("enrollment_no") or '').strip() else None
                                inst_key = _clean_cell(r.get("institute_id")) if "institute_id" in eff else None
                                main_key = _clean_cell(r.get("maincourse_id")) if "maincourse_id" in eff else None
                                sub_key = _clean_cell(r.get("subcourse_id")) if "subcourse_id" in eff else None
                                inst = Institute.objects.filter(institute_id=inst_key).first() if inst_key else None
                                main = MainBranch.objects.filter(maincourse_id=main_key).first() if main_key else None
                                sub = SubBranch.objects.filter(subcourse_id=sub_key).first() if sub_key else None
                                prv_date = parse_excel_date(r.get("prv_date")) if "prv_date" in eff else None
                                if "prv_date" in eff and not prv_date:  # required non-null
                                    counts["skipped"] += 1; add_log(i, "skipped", "Missing prv_date"); continue
                                # store doc_rec as the doc_rec_id string (DB stores varchar)
                                obj, created = ProvisionalRecord.objects.get_or_create(doc_rec=(dr.doc_rec_id if dr else None), defaults={})
                                if "enrollment_no" in eff: obj.enrollment = enr
                                if "student_name" in eff: obj.student_name = r.get("student_name") or (enr.student_name if enr else getattr(obj, 'student_name', ''))
                                if "institute_id" in eff: obj.institute = inst
                                if "maincourse_id" in eff: obj.maincourse = main
                                if "subcourse_id" in eff: obj.subcourse = sub
                                if "prv_number" in eff: obj.prv_number = str(r.get("prv_number") or "").strip()
                                if "prv_date" in eff and prv_date: obj.prv_date = prv_date
                                if "class_obtain" in eff: obj.class_obtain = r.get("class_obtain")
                                if "passing_year" in eff: obj.passing_year = r.get("passing_year")
                                # Normalize prv_status: treat blank as ISSUED, map CANCEL synonyms
                                prv_status_raw = _clean_cell(r.get("prv_status")) or ''
                                try:
                                    prv_status_norm = str(prv_status_raw).strip().upper()
                                except Exception:
                                    prv_status_norm = ''
                                if prv_status_norm == '':
                                    prv_status_norm = 'ISSUED'
                                    prv_status_raw = 'ISSUED'
                                if prv_status_norm.startswith('CANCEL') or prv_status_norm in ('CANCELED','CANCELLED'):
                                    # Ensure minimal required fields for CANCEL; set student_name to empty if not provided
                                    try:
                                        if not getattr(obj, 'student_name', None):
                                            obj.student_name = ''
                                    except Exception:
                                        obj.student_name = ''
                                    obj.prv_status = ProvisionalStatus.CANCELLED
                                else:
                                    if "prv_status" in eff:
                                        obj.prv_status = (prv_status_raw or getattr(obj, 'prv_status', None))
                                if "pay_rec_no" in eff: obj.pay_rec_no = r.get("pay_rec_no") or (dr.pay_rec_no if dr else getattr(obj, 'pay_rec_no', ''))
                                # Defensive FK coercion similar to migration block
                                try:
                                    for fk in ('institute', 'maincourse', 'subcourse'):
                                        pk_attr = fk + '_id'
                                        try:
                                            val = getattr(obj, pk_attr, None)
                                        except Exception:
                                            val = None
                                        if val is None:
                                            setattr(obj, fk, None)
                                        else:
                                            try:
                                                int(val)
                                            except Exception:
                                                setattr(obj, fk, None)
                                except Exception:
                                    try:
                                        obj.institute = None
                                    except Exception:
                                        pass
                                    try:
                                        obj.maincourse = None
                                    except Exception:
                                        pass
                                    try:
                                        obj.subcourse = None
                                    except Exception:
                                        pass
                                if not obj.created_by: _assign_user_field(obj, request.user, 'created_by')
                                obj.save()
                                if created: counts["created"] += 1; add_log(i, "created", "Created", dr.doc_rec_id)
                                else: counts["updated"] += 1; add_log(i, "updated", "Updated", dr.doc_rec_id)
                        elif issubclass(self.model, Verification) and sheet_norm == "verification":
                            auto_create = bool(str(request.POST.get('auto_create_docrec', '')).strip())
                            for i, (_, r) in enumerate(df.iterrows(), start=2):
                                dr = resolve_docrec(str(r.get("doc_rec_id")))
                                if not dr:
                                    if auto_create:
                                        doc_date = parse_excel_date(r.get("doc_rec_date")) if "doc_rec_date" in eff else None
                                        try:
                                            dr = DocRec.objects.create(
                                                doc_rec_date=doc_date,
                                                apply_for='VR',
                                                created_by=request.user,
                                            )
                                            add_log(i, "created", "Auto-created DocRec", dr.doc_rec_id)
                                        except Exception as e:
                                            counts["skipped"] += 1; add_log(i, "skipped", f"Failed create docrec: {e}"); continue
                                    else:
                                        counts["skipped"] += 1; add_log(i, "skipped", "doc_rec_id not found"); continue
                                enr = Enrollment.objects.filter(enrollment_no__iexact=str(r.get("enrollment_no")).strip()).first() if "enrollment_no" in eff else None
                                senr = Enrollment.objects.filter(enrollment_no__iexact=str(r.get("second_enrollment_no")).strip()).first() if "second_enrollment_no" in eff and str(r.get("second_enrollment_no") or '').strip() else None
                                date_v = parse_excel_date(r.get("date")) if "date" in eff else None
                                obj, created = Verification.objects.get_or_create(doc_rec=dr, defaults={})
                                if "date" in eff and date_v: obj.date = date_v
                                if "enrollment_no" in eff: obj.enrollment = enr
                                if "second_enrollment_no" in eff: obj.second_enrollment = senr
                                if "student_name" in eff: obj.student_name = r.get("student_name") or (enr.student_name if enr else getattr(obj, 'student_name', ''))
                                if "no_of_transcript" in eff: obj.tr_count = int(r.get("no_of_transcript") or 0)
                                if "no_of_marksheet" in eff: obj.ms_count = int(r.get("no_of_marksheet") or 0)
                                if "no_of_degree" in eff: obj.dg_count = int(r.get("no_of_degree") or 0)
                                if "no_of_moi" in eff: obj.moi_count = int(r.get("no_of_moi") or 0)
                                if "no_of_backlog" in eff: obj.backlog_count = int(r.get("no_of_backlog") or 0)
                                if "status" in eff:
                                    raw_status = _clean_cell(r.get("status")) or ''
                                    mapped = _normalize_choice(raw_status, Verification._meta.get_field('status').choices)
                                    if mapped:
                                        obj.status = mapped
                                    else:
                                        # fallback: try uppercase of raw value (common mapping)
                                        try:
                                            obj.status = str(raw_status).upper() or getattr(obj, 'status', None)
                                        except Exception:
                                            obj.status = getattr(obj, 'status', None)
                                if "final_no" in eff: obj.final_no = (str(r.get("final_no")).strip() or obj.final_no)
                                if "pay_rec_no" in eff: obj.pay_rec_no = r.get("pay_rec_no") or (dr.pay_rec_no if dr else getattr(obj, 'pay_rec_no', ''))
                                # vr_done_date
                                if "vr_done_date" in eff:
                                    vr_done = parse_excel_date(r.get("vr_done_date"))
                                    if vr_done:
                                        obj.vr_done_date = vr_done
                                # mail_status mapping
                                if "mail_status" in eff:
                                    obj.mail_status = r.get("mail_status") or getattr(obj, 'mail_status', None)
                                # if doc_rec_remark provided, sync to DocRec
                                if "doc_rec_remark" in eff:
                                    remark_val = r.get("doc_rec_remark")
                                    if remark_val is not None and dr:
                                        dr.doc_rec_remark = remark_val
                                        dr.save(update_fields=['doc_rec_remark'])
                                # ECA handling: populate Verification's own eca_* fields (denormalized single-row mode)
                                try:
                                    # If the import explicitly marks ECA required, set the flag on the object
                                    if "eca_required" in eff and str(r.get("eca_required") or '').strip().lower() in ('1','true','yes','y'):
                                        obj.eca_required = True
                                    # Populate any provided denormalized ECA fields
                                    if 'eca_name' in eff:
                                        obj.eca_name = r.get('eca_name') or None
                                    if 'eca_ref_no' in eff:
                                        obj.eca_ref_no = r.get('eca_ref_no') or None
                                    # support both column names 'eca_submit_date' and 'eca_send_date' / 'eca_submit_date'
                                    if 'eca_submit_date' in eff or 'eca_send_date' in eff:
                                        eca_send = parse_excel_date(r.get('eca_submit_date') or r.get('eca_send_date'))
                                        if eca_send:
                                            obj.eca_send_date = eca_send
                                    if 'eca_resubmit_date' in eff:
                                        eca_resub = parse_excel_date(r.get('eca_resubmit_date'))
                                        if eca_resub:
                                            obj.eca_resubmit_date = eca_resub
                                    if 'eca_status' in eff:
                                        raw = _clean_cell(r.get('eca_status'))
                                        if raw:
                                            mapped_eca = _normalize_choice(raw, Verification._meta.get_field('eca_status').choices)
                                            if mapped_eca:
                                                obj.eca_status = mapped_eca
                                            else:
                                                try:
                                                    obj.eca_status = str(raw).upper()
                                                except Exception:
                                                    pass
                                    if 'eca_remark' in eff:
                                        # store as part of eca_history or remark field — we'll store the text in eca_history as a single entry
                                        try:
                                            hist = list(getattr(obj, 'eca_history', []) or [])
                                            hist.append({'imported_remark': _sanitize(r.get('eca_remark'))})
                                            obj.eca_history = hist
                                        except Exception:
                                            obj.eca_history = [{'imported_remark': _sanitize(r.get('eca_remark'))}]
                                except Exception:
                                    # keep import tolerant; skip ECA details on error
                                    pass
                                _assign_user_field(obj, request.user, 'updatedby')
                                obj.save()
                                if created: counts["created"] += 1; add_log(i, "created", "Created", dr.doc_rec_id)
                                else: counts["updated"] += 1; add_log(i, "updated", "Updated", dr.doc_rec_id)
                        elif issubclass(self.model, StudentProfile) and sheet_norm == "studentprofile":
                            for i, (_, r) in enumerate(df.iterrows(), start=2):
                                en_no = str(r.get("enrollment_no", "")).strip()
                                if not en_no:
                                    counts["skipped"] += 1; add_log(i, "skipped", "Missing enrollment_no"); continue
                                enrollment = Enrollment.objects.filter(enrollment_no__iexact=en_no).first()
                                if not enrollment:
                                    counts["skipped"] += 1; add_log(i, "skipped", f"Enrollment {en_no} not found"); continue
                                birth_date = parse_excel_date(r.get("birth_date")) if "birth_date" in eff else None
                                fees_val = None
                                if "fees" in eff:
                                    try:
                                        raw_fees = r.get("fees")
                                        if raw_fees not in (None, ""):
                                            fees_val = float(raw_fees)
                                    except Exception:
                                        fees_val = None
                                def _to_bool(v):
                                    s = str(v).strip().lower(); return s in ("1", "true", "yes", "y", "t")
                                obj, created = StudentProfile.objects.update_or_create(
                                    enrollment=enrollment,
                                    defaults={
                                        **({"gender": r.get("gender") or None} if "gender" in eff else {}),
                                        **({"birth_date": birth_date} if birth_date and "birth_date" in eff else {}),
                                        **({"address1": r.get("address1") or None} if "address1" in eff else {}),
                                        **({"address2": r.get("address2") or None} if "address2" in eff else {}),
                                        **({"city1": r.get("city1") or None} if "city1" in eff else {}),
                                        **({"city2": r.get("city2") or None} if "city2" in eff else {}),
                                        **({"contact_no": r.get("contact_no") or None} if "contact_no" in eff else {}),
                                        **({"email": r.get("email") or None} if "email" in eff else {}),
                                        **({"fees": fees_val} if "fees" in eff else {}),
                                        **({"hostel_required": _to_bool(r.get("hostel_required"))} if "hostel_required" in eff else {}),
                                        **({"aadhar_no": r.get("aadhar_no") or None} if "aadhar_no" in eff else {}),
                                        **({"abc_id": r.get("abc_id") or None} if "abc_id" in eff else {}),
                                        **({"mobile_adhar": r.get("mobile_adhar") or None} if "mobile_adhar" in eff else {}),
                                        **({"name_adhar": r.get("name_adhar") or None} if "name_adhar" in eff else {}),
                                        **({"mother_name": r.get("mother_name") or None} if "mother_name" in eff else {}),
                                        **({"category": r.get("category") or None} if "category" in eff else {}),
                                        **({"photo_uploaded": _to_bool(r.get("photo_uploaded"))} if "photo_uploaded" in eff else {}),
                                        **({"is_d2d": _to_bool(r.get("is_d2d"))} if "is_d2d" in eff else {}),
                                        **({"program_medium": r.get("program_medium") or None} if "program_medium" in eff else {}),
                                        "updated_by": request.user,
                                    }
                                )
                                if created: counts["created"] += 1; add_log(i, "created", "Created", en_no)
                                else: counts["updated"] += 1; add_log(i, "updated", "Updated", en_no)
                        elif issubclass(self.model, StudentDegree) and sheet_norm in ("studentdegree", "degree"):
                            for i, (_, r) in enumerate(df.iterrows(), start=2):
                                en_no = str(r.get("enrollment_no", "")).strip()
                                if not en_no:
                                    counts["skipped"] += 1; add_log(i, "skipped", "Missing enrollment_no"); continue
                                
                                # Extract year from last_exam_year
                                last_exam_year = None
                                if "last_exam_year" in eff:
                                    try:
                                        year_val = r.get("last_exam_year")
                                        if year_val not in (None, ""):
                                            last_exam_year = int(year_val)
                                    except Exception:
                                        last_exam_year = None
                                
                                # Extract convocation_no
                                convocation_no = None
                                if "convocation_no" in eff:
                                    try:
                                        conv_val = r.get("convocation_no")
                                        if conv_val not in (None, ""):
                                            convocation_no = int(conv_val)
                                    except Exception:
                                        convocation_no = None
                                
                                # Check if dg_sr_no exists for update/create logic
                                dg_sr_no = str(r.get("dg_sr_no", "")).strip() or None
                                
                                if dg_sr_no:
                                    # Update or create based on dg_sr_no
                                    obj, created = StudentDegree.objects.update_or_create(
                                        dg_sr_no=dg_sr_no,
                                        defaults={
                                            "enrollment_no": en_no,
                                            **({"student_name_dg": r.get("student_name_dg") or None} if "student_name_dg" in eff else {}),
                                            **({"dg_address": r.get("dg_address") or None} if "dg_address" in eff else {}),
                                            **({"institute_name_dg": r.get("institute_name_dg") or None} if "institute_name_dg" in eff else {}),
                                            **({"degree_name": r.get("degree_name") or None} if "degree_name" in eff else {}),
                                            **({"specialisation": r.get("specialisation") or None} if "specialisation" in eff else {}),
                                            **({"seat_last_exam": r.get("seat_last_exam") or None} if "seat_last_exam" in eff else {}),
                                            **({"last_exam_month": r.get("last_exam_month") or None} if "last_exam_month" in eff else {}),
                                            **({"last_exam_year": last_exam_year} if "last_exam_year" in eff else {}),
                                            **({"class_obtain": r.get("class_obtain") or None} if "class_obtain" in eff else {}),
                                            **({"course_language": r.get("course_language") or None} if "course_language" in eff else {}),
                                            **({"dg_rec_no": r.get("dg_rec_no") or None} if "dg_rec_no" in eff else {}),
                                            **({"dg_gender": r.get("dg_gender") or None} if "dg_gender" in eff else {}),
                                            **({"convocation_no": convocation_no} if "convocation_no" in eff else {}),
                                        }
                                    )
                                else:
                                    # Create new record without dg_sr_no
                                    try:
                                        obj = StudentDegree.objects.create(
                                            enrollment_no=en_no,
                                            **({"dg_sr_no": None}),
                                            **({"student_name_dg": r.get("student_name_dg") or None} if "student_name_dg" in eff else {}),
                                            **({"dg_address": r.get("dg_address") or None} if "dg_address" in eff else {}),
                                            **({"institute_name_dg": r.get("institute_name_dg") or None} if "institute_name_dg" in eff else {}),
                                            **({"degree_name": r.get("degree_name") or None} if "degree_name" in eff else {}),
                                            **({"specialisation": r.get("specialisation") or None} if "specialisation" in eff else {}),
                                            **({"seat_last_exam": r.get("seat_last_exam") or None} if "seat_last_exam" in eff else {}),
                                            **({"last_exam_month": r.get("last_exam_month") or None} if "last_exam_month" in eff else {}),
                                            **({"last_exam_year": last_exam_year} if "last_exam_year" in eff else {}),
                                            **({"class_obtain": r.get("class_obtain") or None} if "class_obtain" in eff else {}),
                                            **({"course_language": r.get("course_language") or None} if "course_language" in eff else {}),
                                            **({"dg_rec_no": r.get("dg_rec_no") or None} if "dg_rec_no" in eff else {}),
                                            **({"dg_gender": r.get("dg_gender") or None} if "dg_gender" in eff else {}),
                                            **({"convocation_no": convocation_no} if "convocation_no" in eff else {}),
                                        )
                                        created = True
                                    except Exception as e:
                                        counts["skipped"] += 1; add_log(i, "skipped", f"Failed to create: {e}"); continue
                                
                                if created: counts["created"] += 1; add_log(i, "created", "Created", dg_sr_no or en_no)
                                else: counts["updated"] += 1; add_log(i, "updated", "Updated", dg_sr_no or en_no)
                        else:
                            return JsonResponse({"error": "Sheet name does not match expected for this model."}, status=400)
                    except Exception as e:
                        return JsonResponse({"error": f"Import error: {e}"}, status=500)
                    # Build an Excel log workbook (Summary + Errors) and return it as base64 so frontend can download
                    log_xlsx_b64 = None
                    log_name = None
                    # Collect skipped rows with original data and error message
                    failed_rows = []
                    try:
                        for entry in log:
                            if entry.get('status') and str(entry.get('status')).lower() == 'skipped':
                                try:
                                    row_no = int(entry.get('row') or 0)
                                except Exception:
                                    row_no = 0
                                # dataframe rows were enumerated starting at 2
                                idx = row_no - 2
                                if idx >= 0 and df is not None and idx < len(df.index):
                                    row_series = df.iloc[idx]
                                    # convert to plain python values
                                    row_data = {str(c): (row_series.get(c) if c in row_series.index else None) for c in df.columns}
                                else:
                                    row_data = {}
                                row_data['error'] = entry.get('message')
                                failed_rows.append(row_data)
                    except Exception:
                        failed_rows = []

                    # Summary sheet as single-row table
                    summary_df = None
                    error_df = None
                    if pd is not None:
                        try:
                            summary_df = pd.DataFrame([{'total': (len(df.index) if df is not None else 0), 'created': counts.get('created',0), 'updated': counts.get('updated',0), 'skipped': counts.get('skipped',0)}])
                            if failed_rows:
                                error_df = pd.DataFrame(failed_rows)
                            # write to excel
                            bio = BytesIO()
                            with pd.ExcelWriter(bio, engine='openpyxl') as writer:
                                summary_df.to_excel(writer, index=False, sheet_name='Summary')
                                if error_df is not None:
                                    # Attempt to preserve original column order
                                    error_df.to_excel(writer, index=False, sheet_name='Errors')
                            bio.seek(0)
                            log_xlsx_b64 = base64.b64encode(bio.read()).decode('utf-8')
                            log_name = f"import_log_{sheet_norm}_{datetime.now().strftime('%Y%m%d_%H%M%S')}.xlsx"
                        except Exception:
                            log_xlsx_b64 = None

                    if "excel_data" in request.session:
                        del request.session["excel_data"]
                    resp = {"success": True, "counts": counts, "log": log}
                    if log_xlsx_b64:
                        resp['log_xlsx'] = log_xlsx_b64
                        resp['log_name'] = log_name
                    return JsonResponse(resp)

                return JsonResponse({"error": "Unknown action"}, status=400)
            except Exception as e:
                return JsonResponse({"error": f"Unhandled error: {e}"}, status=500)
        elif request.method == "POST":
            # Non-AJAX POST (likely missing X-Requested-With header) -> clarify error instead of rendering HTML
            return JsonResponse({"error": "Invalid POST. Expected AJAX with X-Requested-With header."}, status=400)

        return render(request, self.upload_template, {
            "title": f"Upload Excel for {self.model._meta.verbose_name}",
            "download_url": reverse(f"admin:{self.model._meta.app_label}_{self.model._meta.model_name}_download_template"),
        })

# ---------------------------------------------------------------------------
# Common Admin Mixin (adds upload link)
# ---------------------------------------------------------------------------

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

# ---------------------------------------------------------------------------
# Registrations
# ---------------------------------------------------------------------------

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

@admin.register(InstVerificationMain)
class InstVerificationMainAdmin(admin.ModelAdmin):
    list_display = ("id", "doc_rec", "inst_veri_number", "inst_veri_date", "institute", "rec_inst_city", "doc_types", 'rec_inst_sfx_name', 'study_mode', 'iv_status')
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


@admin.register(CashRegister)
class CashRegisterAdmin(CommonAdminMixin):
    list_display = ("receipt_no_full", "rec_ref", "rec_no", "date", "payment_mode", "fee_type", "amount", "created_by", "created_at")
    search_fields = ("receipt_no_full", "rec_ref", "fee_type__code", "fee_type__name", "remark__icontains")
    list_filter = ("payment_mode", "fee_type", "date")
    readonly_fields = ("receipt_no_full", "rec_ref", "rec_no", "created_by", "created_at", "updated_at")
    autocomplete_fields = ("fee_type",)
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
        normalized_full = CashRegister.normalize_receipt_no(getattr(obj, "receipt_no_full", None))
        if normalized_full:
            obj.receipt_no_full = normalized_full
        super().save_model(request, obj, form, change)


# ---------------------------------------------------------------------------
# Re-register EmpProfile and LeaveEntry with upload support
# (use CommonAdminMixin which inherits ExcelUploadMixin to enable CSV/XLSX uploads)
# ---------------------------------------------------------------------------
try:
    admin.site.unregister(EmpProfile)
except Exception:
    # not registered or already unregistered
    pass


@admin.register(EmpProfile)
class EmpProfileUploadAdmin(CommonAdminMixin):
    # Preserve the existing admin configuration while adding upload support
    # Use display helpers so admin shows integers when balances are whole numbers
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
            # remove trailing zeros
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
    autocomplete_fields = ("institute", "subcourse", "maincourse")

@admin.register(InstVerificationStudent)
class InstVerificationStudentAdmin(admin.ModelAdmin):
    list_display = ("id", "doc_rec", "sr_no", "enrollment", "student_name", "institute", "verification_status")
    list_filter = ("verification_status", "institute")
    search_fields = ("doc_rec__doc_rec_id", "enrollment__enrollment_no", "student_name")
    autocomplete_fields = ("doc_rec", "enrollment", "institute", "sub_course", "main_course")

@admin.register(StudentProfile)
class StudentProfileAdmin(CommonAdminMixin):
    list_display = ("id", "enrollment", "gender", "birth_date", "city1", "city2", "contact_no", "abc_id", "photo_uploaded", "is_d2d", "updated_at")
    search_fields = ("enrollment__enrollment_no", "enrollment__student_name", "abc_id", "aadhar_no", "mobile_adhar", "name_adhar", "mother_name", "category")
    list_filter = ("gender", "city1", "city2", "photo_uploaded", "is_d2d", "category")
    readonly_fields = ("created_at", "updated_at")
    autocomplete_fields = ("enrollment",)

@admin.register(Verification)
class VerificationAdmin(CommonAdminMixin):
    # Desired column order:
    # Date, Enrollment, Sec Enrollment, Name, TR, MS, DG, MOI, Backlog, Status, Done Date, Final No, Mail, Sequence, Doc_Rec_Remark, ECA_Required, ECA_Name, ECA_Ref_No, ECA_Send_Date, ECA_Status, ECA_Resubmit_Date
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
    # doc_rec_remark is not a direct field on Verification (it comes from related DocRec).
    # We'll surface it in the edit form via get_form and sync on save.
    search_fields = ("doc_rec__doc_rec_id", "enrollment_no", "student_name", "final_no")
    # Use model-backed `doc_rec_date` (doc record date) instead of the old `date` field
    list_filter = ("status", "doc_rec_date")
    autocomplete_fields = ("doc_rec",)
    readonly_fields = ("createdat", "updatedat")

    def date_display(self, obj):
        # Prefer the doc_rec_date field (stores the document receive date)
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
        # Show Y/N based on mail_status
        return 'Y' if (obj.mail_status or '').upper() == 'SENT' else 'N'
    mail_flag.short_description = 'Mail'

    def eca_required_flag(self, obj):
        return 'Y' if obj.eca_required else 'N'
    eca_required_flag.short_description = 'ECA Req'

    def doc_rec_remark(self, obj):
        # Prefer verification-level remark if present, else fallback to related DocRec.remark
        val = None
        try:
            # verification may have its own remark field (vr_remark stored on Verification.remark)
            val = getattr(obj, 'doc_rec_remark', None)
        except Exception:
            val = None
        if not val and getattr(obj, 'doc_rec', None):
            try:
                val = getattr(obj.doc_rec, 'doc_rec_remark', None)
            except Exception:
                val = None
        # sanitize pandas NaN or string 'nan'
        if val is None:
            return ''
        s = str(val)
        if s.lower() == 'nan':
            return ''
        return s
    doc_rec_remark.short_description = 'Doc Rec Remark'

    def seq(self, obj):
        # row number in the current changelist page; Django admin doesn't provide index directly
        # we approximate by using the object's pk ordering offset (best-effort)
        return obj.pk
    seq.short_description = 'Sequence'

    def save_model(self, request, obj, form, change):  # type: ignore[override]
        # Keep parity with other create-by patterns
        if not change and not getattr(obj, 'updatedby', None):
            try:
                _assign_user_field(obj, request.user, 'updatedby')
            except Exception:
                pass
        # Save Verification first
        super().save_model(request, obj, form, change)
        # If doc_rec_remark was edited via the verification form, sync it to related DocRec
        try:
            new_remark = form.cleaned_data.get('doc_rec_remark')
        except Exception:
            new_remark = None
        if new_remark is not None and getattr(obj, 'doc_rec', None):
            try:
                # obj.doc_rec might be a DocRec instance or a raw doc_rec_id string
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
        # Extend the admin form to include a doc_rec_remark field sourced from related DocRec
        form = super().get_form(request, obj, **kwargs)
        from django import forms
        class WrappedForm(form):
            doc_rec_remark = forms.CharField(required=False, label='Doc Rec Remark')
            def __init__(self_inner, *a, **kw):
                super().__init__(*a, **kw)
                # Prepopulate from obj if editing
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


    def save_model(self, request, obj, form, change):  # type: ignore[override]
        # Keep parity with other create-by patterns
        if not change and not getattr(obj, 'updatedby', None):
            try:
                _assign_user_field(obj, request.user, 'updatedby')
            except Exception:
                pass
        super().save_model(request, obj, form, change)


# ============================================
# Degree Management Admin
# ============================================

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
        # Write header
        writer.writerow([
            'dg_sr_no', 'enrollment_no', 'student_name_dg', 'dg_address',
            'institute_name_dg', 'degree_name', 'specialisation', 'seat_last_exam',
            'last_exam_month', 'last_exam_year', 'class_obtain', 'course_language',
            'dg_rec_no', 'dg_gender', 'convocation_no'
        ])
        
        # Write data
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
