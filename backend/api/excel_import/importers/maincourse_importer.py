# backend/api/excel_import/importers/maincourse_importer.py
"""MainBranch importer for admin-side shared engine dispatch."""

from ..helpers import clean_cell
from ..validators import field_scope
from ...models import MainBranch
from .base import ImportContext, RowImportResult


def process_row(row, context: ImportContext) -> RowImportResult:
    scope = field_scope(row, context.active_fields)
    maincourse_id = clean_cell(row.get("maincourse_id"))
    if not maincourse_id:
        return RowImportResult(status="skipped", message="Missing maincourse_id", ref=maincourse_id)

    defaults = {"updated_by": context.user}
    if "course_code" in scope:
        defaults["course_code"] = clean_cell(row.get("course_code"))
    if "course_name" in scope:
        defaults["course_name"] = clean_cell(row.get("course_name"))

    _, created = MainBranch.objects.update_or_create(maincourse_id=maincourse_id, defaults=defaults)
    return RowImportResult(
        status="created" if created else "updated",
        message="Created" if created else "Updated",
        ref=maincourse_id,
    )