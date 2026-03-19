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
    detail_id = serializers.SerializerMethodField(read_only=True)
    receive_status = serializers.SerializerMethodField(read_only=True)
    return_status = serializers.SerializerMethodField(read_only=True)
    return_remark = serializers.SerializerMethodField(read_only=True)
    return_outward_no = serializers.SerializerMethodField(read_only=True)
    returned_by_name = serializers.SerializerMethodField(read_only=True)
    returned_date = serializers.SerializerMethodField(read_only=True)
    final_receive_status = serializers.SerializerMethodField(read_only=True)
    final_receive_remark = serializers.SerializerMethodField(read_only=True)
    final_received_by_name = serializers.SerializerMethodField(read_only=True)
    final_received_date = serializers.SerializerMethodField(read_only=True)

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

    def _get_detail(self, obj):
        if hasattr(obj, "_cached_outward_detail"):
            return obj._cached_outward_detail
        details = getattr(obj, "outward_details", None)
        if details is None:
            return None
        if hasattr(details, "all"):
            detail = details.all().order_by("-id").first()
            obj._cached_outward_detail = detail
            return detail
        return None

    def get_detail_id(self, obj):
        detail = self._get_detail(obj)
        return detail.id if detail else None

    def get_receive_status(self, obj):
        detail = self._get_detail(obj)
        return detail.receive_status if detail else None

    def get_return_status(self, obj):
        detail = self._get_detail(obj)
        return detail.return_status if detail else None

    def get_return_remark(self, obj):
        detail = self._get_detail(obj)
        return detail.return_remark if detail else ""

    def get_return_outward_no(self, obj):
        detail = self._get_detail(obj)
        return detail.return_outward_no if detail else ""

    def get_returned_by_name(self, obj):
        detail = self._get_detail(obj)
        if detail and detail.returned_by:
            return detail.returned_by.get_full_name() or detail.returned_by.username
        return None

    def get_returned_date(self, obj):
        detail = self._get_detail(obj)
        return detail.returned_date if detail else None

    def get_final_receive_status(self, obj):
        detail = self._get_detail(obj)
        return detail.final_receive_status if detail else None

    def get_final_receive_remark(self, obj):
        detail = self._get_detail(obj)
        return detail.final_receive_remark if detail else ""

    def get_final_received_by_name(self, obj):
        detail = self._get_detail(obj)
        if detail and detail.final_received_by:
            return detail.final_received_by.get_full_name() or detail.final_received_by.username
        return None

    def get_final_received_date(self, obj):
        detail = self._get_detail(obj)
        return detail.final_received_date if detail else None


class AssessmentOutwardDetailsSerializer(serializers.ModelSerializer):
    entry_detail = AssessmentEntrySerializer(source="entry", read_only=True)
    received_by_name = serializers.SerializerMethodField(read_only=True)
    returned_by_name = serializers.SerializerMethodField(read_only=True)
    final_received_by_name = serializers.SerializerMethodField(read_only=True)

    class Meta:
        model = AssessmentOutwardDetails
        fields = "__all__"

    def get_received_by_name(self, obj):
        if obj.received_by:
            return obj.received_by.get_full_name() or obj.received_by.username
        return None

    def get_returned_by_name(self, obj):
        if obj.returned_by:
            return obj.returned_by.get_full_name() or obj.returned_by.username
        return None

    def get_final_received_by_name(self, obj):
        if obj.final_received_by:
            return obj.final_received_by.get_full_name() or obj.final_received_by.username
        return None


class AssessmentOutwardSerializer(serializers.ModelSerializer):
    details = AssessmentOutwardDetailsSerializer(many=True, read_only=True)
    generated_by_name = serializers.SerializerMethodField(read_only=True)
    receiver_name = serializers.SerializerMethodField(read_only=True)
    total_entries = serializers.SerializerMethodField(read_only=True)
    received_count = serializers.SerializerMethodField(read_only=True)
    returned_count = serializers.SerializerMethodField(read_only=True)
    final_received_count = serializers.SerializerMethodField(read_only=True)

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

    def get_returned_count(self, obj):
        return obj.details.filter(return_status="Returned").count()

    def get_final_received_count(self, obj):
        return obj.details.filter(final_receive_status="Received").count()
