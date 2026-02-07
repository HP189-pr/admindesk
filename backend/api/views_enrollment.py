"""Enrollment-specific API views."""
from __future__ import annotations

import pandas as pd
from django.db import models
from django.db.models import Count, Q, Value
from django.db.models.functions import Lower, Replace, Coalesce
from django.http import HttpResponse
from rest_framework import viewsets, status
from rest_framework.decorators import action
from rest_framework.pagination import PageNumberPagination
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView

from .models import Enrollment, AdmissionCancel
from .serializers_enrollment import EnrollmentSerializer, AdmissionCancelSerializer

BATCH_DEFAULTS = [2017, 2018, 2019, 2020, 2021, 2022, 2023, 2024]


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


class AdmissionCancelViewSet(viewsets.ModelViewSet):
    queryset = AdmissionCancel.objects.select_related('enrollment').order_by('-cancel_date', '-id')
    serializer_class = AdmissionCancelSerializer
    permission_classes = [IsAuthenticated]

    def get_queryset(self):
        qs = super().get_queryset()
        search = self.request.query_params.get('search', '').strip()
        status_filter = self.request.query_params.get('status', '').strip().upper()

        if search:
            qs = qs.filter(
                Q(enrollment__enrollment_no__icontains=search) |
                Q(student_name__icontains=search) |
                Q(inward_no__icontains=search) |
                Q(outward_no__icontains=search)
            )

        if status_filter in {AdmissionCancel.STATUS_CANCELLED, AdmissionCancel.STATUS_REVOKED}:
            qs = qs.filter(status=status_filter)

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


__all__ = [
    'EnrollmentViewSet',
    'AdmissionCancelViewSet',
    'EnrollmentStatsView',
]
