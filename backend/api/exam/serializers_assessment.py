"""
Assessment System – DRF Serializers
"""
from rest_framework import serializers
from django.contrib.auth.models import User
from .domain_assessment import (
    AssessmentEntry,
    AssessmentOutward,
    AssessmentOutwardDetails,
)


class UserMinimalSerializer(serializers.ModelSerializer):
    class Meta:
        model = User
        fields = ["id", "username", "first_name", "last_name"]


class AssessmentEntrySerializer(serializers.ModelSerializer):
    added_by_name = serializers.SerializerMethodField(read_only=True)
    outward_no = serializers.SerializerMethodField(read_only=True)

    class Meta:
        model = AssessmentEntry
        fields = "__all__"
        read_only_fields = ["added_by", "status", "outward", "created_at"]

    def get_added_by_name(self, obj):
        if obj.added_by:
            return obj.added_by.get_full_name() or obj.added_by.username
        return None

    def get_outward_no(self, obj):
        return obj.outward.outward_no if obj.outward else None


class AssessmentOutwardDetailsSerializer(serializers.ModelSerializer):
    entry_detail = AssessmentEntrySerializer(source="entry", read_only=True)
    received_by_name = serializers.SerializerMethodField(read_only=True)

    class Meta:
        model = AssessmentOutwardDetails
        fields = "__all__"

    def get_received_by_name(self, obj):
        if obj.received_by:
            return obj.received_by.get_full_name() or obj.received_by.username
        return None


class AssessmentOutwardSerializer(serializers.ModelSerializer):
    details = AssessmentOutwardDetailsSerializer(many=True, read_only=True)
    generated_by_name = serializers.SerializerMethodField(read_only=True)
    receiver_name = serializers.SerializerMethodField(read_only=True)
    total_entries = serializers.SerializerMethodField(read_only=True)
    received_count = serializers.SerializerMethodField(read_only=True)

    class Meta:
        model = AssessmentOutward
        fields = "__all__"

    def get_generated_by_name(self, obj):
        if obj.generated_by:
            return obj.generated_by.get_full_name() or obj.generated_by.username
        return None

    def get_receiver_name(self, obj):
        if obj.receiver_user:
            return obj.receiver_user.get_full_name() or obj.receiver_user.username
        return None

    def get_total_entries(self, obj):
        return obj.details.count()

    def get_received_count(self, obj):
        return obj.details.filter(receive_status="Received").count()
