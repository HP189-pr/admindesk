"""
Assessment System – Auto number generator and helper services.
"""
from datetime import datetime
from .domain_assessment import AssessmentOutward


def generate_outward_no() -> str:
    """
    Generate a sequential outward number like: 26/ASM/0001

    Pattern mirrors the inward/outward register's generate_running_no().
    Year is the last two digits of the current calendar year.
    The counter resets each calendar year.
    """
    year = datetime.now().year % 100
    prefix = f"{year:02d}/ASM/"

    existing = AssessmentOutward.objects.filter(
        outward_no__startswith=prefix
    )

    max_seq = 0
    for record in existing:
        try:
            seq = int(record.outward_no.split("/")[-1])
            if seq > max_seq:
                max_seq = seq
        except (ValueError, IndexError):
            pass

    return f"{prefix}{max_seq + 1:04d}"
