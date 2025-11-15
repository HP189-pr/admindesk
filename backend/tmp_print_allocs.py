import os, sys
sys.path.insert(0, os.path.dirname(os.path.dirname(__file__)))
os.environ.setdefault('DJANGO_SETTINGS_MODULE','backend.settings')
import django
django.setup()
from api.domain_emp import LeaveAllocation
import json

qs = LeaveAllocation.objects.all().values('id','profile_id','leave_type_id','period_id','allocated')
print(json.dumps(list(qs), default=str))
