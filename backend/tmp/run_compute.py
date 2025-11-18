import os
import sys
from pathlib import Path

# ensure project root (backend) is on sys.path
BASE = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(BASE))

os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'backend.settings')
import django
django.setup()

from api.domain_leave_balance import compute_and_persist_leave_balances

if __name__ == '__main__':
    res = compute_and_persist_leave_balances(period_id=1)
    emps = res.get('employees', [])
    print('COMPUTED', len(emps))
    # print first 3 for inspection
    for e in emps[:3]:
        print(e)
