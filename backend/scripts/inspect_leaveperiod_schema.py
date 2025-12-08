import psycopg2
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
    cur.execute("SELECT column_name, data_type, is_nullable, column_default FROM information_schema.columns WHERE table_name='api_leaveperiod' ORDER BY ordinal_position")
    rows = cur.fetchall()
    print('api_leaveperiod columns:')
    for r in rows:
        print(f"  {r[0]}: {r[1]} (nullable={r[2]}, default={r[3]})")
    cur.close()
    conn.close()
except Exception as e:
    print('ERROR:', e)
