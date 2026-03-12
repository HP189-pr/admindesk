"""Institutional verification importer used by bulk upload flows."""

from ..helpers import clean_cell, normalize_month_year, parse_excel_date
from ..validators import field_scope
from ...domain_documents import ApplyFor
from ...domain_letter import InstLetterMain, InstLetterStudent
from ...models import Institute
from .base import ImportContext, RowImportResult
from .common import ensure_docrec, lookup_docrec, lookup_enrollment, normalize_identifier, scalar


def _normalize_study_mode(raw):
    cleaned = clean_cell(raw)
    if cleaned is None:
        return None
    text = str(cleaned).strip()
    lowered = text.lower()
    if lowered in {"r", "reg", "regular", "regular mode"}:
        return "Regular"
    if lowered in {"p", "pt", "part", "part time", "part-time"}:
        return "Part Time"
    return text[:20]


def _upsert_student(doc_rec, payload, *, fallback_study_mode=None):
    enrollment_key = clean_cell(payload.get("enrollment_no") or payload.get("enrollment"))
    enrollment = lookup_enrollment(enrollment_key) if enrollment_key else None
    enrollment_text = None if enrollment is not None else enrollment_key
    sr_no = payload.get("sr_no")
    try:
        sr_no = int(float(sr_no)) if sr_no not in (None, "") else None
    except Exception:
        sr_no = None

    existing = None
    if enrollment is not None:
        existing = InstLetterStudent.objects.filter(doc_rec=doc_rec, enrollment=enrollment).first()
    elif enrollment_text:
        existing = InstLetterStudent.objects.filter(doc_rec=doc_rec, enrollment_no_text=enrollment_text).first()
    if existing is None and sr_no is not None:
        existing = InstLetterStudent.objects.filter(doc_rec=doc_rec, sr_no=sr_no).first()

    defaults = {
        "student_name": clean_cell(payload.get("student_name")),
        "iv_degree_name": clean_cell(payload.get("iv_degree_name")),
        "type_of_credential": clean_cell(payload.get("type_of_credential")),
        "month_year": normalize_month_year(payload.get("month_year")) or None,
        "verification_status": clean_cell(payload.get("verification_status")),
        "study_mode": _normalize_study_mode(payload.get("study_mode")) or fallback_study_mode,
        "enrollment": enrollment,
        "enrollment_no_text": enrollment_text,
        "sr_no": sr_no,
    }

    if existing is None:
        InstLetterStudent.objects.create(doc_rec=doc_rec, **defaults)
        return True

    changed = False
    for field_name, value in defaults.items():
        if getattr(existing, field_name, None) != value:
            setattr(existing, field_name, value)
            changed = True
    if changed:
        existing.save()
    return False


def process_row(row, context: ImportContext) -> RowImportResult:
    scope = field_scope(row, context.active_fields)
    doc_rec_key = clean_cell(scalar(row, "doc_rec_id"))
    if not doc_rec_key:
        last_doc_rec = getattr(context, "_last_inst_doc_rec", None)
        if last_doc_rec is not None:
            doc_rec = last_doc_rec
            doc_rec_key = getattr(last_doc_rec, "doc_rec_id", None)
        else:
            doc_rec = None
    else:
        doc_rec = lookup_docrec(doc_rec_key)

    if doc_rec is None and context.auto_create_docrec:
        doc_rec, _ = ensure_docrec(
            doc_rec_key,
            apply_for=ApplyFor.INST_VERIFICATION,
            user=context.user,
            doc_rec_date=parse_excel_date(scalar(row, "doc_rec_date")),
        )
    if doc_rec is None:
        return RowImportResult(status="skipped", message="Missing or invalid doc_rec_id", ref=doc_rec_key)

    setattr(context, "_last_inst_doc_rec", doc_rec)
    study_mode = _normalize_study_mode(scalar(row, "study_mode"))
    institute_key = clean_cell(scalar(row, "institute_id")) if "institute_id" in scope else None
    institute = Institute.objects.filter(institute_id=institute_key).first() if institute_key else None
    main_defaults = {
        "inst_veri_number": clean_cell(scalar(row, "inst_veri_number")) if "inst_veri_number" in scope else None,
        "inst_veri_date": parse_excel_date(scalar(row, "inst_veri_date")) if "inst_veri_date" in scope else None,
        "rec_inst_name": clean_cell(scalar(row, "rec_inst_name")) if "rec_inst_name" in scope else None,
        "rec_inst_address_1": clean_cell(scalar(row, "rec_inst_address_1")) if "rec_inst_address_1" in scope else None,
        "rec_inst_address_2": clean_cell(scalar(row, "rec_inst_address_2")) if "rec_inst_address_2" in scope else None,
        "rec_inst_location": clean_cell(scalar(row, "rec_inst_location")) if "rec_inst_location" in scope else None,
        "rec_inst_city": clean_cell(scalar(row, "rec_inst_city")) if "rec_inst_city" in scope else None,
        "rec_inst_pin": clean_cell(scalar(row, "rec_inst_pin")) if "rec_inst_pin" in scope else None,
        "rec_inst_email": clean_cell(scalar(row, "rec_inst_email")) if "rec_inst_email" in scope else None,
        "rec_inst_phone": clean_cell(scalar(row, "rec_inst_phone")) if "rec_inst_phone" in scope else None,
        "doc_types": clean_cell(scalar(row, "doc_types")) if "doc_types" in scope else None,
        "rec_inst_sfx_name": clean_cell(scalar(row, "rec_inst_sfx_name")) if "rec_inst_sfx_name" in scope else None,
        "iv_status": clean_cell(scalar(row, "iv_status")) if "iv_status" in scope else None,
        "rec_by": clean_cell(scalar(row, "rec_by")) if "rec_by" in scope else None,
        "doc_rec_date": parse_excel_date(scalar(row, "doc_rec_date")) if "doc_rec_date" in scope else None,
        "inst_ref_no": clean_cell(scalar(row, "inst_ref_no")) if "inst_ref_no" in scope else None,
        "ref_date": parse_excel_date(scalar(row, "ref_date")) if "ref_date" in scope else None,
        "institute": institute,
    }

    main = InstLetterMain.objects.filter(doc_rec=doc_rec).first()
    main_created = False
    if main is None:
        create_fields = {field_name: value for field_name, value in main_defaults.items() if value is not None}
        InstLetterMain.objects.create(doc_rec=doc_rec, **create_fields)
        main_created = True
    else:
        changed = False
        for field_name, value in main_defaults.items():
            if value is not None and getattr(main, field_name, None) != value:
                setattr(main, field_name, value)
                changed = True
        if changed:
            main.save()

    student_created = False
    student_errors = []
    students_payload = scalar(row, "students")
    if isinstance(students_payload, list):
        for payload in students_payload:
            try:
                student_created = _upsert_student(doc_rec, payload, fallback_study_mode=study_mode) or student_created
            except Exception as exc:
                student_errors.append(str(exc))
    elif clean_cell(scalar(row, "student_name")) or clean_cell(scalar(row, "enrollment_no")):
        try:
            payload = {
                "sr_no": normalize_identifier(scalar(row, "sr_no")),
                "student_name": scalar(row, "student_name"),
                "iv_degree_name": scalar(row, "iv_degree_name"),
                "type_of_credential": scalar(row, "type_of_credential"),
                "month_year": scalar(row, "month_year"),
                "verification_status": scalar(row, "verification_status"),
                "enrollment_no": scalar(row, "enrollment_no"),
                "study_mode": scalar(row, "study_mode"),
            }
            student_created = _upsert_student(doc_rec, payload, fallback_study_mode=study_mode) or student_created
        except Exception as exc:
            student_errors.append(str(exc))

    message = "Upserted"
    if student_errors:
        message = f"Upserted with student warnings: {student_errors[0]}"
    return RowImportResult(
        status="created" if main_created or student_created else "updated",
        message=message,
        ref=doc_rec_key,
    )