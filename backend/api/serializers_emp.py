from rest_framework import serializers
from .domain_emp import EmpProfile, LeaveType, LeaveEntry
from .domain_emp import LeavePeriod, LeaveAllocation

class EmpProfileSerializer(serializers.ModelSerializer):
	class Meta:
		model = EmpProfile
		fields = '__all__'

class LeaveTypeSerializer(serializers.ModelSerializer):
	class Meta:
		model = LeaveType
		fields = '__all__'

class LeaveEntrySerializer(serializers.ModelSerializer):
	emp_name = serializers.CharField(source='emp.emp_name', read_only=True)
	leave_type_name = serializers.CharField(source='leave_type.leave_name', read_only=True)

	class Meta:
		model = LeaveEntry
		fields = '__all__'
		read_only_fields = ('leave_report_no', 'total_days', 'emp_name', 'leave_type_name')


class LeavePeriodSerializer(serializers.ModelSerializer):
	class Meta:
		model = LeavePeriod
		fields = '__all__'


class LeaveAllocationSerializer(serializers.ModelSerializer):
	leave_type_name = serializers.CharField(source='leave_type.leave_name', read_only=True)
	used = serializers.SerializerMethodField()
	balance = serializers.SerializerMethodField()

	class Meta:
		model = LeaveAllocation
		fields = ('id', 'profile', 'leave_type', 'leave_type_name', 'period', 'allocated', 'used', 'balance')

	def get_used(self, obj):
		return obj.used_days()

	def get_balance(self, obj):
		return obj.balance


class LeaveBalanceSnapshotSerializer(serializers.ModelSerializer):
	class Meta:
		from .domain_emp import LeaveBalanceSnapshot
		model = LeaveBalanceSnapshot
		fields = ('id', 'profile', 'balance_date', 'el_balance', 'sl_balance', 'cl_balance', 'vacation_balance', 'note')
