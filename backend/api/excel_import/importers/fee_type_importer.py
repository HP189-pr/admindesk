"""FeeType importer shared by admin uploads."""

from ..helpers import clean_cell, parse_boolean_cell
from ..validators import field_scope
from ...domain_cash_register import FeeType
from .base import ImportContext, RowImportResult
from .common import scalar


def process_row(row, context: ImportContext) -> RowImportResult:
    scope = field_scope(row, context.active_fields)
    code = clean_cell(scalar(row, "code"))
    name = clean_cell(scalar(row, "name"))
    if code:
        code = str(code).strip().upper()
    if name:
        name = str(name).strip().upper()
    if not code or not name:
        return RowImportResult(status="skipped", message="Missing code/name", ref=code or name)

    defaults = {"name": name}
    if "is_active" in scope:
        try:
            parsed_active = parse_boolean_cell(scalar(row, "is_active"))
        except ValueError as exc:
            return RowImportResult(status="skipped", message=f"Invalid is_active: {exc}", ref=code)
        if parsed_active is not None:
            defaults["is_active"] = parsed_active

    _, created = FeeType.objects.update_or_create(code=code, defaults=defaults)
    return RowImportResult(
        status="created" if created else "updated",
        message="Created" if created else "Updated",
        ref=code,
    )