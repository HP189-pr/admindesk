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
from .view_bulkupload import BulkUploadView, BulkService
import logging
import re
import datetime
from django.utils import timezone
from django.db import models
from django.db.models import Q, Value, F
from django.db.models.functions import Replace, Lower

# Domain models used by several analysis views
from .domain_enrollment import Enrollment, StudentProfile
from .domain_degree import StudentDegree
from .domain_verification import MigrationRecord, ProvisionalRecord, Verification, VerificationStatus, ProvisionalStatus
from .serializers import StudentProfileSerializer
from .models import (
    DocRec, Eca, PayBy, InstLetterMain, InstLetterStudent,
    Institute, MainBranch, SubBranch
)
from .serializers import (
    DocRecSerializer, VerificationSerializer, MigrationRecordSerializer,
    ProvisionalRecordSerializer, EcaSerializer
)

# Bulk upload implementation moved to backend/api/view_bulkupload.py
# `BulkUploadView` and `BulkService` are re-exported from that module so
# existing imports and URL routing remain unchanged.


class DataAnalysisView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request):
        service = (request.query_params.get('service') or '').strip().upper()
        if not service:
            return Response({"detail": "service parameter is required"}, status=400)

        if service == BulkService.DEGREE:
            return self._degree_analysis(request)

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

    def _degree_analysis(self, request):
        qs = StudentDegree.objects.all()
        student_name_field = 'student_name_dg'

        def build_group_queryset(base_qs, issue_type, key):
            gt = (issue_type or '').strip().upper()
            q = base_qs
            if gt == 'DUPLICATE_ENROLL_NAME_MONTH_YEAR':
                parts = key.split('|') if key else []
                enrollment = parts[0] if len(parts) > 0 else ''
                name = parts[1] if len(parts) > 1 else ''
                month = parts[2] if len(parts) > 2 else ''
                year = parts[3] if len(parts) > 3 else ''
                if enrollment:
                    q = q.filter(enrollment_no__iexact=enrollment)
                if name:
                    q = q.filter(**{f"{student_name_field}__iexact": name})
                if month:
                    q = q.filter(last_exam_month__iexact=month)
                if year:
                    try:
                        q = q.filter(last_exam_year=int(year))
                    except Exception:
                        pass
                return q
            if gt == 'ENROLLMENT_SAME_NAME_DIFFER':
                if not key:
                    return q.none()
                return q.filter(enrollment_no__iexact=key)
            if gt in ('ENROLLMENT_NAME_DIFF_YEARS', 'ENROLLMENT_NAME_DIFF_MONTHS'):
                parts = key.split('|') if key else []
                enrollment = parts[0] if len(parts) > 0 else ''
                name = parts[1] if len(parts) > 1 else ''
                if not enrollment:
                    return q.none()
                q = q.filter(enrollment_no__iexact=enrollment)
                if name:
                    q = q.filter(**{f"{student_name_field}__iexact": name})
                return q
            if gt == 'NAME_SAME_DIFFERENT_ENROLLMENT':
                if not key:
                    return q.none()
                return q.filter(**{f"{student_name_field}__iexact": key})
            if gt == 'DUPLICATE_DG_SR_NO':
                if not key:
                    return q.none()
                return q.filter(dg_sr_no__iexact=key)
            if key:
                return q.filter(enrollment_no__iexact=key)
            return q.none()

        def serialize_group(issue_type, key, message, extra=None):
            group_qs = build_group_queryset(qs, issue_type, key)
            rows = list(
                group_qs
                .values(
                    'id',
                    'dg_sr_no',
                    'enrollment_no',
                    student_name_field,
                    'last_exam_month',
                    'last_exam_year',
                    'convocation_no',
                    'degree_name',
                    'institute_name_dg',
                )
                .order_by('id')
            )

            convos = []
            seen = set()
            for row in rows:
                value = row.get('convocation_no')
                if value in (None, '', 0):
                    continue
                sval = str(value).strip()
                if not sval or sval in seen:
                    continue
                seen.add(sval)
                convos.append(sval)

            payload = {
                'type': issue_type,
                'key': key,
                'message': message,
                'records': rows,
                'convocations': convos,
                'convocations_display': ', '.join(convos),
            }
            if extra:
                payload.update(extra)
            return payload

        group_key = request.query_params.get('group_key')
        group_type = request.query_params.get('group_type')
        if group_key:
            try:
                base_qs = StudentDegree.objects.all()
                q = build_group_queryset(base_qs, group_type, group_key)
                rows = list(q.values('id', 'dg_sr_no', 'enrollment_no', 'student_name_dg', 'last_exam_month', 'last_exam_year', 'convocation_no', 'degree_name', 'institute_name_dg'))
                return Response({'group_type': group_type, 'group_key': group_key, 'records': rows})
            except Exception as exc:
                return Response({'detail': str(exc)}, status=500)

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

        total = qs.count()
        issues = []

        dup_exact = (
            qs.values('enrollment_no', student_name_field, 'last_exam_month', 'last_exam_year')
            .annotate(cnt=models.Count('id'))
            .filter(cnt__gt=1)
        )
        for g in dup_exact:
            key = f"{g['enrollment_no']}|{g.get(student_name_field) or ''}|{g.get('last_exam_month') or ''}|{g.get('last_exam_year') or ''}"
            issues.append(
                serialize_group(
                    'DUPLICATE_ENROLL_NAME_MONTH_YEAR',
                    key,
                    f"{g['cnt']} records with same enrollment+name+exam month+exam year",
                    {'count': g['cnt']},
                )
            )

        dup_enr_names = (
            qs.values('enrollment_no')
            .annotate(total=models.Count('id'), distinct_names=models.Count(student_name_field, distinct=True))
            .filter(distinct_names__gt=1)
        )
        for g in dup_enr_names:
            issues.append(
                serialize_group(
                    'ENROLLMENT_SAME_NAME_DIFFER',
                    g['enrollment_no'],
                    f"Enrollment {g['enrollment_no']} has {g['distinct_names']} different student names across {g['total']} records",
                    {'count': g['total']},
                )
            )

        dup_enr_name_year = (
            qs.values('enrollment_no', student_name_field)
            .annotate(distinct_years=models.Count('last_exam_year', distinct=True), total=models.Count('id'))
            .filter(distinct_years__gt=1)
        )
        for g in dup_enr_name_year:
            key = f"{g['enrollment_no']}|{g.get(student_name_field) or ''}"
            issues.append(
                serialize_group(
                    'ENROLLMENT_NAME_DIFF_YEARS',
                    key,
                    f"Enrollment+Name {key} appears in multiple exam years ({g['distinct_years']})",
                    {'count': g['total']},
                )
            )

        dup_enr_name_months = (
            qs.values('enrollment_no', student_name_field)
            .annotate(distinct_months=models.Count('last_exam_month', distinct=True), total=models.Count('id'))
            .filter(distinct_months__gt=1)
        )
        for g in dup_enr_name_months:
            key = f"{g['enrollment_no']}|{g.get(student_name_field) or ''}"
            issues.append(
                serialize_group(
                    'ENROLLMENT_NAME_DIFF_MONTHS',
                    key,
                    f"Enrollment+Name {key} appears in multiple exam months ({g['distinct_months']})",
                    {'count': g['total']},
                )
            )

        dup_name_diff_enr = (
            qs.values(student_name_field)
            .annotate(distinct_enrollments=models.Count('enrollment_no', distinct=True), total=models.Count('id'))
            .filter(distinct_enrollments__gt=1)
        )
        for g in dup_name_diff_enr:
            key = g.get(student_name_field) or ''
            issues.append(
                serialize_group(
                    'NAME_SAME_DIFFERENT_ENROLLMENT',
                    key,
                    f"Student name '{key}' appears across {g['distinct_enrollments']} different enrollment numbers",
                    {'count': g['total']},
                )
            )

        by_convocation = list(qs.values('convocation_no').annotate(count=models.Count('id')).order_by('-convocation_no'))
        by_degree = list(qs.values('degree_name').annotate(count=models.Count('id')).order_by('-count'))
        by_institute = list(qs.values('institute_name_dg').annotate(count=models.Count('id')).order_by('-count'))
        by_year = list(qs.values('last_exam_year').annotate(count=models.Count('id')).order_by('-last_exam_year'))
        by_month = list(qs.values('last_exam_month').annotate(count=models.Count('id')).order_by('-count'))

        missing_convocation_filter = models.Q(convocation_no__isnull=True) | models.Q(convocation_no__lte=0)
        missing_convocation_count = qs.filter(missing_convocation_filter).count()
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

        dup_dg_sr = (
            qs.values('dg_sr_no')
            .annotate(cnt=models.Count('id'))
            .filter(cnt__gt=1)
        )
        for g in dup_dg_sr:
            key = g.get('dg_sr_no') or ''
            issues.append(
                serialize_group(
                    'DUPLICATE_DG_SR_NO',
                    key,
                    f"{g['cnt']} records share the same degree serial number '{key}'",
                    {'count': g['cnt']},
                )
            )
            

        analysis_param = request.query_params.get('analysis')
        requested = None
        if analysis_param:
            requested = {a.strip().upper() for a in analysis_param.split(',') if a.strip()}
            issues = [it for it in issues if it.get('type') in requested]

        summary = {
            'total_issues': len(issues),
            'by_type': {}
        }
        for it in issues:
            summary['by_type'][it['type']] = summary['by_type'].get(it['type'], 0) + 1

        statistics = {
            'by_convocation': by_convocation,
            'by_degree_name': by_degree,
            'by_institute': by_institute,
            'by_year': by_year,
            'by_month': by_month,
            'missing_convocation_count': missing_convocation_count,
            'missing_exam_count': missing_exam_count,
        }

        if requested:
            stats_map = {
                'STATS_CONVOCATION': ('by_convocation', by_convocation),
                'STATS_COURSE': ('by_degree_name', by_degree),
                'STATS_COLLEGE': ('by_institute', by_institute),
                'STATS_YEAR': ('by_year', by_year),
                'STATS_MONTH': ('by_month', by_month),
            }
            filtered_stats = {}
            for key, (label, data) in stats_map.items():
                if key in requested:
                    filtered_stats[label] = data
            if filtered_stats:
                statistics = {**filtered_stats}
                statistics['missing_convocation_count'] = missing_convocation_count
                statistics['missing_exam_count'] = missing_exam_count

        response = {
            'service': 'DEGREE',
            'total_records': total,
            'filters_applied': {
                'exam_month': exam_month,
                'exam_year': exam_year,
                'convocation_no': convocation_no,
                'institute': institute,
            },
            'summary': summary,
            'issues': issues,
            'statistics': statistics,
        }

        return Response(response)
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


# Minimal re-exported viewsets for legacy router imports
class DocRecViewSet(viewsets.ModelViewSet):
    queryset = DocRec.objects.all().order_by('-id')
    serializer_class = DocRecSerializer
    permission_classes = [IsAuthenticated]

    def get_queryset(self):
        qs = super().get_queryset()
        params = getattr(self.request, 'query_params', {}) if hasattr(self, 'request') else {}

        # Optional: filter DocRec by student number (enrollment_no or temp_enroll_no) via linked services
        student_no = None
        try:
            student_no = params.get('student_no') or params.get('enrollment_no') or params.get('temp_enroll_no')
        except Exception:
            student_no = None

        if student_no:
            norm = re.sub(r'[^0-9a-z]+', '', str(student_no).lower())
            docrec_ids = set()

            # Verification links DocRec as FK; Migration/Provisional store doc_rec_id as varchar
            try:
                ver_ids = (
                    Verification.objects.annotate(
                        norm_en=Replace(Replace(Replace(Lower(models.F('enrollment_no')), models.Value(' '), models.Value('')), models.Value('.'), models.Value('')), models.Value('-'), models.Value('')),
                        norm_second=Replace(Replace(Replace(Lower(models.F('second_enrollment_id')), models.Value(' '), models.Value('')), models.Value('.'), models.Value('')), models.Value('-'), models.Value('')),
                    )
                    .filter(models.Q(norm_en__contains=norm) | models.Q(norm_second__contains=norm))
                    .values_list('doc_rec__doc_rec_id', flat=True)
                )
                docrec_ids.update([x for x in ver_ids if x])
            except Exception:
                pass

            try:
                mg_ids = (
                    MigrationRecord.objects.annotate(
                        norm_en=Replace(Replace(Replace(Lower(models.F('enrollment__enrollment_no')), models.Value(' '), models.Value('')), models.Value('.'), models.Value('')), models.Value('-'), models.Value('')),
                        norm_temp=Replace(Replace(Replace(Lower(models.F('enrollment__temp_enroll_no')), models.Value(' '), models.Value('')), models.Value('.'), models.Value('')), models.Value('-'), models.Value('')),
                    )
                    .filter(models.Q(norm_en__contains=norm) | models.Q(norm_temp__contains=norm))
                    .values_list('doc_rec', flat=True)
                )
                docrec_ids.update([x for x in mg_ids if x])
            except Exception:
                pass

            try:
                prv_ids = (
                    ProvisionalRecord.objects.annotate(
                        norm_en=Replace(Replace(Replace(Lower(models.F('enrollment__enrollment_no')), models.Value(' '), models.Value('')), models.Value('.'), models.Value('')), models.Value('-'), models.Value('')),
                        norm_temp=Replace(Replace(Replace(Lower(models.F('enrollment__temp_enroll_no')), models.Value(' '), models.Value('')), models.Value('.'), models.Value('')), models.Value('-'), models.Value('')),
                    )
                    .filter(models.Q(norm_en__contains=norm) | models.Q(norm_temp__contains=norm))
                    .values_list('doc_rec', flat=True)
                )
                docrec_ids.update([x for x in prv_ids if x])
            except Exception:
                pass

            if docrec_ids:
                qs = qs.filter(doc_rec_id__in=docrec_ids)
            else:
                return qs.none()

        search = ''
        try:
            search = params.get('search', '').strip()
        except Exception:
            search = ''

        if search:
            qs = qs.filter(
                Q(doc_rec_id__icontains=search) |
                Q(pay_rec_no__icontains=search) |
                Q(pay_rec_no_pre__icontains=search)
            )

        return qs

    def perform_create(self, serializer):
        """Create DocRec and, when apply_for=VR and enrollment info supplied,
        attempt to auto-create a linked Verification record on the server.

        This is best-effort: we only create a Verification when an Enrollment
        can be resolved (by numeric id or enrollment_no). Failures are
        swallowed to avoid blocking the primary DocRec creation flow.
        """
        # Fix: Generate doc_rec_id manually if not provided, using doc_rec_date
        # to ensure the ID year matches the selected date (not server time).
        save_kwargs = {}
        req_data = self.request.data if hasattr(self.request, 'data') else {}
        
        if not req_data.get('doc_rec_id'):
            try:
                apply_for = req_data.get('apply_for', 'VR')
                doc_date_str = req_data.get('doc_rec_date')
                if doc_date_str:
                    doc_date = datetime.datetime.strptime(doc_date_str, "%Y-%m-%d").date()
                else:
                    doc_date = timezone.localdate()
                
                yy = doc_date.year % 100
                tmp = DocRec(apply_for=apply_for, pay_by=PayBy.NA)
                prefix = tmp._prefix_for_apply()
                year_str = f"{yy:02d}"
                base = f"{prefix}{year_str}"
                
                last = DocRec.objects.filter(doc_rec_id__startswith=base).order_by("-doc_rec_id").first()
                next_num = 1
                if last and last.doc_rec_id:
                    try:
                        next_num = int(last.doc_rec_id[len(base):]) + 1
                    except Exception:
                        next_num = 1
                save_kwargs['doc_rec_id'] = f"{base}{next_num:06d}"
            except Exception:
                pass

        docrec = serializer.save(**save_kwargs)
        try:
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


    @action(detail=False, methods=["get"], url_path="next-id")
    def next_id(self, request):
        """Return the next doc_rec_id that would be assigned for a given apply_for.
        Example: /api/docrec/next-id/?apply_for=VR
        Format: pr25000001 (prefix + 2-digit year + 6-digit sequence)
        """
        apply_for = (request.query_params.get('apply_for') or '').strip().upper()
        if not apply_for:
            return Response({"detail": "apply_for is required"}, status=400)
        try:
            from .domain_documents import ApplyFor
            # Validate apply_for is a valid choice
            if apply_for not in [choice[0] for choice in ApplyFor.choices]:
                return Response({"detail": f"Invalid apply_for value: {apply_for}"}, status=400)
            
            tmp = DocRec(apply_for=apply_for, pay_by=PayBy.NA)
            
            # Use doc_rec_date from query params if provided
            doc_date_str = request.query_params.get("doc_rec_date")
            if doc_date_str:
                try:
                    doc_date = datetime.datetime.strptime(doc_date_str, "%Y-%m-%d").date()
                except Exception:
                    doc_date = timezone.localdate()
            else:
                doc_date = timezone.localdate()

            yy = doc_date.year % 100
            prefix = tmp._prefix_for_apply()
            year_str = f"{yy:02d}"
            base = f"{prefix}{year_str}"
            last = (
                DocRec.objects
                .filter(doc_rec_id__startswith=base)
                .order_by("-doc_rec_id")
                .first()
            )
            next_num = 1
            if last and last.doc_rec_id:
                try:
                    next_num = int(last.doc_rec_id[len(base):]) + 1
                except Exception:
                    next_num = 1
            return Response({"next_id": f"{base}{next_num:06d}"})
        except Exception as e:
            import traceback
            traceback.print_exc()
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
                    service_obj = InstLetterMain.objects.filter(doc_rec=doc_rec_id).first()
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
                    InstLetterStudent.objects.filter(main_verification__doc_rec=doc_rec_id).delete()
                    count = InstLetterMain.objects.filter(doc_rec=doc_rec_id).delete()[0]
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
            qs = qs.filter(
                Q(enrollment_no__icontains=search) |
                Q(student_name__icontains=search) |
                Q(final_no__icontains=search) |
                Q(doc_rec__doc_rec_id__icontains=search)
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
        params = getattr(self.request, 'query_params', {})
        search = params.get('search', '').strip() if hasattr(params, 'get') else ''
        student_no = None
        if hasattr(params, 'get'):
            student_no = params.get('student_no') or params.get('enrollment_no') or params.get('temp_enroll_no')

        norm_search = re.sub(r'[^0-9a-z]+', '', search.lower()) if search else ''
        norm_student = re.sub(r'[^0-9a-z]+', '', str(student_no).lower()) if student_no else ''

        doc_rec = params.get('doc_rec')
        if doc_rec:
            qs = qs.filter(doc_rec=doc_rec)

        if norm_search or norm_student:
            qs = qs.annotate(
                n_en=Replace(Replace(Replace(Lower(models.F('enrollment__enrollment_no')), Value(' '), Value('')), Value('.'), Value('')), Value('-'), Value('')),
                n_temp=Replace(Replace(Replace(Lower(models.F('enrollment__temp_enroll_no')), Value(' '), Value('')), Value('.'), Value('')), Value('-'), Value('')),
                n_name=Replace(Replace(Replace(Lower(models.F('student_name')), Value(' '), Value('')), Value('.'), Value('')), Value('-'), Value('')),
                n_mg=Replace(Replace(Replace(Lower(models.F('mg_number')), Value(' '), Value('')), Value('.'), Value('')), Value('-'), Value('')),
            )
            filters = Q()
            token = norm_student or norm_search
            if token:
                filters |= Q(n_en__contains=token) | Q(n_temp__contains=token)
            if norm_search:
                filters |= Q(n_name__contains=norm_search) | Q(n_mg__contains=norm_search)
            qs = qs.filter(filters)
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

    @staticmethod
    def _sanitize_fk_payload(data):
        """Drop/clear invalid FK ids so updates don't fail when the referenced course rows are absent."""
        cleaned = data.copy()

        def _safe_fk(model_cls, key, canonical_key, alt_fields=None, to_field_attr=None):
            if key not in cleaned:
                return
            val = cleaned.get(key)
            if val in (None, '', 'null', 'None'):
                cleaned.pop(key, None)
                return
            alt_fields = alt_fields or []
            obj = None
            try:
                obj = model_cls.objects.filter(pk=val).first()
                if not obj:
                    for alt in alt_fields:
                        obj = model_cls.objects.filter(**{alt: val}).first()
                        if obj:
                            break
                if obj:
                    # Use specified to_field attribute if provided; else default to pk
                    cleaned[canonical_key] = getattr(obj, to_field_attr, None) if to_field_attr else obj.pk
                else:
                    cleaned.pop(key, None)
            except Exception:
                cleaned.pop(key, None)
            if key != canonical_key and key in cleaned:
                # remove duplicate key to avoid serializer confusion
                cleaned.pop(key, None)

        # Institute can be referenced by id or code
        _safe_fk(Institute, 'institute', 'institute', ['institute_code'], to_field_attr='institute_id')
        _safe_fk(Institute, 'institute_id', 'institute', ['institute_code'], to_field_attr='institute_id')
        _safe_fk(Institute, 'institute_code', 'institute', ['institute_code'], to_field_attr='institute_id')

        # Main course can be referenced by id or course_code
        _safe_fk(MainBranch, 'maincourse', 'maincourse', ['maincourse_id', 'course_code'], to_field_attr='maincourse_id')
        _safe_fk(MainBranch, 'maincourse_id', 'maincourse', ['maincourse_id', 'course_code'], to_field_attr='maincourse_id')
        _safe_fk(MainBranch, 'maincourse_code', 'maincourse', ['maincourse_id', 'course_code'], to_field_attr='maincourse_id')

        # Sub course can be referenced by id or subcourse name/id
        _safe_fk(SubBranch, 'subcourse', 'subcourse', ['subcourse_id', 'subcourse_name'], to_field_attr='subcourse_id')
        _safe_fk(SubBranch, 'subcourse_id', 'subcourse', ['subcourse_id', 'subcourse_name'], to_field_attr='subcourse_id')
        _safe_fk(SubBranch, 'subcourse_name', 'subcourse', ['subcourse_id', 'subcourse_name'], to_field_attr='subcourse_id')

        return cleaned

    def get_queryset(self):
        qs = super().get_queryset()

        # Search on enrollment (incl. temp), student name, or provisional number (punctuation-insensitive)
        params = getattr(self.request, 'query_params', {})
        search = params.get('search', '').strip() if hasattr(params, 'get') else ''
        student_no = None
        if hasattr(params, 'get'):
            student_no = params.get('student_no') or params.get('enrollment_no') or params.get('temp_enroll_no')

        norm_search = re.sub(r'[^0-9a-z]+', '', search.lower()) if search else ''
        norm_student = re.sub(r'[^0-9a-z]+', '', str(student_no).lower()) if student_no else ''

        doc_rec = params.get('doc_rec')
        if doc_rec:
            qs = qs.filter(doc_rec=doc_rec)

        if norm_search or norm_student:
            qs = qs.annotate(
                n_en=Replace(Replace(Replace(Lower(models.F('enrollment__enrollment_no')), Value(' '), Value('')), Value('.'), Value('')), Value('-'), Value('')),
                n_temp=Replace(Replace(Replace(Lower(models.F('enrollment__temp_enroll_no')), Value(' '), Value('')), Value('.'), Value('')), Value('-'), Value('')),
                n_name=Replace(Replace(Replace(Lower(models.F('student_name')), Value(' '), Value('')), Value('.'), Value('')), Value('-'), Value('')),
                n_prv=Replace(Replace(Replace(Lower(models.F('prv_number')), Value(' '), Value('')), Value('.'), Value('')), Value('-'), Value('')),
            )
            filters = Q()
            token = norm_student or norm_search
            if token:
                filters |= Q(n_en__contains=token) | Q(n_temp__contains=token)
            if norm_search:
                filters |= Q(n_name__contains=norm_search) | Q(n_prv__contains=norm_search)
            qs = qs.filter(filters)

        # Optional filters: exact prv_number and date range on prv_date
        prv_number = (self.request.query_params.get('prv_number') or '').strip()
        if prv_number:
            qs = qs.filter(prv_number__icontains=prv_number)

        def _parse_date(val):
            try:
                return datetime.datetime.strptime(val, "%Y-%m-%d").date()
            except Exception:
                return None

        date_from = _parse_date(self.request.query_params.get('prv_date_from') or '')
        date_to = _parse_date(self.request.query_params.get('prv_date_to') or '')
        if date_from:
            qs = qs.filter(prv_date__gte=date_from)
        if date_to:
            qs = qs.filter(prv_date__lte=date_to)

        # Order: non-cancelled first, then newest/highest id
        qs = qs.annotate(
            _is_cancel=models.Case(
                models.When(prv_status__iexact=ProvisionalStatus.CANCELLED, then=models.Value(1)),
                default=models.Value(0),
                output_field=models.IntegerField(),
            )
        ).order_by('_is_cancel', '-id')

        # Limit listing to latest 500, but allow full queryset for detail/update routes
        action = getattr(self, 'action', None)
        if action in (None, 'list'):
            return qs[:500]
        return qs

    @action(detail=False, methods=["post"], url_path="update-service-only")
    def update_service_only(self, request):
        """
        Update only the ProvisionalRecord without modifying DocRec.
        Use this from the provisional page when editing service details only.
        
        Payload: { "id": 123, "enrollment": ..., "student_name": "...", ... }
        """
        provisional_id = request.data.get("id")
        provisional = None
        if provisional_id:
            provisional = ProvisionalRecord.objects.filter(id=provisional_id).first()

        # Fallback lookup: use prv_number + doc_rec to find the record when id is missing or not found
        if provisional is None:
            prv_num = request.data.get("prv_number") or request.data.get("prv_no")
            doc_rec_val = request.data.get("doc_rec") or request.data.get("doc_rec_key") or request.data.get("doc_rec_id")
            if prv_num:
                qs = ProvisionalRecord.objects.filter(prv_number=str(prv_num).strip())
                if doc_rec_val:
                    qs = qs.filter(doc_rec=str(doc_rec_val).strip())
                provisional = qs.first()

        if provisional is None:
            return Response({"error": "Provisional record not found"}, status=status.HTTP_404_NOT_FOUND)

        # Update with provided data
        payload = self._sanitize_fk_payload(request.data)
        serializer = ProvisionalRecordSerializer(provisional, data=payload, partial=True)
        if serializer.is_valid():
            serializer.save()
            return Response({
                "message": "Provisional record updated successfully",
                "id": provisional.id,
                "doc_rec_id": provisional.doc_rec
            }, status=status.HTTP_200_OK)
        return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)

    def update(self, request, *args, **kwargs):
        # Sanitize FK ids before standard update
        data = request.data
        try:
            data = data.copy() if hasattr(data, 'copy') else dict(data)
        except Exception:
            data = dict(data)
        payload = self._sanitize_fk_payload(data)
        instance = self.get_object()
        serializer = self.get_serializer(instance, data=payload, partial=kwargs.get('partial', False))
        serializer.is_valid(raise_exception=True)
        self.perform_update(serializer)
        return Response(serializer.data)


# Backward compatibility: re-export viewsets from views_Letter
# These are now maintained in views_Letter.py as InstLetterMainViewSet and InstLetterStudentViewSet
# but imported here with old names for any code that imports from views.py directly


class EcaViewSet(viewsets.ModelViewSet):
    queryset = Eca.objects.select_related('doc_rec').order_by('-id')
    serializer_class = EcaSerializer
    permission_classes = [IsAuthenticated]
