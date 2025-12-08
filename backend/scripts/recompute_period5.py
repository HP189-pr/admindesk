import os
import django

os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'backend.settings')
django.setup()

from api.domain_leave_balance import compute_and_persist_leave_balances

print("Recomputing leave balances for period 5...")
result = compute_and_persist_leave_balances(period_id=5)

print(f"\nDone!")
print(f"Periods processed: {len(result.get('metadata', {}).get('periods', []))}")
print(f"Employees processed: {len(result.get('employees', []))}")

# Show sample for employee 17
emp17_data = [e for e in result.get('employees', []) if e.get('emp_id') == '17']
if emp17_data:
    print(f"\nEmployee 17 results:")
    for emp in emp17_data:
        for period in emp.get('periods', []):
            print(f"  Period: {period.get('period_name')}")
            print(f"    Starting: EL={period.get('starting_el')}, CL={period.get('starting_cl')}, SL={period.get('starting_sl')}")
            print(f"    Allocated: EL={period.get('allocated_el')}, CL={period.get('allocated_cl')}, SL={period.get('allocated_sl')}")
            print(f"    Used: EL={period.get('used_el')}, CL={period.get('used_cl')}, SL={period.get('used_sl')}")
            print(f"    Ending: EL={period.get('ending_el')}, CL={period.get('ending_cl')}, SL={period.get('ending_sl')}")
