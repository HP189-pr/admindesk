"""Domain Degree Models
StudentDegree, ConvocationMaster
"""
from django.db import models
from django.contrib.auth.models import User
from .domain_enrollment import Enrollment

__all__ = ['StudentDegree', 'ConvocationMaster']


class ConvocationMaster(models.Model):
    """
    Convocation master table storing convocation events
    """
    id = models.AutoField(primary_key=True)
    convocation_no = models.IntegerField(unique=True, db_column='convocation_no')
    convocation_title = models.CharField(max_length=255, null=True, blank=True, db_column='convocation_title')
    convocation_date = models.DateField(db_column='convocation_date')
    month_year = models.CharField(max_length=20, null=True, blank=True, db_column='month_year')
    
    class Meta:
        db_table = 'convocation_master'
        ordering = ['-convocation_date']
        indexes = [
            models.Index(fields=['convocation_no'], name='idx_conv_no'),
            models.Index(fields=['convocation_date'], name='idx_conv_date'),
        ]
    
    def __str__(self):
        return f"Convocation {self.convocation_no} - {self.convocation_title or ''} ({self.convocation_date})"


class StudentDegree(models.Model):
    """
    Student degree records
    """
    id = models.AutoField(primary_key=True)
    dg_sr_no = models.CharField(max_length=100, null=True, blank=True, db_column='dg_sr_no', db_index=True)
    enrollment_no = models.CharField(max_length=50, db_column='enrollment_no', db_index=True)
    student_name_dg = models.CharField(max_length=255, null=True, blank=True, db_column='student_name_dg')
    dg_address = models.TextField(null=True, blank=True, db_column='dg_address')
    institute_name_dg = models.CharField(max_length=255, null=True, blank=True, db_column='institute_name_dg')
    degree_name = models.CharField(max_length=255, null=True, blank=True, db_column='degree_name')
    specialisation = models.CharField(max_length=255, null=True, blank=True, db_column='specialisation')
    seat_last_exam = models.CharField(max_length=100, null=True, blank=True, db_column='seat_last_exam')
    last_exam_month = models.CharField(max_length=50, null=True, blank=True, db_column='last_exam_month')
    last_exam_year = models.IntegerField(null=True, blank=True, db_column='last_exam_year')
    class_obtain = models.CharField(max_length=100, null=True, blank=True, db_column='class_obtain')
    course_language = models.CharField(max_length=50, null=True, blank=True, db_column='course_language')
    dg_rec_no = models.CharField(max_length=100, null=True, blank=True, db_column='dg_rec_no')
    dg_gender = models.CharField(max_length=20, null=True, blank=True, db_column='dg_gender')
    convocation_no = models.IntegerField(null=True, blank=True, db_column='convocation_no', db_index=True)
    
    class Meta:
        db_table = 'student_degree'
        ordering = ['-id']
        indexes = [
            models.Index(fields=['enrollment_no'], name='idx_stdg_enroll'),
            models.Index(fields=['dg_sr_no'], name='idx_stdg_sr_no'),
            models.Index(fields=['convocation_no'], name='idx_stdg_conv_no'),
            models.Index(fields=['last_exam_year'], name='idx_stdg_exam_year'),
        ]
    
    def __str__(self):
        return f"{self.dg_sr_no or 'DG'} - {self.student_name_dg or self.enrollment_no}"
    
    def get_convocation(self):
        """Get related convocation master record"""
        if self.convocation_no:
            try:
                return ConvocationMaster.objects.get(convocation_no=self.convocation_no)
            except ConvocationMaster.DoesNotExist:
                return None
        return None
