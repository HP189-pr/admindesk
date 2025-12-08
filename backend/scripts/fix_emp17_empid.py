import psycopg2

conn = psycopg2.connect('dbname=frontdesk user=postgres password=Ksv@svkm2007 host=localhost')
cur = conn.cursor()

# Update emp_id from integer to string '17'
cur.execute("UPDATE api_leaveallocation SET emp_id = '17' WHERE emp_id = 17 AND period_id = 5")
print(f'Updated {cur.rowcount} allocation records to use string emp_id')

conn.commit()

# Verify
cur.execute("SELECT id, emp_id, leave_code, allocated FROM api_leaveallocation WHERE period_id = 5 AND emp_id = '17' ORDER BY leave_code")
print('\nUpdated allocations:')
for r in cur.fetchall():
    print(f'  ID={r[0]}, emp_id={r[1]!r}, leave_code={r[2]}, allocated={r[3]}')

conn.close()
print('\nDone! Now run: python manage.py recompute_balances 5')
