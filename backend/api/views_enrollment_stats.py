import pandas as pd
from django.http import HttpResponse
from rest_framework.views import APIView
from rest_framework.response import Response
from rest_framework.permissions import IsAuthenticated
from django.db.models import Count, Q
from .domain_enrollment import Enrollment
from .domain_courses import SubBranch

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


class EnrollmentStatsView(APIView):
    """
    Enrollment count by Subcourse & Batch

    Rows  : subcourse_name
    Cols  : batch (2017, 2018, 2019, ...)
    Value : total enrollments
    """
    permission_classes = [IsAuthenticated]

    def get(self, request):
        # 🔹 Determine target batches (defaults match UI options)
        batches = _resolve_batches(request.query_params.getlist("batch"))

        # 🔹 Base queryset (active enrollments filtered by batch list)
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

        # 🔹 Excel export
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
