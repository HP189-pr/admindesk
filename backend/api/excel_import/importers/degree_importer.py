"""Student degree importer shared by admin and bulk upload flows."""

from ..helpers import clean_cell
from ..validators import field_scope
from ...domain_degree import StudentDegree
from .base import ImportContext, RowImportResult
from .common import normalize_identifier, optional_int, scalar


def process_row(row, context: ImportContext) -> RowImportResult:
    scope = field_scope(row, context.active_fields)
    enrollment_no = clean_cell(scalar(row, "enrollment_no"))
    if not enrollment_no:
        return RowImportResult(status="skipped", message="Missing enrollment_no", ref=normalize_identifier(scalar(row, "dg_sr_no")))

    dg_sr_no = normalize_identifier(scalar(row, "dg_sr_no"))
    defaults = {
        "enrollment_no": enrollment_no,
    }
    for source_name in (
        "student_name_dg",
        "dg_address",
        "dg_contact",
        "institute_name_dg",
        "degree_name",
        "specialisation",
        "seat_last_exam",
        "last_exam_month",
        "class_obtain",
        "course_language",
        "dg_gender",
    ):
        if source_name in scope:
            defaults[source_name] = clean_cell(scalar(row, source_name))
    if "last_exam_year" in scope:
        defaults["last_exam_year"] = optional_int(scalar(row, "last_exam_year"))
    if "convocation_no" in scope:
        defaults["convocation_no"] = optional_int(scalar(row, "convocation_no"))
    if "dg_rec_no" in scope:
        defaults["dg_rec_no"] = normalize_identifier(scalar(row, "dg_rec_no"))

    if dg_sr_no:
        _, created = StudentDegree.objects.update_or_create(dg_sr_no=dg_sr_no, defaults=defaults)
        ref = dg_sr_no
    else:
        StudentDegree.objects.create(dg_sr_no=None, **defaults)
        created = True
        ref = enrollment_no

    return RowImportResult(
        status="created" if created else "updated",
        message="Created" if created else "Updated",
        ref=ref,
    )