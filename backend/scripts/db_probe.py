from django.db import connection

if __name__ == '__main__':
    import os, sys
    sys.path.insert(0, os.path.dirname(os.path.dirname(__file__)))
    os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'backend.settings')
    import django
    django.setup()

    with connection.cursor() as c:
        try:
            c.execute('SELECT COUNT(*) FROM api_leavetype')
            print('api_leavetype COUNT:', c.fetchone()[0])
        except Exception as e:
            print('api_leavetype error:', e)
        try:
            c.execute("SELECT column_name, data_type FROM information_schema.columns WHERE table_name='api_leavetype'")
            print('api_leavetype columns:', list(c.fetchall()))
        except Exception as e:
            print('api_leavetype columns error:', e)
        try:
            c.execute('SELECT COUNT(*) FROM api_leaveperiod')
            print('api_leaveperiod COUNT:', c.fetchone()[0])
        except Exception as e:
            print('api_leaveperiod error:', e)
        try:
            c.execute("SELECT column_name, data_type FROM information_schema.columns WHERE table_name='api_leaveperiod'")
            print('api_leaveperiod columns:', list(c.fetchall()))
        except Exception as e:
            print('api_leaveperiod columns error:', e)
        try:
            c.execute('SELECT COUNT(*) FROM api_leaveallocation')
            print('api_leaveallocation COUNT:', c.fetchone()[0])
        except Exception as e:
            print('api_leaveallocation error:', e)
        try:
            c.execute("SELECT column_name, data_type FROM information_schema.columns WHERE table_name='api_leaveallocation'")
            print('api_leaveallocation columns:', list(c.fetchall()))
        except Exception as e:
            print('api_leaveallocation columns error:', e)
