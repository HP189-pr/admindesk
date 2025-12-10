import datetime
from rest_framework import serializers
from decimal import Decimal
from .domain_emp import (
    EmpProfile,
    LeaveType,
    LeaveEntry,
    LeavePeriod,
    LeaveAllocation,
)

# -----------------------------------------------------------
# DECIMAL FORMATTER (USED EVERYWHERE)
# -----------------------------------------------------------

def _format_decimal_for_json(value):
    """Return int if value is whole number, else float."""
    if value is None:
        return None

    try:
        d = Decimal(str(value))
    except Exception:
        try:
            f = float(value)
            return int(f) if f.is_integer() else f
        except Exception:
            return value

    if d == d.to_integral():
        return int(d)

    return float(d.normalize())


# ============================================================
# EMP PROFILE SERIALIZER
# ============================================================

class EmpProfileSerializer(serializers.ModelSerializer):
    # Format numeric fields
    el_balance = serializers.SerializerMethodField()
    sl_balance = serializers.SerializerMethodField()
    cl_balance = serializers.SerializerMethodField()
    vacation_balance = serializers.SerializerMethodField()

    joining_year_allocation_el = serializers.SerializerMethodField()
    joining_year_allocation_cl = serializers.SerializerMethodField()
    joining_year_allocation_sl = serializers.SerializerMethodField()
    joining_year_allocation_vac = serializers.SerializerMethodField()

    # Dates formatted for UI
    actual_joining = serializers.DateField(format='%d-%m-%Y', allow_null=True)
    emp_birth_date = serializers.DateField(format='%d-%m-%Y', allow_null=True)
    usr_birth_date = serializers.DateField(format='%d-%m-%Y', allow_null=True)
    leave_calculation_date = serializers.DateField(format='%d-%m-%Y', allow_null=True)
    left_date = serializers.DateField(format='%d-%m-%Y', allow_null=True)

    class Meta:
        model = EmpProfile
        fields = "__all__"

    def get_el_balance(self, obj): return _format_decimal_for_json(obj.el_balance)
    def get_sl_balance(self, obj): return _format_decimal_for_json(obj.sl_balance)
    def get_cl_balance(self, obj): return _format_decimal_for_json(obj.cl_balance)
    def get_vacation_balance(self, obj): return _format_decimal_for_json(obj.vacation_balance)

    def get_joining_year_allocation_el(self, obj): return _format_decimal_for_json(obj.joining_year_allocation_el)
    def get_joining_year_allocation_cl(self, obj): return _format_decimal_for_json(obj.joining_year_allocation_cl)
    def get_joining_year_allocation_sl(self, obj): return _format_decimal_for_json(obj.joining_year_allocation_sl)
    def get_joining_year_allocation_vac(self, obj): return _format_decimal_for_json(obj.joining_year_allocation_vac)



# ============================================================
# LEAVE TYPE SERIALIZER
# ============================================================

class LeaveTypeSerializer(serializers.ModelSerializer):
    class Meta:
        model = LeaveType
        fields = "__all__"



# ============================================================
# LEAVE ENTRY SERIALIZER
# ============================================================

class LeaveEntrySerializer(serializers.ModelSerializer):
    emp_name = serializers.CharField(source="emp.emp_name", read_only=True)
    leave_type_name = serializers.CharField(source="leave_type.leave_name", read_only=True)

    class Meta:
        model = LeaveEntry
        fields = "__all__"
        read_only_fields = (
            "leave_report_no",
            "total_days",
            "emp_name",
            "leave_type_name",
        )



# ============================================================
# LEAVE PERIOD SERIALIZER
# ============================================================

class LeavePeriodSerializer(serializers.ModelSerializer):
    class Meta:
        model = LeavePeriod
        fields = "__all__"



# ============================================================
# LEAVE ALLOCATION SERIALIZER
# ============================================================

class LeaveAllocationSerializer(serializers.ModelSerializer):
    leave_type_name = serializers.SerializerMethodField()
    used = serializers.SerializerMethodField()
    balance = serializers.SerializerMethodField()
    profile_name = serializers.SerializerMethodField()

    emp_id = serializers.SerializerMethodField()
    period_id = serializers.SerializerMethodField()

    allocated_start_date = serializers.SerializerMethodField()
    allocated_end_date = serializers.SerializerMethodField()

    # NEW: For frontend convenience
    apply_to = serializers.CharField(read_only=True)
    leave_code = serializers.CharField(read_only=True)

    class Meta:
        model = LeaveAllocation
        fields = (
            "id",
            "apply_to",
            "leave_code",
            "leave_type_name",
            "emp",
            "emp_id",
            "profile_name",
            "period",
            "period_id",
            "allocated",
            "allocated_start_date",
            "allocated_end_date",
            "used",
            "balance",
            "created_at",
            "updated_at",
        )
        read_only_fields = fields

    # -------------------------------------------------------
    # HELPERS
    # -------------------------------------------------------
    def _fmt_date(self, val):
        if not val:
            return None
        if isinstance(val, str):
            for fmt in ("%Y-%m-%d", "%d-%m-%Y", "%d/%m/%Y"):
                try:
                    return datetime.datetime.strptime(val, fmt).strftime("%d-%m-%Y")
                except:
                    pass
            return val
        return val.strftime("%d-%m-%Y")

    # -------------------------------------------------------
    # FIELD CALCULATIONS
    # -------------------------------------------------------
    def get_emp_id(self, obj):
        return getattr(obj, "emp_id", None)

    def get_period_id(self, obj):
        return getattr(obj, "period_id", None)

    def get_leave_type_name(self, obj):
        lt = obj.get_leave_type()
        return lt.leave_name if lt else None

    def get_profile_name(self, obj):
        if obj.apply_to == "ALL":
            return "All"
        profile = EmpProfile.objects.filter(emp_id=obj.emp_id).first()
        return profile.emp_name if profile else None

    def get_allocated_start_date(self, obj):
        return self._fmt_date(obj.allocated_start_date)

    def get_allocated_end_date(self, obj):
        return self._fmt_date(obj.allocated_end_date)

    def get_used(self, obj):
        try:
            val = obj.used_days()
            return int(val) if float(val).is_integer() else float(val)
        except:
            return 0

    def get_balance(self, obj):
        try:
            val = obj.balance()
            return int(val) if float(val).is_integer() else float(val)
        except:
            return 0
