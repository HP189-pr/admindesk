import os
import sys
import django

proj_root = os.path.abspath(os.path.join(os.path.dirname(__file__), '..'))
if proj_root not in sys.path:
    sys.path.insert(0, proj_root)
os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'backend.settings')
django.setup()

from django.db import connection

def columns_for(table_name):
    with connection.cursor() as cur:
        cur.execute("SELECT column_name, data_type FROM information_schema.columns WHERE table_name=%s", [table_name])
        return list(cur.fetchall())

for t in ('api_leavetype', 'api_leaveperiod'):
    try:
        cols = columns_for(t)
        print(f"TABLE {t} columns:")
        for c in cols:
            print('  ', c[0], c[1])
    except Exception as e:
        print(f"Error inspecting {t}: {e}")
