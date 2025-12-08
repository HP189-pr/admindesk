import json
from pprint import pprint
from api.domain_emp import EmpProfile, LeaveAllocation, LeaveEntry, LeavePeriod
from api.domain_leave_balance import compute_leave_balances

EMP_ID = '17'

emp = EmpProfile.objects.filter(emp_id=str(EMP_ID)).first()
print('--- EMP PROFILE ---')
print(emp)
if not emp:
    print('No EmpProfile found for emp_id', EMP_ID)
else:
    print('emp.id (pk):', emp.id)
    print('emp.emp_id:', emp.emp_id)
    print('emp.emp_name:', emp.emp_name)

print('\n--- LEAVE PERIODS (active & all) ---')
periods = list(LeavePeriod.objects.all().order_by('start_date'))
for p in periods:
    print(p.id, p.period_name, p.start_date, p.end_date, 'active' if p.is_active else '')

print('\n--- LEAVE ALLOCATIONS (profile-specific) ---')
allocs = list(LeaveAllocation.objects.filter(profile=emp).order_by('period_id').values(
    'id','leave_type_id','allocated','allocated_cl','allocated_sl','allocated_el','allocated_vac','allocated_start_date','allocated_end_date','period_id'
)) if emp else []
print(json.dumps(allocs, default=str, indent=2))

print('\n--- LEAVE ALLOCATIONS (global default rows for periods) ---')
global_allocs = list(LeaveAllocation.objects.filter(profile__isnull=True).order_by('period_id').values(
    'id','leave_type_id','allocated','allocated_cl','allocated_sl','allocated_el','allocated_vac','allocated_start_date','allocated_end_date','period_id'
))
print(json.dumps(global_allocs, default=str, indent=2))

print('\n--- LEAVE ENTRIES (all for employee) ---')
entries = list(LeaveEntry.objects.filter(emp__emp_id=str(EMP_ID)).order_by('start_date').values('leave_report_no','leave_type_id','start_date','end_date','total_days','status'))
print(json.dumps(entries, default=str, indent=2))

print('\n--- COMPUTED BALANCES (compute_leave_balances for emp 17) ---')
try:
    payload = compute_leave_balances(employee_ids=[str(EMP_ID)])
    pprint(payload)
except Exception as e:
    print('compute_leave_balances failed:', e)

print('\n--- Done ---')
