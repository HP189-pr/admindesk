import os, sys
from pathlib import Path
BASE = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(BASE))
os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'backend.settings')
import django
django.setup()
from django.db import connection

with connection.cursor() as cur:
    cur.execute("SELECT COUNT(*) FROM api_leavebalancesnapshot WHERE period_id = %s", [1])
    r = cur.fetchone()
    print('SNAPSHOT_ROWS_PERIOD_1:', r[0] if r else 0)

# print a sample row
with connection.cursor() as cur:
    cur.execute("SELECT emp_id, balance_date, used_cl, allocated_cl, ending_cl FROM api_leavebalancesnapshot WHERE period_id = %s LIMIT 5", [1])
    for row in cur.fetchall():
        print(row)
