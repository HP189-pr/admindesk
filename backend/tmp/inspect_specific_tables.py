import os,sys
proj_root = os.path.abspath(os.path.join(os.path.dirname(__file__), '..'))
if proj_root not in sys.path:
    sys.path.insert(0, proj_root)
os.environ.setdefault('DJANGO_SETTINGS_MODULE','backend.settings')
import django
django.setup()
from django.db import connection

tables = ['leave_type','leave_period','leave_entry','leavea_llocation_general','leave_balances']
for t in tables:
    print('\nTABLE:', t)
    try:
        with connection.cursor() as cur:
            cur.execute("SELECT column_name, data_type FROM information_schema.columns WHERE table_name=%s ORDER BY ordinal_position", [t])
            rows = cur.fetchall()
            if not rows:
                print('  (no columns)')
            for c in rows:
                print('   ', c[0], c[1])
    except Exception as e:
        print('  ERROR:', e)
print('\nDone')
