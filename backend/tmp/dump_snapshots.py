import os
import sys
import django
# Ensure repo root is on path so `backend` package is importable
ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), '..', '..'))
if ROOT not in sys.path:
    sys.path.insert(0, ROOT)
os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'backend.settings')
django.setup()
from api.domain_emp import LeaveBalanceSnapshot
from django.db import connection

print('Sample snapshots by period:')
for pid in (1,2,5):
    qs = LeaveBalanceSnapshot.objects.filter(period_id=pid).order_by('emp_id')[:5]
    print(f'Period {pid}: count={LeaveBalanceSnapshot.objects.filter(period_id=pid).count()}')
    for s in qs:
        print({
            'emp_id': getattr(s, 'emp_id', None),
            'emp_name': getattr(s, 'emp_name', None),
            'period_id': getattr(s, 'period_id', None),
            'ending_el': getattr(s, 'ending_el', None),
            'ending_cl': getattr(s, 'ending_cl', None),
            'allocation_id': getattr(s, 'allocation_id', None),
        })
    print('---')
print('Done')
