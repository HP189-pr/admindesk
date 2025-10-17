from django.db import connection
cur = connection.cursor()
cur.execute("SELECT column_name FROM information_schema.columns WHERE table_name='verification' ORDER BY ordinal_position;")
cols = [r[0] for r in cur.fetchall()]
print(cols)
