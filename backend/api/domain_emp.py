from django.db import models
from django.conf import settings
from django.utils import timezone

class EmpProfile(models.Model):
	emp_id = models.CharField(max_length=20, unique=True)
	emp_name = models.CharField(max_length=100)
	emp_designation = models.CharField(max_length=100, blank=True, null=True)
	left_date = models.DateField(blank=True, null=True)
	leave_group = models.CharField(max_length=20, blank=True, null=True)
	emp_birth_date = models.DateField(blank=True, null=True)

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
	userid = models.CharField(max_length=50, blank=True, null=True)
	status = models.CharField(max_length=20, default='Active')

	created_at = models.DateTimeField(default=timezone.now)
	updated_at = models.DateTimeField(auto_now=True)
	created_by = models.CharField(max_length=50, blank=True, null=True)

	def __str__(self):
		return f"{self.emp_id} - {self.emp_name}"

class LeaveType(models.Model):
	leave_code = models.CharField(max_length=20, primary_key=True)
	leave_name = models.CharField(max_length=100)
	main_type = models.CharField(max_length=10, blank=True, null=True)
	day_value = models.DecimalField(max_digits=4, decimal_places=2, default=1)
	session = models.CharField(max_length=10, blank=True, null=True)
	annual_allocation = models.DecimalField(max_digits=5, decimal_places=2, blank=True, null=True)
	is_half = models.BooleanField(default=False)
	is_active = models.BooleanField(default=True)

	def __str__(self):
		return f"{self.leave_code} - {self.leave_name}"

class LeaveEntry(models.Model):
	leave_report_no = models.CharField(max_length=20, unique=True, blank=True)
	emp = models.ForeignKey(EmpProfile, to_field='emp_id', db_column='emp_id', on_delete=models.CASCADE)
	leave_type = models.ForeignKey(LeaveType, to_field='leave_code', db_column='leave_code', on_delete=models.CASCADE)
	start_date = models.DateField()
	end_date = models.DateField()
	total_days = models.DecimalField(max_digits=5, decimal_places=2, blank=True, null=True)
	reason = models.TextField(blank=True, null=True)
	status = models.CharField(max_length=20, default='Pending')
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
		# Auto-calc total_days
		if self.start_date and self.end_date:
			delta = (self.end_date - self.start_date).days + 1
			self.total_days = delta * float(self.leave_type.day_value if self.leave_type else 1)
		super().save(*args, **kwargs)

	def __str__(self):
		return f"{self.leave_report_no} - {self.emp.emp_name} ({self.leave_type.leave_name})"
#employee table, leave table, leavetype table 