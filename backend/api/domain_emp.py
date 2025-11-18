from django.db import models
from django.conf import settings
from django.utils import timezone
from decimal import Decimal

class EmpProfile(models.Model):
	emp_id = models.CharField(max_length=20, unique=True)
	emp_name = models.CharField(max_length=100)
	emp_designation = models.CharField(max_length=100, blank=True, null=True)
	left_date = models.DateField(blank=True, null=True)
	leave_group = models.CharField(max_length=20, blank=True, null=True)
	emp_birth_date = models.DateField(blank=True, null=True)

	# mirror field for user's birth date (synchronised with auth_user.usr_birth_date)
	usr_birth_date = models.DateField(blank=True, null=True)

	el_balance = models.DecimalField(max_digits=5, decimal_places=2, default=0)
	sl_balance = models.DecimalField(max_digits=5, decimal_places=2, default=0)
	cl_balance = models.DecimalField(max_digits=5, decimal_places=2, default=0)
	vacation_balance = models.DecimalField(max_digits=5, decimal_places=2, default=0)

	actual_joining = models.DateField(blank=True, null=True)
	department_joining = models.CharField(max_length=100, blank=True, null=True)
	institute_id = models.CharField(max_length=50, blank=True, null=True)

	joining_year_allocation_el = models.DecimalField(max_digits=5, decimal_places=2, default=0)
	joining_year_allocation_cl = models.DecimalField(max_digits=5, decimal_places=2, default=0)
	joining_year_allocation_sl = models.DecimalField(max_digits=5, decimal_places=2, default=0)
	joining_year_allocation_vac = models.DecimalField(max_digits=5, decimal_places=2, default=0)

	leave_calculation_date = models.DateField(blank=True, null=True)
	emp_short = models.IntegerField(blank=True, null=True)
	username = models.CharField(max_length=150, blank=True, null=True, db_index=True)
	usercode = models.CharField(max_length=50, blank=True, null=True, db_index=True)
	status = models.CharField(max_length=20, default='Active')

	created_at = models.DateTimeField(default=timezone.now)
	updated_at = models.DateTimeField(auto_now=True)
	created_by = models.CharField(max_length=50, blank=True, null=True)

	def __str__(self):
		return f"{self.emp_id} - {self.emp_name}"

class LeaveType(models.Model):
	# Existing DB uses a differently-named table/columns (legacy schema).
	# Map fields to the legacy columns and avoid forcing migrations here by setting managed=False.
	id = models.AutoField(primary_key=True)
	leave_code = models.CharField(max_length=20, db_column='leave_code', unique=True)
	leave_name = models.CharField(max_length=100, db_column='leave_name')
	main_type = models.CharField(max_length=10, blank=True, null=True, db_column='parent_leave')
	day_value = models.DecimalField(max_digits=4, decimal_places=2, default=1, db_column='leave_unit')
	session = models.CharField(max_length=10, blank=True, null=True, db_column='leave_mode')
	annual_allocation = models.DecimalField(max_digits=5, decimal_places=2, blank=True, null=True, db_column='annual_limit')
	is_half = models.BooleanField(default=False, db_column='is_half')
	# legacy table doesn't have an 'is_active' column; keep an application-level field but not mapped
	is_active = models.BooleanField(default=True)

	def __str__(self):
		return f"{self.leave_code} - {self.leave_name}"
	class Meta:
		db_table = 'api_leavetype'
		managed = False

class LeaveEntry(models.Model):
	leave_report_no = models.CharField(max_length=20, unique=True, blank=True)
	emp = models.ForeignKey(EmpProfile, to_field='emp_id', db_column='emp_id', on_delete=models.CASCADE)
	leave_type = models.ForeignKey(LeaveType, to_field='leave_code', db_column='leave_code', on_delete=models.CASCADE)
	start_date = models.DateField()
	end_date = models.DateField()
	total_days = models.DecimalField(max_digits=5, decimal_places=2, blank=True, null=True)
	reason = models.TextField(blank=True, null=True)
	# Allowed status values for leave entries. Default is Pending.
	STATUS_APPROVED = 'Approved'
	STATUS_PENDING = 'Pending'
	STATUS_CANCEL = 'Cancel'
	STATUS_CHOICES = (
		(STATUS_APPROVED, 'Approved'),
		(STATUS_PENDING, 'Pending'),
		(STATUS_CANCEL, 'Cancel'),
	)
	status = models.CharField(max_length=20, choices=STATUS_CHOICES, default=STATUS_PENDING)
	# New fields requested: report_date and leave_remark
	report_date = models.DateField(blank=True, null=True)
	leave_remark = models.CharField(max_length=100, blank=True, null=True)
	created_by = models.CharField(max_length=50, blank=True, null=True)
	created_at = models.DateTimeField(default=timezone.now)
	approved_by = models.CharField(max_length=50, blank=True, null=True)
	approved_at = models.DateTimeField(blank=True, null=True)

	def save(self, *args, **kwargs):
		# Auto-generate leave_report_no sequentially per year
		if not self.leave_report_no:
			year = self.start_date.year if self.start_date else timezone.now().year
			prefix = str(year)[-2:]  # e.g. '25' for 2025
			last = LeaveEntry.objects.filter(leave_report_no__startswith=prefix+'_').order_by('-leave_report_no').first()
			if last and last.leave_report_no:
				try:
					last_num = int(last.leave_report_no.split('_')[-1])
				except Exception:
					last_num = 0
			else:
				last_num = 0
			self.leave_report_no = f"{prefix}_{last_num+1:04d}"
		# Auto-calc total_days (respect half-day leave types)
		if self.start_date and self.end_date:
			delta = (self.end_date - self.start_date).days + 1
			# determine effective day value: prefer explicit day_value, but
			# treat is_half types as 0.5 when no smaller day_value provided.
			try:
				lt = self.leave_type if getattr(self, 'leave_type', None) is not None else None
				if lt is None:
					day_value = Decimal('1')
				else:
					raw = getattr(lt, 'day_value', None)
					try:
						dv = Decimal(str(raw)) if raw not in (None, '') else None
					except Exception:
						dv = None
					if bool(getattr(lt, 'is_half', False)):
						if dv is None or dv >= Decimal('1'):
							day_value = Decimal('0.5')
						else:
							day_value = dv
					else:
						day_value = dv if dv is not None else Decimal('1')
			except Exception:
				day_value = Decimal('1')
			self.total_days = Decimal(delta) * Decimal(str(day_value))
		# Ensure emp_name mirrors the referenced EmpProfile (auto-update)
		try:
			if hasattr(self, 'emp') and getattr(self, 'emp') is not None:
				# emp is a FK to EmpProfile (to_field='emp_id')
				self.emp_name = getattr(self.emp, 'emp_name', None)
		except Exception:
			# don't block save for any unexpected FK resolution errors
			pass
		super().save(*args, **kwargs)

	# Provide a non-persistent property so admin/list_display and other
	# inspectors can resolve `emp_name` even if the DB does not have a
	# dedicated column. This avoids the admin.E108 system check error.
	@property
	def emp_name(self):
		try:
			return getattr(self.emp, 'emp_name', None)
		except Exception:
			return None

	def __str__(self):
		# leave_type may be a FK or a plain code depending on legacy schema
		try:
			lt_name = self.leave_type.leave_name
		except Exception:
			lt_name = getattr(self, 'leave_type', None)
		return f"{self.leave_report_no} - {self.emp.emp_name} ({lt_name})"

	class Meta:
		db_table = 'api_leaveentry'
		managed = False


class LeavePeriod(models.Model):
	period_name = models.CharField(max_length=50)
	start_date = models.DateField()
	end_date = models.DateField()
	description = models.TextField(blank=True, null=True)
	is_active = models.BooleanField(default=True)
	created_at = models.DateTimeField(default=timezone.now)
	updated_at = models.DateTimeField(auto_now=True)

	def __str__(self):
		return f"{self.period_name} ({self.start_date} - {self.end_date})"
	class Meta:
		db_table = 'api_leaveperiod'
		managed = False


class LeaveAllocation(models.Model):
	# Legacy schema stores the FK as `emp_id` referencing EmpProfile.emp_id (not the PK).
	# Map the Django FK accordingly so queries hit the correct column (no migrations).
	profile = models.ForeignKey(
		EmpProfile,
		to_field='emp_id',
		db_column='emp_id',
		on_delete=models.CASCADE,
		related_name='leave_allocations',
		null=True,
		blank=True,
	)
	leave_type = models.ForeignKey(
		LeaveType,
		to_field='leave_code',
		db_column='leave_code',
		on_delete=models.PROTECT,
		related_name='allocations',
		null=True,
		blank=True,
	)
	period = models.ForeignKey(LeavePeriod, on_delete=models.CASCADE, related_name='allocations')
	allocated = models.DecimalField(max_digits=6, decimal_places=2, default=0)

	# Legacy per-type allocation columns present in some installations.
	# Map them here (managed=False on the model ensures no migrations).
	allocated_el = models.DecimalField(max_digits=6, decimal_places=2, null=True, blank=True, db_column='allocated_el')
	allocated_cl = models.DecimalField(max_digits=6, decimal_places=2, null=True, blank=True, db_column='allocated_cl')
	allocated_sl = models.DecimalField(max_digits=6, decimal_places=2, null=True, blank=True, db_column='allocated_sl')
	allocated_vac = models.DecimalField(max_digits=6, decimal_places=2, null=True, blank=True, db_column='allocated_vac')
	allocated_start_date = models.DateField(null=True, blank=True, db_column='allocated_start_date')
	allocated_end_date = models.DateField(null=True, blank=True, db_column='allocated_end_date')
	# Note: do NOT declare a separate `leave_code` model field because the
	# foreign key `leave_type` already maps to the DB column `leave_code` via
	# `db_column='leave_code'`. Access the raw stored value using
	# `instance.leave_type_id` (it contains the leave_code value when present).
	created_at = models.DateTimeField(default=timezone.now)
	updated_at = models.DateTimeField(auto_now=True)

	class Meta:
		unique_together = ('profile', 'leave_type', 'period')
		db_table = 'api_leaveallocation'
		managed = False

	def used_days(self):
		# Calculate used days for this allocation by summing overlap of approved leave entries
		entries = LeaveEntry.objects.filter(
			emp=self.profile,
			leave_type=self.leave_type,
			status__iexact='Approved',
			end_date__gte=self.period.start_date,
			start_date__lte=self.period.end_date,
		)
		total = 0.0
		for e in entries:
			# compute overlap days between entry and period
			start = max(e.start_date, self.period.start_date)
			end = min(e.end_date, self.period.end_date)
			if end >= start:
				overlap_days = (end - start).days + 1
				# account for leave type day_value (half-day support)
				try:
					lt = e.leave_type if getattr(e, 'leave_type', None) is not None else None
					if lt is None:
						dv = Decimal('1')
					else:
						raw = getattr(lt, 'day_value', None)
						try:
							dv = Decimal(str(raw)) if raw not in (None, '') else None
						except Exception:
							dv = None
						is_half = bool(getattr(lt, 'is_half', False))
						if is_half:
							if dv is None or dv >= Decimal('1'):
								dv = Decimal('0.5')
						else:
							if dv is None:
								dv = Decimal('1')
				except Exception:
					dv = Decimal('1')
				total += float(Decimal(overlap_days) * dv)
		return float(total)

	@property
	def balance(self):
		return float(self.allocated) - self.used_days()

	def __str__(self):
		return f"{self.profile} - {self.leave_type} ({self.period.period_name})"

	# (Meta declared above to avoid duplicate definitions)


# Auto-seed allocations when a LeavePeriod becomes active
from django.db.models.signals import post_save
from django.dispatch import receiver


@receiver(post_save, sender=LeavePeriod)
def seed_allocations_for_period(sender, instance: LeavePeriod, created, **kwargs):
	# only seed when a period is active
	if not instance.is_active:
		return
	from .domain_emp import LeaveAllocation, LeaveType, EmpProfile
	types = LeaveType.objects.filter(is_active=True)
	profiles = EmpProfile.objects.all()
	for p in profiles:
		for lt in types:
			if not LeaveAllocation.objects.filter(profile=p, leave_type=lt, period=instance).exists():
				try:
					LeaveAllocation.objects.create(profile=p, leave_type=lt, period=instance, allocated=(lt.annual_allocation or 0))
				except Exception:
					# ignore creation errors to avoid breaking admin save
					continue
#employee table, leave table, leavetype table 


class LeaveBalanceSnapshot(models.Model):
	"""
	A snapshot of an employee's previous balances taken at a specific date.
	This is used to record 'previous balance on particular date' that the user described.
	Fields store balances for the common leave types present on EmpProfile.
	"""
	profile = models.ForeignKey(
		EmpProfile,
		db_column='emp_id',
		on_delete=models.CASCADE,
		related_name='balance_snapshots',
	)
	balance_date = models.DateField()
	el_balance = models.DecimalField(max_digits=6, decimal_places=2, default=0)
	sl_balance = models.DecimalField(max_digits=6, decimal_places=2, default=0)
	cl_balance = models.DecimalField(max_digits=6, decimal_places=2, default=0)
	vacation_balance = models.DecimalField(max_digits=6, decimal_places=2, default=0)
	note = models.TextField(blank=True, null=True)
	created_at = models.DateTimeField(default=timezone.now)

	class Meta:
		unique_together = ('profile', 'balance_date')
		db_table = 'api_leavebalancesnapshot'
		managed = False

	def __str__(self):
		return f"Snapshot {self.profile.emp_id} @ {self.balance_date}"


@receiver(post_save, sender=EmpProfile)
def _empprofile_changed(sender, instance, **kwargs):
	"""When an employee profile changes (joining/left/allocations), enqueue recompute
	for periods that may be affected by the employee's joining/left dates.
	"""
	try:
		eff = getattr(instance, 'actual_joining', None) or getattr(instance, 'leave_calculation_date', None)
		left = getattr(instance, 'left_date', None)
		from .domain_emp import LeavePeriod
		periods = LeavePeriod.objects.all().order_by('start_date')
		affected = []
		for p in periods:
			# if left before period start => still enqueue that period to clear allocations
			if left and left < p.start_date:
				affected.append(p.id)
			# if effective join exists and period.end >= eff then affected
			elif eff and p.end_date >= eff:
				affected.append(p.id)
		_enqueue_periods(affected)
	except Exception:
		import traceback
		print('[WARN] _empprofile_changed handler failed:')
		traceback.print_exc()


# When related data changes we enqueue a recompute task for the affected period(s).
from django.db.models.signals import post_save, post_delete


def _enqueue_periods(period_ids):
	try:
		# import lazily to avoid circular imports
		from .snapshot_queue import enqueue_recompute_task
		# dedupe
		seen = set()
		for pid in (period_ids or []):
			if pid and pid not in seen:
				enqueue_recompute_task(pid)
				seen.add(pid)
	except Exception:
		import traceback
		print('[WARN] failed to enqueue snapshot recompute task')
		traceback.print_exc()


@receiver(post_save, sender=LeaveEntry)
@receiver(post_delete, sender=LeaveEntry)
def _leaveentry_changed(sender, instance, **kwargs):
	"""When a leave entry changes, recompute snapshots for affected periods.

	We recompute snapshots for any period that overlaps the entry's date range
	and for subsequent periods to ensure carry-forward correctness.
	"""
	try:
		start = getattr(instance, 'start_date', None)
		end = getattr(instance, 'end_date', None)
		if not start or not end:
			return
		from .domain_emp import LeavePeriod, EmpProfile
		# find periods that may be impacted (those with end >= start)
		periods = LeavePeriod.objects.filter(end_date__gte=start).order_by('start_date')
		profile = None
		try:
			profile = instance.emp if hasattr(instance, 'emp') else None
			if not profile:
				# try lookup by emp_id field
				pid = getattr(instance, 'emp_id', None)
				if pid:
					profile = EmpProfile.objects.filter(emp_id=str(pid)).first()
		except Exception:
			profile = None
		if not profile:
			return
		# enqueue recompute for all affected periods up to entry end
		affected = []
		for p in periods:
			if p.start_date > end:
				break
			affected.append(p.id)
		_enqueue_periods(affected)
	except Exception:
		import traceback
		print("[WARN] _leaveentry_changed handler failed:")
		traceback.print_exc()


@receiver(post_save, sender=LeaveAllocation)
@receiver(post_delete, sender=LeaveAllocation)
def _leaveallocation_changed(sender, instance, **kwargs):
	"""Recompute snapshots when allocations change.

	If the allocation is profile-specific, only that profile is updated; for
	global allocations (profile is NULL) all profiles for the period are
	updated.
	"""
	try:
		period = getattr(instance, 'period', None)
		if not period:
			# try period_id
			pid = getattr(instance, 'period_id', None)
			if pid:
				from .domain_emp import LeavePeriod
				period = LeavePeriod.objects.filter(id=pid).first()
		if not period:
			return
		from .domain_emp import EmpProfile
		# enqueue recompute for the period - worker will compute for all employees
		_enqueue_periods([period.id])
	except Exception:
		import traceback
		print("[WARN] _leaveallocation_changed handler failed:")
		traceback.print_exc()