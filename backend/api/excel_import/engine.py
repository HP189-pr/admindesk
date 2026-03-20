# backend/api/excel_import/engine.py
"""Shared row-processing engine for admin and bulk Excel import flows."""

from typing import Any, Callable, List, Optional

from .importers.base import ImportContext, RowImportResult, RowImporter


def default_row_ref(row: Any):
    for field_name in (
        "enrollment_no",
        "doc_rec_id",
        "institute_id",
        "maincourse_id",
        "subcourse_id",
        "receipt_no",
        "mg_number",
        "prv_number",
        "final_no",
        "emp_id",
        "leave_report_no",
    ):
        try:
            value = row.get(field_name)
        except Exception:
            value = None
        if value not in (None, ""):
            return value
    return None


def run_row_importer(
    df,
    importer: RowImporter,
    context: ImportContext,
    *,
    start_row: int = 0,
    on_result: Optional[Callable[[RowImportResult, int], None]] = None,
) -> List[RowImportResult]:
    results: List[RowImportResult] = []
    for offset, (_, row) in enumerate(df.iterrows()):
        row_number = offset + start_row
        try:
            result = importer(row, context)
        except Exception as exc:
            result = RowImportResult(
                status="skipped",
                message=str(exc),
                ref=default_row_ref(row),
                row_number=row_number,
            )
        if result.row_number is None:
            result.row_number = row_number
        results.append(result)
        if on_result is not None:
            on_result(result, offset + 1)
    return results


__all__ = ["ImportContext", "RowImportResult", "run_row_importer"]