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
    'InstVerificationMainSerializer','InstVerificationStudentSerializer','EcaSerializer'
]

class VerificationSerializer(serializers.ModelSerializer):
    enrollment_no = serializers.CharField(source="enrollment.enrollment_no", read_only=True)
    second_enrollment_no = serializers.CharField(source="second_enrollment.enrollment_no", read_only=True)
    doc_rec_id = serializers.PrimaryKeyRelatedField(queryset=DocRec.objects.all(), source='doc_rec', write_only=True, required=False)
    doc_rec_key = serializers.CharField(source="doc_rec.doc_rec_id", read_only=True)
    eca = serializers.SerializerMethodField()
    class Meta:
        model = Verification
        fields = ["id","date","vr_done_date","enrollment","enrollment_no","second_enrollment","second_enrollment_no","student_name","tr_count","ms_count","dg_count","moi_count","backlog_count","pay_rec_no","status","final_no","mail_status","eca_required","eca_name","eca_ref_no","eca_submit_date","eca_mail_status","eca_resend_count","eca_last_action_at","eca_last_to_email","eca_history","replaces_verification","remark","last_resubmit_date","last_resubmit_status","createdat","updatedat","updatedby","doc_rec_id","doc_rec_key","eca"]
        read_only_fields = ["id","createdat","updatedat","updatedby","eca_resend_count","eca_last_action_at","eca_last_to_email","enrollment_no","second_enrollment_no","last_resubmit_date","last_resubmit_status"]
    def validate(self, attrs):
        status = attrs.get("status", getattr(self.instance, "status", None))
        final_no = attrs.get("final_no", getattr(self.instance, "final_no", None))
        eca_required = attrs.get("eca_required", getattr(self.instance, "eca_required", False))
        for f in ("tr_count","ms_count","dg_count","moi_count","backlog_count"):
            val = attrs.get(f, getattr(self.instance, f, 0) if self.instance else 0)
            if val is not None and (val < 0 or val > 999):
                raise serializers.ValidationError({f: "Must be between 0 and 999."})
        if status == VerificationStatus.DONE and not final_no:
            raise serializers.ValidationError({"final_no": "Required when status is DONE."})
        if status in (VerificationStatus.PENDING, VerificationStatus.CANCEL) and final_no:
            raise serializers.ValidationError({"final_no": "Must be empty for PENDING or CANCEL."})
        eca_fields = ("eca_name","eca_ref_no","eca_submit_date","eca_history")
        if not eca_required:
            for ef in eca_fields:
                if attrs.get(ef) is not None:
                    raise serializers.ValidationError("ECA details present but eca_required=False.")
        return attrs
    def create(self, validated):
        if not validated.get("student_name") and validated.get("enrollment"):
            validated["student_name"] = validated["enrollment"].student_name or ""
        req = self.context.get("request")
        if req and req.user and req.user.is_authenticated:
            validated["updatedby"] = req.user
        return super().create(validated)
    def update(self, instance, validated):
        req = self.context.get("request")
        if req and req.user and req.user.is_authenticated:
            validated["updatedby"] = req.user
        new_name = validated.get("student_name")
        resp = super().update(instance, validated)
        try:
            if new_name and instance.enrollment and instance.enrollment.student_name != new_name:
                enr = instance.enrollment
                enr.student_name = new_name
                enr.save(update_fields=["student_name","updated_at"])
        except Exception:
            pass
        return resp
    def get_eca(self, obj):
        try:
            if not obj.doc_rec: return None
            e = Eca.objects.filter(doc_rec=obj.doc_rec).order_by("id").first()
            if not e: return None
            return {"id":e.id,"doc_rec_id": e.doc_rec.doc_rec_id if e.doc_rec else None,"eca_name": e.eca_name,"eca_ref_no": e.eca_ref_no,"eca_send_date": e.eca_send_date,"eca_remark": e.eca_remark}
        except Exception:
            return None

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
        fields = ['id','apply_for','doc_rec_id','pay_by','pay_rec_no_pre','pay_rec_no','pay_amount','doc_rec_date','created_by','createdat','updatedat']
        read_only_fields = ['id','doc_rec_id','created_by','createdat','updatedat']
    def create(self, validated):
        req = self.context.get('request')
        if req and req.user and req.user.is_authenticated:
            validated['created_by'] = req.user
        return super().create(validated)

class MigrationRecordSerializer(serializers.ModelSerializer):
    doc_rec_key = serializers.SlugRelatedField(slug_field='doc_rec_id', queryset=DocRec.objects.all(), source='doc_rec', write_only=True, required=False)
    doc_rec = serializers.CharField(source='doc_rec.doc_rec_id', read_only=True)
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

class ProvisionalRecordSerializer(serializers.ModelSerializer):
    doc_rec_key = serializers.SlugRelatedField(slug_field='doc_rec_id', queryset=DocRec.objects.all(), source='doc_rec', write_only=True, required=False)
    doc_rec = serializers.CharField(source='doc_rec.doc_rec_id', read_only=True)
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

class InstVerificationMainSerializer(serializers.ModelSerializer):
    doc_rec_id = serializers.PrimaryKeyRelatedField(queryset=DocRec.objects.all(), source='doc_rec', write_only=True, required=False)
    doc_rec_key = serializers.SlugRelatedField(slug_field='doc_rec_id', queryset=DocRec.objects.all(), source='doc_rec', write_only=True, required=False)
    doc_rec = serializers.CharField(source='doc_rec.doc_rec_id', read_only=True)
    class Meta:
        model = InstVerificationMain
        fields = '__all__'

class InstVerificationStudentSerializer(serializers.ModelSerializer):
    doc_rec_key = serializers.SlugRelatedField(slug_field='doc_rec_id', queryset=DocRec.objects.all(), source='doc_rec', write_only=True, required=False)
    doc_rec = serializers.CharField(source='doc_rec.doc_rec_id', read_only=True)
    class Meta:
        model = InstVerificationStudent
        fields = '__all__'

class EcaSerializer(serializers.ModelSerializer):
    doc_rec_key = serializers.SlugRelatedField(slug_field='doc_rec_id', queryset=DocRec.objects.all(), source='doc_rec', write_only=True, required=False)
    doc_rec_id = serializers.CharField(source='doc_rec.doc_rec_id', read_only=True)
    class Meta:
        model = Eca
        fields = ['id','doc_rec_id','doc_rec_key','eca_name','eca_ref_no','eca_send_date','eca_remark','createdat','updatedat']
        read_only_fields = ['id','doc_rec_id','createdat','updatedat']
