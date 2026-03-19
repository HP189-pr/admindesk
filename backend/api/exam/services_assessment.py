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
    return f"{prefix}{max_seq + 1:04d}"


@transaction.atomic
def generate_outward_no() -> str:
    """
    Generate a sequential outward number like: 26/ASM/0001

    Pattern mirrors the inward/outward register's generate_running_no().
    Year is the last two digits of the current calendar year.
    The counter resets each calendar year.
    """
    year = datetime.now().year % 100
    prefix = f"{year:02d}/ASM/"

    # Lock Exam module row to serialize number generation in concurrent requests.
    Module.objects.select_for_update().filter(name__iexact="Exam").first()

    existing_values = AssessmentOutward.objects.filter(
        outward_no__startswith=prefix
    ).values_list("outward_no", flat=True)

    return _next_running_no(existing_values, prefix)


@transaction.atomic
def generate_return_outward_no() -> str:
    """
    Generate a sequential return outward number like: 26/ASR/0001

    ASR = Assessment Return.
    Counter resets every calendar year.
    """
    year = datetime.now().year % 100
    prefix = f"{year:02d}/ASR/"

    Module.objects.select_for_update().filter(name__iexact="Exam").first()

    existing_values = AssessmentOutwardDetails.objects.filter(
        return_outward_no__startswith=prefix
    ).values_list("return_outward_no", flat=True)

    return _next_running_no(existing_values, prefix)
