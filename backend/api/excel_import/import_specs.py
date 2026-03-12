"""Per-model import specifications for Excel upload workflows."""

from typing import Any, Dict

from ..domain_degree import StudentDegree
from ..domain_emp import EmpProfile, LeaveEntry
from ..domain_fees_ledger import StudentFeesLedger
from ..domain_cash_register import Receipt, FeeType
from ..models import (
    AdmissionCancel,
    DocRec,
    Enrollment,
    Institute,
    MainBranch,
    MigrationRecord,
    ProvisionalRecord,
    StudentProfile,
    SubBranch,
    Verification,
)


IMPORT_SPECS: Dict[type, Dict[str, Any]] = {
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


def get_import_spec(model) -> Dict[str, Any]:
    for klass, spec in IMPORT_SPECS.items():
        if issubclass(model, klass):
            return spec
    return {"allowed_columns": [], "required_keys": [], "create_requires": []}