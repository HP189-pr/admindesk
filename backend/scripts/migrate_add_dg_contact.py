import psycopg2

# Database connection
conn = psycopg2.connect('dbname=frontdesk user=postgres password=Ksv@svkm2007 host=localhost')
cur = conn.cursor()

try:
    print("Adding dg_contact column to student_degree table...")
    
    # Add the column
    cur.execute("""
        ALTER TABLE student_degree 
        ADD COLUMN IF NOT EXISTS dg_contact VARCHAR(15)
    """)
    
    # Add comment
    cur.execute("""
        COMMENT ON COLUMN student_degree.dg_contact IS 'Student contact number'
    """)
    
    conn.commit()
    
    # Verify the column was added
    cur.execute("""
        SELECT column_name, data_type, character_maximum_length 
        FROM information_schema.columns 
        WHERE table_name = 'student_degree' AND column_name = 'dg_contact'
    """)
    
    result = cur.fetchone()
    if result:
        print(f"✓ Column added successfully!")
        print(f"  Column name: {result[0]}")
        print(f"  Data type: {result[1]}")
        print(f"  Max length: {result[2]}")
    else:
        print("✗ Column was not added")
    
except Exception as e:
    print(f"Error: {e}")
    conn.rollback()
finally:
    cur.close()
    conn.close()

print("\nMigration complete!")
