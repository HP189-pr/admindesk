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
        }
        cols = columns_map.get(service)
        if not cols:
            return Response({"detail": f"Template not available for {service or 'service'}"}, status=501)
        df = pd.DataFrame(columns=cols)
        output = BytesIO()
        with pd.ExcelWriter(output, engine='openpyxl') as writer:
            df.to_excel(writer, index=False, sheet_name=custom_sheet or service.title())
        output.seek(0)
        filename = f"template_{service.lower()}_{timezone.now().strftime('%Y%m%d_%H%M%S')}.xlsx"
        resp = HttpResponse(output.getvalue(), content_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet")
        resp['Content-Disposition'] = f'attachment; filename="{filename}"'
        return resp

    def _process_confirm(self, service, df, user, track_id=None):  # noqa: C901
        """Internal processor for confirm action. Optionally updates cache for progress."""
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
                        doc_rec = DocRec.objects.filter(doc_rec_id=str(row.get("doc_rec_id")).strip()).first()
                        enr = Enrollment.objects.filter(enrollment_no=str(row.get("enrollment_no")).strip()).first()
                        inst = Institute.objects.filter(institute_id=row.get("institute_id")).first()
                        main = MainBranch.objects.filter(maincourse_id=row.get("maincourse_id")).first()
                        sub = SubBranch.objects.filter(subcourse_id=row.get("subcourse_id")).first()
                        if not (doc_rec and enr and inst and main and sub):
                            _log(idx, row.get("mg_number"), "Missing related (doc_rec/enrollment/institute/main/sub)", False); _cache_progress(idx+1); continue
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
                        doc_rec = DocRec.objects.filter(doc_rec_id=str(row.get("doc_rec_id")).strip()).first()
                        enr = Enrollment.objects.filter(enrollment_no=str(row.get("enrollment_no")).strip()).first()
                        inst = Institute.objects.filter(institute_id=row.get("institute_id")).first()
                        main = MainBranch.objects.filter(maincourse_id=row.get("maincourse_id")).first()
                        sub = SubBranch.objects.filter(subcourse_id=row.get("subcourse_id")).first()
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

            elif service == BulkService.VERIFICATION:
                for idx, row in df.iterrows():
                    try:
                        doc_rec = DocRec.objects.filter(doc_rec_id=str(row.get("doc_rec_id")).strip()).first()
                        enr = Enrollment.objects.filter(enrollment_no=str(row.get("enrollment_no")).strip()).first()
                        senr = None
                        if str(row.get("second_enrollment_no") or '').strip():
                            senr = Enrollment.objects.filter(enrollment_no=str(row.get("second_enrollment_no")).strip()).first()
                        if not (doc_rec and enr):
                            _log(idx, row.get("final_no"), "Missing related (doc_rec/enrollment)", False); _cache_progress(idx+1); continue
                        date_v = _parse_excel_date_safe(row.get("date")) or timezone.now().date()
                        Verification.objects.update_or_create(
                            final_no=(str(row.get("final_no")).strip() or None),
                            defaults={
                                "doc_rec": doc_rec,
                                "date": date_v,
                                "enrollment": enr,
                                "second_enrollment": senr,
                                "student_name": row.get("student_name") or (enr.student_name if enr else ""),
                                "tr_count": int(row.get("no_of_transcript") or 0),
                                "ms_count": int(row.get("no_of_marksheet") or 0),
                                "dg_count": int(row.get("no_of_degree") or 0),
                                "moi_count": int(row.get("no_of_moi") or 0),
                                "backlog_count": int(row.get("no_of_backlog") or 0),
                                "status": row.get("status") or VerificationStatus.IN_PROGRESS,
                                "pay_rec_no": row.get("pay_rec_no") or (doc_rec.pay_rec_no if doc_rec else ""),
                                "updatedby": user,
                            }
                        )
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
            if track:
                upload_id = str(uuid.uuid4())
                # initial cache entry
                cache.set(f"bulk:{upload_id}", {"status": "queued", "service": service, "processed": 0, "total": len(df.index)}, timeout=3600)
                def _bg():
                    from django.contrib.auth import get_user_model
                    UserModel = get_user_model()
                    user_obj = UserModel.objects.filter(id=request.user.id).first()
                    payload = self._process_confirm(service, df, user_obj, track_id=upload_id)
                threading.Thread(target=_bg, daemon=True).start()
                return Response({"error": False, "mode": "started", "upload_id": upload_id, "total": len(df.index)})
            else:
                payload = self._process_confirm(service, df, request.user)
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

