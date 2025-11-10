"""Domain models for handling mail request / Google Form submissions."""

from __future__ import annotations

from django.db import models

from .domain_enrollment import Enrollment

__all__ = [
    'GoogleFormSubmission',
]


class GoogleFormSubmission(models.Model):
    """Stores raw Google Form submissions and verification metadata."""

    MAIL_STATUS_PENDING = 'pending'
    MAIL_STATUS_PROGRESS = 'progress'
    MAIL_STATUS_DONE = 'done'

    MAIL_STATUS_CHOICES = [
        (MAIL_STATUS_PENDING, 'Pending'),
        (MAIL_STATUS_PROGRESS, 'Progress'),
        (MAIL_STATUS_DONE, 'Done'),
    ]

    submitted_at = models.DateTimeField(db_column='timestamp')
    enrollment_no = models.CharField(max_length=64, blank=True, db_column='enrollment_no')
    student_name = models.CharField(max_length=255, blank=True, db_column='student_name')
    rec_institute_name = models.CharField(max_length=512, blank=True, db_column='rec_institute_name')
    rec_official_mail = models.CharField(max_length=255, blank=True, db_column='rec_official_mail')
    rec_ref_id = models.CharField(max_length=128, blank=True, db_column='rec_ref_id')
    send_doc_type = models.CharField(max_length=255, blank=True, db_column='send_doc_type')
    form_submit_mail = models.CharField(max_length=255, blank=True, db_column='form_submit_mail')
    mail_status = models.CharField(
        max_length=32,
        blank=True,
        choices=MAIL_STATUS_CHOICES,
        default=MAIL_STATUS_PENDING,
        db_column='mail_status'
    )
    remark = models.TextField(blank=True, db_column='remark')
    student_verification = models.CharField(max_length=255, blank=True, db_column='student_verification')
    raw_row = models.JSONField(null=True, blank=True, db_column='raw_row')
    created = models.DateTimeField(auto_now_add=True, db_column='created')

    class Meta:
        db_table = 'google_form_submission'
        indexes = [
            models.Index(fields=['submitted_at'], name='idx_gfs_submitted_at'),
            models.Index(fields=['enrollment_no'], name='idx_gfs_enrollment'),
        ]

    def __str__(self) -> str:  # pragma: no cover - simple representation
        ts = self.submitted_at.isoformat() if self.submitted_at else '-'
        return f"GForm {self.enrollment_no or 'unknown'} @ {ts}"

    def refresh_verification(self) -> str:
        """Compare enrollment number and student name against master records and return a status."""
        enrollment_val = (self.enrollment_no or '').strip()
        name_val = (self.student_name or '').strip()

        if not enrollment_val:
            message = 'Missing enrollment number'
        else:
            try:
                enrollment_obj = Enrollment.objects.get(enrollment_no__iexact=enrollment_val)
            except Enrollment.DoesNotExist:
                enrollment_obj = None

            if enrollment_obj is None:
                message = 'Mismatch: enrollment number not found'
            else:
                stored_name = (enrollment_obj.student_name or '').strip()
                if stored_name and name_val and stored_name.casefold() == name_val.casefold():
                    message = 'Matched'
                elif stored_name:
                    message = 'Mismatch: student name'
                else:
                    message = 'Matched enrollment; name unavailable'

        return message

    def save(self, *args, **kwargs):
        update_fields = kwargs.get('update_fields')
        auto_refresh = update_fields is None or bool({'enrollment_no', 'student_name'} & set(update_fields))
        if auto_refresh:
            self.student_verification = self.refresh_verification()
        return super().save(*args, **kwargs)
