"""Serializers for Google Form mail request submissions."""

from __future__ import annotations

from rest_framework import serializers

from .domain_mail_request import GoogleFormSubmission

__all__ = [
    'GoogleFormSubmissionSerializer',
]


class GoogleFormSubmissionSerializer(serializers.ModelSerializer):
    """Expose the Google Form submission record with verification status."""

    student_verification = serializers.CharField(read_only=True)
    created = serializers.DateTimeField(read_only=True)

    class Meta:
        model = GoogleFormSubmission
        fields = [
            'id',
            'submitted_at',
            'mail_req_no',
            'enrollment_no',
            'student_name',
            'rec_institute_name',
            'rec_official_mail',
            'rec_ref_id',
            'send_doc_type',
            'form_submit_mail',
            'mail_status',
            'remark',
            'student_verification',
            'raw_row',
            'created',
        ]
        read_only_fields = [
            'id',
            'submitted_at',
            'student_verification',
            'raw_row',
            'created',
        ]

    def validate_mail_status(self, value: str) -> str:
        if not value:
            return GoogleFormSubmission.MAIL_STATUS_PENDING
        normalized = value.strip().lower()
        allowed = {choice[0] for choice in GoogleFormSubmission.MAIL_STATUS_CHOICES}
        if normalized not in allowed:
            raise serializers.ValidationError(
                f"Invalid mail status '{value}'. Use one of: {', '.join(sorted(allowed))}."
            )
        return normalized

    def update(self, instance: GoogleFormSubmission, validated_data: dict) -> GoogleFormSubmission:
        # Serializer update path still relies on model.save to refresh verification automatically.
        return super().update(instance, validated_data)
