import os
import json

os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'backend.settings')
import django

django.setup()

try:
    from api.domain_leave_balance import computeLeaveBalances
    res = computeLeaveBalances(selectedPeriodId=1)
    print('OK')
    print(json.dumps(res, default=str)[:20000])
except Exception as e:
    import traceback
    traceback.print_exc()
    print('ERROR', e)
