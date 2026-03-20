# backend/api/excel_import/importers/verification_importer.py
"""Verification importer shared by admin and bulk upload flows."""

from django.utils import timezone

from ..helpers import clean_cell, parse_excel_date
from ..validators import field_scope
from ...domain_documents import ApplyFor
from ...domain_verification import MailStatus, Verification
from .base import ImportContext, RowImportResult
from .common import (
    assign_user_field,
    boolean_flag,
    docrec_date_from_row,
    docrec_remark_from_row,
    ensure_docrec,
    lookup_docrec,
    lookup_enrollment,
    normalize_mail_status,
    normalize_verification_status,
    optional_int,
    scalar,
    sync_docrec,
)


def process_row(row, context: ImportContext) -> RowImportResult:
    scope = field_scope(row, context.active_fields)
    doc_rec_key = clean_cell(scalar(row, "doc_rec_id"))
    final_no = clean_cell(scalar(row, "final_no"))
    doc_rec = lookup_docrec(doc_rec_key)
    doc_rec_date = docrec_date_from_row(row, scope, "doc_rec_date", "date")
    doc_remark = docrec_remark_from_row(row, scope)
    if doc_rec is None and context.auto_create_docrec:
        doc_rec, _ = ensure_docrec(
            doc_rec_key,
            apply_for=ApplyFor.VERIFICATION,
            user=context.user,
            doc_rec_date=doc_rec_date,
            pay_rec_no=clean_cell(scalar(row, "pay_rec_no")) if "pay_rec_no" in scope else None,
            doc_remark=doc_remark,
        )
    if doc_rec is None:
        return RowImportResult(status="skipped", message="Missing doc_rec", ref=final_no or doc_rec_key)

    enrollment_key = clean_cell(scalar(row, "enrollment_no"))
    if "enrollment_no" in scope and not enrollment_key:
        return RowImportResult(status="skipped", message="Missing enrollment_no", ref=final_no or doc_rec_key)
    enrollment = lookup_enrollment(enrollment_key) if enrollment_key else None

    second_key = clean_cell(scalar(row, "second_enrollment_no"))
    second_enrollment = lookup_enrollment(second_key) if second_key else None

    status_raw = scalar(row, "status") if "status" in scope else None
    status_value = normalize_verification_status(status_raw)
    if status_raw not in (None, "") and clean_cell(status_raw) is not None and status_value is None:
        return RowImportResult(status="skipped", message=f"Invalid status: {status_raw}", ref=final_no or doc_rec_key)

    mail_status = normalize_mail_status(
        scalar(row, "mail_status") if "mail_status" in scope else scalar(row, "mail_send_status"),
        default=MailStatus.NOT_SENT,
    )
    eca_status = normalize_mail_status(
        scalar(row, "eca_status") if "eca_status" in scope else scalar(row, "eca_send_status"),
        default=None,
    )
    vr_done_date = parse_excel_date(scalar(row, "vr_done_date") or scalar(row, "done_date") or scalar(row, "vr_done"))
    effective_doc_rec_date = doc_rec_date or getattr(doc_rec, "doc_rec_date", None) or timezone.now().date()
    pay_rec_no = clean_cell(scalar(row, "pay_rec_no")) if "pay_rec_no" in scope else None
    if not pay_rec_no:
        pay_rec_no = getattr(doc_rec, "pay_rec_no", None)

    defaults = {
        "doc_rec": doc_rec,
        "doc_rec_date": effective_doc_rec_date,
        "updatedby": context.user,
        "doc_remark": doc_remark,
    }
    if "enrollment_no" in scope or enrollment_key:
        defaults["enrollment_no"] = getattr(enrollment, "enrollment_no", None) or enrollment_key
    if "second_enrollment_no" in scope or second_key:
        defaults["second_enrollment_id"] = getattr(second_enrollment, "enrollment_no", None) or second_key
    if "student_name" in scope:
        defaults["student_name"] = clean_cell(scalar(row, "student_name")) or getattr(enrollment, "student_name", None)
    elif enrollment is not None:
        defaults["student_name"] = getattr(enrollment, "student_name", None)
    for source_name, target_name in (
        ("no_of_transcript", "tr_count"),
        ("no_of_marksheet", "ms_count"),
        ("no_of_degree", "dg_count"),
        ("no_of_moi", "moi_count"),
        ("no_of_backlog", "backlog_count"),
    ):
        if source_name in scope:
            defaults[target_name] = optional_int(scalar(row, source_name), default=0)
    if "pay_rec_no" in scope or pay_rec_no is not None:
        defaults["pay_rec_no"] = pay_rec_no
    if "eca_required" in scope:
        defaults["eca_required"] = boolean_flag(scalar(row, "eca_required"), default=False)
    if "eca_name" in scope:
        defaults["eca_name"] = clean_cell(scalar(row, "eca_name"))
    if "eca_ref_no" in scope:
        defaults["eca_ref_no"] = clean_cell(scalar(row, "eca_ref_no"))
    if "eca_submit_date" in scope or "eca_send_date" in scope:
        defaults["eca_send_date"] = parse_excel_date(scalar(row, "eca_submit_date") or scalar(row, "eca_send_date"))
    if "eca_resubmit_date" in scope:
        defaults["eca_resubmit_date"] = parse_excel_date(scalar(row, "eca_resubmit_date"))
    if "eca_status" in scope or "eca_send_status" in scope:
        defaults["eca_status"] = eca_status
    if "mail_status" in scope or "mail_send_status" in scope or mail_status is not None:
        defaults["mail_status"] = mail_status
    if vr_done_date is not None:
        defaults["vr_done_date"] = vr_done_date
    if status_value is not None:
        defaults["status"] = status_value
    if final_no:
        defaults["final_no"] = final_no

    existing = Verification.objects.filter(doc_rec=doc_rec).first()
    if existing is None and final_no:
        existing = Verification.objects.filter(final_no=final_no).first()

    if existing is None:
        obj = Verification(**defaults)
        assign_user_field(obj, context.user, "updatedby")
        obj.save()
        sync_docrec(doc_rec, doc_rec_date=doc_rec_date, pay_rec_no=pay_rec_no, doc_remark=doc_remark)
        return RowImportResult(status="created", message="Created", ref=final_no or doc_rec_key)

    for field_name, value in defaults.items():
        setattr(existing, field_name, value)
    assign_user_field(existing, context.user, "updatedby")
    existing.save()
    sync_docrec(doc_rec, doc_rec_date=doc_rec_date, pay_rec_no=pay_rec_no, doc_remark=doc_remark)
    return RowImportResult(status="updated", message="Updated", ref=final_no or doc_rec_key)