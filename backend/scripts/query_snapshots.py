from django import setup
import os, json
os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'backend.settings')
setup()
from django.db import connection

def rows_to_dicts(cursor):
    cols = [c[0] for c in cursor.description]
    return [dict(zip(cols, r)) for r in cursor.fetchall()]

with connection.cursor() as cur:
    cur.execute("SELECT id, emp_id FROM api_empprofile WHERE emp_id=%s", ['17'])
    emp = cur.fetchone()
    print('EMP_PROFILE:', emp)

    print('\nSNAPSHOTS for profile pk (emp_id -> profile id)')
    if emp:
        profile_pk = emp[0]
        cur.execute("SELECT id, emp_id, period_id, starting_el, allocated_el, used_el, ending_el, starting_cl, allocated_cl, used_cl, ending_cl, snapshot_date FROM api_leavebalancesnapshot WHERE emp_id = %s ORDER BY snapshot_date DESC", [profile_pk])
        print(json.dumps(rows_to_dicts(cur), default=str, indent=2))
    else:
        print('No profile found for emp_id 17')

    print('\nSNAPSHOTS where emp_id literal = 17:')
    cur.execute("SELECT id, emp_id, period_id, starting_el, allocated_el, used_el, ending_el, starting_cl, allocated_cl, used_cl, ending_cl, snapshot_date FROM api_leavebalancesnapshot WHERE emp_id = %s ORDER BY snapshot_date DESC", [17])
    print(json.dumps(rows_to_dicts(cur), default=str, indent=2))
