import psycopg2

conn = psycopg2.connect('dbname=frontdesk user=postgres password=Ksv@svkm2007 host=localhost')
cur = conn.cursor()

# Delete the incorrectly created records
cur.execute("DELETE FROM api_leaveallocation WHERE id IN (5797, 5798, 5799)")
print(f'Deleted {cur.rowcount} incorrect allocation records')

# Get the EmpProfile PK for emp_id '17'
cur.execute("SELECT id FROM api_empprofile WHERE emp_id = '17'")
profile_pk = cur.fetchone()[0]
print(f'EmpProfile PK for emp_id="17": {profile_pk}')

# Create new allocation records using the profile PK
sql = """
INSERT INTO api_leaveallocation (emp_id, leave_code, period_id, allocated, allocated_start_date, allocated_end_date, created_at, updated_at)
VALUES 
    (%s, 'CL', 5, 12, '2023-06-01', '2024-05-31', NOW(), NOW()),
    (%s, 'SL', 5, 10, '2023-06-01', '2024-05-31', NOW(), NOW()),
    (%s, 'EL', 5, 30, '2023-06-01', '2024-05-31', NOW(), NOW())
RETURNING id, leave_code, allocated
"""

cur.execute(sql, (profile_pk, profile_pk, profile_pk))
print(f'\nCreated allocation records using profile PK={profile_pk}:')
for r in cur.fetchall():
    print(f'  ID={r[0]}, leave_code={r[1]}, allocated={r[2]}')

conn.commit()

# Verify the join works now
cur.execute("""
    SELECT a.id, a.leave_code, a.allocated, p.emp_id, p.emp_name 
    FROM api_leaveallocation a
    JOIN api_empprofile p ON a.emp_id = p.id
    WHERE a.period_id = 5 AND p.emp_id = '17'
    ORDER BY a.leave_code
""")
print('\nVerify join with EmpProfile works:')
for r in cur.fetchall():
    print(f'  Alloc ID={r[0]}, leave_code={r[1]}, allocated={r[2]}, profile.emp_id={r[3]}, name={r[4]}')

conn.close()
print('\nDone! Now run: python manage.py recompute_balances 5')
