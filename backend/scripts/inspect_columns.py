import psycopg2
DB={'dbname':'frontdesk','user':'postgres','password':'Ksv@svkm2007','host':'localhost','port':5432}
try:
    conn=psycopg2.connect(**DB)
    cur=conn.cursor()
    cur.execute("SELECT column_name FROM information_schema.columns WHERE table_schema='public' AND table_name='api_leaveallocation' ORDER BY ordinal_position")
    cols=[r[0] for r in cur.fetchall()]
    print('columns:', cols)
    cur.close(); conn.close()
except Exception as e:
    print('err', e)
