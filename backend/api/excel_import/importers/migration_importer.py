# backend/api/excel_import/importers/migration_importer.py
"""MigrationRecord importer shared by admin and bulk upload flows."""

from ..helpers import clean_cell, parse_excel_date
from ..validators import field_scope
from ...domain_documents import ApplyFor
from ...domain_verification import MigrationRecord, MigrationStatus
from .base import ImportContext, RowImportResult
from .common import (
    assign_user_field,
    docrec_date_from_row,
    docrec_remark_from_row,
    ensure_docrec,
    lookup_docrec,
    lookup_enrollment,
    normalize_migration_status,
    resolve_related_course_objects,
    scalar,
    sync_docrec,
)


def process_row(row, context: ImportContext) -> RowImportResult:
    scope = field_scope(row, context.active_fields)
    mg_number = clean_cell(scalar(row, "mg_number"))
    if not mg_number:
        return RowImportResult(status="skipped", message="Missing mg_number", ref=mg_number)

    doc_rec_key = clean_cell(scalar(row, "doc_rec_id")) or clean_cell(scalar(row, "doc_rec")) or clean_cell(scalar(row, "doc_rec_key"))
    doc_rec = lookup_docrec(doc_rec_key)
    doc_rec_date = docrec_date_from_row(row, scope, "doc_rec_date")
    doc_remark = docrec_remark_from_row(row, scope)
    if doc_rec is None and context.auto_create_docrec:
        doc_rec, _ = ensure_docrec(
            doc_rec_key,
            apply_for=ApplyFor.MIGRATION,
            user=context.user,
            doc_rec_date=doc_rec_date,
            pay_rec_no=clean_cell(scalar(row, "pay_rec_no")) if "pay_rec_no" in scope else None,
            doc_remark=doc_remark,
        )
    if doc_rec is None:
        return RowImportResult(status="skipped", message="doc_rec_id not found", ref=mg_number)

    enrollment_key = clean_cell(scalar(row, "enrollment_no"))
    enrollment = lookup_enrollment(enrollment_key) if enrollment_key else None
    mg_status = normalize_migration_status(scalar(row, "mg_status"))
    if mg_status is None:
        return RowImportResult(status="skipped", message=f"Invalid mg_status: {scalar(row, 'mg_status')}", ref=mg_number)
    is_cancel = mg_status == MigrationStatus.CANCELLED

    if not is_cancel and "enrollment_no" in scope and not enrollment_key:
        return RowImportResult(status="skipped", message="Missing enrollment_no for non-cancel record", ref=mg_number)
    if not is_cancel and "enrollment_no" in scope and enrollment_key and enrollment is None:
        return RowImportResult(status="skipped", message=f"Enrollment {enrollment_key} not found", ref=mg_number)

    institute, maincourse, subcourse = resolve_related_course_objects(row, enrollment=enrollment, active_fields=scope)
    if not is_cancel:
        if "institute_id" in scope and institute is None and enrollment is None:
            return RowImportResult(status="skipped", message="Missing institute for non-cancel record", ref=mg_number)
        if "maincourse_id" in scope and maincourse is None and enrollment is None:
            return RowImportResult(status="skipped", message="Missing maincourse for non-cancel record", ref=mg_number)
        if "subcourse_id" in scope and subcourse is None and enrollment is None:
            return RowImportResult(status="skipped", message="Missing subcourse for non-cancel record", ref=mg_number)

    mg_date = parse_excel_date(scalar(row, "mg_date")) if "mg_date" in scope else None
    if not is_cancel and "mg_date" in scope and mg_date is None:
        return RowImportResult(status="skipped", message="Missing mg_date", ref=mg_number)

    student_name = None
    if "student_name" in scope:
        student_name = clean_cell(scalar(row, "student_name")) or (getattr(enrollment, "student_name", None) if enrollment is not None else None)
        if not student_name and not is_cancel:
            return RowImportResult(status="skipped", message="Missing student_name for non-cancel record", ref=mg_number)
    elif enrollment is not None:
        student_name = getattr(enrollment, "student_name", None)

    pay_rec_no = clean_cell(scalar(row, "pay_rec_no")) if "pay_rec_no" in scope else None
    if not pay_rec_no and doc_rec is not None:
        pay_rec_no = getattr(doc_rec, "pay_rec_no", None)

    defaults = {
        "doc_rec": getattr(doc_rec, "doc_rec_id", None),
        "mg_status": mg_status,
        "doc_remark": doc_remark,
    }
    if enrollment is not None:
        defaults["enrollment"] = enrollment
    elif "enrollment_no" in scope and is_cancel:
        defaults["enrollment"] = None
    if "student_name" in scope or is_cancel:
        defaults["student_name"] = student_name or ""
    if "institute_id" in scope or institute is not None:
        defaults["institute"] = institute
    if "maincourse_id" in scope or maincourse is not None:
        defaults["maincourse"] = maincourse
    if "subcourse_id" in scope or subcourse is not None:
        defaults["subcourse"] = subcourse
    if "mg_date" in scope and mg_date is not None:
        defaults["mg_date"] = mg_date
    if "exam_year" in scope:
        defaults["exam_year"] = clean_cell(scalar(row, "exam_year"))
    if "admission_year" in scope:
        defaults["admission_year"] = clean_cell(scalar(row, "admission_year"))
    if "exam_details" in scope:
        defaults["exam_details"] = clean_cell(scalar(row, "exam_details"))
    if "pay_rec_no" in scope or pay_rec_no is not None:
        defaults["pay_rec_no"] = pay_rec_no

    existing = MigrationRecord.objects.filter(mg_number=mg_number).first()
    if existing is None and doc_rec is not None:
        existing = MigrationRecord.objects.filter(doc_rec=getattr(doc_rec, "doc_rec_id", None)).first()

    if existing is None:
        obj = MigrationRecord(mg_number=mg_number, **defaults)
        assign_user_field(obj, context.user, "created_by")
        obj.save()
        sync_docrec(doc_rec, doc_rec_date=doc_rec_date, pay_rec_no=pay_rec_no, doc_remark=doc_remark)
        return RowImportResult(status="created", message="Created", ref=mg_number)

    for field_name, value in defaults.items():
        setattr(existing, field_name, value)
    if getattr(existing, "created_by", None) is None:
        assign_user_field(existing, context.user, "created_by")
    existing.save()
    sync_docrec(doc_rec, doc_rec_date=doc_rec_date, pay_rec_no=pay_rec_no, doc_remark=doc_remark)
    return RowImportResult(status="updated", message="Updated", ref=mg_number)