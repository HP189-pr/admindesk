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
    # Allow NULL so bulk uploads can leave status blank (preserve NULL).
    # Normal doc-rec creation flow should set IN_PROGRESS explicitly in the creation path.
    status = models.CharField(max_length=20, choices=VerificationStatus.choices, null=True, blank=True, db_column='status')
    final_no = models.CharField(max_length=50, unique=True, null=True, blank=True, db_column='final_no')
    mail_status = models.CharField(max_length=20, choices=MailStatus.choices, default=MailStatus.NOT_SENT, db_column='mail_send_status')
    eca_required = models.BooleanField(default=False, db_column='eca_required')
    # Additional free-text remark stored specifically on the DocRec/verification row
    doc_rec_remark = models.TextField(null=True, blank=True, db_column='doc_rec_remark')
    # Denormalized ECA summary fields (only these are kept per your requested final table)
    eca_name = models.CharField(max_length=255, null=True, blank=True, db_column='eca_name')
    eca_ref_no = models.CharField(max_length=100, null=True, blank=True, db_column='eca_ref_no')
    eca_send_date = models.DateField(null=True, blank=True, db_column='eca_send_date')
    eca_resubmit_date = models.DateField(null=True, blank=True, db_column='eca_resubmit_date')
    eca_status = models.CharField(max_length=20, choices=MailStatus.choices, default=MailStatus.NOT_SENT, db_column='eca_status')
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
            self.eca_name, self.eca_ref_no, self.eca_send_date,
            self.eca_resubmit_date, self.eca_status
        ]):
            raise ValidationError('ECA details present but eca_required=False.')
    def save(self,*a,**kw):
        if self.enrollment and not self.student_name:
            self.student_name = self.enrollment.student_name or ''
        super().save(*a,**kw)
        # Sync doc_rec_remark to the parent DocRec if provided
        try:
            if self.doc_rec and getattr(self, 'doc_rec_remark', None) is not None:
                if getattr(self.doc_rec, 'doc_rec_remark', None) != self.doc_rec_remark:
                    self.doc_rec.doc_rec_remark = self.doc_rec_remark
                    self.doc_rec.save(update_fields=['doc_rec_remark'])
        except Exception:
            # best-effort sync; do not break primary save
            pass
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
    institute = models.ForeignKey(Institute, to_field='institute_id', db_column='institute_id', on_delete=models.CASCADE, related_name='migration_records', null=True, blank=True)
    subcourse = models.ForeignKey(SubBranch, to_field='subcourse_id', db_column='subcourse_id', on_delete=models.CASCADE, related_name='migration_records', null=True, blank=True)
    maincourse = models.ForeignKey(MainBranch, to_field='maincourse_id', db_column='maincourse_id', on_delete=models.CASCADE, related_name='migration_records', null=True, blank=True)
    mg_number = models.CharField(max_length=50, unique=True, db_column='mg_number')
    mg_date = models.DateField(db_column='mg_date')
    exam_year = models.CharField(max_length=20, db_column='exam_year')
    admission_year = models.CharField(max_length=20, db_column='admission_year')
    exam_details = models.TextField(null=True, blank=True, db_column='exam_details')
    mg_status = models.CharField(max_length=20, choices=MigrationStatus.choices, default=MigrationStatus.PENDING, db_column='mg_status')
    pay_rec_no = models.CharField(max_length=50, db_column='pay_rec_no')
    # Free-text remark associated with the related DocRec (kept as a short varchar per schema)
    doc_rec_remark = models.CharField(max_length=255, null=True, blank=True, db_column='doc_rec_remark')
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
        # If enrollment provided, try to copy institute/main/subcourse from it when missing
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

        if not self.pay_rec_no and self.doc_rec and self.doc_rec.pay_rec_no:
            self.pay_rec_no = self.doc_rec.pay_rec_no
        self.full_clean()
        result = super().save(*a,**kw)
        # propagate doc_rec_remark to DocRec when present
        try:
            if self.doc_rec and getattr(self, 'doc_rec_remark', None) is not None:
                if getattr(self.doc_rec, 'doc_rec_remark', None) != self.doc_rec_remark:
                    self.doc_rec.doc_rec_remark = self.doc_rec_remark
                    self.doc_rec.save(update_fields=['doc_rec_remark'])
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
    doc_rec = models.ForeignKey(DocRec, on_delete=models.CASCADE, db_column='doc_rec_id', related_name='provisional_records')
    enrollment = models.ForeignKey(Enrollment, to_field='enrollment_no', db_column='enrollment_no', on_delete=models.CASCADE, related_name='provisional_records', db_constraint=False)
    student_name = models.CharField(max_length=255, db_column='student_name')
    institute = models.ForeignKey(Institute, to_field='institute_id', db_column='institute_id', on_delete=models.CASCADE, related_name='provisional_records', null=True, blank=True)
    subcourse = models.ForeignKey(SubBranch, to_field='subcourse_id', db_column='subcourse_id', on_delete=models.CASCADE, related_name='provisional_records', null=True, blank=True)
    maincourse = models.ForeignKey(MainBranch, to_field='maincourse_id', db_column='maincourse_id', on_delete=models.CASCADE, related_name='provisional_records', null=True, blank=True)
    class_obtain = models.CharField(max_length=100, null=True, blank=True, db_column='class_obtain')
    prv_number = models.CharField(max_length=50, unique=True, db_column='prv_number')
    prv_date = models.DateField(db_column='prv_date')
    passing_year = models.CharField(max_length=20, db_column='passing_year')
    prv_status = models.CharField(max_length=20, choices=ProvisionalStatus.choices, default=ProvisionalStatus.PENDING, db_column='prv_status')
    pay_rec_no = models.CharField(max_length=50, db_column='pay_rec_no')
    # short remark synced to DocRec
    doc_rec_remark = models.CharField(max_length=255, null=True, blank=True, db_column='doc_rec_remark') 
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
    def save(self,*a,**kw):
        # Try to default institute/main/subcourse from linked enrollment when missing
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

        # default pay_rec_no from DocRec
        if not self.pay_rec_no and self.doc_rec and self.doc_rec.pay_rec_no:
            self.pay_rec_no = self.doc_rec.pay_rec_no
        self.full_clean()
        res = super().save(*a,**kw)
        # propagate doc_rec_remark
        try:
            if self.doc_rec and getattr(self, 'doc_rec_remark', None) is not None:
                if getattr(self.doc_rec, 'doc_rec_remark', None) != self.doc_rec_remark:
                    self.doc_rec.doc_rec_remark = self.doc_rec_remark
                    self.doc_rec.save(update_fields=['doc_rec_remark'])
        except Exception:
            pass
        return res
