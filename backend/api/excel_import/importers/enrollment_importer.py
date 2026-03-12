"""Enrollment importer adapter for shared engine dispatch."""

from ..enrollment_profile import process_enrollment_row
from .base import ImportContext, RowImportResult


def process_row(row, context: ImportContext) -> RowImportResult:
    ref_key, message, error = process_enrollment_row(
        row,
        context.user,
        active_fields=context.active_fields,
    )
    if error:
        return RowImportResult(status="skipped", message=error, ref=ref_key)
    status = "created" if message and message.startswith("Created enrollment") else "updated"
    return RowImportResult(status=status, message=message or "Updated enrollment", ref=ref_key)