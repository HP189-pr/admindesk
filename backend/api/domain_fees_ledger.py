from django.db import models
from django.contrib.auth.models import User
from .domain_enrollment import Enrollment

__all__ = ['StudentFeesLedger']


class StudentFeesLedger(models.Model):
    id = models.BigAutoField(primary_key=True)

    # 🔗 Student Link (single source of truth)
    enrollment = models.ForeignKey(
        Enrollment,
        on_delete=models.CASCADE,
        related_name='fee_ledger',
        null=True,
        blank=True
    )

    # 📄 Receipt Info
    receipt_no = models.CharField(
        max_length=30,
        unique=True,
        db_index=True,
        null=True,
        blank=True
    )
    receipt_date = models.DateField(db_index=True, null=True, blank=True)

    # 🏷️ Logical grouping (no rules enforced)
    term = models.CharField(
        max_length=50,
        help_text="e.g. 1st Term, 2nd Term, Extension-1, Exam Fee"
    )

    # 💰 Amount
    amount = models.DecimalField(
        max_digits=12,
        decimal_places=2,
        null=True,
        blank=True
    )

    # 📝 Free text remark
    remark = models.TextField(
        null=True,
        blank=True
    )

    # 🔐 Audit
    created_at = models.DateTimeField(auto_now_add=True)
    created_by = models.ForeignKey(
        User,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name='created_student_fees'
    )

    class Meta:
        db_table = 'student_fees_ledger'
        ordering = ['-receipt_date', '-id']
        indexes = [
            models.Index(fields=['enrollment']),
            models.Index(fields=['receipt_date']),
            models.Index(fields=['term']),
        ]

    def __str__(self):
        enrollment_no = getattr(self.enrollment, 'enrollment_no', None)
        return f"{enrollment_no or '-'} | {self.receipt_no} | {self.amount}"
