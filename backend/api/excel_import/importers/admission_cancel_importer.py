"""Admission cancellation importer shared by admin uploads."""

from ..helpers import clean_cell, parse_excel_date
from ..validators import field_scope
from ...models import AdmissionCancel
from .base import ImportContext, RowImportResult
from .common import lookup_enrollment, normalize_choice, scalar


def process_row(row, context: ImportContext) -> RowImportResult:
    scope = field_scope(row, context.active_fields)
    enrollment_key = clean_cell(scalar(row, "enrollment_no"))
    if not enrollment_key:
        return RowImportResult(status="skipped", message="Missing enrollment_no", ref=enrollment_key)

    enrollment = lookup_enrollment(enrollment_key, include_temp=True)
    if enrollment is None:
        return RowImportResult(status="skipped", message=f"Enrollment {enrollment_key} not found", ref=enrollment_key)

    status_raw = clean_cell(scalar(row, "status")) if "status" in scope else AdmissionCancel.STATUS_CANCELLED
    status_value = normalize_choice(status_raw or AdmissionCancel.STATUS_CANCELLED, AdmissionCancel.STATUS_CHOICES)
    if status_value is None:
        normalized = str(status_raw or "").strip().upper()
        if normalized.startswith("CANCEL"):
            status_value = AdmissionCancel.STATUS_CANCELLED
        elif normalized.startswith("REVOKE"):
            status_value = AdmissionCancel.STATUS_REVOKED
    if status_value is None:
        return RowImportResult(status="skipped", message=f"Invalid status: {status_raw}", ref=enrollment_key)

    inward_date = None
    if "inward_date" in scope:
        inward_raw = scalar(row, "inward_date")
        inward_text = str(inward_raw).strip() if inward_raw is not None else ""
        if inward_text and inward_text.lower() not in {"-", "--", "na", "n/a", "none", "null", "<na>"}:
            inward_date = parse_excel_date(inward_raw)
            if inward_date is None:
                return RowImportResult(status="skipped", message=f"Invalid inward_date: {inward_text}", ref=enrollment_key)

    outward_date = None
    if "outward_date" in scope:
        outward_raw = scalar(row, "outward_date")
        outward_text = str(outward_raw).strip() if outward_raw is not None else ""
        if outward_text and outward_text.lower() not in {"-", "--", "na", "n/a", "none", "null", "<na>"}:
            outward_date = parse_excel_date(outward_raw)
            if outward_date is None:
                return RowImportResult(status="skipped", message=f"Invalid outward_date: {outward_text}", ref=enrollment_key)

    student_name = clean_cell(scalar(row, "student_name")) if "student_name" in scope else None
    defaults = {
        "student_name": student_name or getattr(enrollment, "student_name", "") or "",
        "status": status_value,
    }
    if "inward_no" in scope:
        defaults["inward_no"] = clean_cell(scalar(row, "inward_no"))
    if "inward_date" in scope:
        defaults["inward_date"] = inward_date
    if "outward_no" in scope:
        defaults["outward_no"] = clean_cell(scalar(row, "outward_no"))
    if "outward_date" in scope:
        defaults["outward_date"] = outward_date
    if "can_remark" in scope:
        defaults["can_remark"] = clean_cell(scalar(row, "can_remark"))

    _, created = AdmissionCancel.objects.update_or_create(enrollment=enrollment, defaults=defaults)
    return RowImportResult(
        status="created" if created else "updated",
        message="Created" if created else "Updated",
        ref=enrollment_key,
    )