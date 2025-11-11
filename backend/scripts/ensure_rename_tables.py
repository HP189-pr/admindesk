from django.db import connection

def run_rename():
    renames = [
        ('leave_period','api_leaveperiod'),
        ('leave_type','api_leavetype'),
        ('leave_entry','api_leaveentry'),
        ('leave_balances','api_leavebalancesnapshot'),
        ('leavea_llocation_general','api_leaveallocation'),
    ]

    with connection.cursor() as c:
        for old, new in renames:
            try:
                c.execute("SELECT to_regclass(%s)", [old])
                exists_old = c.fetchone()[0]
                c.execute("SELECT to_regclass(%s)", [new])
                exists_new = c.fetchone()[0]
                if exists_old and not exists_new:
                    print(f"Renaming {old} -> {new}")
                    c.execute(f'ALTER TABLE "{old}" RENAME TO "{new}"')
                else:
                    print(f"Skipping {old} -> {new}: exists_old={exists_old} exists_new={exists_new}")
            except Exception as e:
                print(f"Error handling {old} -> {new}: {e}")


if __name__ == '__main__':
    # Setup Django environment when run as a script
    import os, sys
    sys.path.insert(0, os.path.dirname(os.path.dirname(__file__)))
    os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'backend.settings')
    import django
    django.setup()
    run_rename()
