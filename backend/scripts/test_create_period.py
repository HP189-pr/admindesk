from api.domain_emp import LeavePeriod
from datetime import date
import traceback
try:
    p = LeavePeriod.objects.create(period_name='TEST PERIOD', start_date=date(2026,1,1), end_date=date(2026,12,31))
    print('Created id:', p.id)
except Exception as e:
    print('Exception creating LeavePeriod:', e)
    traceback.print_exc()
