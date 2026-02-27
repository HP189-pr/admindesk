"""Domain model for transcript PDF generation requests imported from Google Sheets."""

from __future__ import annotations

from django.db import models
from django.contrib.postgres.search import SearchVectorField

__all__ = [
    "TranscriptRequest",
]


class TranscriptRequest(models.Model):
    """Represents a transcript generation request captured from a Google Sheet."""

    STATUS_PENDING = "pending"
    STATUS_PROGRESS = "progress"
    STATUS_CANCEL = "cancel"
    STATUS_DONE = "done"

    STATUS_CHOICES = [
        (STATUS_PENDING, "Pending"),
        (STATUS_PROGRESS, "In Progress"),
        (STATUS_CANCEL, "Cancel"),
        (STATUS_DONE, "Done"),
    ]

    STATUS_ALIASES = {
        "sent": STATUS_DONE,
        "yes": STATUS_DONE,
        "sent to institute": STATUS_DONE,
        "completed": STATUS_DONE,
        "complete": STATUS_DONE,
        "done": STATUS_DONE,
        "in progress": STATUS_PROGRESS,
        "in-progress": STATUS_PROGRESS,
        "inprogress": STATUS_PROGRESS,
        "processing": STATUS_PROGRESS,
        "progress": STATUS_PROGRESS,
        "pending": STATUS_PENDING,
        "cancel": STATUS_CANCEL,
        "canceled": STATUS_CANCEL,
        "cancelled": STATUS_CANCEL,
    }

    requested_at = models.DateTimeField(db_column="trn_reqest_date")
    request_ref_no = models.CharField(max_length=128, db_column="trn_reqest_ref_no", blank=True, null=True)
    # Transcript request number from Google Sheet (TR No).
    # NOT NULL in database with no default - must be set explicitly.
    tr_request_no = models.BigIntegerField(db_column="tr_request_no")
    enrollment_no = models.CharField(max_length=64, db_column="enrollment_no")
    student_name = models.CharField(max_length=255, db_column="student_name")
    institute_name = models.CharField(max_length=255, db_column="institute_name")
    transcript_receipt = models.CharField(max_length=255, db_column="trnscript_receipt", blank=True, null=True)
    transcript_remark = models.TextField(db_column="transcript_remark", blank=True, null=True)
    submit_mail = models.CharField(max_length=255, db_column="submit_mail", blank=True, null=True)
    pdf_generate = models.CharField(max_length=64, db_column="pdf_generate", blank=True, null=True)
    mail_status = models.CharField(
        max_length=32,
        choices=STATUS_CHOICES,
        default=STATUS_PENDING,
        db_column="mail_status",
        blank=True,
        null=True,
    )
    raw_row = models.JSONField(null=True, blank=True, db_column="raw_row")
    created = models.DateTimeField(auto_now_add=True, db_column="created")
    
    # Full-Text Search vector - tsvector NULL
    search_vector = SearchVectorField(null=True, blank=True)  # PostgreSQL FTS

    class Meta:
        db_table = "transcript_request"
        indexes = [
            models.Index(fields=["requested_at"], name="idx_transcript_requested_at"),
            models.Index(fields=["enrollment_no"], name="idx_transcript_enrollment"),
            models.Index(fields=["tr_request_no"], name="idx_transcript_tr_request_no"),
        ]

    def __str__(self) -> str:  # pragma: no cover - trivial representation
        timestamp = self.requested_at.isoformat() if self.requested_at else "-"
        return f"TranscriptRequest {self.request_ref_no or 'unknown'} @ {timestamp}"

    @classmethod
    def normalize_status(cls, value: str | None) -> str | None:
        if value is None:
            return None
        text = str(value).strip().lower()
        if not text:
            return None
        normalized = " ".join(text.replace("_", " ").replace("-", " ").split())
        alias = cls.STATUS_ALIASES.get(normalized)
        if alias:
            return alias
        alias = cls.STATUS_ALIASES.get(normalized.replace(" ", ""))
        if alias:
            return alias
        allowed = {choice[0] for choice in cls.STATUS_CHOICES}
        if normalized in allowed:
            return normalized
        return None
