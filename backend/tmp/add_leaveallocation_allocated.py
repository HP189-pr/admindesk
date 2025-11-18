from django.db import connection

if __name__ == '__main__':
    import os, sys
    sys.path.insert(0, os.path.dirname(os.path.dirname(__file__)))
    os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'backend.settings')
    import django
    django.setup()

    sqls = [
        # Add the canonical 'allocated' column if missing
        "ALTER TABLE api_leaveallocation ADD COLUMN IF NOT EXISTS allocated numeric DEFAULT 0",
        # Populate allocated from existing legacy columns where present
        "UPDATE api_leaveallocation SET allocated = COALESCE(allocated_el, allocated_cl, allocated_sl, allocated_vac, 0)",
        # Ensure NOT NULL and default
        "ALTER TABLE api_leaveallocation ALTER COLUMN allocated SET DEFAULT 0",
        "UPDATE api_leaveallocation SET allocated = 0 WHERE allocated IS NULL",
    ]

    with connection.cursor() as c:
        for s in sqls:
            try:
                c.execute(s)
                print('Executed:', s)
            except Exception as e:
                print('Error executing:', s, '->', e)
