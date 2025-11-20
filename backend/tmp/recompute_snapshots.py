import os
import sys
import django
from collections import defaultdict

# Ensure project root is on sys.path
proj_root = os.path.dirname(os.path.dirname(__file__))
if proj_root not in sys.path:
    sys.path.insert(0, proj_root)

os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'backend.settings')
django.setup()

from django.db import connection
from api.domain_leave_balance import compute_and_persist_leave_balances


def main():
    print('Starting snapshot recompute for all selected periods...')
    res = compute_and_persist_leave_balances()
    employees = res.get('employees', [])
    print(f'Processed snapshot rows (employee x period): {len(employees)}')
    per_period = defaultdict(int)
    for r in employees:
        per_period[r.get('period_id')] += 1
    print('Counts per period from runner:')
    for pid, cnt in sorted(per_period.items()):
        print(f'  period {pid}: {cnt}')

    # Query DB counts
    with connection.cursor() as cur:
        cur.execute('SELECT COUNT(*) FROM api_leavebalancesnapshot')
        total = cur.fetchone()[0]
        print(f'Total rows in api_leavebalancesnapshot: {total}')
        cur.execute('SELECT period_id, COUNT(*) FROM api_leavebalancesnapshot GROUP BY period_id ORDER BY period_id')
        rows = cur.fetchall()
        print('DB counts per period:')
        for r in rows:
            print(f'  period {r[0]}: {r[1]}')

if __name__ == '__main__':
    main()
