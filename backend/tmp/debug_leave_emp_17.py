"""
Debug helper: inspect leave entries and computed balances for a single employee.
Usage (PowerShell):
  cd e:\admindesk; python backend\tmp\debug_leave_emp_17.py

This script prints approved LeaveEntry rows for emp_id '17', how each entry
is split across periods, and the outputs of the two computation helpers in
`api.domain_leave_balance` for comparison.

Do NOT commit this file; it's intended to live in `backend/tmp/` only.
"""

import os
import sys

# Ensure project package on path
ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), '..'))
if ROOT not in sys.path:
    sys.path.insert(0, ROOT)

os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'backend.settings')

import django
django.setup()

from api.models import LeaveEntry, LeaveType, LeaveAllocation, LeavePeriod
from api import domain_leave_balance as dlb
from decimal import Decimal

EMP_ID = '17'  # change if needed

print('\n=== Raw approved LeaveEntry rows for emp_id', EMP_ID, '===\n')
entries = LeaveEntry.objects.select_related('leave_type').filter(emp_id=EMP_ID, status__iexact=LeaveEntry.STATUS_APPROVED).order_by('start_date')
if not entries.exists():
    print('No approved entries found for emp_id', EMP_ID)
else:
    for e in entries:
        lt = getattr(e, 'leave_type', None)
        lt_code = (getattr(e, 'leave_type_id', None) or (lt.leave_code if lt else None) or '')
        day_value = dlb._effective_day_value(lt)
        print(f"id={e.id} emp_id={e.emp_id} code={lt_code} start={e.start_date} end={e.end_date} day_value={day_value} status={e.status} comment={getattr(e,'comment',None)}")

# Load periods used by the module
try:
    # prefer the module loader if available
    periods = dlb._load_periods()
except Exception:
    periods = [dlb._PeriodWindow(id=p.id, name=p.period_name, start=p.start_date, end=p.end_date) for p in LeavePeriod.objects.all().order_by('start_date','id')]

print('\n=== Periods ===\n')
for p in periods:
    print(f'id={p.id} name={p.name} start={p.start} end={p.end}')

# Show how each entry splits across periods
print('\n=== Entry splits across periods ===\n')
for e in entries:
    # create a lightweight namespace similar to how the module calls the splitter
    class _E: pass
    eo = _E()
    eo.start_date = e.start_date
    eo.end_date = e.end_date
    eo.leave_type_id = (getattr(e, 'leave_type_id', None) or (getattr(e.leave_type, 'leave_code', None) if getattr(e,'leave_type',None) else None) or '')
    eo.leave_type = e.leave_type
    splits = dlb._split_entry_across_periods(eo, periods)
    print(f'Entry id={e.id} splits:')
    if not splits:
        print('  (no overlap with configured periods)')
    for pid, mapping in splits.items():
        print(f'  period_id={pid}')
        for code, val in mapping.items():
            print(f'    code={code} amount={val}')

# Use the two computation helpers and print the relevant employee's records
print('\n=== compute_leave_balances (high-level) for emp_id', EMP_ID, '===\n')
try:
    out = dlb.compute_leave_balances(employee_ids=[EMP_ID])
    emps = out.get('employees', [])
    if not emps:
        print('No employees returned')
    else:
        for e in emps:
            if str(e.get('emp_id')) == str(EMP_ID):
                print(e)
except Exception as exc:
    print('compute_leave_balances raised:', exc)

print('\n=== computeLeaveBalances (legacy runner) for emp_id', EMP_ID, '===\n')
try:
    out2 = dlb.computeLeaveBalances()
    # out2 structure: {'employees': [...], 'metadata': {...}}
    found = False
    for emp in out2.get('employees', []):
        if str(emp.get('emp_id')) == str(EMP_ID):
            found = True
            print(emp)
    if not found:
        print('Employee not found in computeLeaveBalances output')
except Exception as exc:
    print('computeLeaveBalances raised:', exc)

print('\n=== Raw aggregated used_days via loadLeaveEntriesSplitByPeriod (if present) ===\n')
try:
    # Some helper functions available under different names; try both
    if hasattr(dlb, 'loadLeaveEntriesSplitByPeriod'):
        used_map = dlb.loadLeaveEntriesSplitByPeriod([EMP_ID], periods)
        if not used_map:
            print('No used_map entries found')
        else:
            for k, v in used_map.items():
                if k[0] == EMP_ID:
                    print(f'key={k} value={v}')
    else:
        print('loadLeaveEntriesSplitByPeriod not present in module; skipping')
except Exception as exc:
    print('loadLeaveEntriesSplitByPeriod raised:', exc)

print('\n=== Done ===\n')
