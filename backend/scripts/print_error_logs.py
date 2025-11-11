if __name__ == '__main__':
    import os, sys
    sys.path.insert(0, os.path.dirname(os.path.dirname(__file__)))
    os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'backend.settings')
    import django
    django.setup()

    from api.domain_logs import ErrorLog

    logs = ErrorLog.objects.all().order_by('-created_at')[:30]
    if not logs:
        print('No error logs found.')
    for l in logs:
        print('---')
        print('id:', l.id)
        print('when:', l.created_at)
        print('path:', l.path)
        print('method:', l.method)
        print('user:', getattr(l.user, 'username', None))
        print('message:', l.message)
        print('payload:', l.payload)
        print('stack (truncated):')
        if l.stack:
            print('\n'.join(l.stack.splitlines()[-20:]))
        else:
            print('  <no stack>')

    print('--- total:', logs.count())
