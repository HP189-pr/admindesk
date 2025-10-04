"""Domain Course & Institute Models
Institute, MainBranch, SubBranch, InstituteCourseOffering
"""
from django.contrib.auth.models import User
from django.db import models

__all__ = [
    'Institute', 'MainBranch', 'SubBranch', 'InstituteCourseOffering'
]

class Institute(models.Model):
    institute_id = models.IntegerField(primary_key=True)
    institute_code = models.CharField(max_length=255, unique=True, db_index=True)
    institute_name = models.CharField(max_length=255, null=True, blank=True)
    institute_campus = models.CharField(max_length=255, null=True, blank=True)
    institute_address = models.TextField(null=True, blank=True)
    institute_city = models.CharField(max_length=255, null=True, blank=True)
    created_at = models.DateTimeField(db_column='createdat', auto_now_add=True)
    updated_at = models.DateTimeField(db_column='updatedat', auto_now=True)
    updated_by = models.ForeignKey(User, on_delete=models.SET_NULL, null=True, blank=True, db_column='updatedby', related_name='updated_institutes')
    class Meta:
        db_table = 'institute'
    def __str__(self):
        return self.institute_name or 'Unnamed Institute'

class MainBranch(models.Model):
    id = models.AutoField(primary_key=True)
    maincourse_id = models.CharField(max_length=255, unique=True, db_index=True)
    course_name = models.CharField(max_length=255, null=True, blank=True)
    course_code = models.CharField(max_length=50, null=True, blank=True)
    created_at = models.DateTimeField(db_column='createdat', auto_now_add=True)
    updated_at = models.DateTimeField(db_column='updatedat', auto_now=True)
    updated_by = models.ForeignKey(User, on_delete=models.SET_NULL, null=True, blank=True, db_column='updatedby')
    class Meta:
        db_table = 'main_branch'
    def __str__(self):
        return self.course_name or f"MainBranch {self.maincourse_id}"

class SubBranch(models.Model):
    id = models.AutoField(primary_key=True)
    subcourse_id = models.CharField(max_length=255, unique=True, db_index=True)
    subcourse_name = models.CharField(max_length=255, null=True, blank=True)
    maincourse = models.ForeignKey('MainBranch', to_field='maincourse_id', on_delete=models.CASCADE, db_column='maincourse_id', related_name='sub_branches')
    updated_by = models.ForeignKey(User, on_delete=models.SET_NULL, null=True, blank=True, db_column='updatedby')
    created_at = models.DateTimeField(db_column='createdat', auto_now_add=True)
    updated_at = models.DateTimeField(db_column='updatedat', auto_now=True)
    class Meta:
        db_table = 'sub_branch'
    def __str__(self):
        return self.subcourse_name or f"SubBranch {self.subcourse_id}"

class InstituteCourseOffering(models.Model):
    id = models.AutoField(primary_key=True)
    institute = models.ForeignKey(Institute, on_delete=models.CASCADE, related_name='course_offerings', db_column='institute_id')
    maincourse = models.ForeignKey(MainBranch, to_field='maincourse_id', on_delete=models.CASCADE, db_column='maincourse_id', related_name='institute_offerings')
    subcourse = models.ForeignKey(SubBranch, to_field='subcourse_id', on_delete=models.CASCADE, db_column='subcourse_id', related_name='institute_offerings', null=True, blank=True)
    campus = models.CharField(max_length=255, null=True, blank=True)
    start_date = models.DateField()
    end_date = models.DateField(null=True, blank=True)
    created_at = models.DateTimeField(db_column='createdat', auto_now_add=True)
    updated_at = models.DateTimeField(db_column='updatedat', auto_now=True)
    updated_by = models.ForeignKey(User, on_delete=models.SET_NULL, null=True, blank=True, db_column='updatedby')
    class Meta:
        db_table = 'institute_course_offering'
        indexes = [
            models.Index(fields=['institute', 'maincourse', 'subcourse'])
        ]
    def __str__(self):
        mc = getattr(self.maincourse, 'course_name', None) or getattr(self.maincourse, 'maincourse_id', '')
        sc = getattr(self.subcourse, 'subcourse_name', None) or getattr(self.subcourse, 'subcourse_id', '')
        return f"{self.institute} - {mc}{' / ' + sc if sc else ''} @ {self.campus or '-'}"
