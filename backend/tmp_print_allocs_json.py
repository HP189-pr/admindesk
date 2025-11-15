import os, sys
sys.path.insert(0, os.path.dirname(os.path.dirname(__file__)))
os.environ.setdefault('DJANGO_SETTINGS_MODULE','backend.settings')
import django
django.setup()
from api.domain_emp import LeaveAllocation
from api.serializers_emp import LeaveAllocationSerializer
import json
qs = LeaveAllocation.objects.all().select_related('profile')
ser = LeaveAllocationSerializer(qs, many=True)
print(json.dumps(ser.data, indent=2, default=str))
