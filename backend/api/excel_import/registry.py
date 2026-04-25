# backend/api/excel_import/registry.py
"""Central registry for bulk/admin Excel import services and importer adapters."""

from dataclasses import dataclass
from typing import Optional, Set

from ..domain_cash_register import FeeType
from ..domain_degree import StudentDegree
from ..domain_emp import EmpProfile, LeaveEntry
from ..domain_fees_ledger import StudentFeesLedger
from ..models import AdmissionCancel, DocRec, Enrollment, Institute, MainBranch, MigrationRecord, ProvisionalRecord, StudentProfile, SubBranch, Verification
from .importers import RowImporter
from .importers import (
    admission_cancel_importer,
    degree_importer,
    docrec_importer,
    emp_profile_importer,
    enrollment_importer,
    fee_type_importer,
    institutional_verification_importer,
    institute_importer,
    leave_importer,
    maincourse_importer,
    migration_importer,
    provisional_importer,
    student_fees_importer,
    student_profile_importer,
    subcourse_importer,
    verification_importer,
)


BULK_SERVICE_MODEL_MAP = {
    "DOCREC": DocRec,
    "INSTITUTE": Institute,
    "ENROLLMENT": Enrollment,
    "MIGRATION": MigrationRecord,
    "PROVISIONAL": ProvisionalRecord,
    "VERIFICATION": Verification,
    "DEGREE": StudentDegree,
    "EMP_PROFILE": EmpProfile,
    "LEAVE": LeaveEntry,
    "STUDENT_FEES": StudentFeesLedger,
    "STUDENT_PROFILE": StudentProfile,
}


BULK_SERVICE_TEMPLATE_COLUMNS = {
    "DOCREC": [
        "apply_for", "doc_rec_id", "pay_by", "pay_rec_no_pre", "pay_rec_no", "pay_amount", "doc_rec_date",
    ],
    "INSTITUTE": [
        "institute_id", "institute_code", "institute_name", "institute_campus", "institute_address", "institute_city",
    ],
    "INSTITUTIONAL_VERIFICATION": [
        "doc_rec_id", "inst_veri_number", "inst_veri_date", "rec_inst_name", "rec_inst_address_1", "rec_inst_address_2",
        "rec_inst_location", "rec_inst_city", "rec_inst_pin", "rec_inst_email", "rec_by", "doc_rec_date", "inst_ref_no", "ref_date", "institute_id",
        "sr_no", "student_name", "iv_degree_name", "type_of_credential", "month_year", "verification_status", "enrollment_no", "maincourse_id", "subcourse_id",
    ],
    "ENROLLMENT": [
        "student_name", "institute_id", "batch", "enrollment_date", "subcourse_id", "maincourse_id", "enrollment_no", "temp_enroll_no", "admission_date",
    ],
    "MIGRATION": [
        "doc_rec_id", "enrollment_no", "student_name", "institute_id", "maincourse_id", "subcourse_id", "mg_number", "mg_date", "exam_year", "admission_year", "exam_details", "mg_status", "mg_cancelled", "mg_remark", "book_no", "pay_rec_no",
    ],
    "PROVISIONAL": [
        "doc_rec_id", "enrollment_no", "student_name", "institute_id", "maincourse_id", "subcourse_id", "prv_number", "prv_date", "class_obtain", "prv_degree_name", "passing_year", "prv_status", "pay_rec_no",
    ],
    "VERIFICATION": [
        "doc_rec_id", "date", "enrollment_no", "second_enrollment_no", "student_name", "no_of_transcript", "no_of_marksheet", "no_of_degree", "no_of_moi", "no_of_backlog", "status", "final_no", "pay_rec_no",
    ],
    "DEGREE": [
        "dg_sr_no", "enrollment_no", "student_name_dg", "dg_address", "dg_contact",
        "institute_name_dg", "degree_name", "specialisation", "seat_last_exam",
        "last_exam_month", "last_exam_year", "class_obtain", "course_language",
        "dg_rec_no", "dg_gender", "convocation_no",
    ],
    "EMP_PROFILE": [
        "emp_id", "emp_name", "emp_designation", "username", "usercode", "actual_joining", "emp_birth_date", "usr_birth_date", "department_joining", "institute_id", "status", "el_balance", "sl_balance", "cl_balance", "vacation_balance",
        "joining_year_allocation_el", "joining_year_allocation_cl", "joining_year_allocation_sl", "joining_year_allocation_vac", "leave_calculation_date", "emp_short",
    ],
    "LEAVE": [
        "leave_report_no", "emp_id", "leave_code", "start_date", "end_date", "total_days", "reason", "status", "created_by", "approved_by", "approved_at",
    ],
    "STUDENT_FEES": [
        "enrollment_no", "temp_enroll_no", "enrollment_id", "receipt_no", "receipt_date", "term", "amount", "remark",
    ],
    "STUDENT_PROFILE": [
        "enrollment_no", "gender", "birth_date", "address1", "address2", "city1", "city2", "contact_no", "email", "fees", "hostel_required", "aadhar_no", "abc_id", "mobile_adhar", "name_adhar", "mother_name", "father_name", "category", "photo_uploaded", "is_d2d", "program_medium",
    ],
}


_BULK_IMPORTER_REGISTRY = {
    "DOCREC": docrec_importer.process_row,
    "ENROLLMENT": enrollment_importer.process_row,
    "STUDENT_PROFILE": student_profile_importer.process_row,
    "INSTITUTE": institute_importer.process_row,
    "MIGRATION": migration_importer.process_row,
    "PROVISIONAL": provisional_importer.process_row,
    "VERIFICATION": verification_importer.process_row,
    "DEGREE": degree_importer.process_row,
    "EMP_PROFILE": emp_profile_importer.process_row,
    "LEAVE": leave_importer.process_row,
    "STUDENT_FEES": student_fees_importer.process_row,
    "INSTITUTIONAL_VERIFICATION": institutional_verification_importer.process_row,
}


@dataclass(frozen=True)
class AdminImporterRegistration:
    model: type
    handler: RowImporter
    sheet_names: Optional[Set[str]] = None


_ADMIN_IMPORTER_REGISTRY = (
    AdminImporterRegistration(MainBranch, maincourse_importer.process_row, {"maincourse"}),
    AdminImporterRegistration(SubBranch, subcourse_importer.process_row, {"subcourse"}),
    AdminImporterRegistration(Institute, institute_importer.process_row, None),
    AdminImporterRegistration(Enrollment, enrollment_importer.process_row, None),
    AdminImporterRegistration(AdmissionCancel, admission_cancel_importer.process_row, None),
    AdminImporterRegistration(DocRec, docrec_importer.process_row, {"docrec", "doc_rec"}),
    AdminImporterRegistration(FeeType, fee_type_importer.process_row, None),
    AdminImporterRegistration(MigrationRecord, migration_importer.process_row, {"migration"}),
    AdminImporterRegistration(ProvisionalRecord, provisional_importer.process_row, {"provisional"}),
    AdminImporterRegistration(Verification, verification_importer.process_row, {"verification"}),
    AdminImporterRegistration(StudentProfile, student_profile_importer.process_row, {"studentprofile"}),
    AdminImporterRegistration(StudentDegree, degree_importer.process_row, {"studentdegree", "degree"}),
    AdminImporterRegistration(StudentFeesLedger, student_fees_importer.process_row, {"studentfees", "student_fees", "feesledger"}),
)


def get_bulk_service_model(service: Optional[str]):
    return BULK_SERVICE_MODEL_MAP.get(str(service or "").strip().upper())


def get_bulk_service_template_columns(service: Optional[str]):
    return list(BULK_SERVICE_TEMPLATE_COLUMNS.get(str(service or "").strip().upper(), []))


def get_bulk_importer(service: Optional[str]):
    return _BULK_IMPORTER_REGISTRY.get(str(service or "").strip().upper())


def _admin_sheet_name_matches(model, allowed_sheet_names: Optional[Set[str]], sheet_name: Optional[str]) -> bool:
    if not allowed_sheet_names:
        return True

    normalized_sheet = str(sheet_name or "").strip().lower()
    if normalized_sheet in allowed_sheet_names:
        return True

    model_name = getattr(getattr(model, "_meta", None), "model_name", "")
    accepted_model_sheet_names = {
        str(model_name).lower(),
        f"{str(model_name).lower()}_template",
    }
    return normalized_sheet in accepted_model_sheet_names


def get_admin_importer(model, sheet_name: Optional[str] = None):
    fallback_handler = None
    for registration in _ADMIN_IMPORTER_REGISTRY:
        if issubclass(model, registration.model):
            fallback_handler = registration.handler
            if _admin_sheet_name_matches(model, registration.sheet_names, sheet_name):
                return registration.handler
    return fallback_handler
