# backend/api/excel_import/enrollment_profile.py
"""Shared Enrollment and StudentProfile import processors."""

from typing import Any, Iterable, Optional

from django.db import models
from django.db.models import Value
from django.db.models.functions import Lower, Replace
from django.utils import timezone

from ..models import Enrollment, Institute, MainBranch, StudentProfile, SubBranch
from .helpers import clean_cell, coerce_decimal_or_none, parse_excel_date, parse_boolean_cell


PROFILE_UPLOAD_COLS = {
    "gender", "birth_date", "address1", "address2", "city1", "city2",
    "contact_no", "email", "fees", "hostel_required", "aadhar_no", "abc_id",
    "mobile_adhar", "name_adhar", "mother_name", "father_name", "category",
    "photo_uploaded", "is_d2d", "program_medium",
}

ENROLLMENT_CORE_COLS = {
    "student_name", "batch", "institute_id", "subcourse_id", "maincourse_id",
    "temp_enroll_no", "enrollment_date", "admission_date",
}


def _field_scope(row, active_fields: Optional[Iterable[str]] = None):
    if active_fields is not None:
        return set(active_fields)
    return set(getattr(row, "index", []))


def row_has_any(row, cols, active_fields: Optional[Iterable[str]] = None):
    scope = _field_scope(row, active_fields)
    return any(column in scope for column in cols)


def to_bool(val):
    try:
        parsed = parse_boolean_cell(val)
    except ValueError:
        return False
    return bool(parsed) if parsed is not None else False


def to_int_or_none(val):
    cleaned = clean_cell(val)
    if cleaned is None:
        return None
    try:
        return int(float(cleaned))
    except Exception:
        return None


def lookup_enrollment(enrollment_key):
    if not enrollment_key:
        return None
    enr = Enrollment.objects.filter(enrollment_no=enrollment_key).first()
    if not enr:
        try:
            enr = Enrollment.objects.filter(enrollment_no__iexact=enrollment_key).first()
        except Exception:
            enr = None
    if not enr:
        try:
            normalized = "".join(str(enrollment_key).split()).lower()
            enr = (
                Enrollment.objects
                .annotate(_norm=Replace(Lower(models.F("enrollment_no")), Value(" "), Value("")))
                .filter(_norm=normalized)
                .first()
            )
        except Exception:
            enr = None
    return enr


def _normalize_lookup_token(raw_val):
    cleaned = clean_cell(raw_val)
    if cleaned is None:
        return None
    sval = str(cleaned).strip()
    if not sval:
        return None
    import re
    if re.fullmatch(r"[0-9]+(?:\.0+)?", sval):
        try:
            return str(int(float(sval)))
        except Exception:
            return sval
    return sval


def _resolve_institute(raw_val):
    token = _normalize_lookup_token(raw_val)
    if not token:
        return None, None
    obj = None
    try:
        obj = Institute.objects.filter(institute_id=int(token)).first()
    except Exception:
        obj = None
    if not obj:
        obj = Institute.objects.filter(institute_code__iexact=token).first()
    if not obj:
        obj = Institute.objects.filter(institute_name__iexact=token).first()
    return obj, token


def _resolve_maincourse(raw_val):
    token = _normalize_lookup_token(raw_val)
    if not token:
        return None, None
    obj = MainBranch.objects.filter(maincourse_id__iexact=token).first()
    if not obj:
        obj = MainBranch.objects.filter(course_code__iexact=token).first()
    if not obj:
        obj = MainBranch.objects.filter(course_name__iexact=token).first()
    return obj, token


def _resolve_subcourse(raw_val, main_obj=None):
    token = _normalize_lookup_token(raw_val)
    if not token:
        return None, None
    obj = SubBranch.objects.filter(subcourse_id__iexact=token).first()
    if not obj and main_obj is not None:
        obj = SubBranch.objects.filter(subcourse_name__iexact=token, maincourse=main_obj).first()
    if not obj:
        obj = SubBranch.objects.filter(subcourse_name__iexact=token).first()
    return obj, token


def resolve_enrollment_fk(row, active_fields: Optional[Iterable[str]] = None):
    scope = _field_scope(row, active_fields)
    institute = None
    subcourse = None
    maincourse = None
    missing_related = []

    if "institute_id" in scope:
        institute, inst_key = _resolve_institute(row.get("institute_id"))
        if inst_key and not institute:
            missing_related.append(("institute_id", inst_key))
    if "maincourse_id" in scope:
        maincourse, main_key = _resolve_maincourse(row.get("maincourse_id"))
        if main_key and not maincourse:
            missing_related.append(("maincourse_id", main_key))
    if "subcourse_id" in scope:
        subcourse, sub_key = _resolve_subcourse(row.get("subcourse_id"), maincourse)
        if sub_key and not subcourse:
            missing_related.append(("subcourse_id", sub_key))

    return institute, subcourse, maincourse, missing_related


def build_profile_defaults(row, user, active_fields: Optional[Iterable[str]] = None):
    scope = _field_scope(row, active_fields)
    defaults = {"updated_by": user}

    if "gender" in scope:
        defaults["gender"] = clean_cell(row.get("gender"))
    if "birth_date" in scope:
        defaults["birth_date"] = parse_excel_date(row.get("birth_date"))
    if "address1" in scope:
        defaults["address1"] = clean_cell(row.get("address1"))
    if "address2" in scope:
        defaults["address2"] = clean_cell(row.get("address2"))
    if "city1" in scope:
        defaults["city1"] = clean_cell(row.get("city1"))
    if "city2" in scope:
        defaults["city2"] = clean_cell(row.get("city2"))
    if "contact_no" in scope:
        defaults["contact_no"] = clean_cell(row.get("contact_no"))
    if "email" in scope:
        defaults["email"] = clean_cell(row.get("email"))
    if "fees" in scope:
        defaults["fees"] = coerce_decimal_or_none(row.get("fees"))
    if "hostel_required" in scope:
        defaults["hostel_required"] = to_bool(row.get("hostel_required"))
    if "aadhar_no" in scope:
        defaults["aadhar_no"] = clean_cell(row.get("aadhar_no"))
    if "abc_id" in scope:
        defaults["abc_id"] = clean_cell(row.get("abc_id"))
    if "mobile_adhar" in scope:
        defaults["mobile_adhar"] = clean_cell(row.get("mobile_adhar"))
    if "name_adhar" in scope:
        defaults["name_adhar"] = clean_cell(row.get("name_adhar"))
    if "mother_name" in scope:
        defaults["mother_name"] = clean_cell(row.get("mother_name"))
    if "father_name" in scope:
        defaults["father_name"] = clean_cell(row.get("father_name"))
    if "category" in scope:
        defaults["category"] = clean_cell(row.get("category"))
    if "photo_uploaded" in scope:
        defaults["photo_uploaded"] = to_bool(row.get("photo_uploaded"))
    if "is_d2d" in scope:
        defaults["is_d2d"] = to_bool(row.get("is_d2d"))
    if "program_medium" in scope:
        defaults["program_medium"] = clean_cell(row.get("program_medium"))

    return defaults


def upsert_profile_from_row(enrollment_obj, row, user, active_fields: Optional[Iterable[str]] = None, require_profile_fields: bool = True):
    scope = _field_scope(row, active_fields)
    if require_profile_fields and not any(column in scope for column in PROFILE_UPLOAD_COLS):
        return None
    defaults = build_profile_defaults(row, user, active_fields=active_fields)
    _, created_profile = StudentProfile.objects.update_or_create(
        enrollment=enrollment_obj,
        defaults=defaults,
    )
    return created_profile


def _infer_batch_from_key(text):
    if not text:
        return None
    import re

    sval = str(text).strip()
    if not sval:
        return None
    match4 = re.search(r"(20\d{2})", sval)
    if match4:
        try:
            year = int(match4.group(1))
            if 1990 <= year <= 2100:
                return year
        except Exception:
            pass

    match2 = re.match(r"^([0-9]{2})(?=[A-Za-z])", sval)
    if match2:
        try:
            yy = int(match2.group(1))
            year = 2000 + yy
            current_year = timezone.now().year
            if year > current_year + 1:
                alt = 1900 + yy
                if 1990 <= alt <= current_year + 1:
                    return alt
            return year
        except Exception:
            return None
    return None


def upsert_enrollment_from_row(row, user, enrollment_key=None, active_fields: Optional[Iterable[str]] = None):
    scope = _field_scope(row, active_fields)
    enr_key = enrollment_key or clean_cell(row.get("enrollment_no")) or clean_cell(row.get("enrollment"))
    if not enr_key:
        return None, None, "Missing enrollment_no"

    enr_existing = lookup_enrollment(enr_key)
    resolved_enr_key = getattr(enr_existing, "enrollment_no", None) or enr_key
    institute, subcourse, maincourse, missing_related = resolve_enrollment_fk(row, active_fields=active_fields)

    if enr_existing is None:
        import re

        enr_text = str(resolved_enr_key or "").strip()
        if enr_text and re.search(r"bed", enr_text, flags=re.IGNORECASE):
            if institute is None:
                inst_match = re.search(r"bed[^0-9]*([0-9]{2})", enr_text, flags=re.IGNORECASE)
                if inst_match:
                    try:
                        inst_guess = int(inst_match.group(1))
                        institute = Institute.objects.filter(institute_id=inst_guess).first() or institute
                    except Exception:
                        pass

            if institute is not None and (maincourse is None or subcourse is None):
                try:
                    top = (
                        Enrollment.objects
                        .filter(institute=institute, enrollment_no__icontains="BED")
                        .values("maincourse_id", "subcourse_id")
                        .annotate(cnt=models.Count("id"))
                        .order_by("-cnt")
                        .first()
                    )
                except Exception:
                    top = None
                if top:
                    if maincourse is None and top.get("maincourse_id"):
                        maincourse = MainBranch.objects.filter(maincourse_id=top.get("maincourse_id")).first() or maincourse
                    if subcourse is None and top.get("subcourse_id"):
                        subcourse = SubBranch.objects.filter(subcourse_id=top.get("subcourse_id")).first() or subcourse

    if enr_existing is None and missing_related:
        unresolved = []
        for field, value in missing_related:
            if field == "institute_id" and institute is None:
                unresolved.append((field, value))
            elif field == "maincourse_id" and maincourse is None:
                unresolved.append((field, value))
            elif field == "subcourse_id" and subcourse is None:
                unresolved.append((field, value))
        if unresolved:
            parts = [f"{field}='{value}'" for field, value in unresolved]
            return None, None, f"Related FK missing: {', '.join(parts)}"

    student_name = clean_cell(row.get("student_name")) if "student_name" in scope else None
    batch_val = to_int_or_none(row.get("batch")) if "batch" in scope else None
    temp_enroll_no = clean_cell(row.get("temp_enroll_no")) if "temp_enroll_no" in scope else None
    enrollment_date = parse_excel_date(row.get("enrollment_date")) if "enrollment_date" in scope else None
    admission_date = parse_excel_date(row.get("admission_date")) if "admission_date" in scope else None

    if enr_existing is None and batch_val is None:
        batch_val = _infer_batch_from_key(resolved_enr_key) or _infer_batch_from_key(temp_enroll_no)
        if batch_val is None and institute is not None:
            try:
                history = Enrollment.objects.filter(institute=institute).exclude(batch__isnull=True)
                if maincourse is not None:
                    history = history.filter(maincourse=maincourse)
                if subcourse is not None:
                    history = history.filter(subcourse=subcourse)
                historical_batch = history.order_by("-batch").values_list("batch", flat=True).first()
                if historical_batch is not None:
                    batch_val = int(historical_batch)
            except Exception:
                pass

    defaults = {}
    if student_name is not None:
        defaults["student_name"] = student_name
    if batch_val is not None:
        defaults["batch"] = batch_val
    if institute is not None and ("institute_id" in scope or enr_existing is None):
        defaults["institute"] = institute
    if subcourse is not None and ("subcourse_id" in scope or enr_existing is None):
        defaults["subcourse"] = subcourse
    if maincourse is not None and ("maincourse_id" in scope or enr_existing is None):
        defaults["maincourse"] = maincourse
    if temp_enroll_no is not None:
        defaults["temp_enroll_no"] = temp_enroll_no
    if enrollment_date is not None:
        defaults["enrollment_date"] = enrollment_date
    if admission_date is not None:
        defaults["admission_date"] = admission_date

    if enr_existing is None:
        missing = []
        if not student_name:
            missing.append("student_name")
        if batch_val is None:
            missing.append("batch")
        if institute is None:
            missing.append("institute_id")
        if subcourse is None:
            missing.append("subcourse_id")
        if maincourse is None:
            missing.append("maincourse_id")
        if missing:
            return None, None, f"Missing required enrollment fields for create: {', '.join(missing)}"

        defaults["updated_by"] = user
        enr_obj, enr_created = Enrollment.objects.update_or_create(
            enrollment_no=resolved_enr_key,
            defaults=defaults,
        )
        return enr_obj, enr_created, None

    if not defaults:
        return enr_existing, False, None

    defaults["updated_by"] = user
    enr_obj, _ = Enrollment.objects.update_or_create(
        enrollment_no=resolved_enr_key,
        defaults=defaults,
    )
    return enr_obj, False, None


def process_enrollment_row(row, user, active_fields: Optional[Iterable[str]] = None):
    enr_key = clean_cell(row.get("enrollment_no")) or clean_cell(row.get("enrollment"))
    if not enr_key:
        return None, None, "Missing enrollment_no"

    enr_obj, enr_created, enr_err = upsert_enrollment_from_row(
        row,
        user,
        enrollment_key=enr_key,
        active_fields=active_fields,
    )
    if enr_err:
        return enr_key, None, enr_err

    message = "Created enrollment" if enr_created else "Updated enrollment"
    profile_created = upsert_profile_from_row(
        enr_obj,
        row,
        user,
        active_fields=active_fields,
        require_profile_fields=True,
    )
    if profile_created is True:
        message += " + Created profile"
    elif profile_created is False:
        message += " + Updated profile"

    return getattr(enr_obj, "enrollment_no", None) or enr_key, message, None


def process_student_profile_row(row, user, active_fields: Optional[Iterable[str]] = None):
    enr_key = clean_cell(row.get("enrollment_no")) or clean_cell(row.get("enrollment"))
    if not enr_key:
        return None, None, "Missing enrollment_no"

    enr_obj, enr_created, enr_err = upsert_enrollment_from_row(
        row,
        user,
        enrollment_key=enr_key,
        active_fields=active_fields,
    )
    if enr_err:
        if row_has_any(row, ENROLLMENT_CORE_COLS, active_fields=active_fields):
            return enr_key, None, f"Enrollment not found and auto-create failed: {enr_err}"
        return enr_key, None, "Enrollment not found"

    profile_created = upsert_profile_from_row(
        enr_obj,
        row,
        user,
        active_fields=active_fields,
        require_profile_fields=False,
    )
    if enr_created:
        message = "Enrollment created + " + ("Profile created" if profile_created else "Profile updated")
    else:
        message = "Profile created" if profile_created else "Profile updated"
    return getattr(enr_obj, "enrollment_no", None) or enr_key, message, None