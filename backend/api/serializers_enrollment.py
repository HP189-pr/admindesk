"""Enrollment-focused serializers."""
from rest_framework import serializers
from django.utils import timezone

from .models import Institute, MainBranch, SubBranch, Enrollment, AdmissionCancel


class EnrollmentSerializer(serializers.ModelSerializer):
    # Explicitly declare status as a read-only field since it's a @property, not a model field
    status = serializers.ReadOnlyField()
    
    institute_id = serializers.PrimaryKeyRelatedField(
        queryset=Institute.objects.all(),
        source='institute',
        write_only=True
    )
    maincourse_id = serializers.PrimaryKeyRelatedField(
        queryset=MainBranch.objects.all(),
        source='maincourse',
        write_only=True
    )
    subcourse_id = serializers.PrimaryKeyRelatedField(
        queryset=SubBranch.objects.all(),
        source='subcourse',
        write_only=True
    )

    class Meta:
        model = Enrollment
        fields = [
            'id',
            'enrollment_no',
            'student_name',
            'institute',
            'institute_id',
            'batch',
            'enrollment_date',
            'admission_date',
            'subcourse',
            'subcourse_id',
            'maincourse',
            'maincourse_id',
            'updated_by',
            'created_at',
            'updated_at',
            'temp_enroll_no',
            'cancel',
            'status',   # ← model @property
        ]
        read_only_fields = [
            'id',
            'enrollment_date',
            'created_at',
            'updated_at',
            'institute',
            'subcourse',
            'maincourse',
            'updated_by',
            'cancel',
            'status'
        ]
        extra_kwargs = {
            'enrollment_no': {'required': True},
            'student_name': {'required': True},
            'batch': {'required': True},
        }

    def to_representation(self, instance):
        data = super().to_representation(instance)

        def wrap(obj):
            return {'id': obj.pk, 'name': str(obj)} if obj else None

        # Institute: include institute_code
        if instance.institute:
            data['institute'] = {
                'id': instance.institute.pk,
                'name': str(instance.institute),
                'institute_code': instance.institute.institute_code
            }
        else:
            data['institute'] = None

        # Subcourse and maincourse: keep as before
        for field in ('subcourse', 'maincourse'):
            data[field] = wrap(getattr(instance, field))

        if instance.updated_by:
            data['updated_by'] = {
                'id': instance.updated_by.id,
                'username': instance.updated_by.username,
            }

        return data



class AdmissionCancelSerializer(serializers.ModelSerializer):
    enrollment_no = serializers.CharField(source='enrollment.enrollment_no', read_only=True)

    class Meta:
        model = AdmissionCancel
        fields = [
            'id',
            'cancel_date',
            'enrollment',
            'enrollment_no',
            'student_name',
            'inward_no',
            'inward_date',
            'outward_no',
            'outward_date',
            'can_remark',
            'status',
            'created_at',
        ]
        read_only_fields = ['id', 'enrollment_no', 'created_at']

    def validate(self, attrs):
        enrollment = attrs.get('enrollment')
        student_name = attrs.get('student_name')
        if not student_name and enrollment:
            attrs['student_name'] = enrollment.student_name
        if not attrs.get('cancel_date'):
            attrs['cancel_date'] = timezone.now().date()
        return super().validate(attrs)
