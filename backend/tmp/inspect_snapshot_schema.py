import os
import django
from django.db import connection

import sys
# ensure project package path is on sys.path
proj_root = os.path.dirname(os.path.dirname(__file__))
if proj_root not in sys.path:
    sys.path.insert(0, proj_root)
os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'backend.settings')
django.setup()

TABLE = 'api_leavebalancesnapshot'
print('Inspecting table:', TABLE)
with connection.cursor() as cur:
    cur.execute("SELECT column_name, data_type, is_nullable, column_default FROM information_schema.columns WHERE table_name=%s ORDER BY ordinal_position", [TABLE])
    cols = cur.fetchall()
    if not cols:
        print('No columns found (table may not exist).')
    else:
        for c in cols:
            print('\t'.join([str(x) if x is not None else '' for x in c]))

# show any unique indexes
try:
    intros = connection.introspection
    with connection.cursor() as cur:
        constraints = intros.get_constraints(cur, TABLE)
    print('\nConstraints:')
    for name, info in constraints.items():
        print(name, info)
except Exception as e:
    print('Could not fetch constraints:', e)
