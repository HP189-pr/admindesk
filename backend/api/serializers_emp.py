from rest_framework import serializers
from .domain_emp import EmpProfile, LeaveType, LeaveEntry

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
