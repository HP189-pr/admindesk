from django.db import connection

if __name__ == '__main__':
    import os, sys
    sys.path.insert(0, os.path.dirname(os.path.dirname(__file__)))
    os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'backend.settings')
    import django
    django.setup()

    sqls = [
        "ALTER TABLE api_leavetype ADD COLUMN IF NOT EXISTS is_active boolean DEFAULT TRUE",
        "UPDATE api_leavetype SET is_active = TRUE WHERE is_active IS NULL",
        "ALTER TABLE api_leavetype ALTER COLUMN is_active SET DEFAULT TRUE",
    ]

    with connection.cursor() as c:
        for s in sqls:
            try:
                c.execute(s)
                print('Executed:', s)
            except Exception as e:
                print('Error executing:', s, '->', e)
