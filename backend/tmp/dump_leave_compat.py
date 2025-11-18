import os, sys, json
proj_root = os.path.abspath(os.path.join(os.path.dirname(__file__), '..'))
if proj_root not in sys.path:
    sys.path.insert(0, proj_root)
os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'backend.settings')
import django
django.setup()
from django.db import connection
with connection.cursor() as cur:
    cur.execute('SELECT leave_code, leave_name, parent_leave, leave_unit, leave_mode, annual_limit, is_half, id FROM api_leavetype')
    rows = cur.fetchall()
    cols = [c[0] for c in cur.description]
    data = [dict(zip(cols, r)) for r in rows]
print(json.dumps(data, default=str))
