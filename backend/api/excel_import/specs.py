"""
excel_import/specs.py
---------------------
Per-model Excel import specifications, column alias maps, and column-name
resolution helpers.  Extracted from admin.py for maintainability.

All public names here are re-exported by admin.py.
"""
import re
from typing import Any, Dict

from ..models import (
    MainBranch, SubBranch, Institute, Enrollment, AdmissionCancel, DocRec,
    MigrationRecord, ProvisionalRecord, StudentProfile, Verification,
    FeeType, Receipt,
)
from ..domain_emp import EmpProfile, LeaveEntry
from ..domain_degree import StudentDegree
from ..domain_fees_ledger import StudentFeesLedger


# ---------------------------------------------------------------------------
# Per-model import spec (column whitelist + required / create-requires keys)
# ---------------------------------------------------------------------------

def get_import_spec(model) -> Dict[str, Any]:
    specs: Dict[type, Dict[str, Any]] = {
        MainBranch: {
            "allowed_columns": ["maincourse_id", "course_code", "course_name"],
            "required_keys": ["maincourse_id"],
            "create_requires": ["maincourse_id"],
        },
        SubBranch: {
            "allowed_columns": ["subcourse_id", "subcourse_name", "maincourse_id"],
            "required_keys": ["subcourse_id", "maincourse_id"],
            "create_requires": ["subcourse_id", "maincourse_id"],
        },
        Institute: {
            "allowed_columns": [
                "institute_id", "institute_code", "institute_name",
                "institute_campus", "institute_address", "institute_city",
            ],
            "required_keys": ["institute_id"],
            "create_requires": ["institute_id", "institute_code"],
        },
        Enrollment: {
            "allowed_columns": [
                "enrollment_no", "student_name", "batch", "institute_id",
                "subcourse_id", "maincourse_id", "temp_enroll_no",
                "enrollment_date", "admission_date", "gender", "birth_date",
                "address1", "address2", "city1", "city2", "contact_no", "email",
                "fees", "hostel_required", "aadhar_no", "abc_id", "mobile_adhar",
                "name_adhar", "mother_name", "father_name", "category",
                "photo_uploaded", "is_d2d", "program_medium",
            ],
            "required_keys": ["enrollment_no"],
            "create_requires": [
                "enrollment_no", "student_name", "batch",
                "institute_id", "subcourse_id", "maincourse_id",
            ],
        },
        AdmissionCancel: {
            "allowed_columns": [
                "enrollment_no", "student_name", "inward_no", "inward_date",
                "outward_no", "outward_date", "can_remark", "status",
            ],
            "required_keys": ["enrollment_no"],
            "create_requires": ["enrollment_no"],
        },
        EmpProfile: {
            "allowed_columns": [
                "emp_id", "emp_name", "emp_designation", "username", "usercode",
                "actual_joining", "emp_birth_date", "usr_birth_date",
                "department_joining", "institute_id", "status",
                "el_balance", "sl_balance", "cl_balance", "vacation_balance",
                "joining_year_allocation_el", "joining_year_allocation_cl",
                "joining_year_allocation_sl", "joining_year_allocation_vac",
                "leave_calculation_date", "emp_short",
            ],
            "required_keys": ["emp_id"],
            "create_requires": ["emp_id", "emp_name"],
        },
        LeaveEntry: {
            "allowed_columns": [
                "leave_report_no", "emp_id", "leave_code", "start_date",
                "end_date", "total_days", "reason", "status",
                "created_by", "approved_by", "approved_at",
            ],
            "required_keys": ["leave_report_no"],
            "create_requires": ["leave_report_no", "emp_id", "leave_code", "start_date"],
        },
        StudentProfile: {
            "allowed_columns": [
                "enrollment_no", "gender", "birth_date", "address1", "address2",
                "city1", "city2", "contact_no", "email", "fees", "hostel_required",
                "aadhar_no", "abc_id", "mobile_adhar", "name_adhar",
                "mother_name", "father_name", "category", "photo_uploaded",
                "is_d2d", "program_medium",
            ],
            "required_keys": ["enrollment_no"],
            "create_requires": ["enrollment_no"],
        },
        FeeType: {
            "allowed_columns": ["code", "name", "is_active"],
            "required_keys": ["code", "name"],
            "create_requires": ["code", "name"],
        },
        Receipt: {
            "allowed_columns": [
                "receipt_no_full", "rec_ref", "rec_no", "date", "payment_mode",
                "fee_type_code", "fee_type", "amount", "total_amount", "remark",
                "is_cancelled", "cancel_reason", "cancelled_by",
            ],
            "required_keys": ["date", "payment_mode"],
            "create_requires": ["date", "payment_mode"],
        },
        DocRec: {
            "allowed_columns": [
                "apply_for", "doc_rec_id", "pay_by", "pay_rec_no_pre",
                "pay_rec_no", "pay_amount", "doc_rec_date", "doc_rec_remark",
            ],
            "required_keys": ["apply_for", "doc_rec_id", "pay_by"],
            "create_requires": ["apply_for", "doc_rec_id", "pay_by"],
        },
        MigrationRecord: {
            "allowed_columns": [
                "doc_rec_id", "enrollment_no", "student_name", "institute_id",
                "maincourse_id", "subcourse_id", "mg_number", "mg_date",
                "exam_year", "admission_year", "exam_details", "mg_status", "pay_rec_no",
            ],
            "required_keys": ["doc_rec_id"],
            "create_requires": ["doc_rec_id"],
        },
        ProvisionalRecord: {
            "allowed_columns": [
                "doc_rec_id", "enrollment_no", "student_name", "institute_id",
                "maincourse_id", "subcourse_id", "prv_number", "prv_date",
                "class_obtain", "prv_degree_name", "passing_year", "prv_status", "pay_rec_no",
            ],
            "required_keys": ["doc_rec_id"],
            "create_requires": ["doc_rec_id"],
        },
        Verification: {
            "allowed_columns": [
                "doc_rec_id", "date", "enrollment_no", "second_enrollment_no",
                "student_name", "no_of_transcript", "no_of_marksheet",
                "no_of_degree", "no_of_moi", "no_of_backlog", "status",
                "final_no", "pay_rec_no", "vr_done_date", "mail_status",
                "eca_required", "eca_name", "eca_ref_no", "eca_submit_date",
                "eca_remark", "doc_rec_remark",
            ],
            "required_keys": ["doc_rec_id"],
            "create_requires": ["doc_rec_id"],
        },
        StudentDegree: {
            "allowed_columns": [
                "dg_sr_no", "enrollment_no", "student_name_dg", "dg_address",
                "institute_name_dg", "degree_name", "specialisation",
                "seat_last_exam", "last_exam_month", "last_exam_year",
                "class_obtain", "course_language", "dg_rec_no", "dg_gender",
                "convocation_no",
            ],
            "required_keys": ["enrollment_no"],
            "create_requires": ["enrollment_no"],
        },
        StudentFeesLedger: {
            "allowed_columns": [
                "enrollment_no", "temp_enroll_no", "enrollment_id",
                "receipt_no", "receipt_date", "term", "amount", "remark",
            ],
            "required_keys": [],
            "create_requires": [],
        },
    }
    for klass, spec in specs.items():
        if issubclass(model, klass):
            return spec
    return {"allowed_columns": [], "required_keys": [], "create_requires": []}


# ---------------------------------------------------------------------------
# Column alias maps (human-friendly header names → canonical field names)
# ---------------------------------------------------------------------------

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


# ---------------------------------------------------------------------------
# Column name resolution helpers
# ---------------------------------------------------------------------------

def _build_allowed_maps(model):
    """Return (spec, allowed_set, allowed_map, alias_map, allowed_norm_map, alias_norm_map)."""
    spec = get_import_spec(model)
    allowed_set = set(spec["allowed_columns"])
    allowed_map = {str(col).lower(): col for col in allowed_set}
    allowed_norm_map = {
        re.sub(r"[^0-9a-zA-Z]", "", str(col).lower()): col
        for col in allowed_set
    }
    alias_map: Dict[str, str] = {}
    alias_norm_map: Dict[str, str] = {}
    for klass, aliases in COLUMN_ALIAS_MAP.items():
        if issubclass(model, klass):
            for alias, target in aliases.items():
                if target in allowed_set:
                    alias_map[alias.lower()] = target
                    alias_norm_map[re.sub(r"[^0-9a-zA-Z]", "", alias.lower())] = target
    return spec, allowed_set, allowed_map, alias_map, allowed_norm_map, alias_norm_map


def _resolve_column_name(raw, allowed_map, alias_map, allowed_norm_map=None, alias_norm_map=None):
    """Map a raw incoming column header to its canonical field name, or None if not whitelisted."""
    key = str(raw).strip().lower()
    if not key:
        return None
    resolved = allowed_map.get(key) or alias_map.get(key)
    if resolved:
        return resolved
    norm_key = re.sub(r"[^0-9a-zA-Z]", "", key)
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
