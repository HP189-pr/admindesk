import django
import os
os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'backend.settings')
django.setup()

from api.domain_emp import LeaveEntry, LeavePeriod

print("=== LEAVE ENTRIES ===")
total = LeaveEntry.objects.count()
print(f"Total leave entries: {total}")

if total > 0:
    print("\n=== SAMPLE ENTRIES ===")
    for entry in LeaveEntry.objects.all()[:5]:
        print(f"Emp: {entry.emp_id}, Leave: {entry.leave_type_id}, From: {entry.start_date}, To: {entry.end_date}, Status: {entry.status}")
    
    print("\n=== APPROVED ENTRIES ===")
    approved = LeaveEntry.objects.filter(status__iexact='approved').count()
    print(f"Approved entries: {approved}")
    
    print("\n=== ENTRIES BY PERIOD ===")
    periods = LeavePeriod.objects.all().order_by('id')
    for p in periods:
        count = LeaveEntry.objects.filter(
            status__iexact='approved',
            start_date__lte=p.end_date,
            end_date__gte=p.start_date
        ).count()
        print(f"Period {p.id} ({p.period_name}): {count} entries")
else:
    print("No leave entries found in database")
