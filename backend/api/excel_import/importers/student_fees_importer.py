"""Student fees ledger importer shared by admin and bulk upload flows."""

from ..helpers import clean_cell, parse_excel_date, safe_num
from ..validators import field_scope
from ...domain_fees_ledger import StudentFeesLedger
from .base import ImportContext, RowImportResult
from .common import lookup_enrollment, positive_decimal_or_none, scalar


def process_row(row, context: ImportContext) -> RowImportResult:
    scope = field_scope(row, context.active_fields)
    student_key = clean_cell(scalar(row, "enrollment_no") or scalar(row, "temp_enroll_no"))
    enrollment_id = scalar(row, "enrollment_id") or scalar(row, "enrollment") or scalar(row, "enrollment_pk")
    numeric_enrollment_id = safe_num(enrollment_id, None)
    numeric_enrollment_id = int(numeric_enrollment_id) if numeric_enrollment_id is not None else None

    if not student_key and numeric_enrollment_id is None:
        return RowImportResult(
            status="skipped",
            message="Missing enrollment_no/temp_enroll_no or enrollment_id",
            ref=clean_cell(scalar(row, "receipt_no")),
        )

    enrollment = lookup_enrollment(student_key, include_temp=True) if student_key else None
    if enrollment is None and numeric_enrollment_id is not None:
        enrollment = StudentFeesLedger._meta.get_field("enrollment").remote_field.model.objects.filter(id=numeric_enrollment_id).first()
    if enrollment is None:
        display_key = student_key or str(numeric_enrollment_id)
        return RowImportResult(status="skipped", message=f"Enrollment not found for '{display_key}'", ref=display_key)

    receipt_no = clean_cell(scalar(row, "receipt_no"))
    receipt_date_raw = scalar(row, "receipt_date") if "receipt_date" in scope else None
    receipt_date = parse_excel_date(receipt_date_raw) if receipt_date_raw not in (None, "") else None
    if receipt_date_raw not in (None, "") and receipt_date is None:
        return RowImportResult(status="skipped", message="Invalid receipt_date", ref=receipt_no or student_key)

    term = clean_cell(scalar(row, "term")) if "term" in scope else None
    if not term:
        return RowImportResult(status="skipped", message="Missing term", ref=receipt_no or student_key)

    amount_raw = scalar(row, "amount") if "amount" in scope else None
    amount = positive_decimal_or_none(amount_raw) if "amount" in scope else None
    if amount_raw not in (None, "") and amount is None:
        return RowImportResult(status="skipped", message="Invalid amount", ref=receipt_no or student_key)

    if not receipt_no and receipt_date is None and amount is None:
        return RowImportResult(status="skipped", message="Empty fees row", ref=student_key)

    defaults = {
        "enrollment": enrollment,
        "receipt_date": receipt_date,
        "term": term,
        "amount": amount,
        "remark": clean_cell(scalar(row, "remark")) if "remark" in scope else None,
    }

    if receipt_no:
        obj, created = StudentFeesLedger.objects.update_or_create(receipt_no=receipt_no, defaults=defaults)
    else:
        obj = StudentFeesLedger.objects.create(receipt_no=None, **defaults)
        created = True

    if created and getattr(obj, "created_by", None) != context.user:
        obj.created_by = context.user
        obj.save(update_fields=["created_by"])
    elif not created and getattr(obj, "created_by", None) is None and context.user is not None:
        obj.created_by = context.user
        obj.save(update_fields=["created_by"])

    return RowImportResult(
        status="created" if created else "updated",
        message="Created" if created else "Updated",
        ref=receipt_no or student_key,
    )