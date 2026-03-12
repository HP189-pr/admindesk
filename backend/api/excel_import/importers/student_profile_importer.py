"""StudentProfile importer adapter for shared engine dispatch."""

from ..enrollment_profile import process_student_profile_row
from .base import ImportContext, RowImportResult


def process_row(row, context: ImportContext) -> RowImportResult:
    ref_key, message, error = process_student_profile_row(
        row,
        context.user,
        active_fields=context.active_fields,
    )
    if error:
        return RowImportResult(status="skipped", message=error, ref=ref_key)
    status = "updated"
    if message and (message.startswith("Enrollment created") or message == "Profile created"):
        status = "created"
    return RowImportResult(status=status, message=message or "Profile updated", ref=ref_key)