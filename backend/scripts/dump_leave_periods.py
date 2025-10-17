import os, sys, json
proj_root = os.path.abspath(os.path.join(os.path.dirname(__file__), '..'))
if proj_root not in sys.path:
    sys.path.insert(0, proj_root)
os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'backend.settings')
import django
django.setup()
from django.db import connection
with connection.cursor() as cur:
    cur.execute('SELECT id, period_name, start_date, end_date, is_active FROM api_leaveperiod')
    rows = cur.fetchall()
    cols = [c[0] for c in cur.description]
    data = [dict(zip(cols, r)) for r in rows]
print(json.dumps(data, default=str))
