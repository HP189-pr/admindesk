from rest_framework import serializers
from .domain_cctv import (
    CCTVExam,
    CCTVCentreEntry,
    CCTVDVD,
    CCTVOutward
)


class CCTVExamSerializer(serializers.ModelSerializer):
    class Meta:
        model = CCTVExam
        fields = "__all__"


class CCTVCentreEntrySerializer(serializers.ModelSerializer):
    class Meta:
        model = CCTVCentreEntry
        fields = "__all__"
        read_only_fields = (
            "start_number",
            "end_number",
            "start_label",
            "end_label",
            "cc_total",
            "cc_start_label",
            "cc_end_label",
        )


class CCTVDVDSerializer(serializers.ModelSerializer):
    class Meta:
        model = CCTVDVD
        fields = "__all__"


class CCTVOutwardSerializer(serializers.ModelSerializer):
    class Meta:
        model = CCTVOutward
        fields = "__all__"

    def validate(self, data):
        if data.get("case_found") is False:
            data["case_type"] = None
            data["case_details"] = ""
        return data
