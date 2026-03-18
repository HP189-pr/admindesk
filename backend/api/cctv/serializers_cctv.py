from rest_framework import serializers
from .domain_cctv import (
    CCTVExam,
    CCTVCentreEntry,
    CCTVDVD,
    CCTVOutward,
    CCTVCopyCase,
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
        case_found = data.get("case_found")
        if case_found is None and self.instance is not None:
            case_found = self.instance.case_found

        return_received = data.get("return_received")
        if return_received is None and self.instance is not None:
            return_received = self.instance.return_received

        if case_found is False:
            data["case_type"] = None
            data["case_details"] = ""
            data["course"] = ""
            data["semester"] = ""

        if return_received is False:
            data["receive_date"] = None

        return data


class CCTVCopyCaseSerializer(serializers.ModelSerializer):
    outward_record_no = serializers.CharField(source="outward.cctv_record_no", read_only=True)
    outward_no = serializers.CharField(source="outward.outward_no", read_only=True)

    class Meta:
        model = CCTVCopyCase
        fields = "__all__"

    def validate_no_of_student(self, value):
        if value is None:
            return 0
        if value < 0:
            raise serializers.ValidationError("No of student cannot be negative.")
        return value

    def validate(self, data):
        outward = data.get("outward") or getattr(self.instance, "outward", None)
        if outward is not None and not outward.case_found:
            raise serializers.ValidationError(
                {"outward": "Copy case report is allowed only when Case Found is Yes."}
            )
        return data
