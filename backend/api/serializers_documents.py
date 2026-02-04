"""File: backend/api/serializers_documents.py
DocRec, Verification, Migration, Provisional, InstVerification, ECA related serializers.
Extraction; no logic change.
"""
from rest_framework import serializers
from django.utils import timezone
from django.db import models
from django.db.models import Value
from django.db.models.functions import Lower, Replace
from django.db.models import Q
from .models import (
    DocRec, Verification, VerificationStatus, MigrationRecord, ProvisionalRecord,
    InstVerificationMain, InstVerificationStudent, Eca, Enrollment
)

__all__ = [
    'VerificationSerializer','EcaResendSerializer','AssignFinalSerializer','ResubmitSerializer',
    'DocRecSerializer','MigrationRecordSerializer','ProvisionalRecordSerializer',
    'InstLetterMainSerializer','InstLetterstudentSerializer','InstVerificationMainSerializer','InstVerificationStudentSerializer','EcaSerializer'
]

class VerificationSerializer(serializers.ModelSerializer):
    # enrollment_no and second_enrollment_id are now string fields on the model
    doc_rec_id = serializers.PrimaryKeyRelatedField(queryset=DocRec.objects.all(), source='doc_rec', write_only=True, required=False)
    doc_rec_key = serializers.CharField(source="doc_rec.doc_rec_id", read_only=True)
    # Expose `sequence` key expected by the frontend but use the DocRec identifier
    # so the UI shows the `doc_rec_id` in place of the old sequence value.
    sequence = serializers.SerializerMethodField()
    eca = serializers.SerializerMethodField()
    doc_remark = serializers.CharField(source='doc_remark', required=False, allow_blank=True)
    class Meta:
        model = Verification
        fields = [
            "id","doc_rec_date","vr_done_date","enrollment_no","second_enrollment_id",
            "student_name","tr_count","ms_count","dg_count","moi_count","backlog_count","pay_rec_no","status",
            "final_no","mail_status","eca_required","eca_name","eca_ref_no","eca_send_date","eca_status",
            "eca_resubmit_date","replaces_verification","doc_remark","last_resubmit_date","last_resubmit_status",
            "createdat","updatedat","updatedby","doc_rec_id","doc_rec_key","sequence","eca"
        ]
        read_only_fields = ["id","createdat","updatedat","updatedby","last_resubmit_date","last_resubmit_status"]
    def validate(self, attrs):
        # enrollment_no and second_enrollment_id are now simple string fields, no FK resolution needed
        status = attrs.get("status", getattr(self.instance, "status", None))
        final_no = attrs.get("final_no", getattr(self.instance, "final_no", None))
        eca_required = attrs.get("eca_required", getattr(self.instance, "eca_required", None))
        
        # Validate document counts (now nullable smallint)
        for f in ("tr_count","ms_count","dg_count","moi_count","backlog_count"):
            val = attrs.get(f, getattr(self.instance, f, None) if self.instance else None)
            if val is not None and (val < 0 or val > 32767):
                raise serializers.ValidationError({f: "Must be between 0 and 32767."})
        
        # Validate status-final_no relationship
        if status == VerificationStatus.DONE and not final_no:
            raise serializers.ValidationError({"final_no": "Required when status is DONE."})
        if status in (VerificationStatus.PENDING, VerificationStatus.CANCEL) and final_no:
            raise serializers.ValidationError({"final_no": "Must be empty for PENDING or CANCEL."})
        
        # Validate ECA fields consistency
        eca_fields = ("eca_name","eca_ref_no","eca_send_date","eca_resubmit_date")
        if eca_required is False:
            for ef in eca_fields:
                if attrs.get(ef) is not None:
                    raise serializers.ValidationError("ECA details present but eca_required=False.")
        return attrs
    def create(self, validated):
        req = self.context.get("request")
        if req and req.user and req.user.is_authenticated:
            validated["updatedby"] = req.user
        return super().create(validated)
    def update(self, instance, validated):
        req = self.context.get("request")
        if req and req.user and req.user.is_authenticated:
            validated["updatedby"] = req.user
        return super().update(instance, validated)
    def get_eca(self, obj):
        try:
            if not obj: return None
            return {
                "id": None,
                "doc_rec_id": obj.doc_rec.doc_rec_id if getattr(obj, 'doc_rec', None) else None,
                "eca_name": getattr(obj, 'eca_name', None),
                "eca_ref_no": getattr(obj, 'eca_ref_no', None),
                "eca_send_date": getattr(obj, 'eca_submit_date', None),
                "doc_remark": getattr(obj, 'doc_remark', None)
            }
        except Exception:
            return None

    def get_sequence(self, obj):
        """Return the DocRec identifier to be displayed in the frontend 'Sequence' column.

        This keeps the UI unchanged while showing the `doc_rec_id` value instead
        of any internal numeric sequence.
        """
        try:
            if getattr(obj, 'doc_rec', None):
                return getattr(obj.doc_rec, 'doc_rec_id', None) or ''
            # fallback: some legacy rows may store doc_rec as a string on the object
            return getattr(obj, 'doc_rec', '') or ''
        except Exception:
            return ''

class EcaResendSerializer(serializers.Serializer):
    to_email = serializers.EmailField(required=True)
    notes = serializers.CharField(required=False, allow_blank=True)

class AssignFinalSerializer(serializers.Serializer):
    final_no = serializers.CharField(required=True, max_length=50)

class ResubmitSerializer(serializers.Serializer):
    status_note = serializers.CharField(required=False, allow_blank=True)

class DocRecSerializer(serializers.ModelSerializer):
    class Meta:
        model = DocRec
        fields = ['id','doc_rec_date','apply_for','doc_rec_id','pay_by','pay_rec_no_pre','pay_rec_no','pay_amount','doc_remark','created_by','createdat','updatedat']
        read_only_fields = ['id','doc_rec_id','created_by','createdat','updatedat']
    def create(self, validated):
        req = self.context.get('request')
        if req and req.user and req.user.is_authenticated:
            validated['created_by'] = req.user
        return super().create(validated)

class MigrationRecordSerializer(serializers.ModelSerializer):
    doc_rec_key = serializers.SlugRelatedField(slug_field='doc_rec_id', queryset=DocRec.objects.all(), source='doc_rec', write_only=True, required=False)
    doc_rec = serializers.CharField(source='doc_rec.doc_rec_id', read_only=True)
    doc_remark = serializers.CharField(source='doc_remark', required=False, allow_blank=True)
    class Meta:
        model = MigrationRecord
        fields = '__all__'
        read_only_fields = ['id','created_at','updated_at','created_by']
    def create(self, validated):
        req = self.context.get('request')
        if req and req.user and req.user.is_authenticated:
            validated['created_by'] = req.user
        enr = validated.get('enrollment')
        if enr:
            validated.setdefault('student_name', enr.student_name or '')
            validated.setdefault('institute', enr.institute)
            validated.setdefault('subcourse', enr.subcourse)
            validated.setdefault('maincourse', enr.maincourse)
        return super().create(validated)

    def get_doc_rec_remark(self, obj):
        try:
            return obj.doc_rec.doc_rec_remark if obj.doc_rec else None
        except Exception:
            return None

class ProvisionalRecordSerializer(serializers.ModelSerializer):
    doc_rec_key = serializers.SlugRelatedField(slug_field='doc_rec_id', queryset=DocRec.objects.all(), source='doc_rec', write_only=True, required=False)
    doc_rec = serializers.CharField(source='doc_rec.doc_rec_id', read_only=True)
    doc_remark = serializers.CharField(source='doc_remark', required=False, allow_blank=True)
    class Meta:
        model = ProvisionalRecord
        fields = '__all__'
        read_only_fields = ['id','created_at','updated_at','created_by']
    def create(self, validated):
        req = self.context.get('request')
        if req and req.user and req.user.is_authenticated:
            validated['created_by'] = req.user
        enr = validated.get('enrollment')
        if enr:
            validated.setdefault('student_name', enr.student_name or '')
            validated.setdefault('institute', enr.institute)
            validated.setdefault('subcourse', enr.subcourse)
            validated.setdefault('maincourse', enr.maincourse)
        return super().create(validated)

    def get_doc_rec_remark(self, obj):
        try:
            return obj.doc_rec.doc_rec_remark if obj.doc_rec else None
        except Exception:
            return None

class InstLetterMainSerializer(serializers.ModelSerializer):
    doc_rec_id = serializers.PrimaryKeyRelatedField(queryset=DocRec.objects.all(), source='doc_rec', write_only=True, required=False)
    doc_rec_key = serializers.SlugRelatedField(slug_field='doc_rec_id', queryset=DocRec.objects.all(), source='doc_rec', write_only=True, required=False)
    doc_rec = serializers.CharField(source='doc_rec.doc_rec_id', read_only=True)
    doc_remark = serializers.CharField(source='doc_remark', required=False, allow_blank=True)
    class Meta:
        model = InstVerificationMain
        fields = '__all__'

    def to_representation(self, instance):
        """Return a sanitized representation so API consumers (frontend) don't get
        placeholder values like numeric-only codes or 'nan' that would render as
        bracketed placeholders in the printed template.
        """
        import re
        def _sanitize(val):
            try:
                if val is None:
                    return ''
                if isinstance(val, (list, tuple)):
                    return '' if len(val) == 0 else str(val)
                s = str(val).strip()
                if not s:
                    return ''
                s2 = re.sub(r'^\[\s*|\s*\]$', '', s)
                if re.fullmatch(r'\d+', s2):
                    return ''
                if s2.strip().lower() in ('nan', 'none', 'null', 'n/a'):
                    return ''
                return s2
            except Exception:
                return ''

        data = super().to_representation(instance)
        # sanitize the fields used in templates
        for k in ('rec_inst_sfx_name','rec_inst_name','rec_inst_address_1','rec_inst_address_2','rec_inst_location','rec_inst_city','rec_inst_pin','rec_inst_email','doc_types','inst_ref_no','rec_by'):
            if k in data:
                data[k] = _sanitize(data.get(k))
        # format date fields consistently
        for df in ('inst_veri_date','ref_date','doc_rec_date'):
            v = data.get(df)
            try:
                if not v:
                    data[df] = ''
                else:
                    # keep string; assume backend returns ISO or already formatted
                    data[df] = str(v)
            except Exception:
                data[df] = ''
        return data

    def get_doc_rec_remark(self, obj):
        try:
            return obj.doc_rec.doc_rec_remark if obj.doc_rec else None
        except Exception:
            return None

    def create(self, validated):
        req = self.context.get('request')
        if req and req.user and req.user.is_authenticated:
            validated['created_by'] = req.user
        obj = super().create(validated)
        # Sync doc_rec_remark if provided
        try:
            remark = None
            if self.context and self.context.get('request'):
                remark = self.context['request'].data.get('doc_rec_remark')
            if remark is not None and getattr(obj, 'doc_rec', None):
                dr = obj.doc_rec
                dr.doc_rec_remark = remark
                dr.save(update_fields=['doc_rec_remark'])
        except Exception:
            pass
        return obj

class InstLetterstudentSerializer(serializers.ModelSerializer):
    # Expose enrollment number (FK uses to_field='enrollment_no') for templates and consumers
    enrollment_no = serializers.CharField(source='enrollment.enrollment_no', read_only=True)
    doc_rec_key = serializers.SlugRelatedField(slug_field='doc_rec_id', queryset=DocRec.objects.all(), source='doc_rec', write_only=True, required=False)
    doc_rec = serializers.CharField(source='doc_rec.doc_rec_id', read_only=True)
    class Meta:
        model = InstVerificationStudent
        fields = '__all__'

# Backward-compatible aliases
InstVerificationMainSerializer = InstLetterMainSerializer
InstVerificationStudentSerializer = InstLetterstudentSerializer

class EcaSerializer(serializers.ModelSerializer):
    doc_rec_key = serializers.SlugRelatedField(slug_field='doc_rec_id', queryset=DocRec.objects.all(), source='doc_rec', write_only=True, required=False)
    doc_rec_id = serializers.CharField(source='doc_rec.doc_rec_id', read_only=True)
    class Meta:
        model = Eca
        fields = ['id','doc_rec_id','doc_rec_key','eca_name','eca_ref_no','eca_send_date','doc_remark','createdat','updatedat']
        read_only_fields = ['id','doc_rec_id','createdat','updatedat']
