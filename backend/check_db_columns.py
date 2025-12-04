"""Check if search_vector columns exist in database"""
import os
import django

os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'backend.settings')
django.setup()

from django.db import connection

tables_to_check = [
    'enrollment',
    'verification',
    'doc_rec',
    'student_degree',
    'transcript_request',
    'google_form_submission',
    'inst_verification_main'
]

print("=" * 60)
print("Checking for search_vector columns in database")
print("=" * 60)

cursor = connection.cursor()

for table in tables_to_check:
    cursor.execute(f"""
        SELECT column_name 
        FROM information_schema.columns 
        WHERE table_name = '{table}' 
        AND column_name = 'search_vector'
    """)
    result = cursor.fetchone()
    status = "✓ EXISTS" if result else "✗ MISSING"
    print(f"{table:30} {status}")

print("\n" + "=" * 60)
print("Checking GIN indexes")
print("=" * 60)

cursor.execute("""
    SELECT indexname, tablename 
    FROM pg_indexes 
    WHERE indexname LIKE '%search%'
    ORDER BY tablename
""")

indexes = cursor.fetchall()
if indexes:
    for idx_name, table_name in indexes:
        print(f"  {table_name:30} → {idx_name}")
else:
    print("  No search-related indexes found")
