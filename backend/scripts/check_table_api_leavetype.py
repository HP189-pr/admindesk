from django.db import connection
import os, sys

sys.path.insert(0, os.path.dirname(os.path.dirname(__file__)))
os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'backend.settings')
import django
django.setup()

with connection.cursor() as c:
    try:
        c.execute('SELECT COUNT(*) FROM api_leavetype')
        cnt = c.fetchone()[0]
        print('ok', cnt)
    except Exception as e:
        print('error', type(e).__name__, str(e))
        sys.exit(1)
