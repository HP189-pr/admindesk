# backend/api/serializers_enrollment.py
"""Enrollment-focused serializers."""
from rest_framework import serializers

from .models import Institute, MainBranch, SubBranch, Enrollment, AdmissionCancel


class EnrollmentSerializer(serializers.ModelSerializer):
    # Explicitly declare status as a read-only field since it's a @property, not a model field
    status = serializers.ReadOnlyField()
    
    # Accept either numeric PKs or code-based identifiers from clients.
    institute_id = serializers.CharField(write_only=True)
    maincourse_id = serializers.CharField(write_only=True)
    subcourse_id = serializers.CharField(write_only=True)

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
            'enrollment_no': {'required': False, 'allow_blank': True, 'allow_null': True},
            'temp_enroll_no': {'required': False, 'allow_blank': True, 'allow_null': True},
            'student_name': {'required': True},
            'batch': {'required': True},
        }

    def validate(self, attrs):
        def _clean_token(value):
            if value is None:
                return None
            s = str(value).strip()
            return s if s else None

        def _resolve_institute(raw):
            token = _clean_token(raw)
            if not token:
                return None
            obj = None
            if token.isdigit():
                obj = Institute.objects.filter(pk=int(token)).first()
            if not obj:
                obj = Institute.objects.filter(institute_code__iexact=token).first()
            if not obj:
                obj = Institute.objects.filter(institute_name__iexact=token).first()
            return obj

        def _resolve_maincourse(raw):
            token = _clean_token(raw)
            if not token:
                return None
            obj = None
            if token.isdigit():
                obj = MainBranch.objects.filter(pk=int(token)).first()
            if not obj:
                obj = MainBranch.objects.filter(maincourse_id__iexact=token).first()
            if not obj:
                obj = MainBranch.objects.filter(course_code__iexact=token).first()
            if not obj:
                obj = MainBranch.objects.filter(course_name__iexact=token).first()
            return obj

        def _resolve_subcourse(raw, maincourse_obj=None):
            token = _clean_token(raw)
            if not token:
                return None
            obj = None
            if token.isdigit():
                obj = SubBranch.objects.filter(pk=int(token)).first()
            if not obj:
                obj = SubBranch.objects.filter(subcourse_id__iexact=token).first()
            if not obj and maincourse_obj is not None:
                obj = SubBranch.objects.filter(subcourse_name__iexact=token, maincourse=maincourse_obj).first()
            if not obj:
                obj = SubBranch.objects.filter(subcourse_name__iexact=token).first()
            return obj

        inst_raw = attrs.pop('institute_id', None)
        if inst_raw is None and self.instance is not None and getattr(self, 'partial', False):
            inst_obj = getattr(self.instance, 'institute', None)
        else:
            inst_obj = _resolve_institute(inst_raw)
        if inst_obj is None:
            raise serializers.ValidationError({'institute_id': 'Invalid institute value.'})

        main_raw = attrs.pop('maincourse_id', None)
        if main_raw is None and self.instance is not None and getattr(self, 'partial', False):
            main_obj = getattr(self.instance, 'maincourse', None)
        else:
            main_obj = _resolve_maincourse(main_raw)
        if main_obj is None:
            raise serializers.ValidationError({'maincourse_id': 'Invalid maincourse value.'})

        sub_raw = attrs.pop('subcourse_id', None)
        if sub_raw is None and self.instance is not None and getattr(self, 'partial', False):
            sub_obj = getattr(self.instance, 'subcourse', None)
        else:
            sub_obj = _resolve_subcourse(sub_raw, main_obj)
        if sub_obj is None:
            raise serializers.ValidationError({'subcourse_id': 'Invalid subcourse value.'})

        attrs['institute'] = inst_obj
        attrs['maincourse'] = main_obj
        attrs['subcourse'] = sub_obj

        enrollment_no = (attrs.get('enrollment_no') or '').strip()
        temp_enroll_no = (attrs.get('temp_enroll_no') or '').strip()
        if not enrollment_no and not temp_enroll_no:
            raise serializers.ValidationError(
                "Either Enrollment Number or Temporary Number is required."
            )
        return super().validate(attrs)

    def to_representation(self, instance):
        data = super().to_representation(instance)

        # Institute: include institute_code
        if instance.institute:
            data['institute'] = {
                'id': instance.institute.pk,
                'institute_id': instance.institute.pk,
                'name': str(instance.institute),
                'institute_code': instance.institute.institute_code,
                'institute_name': instance.institute.institute_name,
            }
            data['institute_id'] = instance.institute.pk
        else:
            data['institute'] = None
            data['institute_id'] = None

        if instance.maincourse:
            data['maincourse'] = {
                'id': instance.maincourse.pk,
                'maincourse_id': instance.maincourse.maincourse_id,
                'course_code': instance.maincourse.course_code,
                'course_name': instance.maincourse.course_name,
                'name': str(instance.maincourse),
            }
            data['maincourse_id'] = instance.maincourse.maincourse_id
        else:
            data['maincourse'] = None
            data['maincourse_id'] = None

        if instance.subcourse:
            data['subcourse'] = {
                'id': instance.subcourse.pk,
                'subcourse_id': instance.subcourse.subcourse_id,
                'subcourse_name': instance.subcourse.subcourse_name,
                'name': str(instance.subcourse),
            }
            data['subcourse_id'] = instance.subcourse.subcourse_id
        else:
            data['subcourse'] = None
            data['subcourse_id'] = None

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
        return super().validate(attrs)
