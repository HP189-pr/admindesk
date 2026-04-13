# backend/api/excel_import/column_mapper.py
"""Column alias maps and header resolution helpers for Excel import workflows."""

import re
from typing import Any, Dict

from ..domain_cash_register import Receipt
from ..domain_fees_ledger import StudentFeesLedger
from ..models import Enrollment, MigrationRecord, StudentProfile
from .import_specs import get_import_spec
from .registry import get_bulk_service_model, get_bulk_service_template_columns


def _normalize_name_key(raw: Any) -> str:
    return re.sub(r"[^0-9a-zA-Z]", "", str(raw).strip().lower())


COLUMN_ALIAS_MAP: Dict[type, Dict[str, str]] = {
    Receipt: {
        "fee_code": "fee_type_code",
        "feecode": "fee_type_code",
        "fee code": "fee_type_code",
        "fee_type": "fee_type_code",
        "fee type": "fee_type_code",
        "cash_rec_no": "receipt_no_full",
        "cash rec no": "receipt_no_full",
        "cashrecno": "receipt_no_full",
        "receipt_no": "receipt_no_full",
        "receipt no": "receipt_no_full",
        "is cancelled": "is_cancelled",
        "cancelled": "is_cancelled",
        "cancel reason": "cancel_reason",
        "cancelled by": "cancelled_by",
    },
    Enrollment: {
        "enrollment": "enrollment_no",
        "enrollment no": "enrollment_no",
        "roll no": "enrollment_no",
        "roll number": "enrollment_no",
        "temp enrollment": "temp_enroll_no",
        "temp enrollment no": "temp_enroll_no",
        "temp student id": "temp_enroll_no",
        "student name": "student_name",
        "studentname": "student_name",
        "registration date": "enrollment_date",
        "enrollment date": "enrollment_date",
        "admission date": "admission_date",
        "institute": "institute_id",
        "institute id": "institute_id",
        "main": "maincourse_id",
        "main course": "maincourse_id",
        "maincourse id": "maincourse_id",
        "sub": "subcourse_id",
        "sub course": "subcourse_id",
        "subcourse id": "subcourse_id",
        "birth date": "birth_date",
        "admission cast category": "category",
        "admission caste category": "category",
        "local address": "address1",
        "permanent address": "address2",
        "local city": "city1",
        "permanent city": "city2",
        "mobile no": "contact_no",
        "mobile number": "contact_no",
        "total fees": "fees",
        "abc id": "abc_id",
        "aadhaar number": "aadhar_no",
        "aadhar number": "aadhar_no",
        "name as per aadhar": "name_adhar",
        "name as per aadhaar": "name_adhar",
        "mobile no as per aadhar": "mobile_adhar",
        "mobile no as per aadhaar": "mobile_adhar",
        "mothername": "mother_name",
        "father name": "father_name",
        "is d2d": "is_d2d",
        "program medium": "program_medium",
        "photo uploaded": "photo_uploaded",
        "use hostel": "hostel_required",
    },
    StudentProfile: {
        "enrollment": "enrollment_no",
        "enrollment no": "enrollment_no",
        "roll no": "enrollment_no",
        "roll number": "enrollment_no",
        "birth date": "birth_date",
        "admission cast category": "category",
        "admission caste category": "category",
        "local address": "address1",
        "permanent address": "address2",
        "local city": "city1",
        "permanent city": "city2",
        "mobile no": "contact_no",
        "mobile number": "contact_no",
        "total fees": "fees",
        "abc id": "abc_id",
        "aadhaar number": "aadhar_no",
        "aadhar number": "aadhar_no",
        "name as per aadhar": "name_adhar",
        "name as per aadhaar": "name_adhar",
        "mobile no as per aadhar": "mobile_adhar",
        "mobile no as per aadhaar": "mobile_adhar",
        "mothername": "mother_name",
        "father name": "father_name",
        "is d2d": "is_d2d",
        "program medium": "program_medium",
        "photo uploaded": "photo_uploaded",
        "use hostel": "hostel_required",
    },
    MigrationRecord: {
        "enrollment": "enrollment_no",
        "enrollment no": "enrollment_no",
        "enrollment_no": "enrollment_no",
        "docrec": "doc_rec_id",
        "doc rec": "doc_rec_id",
        "doc_rec": "doc_rec_id",
        "doc rec id": "doc_rec_id",
        "doc_rec_id": "doc_rec_id",
        "migration remark": "mg_remark",
        "mg remark": "mg_remark",
        "remark": "mg_remark",
        "book no": "book_no",
        "book number": "book_no",
        "cancelled": "mg_cancelled",
        "is cancelled": "mg_cancelled",
        "migration status": "mg_status",
    },
    StudentFeesLedger: {
        "enrollment": "enrollment_no",
        "enrollment no": "enrollment_no",
        "enrollment_no": "enrollment_no",
        "temp_enroll_no": "temp_enroll_no",
        "temp enrollment": "temp_enroll_no",
        "temp enrollment no": "temp_enroll_no",
        "enrollment id": "enrollment_id",
        "enrollment_id": "enrollment_id",
        "receipt": "receipt_no",
        "receipt no": "receipt_no",
        "receipt_no": "receipt_no",
        "receipt date": "receipt_date",
        "receipt_date": "receipt_date",
        "amount paid": "amount",
        "fees": "amount",
        "fee": "amount",
        "remarks": "remark",
    },
}


def _build_allowed_maps(model):
    spec = get_import_spec(model)
    allowed_set = set(spec["allowed_columns"])
    allowed_map = {str(col).lower(): col for col in allowed_set}
    allowed_norm_map = {_normalize_name_key(col): col for col in allowed_set}
    alias_map: Dict[str, str] = {}
    alias_norm_map: Dict[str, str] = {}
    for klass, aliases in COLUMN_ALIAS_MAP.items():
        if issubclass(model, klass):
            for alias, target in aliases.items():
                if target in allowed_set:
                    alias_map[alias.lower()] = target
                    alias_norm_map[_normalize_name_key(alias)] = target
    return spec, allowed_set, allowed_map, alias_map, allowed_norm_map, alias_norm_map


def _resolve_column_name(raw, allowed_map, alias_map, allowed_norm_map=None, alias_norm_map=None):
    key = str(raw).strip().lower()
    if not key:
        return None
    resolved = allowed_map.get(key) or alias_map.get(key)
    if resolved:
        return resolved
    norm_key = _normalize_name_key(key)
    if not norm_key:
        return None
    if allowed_norm_map:
        resolved = allowed_norm_map.get(norm_key)
        if resolved:
            return resolved
    if alias_norm_map:
        resolved = alias_norm_map.get(norm_key)
        if resolved:
            return resolved
    return None


GENERIC_BULK_COLUMN_ALIAS_MAP = {
    "srno": "sr_no",
    "sr no": "sr_no",
    "key": "enrollment_no",
    "enrollment": "enrollment_no",
    "enrollment no": "enrollment_no",
    "roll no": "enrollment_no",
    "roll number": "enrollment_no",
    "enrollment_no": "enrollment_no",
    "enrollment id": "enrollment_id",
    "enrollment_id": "enrollment_id",
    "docrec": "doc_rec_id",
    "doc rec": "doc_rec_id",
    "doc_rec_id": "doc_rec_id",
    "doc_rec": "doc_rec_id",
    "doc rec id": "doc_rec_id",
    "doc rec key": "doc_rec_key",
    "doc_rec_key": "doc_rec_key",
    "institute": "institute_id",
    "institute id": "institute_id",
    "institute_id": "institute_id",
    "temp enrollment": "temp_enroll_no",
    "temp enrollment no": "temp_enroll_no",
    "temp student id": "temp_enroll_no",
    "temp student": "temp_enroll_no",
    "temp_enroll_no": "temp_enroll_no",
    "main": "maincourse_id",
    "maincourse": "maincourse_id",
    "main course": "maincourse_id",
    "maincourse id": "maincourse_id",
    "sub": "subcourse_id",
    "subcourse": "subcourse_id",
    "sub course": "subcourse_id",
    "subcourse id": "subcourse_id",
    "mg number": "mg_number",
    "mg_number": "mg_number",
    "mg date": "mg_date",
    "mg_date": "mg_date",
    "mg status": "mg_status",
    "migration status": "mg_status",
    "mg cancelled": "mg_cancelled",
    "migration cancelled": "mg_cancelled",
    "is cancelled": "mg_cancelled",
    "book no": "book_no",
    "book number": "book_no",
    "book_no": "book_no",
    "mg remark": "mg_remark",
    "migration remark": "mg_remark",
    "mg_remark": "mg_remark",
    "student name": "student_name",
    "studentname": "student_name",
    "student_name": "student_name",
    "remark": "mg_remark",
    "batch": "batch",
    "registration date": "enrollment_date",
    "enrollment date": "enrollment_date",
    "admission date": "admission_date",
    "father name": "father_name",
    "fathername": "father_name",
    "mother name": "mother_name",
    "mothername": "mother_name",
    "gender": "gender",
    "birth date": "birth_date",
    "birthdate": "birth_date",
    "address1": "address1",
    "address2": "address2",
    "contact no": "contact_no",
    "contactno": "contact_no",
    "mobile no": "contact_no",
    "mobile number": "contact_no",
    "local address": "address1",
    "permanent address": "address2",
    "city1": "city1",
    "city2": "city2",
    "local city": "city1",
    "permanent city": "city2",
    "email": "email",
    "email id": "email",
    "admission cast category": "category",
    "admission caste category": "category",
    "category": "category",
    "fees": "fees",
    "total fees": "fees",
    "aadhar no": "aadhar_no",
    "aadhar number": "aadhar_no",
    "aadhaar number": "aadhar_no",
    "abc id": "abc_id",
    "abcid": "abc_id",
    "mobile adhar": "mobile_adhar",
    "mobile no as per aadhar": "mobile_adhar",
    "mobile no as per aadhaar": "mobile_adhar",
    "name adhar": "name_adhar",
    "name as per aadhar": "name_adhar",
    "name as per aadhaar": "name_adhar",
    "is d2d": "is_d2d",
    "program medium": "program_medium",
    "hostel required": "hostel_required",
    "use hostel": "hostel_required",
    "photo uploaded": "photo_uploaded",
    "pay rec no": "pay_rec_no",
    "pay_rec_no": "pay_rec_no",
    "exam year": "exam_year",
    "exam_year": "exam_year",
    "admission year": "admission_year",
    "admission_year": "admission_year",
    "student no": "student_no",
    "student number": "student_no",
    "student_no": "student_no",
    "receipt no": "receipt_no",
    "receipt number": "receipt_no",
    "receipt_no": "receipt_no",
    "receipt date": "receipt_date",
    "receipt_date": "receipt_date",
    "term": "term",
    "amount": "amount",
    "remark": "remark",
    "remarks": "remark",
}


_GENERIC_BULK_ALIAS_MAP = {str(alias).lower(): target for alias, target in GENERIC_BULK_COLUMN_ALIAS_MAP.items()}
_GENERIC_BULK_ALIAS_NORM_MAP = {_normalize_name_key(alias): target for alias, target in GENERIC_BULK_COLUMN_ALIAS_MAP.items()}


def resolve_generic_bulk_column_name(raw: Any):
    return _resolve_column_name(raw, {}, _GENERIC_BULK_ALIAS_MAP, None, _GENERIC_BULK_ALIAS_NORM_MAP)


def resolve_bulk_service_column_name(raw: Any, service: Any):
    service_name = str(service or "").strip().upper()
    service_columns = get_bulk_service_template_columns(service_name)
    if service_columns:
        service_allowed_map = {str(col).lower(): col for col in service_columns}
        service_allowed_norm_map = {_normalize_name_key(col): col for col in service_columns}
        resolved = _resolve_column_name(raw, service_allowed_map, {}, service_allowed_norm_map, None)
        if resolved:
            return resolved

    service_model = get_bulk_service_model(service_name)
    if service_model is not None:
        _, _, allowed_map, alias_map, allowed_norm_map, alias_norm_map = _build_allowed_maps(service_model)
        resolved = _resolve_column_name(raw, allowed_map, alias_map, allowed_norm_map, alias_norm_map)
        if resolved:
            return resolved

    return resolve_generic_bulk_column_name(raw)