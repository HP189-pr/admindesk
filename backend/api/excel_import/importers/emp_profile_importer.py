"""Employee profile importer shared by bulk upload flows."""

from ..helpers import clean_cell, parse_excel_date, safe_num
from ..validators import field_scope
from ...domain_emp import EmpProfile
from .base import ImportContext, RowImportResult
from .common import assign_user_field, scalar


def process_row(row, context: ImportContext) -> RowImportResult:
    scope = field_scope(row, context.active_fields)
    emp_id = clean_cell(scalar(row, "emp_id"))
    if not emp_id:
        return RowImportResult(status="skipped", message="Missing emp_id", ref=emp_id)

    defaults = {
        "created_by": None,
    }
    for field_name in (
        "emp_name",
        "emp_designation",
        "username",
        "usercode",
        "department_joining",
        "institute_id",
        "status",
    ):
        if field_name in scope:
            defaults[field_name] = clean_cell(scalar(row, field_name))

    for field_name in (
        "actual_joining",
        "emp_birth_date",
        "usr_birth_date",
        "leave_calculation_date",
    ):
        if field_name in scope:
            defaults[field_name] = parse_excel_date(scalar(row, field_name))

    for field_name in (
        "el_balance",
        "sl_balance",
        "cl_balance",
        "vacation_balance",
        "joining_year_allocation_el",
        "joining_year_allocation_cl",
        "joining_year_allocation_sl",
        "joining_year_allocation_vac",
    ):
        if field_name in scope:
            defaults[field_name] = safe_num(scalar(row, field_name), 0)

    if "emp_short" in scope:
        try:
            emp_short = scalar(row, "emp_short")
            defaults["emp_short"] = int(float(emp_short)) if emp_short not in (None, "") else None
        except Exception:
            defaults["emp_short"] = None

    if not defaults.get("emp_name"):
        return RowImportResult(status="skipped", message="Missing emp_name", ref=emp_id)

    obj, created = EmpProfile.objects.update_or_create(emp_id=emp_id, defaults=defaults)
    if not getattr(obj, "created_by", None):
        assign_user_field(obj, context.user, "created_by")
        obj.save(update_fields=["created_by"])

    return RowImportResult(
        status="created" if created else "updated",
        message="Created" if created else "Updated",
        ref=emp_id,
    )