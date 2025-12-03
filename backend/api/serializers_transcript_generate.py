"""Serializers for transcript PDF generation requests."""

from __future__ import annotations

from rest_framework import serializers

from .domain_transcript_generate import TranscriptRequest

__all__ = [
    "TranscriptRequestSerializer",
]


class TranscriptRequestSerializer(serializers.ModelSerializer):
    created = serializers.DateTimeField(read_only=True)
    tr_request_no = serializers.IntegerField(required=True, allow_null=False)

    class Meta:
        model = TranscriptRequest
        fields = [
            "tr_request_no",
            "id",
            "requested_at",
            "request_ref_no",
            "enrollment_no",
            "student_name",
            "institute_name",
            "transcript_receipt",
            "transcript_remark",
            "submit_mail",
            "pdf_generate",
            "mail_status",
            "raw_row",
            "created",
        ]
        read_only_fields = [
            "id",
            "requested_at",
            "raw_row",
            "created",
        ]
        # Match database NULL constraints
        extra_kwargs = {
            # NOT NULL fields - required
            'tr_request_no': {'required': True, 'allow_null': False},
            'enrollment_no': {'required': True, 'allow_blank': False},
            'student_name': {'required': True, 'allow_blank': False},
            'institute_name': {'required': True, 'allow_blank': False},
            # NULL allowed fields
            'request_ref_no': {'allow_blank': True, 'allow_null': True},
            'transcript_receipt': {'allow_blank': True, 'allow_null': True},
            'transcript_remark': {'allow_blank': True, 'allow_null': True},
            'submit_mail': {'allow_blank': True, 'allow_null': True},
            'pdf_generate': {'allow_blank': True, 'allow_null': True},
            'mail_status': {'allow_blank': True, 'allow_null': True},
        }

    def validate_mail_status(self, value: str) -> str:
        if not value:
            # Treat empty incoming mail_status as Pending by default
            return TranscriptRequest.STATUS_PENDING
        normalized = TranscriptRequest.normalize_status(value)
        if normalized is None:
            allowed = {choice[0] for choice in TranscriptRequest.STATUS_CHOICES}
            aliases = sorted(set(TranscriptRequest.STATUS_ALIASES.keys()) - allowed)
            choices_text = ", ".join(sorted(allowed))
            if aliases:
                choices_text = f"{choices_text} (aliases: {', '.join(aliases)})"
            raise serializers.ValidationError(
                f"Invalid mail status '{value}'. Use one of: {choices_text}."
            )
        return normalized
    
    def validate_tr_request_no(self, value):
        # tr_request_no is required (NOT NULL in database)
        if value is None:
            raise serializers.ValidationError("TR Request number is required and cannot be null.")
        return value
    
    def validate_enrollment_no(self, value):
        # enrollment_no is required (NOT NULL in database)
        if not value or not str(value).strip():
            raise serializers.ValidationError("Enrollment number is required and cannot be empty.")
        return str(value).strip()
    
    def validate_student_name(self, value):
        # student_name is required (NOT NULL in database)
        if not value or not str(value).strip():
            raise serializers.ValidationError("Student name is required and cannot be empty.")
        return str(value).strip()
    
    def validate_institute_name(self, value):
        # institute_name is required (NOT NULL in database)
        if not value or not str(value).strip():
            raise serializers.ValidationError("Institute name is required and cannot be empty.")
        return str(value).strip()
