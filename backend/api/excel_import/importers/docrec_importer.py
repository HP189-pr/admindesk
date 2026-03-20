# backend/api/excel_import/importers/docrec_importer.py
"""DocRec importer shared by admin and bulk upload flows."""

from ..helpers import clean_cell, coerce_decimal_or_none, parse_excel_date
from ..validators import field_scope
from ...domain_documents import PayBy
from ...models import DocRec
from .base import ImportContext, RowImportResult
from .common import lookup_docrec, scalar, sync_docrec


def process_row(row, context: ImportContext) -> RowImportResult:
    scope = field_scope(row, context.active_fields)
    apply_for = clean_cell(scalar(row, "apply_for"))
    pay_by = clean_cell(scalar(row, "pay_by"))
    doc_rec_id = clean_cell(scalar(row, "doc_rec_id"))
    if not (apply_for and pay_by and doc_rec_id):
        return RowImportResult(
            status="skipped",
            message="Missing required fields (apply_for/pay_by/doc_rec_id)",
            ref=doc_rec_id,
        )

    if str(pay_by).upper() != PayBy.NA and "pay_rec_no_pre" in scope and not clean_cell(scalar(row, "pay_rec_no_pre")):
        return RowImportResult(status="skipped", message="pay_rec_no_pre required unless pay_by=NA", ref=doc_rec_id)

    pay_rec_no_pre = clean_cell(scalar(row, "pay_rec_no_pre")) if "pay_rec_no_pre" in scope else None
    pay_rec_no = clean_cell(scalar(row, "pay_rec_no")) if "pay_rec_no" in scope else None
    pay_amount = coerce_decimal_or_none(scalar(row, "pay_amount")) if "pay_amount" in scope else None
    doc_rec_date = parse_excel_date(scalar(row, "doc_rec_date")) if "doc_rec_date" in scope else None
    doc_remark = clean_cell(scalar(row, "doc_rec_remark")) if "doc_rec_remark" in scope else None

    obj = lookup_docrec(doc_rec_id)
    created = False
    if obj is None:
        obj = DocRec(
            doc_rec_id=str(doc_rec_id).strip(),
            apply_for=str(apply_for).upper(),
            pay_by=str(pay_by).upper(),
            created_by=context.user,
        )
        created = True

    if "apply_for" in scope:
        obj.apply_for = str(apply_for).upper()
    if "pay_by" in scope:
        obj.pay_by = str(pay_by).upper()
    if "pay_rec_no_pre" in scope:
        obj.pay_rec_no_pre = pay_rec_no_pre
    if "pay_rec_no" in scope:
        obj.pay_rec_no = pay_rec_no
    if "pay_amount" in scope and pay_amount is not None:
        obj.pay_amount = pay_amount
    if "doc_rec_date" in scope and doc_rec_date is not None:
        obj.doc_rec_date = doc_rec_date
    if "doc_rec_remark" in scope:
        obj.doc_remark = doc_remark
    obj.save()
    sync_docrec(obj, doc_rec_date=doc_rec_date, pay_rec_no=pay_rec_no, doc_remark=doc_remark)

    return RowImportResult(
        status="created" if created else "updated",
        message="Created" if created else "Updated",
        ref=doc_rec_id,
    )