import django
import os
os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'backend.settings')
django.setup()

from api.domain_emp import LeavePeriod, LeaveAllocation
from django.db.models import Count

print("=== LEAVE PERIODS ===")
for p in LeavePeriod.objects.all().order_by('id'):
    print(f"ID: {p.id}, Name: {p.period_name}, Dates: {p.start_date} to {p.end_date}")

print("\n=== ALLOCATIONS BY PERIOD ===")
allocs = LeaveAllocation.objects.values('period_id').annotate(total=Count('id')).order_by('period_id')
for a in allocs:
    period = LeavePeriod.objects.filter(id=a['period_id']).first()
    period_name = period.period_name if period else 'Unknown'
    print(f"Period {a['period_id']} ({period_name}): {a['total']} allocations")

print("\n=== SAMPLE ALLOCATIONS FROM FIRST PERIOD ===")
first_period = LeavePeriod.objects.order_by('id').first()
if first_period:
    sample = LeaveAllocation.objects.filter(period_id=first_period.id)[:5]
    for s in sample:
        print(f"  Emp: {s.emp_id}, Leave: {s.leave_code}, Allocated: {s.allocated}")
