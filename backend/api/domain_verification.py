"""Domain Verification & Related (Verification, InstVerification*, Migration, Provisional, Status enums)
"""
from django.db import models
from django.contrib.postgres.search import SearchVectorField
from django.utils import timezone
import re
from django.core.exceptions import ValidationError
from django.contrib.auth.models import User

from .domain_enrollment import Enrollment
from .domain_courses import Institute, MainBranch, SubBranch
from .domain_documents import DocRec

__all__ = [
    'MailStatus','VerificationStatus','Verification',
    'MigrationStatus','MigrationRecord','ProvisionalStatus','ProvisionalRecord'
]

class MailStatus(models.TextChoices):
    NOT_SENT = 'NOT_SENT', 'Not Sent'
    SENT = 'SENT', 'Sent'
    FAILED = 'FAILED', 'Failed'
    ACCEPTED = 'ACCEPTED', 'Accepted'

class VerificationStatus(models.TextChoices):
    IN_PROGRESS = 'IN_PROGRESS', 'In Progress'
    PENDING = 'PENDING', 'Pending'
    CORRECTION = 'CORRECTION', 'Correction'
    CANCEL = 'CANCEL', 'Cancel'
    DONE = 'DONE', 'Done'
    DONE_WITH_REMARKS = 'DONE_WITH_REMARKS', 'Done With Remarks'

class Verification(models.Model):
    # Primary key - bigint NOT NULL
    id = models.BigAutoField(primary_key=True, db_column='id')
    
    # Student identification - varchar NULL
    student_name = models.CharField(max_length=255, null=True, blank=True, db_column='student_name')
    enrollment_no = models.CharField(max_length=255, null=True, blank=True, db_column='enrollment_no')
    second_enrollment_id = models.CharField(max_length=255, null=True, blank=True, db_column='second_enrollment_id')
    
    # Document counts - smallint NULL
    tr_count = models.SmallIntegerField(null=True, blank=True, db_column='no_of_transcript')
    ms_count = models.SmallIntegerField(null=True, blank=True, db_column='no_of_marksheet')
    dg_count = models.SmallIntegerField(null=True, blank=True, db_column='no_of_degree')
    moi_count = models.SmallIntegerField(null=True, blank=True, db_column='no_of_moi')
    backlog_count = models.SmallIntegerField(null=True, blank=True, db_column='no_of_backlog')
    
    # Payment and status - varchar NULL
    pay_rec_no = models.CharField(max_length=255, null=True, blank=True, db_column='pay_rec_no')
    status = models.CharField(max_length=255, choices=VerificationStatus.choices, null=True, blank=True, db_column='status')
    final_no = models.CharField(max_length=255, null=True, blank=True, db_column='final_no')
    mail_status = models.CharField(max_length=255, choices=MailStatus.choices, null=True, blank=True, db_column='mail_send_status')
    
    # ECA fields - boolean/varchar/date NULL
    eca_required = models.BooleanField(null=True, blank=True, db_column='eca_required')
    eca_name = models.CharField(max_length=255, null=True, blank=True, db_column='eca_name')
    eca_ref_no = models.CharField(max_length=255, null=True, blank=True, db_column='eca_ref_no')
    eca_send_date = models.DateField(null=True, blank=True, db_column='eca_send_date')
    eca_resubmit_date = models.DateField(null=True, blank=True, db_column='eca_resubmit_date')
    eca_status = models.CharField(max_length=255, choices=MailStatus.choices, null=True, blank=True, default='NOT_SENT', db_column='eca_status')
    
    # Unified remark field for all services
    doc_remark = models.TextField(null=True, blank=True, db_column='doc_remark')
    vr_done_date = models.DateField(null=True, blank=True, db_column='vr_done_date')
    last_resubmit_date = models.DateField(null=True, blank=True, db_column='last_resubmit_date')
    last_resubmit_status = models.CharField(max_length=255, null=True, blank=True, db_column='last_resubmit_status')
    
    # Full-Text Search vector - tsvector NULL
    search_vector = SearchVectorField(null=True, blank=True)  # PostgreSQL FTS
    
    # Timestamps - timestamp NOT NULL (auto-managed)
    createdat = models.DateTimeField(auto_now_add=True, db_column='createdat')
    updatedat = models.DateTimeField(auto_now=True, db_column='updatedat')
    
    # Foreign keys - bigint/varchar/int NULL
    doc_rec = models.ForeignKey(DocRec, on_delete=models.SET_NULL, null=True, blank=True, to_field='doc_rec_id', db_column='doc_rec_id', related_name='verifications')
    replaces_verification = models.ForeignKey('self', on_delete=models.SET_NULL, null=True, blank=True, db_column='replaces_verification_id', related_name='superseded_by')
    updatedby = models.ForeignKey(User, on_delete=models.SET_NULL, null=True, blank=True, db_column='updatedby')
    
    # Doc record date - date NOT NULL
    doc_rec_date = models.DateField(db_column='doc_rec_date', verbose_name='Doc Record Date')
    class Meta:
        db_table = 'verification'
        indexes = [
            models.Index(fields=['enrollment_no'], name='idx_verification_enrollment'),
            models.Index(fields=['second_enrollment_id'], name='idx_verif_sec_enroll'),
            models.Index(fields=['status'], name='idx_verification_status'),
            models.Index(fields=['final_no'], name='idx_verification_final_no'),
            models.Index(fields=['pay_rec_no'], name='idx_verification_pay_rec_no'),
            models.Index(fields=['doc_rec'], name='idx_verification_doc_rec'),
        ]
        constraints = [
            # Prevent duplicate verifications for the same doc_rec
            models.UniqueConstraint(fields=['doc_rec'], name='unique_verification_doc_rec', condition=models.Q(doc_rec__isnull=False))
        ]
    def clean(self):
        # Validate document counts if present (now nullable)
        for f in ('tr_count','ms_count','dg_count','moi_count','backlog_count'):
            v = getattr(self, f)
            if v is not None and (v < 0 or v > 32767):  # smallint range
                raise ValidationError({f: 'Must be between 0 and 32767.'})
        
        # Validate status-specific requirements
        if self.status == VerificationStatus.DONE and not self.final_no:
            raise ValidationError({'final_no': 'final_no is required when status is DONE.'})
        if self.status in (VerificationStatus.PENDING, VerificationStatus.CANCEL) and self.final_no:
            raise ValidationError({'final_no': 'final_no must be empty for PENDING or CANCEL.'})
        
        # Validate ECA fields consistency
        eca_status_present = bool(self.eca_status and str(self.eca_status).strip() and str(self.eca_status) != 'NOT_SENT')
        if self.eca_required is False and any([
            self.eca_name, self.eca_ref_no, self.eca_send_date,
            self.eca_resubmit_date, eca_status_present
        ]):
            raise ValidationError('ECA details present but eca_required=False.')
    def save(self, *a, **kw):
        # Only auto-set to SENT if eca_send_date is set and eca_status is empty or NOT_SENT
        if self.eca_send_date:
            if self.eca_status in (None, '', MailStatus.NOT_SENT):
                self.eca_status = MailStatus.SENT
        super().save(*a, **kw)
        # Sync doc_remark to the parent DocRec if provided
        try:
            if self.doc_rec and getattr(self, 'doc_remark', None) is not None:
                if getattr(self.doc_rec, 'doc_remark', None) != self.doc_remark:
                    self.doc_rec.doc_remark = self.doc_remark
                    self.doc_rec.save(update_fields=['doc_remark'])
        except Exception:
            pass
    def __str__(self):
        return f"Verification #{self.id} - {self.student_name} - {self.status}"
    def record_resubmit(self, status_note: str | None = None):
        self.last_resubmit_date = timezone.now().date()
        self.last_resubmit_status = VerificationStatus.CORRECTION
        if status_note:
            self.doc_remark = (self.doc_remark + '\n' if self.doc_remark else '') + f"[Resubmit] {status_note}"
        self.status = VerificationStatus.IN_PROGRESS
        self.full_clean()
        self.save(update_fields=['last_resubmit_date','last_resubmit_status','doc_remark','status','updatedat'])
    def eca_push_history(self, action: str, to_email: str | None = None, notes: str | None = None, mark_sent: bool = True):
        """
        Record a high-level ECA action. Since we keep only summary fields on Verification,
        we update `eca_status` and `eca_resubmit_date` when relevant.
        """
        now = timezone.now()
        # If this was a resend or push we can set resubmit date
        if action == 'RESEND':
            self.eca_resubmit_date = now.date()
        if mark_sent:
            self.eca_status = MailStatus.SENT
        # optionally update last updated timestamp
        self.full_clean()
        self.save(update_fields=['eca_resubmit_date','eca_status','updatedat'])


class MigrationStatus(models.TextChoices):
    PENDING = 'Pending', 'Pending'
    ISSUED = 'Issued', 'Issued'
    CANCELLED = 'Cancelled', 'Cancelled'

class MigrationRecord(models.Model):
    id = models.BigAutoField(primary_key=True)
    # DB changed: store doc_rec_id as a varchar instead of a foreign key.
    # Keep attribute name `doc_rec` for compatibility but store the raw identifier string.
    doc_rec = models.CharField(max_length=100, db_column='doc_rec_id', null=True, blank=True)
    # enrollment is nullable in DB schema; allow NULL and do not cascade-delete.
    enrollment = models.ForeignKey(Enrollment, to_field='enrollment_no', db_column='enrollment_no', on_delete=models.SET_NULL, related_name='migration_records', null=True, blank=True, db_constraint=False)
    # Allow blank student_name so CANCEL rows can be stored without a name.
    # DB keeps this as NOT NULL (empty string) but Django validation will permit '' when blank=True.
    student_name = models.CharField(max_length=255, db_column='student_name', blank=True)
    institute = models.ForeignKey(Institute, to_field='institute_id', db_column='institute_id', on_delete=models.CASCADE, related_name='migration_records', null=True, blank=True)
    subcourse = models.ForeignKey(SubBranch, to_field='subcourse_id', db_column='subcourse_id', on_delete=models.CASCADE, related_name='migration_records', null=True, blank=True)
    maincourse = models.ForeignKey(MainBranch, to_field='maincourse_id', db_column='maincourse_id', on_delete=models.CASCADE, related_name='migration_records', null=True, blank=True)
    mg_number = models.CharField(max_length=50, unique=True, db_column='mg_number')
    # Allow nullable date/year fields per actual DB schema (nullable allowed)
    mg_date = models.DateField(db_column='mg_date', null=True, blank=True)
    exam_year = models.CharField(max_length=20, db_column='exam_year', null=True, blank=True)
    admission_year = models.CharField(max_length=20, db_column='admission_year', null=True, blank=True)
    exam_details = models.TextField(null=True, blank=True, db_column='exam_details')
    mg_status = models.CharField(max_length=20, choices=MigrationStatus.choices, default=MigrationStatus.PENDING, db_column='mg_status')
    # pay_rec_no is nullable in the DB schema; keep nullable here and avoid
    # enforcing presence at model-clean time (caller may choose to copy from DocRec).
    pay_rec_no = models.CharField(max_length=50, db_column='pay_rec_no', null=True, blank=True)
    # Unified remark field for all services
    doc_remark = models.CharField(max_length=255, null=True, blank=True, db_column='doc_remark')
    created_by = models.ForeignKey(User, on_delete=models.SET_NULL, null=True, blank=True, db_column='createdby', related_name='migration_created')
    created_at = models.DateTimeField(auto_now_add=True, db_column='created_at')
    updated_at = models.DateTimeField(auto_now=True, db_column='updated_at')
    class Meta:
        db_table = 'migration'
        indexes = [
            models.Index(fields=['doc_rec'], name='idx_mg_doc_rec'),
            models.Index(fields=['enrollment'], name='idx_mg_enrollment'),
            models.Index(fields=['institute'], name='idx_mg_institute'),
            models.Index(fields=['mg_number'], name='idx_mg_number'),
        ]
    def clean(self):
        # default pay_rec_no from related DocRec if available; do not fail validation
        # if it's still missing since DB schema allows NULL for this column.
        try:
            if not self.pay_rec_no and self.doc_rec:
                dr = DocRec.objects.filter(doc_rec_id=self.doc_rec).first()
                if dr and getattr(dr, 'pay_rec_no', None):
                    self.pay_rec_no = dr.pay_rec_no
        except Exception:
            pass
    def save(self,*a,**kw):
        try:
            if getattr(self, 'enrollment', None) and not getattr(self, 'institute', None):
                try:
                    enr = self.enrollment
                    if getattr(enr, 'institute', None):
                        self.institute = enr.institute
                    if getattr(enr, 'maincourse', None):
                        self.maincourse = enr.maincourse
                    if getattr(enr, 'subcourse', None):
                        self.subcourse = enr.subcourse
                except Exception:
                    pass
        except Exception:
            pass

        try:
            if not self.pay_rec_no and self.doc_rec:
                dr = DocRec.objects.filter(doc_rec_id=self.doc_rec).first()
                if dr and getattr(dr, 'pay_rec_no', None):
                    self.pay_rec_no = dr.pay_rec_no
        except Exception:
            pass
        self.full_clean()
        result = super().save(*a,**kw)
        # propagate doc_remark to DocRec when present
        try:
            if self.doc_rec and getattr(self, 'doc_remark', None) is not None:
                dr = DocRec.objects.filter(doc_rec_id=self.doc_rec).first()
                if dr and getattr(dr, 'doc_remark', None) != self.doc_remark:
                    dr.doc_remark = self.doc_remark
                    dr.save(update_fields=['doc_remark'])
        except Exception:
            pass
        return result
    def __str__(self):
        return f"Migration {self.mg_number} ({self.student_name})"

class ProvisionalStatus(models.TextChoices):
    PENDING = 'Pending', 'Pending'
    ISSUED = 'Issued', 'Issued'
    CANCELLED = 'Cancelled', 'Cancelled'

class ProvisionalRecord(models.Model):
    id = models.BigAutoField(primary_key=True)
    # NOTE: DB was changed so `doc_rec_id` is now a plain varchar (not a foreign-key).
    # Keep the attribute name `doc_rec` for compatibility with existing code, but
    # store the raw doc_rec_id string. When a DocRec object is needed, resolve
    # it on demand via `self._docrec_obj()` helper.
    doc_rec = models.CharField(max_length=100, db_column='doc_rec_id', null=True, blank=True)
    # enrollment is optional in the DB schema (nullable)
    enrollment = models.ForeignKey(Enrollment, to_field='enrollment_no', db_column='enrollment_no', on_delete=models.SET_NULL, related_name='provisional_records', null=True, blank=True, db_constraint=False)
    # Allow blank/NULL student_name so CANCEL rows can be stored without a name.
    # DB allows NULL for student_name according to schema; reflect that here.
    student_name = models.CharField(max_length=255, db_column='student_name', null=True, blank=True)
    institute = models.ForeignKey(Institute, to_field='institute_id', db_column='institute_id', on_delete=models.CASCADE, related_name='provisional_records', null=True, blank=True)
    subcourse = models.ForeignKey(SubBranch, to_field='subcourse_id', db_column='subcourse_id', on_delete=models.CASCADE, related_name='provisional_records', null=True, blank=True)
    maincourse = models.ForeignKey(MainBranch, to_field='maincourse_id', db_column='maincourse_id', on_delete=models.CASCADE, related_name='provisional_records', null=True, blank=True)
    class_obtain = models.CharField(max_length=100, null=True, blank=True, db_column='class_obtain')
    prv_number = models.CharField(max_length=50, unique=True, db_column='prv_number')
    prv_date = models.DateField(db_column='prv_date')
    passing_year = models.CharField(max_length=20, db_column='passing_year', null=True, blank=True)
    # Degree name associated with the provisional certificate (optional)
    prv_degree_name = models.CharField(max_length=255, null=True, blank=True, db_column='prv_degree_name')
    # Allow NULL/blank for status and pay_rec_no. If status is blank/NULL we treat it as ISSUED in save().
    prv_status = models.CharField(max_length=20, choices=ProvisionalStatus.choices, null=True, blank=True, db_column='prv_status')
    pay_rec_no = models.CharField(max_length=50, db_column='pay_rec_no', null=True, blank=True)
    # Unified remark field for all services
    doc_remark = models.CharField(max_length=255, null=True, blank=True, db_column='doc_remark')
    created_by = models.ForeignKey(User, on_delete=models.SET_NULL, null=True, blank=True, db_column='createdby', related_name='provisional_created')
    created_at = models.DateTimeField(auto_now_add=True, db_column='created_at')
    updated_at = models.DateTimeField(auto_now=True, db_column='updated_at')
    class Meta:
        db_table = 'provisional'
        indexes = [
            models.Index(fields=['doc_rec'], name='idx_prv_doc_rec'),
            models.Index(fields=['enrollment'], name='idx_prv_enrollment'),
            models.Index(fields=['institute'], name='idx_prv_institute'),
            models.Index(fields=['prv_number'], name='idx_prv_number'),
        ]
    def clean(self):
        # Default pay_rec_no from DocRec if available; do not raise if missing because
        # DB allows NULL for this column and bulk imports may intentionally omit it.
        # Since `doc_rec` is now stored as a string (doc_rec_id), try to resolve
        # the DocRec object when needed.
        try:
            if not self.pay_rec_no and self.doc_rec:
                dr = DocRec.objects.filter(doc_rec_id=self.doc_rec).first()
                if dr and getattr(dr, 'pay_rec_no', None):
                    self.pay_rec_no = dr.pay_rec_no
        except Exception:
            pass
    def save(self,*a,**kw):
        try:
            if getattr(self, 'enrollment', None) and not getattr(self, 'institute', None):
                try:
                    enr = self.enrollment
                    if getattr(enr, 'institute', None):
                        self.institute = enr.institute
                    if getattr(enr, 'maincourse', None):
                        self.maincourse = enr.maincourse
                    if getattr(enr, 'subcourse', None):
                        self.subcourse = enr.subcourse
                except Exception:
                    pass
        except Exception:
            pass

        try:
            if not self.pay_rec_no and self.doc_rec:
                dr = DocRec.objects.filter(doc_rec_id=self.doc_rec).first()
                if dr and getattr(dr, 'pay_rec_no', None):
                    self.pay_rec_no = dr.pay_rec_no
        except Exception:
            pass
        if not getattr(self, 'prv_status', None):
            try:
                self.prv_status = ProvisionalStatus.ISSUED
            except Exception:
                self.prv_status = 'Issued'
        self.full_clean()
        res = super().save(*a,**kw)
        # propagate doc_remark to the referenced DocRec when possible
        try:
            if self.doc_rec and getattr(self, 'doc_remark', None) is not None:
                dr = DocRec.objects.filter(doc_rec_id=self.doc_rec).first()
                if dr and getattr(dr, 'doc_remark', None) != self.doc_remark:
                    dr.doc_remark = self.doc_remark
                    dr.save(update_fields=['doc_remark'])
        except Exception:
            pass
        return res
