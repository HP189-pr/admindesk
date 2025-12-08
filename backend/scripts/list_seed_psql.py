import psycopg2
import json

DB = {
    'dbname': 'frontdesk',
    'user': 'postgres',
    'password': 'Ksv@svkm2007',
    'host': 'localhost',
    'port': 5432,
}

sql = '''
SELECT la.id, la.leave_type_id, la.allocated, la.allocated_start_date, la.allocated_end_date, la.profile_id, la.period_id
FROM api_leaveallocation la
JOIN api_leaveperiod lp ON la.period_id = lp.id
WHERE la.profile_id IS NULL AND lp.is_active = TRUE
'''

try:
    conn = psycopg2.connect(**DB)
    cur = conn.cursor()
    cur.execute(sql)
    rows = cur.fetchall()
    data = [
        {
            'id': r[0],
            'leave_type_id': r[1],
            'allocated': float(r[2]) if r[2] is not None else 0.0,
            'start': r[3].isoformat() if r[3] is not None else None,
            'end': r[4].isoformat() if r[4] is not None else None,
            'profile_id': r[5],
            'period_id': r[6],
        }
        for r in rows
    ]
    print('Candidates count:', len(data))
    print(json.dumps(data, indent=2))
    cur.close()
    conn.close()
except Exception as e:
    print('Error:', e)
