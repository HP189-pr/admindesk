import os
import sys
import json
import django
# ensure project root on path
proj_root = os.path.abspath(os.path.join(os.path.dirname(__file__), '..'))
if proj_root not in sys.path:
	sys.path.insert(0, proj_root)
os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'backend.settings')
django.setup()
from api.domain_emp import LeaveType, LeavePeriod
print('LEAVETYPES:' + json.dumps(list(LeaveType.objects.all().values()), default=str))
print('LEAVEPERIODS:' + json.dumps(list(LeavePeriod.objects.all().values()), default=str))
