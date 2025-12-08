import psycopg2
import json
DB={'dbname':'frontdesk','user':'postgres','password':'Ksv@svkm2007','host':'localhost','port':5432}
sql = '''
SELECT id, leave_code, emp_id, period_id, allocated, allocated_start_date, allocated_end_date
FROM api_leaveallocation
WHERE emp_id IS NULL AND period_id = (SELECT id FROM api_leaveperiod WHERE is_active = TRUE LIMIT 1)
'''
try:
    conn = psycopg2.connect(**DB)
    cur = conn.cursor()
    cur.execute(sql)
    rows = cur.fetchall()
    data = [
        {'id': r[0], 'leave_code': r[1], 'emp_id': r[2], 'period_id': r[3], 'allocated': float(r[4]) if r[4] is not None else 0.0, 'start': r[5].isoformat() if r[5] is not None else None, 'end': r[6].isoformat() if r[6] is not None else None}
        for r in rows
    ]
    print('Found', len(data), 'global allocations for active period:')
    print(json.dumps(data, indent=2))
    cur.close(); conn.close()
except Exception as e:
    print('Error:', e)
