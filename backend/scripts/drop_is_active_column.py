import psycopg2

DB = {
    'dbname': 'frontdesk',
    'user': 'postgres',
    'password': 'Ksv@svkm2007',
    'host': 'localhost',
    'port': 5432,
}

sql = "ALTER TABLE api_leaveperiod DROP COLUMN IF EXISTS is_active;"

try:
    conn = psycopg2.connect(**DB)
    cur = conn.cursor()
    cur.execute(sql)
    conn.commit()
    print('OK: is_active column removed from api_leaveperiod')
    cur.close()
    conn.close()
except Exception as e:
    print('ERROR executing ALTER:', e)
