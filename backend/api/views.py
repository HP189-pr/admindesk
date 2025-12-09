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
from rest_framework import status
from django.utils import timezone
from django.db import models
from django.db.models import Value, Q
from django.db.models.functions import Lower, Replace
from django.http import HttpResponse
from rest_framework.parsers import MultiPartParser, FormParser
from io import BytesIO
import os, datetime, logging, uuid, threading, traceback
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
from .search_utils import apply_fts_search
from .domain_degree import StudentDegree, ConvocationMaster

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

    def perform_create(self, serializer):
        """Create DocRec and, when apply_for=VR and enrollment info supplied,
        attempt to auto-create a linked Verification record on the server.

        This is best-effort: we only create a Verification when an Enrollment
        can be resolved (by numeric id or enrollment_no). Failures are
        swallowed to avoid blocking the primary DocRec creation flow.
        """
        docrec = serializer.save()
        try:
            req_data = self.request.data if hasattr(self.request, 'data') else {}
            # Only handle verification-type docrecs
            if getattr(docrec, 'apply_for', '').upper() == 'VR':
                # If a Verification already exists for this DocRec, update it
                existing = Verification.objects.filter(doc_rec=docrec).first()
                enr_key = req_data.get('enrollment') or req_data.get('enrollment_no') or req_data.get('enrollment_no_text')
                student_name = req_data.get('student_name') or req_data.get('student') or None
                # Resolve Enrollment: try numeric PK first, then enrollment_no (case-insensitive)
                enrollment_obj = None
                if enr_key:
                    try:
                        sk = str(enr_key).strip()
                        if sk.isdigit():
                            enrollment_obj = Enrollment.objects.filter(id=int(sk)).first()
                        if not enrollment_obj:
                            enrollment_obj = Enrollment.objects.filter(enrollment_no__iexact=sk).first()
                    except Exception:
                        enrollment_obj = None

                vr_kwargs = {
                    'enrollment': enrollment_obj,
                    'second_enrollment': None,
                    'student_name': student_name or (getattr(enrollment_obj, 'student_name', '') if enrollment_obj else '') or '',
                    'tr_count': int(req_data.get('tr_count') or req_data.get('tr') or 0),
                    'ms_count': int(req_data.get('ms_count') or req_data.get('ms') or 0),
                    'dg_count': int(req_data.get('dg_count') or req_data.get('dg') or 0),
                    'moi_count': int(req_data.get('moi_count') or req_data.get('moi') or 0),
                    'backlog_count': int(req_data.get('backlog_count') or req_data.get('backlog') or 0),
                    'pay_rec_no': getattr(docrec, 'pay_rec_no', None),
                    'doc_rec': docrec,
                    'doc_rec_remark': getattr(docrec, 'doc_rec_remark', None),
                    'status': VerificationStatus.IN_PROGRESS,
                }

                try:
                    if existing:
                        # Update fields on existing verification where provided
                        changed = False
                        for fld, val in vr_kwargs.items():
                            try:
                                if getattr(existing, fld, None) != val:
                                    setattr(existing, fld, val)
                                    changed = True
                            except Exception:
                                pass
                        if changed:
                            try:
                                existing.full_clean()
                            except Exception:
                                pass
                            existing.save()
                    else:
                        vr = Verification(**vr_kwargs)
                        try:
                            vr.full_clean()
                        except Exception:
                            # allow creation even if some fields missing; best-effort
                            pass
                        vr.save()
                except Exception:
                    # Best-effort: do not propagate verification creation errors
                    pass
        except Exception:
            # swallow any unexpected errors to keep DocRec creation robust
            pass
    def perform_update(self, serializer):
        """When a DocRec is updated via API, attempt to create/update the corresponding
        service row (Verification/Migration/Provisional/InstVerificationMain) if
        relevant data is present in the request. This is best-effort and will not
        block the update if service sync fails.
        """
        docrec = serializer.save()
        try:
            req_data = self.request.data if hasattr(self.request, 'data') else {}
            # If this is a verification docrec and enrollment or verification data provided,
            # try to create or update a Verification row linked to this DocRec.
            if getattr(docrec, 'apply_for', '').upper() == 'VR':
                enr_key = req_data.get('enrollment') or req_data.get('enrollment_no') or None
                # try to find existing verification linked to this docrec
                existing = Verification.objects.filter(doc_rec=docrec).first()
                if existing:
                    # update counts and student_name/pay_rec_no if provided
                    changed = False
                    for fld in ('student_name','tr_count','ms_count','dg_count','moi_count','backlog_count','pay_rec_no','doc_rec_remark','status'):
                        if fld in req_data:
                            val = req_data.get(fld)
                            try:
                                if getattr(existing, fld, None) != val:
                                    setattr(existing, fld, val)
                                    changed = True
                            except Exception:
                                pass
                    if changed:
                        try:
                            existing.full_clean()
                        except Exception:
                            pass
                        try:
                            existing.save()
                        except Exception:
                            pass
                else:
                    # no existing verification: attempt to create with enrollment_no string
                    enrollment_no_str = None
                    student_name_str = req_data.get('student_name') or ''
                    
                    # Resolve enrollment_no and student_name if enrollment key provided
                    if enr_key:
                        try:
                            sk = str(enr_key).strip()
                            enrollment_obj = None
                            if sk.isdigit():
                                enrollment_obj = Enrollment.objects.filter(id=int(sk)).first()
                            if not enrollment_obj:
                                enrollment_obj = Enrollment.objects.filter(enrollment_no__iexact=sk).first()
                            
                            if enrollment_obj:
                                enrollment_no_str = enrollment_obj.enrollment_no
                                if not student_name_str:
                                    student_name_str = getattr(enrollment_obj, 'student_name', '')
                        except Exception:
                            pass
                    
                    # Attempt to create a placeholder Verification with enrollment_no as string
                    try:
                        vr = Verification(
                            enrollment_no=enrollment_no_str,
                            student_name=student_name_str or '',
                            tr_count=int(req_data.get('tr_count') or req_data.get('tr') or 0) if req_data.get('tr_count') or req_data.get('tr') else None,
                            ms_count=int(req_data.get('ms_count') or req_data.get('ms') or 0) if req_data.get('ms_count') or req_data.get('ms') else None,
                            dg_count=int(req_data.get('dg_count') or req_data.get('dg') or 0) if req_data.get('dg_count') or req_data.get('dg') else None,
                            moi_count=int(req_data.get('moi_count') or req_data.get('moi') or 0) if req_data.get('moi_count') or req_data.get('moi') else None,
                            backlog_count=int(req_data.get('backlog_count') or req_data.get('backlog') or 0) if req_data.get('backlog_count') or req_data.get('backlog') else None,
                            pay_rec_no=getattr(docrec, 'pay_rec_no', None),
                            doc_rec=docrec,
                            doc_rec_date=getattr(docrec, 'doc_rec_date', timezone.now().date()),
                            status='IN_PROGRESS',
                        )
                        try:
                            vr.full_clean()
                        except Exception:
                            pass
                        vr.save()
                    except Exception:
                        pass
        except Exception:
            pass


class DataAnalysisView(APIView):
    """Provides data analysis across services. Supports service=Degree for degree analysis."""
    permission_classes = [IsAuthenticated]

    def get(self, request, *args, **kwargs):
        service = (request.query_params.get('service') or '').strip()
        if not service:
            return Response({'error': 'service parameter is required'}, status=400)

        if service.lower() == 'degree':
            return self._degree_analysis(request)

        return Response({'error': f'service {service} not supported'}, status=400)

    def _degree_analysis(self, request):
        """Degree-specific analysis: duplicates and summaries."""
        qs = StudentDegree.objects.all()

        # If caller requests records for a specific duplicate group, return them
        group_key = request.query_params.get('group_key')
        group_type = request.query_params.get('group_type')
        if group_key:
            # parse and return matching degree records for the given group_type/key
            try:
                # normalize group_type for robustness
                gt = (group_type or '').strip()
                if gt == 'DUPLICATE_ENROLL_NAME_MONTH_YEAR':
                    # key format: enrollment|name|month|year
                    parts = group_key.split('|')
                    enrollment = parts[0] if len(parts) > 0 else ''
                    name = parts[1] if len(parts) > 1 else ''
                    month = parts[2] if len(parts) > 2 else ''
                    year = parts[3] if len(parts) > 3 else ''
                    q = StudentDegree.objects.filter(enrollment_no__iexact=enrollment)
                    if name: q = q.filter(student_name_dg__iexact=name)
                    if month: q = q.filter(last_exam_month__iexact=month)
                    if year:
                        try:
                            q = q.filter(last_exam_year=int(year))
                        except Exception:
                            pass
                elif gt == 'ENROLLMENT_SAME_NAME_DIFFER':
                    enrollment = group_key
                    q = StudentDegree.objects.filter(enrollment_no__iexact=enrollment)
                elif gt == 'ENROLLMENT_NAME_DIFF_YEARS':
                    # key format: enrollment|name
                    parts = group_key.split('|')
                    enrollment = parts[0] if len(parts) > 0 else ''
                    name = parts[1] if len(parts) > 1 else ''
                    q = StudentDegree.objects.filter(enrollment_no__iexact=enrollment)
                    if name: q = q.filter(student_name_dg__iexact=name)
                elif gt == 'ENROLLMENT_NAME_DIFF_MONTHS':
                    # key format: enrollment|name
                    parts = group_key.split('|')
                    enrollment = parts[0] if len(parts) > 0 else ''
                    name = parts[1] if len(parts) > 1 else ''
                    q = StudentDegree.objects.filter(enrollment_no__iexact=enrollment)
                    if name: q = q.filter(student_name_dg__iexact=name)
                elif gt == 'NAME_SAME_DIFFERENT_ENROLLMENT':
                    name = group_key
                    q = StudentDegree.objects.filter(student_name_dg__iexact=name)
                else:
                    # fallback: try to search enrollment value
                    q = StudentDegree.objects.filter(enrollment_no__iexact=group_key)

                # return basic fields
                rows = list(q.values('id', 'dg_sr_no', 'enrollment_no', 'student_name_dg', 'last_exam_month', 'last_exam_year', 'convocation_no', 'degree_name', 'institute_name_dg'))
                return Response({'group_type': group_type, 'group_key': group_key, 'records': rows})
            except Exception as e:
                return Response({'error': str(e)}, status=500)

        # optional filters
        exam_month = request.query_params.get('exam_month')
        exam_year = request.query_params.get('exam_year')
        convocation_no = request.query_params.get('convocation_no')
        institute = request.query_params.get('institute')

        if exam_month:
            qs = qs.filter(last_exam_month__iexact=exam_month)
        if exam_year:
            try:
                qs = qs.filter(last_exam_year=int(exam_year))
            except Exception:
                pass
        if convocation_no:
            try:
                qs = qs.filter(convocation_no=int(convocation_no))
            except Exception:
                pass
        if institute:
            qs = qs.filter(institute_name_dg__icontains=institute)

        # Total records
        total = qs.count()

        issues = []

        # 1) Exact duplicates: enrollment + name + month + year
        dup_exact = (
            qs.values('enrollment_no', 'student_name_dg', 'last_exam_month', 'last_exam_year')
            .annotate(cnt=models.Count('id'))
            .filter(cnt__gt=1)
        )
        for g in dup_exact:
            key = f"{g['enrollment_no']}|{g.get('student_name_dg') or ''}|{g.get('last_exam_month') or ''}|{g.get('last_exam_year') or ''}"
            issues.append({
                'type': 'DUPLICATE_ENROLL_NAME_MONTH_YEAR',
                'key': key,
                'count': g['cnt'],
                'message': f"{g['cnt']} records with same enrollment+name+exam month+exam year"
            })

        # 2) Enrollment same but different names
        dup_enr_names = (
            qs.values('enrollment_no')
            .annotate(total=models.Count('id'), distinct_names=models.Count('student_name_dg', distinct=True))
            .filter(distinct_names__gt=1)
        )
        for g in dup_enr_names:
            issues.append({
                'type': 'ENROLLMENT_SAME_NAME_DIFFER',
                'key': g['enrollment_no'],
                'count': g['total'],
                'message': f"Enrollment {g['enrollment_no']} has {g['distinct_names']} different student names across {g['total']} records"
            })

        # 3) Enrollment+name same but different exam years
        dup_enr_name_year = (
            qs.values('enrollment_no', 'student_name_dg')
            .annotate(distinct_years=models.Count('last_exam_year', distinct=True), total=models.Count('id'))
            .filter(distinct_years__gt=1)
        )
        for g in dup_enr_name_year:
            key = f"{g['enrollment_no']}|{g.get('student_name_dg') or ''}"
            issues.append({
                'type': 'ENROLLMENT_NAME_DIFF_YEARS',
                'key': key,
                'count': g['total'],
                'message': f"Enrollment+Name {key} appears in multiple exam years ({g['distinct_years']})"
            })

        # 4) Enrollment+Name same but different exam months
        dup_enr_name_months = (
            qs.values('enrollment_no', 'student_name_dg')
            .annotate(distinct_months=models.Count('last_exam_month', distinct=True), total=models.Count('id'))
            .filter(distinct_months__gt=1)
        )
        for g in dup_enr_name_months:
            key = f"{g['enrollment_no']}|{g.get('student_name_dg') or ''}"
            issues.append({
                'type': 'ENROLLMENT_NAME_DIFF_MONTHS',
                'key': key,
                'count': g['total'],
                'message': f"Enrollment+Name {key} appears in multiple exam months ({g['distinct_months']})"
            })

        # 5) Same student name but different enrollment numbers (possible name-duplication)
        dup_name_diff_enr = (
            qs.values('student_name_dg')
            .annotate(distinct_enrollments=models.Count('enrollment_no', distinct=True), total=models.Count('id'))
            .filter(distinct_enrollments__gt=1)
        )
        for g in dup_name_diff_enr:
            key = g.get('student_name_dg') or ''
            issues.append({
                'type': 'NAME_SAME_DIFFERENT_ENROLLMENT',
                'key': key,
                'count': g['total'],
                'message': f"Student name '{key}' appears across {g['distinct_enrollments']} different enrollment numbers"
            })

        # Summaries
        by_convocation = list(qs.values('convocation_no').annotate(count=models.Count('id')).order_by('-convocation_no'))
        by_degree = list(qs.values('degree_name').annotate(count=models.Count('id')).order_by('-count'))
        by_institute = list(qs.values('institute_name_dg').annotate(count=models.Count('id')).order_by('-count'))
        by_year = list(qs.values('last_exam_year').annotate(count=models.Count('id')).order_by('-last_exam_year'))
        by_month = list(qs.values('last_exam_month').annotate(count=models.Count('id')).order_by('-count'))

        # Missing / special cases
        missing_convocation_count = qs.filter(models.Q(convocation_no__isnull=True) | models.Q(convocation_no='')).count()
        missing_exam_count = qs.filter(models.Q(last_exam_month__isnull=True) | models.Q(last_exam_month='') | models.Q(last_exam_year__isnull=True)).count()

        if missing_convocation_count:
            issues.append({
                'type': 'MISSING_CONVOCATION',
                'key': 'MISSING_CONVOCATION',
                'count': missing_convocation_count,
                'message': f"{missing_convocation_count} degree records have no convocation assignment"
            })

        if missing_exam_count:
            issues.append({
                'type': 'MISSING_EXAM_MONTH_OR_YEAR',
                'key': 'MISSING_EXAM_MONTH_OR_YEAR',
                'count': missing_exam_count,
                'message': f"{missing_exam_count} degree records are missing exam month or exam year"
            })

        # Duplicate degree serial numbers (dg_sr_no)
        dup_dg_sr = (
            qs.values('dg_sr_no')
            .annotate(cnt=models.Count('id'))
            .filter(cnt__gt=1)
        )
        for g in dup_dg_sr:
            key = g.get('dg_sr_no') or ''
            issues.append({
                'type': 'DUPLICATE_DG_SR_NO',
                'key': key,
                'count': g['cnt'],
                'message': f"{g['cnt']} records share the same degree serial number '{key}'"
            })

        # Allow caller to request specific analysis types
        analysis_param = request.query_params.get('analysis')
        if analysis_param:
            requested = {a.strip().upper() for a in analysis_param.split(',') if a.strip()}
            issues = [it for it in issues if it.get('type') in requested]

        response = {
            'service': 'Degree',
            'total_records': total,
            'duplicate_groups': len(dup_exact) + len(dup_enr_names) + len(dup_enr_name_year) + len(dup_enr_name_months) + len(dup_name_diff_enr) + len(dup_dg_sr),
            'records_with_duplicates': sum([g['cnt'] for g in dup_exact]) if dup_exact else 0,
            'filters_applied': {
                'exam_month': exam_month,
                'exam_year': exam_year,
                'convocation_no': convocation_no,
                'institute': institute,
            },
            'duplicates': issues,
            'statistics': {
                'by_convocation': by_convocation,
                'by_degree_name': by_degree,
                'by_institute': by_institute,
                'by_year': by_year,
                'by_month': by_month,
                'missing_convocation_count': missing_convocation_count,
                'missing_exam_count': missing_exam_count,
            }
        }

        return Response(response)

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

    @action(detail=False, methods=["post"], url_path="update-with-verification")
    def update_with_verification(self, request):
        """Atomic update of DocRec and related Verification.
        Expects: { doc_rec_id, doc_rec_data, verification_data }
        """
        from django.db import transaction
        doc_rec_id = request.data.get('doc_rec_id')
        doc_rec_data = request.data.get('doc_rec_data', {})
        verification_data = request.data.get('verification_data', {})
        
        if not doc_rec_id:
            return Response({"detail": "doc_rec_id is required"}, status=400)
        
        try:
            with transaction.atomic():
                # Fetch DocRec
                doc_rec = DocRec.objects.filter(doc_rec_id=doc_rec_id).first()
                if not doc_rec:
                    return Response({"detail": "DocRec not found"}, status=404)
                
                # Update DocRec fields
                for key, value in doc_rec_data.items():
                    if hasattr(doc_rec, key):
                        setattr(doc_rec, key, value)
                doc_rec.save()
                
                # Fetch related Verification
                verification = Verification.objects.filter(doc_rec__doc_rec_id=doc_rec_id).first()
                if verification:
                    # Update Verification fields
                    for key, value in verification_data.items():
                        if hasattr(verification, key):
                            setattr(verification, key, value)
                    if request.user and request.user.is_authenticated:
                        verification.updatedby = request.user
                    verification.save()
                
                return Response({
                    "detail": "Updated successfully",
                    "doc_rec_id": doc_rec.doc_rec_id,
                    "verification_id": verification.id if verification else None
                })
        except Exception as e:
            return Response({"detail": str(e)}, status=500)

    @action(detail=False, methods=["post"], url_path="delete-with-verification")
    def delete_with_verification(self, request):
        """Atomic delete of DocRec and related Verification.
        Expects: { doc_rec_id }
        """
        from django.db import transaction
        doc_rec_id = request.data.get('doc_rec_id')
        
        if not doc_rec_id:
            return Response({"detail": "doc_rec_id is required"}, status=400)
        
        try:
            with transaction.atomic():
                # Delete Verification first (due to FK constraint)
                verification_count = Verification.objects.filter(doc_rec__doc_rec_id=doc_rec_id).delete()[0]
                
                # Delete DocRec
                doc_rec = DocRec.objects.filter(doc_rec_id=doc_rec_id).first()
                if not doc_rec:
                    return Response({"detail": "DocRec not found"}, status=404)
                doc_rec.delete()
                
                return Response({
                    "detail": "Deleted successfully",
                    "doc_rec_id": doc_rec_id,
                    "verification_deleted": verification_count > 0
                }, status=200)
        except Exception as e:
            return Response({"detail": str(e)}, status=500)

    @action(detail=False, methods=["post"], url_path="unified-update")
    def unified_update(self, request):
        """Unified update for DocRec and any related service (VR/PR/MG/IV).
        Expects: { 
            doc_rec_id, 
            doc_rec: {...}, 
            service: {...}, 
            service_type: "VR"|"PR"|"MG"|"IV" 
        }
        """
        from django.db import transaction
        doc_rec_id = request.data.get('doc_rec_id')
        doc_rec_data = request.data.get('doc_rec', {})
        service_data = request.data.get('service', {})
        service_type = (request.data.get('service_type') or '').strip().upper()
        
        if not doc_rec_id:
            return Response({"detail": "doc_rec_id is required"}, status=400)
        if not service_type or service_type not in ['VR', 'PR', 'MG', 'IV']:
            return Response({"detail": "service_type must be VR, PR, MG, or IV"}, status=400)
        
        try:
            with transaction.atomic():
                # Update DocRec
                doc_rec = DocRec.objects.filter(doc_rec_id=doc_rec_id).first()
                if not doc_rec:
                    return Response({"detail": "DocRec not found"}, status=404)
                
                for key, value in doc_rec_data.items():
                    if hasattr(doc_rec, key):
                        setattr(doc_rec, key, value)
                doc_rec.save()
                
                # Update corresponding service
                service_obj = None
                service_id = None
                
                if service_type == 'VR':
                    service_obj = Verification.objects.filter(doc_rec__doc_rec_id=doc_rec_id).first()
                    if service_obj:
                        for key, value in service_data.items():
                            if hasattr(service_obj, key):
                                setattr(service_obj, key, value)
                        if request.user and request.user.is_authenticated:
                            service_obj.updatedby = request.user
                        service_obj.save()
                        service_id = service_obj.id
                
                elif service_type == 'MG':
                    service_obj = MigrationRecord.objects.filter(doc_rec=doc_rec_id).first()
                    if service_obj:
                        for key, value in service_data.items():
                            if hasattr(service_obj, key):
                                setattr(service_obj, key, value)
                        service_obj.save()
                        service_id = service_obj.id
                
                elif service_type == 'PR':
                    service_obj = ProvisionalRecord.objects.filter(doc_rec=doc_rec_id).first()
                    if service_obj:
                        for key, value in service_data.items():
                            if hasattr(service_obj, key):
                                setattr(service_obj, key, value)
                        service_obj.save()
                        service_id = service_obj.id
                
                elif service_type == 'IV':
                    service_obj = InstVerificationMain.objects.filter(doc_rec=doc_rec_id).first()
                    if service_obj:
                        for key, value in service_data.items():
                            if hasattr(service_obj, key):
                                setattr(service_obj, key, value)
                        service_obj.save()
                        service_id = service_obj.id
                
                return Response({
                    "detail": "Updated successfully",
                    "doc_rec_id": doc_rec.doc_rec_id,
                    "service_type": service_type,
                    "service_id": service_id,
                    "service_found": service_obj is not None
                })
        except Exception as e:
            return Response({"detail": str(e)}, status=500)

    @action(detail=False, methods=["post"], url_path="unified-delete")
    def unified_delete(self, request):
        """Unified delete for DocRec and any related service.
        Expects: { 
            doc_rec_id, 
            service_type: "VR"|"PR"|"MG"|"IV" 
        }
        """
        from django.db import transaction
        doc_rec_id = request.data.get('doc_rec_id')
        service_type = (request.data.get('service_type') or '').strip().upper()
        
        if not doc_rec_id:
            return Response({"detail": "doc_rec_id is required"}, status=400)
        if not service_type or service_type not in ['VR', 'PR', 'MG', 'IV']:
            return Response({"detail": "service_type must be VR, PR, MG, or IV"}, status=400)
        
        try:
            with transaction.atomic():
                service_deleted = False
                
                # Delete service record first
                if service_type == 'VR':
                    count = Verification.objects.filter(doc_rec__doc_rec_id=doc_rec_id).delete()[0]
                    service_deleted = count > 0
                elif service_type == 'MG':
                    count = MigrationRecord.objects.filter(doc_rec=doc_rec_id).delete()[0]
                    service_deleted = count > 0
                elif service_type == 'PR':
                    count = ProvisionalRecord.objects.filter(doc_rec=doc_rec_id).delete()[0]
                    service_deleted = count > 0
                elif service_type == 'IV':
                    # Delete students first, then main
                    InstVerificationStudent.objects.filter(main_verification__doc_rec=doc_rec_id).delete()
                    count = InstVerificationMain.objects.filter(doc_rec=doc_rec_id).delete()[0]
                    service_deleted = count > 0
                
                # Delete DocRec
                doc_rec = DocRec.objects.filter(doc_rec_id=doc_rec_id).first()
                if not doc_rec:
                    return Response({"detail": "DocRec not found"}, status=404)
                doc_rec.delete()
                
                return Response({
                    "detail": "Deleted successfully",
                    "doc_rec_id": doc_rec_id,
                    "service_type": service_type,
                    "service_deleted": service_deleted
                }, status=200)
        except Exception as e:
            return Response({"detail": str(e)}, status=500)


class VerificationViewSet(viewsets.ModelViewSet):
    # enrollment_no and second_enrollment_id are now CharField, not FK - remove select_related
    queryset = Verification.objects.order_by('-id')
    serializer_class = VerificationSerializer
    permission_classes = [IsAuthenticated]

    def get_queryset(self):
        qs = super().get_queryset()
        # Allow filtering by related DocRec identifier when called from DocReceive UI
        try:
            doc_rec_param = self.request.query_params.get('doc_rec') or self.request.query_params.get('doc_rec_id')
        except Exception:
            doc_rec_param = None
        if doc_rec_param:
            qs = qs.filter(doc_rec__doc_rec_id=doc_rec_param)
        
        search = self.request.query_params.get('search', '').strip()
        if search:
            # Use PostgreSQL Full-Text Search (FTS) for 100× faster search
            # Falls back to normalized search if FTS not available
            qs = apply_fts_search(
                queryset=qs,
                search_query=search,
                search_fields=['search_vector'],  # FTS field
                fallback_fields=['enrollment_no', 'student_name', 'final_no']
            )
        
        # Performance optimization: if no search, include PENDING + IN_PROGRESS with latest records
        # This ensures important records are always visible on page load
        include_pending = self.request.query_params.get('include_pending', '').lower() == 'true'
        if not search and not doc_rec_param and include_pending:
            # Get latest records + all PENDING/IN_PROGRESS
            pending_qs = Verification.objects.filter(status__in=['PENDING', 'IN_PROGRESS']).order_by('-id')
            # Combine with latest records (union removes duplicates)
            qs = (qs | pending_qs).distinct().order_by('-id')
        
        return qs

    @action(detail=False, methods=["post"], url_path="update-service-only")
    def update_service_only(self, request):
        """
        Update only the Verification record without modifying DocRec.
        Use this from the verification page when editing service details only.
        
        Payload: { "id": 123, "enrollment_no": "...", "student_name": "...", ... }
        """
        verification_id = request.data.get("id")
        if not verification_id:
            return Response({"error": "Verification id is required"}, status=status.HTTP_400_BAD_REQUEST)

        try:
            verification = Verification.objects.get(id=verification_id)
        except Verification.DoesNotExist:
            return Response({"error": "Verification not found"}, status=status.HTTP_404_NOT_FOUND)

        # Update with provided data
        serializer = VerificationSerializer(verification, data=request.data, partial=True)
        if serializer.is_valid():
            serializer.save()
            return Response({
                "message": "Verification updated successfully",
                "id": verification.id,
                "doc_rec_id": verification.doc_rec_id
            }, status=status.HTTP_200_OK)
        return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)


class MigrationRecordViewSet(viewsets.ModelViewSet):
    # doc_rec is stored as a plain varchar (doc_rec_id string) so do not select_related it
    queryset = MigrationRecord.objects.select_related('enrollment', 'institute').order_by('-id')
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

    @action(detail=False, methods=["post"], url_path="update-service-only")
    def update_service_only(self, request):
        """
        Update only the MigrationRecord without modifying DocRec.
        Use this from the migration page when editing service details only.
        
        Payload: { "id": 123, "enrollment": ..., "student_name": "...", ... }
        """
        migration_id = request.data.get("id")
        if not migration_id:
            return Response({"error": "Migration record id is required"}, status=status.HTTP_400_BAD_REQUEST)

        try:
            migration = MigrationRecord.objects.get(id=migration_id)
        except MigrationRecord.DoesNotExist:
            return Response({"error": "Migration record not found"}, status=status.HTTP_404_NOT_FOUND)

        # Update with provided data
        serializer = MigrationRecordSerializer(migration, data=request.data, partial=True)
        if serializer.is_valid():
            serializer.save()
            return Response({
                "message": "Migration record updated successfully",
                "id": migration.id,
                "doc_rec_id": migration.doc_rec
            }, status=status.HTTP_200_OK)
        return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)


class ProvisionalRecordViewSet(viewsets.ModelViewSet):
    # `doc_rec` is stored as a plain varchar in DB (not a FK), so avoid select_related on it.
    queryset = ProvisionalRecord.objects.select_related('enrollment', 'institute').order_by('-id')
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

    @action(detail=False, methods=["post"], url_path="update-service-only")
    def update_service_only(self, request):
        """
        Update only the ProvisionalRecord without modifying DocRec.
        Use this from the provisional page when editing service details only.
        
        Payload: { "id": 123, "enrollment": ..., "student_name": "...", ... }
        """
        provisional_id = request.data.get("id")
        if not provisional_id:
            return Response({"error": "Provisional record id is required"}, status=status.HTTP_400_BAD_REQUEST)

        try:
            provisional = ProvisionalRecord.objects.get(id=provisional_id)
        except ProvisionalRecord.DoesNotExist:
            return Response({"error": "Provisional record not found"}, status=status.HTTP_404_NOT_FOUND)

        # Update with provided data
        serializer = ProvisionalRecordSerializer(provisional, data=request.data, partial=True)
        if serializer.is_valid():
            serializer.save()
            return Response({
                "message": "Provisional record updated successfully",
                "id": provisional.id,
                "doc_rec_id": provisional.doc_rec
            }, status=status.HTTP_200_OK)
        return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)


class InstVerificationMainViewSet(viewsets.ModelViewSet):
    queryset = InstVerificationMain.objects.select_related('doc_rec', 'institute').order_by('-id')
    serializer_class = InstVerificationMainSerializer
    permission_classes = [IsAuthenticated]

    def get_queryset(self):
        qs = super().get_queryset()
        params = getattr(self.request, 'query_params', {})

        doc_rec_param = None
        iv_record_no_param = None
        inst_veri_number_param = None

        try:
            doc_rec_param = params.get('doc_rec') or params.get('doc_rec_id')
        except Exception:
            doc_rec_param = None
        try:
            iv_record_no_param = params.get('iv_record_no')
        except Exception:
            iv_record_no_param = None
        try:
            inst_veri_number_param = params.get('inst_veri_number')
        except Exception:
            inst_veri_number_param = None

        if doc_rec_param:
            qs = qs.filter(doc_rec__doc_rec_id=doc_rec_param)
        if iv_record_no_param:
            try:
                qs = qs.filter(iv_record_no=int(str(iv_record_no_param).strip()))
            except Exception:
                qs = qs.filter(iv_record_no=iv_record_no_param)
        if inst_veri_number_param:
            qs = qs.filter(inst_veri_number=inst_veri_number_param)

        search = params.get('search', '').strip() if hasattr(params, 'get') else ''
        if search:
            # Use PostgreSQL Full-Text Search (100× faster)
            # Falls back to normalized search if FTS not available
            qs = apply_fts_search(
                queryset=qs,
                search_query=search,
                search_fields=['search_vector'],  # FTS field
                fallback_fields=['inst_veri_number', 'rec_inst_name', 'inst_ref_no']
            )
        return qs

    @action(detail=False, methods=["get"], url_path="search-rec-inst")
    def search_rec_inst(self, request):
        """Autocomplete for rec_inst_name by prefix (min 3 chars)."""
        q = request.query_params.get('q', '').strip()
        if len(q) < 3:
            return Response([], status=200)
        qs = self.queryset.filter(rec_inst_name__icontains=q)[:20]
        return Response([{ 'id': x.id, 'name': x.rec_inst_name } for x in qs], status=200)

    @action(detail=False, methods=["post"], url_path="update-service-only")
    def update_service_only(self, request):
        """
        Update only the InstVerificationMain record without modifying DocRec.
        Use this from the inst-verification page when editing service details only.
        
        Payload: { "id": 123, "inst_veri_number": "...", "rec_inst_name": "...", ... }
        """
        inst_verification_id = request.data.get("id")
        if not inst_verification_id:
            return Response({"error": "InstVerificationMain id is required"}, status=status.HTTP_400_BAD_REQUEST)

        try:
            inst_verification = InstVerificationMain.objects.get(id=inst_verification_id)
        except InstVerificationMain.DoesNotExist:
            return Response({"error": "InstVerificationMain not found"}, status=status.HTTP_404_NOT_FOUND)

        # Update with provided data
        serializer = InstVerificationMainSerializer(inst_verification, data=request.data, partial=True)
        if serializer.is_valid():
            serializer.save()
            return Response({
                "message": "InstVerificationMain updated successfully",
                "id": inst_verification.id,
                "doc_rec_id": inst_verification.doc_rec.doc_rec_id if inst_verification.doc_rec else None
            }, status=status.HTTP_200_OK)
        return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)

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
    
    def get_queryset(self):
        """Allow filtering students by the parent doc_rec identifier.
        Supports query params:
          - doc_rec: the DocRec.doc_rec_id string (preferred)
          - doc_rec_id: alias for doc_rec
        Returns the base queryset filtered when these params are present.
        """
        qs = super().get_queryset()
        req = self.request
        if not req:
            return qs
        doc_rec_param = req.query_params.get('doc_rec') or req.query_params.get('doc_rec_id')
        if doc_rec_param:
            # doc_rec is a FK to DocRec using to_field='doc_rec_id', so filter via the related field
            return qs.filter(doc_rec__doc_rec_id=doc_rec_param)
        return qs
    def create(self, request, *args, **kwargs):
        # If an enrollment identifier is provided, attempt to resolve the Enrollment
        # and copy institute/main/subcourse fields onto the student record so that
        # data created via API matches the behaviour of the bulk importer.
        data = request.data.copy() if hasattr(request, 'data') else {}
        enr_key = data.get('enrollment') or data.get('enrollment_no') or data.get('enrollment_no_text')
        try:
            if enr_key:
                enr_obj = Enrollment.objects.filter(enrollment_no__iexact=str(enr_key).strip()).first()
                if enr_obj:
                    if getattr(enr_obj, 'institute', None):
                        data['institute'] = getattr(enr_obj.institute, 'id', None) or getattr(enr_obj.institute, 'pk', None)
                    if getattr(enr_obj, 'maincourse', None):
                        data['main_course'] = getattr(enr_obj.maincourse, 'id', None) or getattr(enr_obj.maincourse, 'pk', None)
                    if getattr(enr_obj, 'subcourse', None):
                        data['sub_course'] = getattr(enr_obj.subcourse, 'id', None) or getattr(enr_obj.subcourse, 'pk', None)
        except Exception:
            # best-effort: do not fail creation if sync fails
            pass
        serializer = self.get_serializer(data=data)
        serializer.is_valid(raise_exception=True)
        self.perform_create(serializer)
        headers = self.get_success_headers(serializer.data)
        return Response(serializer.data, status=status.HTTP_201_CREATED, headers=headers)

    def update(self, request, *args, **kwargs):
        partial = kwargs.pop('partial', False)
        instance = self.get_object()
        data = request.data.copy() if hasattr(request, 'data') else {}
        enr_key = data.get('enrollment') or data.get('enrollment_no') or data.get('enrollment_no_text')
        try:
            if enr_key:
                enr_obj = Enrollment.objects.filter(enrollment_no__iexact=str(enr_key).strip()).first()
                if enr_obj:
                    if getattr(enr_obj, 'institute', None):
                        data['institute'] = getattr(enr_obj.institute, 'id', None) or getattr(enr_obj.institute, 'pk', None)
                    if getattr(enr_obj, 'maincourse', None):
                        data['main_course'] = getattr(enr_obj.maincourse, 'id', None) or getattr(enr_obj.maincourse, 'pk', None)
                    if getattr(enr_obj, 'subcourse', None):
                        data['sub_course'] = getattr(enr_obj.subcourse, 'id', None) or getattr(enr_obj.subcourse, 'pk', None)
        except Exception:
            pass
        serializer = self.get_serializer(instance, data=data, partial=partial)
        serializer.is_valid(raise_exception=True)
        self.perform_update(serializer)
        return Response(serializer.data)


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
    INSTITUTIONAL_VERIFICATION = 'INSTITUTIONAL_VERIFICATION'


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
            # pandas Timestamp -> python date
            if isinstance(val, pd.Timestamp):
                try:
                    py_dt = val.to_pydatetime()
                    if getattr(py_dt, 'tzinfo', None) is not None:
                        py_dt = py_dt.replace(tzinfo=None)
                    return py_dt.date()
                except Exception:
                    return None
            # If numeric and large, it's likely an Excel serial date (e.g., 42552)
            try:
                if isinstance(val, (int, float)) and float(val) > 1000:
                    try:
                        parsed = pd.to_datetime(val, unit='D', origin='1899-12-30', errors='coerce')
                        if not pd.isna(parsed):
                            py_dt = parsed.to_pydatetime()
                            if getattr(py_dt, 'tzinfo', None) is not None:
                                py_dt = py_dt.replace(tzinfo=None)
                            return py_dt.date()
                    except Exception:
                        pass
            except Exception:
                pass
            # Fallback generic parse
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

def _safe_num(val, default=0):
    """Coerce a value to a float (or numeric) but treat pandas NA/'nan'/NaN as missing.
    Returns default when the value is None, empty string, or not a valid number.
    """
    try:
        import pandas as _pd
    except Exception:
        _pd = None
    # None or empty
    if val is None:
        return default
    if isinstance(val, str):
        s = val.strip()
        if s == "":
            return default
        # treat literal strings that represent missing values
        if s.lower() in ("nan", "nat", "none", "<na>"):
            return default
    # pandas NA/NaT/NaN
    try:
        if _pd is not None and _pd.isna(val):
            return default
    except Exception:
        pass
    # numeric conversion
    try:
        f = float(val)
        # guard against IEEE NaN/Inf
        import math
        if math.isnan(f) or f == float('inf') or f == float('-inf'):
            return default
        return f
    except Exception:
        return default

def _normalize_month_year(val):
    """Normalize month-year values to format 'Mon-YYYY' (e.g., 'Apr-2010', 'Jul-2016').
    Accepts pandas Timestamps, datetime/date, or strings like 'Apr-2010', 'Jul-16', '2010-04-01'."""
    if val is None:
        return None
    try:
        import pandas as _pd
    except Exception:
        _pd = None
    try:
        # handle pandas Timestamp or datetime
        if _pd is not None and isinstance(val, _pd.Timestamp):
            dt = val.to_pydatetime()
            return dt.strftime('%b-%Y').upper()
        import datetime as _dt
        if isinstance(val, (_dt.date, _dt.datetime)):
            return val.strftime('%b-%Y').upper()
        # Handle Excel serial numbers (e.g., 42552) which pandas may present as numeric
        try:
            # integers or floats that look like Excel serial dates
            if isinstance(val, (int, float)):
                # treat values > 1000 as possible Excel serials
                if float(val) > 1000:
                    if _pd is not None:
                        try:
                            parsed = _pd.to_datetime(val, unit='D', origin='1899-12-30')
                            if not _pd.isna(parsed):
                                return parsed.to_pydatetime().strftime('%b-%Y').upper()
                        except Exception:
                            pass
                    else:
                        # fallback using Excel epoch: 1899-12-30
                        try:
                            base = _dt.datetime(1899, 12, 30)
                            parsed = base + _dt.timedelta(days=int(val))
                            return parsed.strftime('%b-%Y').upper()
                        except Exception:
                            pass
        except Exception:
            pass
        s = str(val).strip()
        if s == '' or s.lower() in ('nan', 'none', '<na>'):
            return None
        # Try common formats
        for fmt in ('%b-%y', '%b-%Y', '%B-%Y', '%m-%Y', '%Y-%m-%d', '%Y'):
            try:
                parsed = _dt.datetime.strptime(s, fmt)
                return parsed.strftime('%b-%Y')
            except Exception:
                continue
        # Try pandas parser as a fallback
        if _pd is not None:
            try:
                parsed = _pd.to_datetime(s, errors='coerce', dayfirst=True)
                if not _pd.isna(parsed):
                    dt = parsed.to_pydatetime()
                    return dt.strftime('%b-%Y').upper()
            except Exception:
                pass
        # Try regex for patterns like 'Jul-16' or 'Apr 2010'
        import re
        m = re.search(r'([A-Za-z]{3,9})[\s\-_/]*(\d{2,4})', s)
        if m:
            mon = m.group(1)[:3].upper()
            yr = m.group(2)
            if len(yr) == 2:
                # interpret two-digit years as 2000s if reasonable
                yy = int(yr)
                yr = f"{2000+yy:04d}" if yy < 100 else yr
            return f"{mon}-{yr}"
    except Exception:
        pass
    return str(val)


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
            BulkService.INSTITUTIONAL_VERIFICATION: [
                # Main fields
                "doc_rec_id","inst_veri_number","inst_veri_date","rec_inst_name","rec_inst_address_1","rec_inst_address_2",
                "rec_inst_location","rec_inst_city","rec_inst_pin","rec_inst_email","rec_by","doc_rec_date","inst_ref_no","ref_date","institute_id",
                # Student-level fields (if provided per-row)
                "sr_no","student_name","iv_degree_name","type_of_credential","month_year","verification_status","enrollment_no","maincourse_id","subcourse_id",
            ],
            BulkService.ENROLLMENT: [
                "student_name","institute_id","batch","enrollment_date","subcourse_id","maincourse_id","enrollment_no","temp_enroll_no","admission_date"
            ],
            BulkService.MIGRATION: [
                "doc_rec_id","enrollment_no","student_name","institute_id","maincourse_id","subcourse_id","mg_number","mg_date","exam_year","admission_year","exam_details","mg_status","pay_rec_no"
            ],
            BulkService.PROVISIONAL: [
                "doc_rec_id","enrollment_no","student_name","institute_id","maincourse_id","subcourse_id","prv_number","prv_date","class_obtain","prv_degree_name","passing_year","prv_status","pay_rec_no"
            ],
            BulkService.VERIFICATION: [
                "doc_rec_id","date","enrollment_no","second_enrollment_no","student_name","no_of_transcript","no_of_marksheet","no_of_degree","no_of_moi","no_of_backlog","status","final_no","pay_rec_no"
            ],
            BulkService.DEGREE: None,
            BulkService.EMP_PROFILE: [
                "emp_id","emp_name","emp_designation","username","usercode","actual_joining","emp_birth_date","usr_birth_date","department_joining","institute_id","status","el_balance","sl_balance","cl_balance","vacation_balance",
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
                elif 'username' in lc:
                    example[c] = 'jdoe'
                elif 'usercode' in lc:
                    example[c] = 'EMP001'
                elif 'joining' in lc and 'date' in lc or lc in ('actual_joining',):
                    example[c] = today.strftime('%Y-%m-%d')
                elif 'birth' in lc and 'date' in lc or 'birth_date' in lc:
                    example[c] = (today.replace(year=today.year-30)).strftime('%Y-%m-%d')
                elif 'department' in lc:
                    example[c] = 'HR'
                elif 'institute' in lc:
                    example[c] = 'INST01'
                elif 'prv_degree_name' in lc or 'degree' in lc:
                    example[c] = 'B.Sc Computer Science'
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

    def _process_confirm(self, service, df, user, track_id=None, auto_create_docrec=False, selected_cols=None):  # noqa: C901
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

        def _normalize_prv_number(val):
            """Return a canonical string for prv_number: strip trailing .0 from floats and numeric strings."""
            if val is None:
                return None
            try:
                # numpy/pandas numeric types
                import numpy as _np
                if isinstance(val, _np.generic):
                    val = val.item()
            except Exception:
                pass
            # numeric types
            try:
                if isinstance(val, (int,)):
                    return str(val)
                if isinstance(val, float):
                    if val.is_integer():
                        return str(int(val))
                    return str(val)
            except Exception:
                pass
            # string-like
            try:
                s = str(val).strip()
                # common Excel float representation like '2656.0'
                if s.endswith('.0') and s.replace('.', '', 1).isdigit():
                    return s.split('.')[0]
                # if it's numeric with decimal but integer-valued
                try:
                    f = float(s)
                    if f.is_integer():
                        return str(int(f))
                except Exception:
                    pass
                return s
            except Exception:
                return str(val)

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
                                except Exception as e:
                                    # Record failure for this student row so the upload log shows the reason
                                    try:
                                        key_ident = s.get('enrollment') or s.get('sr_no') or None
                                        _log(idx, key_ident or doc_rec_id_raw, f"Student create/update error: {e}", False)
                                    except Exception:
                                        _log(idx, doc_rec_id_raw, "Student create/update error (exception while logging)", False)
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

                        # If doc_rec is missing and the caller asked for auto-creation, try to create it
                        if not doc_rec and auto_create_docrec:
                            try:
                                create_key = str(doc_rec_id_raw).strip() if doc_rec_id_raw else None
                                if create_key:
                                    doc_rec = DocRec.objects.create(doc_rec_id=create_key, apply_for='MG', created_by=user)
                                else:
                                    doc_rec = DocRec.objects.create(apply_for='MG', created_by=user)
                            except Exception:
                                # creation failed - leave doc_rec as None and fall through to missing handling
                                doc_rec = None

                        # Normalize mg_status early and determine if this is a CANCEL row so that
                        # CANCEL rows can be treated with relaxed requirements (they shouldn't
                        # require institute/main/sub even if those columns were selected).
                        mg_status_raw_local = _clean_cell(row.get("mg_status")) or ''
                        try:
                            mg_status_local = str(mg_status_raw_local).strip().upper() if mg_status_raw_local is not None else ''
                        except Exception:
                            mg_status_local = ''
                        if mg_status_local == '':
                            mg_status_local = 'ISSUED'
                            mg_status_raw_local = 'ISSUED'
                        is_cancel_local = (mg_status_local == 'CANCEL')

                        # Determine which related fields are actually required based on what the
                        # client selected. If the client included enrollment_no then enrollment is
                        # required; otherwise, we can accept missing enrollment if institute/main/sub
                        # can be derived. Conversely, if institute/main/sub columns were included
                        # but blank, treat them as missing. For CANCEL rows, relax institute/main/sub
                        # requirements even if those columns were selected.
                        missing = []
                        sel = selected_cols or []
                        # doc_rec: still required unless auto-created earlier
                        if not doc_rec:
                            missing.append('doc_rec')
                        # enrollment required only if explicitly selected and not a CANCEL row
                        if ('enrollment_no' in sel) and not enr and (not is_cancel_local):
                            missing.append('enrollment')
                        # institute/main/sub: for non-cancel rows, treat as missing if not resolved
                        # AND either the corresponding column was selected or enrollment was not
                        # present (so we can't fallback). For CANCEL rows, do not require these
                        # even if selected.
                        if (not is_cancel_local):
                            if not inst and (('institute_id' in sel) or (not enr)):
                                missing.append('institute')
                            if not main and (('maincourse_id' in sel) or (not enr)):
                                missing.append('main')
                            if not sub and (('subcourse_id' in sel) or (not enr)):
                                missing.append('sub')
                        if missing:
                            # Provide attempted keys in the message to aid debugging
                            msg = f"Missing related ({'/'.join(missing)}) -- tried doc_rec='{doc_rec_id_raw}', enrollment_no='{enr_key}'"
                            _log(idx, row.get("mg_number"), msg, False)
                            _cache_progress(idx+1)
                            continue
                        # Only require mg_date when the upload included that column (or
                        # the client explicitly selected it) and the record is not a CANCEL.
                        # Use canonicalized selected_cols (if provided) so synonym names
                        # from the UI map correctly. Reuse earlier computed is_cancel_local.
                        is_cancel = is_cancel_local
                        sel = selected_cols or []
                        try:
                            mg_date_present = ('mg_date' in sel) if sel else ('mg_date' in df.columns)
                        except Exception:
                            mg_date_present = ('mg_date' in df.columns)
                        mg_date = _parse_excel_date_safe(row.get("mg_date")) if mg_date_present else None
                        if (not is_cancel_local) and mg_date_present and mg_date is None:
                            _log(idx, row.get("mg_number"), "Missing mg_date", False)
                            _cache_progress(idx+1)
                            continue
                        # Upsert pattern: prefer get/create then update attributes selectively.
                        mg_num_val = str(row.get("mg_number")).strip()
                        existing = MigrationRecord.objects.filter(mg_number=mg_num_val).first()

                        # Prepare candidate values but only include them when not None to avoid
                        # writing explicit NULL into non-nullable fields.
                        candidate = {}
                        if doc_rec is not None:
                            # store the doc_rec_id string (doc_rec may be a DocRec object)
                            candidate['doc_rec'] = (doc_rec.doc_rec_id if getattr(doc_rec, 'doc_rec_id', None) else (doc_rec if isinstance(doc_rec, str) else None))
                        if enr is not None:
                            candidate['enrollment'] = enr
                        # student_name: prefer sheet value, fallback to enrollment
                        sn = _clean_cell(row.get("student_name"))
                        if sn is not None:
                            candidate['student_name'] = sn
                        elif enr and getattr(enr, 'student_name', None):
                            candidate['student_name'] = enr.student_name
                        if inst is not None:
                            candidate['institute'] = inst
                        if main is not None:
                            candidate['maincourse'] = main
                        if sub is not None:
                            candidate['subcourse'] = sub
                        if mg_date is not None:
                            candidate['mg_date'] = mg_date
                        # exam/admission year: only include if present in dataframe
                        exam_year_val = None
                        admission_year_val = None
                        try:
                            if ('exam_year' in sel) if sel else ('exam_year' in df.columns):
                                exam_year_val = _clean_cell(row.get('exam_year'))
                        except Exception:
                            exam_year_val = _clean_cell(row.get('exam_year'))
                        try:
                            if ('admission_year' in sel) if sel else ('admission_year' in df.columns):
                                admission_year_val = _clean_cell(row.get('admission_year'))
                        except Exception:
                            admission_year_val = _clean_cell(row.get('admission_year'))
                        if exam_year_val is not None:
                            candidate['exam_year'] = exam_year_val
                        if admission_year_val is not None:
                            candidate['admission_year'] = admission_year_val
                        if ('exam_details' in sel) if sel else ('exam_details' in df.columns):
                            ed = _clean_cell(row.get('exam_details'))
                            if ed is not None:
                                candidate['exam_details'] = ed
                        # mg_status: normalize common variants (case-insensitive)
                        # and prefer provided value; default to PENDING.
                        ms_raw = _clean_cell(row.get('mg_status')) or ''
                        try:
                            ms_norm = str(ms_raw).strip().upper()
                        except Exception:
                            ms_norm = ''
                        if ms_norm.startswith('CANCEL') or ms_norm in ('CANCELED', 'CANCELLED'):
                            ms_mapped = MigrationStatus.CANCELLED
                        elif ms_norm in ('D', 'DONE', 'ISSUED', 'I'):
                            # Treat Done/Issued as ISSUED
                            ms_mapped = MigrationStatus.ISSUED
                        elif ms_norm == 'P' or ms_norm == 'PENDING' or ms_norm == MigrationStatus.PENDING:
                            ms_mapped = MigrationStatus.PENDING
                        elif ms_norm:
                            # If a raw value matches one of the choice values (case-insensitive), try to map
                            # common synonyms; fall back to ISSUED for empty/unknown to match requested behavior
                            ms_mapped = ms_norm
                        else:
                            # When mg_status is not provided, default to ISSUED (treated as Done)
                            ms_mapped = MigrationStatus.ISSUED
                        candidate['mg_status'] = ms_mapped
                        # pay_rec_no: prefer sheet value, else from doc_rec if available
                        pay_rec_val = None
                        try:
                            if ('pay_rec_no' in sel) if sel else ('pay_rec_no' in df.columns):
                                pay_rec_val = _clean_cell(row.get('pay_rec_no'))
                        except Exception:
                            pay_rec_val = _clean_cell(row.get('pay_rec_no'))
                        if not pay_rec_val and doc_rec is not None:
                            pay_rec_val = getattr(doc_rec, 'pay_rec_no', None)
                        if pay_rec_val is not None:
                            candidate['pay_rec_no'] = pay_rec_val

                        # created_by only set on create
                        if existing:
                            # Update existing object selectively
                            for k, v in candidate.items():
                                setattr(existing, k, v)
                            # For CANCEL rows, ensure student_name is at least empty string
                            # before running full_clean() so validation won't reject it.
                            try:
                                if is_cancel_local and not getattr(existing, 'student_name', None):
                                    existing.student_name = ''
                                existing.full_clean()
                                existing.save()
                                _log(idx, row.get("mg_number"), "Upserted", True)
                            except Exception as e:
                                _log(idx, row.get("mg_number"), str(e), False)
                        else:
                            # For new records, ensure required fields are present for non-CANCEL rows.
                            missing_required = []
                            if (not is_cancel_local):
                                # If an enrollment exists, prefer its relations and do not
                                # require institute/main/sub even if those columns were
                                # selected (they can be derived/filled from enrollment).
                                # Only require these related records when no enrollment
                                # is present and the corresponding relation could not be
                                # resolved.
                                if not inst and (not enr):
                                    missing_required.append('institute')
                                if not main and (not enr):
                                    missing_required.append('maincourse')
                                if not sub and (not enr):
                                    missing_required.append('subcourse')
                                # student_name: required for non-CANCEL rows; allow empty
                                # for CANCEL rows (we'll set it to empty string).
                                if not candidate.get('student_name'):
                                    if is_cancel_local:
                                        candidate['student_name'] = ''
                                    else:
                                        missing_required.append('student_name')
                                if mg_date_present and candidate.get('mg_date') is None:
                                    missing_required.append('mg_date')
                                # exam_year/admission_year: required only if selected
                                if (('exam_year' in sel) if sel else ('exam_year' in df.columns)) and candidate.get('exam_year') is None:
                                    missing_required.append('exam_year')
                                if (('admission_year' in sel) if sel else ('admission_year' in df.columns)) and candidate.get('admission_year') is None:
                                    missing_required.append('admission_year')
                                # pay_rec_no: required if selected or if we have no doc_rec to copy from
                                pay_required_cond = (('pay_rec_no' in sel) if sel else ('pay_rec_no' in df.columns)) or (doc_rec is None)
                                if pay_required_cond and candidate.get('pay_rec_no') is None:
                                    missing_required.append('pay_rec_no')
                            if missing_required:
                                _log(idx, mg_num_val, f"Missing required fields for new MigrationRecord: {', '.join(missing_required)}", False)
                                _cache_progress(idx+1)
                                continue
                            # Build create data. Ensure student_name is present for CANCEL rows
                            # (some validation paths may reject missing/None even when blank is allowed).
                            create_data = {**candidate}
                            # If student_name was omitted and this is a CANCEL, set to empty string
                            if not create_data.get('student_name') and is_cancel_local:
                                create_data['student_name'] = ''
                            create_data['mg_number'] = mg_num_val
                            create_data['created_by'] = user
                            try:
                                obj = MigrationRecord.objects.create(**create_data)
                                _log(idx, row.get("mg_number"), "Created", True)
                            except Exception as e:
                                _log(idx, row.get("mg_number"), str(e), False)
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
                                except Exception as e:
                                    try:
                                        key_ident = row.get('enrollment_no') or row.get('sr_no') or None
                                        _log(idx, key_ident or doc_rec_id_raw, f"Student create/update error: {e}", False)
                                    except Exception:
                                        _log(idx, doc_rec_id_raw, "Student create/update error (exception while logging)", False)
                        # If doc_rec is missing and the caller asked for auto-creation, try to create it
                        if not doc_rec and auto_create_docrec:
                            try:
                                create_key = str(doc_rec_id_raw).strip() if doc_rec_id_raw else None
                                if create_key:
                                    # preserve apply_for as PROVISIONAL (PRV)
                                    doc_rec = DocRec.objects.create(doc_rec_id=create_key, apply_for='PRV', created_by=user)
                                else:
                                    doc_rec = DocRec.objects.create(apply_for='PRV', created_by=user)
                            except Exception:
                                doc_rec = None

                        # enrollment may be optional; only required when provided or when non-CANCEL
                        enr_key = _clean_cell(row.get("enrollment_no"))
                        enr = None
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
                                        norm = ''.join(k.split()).lower()
                                        enr = (Enrollment.objects
                                               .annotate(_norm=Replace(Lower(models.F('enrollment_no')), Value(' '), Value('')))
                                               .filter(_norm=norm)
                                               .first())
                                    except Exception:
                                        enr = None

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

                        # Normalize prv_status early and determine CANCEL rows so they get relaxed requirements
                        prv_status_raw_local = _clean_cell(row.get('prv_status')) or ''
                        try:
                            prv_status_local = str(prv_status_raw_local).strip().upper() if prv_status_raw_local is not None else ''
                        except Exception:
                            prv_status_local = ''
                        if prv_status_local == '':
                            # Treat blank status as ISSUED by default
                            prv_status_local = 'ISSUED'
                            prv_status_raw_local = 'ISSUED'
                        is_cancel_local = (prv_status_local == 'CANCEL' or prv_status_local.startswith('CANCEL'))

                        # Normalize prv_number once for consistent keys (strip .0 etc.)
                        normalized_prv = _normalize_prv_number(row.get("prv_number"))

                        # If this is a CANCEL row we only require doc_rec, prv_number and prv_date
                        if is_cancel_local:
                            if not doc_rec:
                                _log(idx, normalized_prv or row.get("prv_number"), "Missing doc_rec for CANCEL record", False); _cache_progress(idx+1); continue
                            prv_date = _parse_excel_date_safe(row.get("prv_date"))
                            if prv_date is None:
                                _log(idx, normalized_prv or row.get("prv_number"), "Missing prv_date for CANCEL record", False); _cache_progress(idx+1); continue
                            # Upsert minimal fields for CANCEL
                            ProvisionalRecord.objects.update_or_create(
                                prv_number=normalized_prv,
                                defaults={
                                    # store the doc_rec_id string (doc_rec may be a DocRec object)
                                    "doc_rec": (doc_rec.doc_rec_id if getattr(doc_rec, 'doc_rec_id', None) else (doc_rec if isinstance(doc_rec, str) else None)),
                                    "prv_date": prv_date,
                                    "prv_status": ProvisionalStatus.CANCELLED,
                                    "created_by": user,
                                }
                            )
                            _log(idx, normalized_prv or row.get("prv_number"), "Upserted (CANCEL)", True)
                            _cache_progress(idx+1)
                            continue

                        # Non-CANCEL rows: require related doc_rec and at least some FK info (enrollment or institute/main/sub)
                        if not doc_rec:
                            _log(idx, normalized_prv or row.get("prv_number"), "Missing doc_rec", False); _cache_progress(idx+1); continue
                        prv_date = _parse_excel_date_safe(row.get("prv_date"))
                        if prv_date is None:
                            _log(idx, normalized_prv or row.get("prv_number"), "Missing prv_date", False); _cache_progress(idx+1); continue

                        # Normalize prv_status into ProvisionalStatus constants
                        try:
                            ps_raw = prv_status_raw_local or ''
                            ps_norm = str(ps_raw).strip().upper() if ps_raw is not None else ''
                        except Exception:
                            ps_norm = ''
                        if ps_norm.startswith('CANCEL') or ps_norm in ('CANCELED', 'CANCELLED'):
                            ps_mapped = ProvisionalStatus.CANCELLED
                        elif ps_norm in ('D', 'DONE', 'ISSUED', 'I'):
                            ps_mapped = ProvisionalStatus.ISSUED
                        elif ps_norm in ('P', 'PENDING'):
                            ps_mapped = ProvisionalStatus.PENDING
                        elif ps_norm:
                            # try a title-cased match
                            try:
                                ps_mapped = ps_norm.capitalize()
                            except Exception:
                                ps_mapped = ProvisionalStatus.ISSUED
                        else:
                            ps_mapped = ProvisionalStatus.ISSUED

                        # Build upsert defaults with fallbacks
                        defaults = {
                            # store doc_rec as doc_rec_id string
                            "doc_rec": (doc_rec.doc_rec_id if getattr(doc_rec, 'doc_rec_id', None) else (doc_rec if isinstance(doc_rec, str) else None)),
                            "enrollment": enr,
                            "student_name": row.get("student_name") or (enr.student_name if enr else None),
                            "institute": inst,
                            "maincourse": main,
                            "subcourse": sub,
                            "class_obtain": row.get("class_obtain"),
                            "prv_date": prv_date,
                            # Normalize passing year into 'Mon-YYYY' format where possible
                            "passing_year": _normalize_month_year(row.get("passing_year")),
                            "prv_status": ps_mapped,
                            "pay_rec_no": (row.get("pay_rec_no") or (doc_rec.pay_rec_no if doc_rec else None)),
                            "created_by": user,
                        }

                        ProvisionalRecord.objects.update_or_create(
                            prv_number=normalized_prv,
                            defaults=defaults
                        )
                        _log(idx, normalized_prv or row.get("prv_number"), "Upserted", True)
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
                                # legacy `userid` removed; accept username/usercode instead
                                "username": row.get("username") or None,
                                "usercode": row.get("usercode") or None,
                            "username": row.get("username") or None,
                            "usercode": row.get("usercode") or None,
                            "actual_joining": actual_joining,
                            "emp_birth_date": emp_birth,
                            "usr_birth_date": usr_birth,
                            "department_joining": row.get("department_joining") or None,
                            "institute_id": row.get("institute_id") or None,
                            "status": row.get("status") or "Active",
                            "el_balance": _safe_num(row.get("el_balance"), 0),
                            "sl_balance": _safe_num(row.get("sl_balance"), 0),
                            "cl_balance": _safe_num(row.get("cl_balance"), 0),
                            "vacation_balance": _safe_num(row.get("vacation_balance"), 0),
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
                        if row.get("total_days") not in (None, ""):
                            total_days = _safe_num(row.get("total_days"), None)
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
                        dr_key_raw = _clean_cell(row.get("doc_rec_id"))
                        dr_key = str(dr_key_raw).strip() if dr_key_raw is not None else ''
                        enr_key_raw = _clean_cell(row.get("enrollment_no"))
                        enr_key = str(enr_key_raw).strip() if enr_key_raw is not None else ''

                        # Robust DocRec lookup: exact, iexact, then normalized fallback
                        doc_rec = None
                        if dr_key:
                            try:
                                doc_rec = DocRec.objects.filter(doc_rec_id=dr_key).first()
                                if not doc_rec:
                                    doc_rec = DocRec.objects.filter(doc_rec_id__iexact=dr_key).first()
                            except Exception:
                                doc_rec = None
                            if not doc_rec:
                                try:
                                    import re
                                    norm = re.sub(r'[^0-9a-zA-Z]', '', dr_key).lower()
                                    if norm:
                                        for dr in DocRec.objects.all()[:20000]:
                                            try:
                                                if re.sub(r'[^0-9a-zA-Z]', '', str(dr.doc_rec_id)).lower() == norm:
                                                    doc_rec = dr
                                                    break
                                            except Exception:
                                                continue
                                except Exception:
                                    doc_rec = None

                        # Robust Enrollment lookup: try exact, iexact, then normalized (remove spaces, case-insensitive)
                        enr = None
                        if enr_key:
                            try:
                                k = enr_key
                                enr = Enrollment.objects.filter(enrollment_no=k).first()
                                if not enr:
                                    enr = Enrollment.objects.filter(enrollment_no__iexact=k).first()
                            except Exception:
                                enr = None
                            if not enr:
                                try:
                                    norm = ''.join(enr_key.split()).lower()
                                    enr = (Enrollment.objects
                                           .annotate(_norm=Replace(Lower(models.F('enrollment_no')), Value(' '), Value('')))
                                           .filter(_norm=norm)
                                           .first())
                                except Exception:
                                    enr = None

                        # second enrollment
                        senr = None
                        sec_key = _clean_cell(row.get("second_enrollment_no"))
                        if sec_key:
                            try:
                                sk = str(sec_key).strip()
                                senr = Enrollment.objects.filter(enrollment_no=sk).first() or Enrollment.objects.filter(enrollment_no__iexact=sk).first()
                            except Exception:
                                senr = None

                        # If DocRec missing and auto-create requested, create a minimal DocRec
                        if not doc_rec and auto_create_docrec and dr_key:
                            try:
                                doc_date = _parse_excel_date_safe(row.get("doc_rec_date")) or timezone.now().date()
                                pay_rec_no = _clean_cell(row.get('pay_rec_no'))
                                remark = _clean_cell(row.get('doc_rec_remark'))
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

                        # Validation: require doc_rec and enrollment_no string (enrollment FK lookup is optional)
                        if not doc_rec:
                            _log(idx, row.get("final_no") or dr_key or enr_key, "Missing doc_rec", False)
                            _cache_progress(idx+1)
                            continue
                        if not enr_key:
                            _log(idx, row.get("final_no") or dr_key, "Missing enrollment_no", False)
                            _cache_progress(idx+1)
                            continue

                        # Prefer explicit `doc_rec_date` column, then `date` column,
                        # then linked DocRec.doc_rec_date, then created-at
                        parsed_doc_rec_date = _parse_excel_date_safe(row.get('doc_rec_date'))
                        date_v = parsed_doc_rec_date or _parse_excel_date_safe(row.get("date")) or (getattr(doc_rec, 'doc_rec_date', None) if doc_rec else None) or timezone.now().date()
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

                        # Use `doc_rec_date` as the model field for the doc record date
                        # enrollment_no and second_enrollment_id are now CharField (not FK)
                        defaults = {
                            "doc_rec": doc_rec,
                            "doc_rec_date": date_v,
                            "enrollment_no": enr_key if enr_key else None,
                            "second_enrollment_id": str(sec_key).strip() if sec_key else None,
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
                            # allow NULL for eca_status when sheet cell is blank
                            "eca_status": _map_mail_status(_normalize_cell(row.get('eca_status') or row.get('eca_send_status'))),
                            # mail send status for verification (accept common header names)
                            # Keep existing behaviour for mail_status (defaults to NOT_SENT)
                            "mail_status": (_map_mail_status(_normalize_cell(row.get('mail_status') or row.get('mail_send_status') or row.get('mail_send'))) or MailStatus.NOT_SENT),
                            "updatedby": user,
                        }
                        status_val = _normalize_cell(row.get("status"))
                        has_status = status_val is not None and str(status_val).strip() != ""

                        final_no_val = _normalize_cell(row.get("final_no"))

                        # Parse vr_done_date if present on sheet (accept common column names)
                        vr_done_from_sheet = _parse_excel_date_safe(row.get('vr_done_date') or row.get('done_date') or row.get('vr_done'))

                        # If sheet provided an explicit doc_rec_date, propagate it to the linked DocRec (best-effort)
                        if doc_rec and parsed_doc_rec_date is not None:
                            try:
                                if getattr(doc_rec, 'doc_rec_date', None) != parsed_doc_rec_date:
                                    doc_rec.doc_rec_date = parsed_doc_rec_date
                                    doc_rec.save(update_fields=['doc_rec_date'])
                            except Exception:
                                pass

                        # Upsert strategy: prefer doc_rec (unique doc_rec_id) for matching; fallback to final_no
                        existing = None
                        if doc_rec:
                            existing = Verification.objects.filter(doc_rec=doc_rec).first()
                        if not existing and final_no_val:
                            existing = Verification.objects.filter(final_no=final_no_val).first()

                        if existing:
                            # update existing object selectively
                            for k, v in defaults.items():
                                try:
                                    setattr(existing, k, v)
                                except Exception:
                                    pass
                            # update vr_done_date when provided in sheet
                            if vr_done_from_sheet is not None:
                                existing.vr_done_date = vr_done_from_sheet
                            # update status only if sheet provided it
                            if has_status:
                                existing.status = status_val
                            # update final_no if provided
                            if final_no_val:
                                existing.final_no = final_no_val
                            try:
                                existing.full_clean()
                            except Exception:
                                pass
                            try:
                                existing.save()
                                _log(idx, final_no_val or dr_key or enr_key, "Updated", True)
                            except Exception as e:
                                _log(idx, final_no_val or dr_key or enr_key, str(e), False)
                        else:
                            # create new record: include vr_done_date if provided
                            create_data = {**defaults}
                            create_data['status'] = status_val if has_status else None
                            if final_no_val:
                                create_data['final_no'] = final_no_val
                            if vr_done_from_sheet is not None:
                                create_data['vr_done_date'] = vr_done_from_sheet
                            try:
                                Verification.objects.create(**create_data)
                                _log(idx, final_no_val or dr_key or enr_key, "Created", True)
                            except Exception as e:
                                _log(idx, final_no_val or dr_key or enr_key, str(e), False)
                    except Exception as e:
                        _log(idx, row.get("final_no") or row.get("enrollment_no"), str(e), False)
                    _cache_progress(idx+1)
            elif service == BulkService.INSTITUTIONAL_VERIFICATION:
                last_doc_rec = None
                last_doc_rec_id_raw = None
                for idx, row in df.iterrows():
                    try:
                        # Identify or create DocRec
                        doc_rec_id_raw = _clean_cell(row.get('doc_rec_id'))
                        # If this row doesn't repeat doc_rec_id but a previous main row
                        # exists in the sheet, attach student rows to that last main
                        # record. This accommodates templates where main info is
                        # shown once with subsequent student rows omitting doc_rec_id.
                        if not doc_rec_id_raw and last_doc_rec_id_raw:
                            doc_rec_id_raw = last_doc_rec_id_raw
                        doc_rec = None
                        if doc_rec_id_raw:
                            key = str(doc_rec_id_raw).strip()
                            doc_rec = DocRec.objects.filter(doc_rec_id=key).first() or DocRec.objects.filter(doc_rec_id__iexact=key).first()
                        if not doc_rec and auto_create_docrec:
                            try:
                                dr_date = _parse_excel_date_safe(row.get('doc_rec_date')) or timezone.now().date()
                                doc_rec = DocRec.objects.create(doc_rec_id=(str(doc_rec_id_raw).strip() if doc_rec_id_raw else None), apply_for='IV', doc_rec_date=dr_date, created_by=user)
                            except Exception:
                                doc_rec = None

                        if not doc_rec:
                            # If no doc_rec found and we had a last_doc_rec object, use it
                            if last_doc_rec:
                                doc_rec = last_doc_rec
                            else:
                                _log(idx, doc_rec_id_raw or row.get('inst_veri_number'), 'Missing or invalid doc_rec_id', False); _cache_progress(idx+1); continue

                        # Upsert main record (one per doc_rec)
                        main = InstVerificationMain.objects.filter(doc_rec=doc_rec).first()
                        main_fields = dict(
                            inst_veri_number = row.get('inst_veri_number') or None,
                            inst_veri_date = _parse_excel_date_safe(row.get('inst_veri_date')) or None,
                            rec_inst_name = row.get('rec_inst_name') or None,
                            rec_inst_address_1 = row.get('rec_inst_address_1') or None,
                            rec_inst_address_2 = row.get('rec_inst_address_2') or None,
                            rec_inst_location = row.get('rec_inst_location') or None,
                            rec_inst_city = row.get('rec_inst_city') or None,
                            rec_inst_pin = row.get('rec_inst_pin') or None,
                            rec_inst_email = row.get('rec_inst_email') or None,
                            doc_types = row.get('doc_types') or None,
                            rec_inst_sfx_name = row.get('rec_inst_sfx_name') or None,
                            study_mode = row.get('study_mode') or None,
                            iv_status = row.get('iv_status') or None,
                            rec_by = row.get('rec_by') or None,
                            doc_rec_date = _parse_excel_date_safe(row.get('doc_rec_date')) or None,
                            inst_ref_no = row.get('inst_ref_no') or None,
                            ref_date = _parse_excel_date_safe(row.get('ref_date')) or None,
                            institute_id = row.get('institute_id') or None,
                        )
                        if not main:
                            InstVerificationMain.objects.create(doc_rec=doc_rec, **main_fields)
                            # remember last main for carry-forward
                            last_doc_rec = doc_rec
                            last_doc_rec_id_raw = doc_rec_id_raw
                        else:
                            updated = False
                            for k, v in main_fields.items():
                                if v is not None and getattr(main, k, None) != v:
                                    setattr(main, k, v)
                                    updated = True
                            if updated:
                                main.save()
                            # remember last main for carry-forward
                            last_doc_rec = main.doc_rec
                            last_doc_rec_id_raw = getattr(main.doc_rec, 'doc_rec_id', None)

                        # Students: either nested 'students' JSON-like cell or per-row student columns
                        students = row.get('students') if isinstance(row.get('students'), list) else None
                        student_created = False
                        if students and isinstance(students, list):
                            for s in students:
                                try:
                                    exists = None
                                    if s.get('enrollment'):
                                        # Try to resolve Enrollment object; if not found, keep raw value in enrollment_no_text
                                        enr_obj = None
                                        try:
                                            enr_obj = Enrollment.objects.filter(enrollment_no=str(s.get('enrollment')).strip()).first()
                                        except Exception:
                                            enr_obj = None
                                        if enr_obj:
                                            exists = InstVerificationStudent.objects.filter(doc_rec=doc_rec, enrollment=enr_obj).first()
                                        else:
                                            exists = InstVerificationStudent.objects.filter(doc_rec=doc_rec, enrollment_no_text=str(s.get('enrollment')).strip()).first()
                                    if not exists and s.get('sr_no') is not None:
                                        exists = InstVerificationStudent.objects.filter(doc_rec=doc_rec, sr_no=s.get('sr_no')).first()
                                    if exists:
                                        # update fields
                                        changed = False
                                        for fld in ('student_name','type_of_credential','month_year','verification_status','iv_degree_name'):
                                            if s.get(fld) is not None:
                                                val = s.get(fld)
                                                # normalize month_year via helper
                                                if fld == 'month_year':
                                                    val = _normalize_month_year(val)
                                                # ensure varchar(20) limits are respected
                                                if isinstance(val, str) and len(val) > 20:
                                                    val = val[:20]
                                                if getattr(exists, fld, None) != val:
                                                    setattr(exists, fld, val)
                                                    changed = True
                                        if changed:
                                            exists.save()

                                        # If an enrollment value was provided and resolved to an Enrollment
                                        # object, ensure the student row links to that enrollment and
                                        # copies institute/main/subcourse from the Enrollment for sync.
                                        try:
                                            if s.get('enrollment'):
                                                if enr_obj:
                                                    if getattr(exists, 'enrollment', None) != enr_obj:
                                                        exists.enrollment = enr_obj
                                                        changed = True
                                                    # copy institute/main/subcourse from enrollment when present
                                                    try:
                                                        if getattr(enr_obj, 'institute', None) and getattr(exists, 'institute', None) != enr_obj.institute:
                                                            exists.institute = enr_obj.institute
                                                            changed = True
                                                    except Exception:
                                                        pass
                                                    try:
                                                        if getattr(enr_obj, 'maincourse', None) and getattr(exists, 'main_course', None) != enr_obj.maincourse:
                                                            exists.main_course = enr_obj.maincourse
                                                            changed = True
                                                    except Exception:
                                                        pass
                                                    try:
                                                        if getattr(enr_obj, 'subcourse', None) and getattr(exists, 'sub_course', None) != enr_obj.subcourse:
                                                            exists.sub_course = enr_obj.subcourse
                                                            changed = True
                                                    except Exception:
                                                        pass
                                                    # clear enrollment text copy if we now have Enrollment FK
                                                    if getattr(exists, 'enrollment_no_text', None):
                                                        exists.enrollment_no_text = None
                                                        changed = True
                                            if changed:
                                                exists.save()
                                        except Exception:
                                            pass
                                    else:
                                        # Prepare enrollment resolution
                                        enr_val = s.get('enrollment')
                                        enr_obj = None
                                        enr_text = None
                                        if enr_val:
                                            try:
                                                enr_obj = Enrollment.objects.filter(enrollment_no=str(enr_val).strip()).first()
                                            except Exception:
                                                enr_obj = None
                                            if not enr_obj:
                                                enr_text = str(enr_val).strip()

                                        # Normalize/truncate fields to avoid DB length errors
                                        my = _normalize_month_year(s.get('month_year')) or None
                                        if isinstance(my, str) and len(my) > 20:
                                            my = my[:20]
                                        vs = s.get('verification_status') or None
                                        if isinstance(vs, str) and len(vs) > 20:
                                            vs = vs[:20]
                                        InstVerificationStudent.objects.create(
                                            doc_rec=doc_rec,
                                            sr_no = s.get('sr_no') or None,
                                            student_name = s.get('student_name') or None,
                                            iv_degree_name = s.get('iv_degree_name') or None,
                                            type_of_credential = s.get('type_of_credential') or None,
                                            month_year = my,
                                            verification_status = vs,
                                            enrollment = enr_obj,
                                            enrollment_no_text = enr_text,
                                            # If enrollment resolved, copy related institute/main/subcourse
                                            institute = (enr_obj.institute if enr_obj and getattr(enr_obj, 'institute', None) else (Institute.objects.filter(pk=s.get('institute_id')).first() if s.get('institute_id') else None)),
                                            main_course = (enr_obj.maincourse if enr_obj and getattr(enr_obj, 'maincourse', None) else (MainBranch.objects.filter(pk=s.get('main_course')).first() if s.get('main_course') else None)),
                                            sub_course = (enr_obj.subcourse if enr_obj and getattr(enr_obj, 'subcourse', None) else (SubBranch.objects.filter(pk=s.get('sub_course')).first() if s.get('sub_course') else None)),
                                        )
                                        student_created = True
                                except Exception as e:
                                    # Record student-level failure with context so uploader log shows why
                                    try:
                                        key = None
                                        try:
                                            key = s.get('sr_no') or s.get('enrollment') or s.get('student_name')
                                        except Exception:
                                            key = None
                                        # Build rich message: exception type, message, and raw student JSON
                                        try:
                                            import json
                                            row_payload = json.dumps(s, default=str, ensure_ascii=False)
                                        except Exception:
                                            row_payload = repr(s)
                                        msg = f"{type(e).__name__}: {str(e)} | data={row_payload}"
                                        _log(idx, key or f'student_row_{idx}', msg, False)
                                        logging.exception('Failed creating/updating inst verification student (nested students list)')
                                    except Exception:
                                        # best-effort: do not let logging errors break processing
                                        pass
                        else:
                            # Single student-per-row path
                            if row.get('student_name') or row.get('enrollment_no'):
                                try:
                                    enr_key = _clean_cell(row.get('enrollment_no'))
                                    enr = None
                                    enr_text = None
                                    if enr_key:
                                        try:
                                            enr = Enrollment.objects.filter(enrollment_no=str(enr_key).strip()).first()
                                        except Exception:
                                            enr = None
                                        if not enr:
                                            enr_text = str(enr_key).strip()
                                    exists = None
                                    if enr:
                                        exists = InstVerificationStudent.objects.filter(doc_rec=doc_rec, enrollment=enr).first()
                                    if not exists and row.get('sr_no') is not None:
                                        exists = InstVerificationStudent.objects.filter(doc_rec=doc_rec, sr_no=row.get('sr_no')).first()
                                    if exists:
                                        changed = False
                                        for fld in ('student_name','type_of_credential','month_year','verification_status','iv_degree_name'):
                                            val = row.get(fld)
                                            if val is not None:
                                                if fld == 'month_year':
                                                    val = _normalize_month_year(val)
                                                # enforce varchar(20) limit for short fields
                                                if fld in ('month_year','verification_status') and isinstance(val, str) and len(val) > 20:
                                                    val = val[:20]
                                                if getattr(exists, fld, None) != val:
                                                    setattr(exists, fld, val)
                                                    changed = True
                                        if changed:
                                            exists.save()
                                        # If enrollment present in the row and we resolved an Enrollment
                                        # ensure FK links and copy institute/main/subcourse
                                        try:
                                            if enr:
                                                if getattr(exists, 'enrollment', None) != enr:
                                                    exists.enrollment = enr
                                                    changed = True
                                                try:
                                                    if getattr(enr, 'institute', None) and getattr(exists, 'institute', None) != enr.institute:
                                                        exists.institute = enr.institute
                                                        changed = True
                                                except Exception:
                                                    pass
                                                try:
                                                    if getattr(enr, 'maincourse', None) and getattr(exists, 'main_course', None) != enr.maincourse:
                                                        exists.main_course = enr.maincourse
                                                        changed = True
                                                except Exception:
                                                    pass
                                                try:
                                                    if getattr(enr, 'subcourse', None) and getattr(exists, 'sub_course', None) != enr.subcourse:
                                                        exists.sub_course = enr.subcourse
                                                        changed = True
                                                except Exception:
                                                    pass
                                                if getattr(exists, 'enrollment_no_text', None):
                                                    exists.enrollment_no_text = None
                                                    changed = True
                                            if changed:
                                                exists.save()
                                        except Exception:
                                            pass
                                    else:
                                        my = _normalize_month_year(row.get('month_year')) or None
                                        if isinstance(my, str) and len(my) > 20:
                                            my = my[:20]
                                        vs = row.get('verification_status') or None
                                        if isinstance(vs, str) and len(vs) > 20:
                                            vs = vs[:20]
                                        InstVerificationStudent.objects.create(
                                            doc_rec=doc_rec,
                                            sr_no = row.get('sr_no') or None,
                                            student_name = row.get('student_name') or None,
                                            iv_degree_name = row.get('iv_degree_name') or None,
                                            type_of_credential = row.get('type_of_credential') or None,
                                            month_year = my,
                                            verification_status = vs,
                                            enrollment = enr,
                                            enrollment_no_text = enr_text,
                                            institute = (enr.institute if enr and getattr(enr, 'institute', None) else (Institute.objects.filter(pk=row.get('institute_id')).first() if row.get('institute_id') else None)),
                                            main_course = (enr.maincourse if enr and getattr(enr, 'maincourse', None) else (MainBranch.objects.filter(pk=row.get('maincourse_id')).first() if row.get('maincourse_id') else None)),
                                            sub_course = (enr.subcourse if enr and getattr(enr, 'subcourse', None) else (SubBranch.objects.filter(pk=row.get('subcourse_id')).first() if row.get('subcourse_id') else None)),
                                        )
                                        student_created = True
                                except Exception as e:
                                    # Record student-level failure with context so uploader log shows why
                                    try:
                                        key = row.get('sr_no') or row.get('enrollment_no') or row.get('student_name') or doc_rec_id_raw or row.get('inst_veri_number')
                                        try:
                                            import json
                                            row_payload = json.dumps(row.to_dict() if hasattr(row, 'to_dict') else dict(row), default=str, ensure_ascii=False)
                                        except Exception:
                                            try:
                                                row_payload = repr(row)
                                            except Exception:
                                                row_payload = '<unserializable row>'
                                        msg = f"{type(e).__name__}: {str(e)} | data={row_payload}"
                                        _log(idx, key or f'student_row_{idx}', msg, False)
                                        logging.exception('Failed creating/updating inst verification student (single-row)')
                                    except Exception:
                                        pass

                        _log(idx, doc_rec_id_raw or row.get('inst_veri_number'), "Upserted", True)
                    except Exception as e:
                        _log(idx, row.get('inst_veri_number') or row.get('doc_rec_id'), str(e), False)
                    _cache_progress(idx+1)
            else:
                return {"error": True, "detail": f"Service {service} not implemented"}
        except Exception as e:
            # fatal error: attempt to write partial log (if any) so client gets a log file
            try:
                import pandas as _pd
                import base64
                logs_dir = os.path.join(settings.MEDIA_ROOT, 'logs')
                os.makedirs(logs_dir, exist_ok=True)
                df_log = _pd.DataFrame(results) if results else _pd.DataFrame([{"error": str(e)}])
                out = BytesIO()
                with _pd.ExcelWriter(out, engine='openpyxl') as writer:
                    df_log.to_excel(writer, index=False, sheet_name='result')
                out.seek(0)
                fname = f"upload_log_{service.lower()}_{timezone.now().strftime('%Y%m%d_%H%M%S')}_partial.xlsx"
                fpath = os.path.join(logs_dir, fname)
                with open(fpath, 'wb') as f:
                    f.write(out.getvalue())
                file_url = settings.MEDIA_URL + 'logs/' + fname
                try:
                    logging.info('Wrote partial upload log to %s (url=%s)', fpath, file_url)
                except Exception:
                    pass
                try:
                    log_xlsx_b64 = base64.b64encode(out.getvalue()).decode('utf-8')
                    log_name = fname
                except Exception:
                    log_xlsx_b64 = None
                    log_name = None
            except Exception:
                file_url = None
                log_xlsx_b64 = None
                log_name = None
            if track_id:
                cache.set(f"bulk:{track_id}", {"status": "error", "detail": str(e), "log_url": file_url, **({'log_xlsx': log_xlsx_b64, 'log_name': log_name} if log_xlsx_b64 else {})}, timeout=3600)
            return {"error": True, "detail": str(e), "log_url": file_url, **({'log_xlsx': log_xlsx_b64, 'log_name': log_name} if log_xlsx_b64 else {})}

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
            try:
                import base64
                log_xlsx_b64 = base64.b64encode(out.getvalue()).decode('utf-8')
                log_name = fname
            except Exception:
                log_xlsx_b64 = None
                log_name = None
            try:
                logging.info('Wrote upload log to %s (url=%s) size_bytes=%d base64_len=%d', fpath, file_url, len(out.getvalue()), len(log_xlsx_b64) if log_xlsx_b64 else 0)
            except Exception:
                pass
        except Exception:
            file_url = None

        summary = {"ok": ok_count, "fail": fail_count, "total": len(results)}
        result_payload = {
            "error": False,
            "mode": "confirm",
            "summary": summary,
            "log_url": file_url,
            "results": results,
            # Include base64-encoded XLSX so the frontend can trigger download even if
            # relative media URL resolution fails in some deployments or client code.
            **({'log_xlsx': log_xlsx_b64, 'log_name': log_name} if (log_xlsx_b64) else {}),
        }
        # Ensure payload is JSON-serializable (convert numpy/pandas NaN and numpy types to native Python)
        def _make_json_safe(o):
            try:
                import math
                import numpy as _np
                import pandas as _pd
            except Exception:
                _np = None; _pd = None; math = __import__('math')

            # primitives
            if o is None:
                return None
            if isinstance(o, (str, bool, int)):
                return o
            if isinstance(o, float):
                try:
                    if math.isnan(o) or o in (float('inf'), float('-inf')):
                        return None
                except Exception:
                    pass
                return o
            # numpy scalar
            try:
                if _np is not None and isinstance(o, _np.generic):
                    return _make_json_safe(o.item())
            except Exception:
                pass
            # pandas types
            try:
                if _pd is not None and isinstance(o, _pd.Timestamp):
                    return str(o.to_pydatetime())
            except Exception:
                pass
            # dict/list
            if isinstance(o, dict):
                return {str(k): _make_json_safe(v) for k, v in o.items()}
            if isinstance(o, (list, tuple)):
                return [_make_json_safe(v) for v in o]
            # dates
            try:
                import datetime as _dt
                if isinstance(o, (_dt.date, _dt.datetime)):
                    return o.isoformat()
            except Exception:
                pass
            # fallback: stringify
            try:
                return str(o)
            except Exception:
                return None

        safe_payload = _make_json_safe(result_payload)
        if track_id:
            try:
                cache.set(f"bulk:{track_id}", {"status": "done", **safe_payload}, timeout=3600)
            except Exception:
                # caching failure should not block response
                logging.exception('Failed to cache bulk result for %s', track_id)
        return safe_payload

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
            logging.exception('Error reading uploaded file')
            return err(f"Error reading file: {e}")
        if df is None:
            return err("No data found")

        # If client provided a columns[] selection, subset dataframe to only those columns
        # Also ensure minimal keys used by services remain present if available
        try:
            # Normalize common header name variants to canonical internal column names.
            # Many upload sheets use headings like 'key', 'institute', 'main', 'sub', etc.
            # Map those to the expected names so server-side processors can find them.
            def _canonical(colname):
                if colname is None:
                    return None
                s = str(colname).strip().lower()
                # remove punctuation and multiple spaces
                s2 = ''.join(ch for ch in s if ch.isalnum() or ch.isspace()).strip()
                s2 = ' '.join(s2.split())
                # direct synonyms
                mapping = {
                    'key': 'enrollment_no',
                    'enrollment': 'enrollment_no',
                    'enrollment no': 'enrollment_no',
                    'enrollment_no': 'enrollment_no',
                    'docrec': 'doc_rec_id',
                    'doc rec': 'doc_rec_id',
                    'doc_rec_id': 'doc_rec_id',
                    'institute': 'institute_id',
                    'institute id': 'institute_id',
                    'institute_id': 'institute_id',
                    'main': 'maincourse_id',
                    'maincourse': 'maincourse_id',
                    'main course': 'maincourse_id',
                    'maincourse id': 'maincourse_id',
                    'sub': 'subcourse_id',
                    'subcourse': 'subcourse_id',
                    'sub course': 'subcourse_id',
                    'subcourse id': 'subcourse_id',
                    'mg number': 'mg_number',
                    'mg_number': 'mg_number',
                    'mg_date': 'mg_date',
                    'mg date': 'mg_date',
                    'student name': 'student_name',
                    'student_name': 'student_name',
                    'pay rec no': 'pay_rec_no',
                    'pay_rec_no': 'pay_rec_no',
                    'exam year': 'exam_year',
                    'exam_year': 'exam_year',
                    'admission year': 'admission_year',
                    'admission_year': 'admission_year',
                }
                return mapping.get(s2, None)

            # Build a rename map for df columns where a canonical name is available
            try:
                rename_map = {}
                for c in list(df.columns):
                    canon = _canonical(c)
                    if canon and canon != c:
                        # Avoid overwriting if canon already exists as a column
                        if canon not in df.columns:
                            rename_map[c] = canon
                if rename_map:
                    df = df.rename(columns=rename_map)
            except Exception:
                pass

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
                # Canonicalize selected column names to match any renaming we applied to df.
                def _canon_for_selected(name):
                    try:
                        c = _canonical(name)
                    except Exception:
                        c = None
                    # prefer canonical name if present in df, else try the original name, else try a case-insensitive match
                    if c and c in df.columns:
                        return c
                    if name in df.columns:
                        return name
                    # case-insensitive match
                    lname = str(name).strip().lower()
                    for col in df.columns:
                        try:
                            if str(col).strip().lower() == lname:
                                return col
                        except Exception:
                            continue
                    return None

                # Build keep list in order: selected cols that exist (canonicalized) + available force keys
                keep = []
                for sc in selected_cols:
                    c = _canon_for_selected(sc)
                    if c and c not in keep:
                        keep.append(c)
                for k in force_keys:
                    if k in df.columns and k not in keep:
                        keep.append(k)
                if keep:
                    df = df.loc[:, [c for c in keep if c in df.columns]]
                    # Replace selected_cols with the canonicalized/available column names we kept.
                    # This ensures downstream logic checks the canonical names rather than
                    # the original user-supplied strings (which might be synonyms).
                    try:
                        selected_cols = [c for c in keep if c in df.columns]
                    except Exception:
                        selected_cols = keep
        except Exception:
            # non-fatal: proceed with original df
            pass

        def _bool(v):
            s = str(v).strip().lower()
            return s in ("1","true","yes","y","t")

        # Preview returns top rows
        if action == 'preview':
            # Format numeric "number" columns (e.g., prv_number, mg_number) to remove trailing .0
            try:
                import pandas as _pd
                for col in list(df.columns):
                    if col.endswith('_number') and col in df.columns:
                        try:
                            df[col] = df[col].apply(lambda v: (int(v) if (isinstance(v, (int,)) or (isinstance(v, float) and not _pd.isna(v) and float(v).is_integer())) else v))
                        except Exception:
                            # fallback: coerce numeric-like strings
                            def _fmt(v):
                                try:
                                    if v is None:
                                        return v
                                    sv = str(v).strip()
                                    if sv.replace('.', '', 1).isdigit():
                                        fv = float(sv)
                                        return int(fv) if fv.is_integer() else v
                                except Exception:
                                    pass
                                return v
                            df[col] = df[col].apply(_fmt)
            except Exception:
                pass
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
                    payload = self._process_confirm(service, df, user_obj, track_id=upload_id, auto_create_docrec=auto_create_docrec, selected_cols=selected_cols)
                threading.Thread(target=_bg, daemon=True).start()
                return Response({"error": False, "mode": "started", "upload_id": upload_id, "total": len(df.index)})
            else:
                payload = self._process_confirm(service, df, request.user, auto_create_docrec=auto_create_docrec, selected_cols=selected_cols)
                status_code = 200 if not payload.get('error') else 500
                # Adjust absolute URL for log if present
                if payload.get('log_url') and not payload['log_url'].startswith('http'):
                    try:
                        payload['log_url'] = request.build_absolute_uri(payload['log_url'])
                    except Exception:
                        logging.exception('Failed to build absolute log_url')
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
            # doc_rec is stored as a string; iterate normally
            for m in MigrationRecord.objects.all()[:5000]:
                if not m.doc_rec:
                    add('MISSING_DOC_REC', m.mg_number, 'No doc_rec linked')

        elif service == BulkService.PROVISIONAL:
            dups = ProvisionalRecord.objects.values('prv_number').annotate(c=models.Count('id')).filter(c__gt=1)
            for d in dups:
                add('DUPLICATE_PRV_NUMBER', d['prv_number'], f"Appears {d['c']} times")
            # doc_rec is stored as a string (doc_rec_id). No select_related.
            for p in ProvisionalRecord.objects.all()[:5000]:
                if not p.doc_rec:
                    add('MISSING_DOC_REC', p.prv_number, 'No doc_rec linked')

        elif service == BulkService.VERIFICATION:
            dups = Verification.objects.values('final_no').annotate(c=models.Count('id')).filter(final_no__isnull=False, final_no__gt='', c__gt=1)
            for d in dups:
                add('DUPLICATE_FINAL_NO', d['final_no'], f"Appears {d['c']} times")
            for v in Verification.objects.select_related('doc_rec')[:5000]:
                # enrollment_no is now a CharField (not FK)
                if not v.enrollment_no:
                    add('MISSING_ENROLLMENT', v.id, 'No enrollment_no provided')
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

