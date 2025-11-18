import os
import sys
proj_root = os.path.abspath(os.path.join(os.path.dirname(__file__), '..'))
if proj_root not in sys.path:
    sys.path.insert(0, proj_root)
os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'backend.settings')
import django
django.setup()
from django.db import connection
from api import domain_emp

models_to_check = [
    domain_emp.EmpProfile,
    domain_emp.LeaveType,
    domain_emp.LeavePeriod,
    domain_emp.LeaveAllocation,
]

print('Checking models vs DB tables:')
existing_tables = set(connection.introspection.table_names())
for m in models_to_check:
    meta = m._meta
    db_table = meta.db_table
    print(f"Model: {m.__name__} -> db_table: {db_table}")
    exists = db_table in existing_tables
    print('  Exists in DB?:', exists)
    if exists:
        with connection.cursor() as cur:
            cur.execute("SELECT column_name, data_type FROM information_schema.columns WHERE table_name=%s", [db_table])
            cols = cur.fetchall()
            print('  Columns:')
            for c in cols:
                print('   ', c[0], c[1])
    else:
        # try some common alternatives
        guesses = [db_table.replace('api_', ''), 'api_' + db_table, db_table.lower(), db_table.upper()]
        found = False
        for g in guesses:
            if g in existing_tables:
                print('  Alternative table found in DB:', g)
                found = True
        if not found:
            print('  No alternative tables detected.')
print('\nDone')
