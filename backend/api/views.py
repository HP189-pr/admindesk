"""File: backend/api/views.py
Primary API view layer (TRANSITIONAL after beginning modular split).

Phase 2 Modularization Progress:
    - Auth / profile / navigation / user management moved to `views_auth.py`.
    - Remaining domains (courses, enrollment, documents, verification, bulk) still here.

This file now re-exports classes from extracted modules so existing imports and routing
continue to work. Subsequent steps will extract the remaining domains into dedicated
modules (e.g., `views_enrollment.py`, `views_verification.py`, etc.).
"""
from rest_framework import viewsets, status
from rest_framework.views import APIView
from rest_framework.decorators import action
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from django.utils import timezone
from django.db import models
from django.db.models import Value, Q
from django.db.models.functions import Lower, Replace
from django.http import HttpResponse
from rest_framework.parsers import MultiPartParser, FormParser
from io import BytesIO
import os, datetime, logging, uuid, threading
from django.conf import settings
from django.core.cache import cache

from .models import (
    User, DocRec, MigrationRecord, ProvisionalRecord, InstVerificationMain, InstVerificationStudent, Verification, Eca,
    StudentProfile, MigrationStatus, ProvisionalStatus, VerificationStatus, PayBy,
)
from .models import MailStatus
from .models import EmpProfile, LeaveType, LeaveEntry
# NOTE: Course / institute / enrollment related models moved to views_courses module for viewsets, but
# this file still references them in bulk upload & data analysis logic. Import them explicitly here.
from .models import Institute, MainBranch, SubBranch, Enrollment  # noqa: E402
from .serializers import (
    DocRecSerializer, VerificationSerializer, MigrationRecordSerializer, ProvisionalRecordSerializer,
    InstVerificationMainSerializer, InstVerificationStudentSerializer, EcaSerializer, StudentProfileSerializer
)

# Re-export extracted auth/navigation/user classes for backward compatibility
from .views_auth import (
    HolidayViewSet, LoginView, ChangePasswordView, UserProfileView, ProfilePictureView,
    VerifyPasswordView, VerifyAdminPanelPasswordView, CustomTokenObtainPairView, CheckAdminAccessView,
    MyNavigationView, UserAPIView, UserDetailAPIView
)
from .views_courses import (
    ModuleViewSet, MenuViewSet, UserPermissionViewSet, MainBranchViewSet, SubBranchViewSet,
    InstituteViewSet, InstituteCourseOfferingViewSet, EnrollmentViewSet
)


# ---------- DocRec / Verification / Migration / Provisional / InstVerification Main ----------

class DocRecViewSet(viewsets.ModelViewSet):
    queryset = DocRec.objects.all().order_by('-id')
    serializer_class = DocRecSerializer
    permission_classes = [IsAuthenticated]

    @action(detail=False, methods=["get"], url_path="next-id")
    def next_id(self, request):
        """Return the next doc_rec_id that would be assigned for a given apply_for.
        Example: /api/docrec/next-id/?apply_for=VR
        """
        apply_for = (request.query_params.get('apply_for') or '').strip().upper()
        if not apply_for:
            return Response({"detail": "apply_for is required"}, status=400)
        try:
            tmp = DocRec(apply_for=apply_for, pay_by=PayBy.NA)
            # simulate generation logic using private helpers
            now = timezone.now()
            yy = now.year % 100
            prefix = tmp._prefix_for_apply()
            year_str = f"{yy:02d}"
            base = f"{prefix}_{year_str}_"
            last = (
                DocRec.objects
                .filter(doc_rec_id__startswith=base)
                .order_by("-doc_rec_id")
                .first()
            )
            next_num = 1
            if last and last.doc_rec_id:
                try:
                    next_num = int(last.doc_rec_id.split("_")[-1]) + 1
                except Exception:
                    next_num = 1
            return Response({"next_id": f"{base}{next_num:04d}"})
        except Exception as e:
            return Response({"detail": str(e)}, status=500)


class VerificationViewSet(viewsets.ModelViewSet):
    queryset = Verification.objects.select_related('enrollment', 'second_enrollment').order_by('-id')
    serializer_class = VerificationSerializer
    permission_classes = [IsAuthenticated]

    def get_queryset(self):
        qs = super().get_queryset()
        search = self.request.query_params.get('search', '').strip()
        if search:
            norm_q = ''.join(search.split()).lower()
            qs = qs.annotate(
                n_en=Replace(Lower(models.F('enrollment__enrollment_no')), Value(' '), Value('')),
                n_name=Replace(Lower(models.F('student_name')), Value(' '), Value('')),
                n_final=Replace(Lower(models.F('final_no')), Value(' '), Value('')),
            ).filter(
                Q(n_en__contains=norm_q) | Q(n_name__contains=norm_q) | Q(n_final__contains=norm_q)
            )
        return qs


class MigrationRecordViewSet(viewsets.ModelViewSet):
    queryset = MigrationRecord.objects.select_related('doc_rec', 'enrollment', 'institute').order_by('-id')
    serializer_class = MigrationRecordSerializer
    permission_classes = [IsAuthenticated]

    def get_queryset(self):
        qs = super().get_queryset()
        search = self.request.query_params.get('search', '').strip()
        if search:
            norm_q = ''.join(search.split()).lower()
            qs = qs.annotate(
                n_en=Replace(Lower(models.F('enrollment__enrollment_no')), Value(' '), Value('')),
                n_name=Replace(Lower(models.F('student_name')), Value(' '), Value('')),
                n_mg=Replace(Lower(models.F('mg_number')), Value(' '), Value('')),
            ).filter(Q(n_en__contains=norm_q) | Q(n_name__contains=norm_q) | Q(n_mg__contains=norm_q))
        return qs


class ProvisionalRecordViewSet(viewsets.ModelViewSet):
    queryset = ProvisionalRecord.objects.select_related('doc_rec', 'enrollment', 'institute').order_by('-id')
    serializer_class = ProvisionalRecordSerializer
    permission_classes = [IsAuthenticated]

    def get_queryset(self):
        qs = super().get_queryset()
        search = self.request.query_params.get('search', '').strip()
        if search:
            norm_q = ''.join(search.split()).lower()
            qs = qs.annotate(
                n_en=Replace(Lower(models.F('enrollment__enrollment_no')), Value(' '), Value('')),
                n_name=Replace(Lower(models.F('student_name')), Value(' '), Value('')),
                n_prv=Replace(Lower(models.F('prv_number')), Value(' '), Value('')),
            ).filter(Q(n_en__contains=norm_q) | Q(n_name__contains=norm_q) | Q(n_prv__contains=norm_q))
        return qs


class InstVerificationMainViewSet(viewsets.ModelViewSet):
    queryset = InstVerificationMain.objects.select_related('doc_rec', 'institute').order_by('-id')
    serializer_class = InstVerificationMainSerializer
    permission_classes = [IsAuthenticated]

    def get_queryset(self):
        qs = super().get_queryset()
        search = self.request.query_params.get('search', '').strip()
        if search:
            norm_q = ''.join(search.split()).lower()
            qs = qs.annotate(
                n_instno=Replace(Lower(models.F('inst_veri_number')), Value(' '), Value('')),
                n_recname=Replace(Lower(models.F('rec_inst_name')), Value(' '), Value('')),
                n_ref=Replace(Lower(models.F('inst_ref_no')), Value(' '), Value('')),
            ).filter(Q(n_instno__contains=norm_q) | Q(n_recname__contains=norm_q) | Q(n_ref__contains=norm_q))
        return qs

    @action(detail=False, methods=["get"], url_path="search-rec-inst")
    def search_rec_inst(self, request):
        """Autocomplete for rec_inst_name by prefix (min 3 chars)."""
        q = request.query_params.get('q', '').strip()
        if len(q) < 3:
            return Response([], status=200)
        qs = self.queryset.filter(rec_inst_name__icontains=q)[:20]
        return Response([{ 'id': x.id, 'name': x.rec_inst_name } for x in qs], status=200)

    def perform_create(self, serializer):
        serializer.save()

    def perform_update(self, serializer):
        serializer.save()


class EcaViewSet(viewsets.ModelViewSet):
    queryset = Eca.objects.select_related('doc_rec').order_by('-id')
    serializer_class = EcaSerializer
    permission_classes = [IsAuthenticated]


class InstVerificationStudentViewSet(viewsets.ModelViewSet):
    queryset = InstVerificationStudent.objects.select_related('doc_rec', 'enrollment', 'institute', 'sub_course', 'main_course').order_by('-id')
    serializer_class = InstVerificationStudentSerializer
    permission_classes = [IsAuthenticated]


# -------- Bulk Upload & Data Analysis --------
class BulkService(str):
    ENROLLMENT = 'ENROLLMENT'
    DOCREC = 'DOCREC'
    MIGRATION = 'MIGRATION'
    PROVISIONAL = 'PROVISIONAL'
    VERIFICATION = 'VERIFICATION'
    INSTITUTE = 'INSTITUTE'
    DEGREE = 'DEGREE'  # not implemented
    # Added services
    EMP_PROFILE = 'EMP_PROFILE'
    LEAVE = 'LEAVE'


def _parse_excel_date_safe(val):
    # Reuse robust parser similar to admin
    try:
        import pandas as pd
    except Exception:
        pd = None
    if val is None:
        return None
    # Handle pandas NaT safely
    if str(val) in ("NaT", "nat", "<NA>"):
        return None
    if isinstance(val, datetime.date) and not isinstance(val, datetime.datetime):
        return val
    if isinstance(val, datetime.datetime):
        return (val.replace(tzinfo=None) if val.tzinfo else val).date()
    if pd is not None:
        try:
            if pd.isna(val):  # covers NaTType
                return None
            if isinstance(val, pd.Timestamp):
                try:
                    py_dt = val.to_pydatetime()
                    if getattr(py_dt, 'tzinfo', None) is not None:
                        py_dt = py_dt.replace(tzinfo=None)
                    return py_dt.date()
                except Exception:
                    return None
            parsed = pd.to_datetime(val, errors='coerce', dayfirst=True)
            if pd.isna(parsed):
                return None
            py_dt = parsed.to_pydatetime()
            if getattr(py_dt, 'tzinfo', None) is not None:
                py_dt = py_dt.replace(tzinfo=None)
            return py_dt.date()
        except Exception:
            pass
    for fmt in ("%d-%m-%Y", "%Y-%m-%d", "%d/%m/%Y", "%m/%d/%Y"):
        try:
            return datetime.datetime.strptime(str(val), fmt).date()
        except Exception:
            continue
    return None


from rest_framework.authentication import SessionAuthentication, BasicAuthentication
from rest_framework_simplejwt.authentication import JWTAuthentication


class _CsrfExemptSessionAuthentication(SessionAuthentication):
    def enforce_csrf(self, request):  # pragma: no cover (behavioral override)
        return  # Disable CSRF for token-based clients


class BulkUploadView(APIView):
    """Handle bulk Excel/CSV upload with preview and confirm actions.

    Improvements:
      - Supports .xlsx/.xls and .csv (auto-detect by extension)
      - Enforces max file size (default 5MB)
      - Returns only JSON (never HTML) for errors to avoid frontend JSON parse failures
      - CSRF exempt for session path while still allowing JWT auth
    """
    permission_classes = [IsAuthenticated]
    authentication_classes = [JWTAuthentication, _CsrfExemptSessionAuthentication, BasicAuthentication]
    parser_classes = [MultiPartParser, FormParser]
    MAX_UPLOAD_BYTES = 20 * 1024 * 1024  # 20MB

    def get(self, request):
        """Dual GET behaviors:
        1) If 'upload_id' is provided -> return JSON progress for async bulk job.
        2) Else -> return Excel template (existing behavior).
        """
        upload_id = request.query_params.get('upload_id')
        if upload_id:  # progress polling
            data = cache.get(f"bulk:{upload_id}")
            if not data:
                return Response({"error": True, "detail": "upload_id not found or expired"}, status=404)
            # Ensure absolute log_url if present & relative
            if data.get('log_url') and not str(data['log_url']).startswith('http'):
                try:
                    data['log_url'] = request.build_absolute_uri(data['log_url'])
                except Exception:
                    pass
            return Response({"error": False, "upload_id": upload_id, **data})

        # Template generation path
        service = request.query_params.get('service', '').upper().strip()
        custom_sheet = (request.query_params.get('sheet_name') or '').strip() or None
        try:
            import pandas as pd
        except Exception:
            return Response({"detail": "pandas is required on server for Excel operations."}, status=500)

        columns_map = {
            BulkService.DOCREC: [
                "apply_for","doc_rec_id","pay_by","pay_rec_no_pre","pay_rec_no","pay_amount","doc_rec_date"
            ],
            BulkService.INSTITUTE: [
                "institute_id","institute_code","institute_name","institute_campus","institute_address","institute_city"
            ],
            BulkService.ENROLLMENT: [
                "student_name","institute_id","batch","enrollment_date","subcourse_id","maincourse_id","enrollment_no","temp_enroll_no","admission_date"
            ],
            BulkService.MIGRATION: [
                "doc_rec_id","enrollment_no","student_name","institute_id","maincourse_id","subcourse_id","mg_number","mg_date","exam_year","admission_year","exam_details","mg_status","pay_rec_no"
            ],
            BulkService.PROVISIONAL: [
                "doc_rec_id","enrollment_no","student_name","institute_id","maincourse_id","subcourse_id","prv_number","prv_date","class_obtain","passing_year","prv_status","pay_rec_no"
            ],
            BulkService.VERIFICATION: [
                "doc_rec_id","date","enrollment_no","second_enrollment_no","student_name","no_of_transcript","no_of_marksheet","no_of_degree","no_of_moi","no_of_backlog","status","final_no","pay_rec_no"
            ],
            BulkService.DEGREE: None,
            BulkService.EMP_PROFILE: [
                "emp_id","emp_name","emp_designation","userid","actual_joining","emp_birth_date","usr_birth_date","department_joining","institute_id","status","el_balance","sl_balance","cl_balance","vacation_balance",
                "joining_year_allocation_el","joining_year_allocation_cl","joining_year_allocation_sl","joining_year_allocation_vac","leave_calculation_date","emp_short"
            ],
            BulkService.LEAVE: [
                "leave_report_no","emp_id","leave_code","start_date","end_date","total_days","reason","status","created_by","approved_by","approved_at"
            ],
        }
        cols = columns_map.get(service)
        if not cols:
            return Response({"detail": f"Template not available for {service or 'service'}"}, status=501)
        df = pd.DataFrame(columns=cols)
        # If client requests a sample, populate one example row and add a summary sheet
        sample_flag = str(request.query_params.get('sample', '')).strip().lower() in ('1', 'true', 'yes')
        if sample_flag:
            # Build a single representative example row using heuristics based on column names
            example = {}
            from datetime import date
            today = date.today()
            for c in cols:
                lc = c.lower()
                if 'emp_id' in lc:
                    example[c] = 'EMP001'
                elif 'emp_name' in lc or 'name' in lc:
                    example[c] = 'John Doe'
                elif 'designation' in lc:
                    example[c] = 'Manager'
                elif 'userid' in lc:
                    example[c] = 'jdoe'
                elif 'joining' in lc and 'date' in lc or lc in ('actual_joining',):
                    example[c] = today.strftime('%Y-%m-%d')
                elif 'birth' in lc and 'date' in lc or 'birth_date' in lc:
                    example[c] = (today.replace(year=today.year-30)).strftime('%Y-%m-%d')
                elif 'department' in lc:
                    example[c] = 'HR'
                elif 'institute' in lc:
                    example[c] = 'INST01'
                elif lc in ('status',):
                    example[c] = 'Active'
                elif any(x in lc for x in ('balance', 'el_', 'sl_', 'cl_', 'vacation')):
                    example[c] = 0
                elif 'joining_year_allocation' in lc:
                    # small allocation example
                    example[c] = 1
                elif 'leave_calculation_date' in lc:
                    example[c] = today.strftime('%Y-%m-%d')
                elif 'emp_short' in lc:
                    example[c] = 0
                else:
                    example[c] = ''
            df = pd.DataFrame([example])

        output = BytesIO()
        with pd.ExcelWriter(output, engine='openpyxl') as writer:
            df.to_excel(writer, index=False, sheet_name=custom_sheet or service.title())
            if sample_flag:
                # add a tiny summary sheet with counts
                try:
                    summary = pd.DataFrame([{"sheet": custom_sheet or service.title(), "sample_rows": len(df.index)}])
                    summary.to_excel(writer, index=False, sheet_name='summary')
                except Exception:
                    # non-fatal: ignore summary write errors
                    pass
        output.seek(0)
        filename = f"template_{service.lower()}_{timezone.now().strftime('%Y%m%d_%H%M%S')}.xlsx"
        resp = HttpResponse(output.getvalue(), content_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet")
        resp['Content-Disposition'] = f'attachment; filename="{filename}"'
        return resp

    def _process_confirm(self, service, df, user, track_id=None, auto_create_docrec=False):  # noqa: C901
        """Internal processor for confirm action. Optionally updates cache for progress."""
        # Normalize pandas NaN/NaT values to Python None to avoid passing numpy.nan into ORM filters
        try:
            import pandas as _pd
            if isinstance(df, _pd.DataFrame):
                df = df.where(_pd.notnull(df), None)
        except Exception:
            pass
        total_rows = len(df.index)
        results = []
        ok_count = 0
        fail_count = 0

        def _cache_progress(processed):
            if not track_id:
                return
            cache.set(f"bulk:{track_id}", {
                "status": "running",
                "service": service,
                "processed": processed,
                "total": total_rows,
                "ok": ok_count,
                "fail": fail_count,
            }, timeout=3600)

        def _log(row_idx, key, status_msg, ok):
            nonlocal ok_count, fail_count
            if ok:
                ok_count += 1
            else:
                fail_count += 1
            results.append({"row": int(row_idx), "key": key, "status": "OK" if ok else "FAIL", "message": status_msg})

        def _clean_cell(val):
            """Normalize cell values: convert pandas/numpy NaN, 'nan', '<NA>', 'none', empty strings to None; trim strings."""
            try:
                import pandas as _p
                if isinstance(val, float) and _p.isna(val):
                    return None
            except Exception:
                # pandas may not be available in this scope; continue
                pass
            if val is None:
                return None
            try:
                s = str(val).strip()
            except Exception:
                return val
            if s == '':
                return None
            if s.lower() in ('nan', 'none', '<na>'):
                return None
            return s

        # Helper to safely convert numeric counts to int without failing on NaN/None/empty
        def _safe_int(val):
            try:
                # Cover pandas NA / numpy.nan which are floats
                if val is None:
                    return 0
                # If it's already an int-like string or number
                if isinstance(val, (int,)):
                    return int(val)
                # Try float conversion then int (handles '3.0', numpy.nan etc.)
                f = float(val)
                # numpy.nan will compare unequal to itself
                if f != f:
                    return 0
                return int(f)
            except Exception:
                return 0

        try:
            if service == BulkService.DOCREC:
                for idx, row in df.iterrows():
                    try:
                        apply_for = str(row.get("apply_for") or "").strip().upper()
                        pay_by = str(row.get("pay_by") or "").strip().upper()
                        doc_rec_id = str(row.get("doc_rec_id") or "").strip()
                        pay_rec_no_pre = str(row.get("pay_rec_no_pre") or "").strip()
                        pay_rec_no = str(row.get("pay_rec_no") or "").strip() or None
                        raw_amt = row.get("pay_amount")
                        pay_amount = None
                        try:
                            if str(raw_amt).strip() not in ("", "None"):
                                pay_amount = float(raw_amt)
                        except Exception:
                            pay_amount = None
                        if not (apply_for and pay_by and doc_rec_id):
                            _log(idx, doc_rec_id, "Missing required fields (apply_for/pay_by/doc_rec_id)", False); _cache_progress(idx+1); continue
                        if pay_by != PayBy.NA and not pay_rec_no_pre:
                            _log(idx, doc_rec_id, "pay_rec_no_pre required unless pay_by=NA", False); _cache_progress(idx+1); continue
                        dr_date = _parse_excel_date_safe(row.get("doc_rec_date")) or timezone.now().date()
                        obj, created = DocRec.objects.get_or_create(
                            doc_rec_id=doc_rec_id,
                            defaults={
                                "apply_for": apply_for,
                                "pay_by": pay_by,
                                "pay_rec_no_pre": pay_rec_no_pre,
                                "pay_rec_no": pay_rec_no,
                                "pay_amount": pay_amount or 0,
                                "doc_rec_date": dr_date,
                                "created_by": user,
                            }
                        )
                        if not created:
                            obj.apply_for = apply_for
                            obj.pay_by = pay_by
                            obj.pay_rec_no_pre = pay_rec_no_pre if pay_by != PayBy.NA else None
                            obj.pay_rec_no = pay_rec_no if pay_by != PayBy.NA else None
                            obj.pay_amount = pay_amount or 0
                            obj.doc_rec_date = dr_date
                            obj.save()
                        _log(idx, doc_rec_id, "Upserted", True)
                    except Exception as e:
                        _log(idx, row.get("doc_rec_id"), str(e), False)
                    _cache_progress(idx+1)

            elif service == BulkService.ENROLLMENT:
                for idx, row in df.iterrows():
                    try:
                        institute = Institute.objects.filter(institute_id=row.get("institute_id")).first()
                        subcourse = SubBranch.objects.filter(subcourse_id=row.get("subcourse_id")).first()
                        maincourse = MainBranch.objects.filter(maincourse_id=row.get("maincourse_id")).first()
                        if not (institute and subcourse and maincourse):
                            _log(idx, row.get("enrollment_no"), "Missing related institute/subcourse/maincourse", False); _cache_progress(idx+1); continue
                        enrollment_date = _parse_excel_date_safe(row.get("enrollment_date"))
                        admission_date = _parse_excel_date_safe(row.get("admission_date"))
                        Enrollment.objects.update_or_create(
                            enrollment_no=row.get("enrollment_no"),
                            defaults={
                                "student_name": row.get("student_name"),
                                "institute": institute,
                                "batch": row.get("batch"),
                                "enrollment_date": enrollment_date,
                                "admission_date": admission_date,
                                "subcourse": subcourse,
                                "maincourse": maincourse,
                                "temp_enroll_no": row.get("temp_enroll_no"),
                                "updated_by": user
                            }
                        )
                        _log(idx, row.get("enrollment_no"), "Upserted", True)
                    except Exception as e:
                        _log(idx, row.get("enrollment_no"), str(e), False)
                    _cache_progress(idx+1)

            elif service == BulkService.INSTITUTE:
                for idx, row in df.iterrows():
                    try:
                        inst_id = row.get("institute_id")
                        if inst_id in (None, ""):
                            _log(idx, inst_id, "Missing institute_id", False); _cache_progress(idx+1); continue
                        Institute.objects.update_or_create(
                            institute_id=inst_id,
                            defaults={
                                "institute_code": row.get("institute_code"),
                                "institute_name": row.get("institute_name"),
                                "institute_campus": row.get("institute_campus"),
                                "institute_address": row.get("institute_address"),
                                "institute_city": row.get("institute_city"),
                                "updated_by": user,
                            }
                        )
                        _log(idx, inst_id, "Upserted", True)
                    except Exception as e:
                        _log(idx, row.get("institute_id"), str(e), False)
                    _cache_progress(idx+1)

            elif service == BulkService.MIGRATION:
                for idx, row in df.iterrows():
                    try:
                        doc_rec_id_raw = _clean_cell(row.get("doc_rec_id"))
                        doc_rec = None
                        if doc_rec_id_raw:
                            try:
                                key = str(doc_rec_id_raw).strip()
                            except Exception:
                                key = str(doc_rec_id_raw)
                            # Try exact
                            doc_rec = DocRec.objects.filter(doc_rec_id=key).first()
                            # Try case-insensitive
                            if not doc_rec:
                                try:
                                    doc_rec = DocRec.objects.filter(doc_rec_id__iexact=key).first()
                                except Exception:
                                    doc_rec = None
                            # Try normalized (remove non-alphanum, lower)
                            if not doc_rec:
                                try:
                                    import re
                                    norm = re.sub(r'[^0-9a-zA-Z]', '', key).lower()
                                    if norm:
                                        # annotate not needed; do a simple filter on cleaned field
                                        for dr in DocRec.objects.all()[:20000]:
                                            try:
                                                if re.sub(r'[^0-9a-zA-Z]', '', str(dr.doc_rec_id)).lower() == norm:
                                                    doc_rec = dr
                                                    break
                                            except Exception:
                                                continue
                                except Exception:
                                    pass
                        enr_key = _clean_cell(row.get("enrollment_no"))
                        enr = None
                        # Robust enrollment lookup: try exact, iexact, and a normalized-space match
                        if enr_key:
                            try:
                                k = str(enr_key).strip()
                            except Exception:
                                k = str(enr_key)
                            if k:
                                enr = Enrollment.objects.filter(enrollment_no=k).first()
                                if not enr:
                                    try:
                                        enr = Enrollment.objects.filter(enrollment_no__iexact=k).first()
                                    except Exception:
                                        enr = None
                                if not enr:
                                    try:
                                        # normalize by removing spaces and comparing lower-case
                                        norm = ''.join(k.split()).lower()
                                        enr = (Enrollment.objects
                                               .annotate(_norm=Replace(Lower(models.F('enrollment_no')), Value(' '), Value('')))
                                               .filter(_norm=norm)
                                               .first())
                                    except Exception:
                                        enr = None

                        # Accept missing FK cells (None) and try to fallback to enrollment's relations
                        inst_key = _clean_cell(row.get("institute_id"))
                        main_key = _clean_cell(row.get("maincourse_id"))
                        sub_key = _clean_cell(row.get("subcourse_id"))
                        inst = Institute.objects.filter(institute_id=str(inst_key)).first() if inst_key else None
                        main = MainBranch.objects.filter(maincourse_id=str(main_key)).first() if main_key else None
                        sub = SubBranch.objects.filter(subcourse_id=str(sub_key)).first() if sub_key else None

                        # If institute/main/sub missing but enrollment exists, try to use enrollment's relations
                        if enr:
                            try:
                                if not inst and getattr(enr, 'institute', None):
                                    inst = enr.institute
                                if not main and getattr(enr, 'maincourse', None):
                                    main = enr.maincourse
                                if not sub and getattr(enr, 'subcourse', None):
                                    sub = enr.subcourse
                            except Exception:
                                pass

                        missing = []
                        if not doc_rec:
                            missing.append('doc_rec')
                        if not enr:
                            missing.append('enrollment')
                        if not inst:
                            missing.append('institute')
                        if not main:
                            missing.append('main')
                        if not sub:
                            missing.append('sub')
                        if missing:
                            # Provide attempted keys in the message to aid debugging
                            msg = f"Missing related ({'/'.join(missing)}) -- tried doc_rec='{doc_rec_id_raw}', enrollment_no='{enr_key}'"
                            _log(idx, row.get("mg_number"), msg, False); _cache_progress(idx+1); continue
                        mg_date = _parse_excel_date_safe(row.get("mg_date"))
                        if mg_date is None:  # required non-null
                            _log(idx, row.get("mg_number"), "Missing mg_date", False); _cache_progress(idx+1); continue
                        MigrationRecord.objects.update_or_create(
                            mg_number=str(row.get("mg_number")).strip(),
                            defaults={
                                "doc_rec": doc_rec,
                                "enrollment": enr,
                                "student_name": row.get("student_name") or (enr.student_name if enr else ""),
                                "institute": inst,
                                "maincourse": main,
                                "subcourse": sub,
                                "mg_date": mg_date,
                                "exam_year": row.get("exam_year"),
                                "admission_year": row.get("admission_year"),
                                "exam_details": row.get("exam_details"),
                                "mg_status": row.get("mg_status") or MigrationStatus.PENDING,
                                "pay_rec_no": row.get("pay_rec_no") or (doc_rec.pay_rec_no if doc_rec else ""),
                                "created_by": user,
                            }
                        )
                        _log(idx, row.get("mg_number"), "Upserted", True)
                    except Exception as e:
                        _log(idx, row.get("mg_number"), str(e), False)
                    _cache_progress(idx+1)

            elif service == BulkService.PROVISIONAL:
                for idx, row in df.iterrows():
                    try:
                        doc_rec_id_raw = _clean_cell(row.get("doc_rec_id"))
                        doc_rec = None
                        if doc_rec_id_raw:
                            try:
                                key = str(doc_rec_id_raw).strip()
                            except Exception:
                                key = str(doc_rec_id_raw)
                            doc_rec = DocRec.objects.filter(doc_rec_id=key).first()
                            if not doc_rec:
                                try:
                                    doc_rec = DocRec.objects.filter(doc_rec_id__iexact=key).first()
                                except Exception:
                                    doc_rec = None
                            if not doc_rec:
                                try:
                                    import re
                                    norm = re.sub(r'[^0-9a-zA-Z]', '', key).lower()
                                    if norm:
                                        for dr in DocRec.objects.all()[:20000]:
                                            try:
                                                if re.sub(r'[^0-9a-zA-Z]', '', str(dr.doc_rec_id)).lower() == norm:
                                                    doc_rec = dr
                                                    break
                                            except Exception:
                                                continue
                                except Exception:
                                    pass
                        enr_key = _clean_cell(row.get("enrollment_no"))
                        enr = Enrollment.objects.filter(enrollment_no=str(enr_key)).first() if enr_key else None

                        inst_key = _clean_cell(row.get("institute_id"))
                        main_key = _clean_cell(row.get("maincourse_id"))
                        sub_key = _clean_cell(row.get("subcourse_id"))
                        inst = Institute.objects.filter(institute_id=str(inst_key)).first() if inst_key else None
                        main = MainBranch.objects.filter(maincourse_id=str(main_key)).first() if main_key else None
                        sub = SubBranch.objects.filter(subcourse_id=str(sub_key)).first() if sub_key else None

                        if enr:
                            try:
                                if not inst and getattr(enr, 'institute', None):
                                    inst = enr.institute
                                if not main and getattr(enr, 'maincourse', None):
                                    main = enr.maincourse
                                if not sub and getattr(enr, 'subcourse', None):
                                    sub = enr.subcourse
                            except Exception:
                                pass

                        if not (doc_rec and enr and inst and main and sub):
                            _log(idx, row.get("prv_number"), "Missing related (doc_rec/enrollment/institute/main/sub)", False); _cache_progress(idx+1); continue
                        prv_date = _parse_excel_date_safe(row.get("prv_date"))
                        if prv_date is None:
                            _log(idx, row.get("prv_number"), "Missing prv_date", False); _cache_progress(idx+1); continue
                        ProvisionalRecord.objects.update_or_create(
                            prv_number=str(row.get("prv_number")).strip(),
                            defaults={
                                "doc_rec": doc_rec,
                                "enrollment": enr,
                                "student_name": row.get("student_name") or (enr.student_name if enr else ""),
                                "institute": inst,
                                "maincourse": main,
                                "subcourse": sub,
                                "class_obtain": row.get("class_obtain"),
                                "prv_date": prv_date,
                                "passing_year": row.get("passing_year"),
                                "prv_status": row.get("prv_status") or ProvisionalStatus.PENDING,
                                "pay_rec_no": row.get("pay_rec_no") or (doc_rec.pay_rec_no if doc_rec else ""),
                                "created_by": user,
                            }
                        )
                        _log(idx, row.get("prv_number"), "Upserted", True)
                    except Exception as e:
                        _log(idx, row.get("prv_number"), str(e), False)
                    _cache_progress(idx+1)

            elif service == BulkService.EMP_PROFILE:
                for idx, row in df.iterrows():
                    try:
                        emp_id = str(row.get("emp_id") or "").strip()
                        if not emp_id:
                            _log(idx, emp_id, "Missing emp_id", False); _cache_progress(idx+1); continue
                        # parse dates
                        actual_joining = _parse_excel_date_safe(row.get("actual_joining"))
                        emp_birth = _parse_excel_date_safe(row.get("emp_birth_date"))
                        usr_birth = _parse_excel_date_safe(row.get("usr_birth_date"))
                        defaults = {
                            "emp_name": row.get("emp_name") or "",
                            "emp_designation": row.get("emp_designation") or None,
                            "userid": row.get("userid") or None,
                            "actual_joining": actual_joining,
                            "emp_birth_date": emp_birth,
                            "usr_birth_date": usr_birth,
                            "department_joining": row.get("department_joining") or None,
                            "institute_id": row.get("institute_id") or None,
                            "status": row.get("status") or "Active",
                            "el_balance": float(row.get("el_balance") or 0) if row.get("el_balance") not in (None, "") else 0,
                            "sl_balance": float(row.get("sl_balance") or 0) if row.get("sl_balance") not in (None, "") else 0,
                            "cl_balance": float(row.get("cl_balance") or 0) if row.get("cl_balance") not in (None, "") else 0,
                            "vacation_balance": float(row.get("vacation_balance") or 0) if row.get("vacation_balance") not in (None, "") else 0,
                        }
                        obj, created = EmpProfile.objects.update_or_create(
                            emp_id=emp_id,
                            defaults={**defaults, "created_by": user}
                        )
                        _log(idx, emp_id, "Upserted", True)
                    except Exception as e:
                        _log(idx, row.get("emp_id"), str(e), False)
                    _cache_progress(idx+1)

            elif service == BulkService.LEAVE:
                for idx, row in df.iterrows():
                    try:
                        leave_report_no = str(row.get("leave_report_no") or "").strip()
                        emp_id = str(row.get("emp_id") or "").strip()
                        leave_code = str(row.get("leave_code") or "").strip()
                        if not (leave_report_no and emp_id and leave_code):
                            _log(idx, leave_report_no or emp_id or leave_code, "Missing required fields (leave_report_no/emp_id/leave_code)", False); _cache_progress(idx+1); continue
                        profile = EmpProfile.objects.filter(emp_id=emp_id).first()
                        if not profile:
                            _log(idx, emp_id, "EmpProfile not found", False); _cache_progress(idx+1); continue
                        lt = LeaveType.objects.filter(leave_code=leave_code).first()
                        if not lt:
                            _log(idx, leave_code, "LeaveType not found", False); _cache_progress(idx+1); continue
                        start_date = _parse_excel_date_safe(row.get("start_date"))
                        end_date = _parse_excel_date_safe(row.get("end_date"))
                        total_days = None
                        try:
                            if row.get("total_days") not in (None, ""):
                                total_days = float(row.get("total_days"))
                        except Exception:
                            total_days = None
                        approved_at = _parse_excel_date_safe(row.get("approved_at"))
                        obj, created = LeaveEntry.objects.update_or_create(
                            leave_report_no=leave_report_no,
                            defaults={
                                "emp": profile,
                                "leave_type": lt,
                                "start_date": start_date or timezone.now().date(),
                                "end_date": end_date or start_date or timezone.now().date(),
                                "total_days": total_days,
                                "reason": row.get("reason") or None,
                                "status": row.get("status") or "Pending",
                                "created_by": row.get("created_by") or user,
                                "approved_by": row.get("approved_by") or None,
                                "approved_at": approved_at,
                            }
                        )
                        _log(idx, leave_report_no, "Upserted", True)
                    except Exception as e:
                        _log(idx, row.get("leave_report_no"), str(e), False)
                    _cache_progress(idx+1)

            elif service == BulkService.VERIFICATION:
                for idx, row in df.iterrows():
                    try:
                        dr_key = str(row.get("doc_rec_id") or '').strip()
                        enr_key = str(row.get("enrollment_no") or '').strip()
                        doc_rec = DocRec.objects.filter(doc_rec_id=dr_key).first() if dr_key else None
                        enr = Enrollment.objects.filter(enrollment_no=enr_key).first() if enr_key else None
                        senr = None
                        if str(row.get("second_enrollment_no") or '').strip():
                            senr = Enrollment.objects.filter(enrollment_no=str(row.get("second_enrollment_no")).strip()).first()

                        # If DocRec missing and auto-create requested, create a minimal DocRec
                        if not doc_rec and auto_create_docrec and dr_key:
                            try:
                                doc_date = _parse_excel_date_safe(row.get("doc_rec_date")) or timezone.now().date()
                                # Collect optional fields from sheet if present
                                pay_rec_no = (str(row.get('pay_rec_no') or '').strip() or None)
                                remark = (str(row.get('doc_rec_remark') or '').strip() or None)
                                # Create with available info; pay_by defaults to NA in model save() if not provided
                                doc_rec = DocRec.objects.create(
                                    doc_rec_id=dr_key,
                                    apply_for='VR',
                                    doc_rec_date=doc_date,
                                    pay_rec_no=pay_rec_no,
                                    doc_rec_remark=remark,
                                    created_by=user
                                )
                            except Exception:
                                doc_rec = DocRec.objects.filter(doc_rec_id=dr_key).first()

                        if not (doc_rec and enr):
                            # More specific message: indicate which related is missing
                            missing = []
                            if not doc_rec:
                                missing.append('doc_rec')
                            if not enr:
                                missing.append('enrollment')
                            _log(idx, row.get("final_no") or dr_key or enr_key, f"Missing related ({'/'.join(missing)})", False)
                            _cache_progress(idx+1)
                            continue

                        date_v = _parse_excel_date_safe(row.get("date")) or timezone.now().date()
                        # Build defaults but only include status if provided in sheet (avoid forcing IN_PROGRESS on blank cells)
                        # normalize cell values: convert None/NaN/'nan'/'<NA>'/empty -> None, else trimmed string
                        def _normalize_cell(val):
                            try:
                                import math
                                if isinstance(val, float) and math.isnan(val):
                                    return None
                            except Exception:
                                pass
                            if val is None:
                                return None
                            s = str(val).strip()
                            if s.lower() in ('', 'nan', 'none', '<na>'):
                                return None
                            return s

                        # map mail_status from sheet (Y/N or SENT/NOT_SENT) to MailStatus values
                        def _map_mail_status(val):
                            try:
                                s = str(val).strip().lower()
                            except Exception:
                                return None
                            if s in ('y', 'yes', '1', 'true', 'sent'):
                                return MailStatus.SENT
                            if s in ('n', 'no', '0', 'false', 'not_sent', ''):
                                return MailStatus.NOT_SENT
                            return None

                        # map eca_required (Y/N)
                        def _map_bool_flag(val):
                            try:
                                s = str(val).strip().lower()
                            except Exception:
                                return False
                            return s in ('y', 'yes', '1', 'true')

                        # use normalized values where we previously used raw row.get()
                        norm_pay_rec_no = _normalize_cell(row.get('pay_rec_no'))
                        norm_eca_name = _normalize_cell(row.get('eca_name'))
                        norm_eca_ref = _normalize_cell(row.get('eca_ref_no'))

                        defaults = {
                            "doc_rec": doc_rec,
                            "date": date_v,
                            "enrollment": enr,
                            "second_enrollment": senr,
                            "student_name": _normalize_cell(row.get("student_name")) or (enr.student_name if enr else ""),
                            "tr_count": _safe_int(row.get("no_of_transcript") or 0),
                            "ms_count": _safe_int(row.get("no_of_marksheet") or 0),
                            "dg_count": _safe_int(row.get("no_of_degree") or 0),
                            "moi_count": _safe_int(row.get("no_of_moi") or 0),
                            "backlog_count": _safe_int(row.get("no_of_backlog") or 0),
                            "pay_rec_no": norm_pay_rec_no or (doc_rec.pay_rec_no if doc_rec else ""),
                            # ECA fields
                            "eca_required": _map_bool_flag(_normalize_cell(row.get('eca_required'))),
                            "eca_name": norm_eca_name,
                            "eca_ref_no": norm_eca_ref,
                            "eca_send_date": _parse_excel_date_safe(row.get('eca_send_date')),
                            "eca_status": (_map_mail_status(_normalize_cell(row.get('eca_status') or row.get('eca_send_status'))) or MailStatus.NOT_SENT),
                            # mail send status for verification (accept common header names)
                            "mail_status": (_map_mail_status(_normalize_cell(row.get('mail_status') or row.get('mail_send_status') or row.get('mail_send'))) or MailStatus.NOT_SENT),
                            "updatedby": user,
                        }
                        status_val = _normalize_cell(row.get("status"))
                        has_status = status_val is not None and str(status_val).strip() != ""

                        final_no_val = _normalize_cell(row.get("final_no"))

                        # If final_no provided, try to find existing object and update, otherwise create.
                        if final_no_val:
                            existing = Verification.objects.filter(final_no=final_no_val).first()
                            if existing:
                                # update fields except status unless provided
                                for k, v in defaults.items():
                                    setattr(existing, k, v)
                                if has_status:
                                    existing.status = status_val
                                # else preserve existing.status
                                existing.full_clean()
                                existing.save()
                            else:
                                # create: if sheet didn't provide status, create with NULL status
                                create_data = {**defaults}
                                create_data['final_no'] = final_no_val
                                create_data['status'] = status_val if has_status else None
                                Verification.objects.create(**create_data)
                        else:
                            # No final_no: create new record. If status blank -> keep NULL
                            create_data = {**defaults}
                            create_data['status'] = status_val if has_status else None
                            Verification.objects.create(**create_data)
                        _log(idx, row.get("final_no") or row.get("enrollment_no"), "Upserted", True)
                    except Exception as e:
                        _log(idx, row.get("final_no") or row.get("enrollment_no"), str(e), False)
                    _cache_progress(idx+1)
            else:
                return {"error": True, "detail": f"Service {service} not implemented"}
        except Exception as e:
            # fatal error
            if track_id:
                cache.set(f"bulk:{track_id}", {"status": "error", "detail": str(e)}, timeout=3600)
            return {"error": True, "detail": str(e)}

        # Build log excel
        file_url = None
        try:
            import pandas as pd
            logs_dir = os.path.join(settings.MEDIA_ROOT, 'logs')
            os.makedirs(logs_dir, exist_ok=True)
            df_log = pd.DataFrame(results)
            out = BytesIO()
            with pd.ExcelWriter(out, engine='openpyxl') as writer:
                df_log.to_excel(writer, index=False, sheet_name='result')
            out.seek(0)
            fname = f"upload_log_{service.lower()}_{timezone.now().strftime('%Y%m%d_%H%M%S')}.xlsx"
            fpath = os.path.join(logs_dir, fname)
            with open(fpath, 'wb') as f:
                f.write(out.getvalue())
            file_url = settings.MEDIA_URL + 'logs/' + fname
        except Exception:
            file_url = None

        summary = {"ok": ok_count, "fail": fail_count, "total": len(results)}
        result_payload = {
            "error": False,
            "mode": "confirm",
            "summary": summary,
            "log_url": file_url,
            "results": results,
        }
        if track_id:
            cache.set(f"bulk:{track_id}", {"status": "done", **result_payload}, timeout=3600)
        return result_payload

    def post(self, request):  # noqa: C901
        action = request.query_params.get('action', 'preview')
        service = request.data.get('service', '').upper().strip()
        preferred_sheet = (request.data.get('sheet_name') or '').strip()
        upload = request.FILES.get('file')
        async_mode = request.query_params.get('async') == '1'
        track = async_mode and action != 'preview'

        def err(detail, code=status.HTTP_400_BAD_REQUEST):
            return Response({"error": True, "detail": detail}, status=code)

        if not service:
            return err("service is required")
        if not upload:
            return err("file is required")
        if upload.size > self.MAX_UPLOAD_BYTES:
            return err(f"File too large (> {self.MAX_UPLOAD_BYTES // (1024*1024)}MB)", status.HTTP_413_REQUEST_ENTITY_TOO_LARGE)

        name_lower = upload.name.lower()
        ext = os.path.splitext(name_lower)[1]
        is_excel = ext in ('.xlsx', '.xls')
        is_csv = ext == '.csv'
        if not (is_excel or is_csv):
            return err("Unsupported file type. Use .xlsx, .xls, or .csv", status.HTTP_415_UNSUPPORTED_MEDIA_TYPE)

        try:
            import pandas as pd
        except Exception:
            return Response({"error": True, "detail": "pandas is required on server for Excel/CSV operations."}, status=500)

        # Read into a DataFrame (or dict of DataFrames for Excel)
        try:
            if is_excel:
                # Read all sheets for preview logic
                df_sheets = pd.read_excel(upload, sheet_name=None)
                if not df_sheets:
                    return err("No sheets found in workbook")
                if preferred_sheet and preferred_sheet in df_sheets:
                    sheet_name, df = preferred_sheet, df_sheets[preferred_sheet]
                else:
                    sheet_name, df = next(iter(df_sheets.items()))
            else:  # CSV
                sheet_name = None
                df = pd.read_csv(upload)
        except Exception as e:
            return err(f"Error reading file: {e}")
        if df is None:
            return err("No data found")

        # If client provided a columns[] selection, subset dataframe to only those columns
        # Also ensure minimal keys used by services remain present if available
        try:
            selected_cols = None
            # request.data may be a QueryDict-like with getlist
            if hasattr(request.data, 'getlist'):
                selected_cols = request.data.getlist('columns[]') or request.data.getlist('columns')
            else:
                # fallback: might be provided as a JSON list or single value
                sel = request.data.get('columns[]') or request.data.get('columns')
                if isinstance(sel, list):
                    selected_cols = sel
                elif isinstance(sel, str):
                    # single value
                    selected_cols = [sel]
            if selected_cols:
                # Columns we should keep regardless if selected (useful ids used by processors)
                force_keys = ['enrollment_no', 'doc_rec_id', 'prv_number', 'mg_number', 'final_no']
                # Build keep list in order: selected cols that exist + available force keys
                keep = [c for c in selected_cols if c in df.columns]
                for k in force_keys:
                    if k in df.columns and k not in keep:
                        keep.append(k)
                if keep:
                    df = df.loc[:, [c for c in keep if c in df.columns]]
        except Exception:
            # non-fatal: proceed with original df
            pass

        def _bool(v):
            s = str(v).strip().lower()
            return s in ("1","true","yes","y","t")

        # Preview returns top rows
        if action == 'preview':
            preview_rows = df.fillna('').head(100).to_dict(orient='records')
            return Response({
                "error": False,
                "mode": "preview",
                "sheet": sheet_name,
                "count": int(len(df)),
                "preview": preview_rows
            })

        # Confirm path
        if action != 'preview':
            # Allow caller to request auto-creation of missing DocRec entries
            auto_create_docrec = _bool(request.data.get('auto_create_docrec') or request.query_params.get('auto_create_docrec', ''))
            if track:
                upload_id = str(uuid.uuid4())
                # initial cache entry
                cache.set(f"bulk:{upload_id}", {"status": "queued", "service": service, "processed": 0, "total": len(df.index)}, timeout=3600)
                def _bg():
                    from django.contrib.auth import get_user_model
                    UserModel = get_user_model()
                    user_obj = UserModel.objects.filter(id=request.user.id).first()
                    payload = self._process_confirm(service, df, user_obj, track_id=upload_id, auto_create_docrec=auto_create_docrec)
                threading.Thread(target=_bg, daemon=True).start()
                return Response({"error": False, "mode": "started", "upload_id": upload_id, "total": len(df.index)})
            else:
                payload = self._process_confirm(service, df, request.user, auto_create_docrec=auto_create_docrec)
                status_code = 200 if not payload.get('error') else 500
                # Adjust absolute URL for log if present
                if payload.get('log_url') and not payload['log_url'].startswith('http'):
                    payload['log_url'] = request.build_absolute_uri(payload['log_url'])
                return Response(payload, status=status_code)


class DataAnalysisView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request):
        service = request.query_params.get('service', '').upper().strip()
        issues = []

        def add(issue_type, key, msg):
            issues.append({"type": issue_type, "key": key, "message": msg})

        if service == BulkService.ENROLLMENT:
            # Duplicates by enrollment_no and temp_enroll_no
            dups = (Enrollment.objects.values('enrollment_no').annotate(c=models.Count('id')).filter(c__gt=1))
            for d in dups:
                add('DUPLICATE_ENROLLMENT_NO', d['enrollment_no'], f"Appears {d['c']} times")
            dups2 = (Enrollment.objects.values('temp_enroll_no').annotate(c=models.Count('id')).filter(temp_enroll_no__isnull=False, temp_enroll_no__gt='', c__gt=1))
            for d in dups2:
                add('DUPLICATE_TEMP_ENROLL_NO', d['temp_enroll_no'], f"Appears {d['c']} times")
            # Course mismatch
            for e in Enrollment.objects.select_related('subcourse__maincourse', 'maincourse')[:5000]:
                try:
                    if e.subcourse and e.maincourse and e.subcourse.maincourse_id != e.maincourse.maincourse_id:
                        add('COURSE_MISMATCH', e.enrollment_no, 'Subcourse not under Maincourse')
                except Exception:
                    pass

        elif service == BulkService.MIGRATION:
            dups = MigrationRecord.objects.values('mg_number').annotate(c=models.Count('id')).filter(c__gt=1)
            for d in dups:
                add('DUPLICATE_MG_NUMBER', d['mg_number'], f"Appears {d['c']} times")
            for m in MigrationRecord.objects.select_related('doc_rec')[:5000]:
                if not m.doc_rec:
                    add('MISSING_DOC_REC', m.mg_number, 'No doc_rec linked')

        elif service == BulkService.PROVISIONAL:
            dups = ProvisionalRecord.objects.values('prv_number').annotate(c=models.Count('id')).filter(c__gt=1)
            for d in dups:
                add('DUPLICATE_PRV_NUMBER', d['prv_number'], f"Appears {d['c']} times")
            for p in ProvisionalRecord.objects.select_related('doc_rec')[:5000]:
                if not p.doc_rec:
                    add('MISSING_DOC_REC', p.prv_number, 'No doc_rec linked')

        elif service == BulkService.VERIFICATION:
            dups = Verification.objects.values('final_no').annotate(c=models.Count('id')).filter(final_no__isnull=False, final_no__gt='', c__gt=1)
            for d in dups:
                add('DUPLICATE_FINAL_NO', d['final_no'], f"Appears {d['c']} times")
            for v in Verification.objects.select_related('doc_rec')[:5000]:
                if not v.enrollment:
                    add('MISSING_ENROLLMENT', v.id, 'No enrollment linked')
                if v.status in [VerificationStatus.PENDING, VerificationStatus.CANCEL] and v.final_no:
                    add('STATUS_RULE', v.id, 'final_no must be empty for PENDING/CANCEL')

        else:
            return Response({"detail": f"Service {service} not implemented"}, status=501)

        # Return analysis and a quick summary
        summary = {
            'total_issues': len(issues),
            'by_type': {}
        }
        for it in issues:
            summary['by_type'][it['type']] = summary['by_type'].get(it['type'], 0) + 1
        return Response({"summary": summary, "issues": issues})
    def perform_update(self, serializer):
        serializer.save(updated_by=self.request.user if self.request.user.is_authenticated else None)
    

class StudentProfileViewSet(viewsets.ModelViewSet):
    queryset = StudentProfile.objects.select_related('enrollment').order_by('-id')
    serializer_class = StudentProfileSerializer
    permission_classes = [IsAuthenticated]

    def get_queryset(self):
        qs = super().get_queryset()
        search = self.request.query_params.get('search', '').strip()
        if search:
            norm_q = ''.join(search.split()).lower()
            qs = qs.annotate(
                n_en=Replace(Lower(models.F('enrollment__enrollment_no')), Value(' '), Value('')),
                n_name=Replace(Lower(models.F('enrollment__student_name')), Value(' '), Value('')),
            ).filter(Q(n_en__contains=norm_q) | Q(n_name__contains=norm_q))
        return qs

