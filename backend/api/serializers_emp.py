from rest_framework import serializers
from decimal import Decimal
from .domain_emp import EmpProfile, LeaveType, LeaveEntry
from .domain_emp import LeavePeriod, LeaveAllocation


def _format_decimal_for_json(value):
	"""Return an int when the decimal has no fractional part, otherwise a float.

	This ensures clients see 17 instead of 17.0 while preserving non-integer
	decimals as numbers.
	"""
	if value is None:
		return None
	try:
		d = value if isinstance(value, Decimal) else Decimal(str(value))
	except Exception:
		try:
			f = float(value)
			return int(f) if float(f).is_integer() else f
		except Exception:
			return value
	# if integral, return int
	if d == d.to_integral():
		return int(d)
	# otherwise return a float without unnecessary trailing zeros
	# normalize() may produce exponent form; convert to float
	return float(d.normalize())


class EmpProfileSerializer(serializers.ModelSerializer):
	# Override numeric/date representations to match consumer expectations
	el_balance = serializers.SerializerMethodField()
	sl_balance = serializers.SerializerMethodField()
	cl_balance = serializers.SerializerMethodField()
	vacation_balance = serializers.SerializerMethodField()
	joining_year_allocation_el = serializers.SerializerMethodField()
	joining_year_allocation_cl = serializers.SerializerMethodField()
	joining_year_allocation_sl = serializers.SerializerMethodField()
	joining_year_allocation_vac = serializers.SerializerMethodField()

	# Format date fields as dd-mm-yyyy for frontend display
	actual_joining = serializers.DateField(format='%d-%m-%Y', allow_null=True)
	emp_birth_date = serializers.DateField(format='%d-%m-%Y', allow_null=True)
	usr_birth_date = serializers.DateField(format='%d-%m-%Y', allow_null=True)
	leave_calculation_date = serializers.DateField(format='%d-%m-%Y', allow_null=True)
	left_date = serializers.DateField(format='%d-%m-%Y', allow_null=True)

	def get_el_balance(self, obj):
		return _format_decimal_for_json(getattr(obj, 'el_balance', None))

	def get_sl_balance(self, obj):
		return _format_decimal_for_json(getattr(obj, 'sl_balance', None))

	def get_cl_balance(self, obj):
		return _format_decimal_for_json(getattr(obj, 'cl_balance', None))

	def get_vacation_balance(self, obj):
		return _format_decimal_for_json(getattr(obj, 'vacation_balance', None))

	def get_joining_year_allocation_el(self, obj):
		return _format_decimal_for_json(getattr(obj, 'joining_year_allocation_el', None))

	def get_joining_year_allocation_cl(self, obj):
		return _format_decimal_for_json(getattr(obj, 'joining_year_allocation_cl', None))

	def get_joining_year_allocation_sl(self, obj):
		return _format_decimal_for_json(getattr(obj, 'joining_year_allocation_sl', None))

	def get_joining_year_allocation_vac(self, obj):
		return _format_decimal_for_json(getattr(obj, 'joining_year_allocation_vac', None))

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
	allocated = serializers.SerializerMethodField()

	class Meta:
		model = LeaveAllocation
		fields = ('id', 'profile', 'leave_type', 'leave_type_name', 'period', 'allocated', 'used', 'balance')

	def get_used(self, obj):
		# used_days returns a float; if it's integral convert to int
		return int(obj.used_days()) if float(obj.used_days()).is_integer() else float(obj.used_days())

	def get_balance(self, obj):
		b = obj.balance
		return int(b) if float(b).is_integer() else float(b)

	def get_allocated(self, obj):
		return _format_decimal_for_json(getattr(obj, 'allocated', None))


class LeaveBalanceSnapshotSerializer(serializers.ModelSerializer):
	balance_date = serializers.DateField(format='%d-%m-%Y')
	el_balance = serializers.SerializerMethodField()
	sl_balance = serializers.SerializerMethodField()
	cl_balance = serializers.SerializerMethodField()
	vacation_balance = serializers.SerializerMethodField()

	class Meta:
		from .domain_emp import LeaveBalanceSnapshot
		model = LeaveBalanceSnapshot
		fields = ('id', 'profile', 'balance_date', 'el_balance', 'sl_balance', 'cl_balance', 'vacation_balance', 'note')

	def get_el_balance(self, obj):
		return _format_decimal_for_json(getattr(obj, 'el_balance', None))

	def get_sl_balance(self, obj):
		return _format_decimal_for_json(getattr(obj, 'sl_balance', None))

	def get_cl_balance(self, obj):
		return _format_decimal_for_json(getattr(obj, 'cl_balance', None))

	def get_vacation_balance(self, obj):
		return _format_decimal_for_json(getattr(obj, 'vacation_balance', None))
