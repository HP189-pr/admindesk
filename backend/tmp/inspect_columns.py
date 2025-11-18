#!/usr/bin/env python
"""Print SQL column types for api_empprofile and related tables."""
import os, sys
SCRIPT_DIR = os.path.dirname(os.path.abspath(__file__))
DJANGO_PROJECT_DIR = os.path.abspath(os.path.join(SCRIPT_DIR, '..'))
if DJANGO_PROJECT_DIR not in sys.path:
    sys.path.insert(0, DJANGO_PROJECT_DIR)
os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'backend.settings')
import django
django.setup()
from django.db import connection

def print_columns(table):
    with connection.cursor() as cur:
        cur.execute("SELECT column_name, data_type, udt_name, character_maximum_length, numeric_precision, numeric_scale FROM information_schema.columns WHERE table_name = %s ORDER BY ordinal_position", [table])
        rows = cur.fetchall()
    print(f"Table: {table}")
    for r in rows:
        print(f"  {r[0]:30} type={r[1]} udt={r[2]} len={r[3]} prec={r[4]} scale={r[5]}")
    print()

if __name__ == '__main__':
    for t in ('api_empprofile','api_leaveentry','api_leavebalancesnapshot','api_leaveallocation'):
        print_columns(t)
