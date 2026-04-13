# backend/api/excel_import/importers/common.py
"""Shared helpers reused by multiple Excel importer modules."""

from decimal import Decimal, InvalidOperation
import re
from typing import Any, Iterable, Optional

from django.db import models
from django.db.models import Value
from django.db.models.functions import Lower, Replace

from ...domain_courses import Institute, MainBranch, SubBranch
from ...domain_documents import ApplyFor, DocRec, PayBy
from ...domain_emp import EmpProfile, LeaveType
from ...domain_enrollment import Enrollment
from ...domain_verification import MailStatus, MigrationStatus, ProvisionalStatus, VerificationStatus, generate_migration_doc_rec_id
from ..helpers import clean_cell, coerce_decimal_or_none, parse_boolean_cell, parse_excel_date, row_value
from ..validators import field_scope


def assign_user_field(obj, user, field_name: str):
    try:
        field = obj._meta.get_field(field_name)
        internal_type = field.get_internal_type()
        if internal_type in {"CharField", "TextField"}:
            setattr(obj, field_name, getattr(user, "username", str(user)) if user is not None else None)
        else:
            setattr(obj, field_name, user)
    except Exception:
        setattr(obj, field_name, getattr(user, "username", str(user)) if user is not None else None)


def user_identifier(user) -> Optional[str]:
    if user is None:
        return None
    try:
        return getattr(user, "username", None) or str(user)
    except Exception:
        return None


def scalar(row, column_name: str):
    return row_value(row, column_name)


def normalize_identifier(value: Any):
    cleaned = clean_cell(value)
    if cleaned is None:
        return None
    if isinstance(value, (int, Decimal)):
        return str(value)
    if isinstance(value, float):
        if value.is_integer():
            return str(int(value))
        return str(cleaned)
    text = str(cleaned).strip()
    if re.fullmatch(r"\d+\.0+", text):
        return text.split(".", 1)[0]
    return text


def normalize_choice(raw: Any, choices_cls):
    cleaned = clean_cell(raw)
    if cleaned is None:
        return None
    text = str(cleaned).strip()
    normalized = re.sub(r"[^0-9a-zA-Z]", "", text).lower()
    choices = getattr(choices_cls, "choices", choices_cls)
    for value, label in choices:
        try:
            if text.lower() == str(value).lower() or text.lower() == str(label).lower():
                return value
            if normalized == re.sub(r"[^0-9a-zA-Z]", "", str(label)).lower():
                return value
            if normalized == re.sub(r"[^0-9a-zA-Z]", "", str(value)).lower():
                return value
        except Exception:
            continue
    return None


def normalize_migration_status(raw: Any):
    cleaned = clean_cell(raw)
    if cleaned is None:
        return MigrationStatus.ISSUED
    text = str(cleaned).strip().upper()
    if not text:
        return MigrationStatus.ISSUED
    if text in {"R", "RECEIVED", "RECEIVE"}:
        return MigrationStatus.RECEIVED
    if text in {"NC", "NOTCOLLECTED", "NOT COLLECTED"}:
        return MigrationStatus.NOT_COLLECTED
    if text.startswith("CANCEL"):
        return MigrationStatus.CANCELLED
    if text in {"ISSUED", "DONE", "D", "I"}:
        return MigrationStatus.ISSUED
    if text in {"P", "PENDING"}:
        return MigrationStatus.PENDING
    mapped = normalize_choice(cleaned, MigrationStatus)
    return mapped


def normalize_yes_no(raw: Any, *, default='No'):
    cleaned = clean_cell(raw)
    if cleaned is None:
        return default
    text = str(cleaned).strip().lower()
    if text in {'y', 'yes', '1', 'true'}:
        return 'Yes'
    if text in {'n', 'no', '0', 'false'}:
        return 'No'
    return default


def normalize_provisional_status(raw: Any):
    cleaned = clean_cell(raw)
    if cleaned is None:
        return ProvisionalStatus.ISSUED
    text = str(cleaned).strip().upper()
    if not text:
        return ProvisionalStatus.ISSUED
    if text.startswith("CANCEL"):
        return ProvisionalStatus.CANCELLED
    if text in {"ISSUED", "DONE", "D", "I"}:
        return ProvisionalStatus.ISSUED
    if text in {"P", "PENDING"}:
        return ProvisionalStatus.PENDING
    mapped = normalize_choice(cleaned, ProvisionalStatus)
    return mapped


def normalize_verification_status(raw: Any):
    cleaned = clean_cell(raw)
    if cleaned is None:
        return None
    text = str(cleaned).strip().upper()
    if not text:
        return None
    mapped = normalize_choice(cleaned, VerificationStatus)
    if mapped:
        return mapped
    if text in {"IP", "INPROGRESS"}:
        return VerificationStatus.IN_PROGRESS
    if text in {"P", "PENDING"}:
        return VerificationStatus.PENDING
    if text.startswith("CORRECT"):
        return VerificationStatus.CORRECTION
    if text.startswith("CANCEL"):
        return VerificationStatus.CANCEL
    if text in {"D", "DONE"}:
        return VerificationStatus.DONE
    if text in {"DONEWITHREMARKS", "DONEWITHREMARK", "DWR"}:
        return VerificationStatus.DONE_WITH_REMARKS
    return None


def normalize_mail_status(raw: Any, *, default=None):
    cleaned = clean_cell(raw)
    if cleaned is None:
        return default
    text = str(cleaned).strip().lower()
    if text in {"y", "yes", "1", "true", "sent"}:
        return MailStatus.SENT
    if text in {"accepted"}:
        return MailStatus.ACCEPTED
    if text in {"failed", "fail"}:
        return MailStatus.FAILED
    if text in {"n", "no", "0", "false", "not_sent", "not sent"}:
        return MailStatus.NOT_SENT
    return normalize_choice(cleaned, MailStatus) or default


def boolean_flag(raw: Any, *, default=False):
    cleaned = clean_cell(raw)
    if cleaned is None:
        return default
    try:
        parsed = parse_boolean_cell(cleaned)
    except ValueError:
        return default
    return default if parsed is None else parsed


def optional_int(raw: Any, *, default=None):
    cleaned = clean_cell(raw)
    if cleaned is None:
        return default
    try:
        return int(float(cleaned))
    except Exception:
        return default


def positive_decimal_or_none(raw: Any):
    cleaned = clean_cell(raw)
    if cleaned is None:
        return None
    try:
        amount = Decimal(str(cleaned).replace(",", "")).quantize(Decimal("0.01"))
    except (InvalidOperation, ValueError):
        return None
    if amount <= 0:
        return None
    return amount


def lookup_docrec(raw_doc_rec_id: Any):
    cleaned = clean_cell(raw_doc_rec_id)
    if cleaned is None:
        return None
    key = str(cleaned).strip()
    if not key:
        return None
    doc_rec = DocRec.objects.filter(doc_rec_id=key).first()
    if doc_rec:
        return doc_rec
    try:
        doc_rec = DocRec.objects.filter(doc_rec_id__iexact=key).first()
    except Exception:
        doc_rec = None
    if doc_rec:
        return doc_rec
    normalized = re.sub(r"[^0-9a-zA-Z]", "", key).lower()
    if not normalized:
        return None
    try:
        for candidate in DocRec.objects.all()[:20000]:
            candidate_key = re.sub(r"[^0-9a-zA-Z]", "", str(candidate.doc_rec_id)).lower()
            if candidate_key == normalized:
                return candidate
    except Exception:
        return None
    return None


def ensure_docrec(
    raw_doc_rec_id: Any,
    *,
    apply_for: str,
    user,
    doc_rec_date=None,
    pay_by: Optional[str] = None,
    pay_rec_no=None,
    doc_remark=None,
):
    doc_date = parse_excel_date(doc_rec_date) if doc_rec_date is not None else None
    cleaned_key = clean_cell(raw_doc_rec_id)
    created = False
    if cleaned_key:
        doc_rec = lookup_docrec(cleaned_key)
        if doc_rec is None:
            doc_rec, created = DocRec.objects.get_or_create(
                doc_rec_id=str(cleaned_key).strip(),
                defaults={
                    "apply_for": apply_for,
                    "pay_by": pay_by or PayBy.NA,
                    "doc_rec_date": doc_date,
                    "created_by": user,
                },
            )
    else:
        doc_rec = DocRec.objects.create(
            apply_for=apply_for,
            pay_by=pay_by or PayBy.NA,
            doc_rec_date=doc_date,
            created_by=user,
        )
        created = True
    sync_docrec(doc_rec, doc_rec_date=doc_date, pay_rec_no=pay_rec_no, doc_remark=doc_remark)
    return doc_rec, created


def sync_docrec(doc_rec, *, doc_rec_date=None, pay_rec_no=None, doc_remark=None):
    if doc_rec is None:
        return
    changed_fields = []
    if doc_rec_date is not None:
        parsed_date = parse_excel_date(doc_rec_date)
        if parsed_date is not None and getattr(doc_rec, "doc_rec_date", None) != parsed_date:
            doc_rec.doc_rec_date = parsed_date
            changed_fields.append("doc_rec_date")
    if pay_rec_no is not None and getattr(doc_rec, "pay_rec_no", None) != pay_rec_no:
        doc_rec.pay_rec_no = pay_rec_no
        changed_fields.append("pay_rec_no")
    if doc_remark is not None and getattr(doc_rec, "doc_remark", None) != doc_remark:
        doc_rec.doc_remark = doc_remark
        changed_fields.append("doc_remark")
    if changed_fields:
        doc_rec.save(update_fields=changed_fields)


def lookup_enrollment(raw_key: Any, *, include_temp=False):
    cleaned = clean_cell(raw_key)
    if cleaned is None:
        return None
    key = str(cleaned).strip()
    if not key:
        return None
    enrollment = Enrollment.objects.filter(enrollment_no=key).first()
    if enrollment:
        return enrollment
    try:
        enrollment = Enrollment.objects.filter(enrollment_no__iexact=key).first()
    except Exception:
        enrollment = None
    if enrollment:
        return enrollment
    if include_temp:
        enrollment = Enrollment.objects.filter(temp_enroll_no=key).first()
        if enrollment:
            return enrollment
        try:
            enrollment = Enrollment.objects.filter(temp_enroll_no__iexact=key).first()
        except Exception:
            enrollment = None
        if enrollment:
            return enrollment
    normalized = "".join(key.split()).lower()
    if not normalized:
        return None
    annotations = {
        "_norm_enrollment": Replace(Lower(models.F("enrollment_no")), Value(" "), Value("")),
    }
    filters = models.Q(_norm_enrollment=normalized)
    if include_temp:
        annotations["_norm_temp"] = Replace(Lower(models.F("temp_enroll_no")), Value(" "), Value(""))
        filters |= models.Q(_norm_temp=normalized)
    try:
        return Enrollment.objects.annotate(**annotations).filter(filters).first()
    except Exception:
        return None


def resolve_related_course_objects(row, *, enrollment=None, active_fields: Optional[Iterable[str]] = None):
    scope = field_scope(row, active_fields)
    institute_key = clean_cell(scalar(row, "institute_id")) if "institute_id" in scope or active_fields is None else None
    main_key = clean_cell(scalar(row, "maincourse_id")) if "maincourse_id" in scope or active_fields is None else None
    sub_key = clean_cell(scalar(row, "subcourse_id")) if "subcourse_id" in scope or active_fields is None else None

    institute = Institute.objects.filter(institute_id=institute_key).first() if institute_key else None
    maincourse = MainBranch.objects.filter(maincourse_id=main_key).first() if main_key else None
    subcourse = SubBranch.objects.filter(subcourse_id=sub_key).first() if sub_key else None

    if enrollment is not None:
        if institute is None:
            institute = getattr(enrollment, "institute", None)
        if maincourse is None:
            maincourse = getattr(enrollment, "maincourse", None)
        if subcourse is None:
            subcourse = getattr(enrollment, "subcourse", None)

    return institute, maincourse, subcourse


def lookup_emp_profile(emp_id: Any):
    cleaned = clean_cell(emp_id)
    if cleaned is None:
        return None
    return EmpProfile.objects.filter(emp_id=str(cleaned).strip()).first()


def lookup_leave_type(leave_code: Any):
    cleaned = clean_cell(leave_code)
    if cleaned is None:
        return None
    return LeaveType.objects.filter(leave_code=str(cleaned).strip()).first()


def docrec_remark_from_row(row, scope):
    if "doc_rec_remark" in scope:
        return clean_cell(scalar(row, "doc_rec_remark"))
    if "doc_remark" in scope:
        return clean_cell(scalar(row, "doc_remark"))
    return None


def docrec_date_from_row(row, scope, *column_names: str):
    for column_name in column_names:
        if column_name in scope:
            value = parse_excel_date(scalar(row, column_name))
            if value is not None:
                return value
    return None


def apply_for_from_service(service_name: Optional[str]):
    mapping = {
        "MIGRATION": ApplyFor.MIGRATION,
        "PROVISIONAL": ApplyFor.PROVISIONAL,
        "VERIFICATION": ApplyFor.VERIFICATION,
        "INSTITUTIONAL_VERIFICATION": ApplyFor.INST_VERIFICATION,
        "DOCREC": ApplyFor.VERIFICATION,
    }
    return mapping.get(str(service_name or "").strip().upper())