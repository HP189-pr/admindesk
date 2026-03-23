# backend/api/exam/services_assessment.py
"""
Assessment System – Auto number generator and helper services.
"""
from datetime import datetime
from django.db import transaction

from ..domain_core import Module
from .domain_assessment import AssessmentOutward
from .domain_assessment import AssessmentOutwardDetails


def _next_running_no(existing_values, prefix):
    max_seq = 0
    for value in existing_values:
        try:
            seq = int(str(value).split("/")[-1])
            if seq > max_seq:
                max_seq = seq
        except (ValueError, IndexError, TypeError):
            pass
    return f"{prefix}{max_seq + 1:03d}"


def _semester_prefix(suffix: str) -> str:
    """
    Return the semester-based prefix for outward number generation.

    Semester rules (academic calendar):
      March–August  → SE (Summer Exam)   → e.g. 26-SE/<suffix>/
      September–Feb → WE (Winter Exam)   → e.g. 26-WE/<suffix>/
        * Jan/Feb belong to the winter that started the previous year
          so year stays the same as when the semester began.
    """
    now = datetime.now()
    month = now.month
    cal_year = now.year % 100

    if 3 <= month <= 8:
        semester = "SE"
        year = cal_year
    elif month >= 9:
        semester = "WE"
        year = cal_year        # Sept–Dec: WE started this year
    else:                      # Jan–Feb: WE started the previous year
        semester = "WE"
        year = (cal_year - 1) % 100

    return f"{year:02d}-{semester}/{suffix}/"


@transaction.atomic
def generate_outward_no() -> str:
    """
    Generate a sequential outward number.

    Format: YY-SE/ASM/NNN  (March–August)
            YY-WE/ASM/NNN  (September–February)

    The counter resets each semester (SE / WE).
    Jan/Feb use the previous year's WE prefix (e.g. Jan 2027 → 26-WE/ASM/).
    """
    prefix = _semester_prefix("ASM")

    # Lock Exam module row to serialize number generation in concurrent requests.
    Module.objects.select_for_update().filter(name__iexact="Exam").first()

    existing_values = AssessmentOutward.objects.filter(
        outward_no__startswith=prefix
    ).values_list("outward_no", flat=True)

    return _next_running_no(existing_values, prefix)


@transaction.atomic
def generate_return_outward_no() -> str:
    """
    Generate a sequential return outward number.

    Format: YY-SE/ASR/NNN  (March–August)
            YY-WE/ASR/NNN  (September–February)

    ASR = Assessment Return. Same semester logic as generate_outward_no().
    """
    prefix = _semester_prefix("ASR")

    Module.objects.select_for_update().filter(name__iexact="Exam").first()

    existing_values = AssessmentOutwardDetails.objects.filter(
        return_outward_no__startswith=prefix
    ).values_list("return_outward_no", flat=True)

    return _next_running_no(existing_values, prefix)
