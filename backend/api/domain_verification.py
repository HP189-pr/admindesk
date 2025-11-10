"""Domain Verification & Related (Verification, InstVerification*, Migration, Provisional, Status enums)
"""
from django.db import models
from django.utils import timezone
import re
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
    # Allow blank student_name so CANCEL rows can be stored without a name.
    # DB keeps this as NOT NULL (empty string) but Django validation will permit '' when blank=True.
    student_name = models.CharField(max_length=255, db_column='student_name', blank=True)
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
    # Auto-computed integer record number derived from inst_veri_number (e.g., 2025/001 -> 25001)
    iv_record_no = models.IntegerField(null=True, blank=True, db_column='iv_record_no', db_index=True)
    rec_inst_name = models.CharField(max_length=255, null=True, blank=True, db_column='rec_inst_name')
    rec_inst_address_1 = models.CharField(max_length=255, null=True, blank=True, db_column='rec_inst_address_1')
    rec_inst_address_2 = models.CharField(max_length=255, null=True, blank=True, db_column='rec_inst_address_2')
    rec_inst_location = models.CharField(max_length=255, null=True, blank=True, db_column='rec_inst_location')
    rec_inst_city = models.CharField(max_length=255, null=True, blank=True, db_column='rec_inst_city')
    rec_inst_pin = models.CharField(max_length=20, null=True, blank=True, db_column='rec_inst_pin')
    rec_inst_email = models.EmailField(null=True, blank=True, db_column='rec_inst_email')
    # New field added directly in DB: free-text comma-separated document types associated with this inst verification
    doc_types = models.CharField(max_length=255, null=True, blank=True, db_column='doc_types')
    # Optional suffix for recipient institute name (e.g., campus or office suffix)
    rec_inst_sfx_name = models.CharField(max_length=255, null=True, blank=True, db_column='rec_inst_sfx_name')
    # Study mode: single character flag (e.g., F=Full-time, P=Part-time, O=Online). Keep flexible as DB uses CHAR
    study_mode = models.CharField(max_length=1, null=True, blank=True, db_column='study_mode')
    class InstVerificationStatus(models.TextChoices):
        PENDING = 'Pending', 'Pending'
        DONE = 'Done', 'Done'
        CORRECTION = 'Correction', 'Correction'
        POST = 'Post', 'Post'
        MAIL = 'Mail', 'Mail'
    # Status specific to institutional verification process
    iv_status = models.CharField(max_length=20, choices=InstVerificationStatus.choices, null=True, blank=True, db_column='iv_status')
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
            models.Index(fields=['iv_record_no'], name='idx_ivm_record_no'),
        ]
    def __str__(self):
        return f"InstVeri {self.inst_veri_number or '-'} for {getattr(self.doc_rec, 'doc_rec_id', None) or '-'}"

    @staticmethod
    def compute_iv_record_no_from_inst_veri(inst_veri_number: str):
        """
        Convert inst_veri_number like '2025/001' or '25-001' to integer 25001.
        Returns None if it cannot be parsed.
        """
        if not inst_veri_number:
            return None
        s = str(inst_veri_number).strip()
        # match year (2 or 4 digits) and sequence at end
        m = re.search(r"(\d{2,4})\D*0*([0-9]+)$", s)
        if not m:
            digits = re.sub(r"\D", "", s)
            if len(digits) >= 3:
                y_part = digits[:-3]
                seq = digits[-3:]
                if len(y_part) >= 2:
                    try:
                        return int(y_part[-2:] + seq)
                    except Exception:
                        return None
                try:
                    return int(digits)
                except Exception:
                    return None
            return None
        year_part = m.group(1)
        # get sequence preserving any leading zeros as present in string
        seq_digits = re.search(r"(\d+)\s*$", s)
        seq = seq_digits.group(1) if seq_digits else m.group(2)
        year2 = year_part[-2:]
        try:
            return int(f"{year2}{seq}")
        except Exception:
            return None

    def save(self, *a, **kw):
        try:
            iv_no = self.compute_iv_record_no_from_inst_veri(getattr(self, 'inst_veri_number', '') or '')
            if iv_no is not None:
                self.iv_record_no = iv_no
        except Exception:
            # do not block saving on compute errors
            pass
        super().save(*a, **kw)

class InstVerificationStudent(models.Model):
    id = models.BigAutoField(primary_key=True)
    doc_rec = models.ForeignKey(DocRec, to_field='doc_rec_id', db_column='doc_rec_id', on_delete=models.SET_NULL, related_name='inst_verification_students', null=True, blank=True)
    sr_no = models.PositiveIntegerField(null=True, blank=True, db_column='sr_no')
    enrollment = models.ForeignKey(Enrollment, to_field='enrollment_no', db_column='enrollment_no', on_delete=models.SET_NULL, related_name='inst_verification_students', null=True, blank=True)
    # Preserve raw enrollment number provided in uploads when the Enrollment
    # object is not yet present. This allows later background sync to link
    # the student row once the Enrollment is created.
    enrollment_no_text = models.CharField(max_length=64, null=True, blank=True, db_column='enrollment_no_text')
    student_name = models.CharField(max_length=255, null=True, blank=True, db_column='student_name')
    institute = models.ForeignKey(Institute, on_delete=models.SET_NULL, db_column='institute_id', related_name='inst_verification_students', null=True, blank=True)
    sub_course = models.ForeignKey(SubBranch, to_field='subcourse_id', db_column='sub_course', on_delete=models.SET_NULL, related_name='inst_verification_students', null=True, blank=True)
    main_course = models.ForeignKey(MainBranch, to_field='maincourse_id', db_column='main_course', on_delete=models.SET_NULL, related_name='inst_verification_students', null=True, blank=True)
    type_of_credential = models.CharField(max_length=50, null=True, blank=True, db_column='type_of_credential')
    month_year = models.CharField(max_length=20, null=True, blank=True, db_column='month_year')
    verification_status = models.CharField(max_length=100, null=True, blank=True, db_column='verification_status', choices=VerificationStatus.choices)
    # Degree name field: may have been added manually in some DBs. Keep nullable so
    # bulk uploads and older rows are compatible.
    iv_degree_name = models.CharField(max_length=255, null=True, blank=True, db_column='iv_degree_name')
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

        try:
            if not self.pay_rec_no and self.doc_rec:
                dr = DocRec.objects.filter(doc_rec_id=self.doc_rec).first()
                if dr and getattr(dr, 'pay_rec_no', None):
                    self.pay_rec_no = dr.pay_rec_no
        except Exception:
            pass
        self.full_clean()
        result = super().save(*a,**kw)
        # propagate doc_rec_remark to DocRec when present
        try:
            if self.doc_rec and getattr(self, 'doc_rec_remark', None) is not None:
                dr = DocRec.objects.filter(doc_rec_id=self.doc_rec).first()
                if dr and getattr(dr, 'doc_rec_remark', None) != self.doc_rec_remark:
                    dr.doc_rec_remark = self.doc_rec_remark
                    dr.save(update_fields=['doc_rec_remark'])
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

        # default pay_rec_no from DocRec (doc_rec stored as string)
        try:
            if not self.pay_rec_no and self.doc_rec:
                dr = DocRec.objects.filter(doc_rec_id=self.doc_rec).first()
                if dr and getattr(dr, 'pay_rec_no', None):
                    self.pay_rec_no = dr.pay_rec_no
        except Exception:
            pass
        # Treat NULL/blank status as ISSUED by default to match requested behavior
        if not getattr(self, 'prv_status', None):
            try:
                self.prv_status = ProvisionalStatus.ISSUED
            except Exception:
                self.prv_status = 'Issued'
        self.full_clean()
        res = super().save(*a,**kw)
        # propagate doc_rec_remark to the referenced DocRec when possible
        try:
            if self.doc_rec and getattr(self, 'doc_rec_remark', None) is not None:
                dr = DocRec.objects.filter(doc_rec_id=self.doc_rec).first()
                if dr and getattr(dr, 'doc_rec_remark', None) != self.doc_rec_remark:
                    dr.doc_rec_remark = self.doc_rec_remark
                    dr.save(update_fields=['doc_rec_remark'])
        except Exception:
            pass
        return res
