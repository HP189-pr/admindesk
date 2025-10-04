"""Domain Verification & Related (Verification, InstVerification*, Migration, Provisional, Status enums)
"""
from django.db import models
from django.utils import timezone
from django.core.exceptions import ValidationError
from django.contrib.auth.models import User
from .domain_enrollment import Enrollment
from .domain_courses import Institute, MainBranch, SubBranch
from .domain_documents import DocRec

__all__ = [
    'MailStatus','VerificationStatus','Verification','InstVerificationMain','InstVerificationStudent',
    'MigrationStatus','MigrationRecord','ProvisionalStatus','ProvisionalRecord'
]

class MailStatus(models.TextChoices):
    NOT_SENT = 'NOT_SENT', 'Not Sent'
    SENT = 'SENT', 'Sent'
    FAILED = 'FAILED', 'Failed'

class VerificationStatus(models.TextChoices):
    IN_PROGRESS = 'IN_PROGRESS', 'In Progress'
    PENDING = 'PENDING', 'Pending'
    CORRECTION = 'CORRECTION', 'Correction'
    CANCEL = 'CANCEL', 'Cancel'
    DONE = 'DONE', 'Done'

class Verification(models.Model):
    id = models.BigAutoField(primary_key=True, db_column='id')
    date = models.DateField(default=timezone.now, db_column='doc_rec_date', verbose_name='Doc Record Date')
    enrollment = models.ForeignKey(Enrollment, on_delete=models.RESTRICT, db_column='enrollment_id', related_name='verifications')
    second_enrollment = models.ForeignKey(Enrollment, on_delete=models.RESTRICT, null=True, blank=True, db_column='second_enrollment_id', related_name='secondary_verifications')
    student_name = models.CharField(max_length=255, db_column='student_name')
    tr_count = models.PositiveSmallIntegerField(default=0, db_column='no_of_transcript')
    ms_count = models.PositiveSmallIntegerField(default=0, db_column='no_of_marksheet')
    dg_count = models.PositiveSmallIntegerField(default=0, db_column='no_of_degree')
    moi_count = models.PositiveSmallIntegerField(default=0, db_column='no_of_moi')
    backlog_count = models.PositiveSmallIntegerField(default=0, db_column='no_of_backlog')
    pay_rec_no = models.CharField(max_length=100, null=True, blank=True, db_column='pay_rec_no')
    status = models.CharField(max_length=20, choices=VerificationStatus.choices, default=VerificationStatus.IN_PROGRESS, db_column='status')
    final_no = models.CharField(max_length=50, unique=True, null=True, blank=True, db_column='final_no')
    mail_status = models.CharField(max_length=20, choices=MailStatus.choices, default=MailStatus.NOT_SENT, db_column='mail_send_status')
    eca_required = models.BooleanField(default=False, db_column='eca_required')
    eca_name = models.CharField(max_length=255, null=True, blank=True, db_column='eca_name')
    eca_ref_no = models.CharField(max_length=100, null=True, blank=True, db_column='eca_ref_no')
    eca_submit_date = models.DateField(null=True, blank=True, db_column='eca_submit_date')
    eca_mail_status = models.CharField(max_length=20, choices=MailStatus.choices, default=MailStatus.NOT_SENT, db_column='eca_status')
    eca_resend_count = models.PositiveSmallIntegerField(default=0, db_column='eca_resend_count')
    eca_last_action_at = models.DateTimeField(null=True, blank=True, db_column='eca_last_action_at')
    eca_last_to_email = models.EmailField(null=True, blank=True, db_column='eca_last_to_email')
    eca_history = models.JSONField(null=True, blank=True, db_column='eca_history')
    replaces_verification = models.ForeignKey('self', on_delete=models.SET_NULL, null=True, blank=True, db_column='replaces_verification_id', related_name='superseded_by')
    remark = models.TextField(null=True, blank=True, db_column='vr_remark')
    vr_done_date = models.DateField(null=True, blank=True, db_column='vr_done_date')
    doc_rec = models.ForeignKey(DocRec, on_delete=models.SET_NULL, null=True, blank=True, to_field='doc_rec_id', db_column='doc_rec_id', related_name='verifications')
    last_resubmit_date = models.DateField(null=True, blank=True, db_column='last_resubmit_date')
    last_resubmit_status = models.CharField(max_length=20, null=True, blank=True, db_column='last_resubmit_status')
    createdat = models.DateTimeField(auto_now_add=True, db_column='createdat')
    updatedat = models.DateTimeField(auto_now=True, db_column='updatedat')
    updatedby = models.ForeignKey(User, on_delete=models.SET_NULL, null=True, blank=True, db_column='updatedby')
    class Meta:
        db_table = 'verification'
        indexes = [
            models.Index(fields=['enrollment'], name='idx_verification_enrollment'),
            models.Index(fields=['second_enrollment'], name='idx_verif_sec_enroll'),
            models.Index(fields=['status'], name='idx_verification_status'),
            models.Index(fields=['final_no'], name='idx_verification_final_no'),
            models.Index(fields=['pay_rec_no'], name='idx_verification_pay_rec_no'),
            models.Index(fields=['doc_rec'], name='idx_verification_doc_rec'),
        ]
    def clean(self):
        for f in ('tr_count','ms_count','dg_count','moi_count','backlog_count'):
            v = getattr(self, f) or 0
            if v < 0 or v > 999:
                raise ValidationError({f: 'Must be between 0 and 999.'})
        if self.status == VerificationStatus.DONE and not self.final_no:
            raise ValidationError({'final_no': 'final_no is required when status is DONE.'})
        if self.status in (VerificationStatus.PENDING, VerificationStatus.CANCEL) and self.final_no:
            raise ValidationError({'final_no': 'final_no must be empty for PENDING or CANCEL.'})
        if not self.eca_required and any([
            self.eca_name, self.eca_ref_no, self.eca_submit_date,
            self.eca_resend_count, self.eca_last_action_at, self.eca_last_to_email, self.eca_history
        ]):
            raise ValidationError('ECA details present but eca_required=False.')
    def save(self,*a,**kw):
        if self.enrollment and not self.student_name:
            self.student_name = self.enrollment.student_name or ''
        super().save(*a,**kw)
    def __str__(self):
        return f"Verification #{self.id} - {self.student_name} - {self.status}"
    def record_resubmit(self, status_note: str | None = None):
        self.last_resubmit_date = timezone.now().date()
        self.last_resubmit_status = VerificationStatus.CORRECTION
        if status_note:
            self.remark = (self.remark + '\n' if self.remark else '') + f"[Resubmit] {status_note}"
        self.status = VerificationStatus.IN_PROGRESS
        self.full_clean()
        self.save(update_fields=['last_resubmit_date','last_resubmit_status','remark','status','updatedat'])
    def eca_push_history(self, action: str, to_email: str | None = None, notes: str | None = None, mark_sent: bool = True):
        now = timezone.now(); entry = {'action':action,'at':now.isoformat(),'to':to_email,'notes':notes}
        hist = list(self.eca_history or []); hist.append(entry); self.eca_history = hist
        self.eca_last_action_at = now; self.eca_last_to_email = to_email or self.eca_last_to_email
        if action == 'RESEND': self.eca_resend_count = (self.eca_resend_count or 0) + 1
        if mark_sent: self.eca_mail_status = MailStatus.SENT
        self.full_clean()
        self.save(update_fields=['eca_history','eca_last_action_at','eca_last_to_email','eca_resend_count','eca_mail_status','updatedat'])

class InstVerificationMain(models.Model):
    id = models.BigAutoField(primary_key=True)
    doc_rec = models.ForeignKey(DocRec, to_field='doc_rec_id', db_column='doc_rec_id', on_delete=models.SET_NULL, related_name='inst_verifications', null=True, blank=True)
    inst_veri_number = models.CharField(max_length=100, null=True, blank=True, db_column='inst_veri_number')
    inst_veri_date = models.DateField(null=True, blank=True, db_column='inst_veri_date')
    institute = models.ForeignKey(Institute, on_delete=models.SET_NULL, db_column='institute_id', related_name='inst_verification_main', null=True, blank=True)
    rec_inst_name = models.CharField(max_length=255, null=True, blank=True, db_column='rec_inst_name')
    rec_inst_address_1 = models.CharField(max_length=255, null=True, blank=True, db_column='rec_inst_address_1')
    rec_inst_address_2 = models.CharField(max_length=255, null=True, blank=True, db_column='rec_inst_address_2')
    rec_inst_location = models.CharField(max_length=255, null=True, blank=True, db_column='rec_inst_location')
    rec_inst_city = models.CharField(max_length=255, null=True, blank=True, db_column='rec_inst_city')
    rec_inst_pin = models.CharField(max_length=20, null=True, blank=True, db_column='rec_inst_pin')
    rec_inst_email = models.EmailField(null=True, blank=True, db_column='rec_inst_email')
    rec_by = models.CharField(max_length=255, null=True, blank=True, db_column='rec_by')
    doc_rec_date = models.DateField(null=True, blank=True, db_column='doc_rec_date')
    inst_ref_no = models.CharField(max_length=100, null=True, blank=True, db_column='inst_ref_no')
    ref_date = models.DateField(null=True, blank=True, db_column='ref_date')
    class Meta:
        db_table = 'inst_verification_main'
        indexes = [
            models.Index(fields=['doc_rec'], name='idx_ivm_doc_rec'),
            models.Index(fields=['institute'], name='idx_ivm_institute'),
            models.Index(fields=['inst_veri_number'], name='idx_ivm_veri_no'),
        ]
    def __str__(self):
        return f"InstVeri {self.inst_veri_number or '-'} for {getattr(self.doc_rec, 'doc_rec_id', None) or '-'}"

class InstVerificationStudent(models.Model):
    id = models.BigAutoField(primary_key=True)
    doc_rec = models.ForeignKey(DocRec, to_field='doc_rec_id', db_column='doc_rec_id', on_delete=models.SET_NULL, related_name='inst_verification_students', null=True, blank=True)
    sr_no = models.PositiveIntegerField(null=True, blank=True, db_column='sr_no')
    enrollment = models.ForeignKey(Enrollment, to_field='enrollment_no', db_column='enrollment_no', on_delete=models.SET_NULL, related_name='inst_verification_students', null=True, blank=True)
    student_name = models.CharField(max_length=255, null=True, blank=True, db_column='student_name')
    institute = models.ForeignKey(Institute, on_delete=models.SET_NULL, db_column='institute_id', related_name='inst_verification_students', null=True, blank=True)
    sub_course = models.ForeignKey(SubBranch, to_field='subcourse_id', db_column='sub_course', on_delete=models.SET_NULL, related_name='inst_verification_students', null=True, blank=True)
    main_course = models.ForeignKey(MainBranch, to_field='maincourse_id', db_column='main_course', on_delete=models.SET_NULL, related_name='inst_verification_students', null=True, blank=True)
    type_of_credential = models.CharField(max_length=50, null=True, blank=True, db_column='type_of_credential')
    month_year = models.CharField(max_length=20, null=True, blank=True, db_column='month_year')
    verification_status = models.CharField(max_length=20, null=True, blank=True, db_column='verification_status', choices=VerificationStatus.choices)
    class Meta:
        db_table = 'inst_verification_student'
        indexes = [
            models.Index(fields=['doc_rec'], name='idx_ivs_doc_rec'),
            models.Index(fields=['enrollment'], name='idx_ivs_enrollment'),
            models.Index(fields=['institute'], name='idx_ivs_institute'),
        ]
    def __str__(self):
        return f"IVS {self.sr_no or '-'} - {getattr(self.doc_rec, 'doc_rec_id', None) or '-'}"

class MigrationStatus(models.TextChoices):
    PENDING = 'Pending', 'Pending'
    ISSUED = 'Issued', 'Issued'
    CANCELLED = 'Cancelled', 'Cancelled'

class MigrationRecord(models.Model):
    id = models.BigAutoField(primary_key=True)
    doc_rec = models.ForeignKey(DocRec, on_delete=models.CASCADE, db_column='doc_rec_id', related_name='migration_records')
    enrollment = models.ForeignKey(Enrollment, to_field='enrollment_no', db_column='enrollment_no', on_delete=models.CASCADE, related_name='migration_records', db_constraint=False)
    student_name = models.CharField(max_length=255, db_column='student_name')
    institute = models.ForeignKey(Institute, to_field='institute_id', db_column='institute_id', on_delete=models.CASCADE, related_name='migration_records')
    subcourse = models.ForeignKey(SubBranch, to_field='subcourse_id', db_column='subcourse_id', on_delete=models.CASCADE, related_name='migration_records')
    maincourse = models.ForeignKey(MainBranch, to_field='maincourse_id', db_column='maincourse_id', on_delete=models.CASCADE, related_name='migration_records')
    mg_number = models.CharField(max_length=50, unique=True, db_column='mg_number')
    mg_date = models.DateField(db_column='mg_date')
    exam_year = models.CharField(max_length=20, db_column='exam_year')
    admission_year = models.CharField(max_length=20, db_column='admission_year')
    exam_details = models.TextField(null=True, blank=True, db_column='exam_details')
    mg_status = models.CharField(max_length=20, choices=MigrationStatus.choices, default=MigrationStatus.PENDING, db_column='mg_status')
    pay_rec_no = models.CharField(max_length=50, db_column='pay_rec_no')
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
        if not self.pay_rec_no and self.doc_rec and self.doc_rec.pay_rec_no:
            self.pay_rec_no = self.doc_rec.pay_rec_no
        if not self.pay_rec_no:
            raise ValidationError({'pay_rec_no': 'pay_rec_no is required (copied from related DocRec).'})
    def save(self,*a,**kw):
        if not self.pay_rec_no and self.doc_rec and self.doc_rec.pay_rec_no:
            self.pay_rec_no = self.doc_rec.pay_rec_no
        self.full_clean(); return super().save(*a,**kw)
    def __str__(self):
        return f"Migration {self.mg_number} ({self.student_name})"

class ProvisionalStatus(models.TextChoices):
    PENDING = 'Pending', 'Pending'
    ISSUED = 'Issued', 'Issued'
    CANCELLED = 'Cancelled', 'Cancelled'

class ProvisionalRecord(models.Model):
    id = models.BigAutoField(primary_key=True)
    doc_rec = models.ForeignKey(DocRec, on_delete=models.CASCADE, db_column='doc_rec_id', related_name='provisional_records')
    enrollment = models.ForeignKey(Enrollment, to_field='enrollment_no', db_column='enrollment_no', on_delete=models.CASCADE, related_name='provisional_records', db_constraint=False)
    student_name = models.CharField(max_length=255, db_column='student_name')
    institute = models.ForeignKey(Institute, to_field='institute_id', db_column='institute_id', on_delete=models.CASCADE, related_name='provisional_records')
    subcourse = models.ForeignKey(SubBranch, to_field='subcourse_id', db_column='subcourse_id', on_delete=models.CASCADE, related_name='provisional_records')
    maincourse = models.ForeignKey(MainBranch, to_field='maincourse_id', db_column='maincourse_id', on_delete=models.CASCADE, related_name='provisional_records')
    class_obtain = models.CharField(max_length=100, null=True, blank=True, db_column='class_obtain')
    prv_number = models.CharField(max_length=50, unique=True, db_column='prv_number')
    prv_date = models.DateField(db_column='prv_date')
    passing_year = models.CharField(max_length=20, db_column='passing_year')
    prv_status = models.CharField(max_length=20, choices=ProvisionalStatus.choices, default=ProvisionalStatus.PENDING, db_column='prv_status')
    pay_rec_no = models.CharField(max_length=50, db_column='pay_rec_no')
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
        if not self.pay_rec_no and self.doc_rec and self.doc_rec.pay_rec_no:
            self.pay_rec_no = self.doc_rec.pay_rec_no
        if not self.pay_rec_no:
            raise ValidationError({'pay_rec_no': 'pay_rec_no is required (copied from related DocRec).'})
