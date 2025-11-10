"""Serializers for transcript PDF generation requests."""

from __future__ import annotations

from rest_framework import serializers

from .domain_transcript_generate import TranscriptRequest

__all__ = [
    "TranscriptRequestSerializer",
]


class TranscriptRequestSerializer(serializers.ModelSerializer):
    created = serializers.DateTimeField(read_only=True)

    class Meta:
        model = TranscriptRequest
        fields = [
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

    def validate_mail_status(self, value: str) -> str:
        if not value:
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
