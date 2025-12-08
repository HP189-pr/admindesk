import psycopg2

DB = {
    'dbname': 'frontdesk',
    'user': 'postgres',
    'password': 'Ksv@svkm2007',
    'host': 'localhost',
    'port': 5432,
}

sql = "ALTER TABLE api_leaveperiod ADD COLUMN IF NOT EXISTS is_active boolean DEFAULT FALSE;"

try:
    conn = psycopg2.connect(**DB)
    cur = conn.cursor()
    cur.execute(sql)
    conn.commit()
    print('OK: is_active column ensured on api_leaveperiod')
    cur.close()
    conn.close()
except Exception as e:
    print('ERROR executing ALTER:', e)
