"""Domain Document Receipt & Related (DocRec, Eca, PayPrefixRule)
"""
from django.db import models
from django.utils import timezone
from django.core.exceptions import ValidationError
from django.db import transaction
from django.contrib.auth.models import User

__all__ = ['ApplyFor', 'PayBy', 'PayPrefixRule', 'DocRec', 'Eca']

class ApplyFor(models.TextChoices):
    VERIFICATION = 'VR', 'Verification'
    INST_VERIFICATION = 'IV', 'Inst-Verification'
    PROVISIONAL = 'PR', 'Provisional'
    MIGRATION = 'MG', 'Migration'
    GRADE_TRANS = 'GT', 'Grade To Marks'

class PayBy(models.TextChoices):
    CASH = 'CASH', 'Cash'
    BANK = 'BANK', 'Bank'
    UPI = 'UPI', 'UPI'
    NA = 'NA', 'Not Applicable'

class PayPrefixRule(models.Model):
    id = models.BigAutoField(primary_key=True)
    pay_by = models.CharField(max_length=10, choices=PayBy.choices, db_column='pay_by')
    year_full = models.PositiveIntegerField(null=True, blank=True, db_column='year_full')
    pattern = models.CharField(max_length=50, db_column='pattern')
    is_active = models.BooleanField(default=True, db_column='is_active')
    priority = models.IntegerField(default=0, db_column='priority')
    createdat = models.DateTimeField(auto_now_add=True, db_column='createdat')
    updatedat = models.DateTimeField(auto_now=True, db_column='updatedat')
    class Meta:
        db_table = 'pay_prefix_rule'
        indexes = [
            models.Index(fields=['pay_by', 'year_full'], name='idx_payprefix_by_year'),
            models.Index(fields=['is_active'], name='idx_payprefix_active')
        ]
    def __str__(self):
        y = self.year_full or '*'
        return f"{self.pay_by} {y}: {self.pattern} ({'on' if self.is_active else 'off'})"

class DocRec(models.Model):
    id = models.BigAutoField(primary_key=True)
    apply_for = models.CharField(max_length=2, choices=ApplyFor.choices, db_column='apply_for')
    doc_rec_id = models.CharField(max_length=20, unique=True, db_column='doc_rec_id')
    pay_by = models.CharField(max_length=10, choices=PayBy.choices, db_column='pay_by')
    pay_rec_no_pre = models.CharField(max_length=20, db_column='pay_rec_no_pre', null=True, blank=True)
    pay_rec_no = models.CharField(max_length=50, db_column='pay_rec_no', null=True, blank=True)
    pay_amount = models.DecimalField(max_digits=12, decimal_places=2, db_column='pay_amount', default=0)
    created_by = models.ForeignKey(User, on_delete=models.SET_NULL, null=True, blank=True, db_column='created_by', related_name='doc_recs_created')
    createdat = models.DateTimeField(auto_now_add=True, db_column='createdat')
    updatedat = models.DateTimeField(auto_now=True, db_column='updatedat')
    doc_rec_date = models.DateField(null=True, blank=True, db_column='doc_rec_date')
    # short remark stored on DocRec (varchar in DB)
    doc_rec_remark = models.CharField(max_length=255, null=True, blank=True, db_column='doc_rec_remark')
    class Meta:
        db_table = 'doc_rec'
        indexes = [
            models.Index(fields=['doc_rec_id'], name='idx_doc_rec_id'),
            models.Index(fields=['pay_rec_no'], name='idx_doc_pay_rec')
        ]
    def __str__(self):
        return f"{self.doc_rec_id} - {self.apply_for} - {self.pay_by}"
    def _prefix_for_apply(self) -> str:
        return {
            ApplyFor.VERIFICATION: 'vr',
            ApplyFor.INST_VERIFICATION: 'iv',
            ApplyFor.PROVISIONAL: 'pr',
            ApplyFor.MIGRATION: 'mg',
            ApplyFor.GRADE_TRANS: 'gt',
        }.get(self.apply_for, 'vr')
    def _pay_prefix_for_payby(self, yy: int) -> str:
        now = timezone.now(); yyyy = now.year; year_str = f"{yy:02d}"
        try:
            rule = (PayPrefixRule.objects
                .filter(pay_by=self.pay_by, is_active=True)
                .filter(models.Q(year_full=yyyy) | models.Q(year_full__isnull=True))
                .order_by(
                    models.Case(
                        models.When(year_full=yyyy, then=models.Value(0)),
                        models.When(year_full__isnull=True, then=models.Value(1)),
                        default=models.Value(2), output_field=models.IntegerField(),
                    ),
                    -models.F('priority'), -models.F('id'),
                ).first())
        except Exception:
            rule = None
        if rule and rule.pattern:
            try:
                return rule.pattern.replace('{yy}', year_str).replace('{yyyy}', str(yyyy))
            except Exception:
                pass
        mapping = {
            PayBy.CASH: f"C01/{year_str}/R",
            PayBy.BANK: f"1471/{year_str}/R",
            PayBy.UPI: f"8785/{year_str}/R",
            PayBy.NA: None,
        }
        return mapping.get(self.pay_by, f"NA/{year_str}/R")
    def clean(self):
        if self.pay_amount is not None and self.pay_amount < 0:
            raise ValidationError({'pay_amount': 'Amount cannot be negative.'})
    def save(self, *args, **kwargs):
        now = timezone.now(); yy = now.year % 100
        if self.pay_by == PayBy.NA:
            self.pay_rec_no_pre = None; self.pay_rec_no = None
        else:
            if not self.pay_rec_no_pre:
                self.pay_rec_no_pre = self._pay_prefix_for_payby(yy)
        if not self.doc_rec_id:
            prefix = self._prefix_for_apply(); year_str = f"{yy:02d}"; base = f"{prefix}_{year_str}_"
            with transaction.atomic():
                last = (DocRec.objects.select_for_update(skip_locked=True)
                        .filter(doc_rec_id__startswith=base)
                        .order_by('-doc_rec_id').first())
                next_num = 1
                if last and last.doc_rec_id:
                    try: next_num = int(last.doc_rec_id.split('_')[-1]) + 1
                    except Exception: next_num = 1
                self.doc_rec_id = f"{prefix}_{year_str}_{next_num:04d}"
        if not self.doc_rec_date:
            self.doc_rec_date = timezone.now().date()
        super().save(*args, **kwargs)

class Eca(models.Model):
    id = models.BigAutoField(primary_key=True)
    doc_rec = models.ForeignKey(DocRec, to_field='doc_rec_id', db_column='doc_rec_id', on_delete=models.RESTRICT, related_name='eca_entries', null=True, blank=True)
    eca_name = models.CharField(max_length=255, null=True, blank=True, db_column='eca_name')
    eca_ref_no = models.CharField(max_length=100, null=True, blank=True, db_column='eca_ref_no')
    eca_send_date = models.DateField(null=True, blank=True, db_column='eca_send_date')
    eca_remark = models.TextField(null=True, blank=True, db_column='eca_remark')
    created_by = models.ForeignKey(User, on_delete=models.SET_NULL, null=True, blank=True, db_column='createdby', related_name='eca_created')
    createdat = models.DateTimeField(auto_now_add=True, db_column='createdat')
    updatedat = models.DateTimeField(auto_now=True, db_column='updatedat')
    class Meta:
        db_table = 'eca'
        indexes = [models.Index(fields=['doc_rec'], name='idx_eca_doc_rec')]
    def __str__(self):
        return f"ECA {self.id} for {getattr(self.doc_rec, 'doc_rec_id', None) or '-'}"
