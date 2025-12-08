import psycopg2

conn = psycopg2.connect('dbname=frontdesk user=postgres password=Ksv@svkm2007 host=localhost')
cur = conn.cursor()

# Check column type
cur.execute("SELECT column_name, data_type FROM information_schema.columns WHERE table_name = 'api_leaveallocation' AND column_name = 'emp_id'")
col_info = cur.fetchone()
print(f'emp_id column type: {col_info}')

# Check actual values
cur.execute("SELECT id, emp_id, leave_code, allocated FROM api_leaveallocation WHERE id IN (5797, 5798, 5799)")
print('\nAllocation records:')
for r in cur.fetchall():
    print(f'  ID={r[0]}, emp_id={r[1]!r} (type={type(r[1]).__name__}), leave_code={r[2]}, allocated={r[3]}')

# Check if profile FK relationship works
cur.execute("""
    SELECT a.id, a.emp_id, a.leave_code, a.allocated, p.emp_id, p.emp_name 
    FROM api_leaveallocation a
    LEFT JOIN api_empprofile p ON a.emp_id = p.emp_id
    WHERE a.id IN (5797, 5798, 5799)
""")
print('\nJoin with EmpProfile:')
for r in cur.fetchall():
    print(f'  Alloc ID={r[0]}, alloc.emp_id={r[1]!r}, profile.emp_id={r[4]!r}, profile.name={r[5]}')

conn.close()
