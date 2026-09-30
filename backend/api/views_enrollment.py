# backend/api/views_enrollment.py
"""Enrollment-specific API views."""
from __future__ import annotations

from datetime import date
import pandas as pd
from django.db import models
from django.db.models import Case, CharField, Count, F, Max, Min, Q, Subquery, Value, When
from django.db.models.functions import Lower, Replace, Coalesce, Trim, NullIf
from django.http import HttpResponse
from rest_framework import viewsets, status
from rest_framework.decorators import action
from rest_framework.pagination import PageNumberPagination
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView

from .analytics_documents import DOCUMENTS, display_value, document_options, scoped_documents, document_trend, document_page
from .models import Enrollment, AdmissionCancel
from .domain_degree import StudentDegree
from .domain_verification import MigrationRecord, ProvisionalRecord, Verification, VerificationStatus
from .serializers_enrollment import EnrollmentSerializer, AdmissionCancelSerializer

BATCH_DEFAULTS = [2007, 2008, 2009, 2010, 2011, 2012, 2013, 2014, 2015, 2016, 2017, 2018, 2019, 2020, 2021, 2022, 2023, 2024, 2025, 2026, 2027, 2028]


def _normalize_subcourse_name(value):
    if isinstance(value, str):
        cleaned = value.strip()
        return cleaned or "Unknown Course"
    return "Unknown Course"


def _resolve_batches(raw_values):
    parsed = []
    for value in raw_values:
        try:
            parsed.append(int(value))
        except (TypeError, ValueError):
            continue
    unique_batches = sorted(set(parsed))
    return unique_batches if unique_batches else BATCH_DEFAULTS.copy()


def _ordered_subcourses(extra_names=None):
    extra_names = extra_names or []
    ordered = []
    seen = set()

    def _add(name):
        normalized = _normalize_subcourse_name(name)
        if normalized not in seen:
            seen.add(normalized)
            ordered.append(normalized)

    from .domain_courses import SubBranch  # Local import to avoid cycles during startup

    for name in SubBranch.objects.order_by("subcourse_name").values_list("subcourse_name", flat=True):
        _add(name)
    for name in extra_names:
        _add(name)

    return ordered


def _zero_frame(batches, subcourses):
    if not subcourses:
        return pd.DataFrame(columns=["subcourse_name"] + batches)

    template = {batch: 0 for batch in batches}
    rows = []
    for subcourse in subcourses:
        row = {"subcourse_name": subcourse}
        row.update(template)
        rows.append(row)
    return pd.DataFrame(rows)


class EnrollmentPagination(PageNumberPagination):
    page_size = 10
    page_size_query_param = "limit"
    page_query_param = "page"


class EnrollmentViewSet(viewsets.ModelViewSet):
    queryset = Enrollment.objects.select_related(
        "institute", "subcourse", "maincourse", "updated_by"
    ).order_by("-created_at")
    serializer_class = EnrollmentSerializer
    lookup_field = "id"
    permission_classes = [IsAuthenticated]
    pagination_class = EnrollmentPagination

    def get_queryset(self):
        qs = super().get_queryset()
        search = self.request.query_params.get("search", "").strip()
        cancel_filter = (self.request.query_params.get("cancel") or "").lower()

        if search:
            norm_q = ''.join(search.split()).lower()
            qs = qs.annotate(
                norm_en=Replace(
                    Replace(
                        Replace(
                            Lower(Coalesce(models.F('enrollment_no'), Value(''))),
                            Value(' '), Value('')
                        ),
                        Value('.'), Value('')
                    ),
                    Value('-'), Value('')
                ),
                norm_temp=Replace(
                    Replace(
                        Replace(
                            Lower(Coalesce(models.F('temp_enroll_no'), Value(''))),
                            Value(' '), Value('')
                        ),
                        Value('.'), Value('')
                    ),
                    Value('-'), Value('')
                ),
            ).filter(
                Q(norm_en__contains=norm_q) |
                Q(norm_temp__contains=norm_q) |
                Q(enrollment_no__icontains=search) |
                Q(temp_enroll_no__icontains=search) |
                Q(student_name__icontains=search)
            )

        if cancel_filter == 'yes':
            qs = qs.filter(cancel=True)
        elif cancel_filter == 'no':
            qs = qs.filter(Q(cancel=False) | Q(cancel__isnull=True))

        return qs

    @action(detail=False, methods=['get'], url_path='by-number')
    def by_number(self, request):
        """Fetch enrollment by enrollment_no query param."""
        enrollment_no = request.query_params.get('enrollment_no', '').strip()
        if not enrollment_no:
            return Response(
                {"detail": "enrollment_no parameter required"},
                status=status.HTTP_400_BAD_REQUEST
            )

        obj = Enrollment.objects.filter(enrollment_no=enrollment_no).select_related(
            "institute", "subcourse", "maincourse", "updated_by"
        ).first()

        if not obj:
            return Response(
                {"detail": "Enrollment not found"},
                status=status.HTTP_404_NOT_FOUND
            )

        serializer = self.get_serializer(obj)
        return Response(serializer.data)

    def perform_create(self, serializer):
        serializer.save(updated_by=self.request.user if self.request.user.is_authenticated else None)

    @action(detail=False, methods=['get'], url_path='report-summary')
    def report_summary(self, request):
        """Aggregated summary for enrollment report (single lightweight call)."""
        group_by = (request.query_params.get('group_by') or 'batch').strip().lower()
        if group_by not in {'batch', 'institute', 'course', 'status'}:
            group_by = 'batch'

        status_filter = (request.query_params.get('status') or 'all').strip().lower()
        batch_filter = (request.query_params.get('batch') or '').strip()
        institute_filter = (request.query_params.get('institute') or '').strip()
        course_filter = (request.query_params.get('course') or '').strip()

        qs = Enrollment.objects.select_related('institute', 'maincourse')

        if status_filter == 'active':
            qs = qs.filter(Q(cancel=False) | Q(cancel__isnull=True))
        elif status_filter == 'cancelled':
            qs = qs.filter(cancel=True)

        if batch_filter and batch_filter.lower() != 'all':
            try:
                qs = qs.filter(batch=int(batch_filter))
            except (TypeError, ValueError):
                return Response({'detail': 'Invalid batch filter.'}, status=status.HTTP_400_BAD_REQUEST)

        if institute_filter and institute_filter.lower() != 'all':
            try:
                qs = qs.filter(institute_id=int(institute_filter))
            except (TypeError, ValueError):
                return Response({'detail': 'Invalid institute filter.'}, status=status.HTTP_400_BAD_REQUEST)

        if course_filter and course_filter.lower() != 'all':
            qs = qs.filter(maincourse_id=course_filter)

        totals_raw = qs.aggregate(
            total=Count('id'),
            active=Count('id', filter=Q(cancel=False) | Q(cancel__isnull=True)),
            cancelled=Count('id', filter=Q(cancel=True)),
        )

        count_annotations = {
            'total': Count('id'),
            'active': Count('id', filter=Q(cancel=False) | Q(cancel__isnull=True)),
            'cancelled': Count('id', filter=Q(cancel=True)),
        }

        rows = []
        if group_by == 'batch':
            grouped = qs.values('batch').annotate(**count_annotations).order_by('-batch')
            rows = [
                {
                    'group': str(item.get('batch')) if item.get('batch') is not None else '-',
                    'total': int(item.get('total') or 0),
                    'active': int(item.get('active') or 0),
                    'cancelled': int(item.get('cancelled') or 0),
                }
                for item in grouped
            ]
        elif group_by == 'institute':
            grouped = (
                qs.values('institute_id', 'institute__institute_code', 'institute__institute_name')
                .annotate(**count_annotations)
                .order_by('institute__institute_code', 'institute__institute_name', 'institute_id')
            )
            for item in grouped:
                code = (item.get('institute__institute_code') or '').strip()
                name = (item.get('institute__institute_name') or '').strip()
                label = f"{code} - {name}" if code and name else (code or name or str(item.get('institute_id') or '-'))
                rows.append({
                    'group': label,
                    'total': int(item.get('total') or 0),
                    'active': int(item.get('active') or 0),
                    'cancelled': int(item.get('cancelled') or 0),
                })
        elif group_by == 'course':
            grouped = (
                qs.values('maincourse_id', 'maincourse__course_code', 'maincourse__course_name')
                .annotate(**count_annotations)
                .order_by('maincourse__course_code', 'maincourse__course_name', 'maincourse_id')
            )
            for item in grouped:
                code = (item.get('maincourse__course_code') or '').strip()
                name = (item.get('maincourse__course_name') or '').strip()
                maincourse_id = (item.get('maincourse_id') or '').strip()
                label = f"{code} - {name}" if code and name else (name or code or maincourse_id or '-')
                rows.append({
                    'group': label,
                    'total': int(item.get('total') or 0),
                    'active': int(item.get('active') or 0),
                    'cancelled': int(item.get('cancelled') or 0),
                })
        else:
            grouped = (
                qs.annotate(
                    status_group=Case(
                        When(cancel=True, then=Value('Cancelled')),
                        default=Value('Active'),
                        output_field=CharField(),
                    ),
                    status_order=Case(
                        When(cancel=True, then=Value(2)),
                        default=Value(1),
                        output_field=models.IntegerField(),
                    ),
                )
                .values('status_group', 'status_order')
                .annotate(**count_annotations)
                .order_by('status_order')
            )
            rows = [
                {
                    'group': item.get('status_group') or '-',
                    'total': int(item.get('total') or 0),
                    'active': int(item.get('active') or 0),
                    'cancelled': int(item.get('cancelled') or 0),
                }
                for item in grouped
            ]

        option_source = Enrollment.objects.select_related('institute', 'maincourse')

        batch_options = [
            {'value': str(batch), 'label': str(batch)}
            for batch in option_source.exclude(batch__isnull=True).values_list('batch', flat=True).distinct().order_by('-batch')
        ]

        institute_options = []
        for item in (
            option_source.values('institute_id', 'institute__institute_code', 'institute__institute_name')
            .distinct()
            .order_by('institute__institute_code', 'institute__institute_name', 'institute_id')
        ):
            code = (item.get('institute__institute_code') or '').strip()
            name = (item.get('institute__institute_name') or '').strip()
            label = f"{code} - {name}" if code and name else (code or name or str(item.get('institute_id') or '-'))
            institute_options.append({
                'value': str(item.get('institute_id')),
                'label': label,
            })

        course_options = []
        for item in (
            option_source.values('maincourse_id', 'maincourse__course_code', 'maincourse__course_name')
            .distinct()
            .order_by('maincourse__course_code', 'maincourse__course_name', 'maincourse_id')
        ):
            code = (item.get('maincourse__course_code') or '').strip()
            name = (item.get('maincourse__course_name') or '').strip()
            maincourse_id = (item.get('maincourse_id') or '').strip()
            label = f"{code} - {name}" if code and name else (name or code or maincourse_id or '-')
            course_options.append({
                'value': maincourse_id,
                'label': label,
            })

        return Response({
            'rows': rows,
            'totals': {
                'total': int(totals_raw.get('total') or 0),
                'active': int(totals_raw.get('active') or 0),
                'cancelled': int(totals_raw.get('cancelled') or 0),
            },
            'options': {
                'batches': batch_options,
                'institutes': institute_options,
                'courses': course_options,
            },
        })


class AdmissionCancelViewSet(viewsets.ModelViewSet):
    queryset = AdmissionCancel.objects.select_related('enrollment').filter(
        status=AdmissionCancel.STATUS_CANCELLED
    ).order_by(F('outward_date').desc(nulls_last=True), '-id')
    serializer_class = AdmissionCancelSerializer
    permission_classes = [IsAuthenticated]
    pagination_class = None  # Return all records without pagination

    def get_queryset(self):
        qs = super().get_queryset()
        search = self.request.query_params.get('search', '').strip()

        if search:
            qs = qs.filter(
                Q(enrollment__enrollment_no__icontains=search) |
                Q(student_name__icontains=search) |
                Q(inward_no__icontains=search)
            )

        return qs


class EnrollmentStatsView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request):
        batches = _resolve_batches(request.query_params.getlist("batch"))

        qs = (
            Enrollment.objects
            .filter(Q(cancel=False) | Q(cancel__isnull=True))
            .filter(batch__in=batches)
            .values("subcourse__subcourse_name", "batch")
            .annotate(total=Count("id"))
            .order_by("subcourse__subcourse_name", "batch")
        )

        records = list(qs)
        pivot = None
        if records:
            df = pd.DataFrame(records)
            df.rename(
                columns={"subcourse__subcourse_name": "subcourse_name"},
                inplace=True
            )
            df["subcourse_name"] = df["subcourse_name"].apply(_normalize_subcourse_name)

            pivot = df.pivot_table(
                index="subcourse_name",
                columns="batch",
                values="total",
                aggfunc="sum",
                fill_value=0
            ).reset_index()

        existing_names = pivot["subcourse_name"].tolist() if pivot is not None and not pivot.empty else []
        subcourse_order = _ordered_subcourses(existing_names)

        if pivot is None or pivot.empty:
            pivot = _zero_frame(batches, subcourse_order)
        else:
            for batch in batches:
                if batch not in pivot.columns:
                    pivot[batch] = 0

            ordered_cols = ["subcourse_name"] + batches
            pivot = pivot[ordered_cols]

            if subcourse_order:
                pivot.set_index("subcourse_name", inplace=True)
                pivot = pivot.reindex(subcourse_order, fill_value=0).reset_index()

        numeric_cols = [c for c in pivot.columns if c != "subcourse_name"]
        if numeric_cols:
            pivot[numeric_cols] = pivot[numeric_cols].apply(pd.to_numeric, errors="coerce").fillna(0).astype(int)
            total_row = {"subcourse_name": "GRAND TOTAL"}
            for col in numeric_cols:
                total_row[col] = int(pivot[col].sum())
            pivot = pd.concat(
                [pivot, pd.DataFrame([total_row])],
                ignore_index=True
            )

        if request.query_params.get("export") == "excel":
            response = HttpResponse(
                content_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
            )
            response["Content-Disposition"] = (
                'attachment; filename="Enrollment_By_Subcourse_Batch.xlsx"'
            )

            with pd.ExcelWriter(response, engine="openpyxl") as writer:
                pivot.to_excel(writer, index=False, sheet_name="Enrollment Summary")

            return response

        return Response({
            "columns": list(pivot.columns),
            "data": pivot.to_dict(orient="records"),
        })


class EnrollmentAnalyticsView(APIView):
    """Return filterable enrollment analytics without loading the full table in the browser."""

    permission_classes = [IsAuthenticated]

    @staticmethod
    def _clean(value):
        value = str(value or '').strip()
        return '' if value.lower() in {'all', 'undefined', 'null'} else value

    @staticmethod
    def _label(code, name, fallback='Unknown'):
        code = str(code or '').strip()
        name = str(name or '').strip()
        if code and name:
            return f'{code} - {name}'
        return name or code or fallback

    @staticmethod
    def _normalize_gender(value):
        value = str(value or '').strip()
        key = value.casefold()
        if key in {'', 'na', 'n/a', 'null', 'none', '0'}:
            return None
        return {
            'm': 'Male', 'male': 'Male', 'mlae': 'Male',
            'o': 'Other', 'other': 'Other',
            'f': 'Female', 'female': 'Female', 'femal': 'Female',
            'femail': 'Female', 'femae': 'Female', 'famale': 'Female',
        }.get(key, value)

    @classmethod
    def _resolved_genders(cls):
        # Bulk reads avoid a separate degree lookup for each student. Highest ID
        # wins among degree rows with a usable gender; profile data takes priority.
        degree_genders = {}
        for number, raw in StudentDegree.objects.order_by('-id').values_list('enrollment_no', 'dg_gender').iterator(chunk_size=2000):
            gender = cls._normalize_gender(raw)
            if number and gender:
                degree_genders.setdefault(number, gender)
        return {
            pk: cls._normalize_gender(raw) or degree_genders.get(number) or 'NA'
            for pk, number, raw in Enrollment.objects.order_by().values_list(
                'pk', 'enrollment_no', 'student_profile__gender'
            ).iterator(chunk_size=2000)
        }

    def get(self, request):
        main_course = self._clean(request.query_params.get('main_course'))
        sub_course = self._clean(request.query_params.get('sub_course'))
        department = self._clean(request.query_params.get('department'))
        gender = self._clean(request.query_params.get('gender'))
        category = self._clean(request.query_params.get('category'))
        search = self._clean(request.query_params.get('search'))
        status_filter = self._clean(request.query_params.get('status')) or 'all'

        try:
            year_from = int(request.query_params.get('year_from')) if request.query_params.get('year_from') else None
            year_to = int(request.query_params.get('year_to')) if request.query_params.get('year_to') else None
        except (TypeError, ValueError):
            return Response({'detail': 'Invalid year filter.'}, status=status.HTTP_400_BAD_REQUEST)

        batch_values = []
        for value in request.query_params.getlist('batch'):
            try:
                batch_values.append(int(value))
            except (TypeError, ValueError):
                continue
        batch_values = sorted(set(batch_values))

        resolved_genders = self._resolved_genders()
        qs = Enrollment.objects.select_related('institute', 'maincourse', 'subcourse', 'student_profile')
        if status_filter == 'active':
            qs = qs.filter(Q(cancel=False) | Q(cancel__isnull=True))
        elif status_filter == 'cancelled':
            qs = qs.filter(cancel=True)
        if main_course:
            qs = qs.filter(maincourse_id=main_course)
        if sub_course:
            qs = qs.filter(subcourse_id=sub_course)
        if department:
            try:
                qs = qs.filter(institute_id=int(department))
            except (TypeError, ValueError):
                return Response({'detail': 'Invalid department filter.'}, status=status.HTTP_400_BAD_REQUEST)
        qs = qs.annotate(category_key=Lower(Trim('student_profile__category'))).annotate(
            category_label=Case(
                When(Q(category_key__isnull=True) | Q(category_key__in=['', 'null', 'none', 'undefined', 'n/a', 'na']), then=Value('NA')),
                default=Trim('student_profile__category'), output_field=CharField(),
            ),
        )
        if gender:
            selected_gender = self._normalize_gender(gender) or 'NA'
            qs = qs.filter(pk__in=[pk for pk, value in resolved_genders.items() if value.casefold() == selected_gender.casefold()])
        if category:
            qs = qs.filter(category_label__iexact=category)
        if year_from is not None and year_to is not None and year_from > year_to:
            return Response({'detail': 'Year From must not exceed Year To.'}, status=400)
        if batch_values:
            qs = qs.filter(batch__in=batch_values)
        if year_from is not None:
            qs = qs.filter(batch__gte=year_from)
        if year_to is not None:
            qs = qs.filter(batch__lte=year_to)
        if search:
            qs = qs.filter(
                Q(student_name__icontains=search)
                | Q(enrollment_no__icontains=search)
                | Q(temp_enroll_no__icontains=search)
                | Q(enrollment_no__in=StudentDegree.objects.filter(dg_sr_no__icontains=search).values('enrollment_no'))
                | Q(enrollment_no__in=ProvisionalRecord.objects.filter(prv_number__icontains=search).values('enrollment_id'))
                | Q(enrollment_no__in=MigrationRecord.objects.filter(mg_number__icontains=search).values('enrollment_id'))
                | Q(enrollment_no__in=Verification.objects.filter(final_no__icontains=search).values('enrollment_no'))
            )

        # Independent document counts avoid multiplying students across joins.
        certificate_sources = {
            'degree': (StudentDegree.objects.all(), 'enrollment_no'),
            'provisional': (ProvisionalRecord.objects.filter(Q(prv_status__iexact='Issued') | Q(prv_status__isnull=True) | Q(prv_status='')), 'enrollment_id'),
            'migration': (MigrationRecord.objects.filter(mg_status__iexact='Issued').exclude(mg_cancelled__iexact='Yes'), 'enrollment_id'),
            'verification': (Verification.objects.filter(status__in=[VerificationStatus.DONE, VerificationStatus.DONE_WITH_REMARKS]), 'enrollment_no'),
        }
        try:
            issue_from = date.fromisoformat(request.query_params['issue_date_from']) if request.query_params.get('issue_date_from') else None
            issue_to = date.fromisoformat(request.query_params['issue_date_to']) if request.query_params.get('issue_date_to') else None
        except (TypeError, ValueError):
            return Response({'detail': 'Invalid document date. Use YYYY-MM-DD.'}, status=400)
        if issue_from and issue_to and issue_from > issue_to:
            return Response({'detail': 'Document date From must not exceed To.'}, status=400)
        if issue_from or issue_to:
            for name, (source, field) in list(certificate_sources.items()):
                date_field = DOCUMENTS[name]['date']
                if not date_field:
                    source = source.none()
                else:
                    if issue_from:
                        source = source.filter(**{date_field + '__gte': issue_from})
                    if issue_to:
                        source = source.filter(**{date_field + '__lte': issue_to})
                certificate_sources[name] = (source, field)
        certificate = self._clean(request.query_params.get('certificate'))
        certificate_matches = Q()
        for name, (source, field) in certificate_sources.items():
            match = Q(enrollment_no__in=Subquery(source.exclude(**{field + '__isnull': True}).order_by().values(field)))
            if certificate == name:
                qs = qs.filter(match)
            certificate_matches |= match
        if (issue_from or issue_to) and not certificate:
            qs = qs.filter(certificate_matches)
        if certificate == 'none':
            qs = qs.exclude(certificate_matches)
        elif certificate == 'any':
            qs = qs.filter(certificate_matches)
        elif certificate and certificate not in certificate_sources:
            return Response({'detail': 'Invalid certificate filter.'}, status=400)
        totals = qs.aggregate(
            total=Count('id'), main_courses=Count('maincourse_id', distinct=True),
            sub_courses=Count('subcourse_id', distinct=True), departments=Count('institute_id', distinct=True),
            batches=Count('batch', distinct=True), year_from=Min('batch'), year_to=Max('batch'),
        )
        if certificate in certificate_sources:
            certificate_sources = {key: (source if key == certificate else source.none(), field) for key, (source, field) in certificate_sources.items()}
        certificate_sources = scoped_documents(certificate_sources, qs)
        certificate_counts = {
            name: {row[field]: row['n'] for row in source.order_by().values(field).annotate(n=Count('pk'))}
            for name, (source, field) in certificate_sources.items()
        }
        dimensions = {'Institute': 'institute__institute_name', 'Main Course': 'maincourse__course_name',
                      'Sub Course': 'subcourse__subcourse_name', 'Admission Year': 'batch',
                      'Gender': 'gender_label', 'Category': 'category_label'}
        cross_dimensions = {
            'Institute': ('institute_id', 'department'), 'Main Course': ('maincourse_id', 'mainCourse'),
            'Sub Course': ('subcourse_id', 'subCourse'), 'Gender': ('gender_label', 'gender'), 'Category': ('category_label', 'category'),
        }
        cross = {name: {} for name in cross_dimensions}
        grouped = {name: {} for name in dimensions}
        issuance_summary = {name: 0 for name in certificate_sources}
        for row in qs.order_by().values('pk', 'enrollment_no', 'institute_id', 'maincourse_id', 'subcourse_id', *[field for field in dimensions.values() if field != 'gender_label']).iterator(chunk_size=2000):
            row['gender_label'] = resolved_genders.get(row['pk'], 'NA')
            counts = {name: values.get(row['enrollment_no'], 0) if row['enrollment_no'] else 0 for name, values in certificate_counts.items()}
            for name, count in counts.items():
                issuance_summary[name] += count
            for name, field in dimensions.items():
                label = row[field] if row[field] is not None else 'NA'
                item = grouped[name].setdefault(label, {'group': label, 'students': 0, **{key: 0 for key in certificate_sources}})
                item['students'] += 1
                for key, count in counts.items():
                    item[key] += count
            for name, (id_field, filter_key) in cross_dimensions.items():
                value = str(row[id_field])
                label = display_value(row[dimensions[name]])
                item = cross[name].setdefault(value, {'value': value, 'label': label, 'filters': {filter_key: value}, 'years': {}, 'documents': {key: 0 for key in certificate_sources}, 'total': 0})
                year = str(row['batch'])
                item['years'][year] = item['years'].get(year, 0) + 1
                item['total'] += 1
                for key, count in counts.items():
                    item['documents'][key] += count
        breakdowns = {name: sorted(rows.values(), key=lambda row: str(row['group'])) for name, rows in grouped.items()}
        cross_analysis = {name: sorted(rows.values(), key=lambda row: (-row['total'], row['label'])) for name, rows in cross.items()}
        data_quality = {name: sum(row['students'] for row in breakdowns[name] if display_value(row['group']) == 'NA') for name in ['Gender', 'Category', 'Institute']}
        documents_trend = document_trend(certificate_sources)


        trend = [
            {'year': int(row['batch']), 'total': int(row['total'])}
            for row in qs.values('batch').annotate(total=Count('id')).order_by('batch')
            if row.get('batch') is not None
        ]

        course_rows = qs.values(
            'maincourse_id', 'maincourse__course_code', 'maincourse__course_name'
        ).annotate(total=Count('id')).order_by('-total', 'maincourse__course_name')
        courses = [
            {
                'value': str(row['maincourse_id']),
                'label': self._label(row['maincourse__course_code'], row['maincourse__course_name'], str(row['maincourse_id'])),
                'total': int(row['total']),
            }
            for row in course_rows
        ]

        subcourse_rows = qs.values(
            'subcourse_id', 'subcourse__subcourse_name', 'maincourse_id'
        ).annotate(total=Count('id')).order_by('-total', 'subcourse__subcourse_name')
        subcourses = [
            {
                'value': str(row['subcourse_id']),
                'label': str(row['subcourse__subcourse_name'] or row['subcourse_id']),
                'main_course': str(row['maincourse_id']),
                'total': int(row['total']),
            }
            for row in subcourse_rows
        ]

        department_rows = qs.values(
            'institute_id', 'institute__institute_code', 'institute__institute_name'
        ).annotate(total=Count('id')).order_by('-total', 'institute__institute_name')
        departments = [
            {
                'value': str(row['institute_id']),
                'label': self._label(row['institute__institute_code'], row['institute__institute_name'], str(row['institute_id'])),
                'total': int(row['total']),
            }
            for row in department_rows
        ]

        years = [int(row['batch']) for row in qs.values('batch').distinct().order_by('batch') if row.get('batch') is not None]
        heatmap = []
        for row in qs.values(
            'maincourse_id', 'maincourse__course_code', 'maincourse__course_name', 'batch'
        ).annotate(total=Count('id')).order_by('maincourse__course_name', 'batch'):
            course_value = str(row['maincourse_id'])
            item = next((entry for entry in heatmap if entry['value'] == course_value), None)
            if item is None:
                item = {
                    'value': course_value,
                    'label': self._label(row['maincourse__course_code'], row['maincourse__course_name'], course_value),
                    'values': {},
                }
                heatmap.append(item)
            if row.get('batch') is not None:
                item['values'][str(row['batch'])] = int(row['total'])

        matrix_rows = qs.values(
            'subcourse__subcourse_name', 'batch'
        ).annotate(total=Count('id')).order_by('subcourse__subcourse_name', 'batch')
        matrix_map = {}
        for row in matrix_rows:
            label = str(row['subcourse__subcourse_name'] or 'Unknown Course')
            matrix_map.setdefault(label, {})[str(row['batch'])] = int(row['total'])
        matrix = [
            {
                'subcourse_name': label,
                'values': {str(year): values.get(str(year), 0) for year in years},
                'total': sum(values.values()),
            }
            for label, values in matrix_map.items()
        ]

        try:
            page = max(int(request.query_params.get('page', 1)), 1)
            page_size = min(max(int(request.query_params.get('page_size', 25)), 1), 100)
        except (TypeError, ValueError):
            page, page_size = 1, 25
        export_all = request.query_params.get('export') in {'excel', 'json'}
        certificate_records = document_page({key: value for key, value in certificate_sources.items() if DOCUMENTS[key]['kind'] == 'certificate' and (certificate not in DOCUMENTS or certificate == key)}, page, page_size, export_all)
        verification_source = Verification.objects.none() if certificate in DOCUMENTS and certificate != 'verification' else Verification.objects.all()
        if issue_from:
            verification_source = verification_source.filter(vr_done_date__gte=issue_from)
        if issue_to:
            verification_source = verification_source.filter(vr_done_date__lte=issue_to)
        verification_source = scoped_documents({'verification': (verification_source, 'enrollment_no')}, qs)
        verification_records = document_page(verification_source, page, page_size, export_all)
        verification_summary = [{ 'status': display_value(row['status']), 'total': row['total']} for row in verification_source['verification'][0].order_by().values('status').annotate(total=Count('pk'))]
        ordered_records = qs.order_by('-batch', 'maincourse__course_name', 'subcourse__subcourse_name', 'student_name', 'id')
        total_records = ordered_records.count()
        start = (page - 1) * page_size
        records = [
            {
                **{name: certificate_counts[name].get(record.enrollment_no, 0) if record.enrollment_no else 0 for name in certificate_sources},
                'id': record.id,
                'enrollment_no': record.enrollment_no or record.temp_enroll_no or '',
                'student_name': record.student_name or '',
                'main_course': self._label(record.maincourse.course_code, record.maincourse.course_name, record.maincourse.maincourse_id),
                'main_course_value': record.maincourse.maincourse_id,
                'sub_course': record.subcourse.subcourse_name or record.subcourse.subcourse_id,
                'sub_course_value': record.subcourse.subcourse_id,
                'department': self._label(record.institute.institute_code, record.institute.institute_name, str(record.institute.institute_id)),
                'department_value': record.institute.institute_id,
                'gender': resolved_genders.get(record.pk, 'NA'),
                'category': record.category_label,
                'batch': record.batch,
                'status': 'Cancelled' if record.cancel else 'Active',
            }
            for record in (ordered_records if request.query_params.get('export') == 'json' else ordered_records[start:start + page_size])
        ]

        records = [{key: display_value(value) for key, value in row.items()} for row in records]

        if request.query_params.get('export') == 'excel':
            export_rows = [
                {
                    **{name.title(): certificate_counts[name].get(record.enrollment_no, 0) if record.enrollment_no else 0 for name in certificate_sources},
                    'Enrollment No': record.enrollment_no or record.temp_enroll_no or '',
                    'Student Name': record.student_name or '',
                    'Main Course': self._label(record.maincourse.course_code, record.maincourse.course_name, record.maincourse.maincourse_id),
                    'Sub Course': record.subcourse.subcourse_name or record.subcourse.subcourse_id,
                    'Department': self._label(record.institute.institute_code, record.institute.institute_name, str(record.institute.institute_id)),
                    'Gender': resolved_genders.get(record.pk, 'NA'),
                    'Category': record.category_label,
                    'Batch': record.batch,
                    'Status': 'Cancelled' if record.cancel else 'Active',
                }
                for record in ordered_records
            ]
            export_rows = [{key: display_value(value) for key, value in row.items()} for row in export_rows]
            response = HttpResponse(content_type='application/vnd.openxmlformats-officedocument.spreadsheetml.sheet')
            response['Content-Disposition'] = 'attachment; filename="Enrollment_Analytics.xlsx"'
            with pd.ExcelWriter(response, engine='openpyxl') as writer:
                pd.DataFrame([{key: ', '.join(request.query_params.getlist(key)) for key in request.query_params if key not in {'export', 'page', 'page_size'}}]).to_excel(writer, index=False, sheet_name='Filters')
                pd.DataFrame([{'Students': totals['total'], **issuance_summary}]).to_excel(writer, index=False, sheet_name='Summary')
                for name, data in [('Certificate Records', certificate_records), ('Verification Records', verification_records)]:
                    if data['count']:
                        pd.DataFrame(data['results']).drop(columns=['record_id'], errors='ignore').to_excel(writer, index=False, sheet_name=name)
                pd.DataFrame(documents_trend['rows']).to_excel(writer, index=False, sheet_name='Document Timeline')
                pd.DataFrame(verification_summary).to_excel(writer, index=False, sheet_name='Verification Status')
                pd.DataFrame([issuance_summary]).to_excel(writer, index=False, sheet_name='Certificate Totals')
                for name, rows in breakdowns.items():
                    pd.DataFrame(rows).to_excel(writer, index=False, sheet_name=name)
                pd.DataFrame(export_rows).to_excel(writer, index=False, sheet_name='Filtered Records')
                pd.DataFrame([
                    {'Sub Course': row['subcourse_name'], **row['values'], 'Total': row['total']}
                    for row in matrix
                ]).to_excel(writer, index=False, sheet_name='Summary Matrix')
            return response

        option_qs = Enrollment.objects.select_related('institute', 'maincourse', 'subcourse', 'student_profile')
        if status_filter == 'active':
            option_qs = option_qs.filter(Q(cancel=False) | Q(cancel__isnull=True))
        if main_course:
            option_qs = option_qs.filter(maincourse_id=main_course)
        option_subcourses = option_qs.values('subcourse_id', 'subcourse__subcourse_name').distinct().order_by('subcourse__subcourse_name')
        option_departments = option_qs.values('institute_id', 'institute__institute_code', 'institute__institute_name').distinct().order_by('institute__institute_name')
        option_courses = Enrollment.objects.values('maincourse_id', 'maincourse__course_code', 'maincourse__course_name').distinct().order_by('maincourse__course_name')
        option_batches = Enrollment.objects.values_list('batch', flat=True).distinct().order_by('batch')
        option_genders = set(resolved_genders.values())
        option_categories = Enrollment.objects.exclude(student_profile__category__isnull=True).exclude(student_profile__category='').values_list('student_profile__category', flat=True).distinct().order_by('student_profile__category')

        return Response({
            'summary': {
                'total': int(totals['total'] or 0),
                'main_courses': int(totals['main_courses'] or 0),
                'sub_courses': int(totals['sub_courses'] or 0),
                'departments': int(totals['departments'] or 0),
                'active_batches': int(totals['batches'] or 0),
                'year_from': totals['year_from'],
                'year_to': totals['year_to'],
                'gendered_profiles': sum(row['students'] for row in breakdowns['Gender'] if row['group'] != 'NA'),
            },
            'issuance': issuance_summary,
            'cross_analysis': cross_analysis,
            'data_quality': data_quality,
            'document_trend': documents_trend,
            'certificate_records': certificate_records,
            'verification_records': verification_records,
            'verification_summary': verification_summary,
            'breakdowns': breakdowns,
            'options': {
                'batches': [int(value) for value in option_batches if value is not None],
                'courses': [
                    {'value': str(row['maincourse_id']), 'label': self._label(row['maincourse__course_code'], row['maincourse__course_name'], str(row['maincourse_id']))}
                    for row in option_courses
                ],
                'subcourses': [
                    {'value': str(row['subcourse_id']), 'label': str(row['subcourse__subcourse_name'] or row['subcourse_id'])}
                    for row in option_subcourses
                ],
                'departments': [
                    {'value': str(row['institute_id']), 'label': self._label(row['institute__institute_code'], row['institute__institute_name'], str(row['institute_id']))}
                    for row in option_departments
                ],
                'genders': sorted(set(['Male', 'Female', 'NA'] + [str(value).strip() for value in option_genders])),
                'categories': sorted(set(['NA'] + [str(display_value(value)) for value in option_categories])),
                'document_types': document_options(),
            },
            'trend': trend,
            'courses': courses,
            'subcourses': subcourses,
            'departments': departments,
            'years': years,
            'heatmap': heatmap,
            'matrix': matrix,
            'records': {
                'results': records,
                'count': total_records,
                'page': page,
                'page_size': page_size,
                'pages': (total_records + page_size - 1) // page_size,
            },
        })


__all__ = [
    'EnrollmentViewSet',
    'AdmissionCancelViewSet',
    'EnrollmentStatsView',
    'EnrollmentAnalyticsView',
]
