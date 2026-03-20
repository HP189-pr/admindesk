# backend/api/excel_import/importers/leave_importer.py
"""Leave entry importer shared by bulk upload flows."""

from ..helpers import clean_cell, coerce_decimal_or_none, parse_excel_date
from ..validators import field_scope
from ...domain_emp import LeaveEntry
from .base import ImportContext, RowImportResult
from .common import lookup_emp_profile, lookup_leave_type, scalar, user_identifier


def process_row(row, context: ImportContext) -> RowImportResult:
    scope = field_scope(row, context.active_fields)
    leave_report_no = clean_cell(scalar(row, "leave_report_no"))
    emp_id = clean_cell(scalar(row, "emp_id"))
    leave_code = clean_cell(scalar(row, "leave_code"))
    if not (leave_report_no and emp_id and leave_code):
        return RowImportResult(
            status="skipped",
            message="Missing required fields (leave_report_no/emp_id/leave_code)",
            ref=leave_report_no or emp_id or leave_code,
        )

    emp_profile = lookup_emp_profile(emp_id)
    if emp_profile is None:
        return RowImportResult(status="skipped", message="EmpProfile not found", ref=emp_id)
    leave_type = lookup_leave_type(leave_code)
    if leave_type is None:
        return RowImportResult(status="skipped", message="LeaveType not found", ref=leave_code)

    start_date = parse_excel_date(scalar(row, "start_date")) if "start_date" in scope else None
    end_date = parse_excel_date(scalar(row, "end_date")) if "end_date" in scope else None
    if start_date is None:
        return RowImportResult(status="skipped", message="Missing start_date", ref=leave_report_no)

    defaults = {
        "emp": emp_profile,
        "leave_type": leave_type,
        "start_date": start_date,
        "end_date": end_date or start_date,
    }
    if "total_days" in scope:
        defaults["total_days"] = coerce_decimal_or_none(scalar(row, "total_days"))
    if "reason" in scope:
        defaults["reason"] = clean_cell(scalar(row, "reason"))
    if "status" in scope:
        defaults["status"] = clean_cell(scalar(row, "status")) or LeaveEntry.STATUS_PENDING
    if "created_by" in scope:
        defaults["created_by"] = clean_cell(scalar(row, "created_by")) or user_identifier(context.user)
    else:
        defaults["created_by"] = user_identifier(context.user)
    if "approved_by" in scope:
        defaults["approved_by"] = clean_cell(scalar(row, "approved_by"))
    if "approved_at" in scope:
        defaults["approved_at"] = parse_excel_date(scalar(row, "approved_at"))

    _, created = LeaveEntry.objects.update_or_create(leave_report_no=leave_report_no, defaults=defaults)
    return RowImportResult(
        status="created" if created else "updated",
        message="Created" if created else "Updated",
        ref=leave_report_no,
    )