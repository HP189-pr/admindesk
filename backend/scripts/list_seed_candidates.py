from pprint import pprint
from api.domain_emp import LeaveAllocation, LeavePeriod
import json

p = LeavePeriod.objects.filter(is_active=True).first()
print('Active period:', p.id if p else None)
qs = LeaveAllocation.objects.filter(profile=None, period=p) if p else LeaveAllocation.objects.none()
print('Candidates count:', qs.count())

data = [
    {
        'id': a.id,
        'leave_type_id': a.leave_type_id,
        'allocated': float(a.allocated or 0),
        'allocated_el': float(getattr(a,'allocated_el',0) or 0),
        'allocated_cl': float(getattr(a,'allocated_cl',0) or 0),
        'allocated_sl': float(getattr(a,'allocated_sl',0) or 0),
        'allocated_vac': float(getattr(a,'allocated_vac',0) or 0),
        'start': getattr(a,'allocated_start_date', None),
        'end': getattr(a,'allocated_end_date', None),
    }
    for a in qs
]
print(json.dumps(data, default=str, indent=2))
