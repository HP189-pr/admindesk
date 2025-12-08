import psycopg2
from datetime import date
DB = {
    'dbname': 'frontdesk',
    'user': 'postgres',
    'password': 'Ksv@svkm2007',
    'host': 'localhost',
    'port': 5432,
}
try:
    conn = psycopg2.connect(**DB)
    cur = conn.cursor()
    # Try to insert a test period
    cur.execute("""
        INSERT INTO api_leaveperiod (period_name, start_date, end_date, description, created_at, updated_at)
        VALUES (%s, %s, %s, %s, now(), now())
        RETURNING id
    """, ['Test Period 2027', date(2027, 1, 1), date(2027, 12, 31), 'Test'])
    new_id = cur.fetchone()[0]
    conn.commit()
    print(f'SUCCESS: Created period with id={new_id}')
    cur.close()
    conn.close()
except Exception as e:
    print('ERROR creating period:', e)
    import traceback
    traceback.print_exc()
