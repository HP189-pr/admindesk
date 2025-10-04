"""File: backend/api/serializers_courses.py
Course, institute, and enrollment related serializers.
Extraction from monolithic serializers.py (no behavior change).
"""
from rest_framework import serializers
from .models import Institute, MainBranch, SubBranch, InstituteCourseOffering, Enrollment, StudentProfile

__all__ = [
    'InstituteSerializer','MainBranchSerializer','SubBranchSerializer',
    'EnrollmentSerializer','InstituteCourseOfferingSerializer','StudentProfileSerializer'
]

class InstituteSerializer(serializers.ModelSerializer):
    class Meta:
        model = Institute
        fields = '__all__'

class MainBranchSerializer(serializers.ModelSerializer):
    class Meta:
        model = MainBranch
        fields = '__all__'

class SubBranchSerializer(serializers.ModelSerializer):
    maincourse_id = serializers.CharField(source="maincourse.maincourse_id", read_only=True)
    class Meta:
        model = SubBranch
        fields = ['id','subcourse_id','subcourse_name','maincourse','maincourse_id','updated_by','created_at','updated_at']

class EnrollmentSerializer(serializers.ModelSerializer):
    institute_id = serializers.PrimaryKeyRelatedField(queryset=Institute.objects.all(), source='institute', write_only=True)
    maincourse_id = serializers.PrimaryKeyRelatedField(queryset=MainBranch.objects.all(), source='maincourse', write_only=True)
    subcourse_id = serializers.PrimaryKeyRelatedField(queryset=SubBranch.objects.all(), source='subcourse', write_only=True)
    class Meta:
        model = Enrollment
        fields = ['enrollment_no','student_name','institute','institute_id','batch','enrollment_date','admission_date','subcourse','subcourse_id','maincourse','maincourse_id','updated_by','created_at','updated_at','temp_enroll_no']
        read_only_fields = ['enrollment_date','created_at','updated_at','institute','subcourse','maincourse','updated_by']
        extra_kwargs = {'enrollment_no': {'required': True},'student_name': {'required': True},'batch': {'required': True}}
    def to_representation(self, instance):
        data = super().to_representation(instance)
        def wrap(obj):
            return {'id': obj.pk, 'name': str(obj)} if obj else None
        for f in ('institute','subcourse','maincourse'):
            data[f] = wrap(getattr(instance,f))
        if instance.updated_by:
            data['updated_by'] = {'id': instance.updated_by.id, 'username': instance.updated_by.username}
        return data

class InstituteCourseOfferingSerializer(serializers.ModelSerializer):
    institute_id = serializers.PrimaryKeyRelatedField(queryset=Institute.objects.all(), source='institute', write_only=True)
    maincourse_id = serializers.PrimaryKeyRelatedField(queryset=MainBranch.objects.all(), source='maincourse', write_only=True)
    subcourse_id = serializers.PrimaryKeyRelatedField(queryset=SubBranch.objects.all(), source='subcourse', write_only=True, allow_null=True, required=False)
    class Meta:
        model = InstituteCourseOffering
        fields = ['id','institute','institute_id','maincourse','maincourse_id','subcourse','subcourse_id','campus','start_date','end_date','created_at','updated_at','updated_by']
        read_only_fields = ['created_at','updated_at','updated_by','institute','maincourse','subcourse']
    def to_representation(self, instance):
        data = super().to_representation(instance)
        data['institute'] = {'id': instance.institute.id, 'name': str(instance.institute)} if instance.institute else None
        data['maincourse'] = {'id': instance.maincourse.id,'maincourse_id': instance.maincourse.maincourse_id,'name': instance.maincourse.course_name} if instance.maincourse else None
        data['subcourse'] = {'id': getattr(instance.subcourse,'id',None),'subcourse_id': getattr(instance.subcourse,'subcourse_id',None),'name': getattr(instance.subcourse,'subcourse_name',None)} if instance.subcourse else None
        if instance.updated_by:
            data['updated_by'] = {'id': instance.updated_by.id, 'username': instance.updated_by.username}
        return data

class StudentProfileSerializer(serializers.ModelSerializer):
    enrollment_no = serializers.SlugRelatedField(slug_field='enrollment_no', queryset=Enrollment.objects.all(), source='enrollment', write_only=True)
    enrollment = serializers.CharField(source='enrollment.enrollment_no', read_only=True)
    class Meta:
        model = StudentProfile
        fields = '__all__'
        read_only_fields = ['id','created_at','updated_at','updated_by','enrollment']
    def create(self, validated):
        request = self.context.get('request')
        if request and request.user and request.user.is_authenticated:
            validated['updated_by'] = request.user
        return super().create(validated)
    def update(self, instance, validated):
        request = self.context.get('request')
        if request and request.user and request.user.is_authenticated:
            validated['updated_by'] = request.user
        return super().update(instance, validated)
