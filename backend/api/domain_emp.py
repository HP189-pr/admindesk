from django.db import models
from django.utils import timezone
from datetime import timedelta
from decimal import Decimal

# -----------------------------------------------------------
# IMPORT HOLIDAY FROM EXISTING MODULE
# -----------------------------------------------------------
# You said Holiday model already exists in domain_core.py
from api.domain_core import Holiday   # <-- your existing Holiday table


# ============================================================
# EMP PROFILE
# ============================================================

class EmpProfile(models.Model):
    emp_id = models.CharField(max_length=20, unique=True)
    emp_name = models.CharField(max_length=100)
    emp_designation = models.CharField(max_length=100, blank=True, null=True)
    left_date = models.DateField(blank=True, null=True)
    leave_group = models.CharField(max_length=20, blank=True, null=True)
    emp_birth_date = models.DateField(blank=True, null=True)

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
    status = models.CharField(max_length=20, default="Active")

    created_at = models.DateTimeField(default=timezone.now)
    updated_at = models.DateTimeField(auto_now=True)
    created_by = models.CharField(max_length=50, blank=True, null=True)

    class Meta:
        db_table = "api_empprofile"
        managed = False

    def __str__(self):
        return f"{self.emp_id} - {self.emp_name}"


# ============================================================
# LEAVE TYPE
# ============================================================

class LeaveType(models.Model):
    id = models.AutoField(primary_key=True)
    leave_code = models.CharField(max_length=20, db_column="leave_code", unique=True)
    leave_name = models.CharField(max_length=100, db_column="leave_name")
    main_type = models.CharField(max_length=10, blank=True, null=True, db_column="parent_leave")
    day_value = models.DecimalField(max_digits=4, decimal_places=2, default=1, db_column="leave_unit")
    session = models.CharField(max_length=10, blank=True, null=True, db_column="leave_mode")
    annual_allocation = models.DecimalField(max_digits=5, decimal_places=2, blank=True, null=True, db_column="annual_limit")
    is_half = models.BooleanField(default=False, db_column="is_half")

    is_active = models.BooleanField(default=True)

    class Meta:
        db_table = "api_leavetype"
        managed = False

    def __str__(self):
        return f"{self.leave_code} - {self.leave_name}"


# ============================================================
# LEAVE ENTRY (with Holiday support)
# ============================================================

class LeaveEntry(models.Model):
    leave_report_no = models.CharField(max_length=20, unique=True, blank=True)

    emp = models.ForeignKey(EmpProfile, to_field="emp_id", db_column="emp_id", on_delete=models.CASCADE)
    leave_type = models.ForeignKey(LeaveType, to_field="leave_code", db_column="leave_code", on_delete=models.CASCADE)

    start_date = models.DateField()
    end_date = models.DateField()

    total_days = models.DecimalField(max_digits=6, decimal_places=2, blank=True, null=True)
    reason = models.TextField(blank=True, null=True)

    STATUS_APPROVED = "Approved"
    STATUS_PENDING = "Pending"
    STATUS_CANCEL = "Cancel"
    STATUS_CHOICES = (
        (STATUS_APPROVED, "Approved"),
        (STATUS_PENDING, "Pending"),
        (STATUS_CANCEL, "Cancel"),
    )
    status = models.CharField(max_length=20, choices=STATUS_CHOICES, default=STATUS_PENDING)

    report_date = models.DateField(blank=True, null=True)
    leave_remark = models.CharField(max_length=100, blank=True, null=True)

    sandwich_leave = models.BooleanField(null=True, blank=True, db_column="sandwich_leave")

    created_by = models.CharField(max_length=50, blank=True, null=True)
    created_at = models.DateTimeField(default=timezone.now)
    approved_by = models.CharField(max_length=50, blank=True, null=True)
    approved_at = models.DateTimeField(blank=True, null=True)

    class Meta:
        db_table = "api_leaveentry"
        managed = False

    # ----------------------------------------------
    # WORKING DAY CALCULATION (Sunday + Holiday excluded)
    # ----------------------------------------------
    def _working_days(self):
        holidays = set(
            Holiday.objects.filter(
                holiday_date__gte=self.start_date,
                holiday_date__lte=self.end_date
            ).values_list("holiday_date", flat=True)
        )

        current = self.start_date
        working = 0

        while current <= self.end_date:
            is_sunday = current.weekday() == 6
            is_holiday = current in holidays

            if not is_sunday and not is_holiday:
                working += 1

            current += timedelta(days=1)

        return working

    # ----------------------------------------------
    # DAY VALUE
    # ----------------------------------------------
    def _day_value(self):
        try:
            dv = Decimal(str(self.leave_type.day_value))
        except:
            dv = None

        if self.leave_type.is_half:
            return Decimal("0.5") if dv is None or dv >= 1 else dv

        return dv if dv is not None else Decimal("1")

    # ----------------------------------------------
    # SAVE
    # ----------------------------------------------
    def save(self, *args, **kwargs):

        if not self.leave_report_no:
            year = self.start_date.year
            prefix = str(year)[-2:]
            last = (
                LeaveEntry.objects.filter(leave_report_no__startswith=prefix + "_")
                .order_by("-leave_report_no")
                .first()
            )
            last_num = 0
            if last:
                try:
                    last_num = int(last.leave_report_no.split("_")[-1])
                except:
                    last_num = 0

            self.leave_report_no = f"{prefix}_{last_num + 1:04d}"

        # TOTAL DAYS
        if self.start_date and self.end_date:

            if self.sandwich_leave:
                delta = (self.end_date - self.start_date).days + 1
                base = Decimal(delta)
            else:
                base = Decimal(self._working_days())

            self.total_days = base * self._day_value()

        super().save(*args, **kwargs)

    @property
    def emp_name(self):
        try:
            return self.emp.emp_name
        except:
            return None

    def __str__(self):
        return f"{self.leave_report_no} - {self.emp_name} ({self.leave_type.leave_name})"


# ============================================================
# LEAVE PERIOD
# ============================================================

class LeavePeriod(models.Model):
    period_name = models.CharField(max_length=50)
    start_date = models.DateField()
    end_date = models.DateField()
    description = models.TextField(blank=True, null=True)

    created_at = models.DateTimeField(default=timezone.now)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        db_table = "api_leaveperiod"
        managed = False

    def __str__(self):
        return f"{self.period_name} ({self.start_date} - {self.end_date})"


# ============================================================
# LEAVE ALLOCATION
# ============================================================

class LeaveAllocation(models.Model):
    APPLY_CHOICES = (
        ("All", "All Employees"),
        ("Particular", "Particular Employee"),
    )

    leave_code = models.CharField(max_length=20, db_column="leave_code")

    period = models.ForeignKey(
        LeavePeriod,
        on_delete=models.CASCADE,
        related_name="allocations",
    )

    apply_to = models.CharField(max_length=20, choices=APPLY_CHOICES, default="All", db_column="apply_to")

    emp = models.ForeignKey(
        EmpProfile,
        to_field="emp_id",
        db_column="emp_id",
        on_delete=models.CASCADE,
        null=True,
        blank=True,
        related_name="specific_allocations",
    )

    allocated = models.DecimalField(max_digits=6, decimal_places=2, default=0)

    allocated_start_date = models.DateField(null=True, blank=True)
    allocated_end_date = models.DateField(null=True, blank=True)

    created_at = models.DateTimeField(default=timezone.now)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        db_table = "api_leaveallocation"
        managed = False
        unique_together = ("leave_code", "period", "emp")

    def save(self, *args, **kwargs):
        if str(self.apply_to).upper() == "ALL":
            self.emp = None
        super().save(*args, **kwargs)

    def get_leave_type(self):
        try:
            return LeaveType.objects.get(leave_code=self.leave_code)
        except LeaveType.DoesNotExist:
            return None

    def used_days(self, emp_profile=None):
        """
        Deprecated. Use leave_engine instead.
        """
        return 0.0

    def balance(self, emp_profile=None):
        """
        Deprecated. Use leave_engine instead.
        """
        return 0.0

    def __str__(self):
        target = "ALL" if self.emp is None else self.emp
        return f"{self.leave_code} - {self.period.period_name} -> {target}"
