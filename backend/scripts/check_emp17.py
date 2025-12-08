import psycopg2

conn = psycopg2.connect('dbname=frontdesk user=postgres password=Ksv@svkm2007 host=localhost')
cur = conn.cursor()

print("Checking allocation records...")
cur.execute('SELECT id, emp_id, leave_code, period_id, allocated FROM api_leaveallocation WHERE emp_id = 17 AND period_id = 5 ORDER BY leave_code')
rows = cur.fetchall()
print(f'Found {len(rows)} allocation records for emp_id=17, period_id=5:')
for r in rows:
    print(f'  ID={r[0]}, emp_id={r[1]}, leave_code={r[2]}, period={r[3]}, allocated={r[4]}')

print("\nChecking EmpProfile...")
cur.execute("SELECT id, emp_id, emp_name FROM api_empprofile WHERE emp_id = '17'")
emp = cur.fetchone()
if emp:
    print(f'  EmpProfile: PK={emp[0]}, emp_id={emp[1]}, name={emp[2]}')
else:
    print('  ERROR: No EmpProfile found for emp_id=17!')

conn.close()
