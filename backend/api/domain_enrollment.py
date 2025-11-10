"""Domain Enrollment & Profile Models
Enrollment, StudentProfile
"""
from django.contrib.auth.models import User
from django.db import models
from .domain_courses import Institute, SubBranch, MainBranch

__all__ = [
    'Enrollment', 'StudentProfile'
]

class Enrollment(models.Model):
    id = models.AutoField(primary_key=True, db_column='id')
    student_name = models.CharField(max_length=100, db_index=True)
    enrollment_date = models.DateField(null=True, blank=True)
    admission_date = models.DateField(null=True, blank=True)
    institute = models.ForeignKey(Institute, on_delete=models.CASCADE, db_column='institute_id', related_name='enrollments')
    batch = models.IntegerField()
    subcourse = models.ForeignKey(SubBranch, to_field='subcourse_id', on_delete=models.CASCADE, db_column='subcourse_id', related_name='enrollments')
    maincourse = models.ForeignKey(MainBranch, to_field='maincourse_id', on_delete=models.CASCADE, db_column='maincourse_id', related_name='enrollments')
    enrollment_no = models.CharField(max_length=50, unique=True, null=True, blank=True, db_column='enrollment_no')
    temp_enroll_no = models.CharField(max_length=50, null=True, blank=True, db_column='temp_enroll_no')
    created_at = models.DateTimeField(db_column='created_at', auto_now_add=True)
    updated_at = models.DateTimeField(db_column='updated_at', auto_now=True)
    updated_by = models.ForeignKey(User, on_delete=models.SET_NULL, null=True, blank=True, db_column='updated_by', related_name='updated_enrollments')
    class Meta:
        db_table = 'enrollment'
        indexes = [
            models.Index(fields=['institute', 'subcourse', 'maincourse'])
        ]
    def __str__(self):
        return f"{self.student_name or 'Unknown'} - {self.enrollment_no or self.temp_enroll_no or 'No Number'}"

class StudentProfile(models.Model):
    id = models.BigAutoField(primary_key=True)
    enrollment = models.OneToOneField(Enrollment, to_field='enrollment_no', db_column='enrollment_no', on_delete=models.CASCADE, related_name='student_profile', db_constraint=False)
    gender = models.CharField(max_length=20, null=True, blank=True, db_column='gender')
    birth_date = models.DateField(null=True, blank=True, db_column='birth_date')
    address1 = models.CharField(max_length=255, null=True, blank=True, db_column='address1')
    address2 = models.CharField(max_length=255, null=True, blank=True, db_column='address2')
    city1 = models.CharField(max_length=100, null=True, blank=True, db_column='city1')
    city2 = models.CharField(max_length=100, null=True, blank=True, db_column='city2')
    contact_no = models.CharField(max_length=50, null=True, blank=True, db_column='contact_no')
    email = models.EmailField(null=True, blank=True, db_column='email')
    fees = models.DecimalField(max_digits=12, decimal_places=2, null=True, blank=True, default=0, db_column='fees')
    hostel_required = models.BooleanField(default=False, db_column='hostel_required')
    aadhar_no = models.CharField(max_length=20, null=True, blank=True, db_column='aadhar_no')
    abc_id = models.CharField(max_length=50, null=True, blank=True, db_column='abc_id')
    mobile_adhar = models.CharField(max_length=20, null=True, blank=True, db_column='mobile_adhar')
    name_adhar = models.CharField(max_length=255, null=True, blank=True, db_column='name_adhar')
    mother_name = models.CharField(max_length=255, null=True, blank=True, db_column='mother_name')
    category = models.CharField(max_length=50, null=True, blank=True, db_column='category')
    photo_uploaded = models.BooleanField(default=False, db_column='photo_uploaded')
    is_d2d = models.BooleanField(default=False, db_column='is_d2d')
    program_medium = models.CharField(max_length=50, null=True, blank=True, db_column='program_medium')
    created_at = models.DateTimeField(auto_now_add=True, db_column='created_at')
    updated_at = models.DateTimeField(auto_now=True, db_column='updated_at')
    updated_by = models.ForeignKey(User, on_delete=models.SET_NULL, null=True, blank=True, db_column='updated_by', related_name='updated_student_profiles')
    class Meta:
        db_table = 'student_profile'
        indexes = [
            models.Index(fields=['enrollment'], name='idx_sp_enrollment')
        ]
    def __str__(self):
        return f"Profile for {getattr(self.enrollment, 'enrollment_no', None) or '-'}"


