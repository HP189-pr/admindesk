"""SubBranch importer for admin-side shared engine dispatch."""

from ..helpers import clean_cell
from ..validators import field_scope
from ...models import MainBranch, SubBranch
from .base import ImportContext, RowImportResult


def process_row(row, context: ImportContext) -> RowImportResult:
    scope = field_scope(row, context.active_fields)
    subcourse_id = clean_cell(row.get("subcourse_id"))
    maincourse_id = clean_cell(row.get("maincourse_id"))
    if not (subcourse_id and maincourse_id):
        return RowImportResult(
            status="skipped",
            message="Missing subcourse_id/maincourse_id",
            ref=subcourse_id or maincourse_id,
        )

    maincourse = MainBranch.objects.filter(maincourse_id=maincourse_id).first()
    if not maincourse:
        return RowImportResult(
            status="skipped",
            message=f"maincourse {maincourse_id} not found",
            ref=subcourse_id,
        )

    defaults = {"updated_by": context.user}
    if "subcourse_name" in scope:
        defaults["subcourse_name"] = clean_cell(row.get("subcourse_name"))
    if "maincourse_id" in scope:
        defaults["maincourse"] = maincourse

    _, created = SubBranch.objects.update_or_create(subcourse_id=subcourse_id, defaults=defaults)
    return RowImportResult(
        status="created" if created else "updated",
        message="Created" if created else "Updated",
        ref=subcourse_id,
    )