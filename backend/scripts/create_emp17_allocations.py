import psycopg2

conn = psycopg2.connect('dbname=frontdesk user=postgres password=Ksv@svkm2007 host=localhost')
cur = conn.cursor()

# Create allocation records for employee 17, period 5
sql = """
INSERT INTO api_leaveallocation (emp_id, leave_code, period_id, allocated, allocated_start_date, allocated_end_date, created_at, updated_at)
VALUES 
    (17, 'CL', 5, 12, '2023-06-01', '2024-05-31', NOW(), NOW()),
    (17, 'SL', 5, 10, '2023-06-01', '2024-05-31', NOW(), NOW()),
    (17, 'EL', 5, 30, '2023-06-01', '2024-05-31', NOW(), NOW())
ON CONFLICT DO NOTHING
RETURNING id, leave_code, allocated
"""

cur.execute(sql)
print('Created allocations:')
for row in cur.fetchall():
    print(f'  ID={row[0]}, Leave Code={row[1]}, Allocated={row[2]}')

conn.commit()

# Verify
cur.execute("SELECT id, emp_id, leave_code, period_id, allocated FROM api_leaveallocation WHERE emp_id = 17 AND period_id = 5 ORDER BY leave_code")
print('\nAll allocations for emp 17, period 5:')
for row in cur.fetchall():
    print(f'  {row}')

conn.close()
print('\nDone!')
