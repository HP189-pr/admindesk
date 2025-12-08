import datetime
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
	leave_type_name = serializers.SerializerMethodField()
	used = serializers.SerializerMethodField()
	balance = serializers.SerializerMethodField()
	emp_id = serializers.SerializerMethodField()
	period_id = serializers.SerializerMethodField()
	allocated_start_date = serializers.SerializerMethodField()
	allocated_end_date = serializers.SerializerMethodField()
	leave_code = serializers.SerializerMethodField()
	profile_name = serializers.SerializerMethodField()
	sandwich = serializers.SerializerMethodField()

	class Meta:
		model = LeaveAllocation
		fields = ('id', 'emp_id', 'profile', 'profile_name', 'leave_type', 'leave_type_name', 'leave_code', 'period', 'period_id', 'allocated',
				  'allocated_start_date', 'allocated_end_date',
			  'used', 'balance', 'sandwich')
		read_only_fields = fields

	def _format_date(self, value):
		if not value:
			return None
		try:
			if isinstance(value, str):
				if not value.strip():
					return None
				for fmt in ('%Y-%m-%d', '%d-%m-%Y', '%d/%m/%Y', '%Y/%m/%d'):
					try:
						return datetime.datetime.strptime(value.strip(), fmt).strftime('%d-%m-%Y')
					except Exception:
						continue
				return value
			return value.strftime('%d-%m-%Y')
		except Exception:
			return None

	def get_used(self, obj):
		# used_days may depend on related fields (leave_type, period). Be defensive
		# and return 0 when computation fails or related objects are missing.
		try:
			val = obj.used_days()
			if val is None:
				return 0
			return int(val) if float(val).is_integer() else float(val)
		except Exception:
			return 0

	def get_balance(self, obj):
		# balance may depend on used_days which can raise when related objects
		# are missing; be defensive and return 0 on error.
		try:
			b = obj.balance
			if b is None:
				return 0
			return int(b) if float(b).is_integer() else float(b)
		except Exception:
			return 0

	def get_emp_id(self, obj):
		# Normalize emp identifier: prefer raw stored profile_id (which maps to EmpProfile.emp_id),
		# fall back to any direct emp_id attribute. Return None when empty.
		emp_id = getattr(obj, 'profile_id', None) or getattr(obj, 'emp_id', None)
		if emp_id in (None, ''):
			return None
		return emp_id

	def get_period_id(self, obj):
		try:
			return getattr(obj, 'period_id', None)
		except Exception:
			return None

	def get_profile_name(self, obj):
		try:
			emp_id = getattr(obj, 'profile_id', None)
			if emp_id in (None, ''):
				emp_id = getattr(obj, 'emp_id', None)
			if not emp_id:
				return 'All'
			cache = self.context.setdefault('_profile_name_cache', {})
			if emp_id in cache:
				return cache[emp_id]
			profile = EmpProfile.objects.filter(emp_id=emp_id).only('emp_name').first()
			name = getattr(profile, 'emp_name', None) if profile else None
			cache[emp_id] = name
			return name
		except Exception:
			return None

	def get_leave_type_name(self, obj):
		try:
			lt = getattr(obj, 'leave_type', None)
			if lt:
				return getattr(lt, 'leave_name', None)
			return None
		except Exception:
			return None

	def get_allocated_start_date(self, obj):
		val = getattr(obj, 'allocated_start_date', None) or getattr(obj, 'allocation_start_date', None)
		return self._format_date(val)

	def get_allocated_end_date(self, obj):
		val = getattr(obj, 'allocated_end_date', None) or getattr(obj, 'allocation_end_date', None)
		return self._format_date(val)

	def get_leave_code(self, obj):
		# The raw DB column for the FK is accessible as `leave_type_id` (it stores
		# the leave_code when set). If the related object is present, prefer the
		# related object's leave_code.
		try:
			if getattr(obj, 'leave_type', None):
				return getattr(obj.leave_type, 'leave_code', None)
			# fallback to raw stored value or explicit leave_code column
			return getattr(obj, 'leave_type_id', None) or getattr(obj, 'leave_code', None)
		except Exception:
			return None

	def get_sandwich(self, obj):
		try:
			# return boolean if available, otherwise default False
			return bool(getattr(obj, 'sandwich', False))
		except Exception:
			return False


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
