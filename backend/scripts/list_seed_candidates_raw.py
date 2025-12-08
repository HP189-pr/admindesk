from django.db import connection
from api.domain_emp import LeavePeriod
import json

p = LeavePeriod.objects.filter(is_active=True).first()
print('Active period:', p.id if p else None)
if p:
    with connection.cursor() as c:
        c.execute("SELECT id, leave_type_id, allocated, allocated_start_date, allocated_end_date FROM api_leaveallocation WHERE profile_id IS NULL AND period_id = %s", [p.id])
        rows = c.fetchall()
    data = [
        {
            'id': r[0],
            'leave_type_id': r[1],
            'allocated': float(r[2] or 0),
            'start': str(r[3]) if r[3] is not None else None,
            'end': str(r[4]) if r[4] is not None else None,
        }
        for r in rows
    ]
    print(json.dumps(data, indent=2))
else:
    print('No active period')
