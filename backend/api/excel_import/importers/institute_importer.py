"""Institute importer used by both admin and bulk upload flows."""

from ..helpers import clean_cell
from ..validators import field_scope
from ...models import Institute
from .base import ImportContext, RowImportResult


def process_row(row, context: ImportContext) -> RowImportResult:
    scope = field_scope(row, context.active_fields)
    institute_id = clean_cell(row.get("institute_id"))
    if institute_id in (None, ""):
        return RowImportResult(status="skipped", message="Missing institute_id", ref=institute_id)

    defaults = {"updated_by": context.user}
    for field_name in (
        "institute_code",
        "institute_name",
        "institute_campus",
        "institute_address",
        "institute_city",
    ):
        if field_name in scope:
            defaults[field_name] = clean_cell(row.get(field_name))

    _, created = Institute.objects.update_or_create(institute_id=institute_id, defaults=defaults)
    status = "created" if created else "updated"
    message = "Created" if created else "Updated"
    return RowImportResult(status=status, message=message, ref=institute_id)