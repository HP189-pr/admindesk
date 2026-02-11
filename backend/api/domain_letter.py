"""Institutional Letter Models (formerly InstVerificationMain/Student)"""

from django.db import models
from django.contrib.postgres.search import SearchVectorField
import re
from .domain_courses import Institute, MainBranch, SubBranch
from .domain_documents import DocRec
from .domain_enrollment import Enrollment

__all__ = ['InstLetterMain', 'InstLetterStudent']

class InstLetterMain(models.Model):
    id = models.BigAutoField(primary_key=True)
    doc_rec = models.ForeignKey(DocRec, to_field='doc_rec_id', db_column='doc_rec_id', on_delete=models.SET_NULL, related_name='inst_verifications', null=True, blank=True)
    inst_veri_number = models.CharField(max_length=100, null=True, blank=True, db_column='inst_veri_number')
    inst_veri_date = models.DateField(null=True, blank=True, db_column='inst_veri_date')
    institute = models.ForeignKey(Institute, on_delete=models.SET_NULL, db_column='institute_id', related_name='inst_verification_main', null=True, blank=True)
    iv_record_no = models.IntegerField(null=True, blank=True, db_column='iv_record_no', db_index=True)
    rec_inst_name = models.CharField(max_length=255, null=True, blank=True, db_column='rec_inst_name')
    rec_inst_address_1 = models.CharField(max_length=255, null=True, blank=True, db_column='rec_inst_address_1')
    rec_inst_address_2 = models.CharField(max_length=255, null=True, blank=True, db_column='rec_inst_address_2')
    rec_inst_location = models.CharField(max_length=255, null=True, blank=True, db_column='rec_inst_location')
    rec_inst_city = models.CharField(max_length=255, null=True, blank=True, db_column='rec_inst_city')
    rec_inst_pin = models.CharField(max_length=20, null=True, blank=True, db_column='rec_inst_pin')
    rec_inst_email = models.EmailField(null=True, blank=True, db_column='rec_inst_email')
    doc_types = models.CharField(max_length=255, null=True, blank=True, db_column='doc_types')
    rec_inst_sfx_name = models.CharField(max_length=255, null=True, blank=True, db_column='rec_inst_sfx_name')
    study_mode = models.CharField(max_length=1, null=True, blank=True, db_column='study_mode')
    class InstVerificationStatus(models.TextChoices):
        PENDING = 'Pending', 'Pending'
        DONE = 'Done', 'Done'
        CORRECTION = 'Correction', 'Correction'
        POST = 'Post', 'Post'
        MAIL = 'Mail', 'Mail'
    iv_status = models.CharField(max_length=20, choices=InstVerificationStatus.choices, null=True, blank=True, db_column='iv_status')
    rec_by = models.CharField(max_length=255, null=True, blank=True, db_column='rec_by')
    doc_rec_date = models.DateField(null=True, blank=True, db_column='doc_rec_date')
    inst_ref_no = models.CharField(max_length=100, null=True, blank=True, db_column='inst_ref_no')
    ref_date = models.DateField(null=True, blank=True, db_column='ref_date')
    search_vector = SearchVectorField(null=True, blank=True)
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
        if not inst_veri_number:
            return None
        s = str(inst_veri_number).strip()
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
            pass
        super().save(*a, **kw)

class InstLetterStudent(models.Model):
    id = models.BigAutoField(primary_key=True)
    doc_rec = models.ForeignKey(DocRec, to_field='doc_rec_id', db_column='doc_rec_id', on_delete=models.SET_NULL, related_name='inst_verification_students', null=True, blank=True)
    sr_no = models.PositiveIntegerField(null=True, blank=True, db_column='sr_no')
    enrollment = models.ForeignKey(Enrollment, to_field='enrollment_no', db_column='enrollment_no', on_delete=models.SET_NULL, related_name='inst_verification_students', null=True, blank=True)
    enrollment_no_text = models.CharField(max_length=64, null=True, blank=True, db_column='enrollment_no_text')
    student_name = models.CharField(max_length=255, null=True, blank=True, db_column='student_name')
    institute = models.ForeignKey(Institute, on_delete=models.SET_NULL, db_column='institute_id', related_name='inst_verification_students', null=True, blank=True)
    sub_course = models.ForeignKey(SubBranch, to_field='subcourse_id', db_column='sub_course', on_delete=models.SET_NULL, related_name='inst_verification_students', null=True, blank=True)
    main_course = models.ForeignKey(MainBranch, to_field='maincourse_id', db_column='main_course', on_delete=models.SET_NULL, related_name='inst_verification_students', null=True, blank=True)
    type_of_credential = models.CharField(max_length=50, null=True, blank=True, db_column='type_of_credential')
    month_year = models.CharField(max_length=20, null=True, blank=True, db_column='month_year')
    verification_status = models.CharField(max_length=100, null=True, blank=True, db_column='verification_status')
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