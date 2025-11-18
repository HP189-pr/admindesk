import os, sys, csv
from pathlib import Path
BASE = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(BASE))

os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'backend.settings')
import django
django.setup()
from django.db import connection

PERIOD_ID = 1
OUT = BASE / 'tmp' / f'snapshot_allocations_period_{PERIOD_ID}.csv'
OUT.parent.mkdir(exist_ok=True)

SQL = '''
SELECT p.emp_id AS emp_code, p.emp_name, s.balance_date,
       s.allocated_cl, s.used_cl, s.ending_cl,
       s.allocated_el, s.used_el, s.ending_el,
       s.allocated_sl, s.used_sl, s.ending_sl
FROM api_leavebalancesnapshot s
JOIN api_empprofile p ON p.id = s.emp_id
WHERE s.period_id = %s
ORDER BY p.emp_id
'''

with connection.cursor() as cur:
    cur.execute(SQL, [PERIOD_ID])
    rows = cur.fetchall()
    cols = [d[0] for d in cur.description]

with open(OUT, 'w', newline='', encoding='utf-8') as fh:
    writer = csv.writer(fh)
    writer.writerow(cols)
    writer.writerows(rows)

print('WROTE', OUT)
print('ROWS', len(rows))
print('SAMPLE', rows[:5])
