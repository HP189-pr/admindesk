from pprint import pprint
print('=== Inspecting LeaveAllocations and LeavePeriods ===')
try:
    from api.domain_emp import LeaveAllocation, LeavePeriod
    from django.db import connection
    # Active period
    active = LeavePeriod.objects.filter(is_active=True).first()
    if active:
        print('Active Period:', active.id, active.period_name, str(active.start_date), str(active.end_date))
    else:
        print('No active LeavePeriod')
    qs = LeaveAllocation.objects.all().order_by('-id')
    print('Total LeaveAllocation rows:', qs.count())
    sample = qs[:20]
    rows = []
    for a in sample:
        rows.append({
            'id': a.id,
            'profile_id': getattr(a, 'profile_id', None),
            'emp_id_field': getattr(a, 'emp_id', None) if hasattr(a, 'emp_id') else None,
            'leave_type_id': getattr(a, 'leave_type_id', None),
            'period_id': getattr(a, 'period_id', None),
            'allocated': float(getattr(a, 'allocated', 0)),
            'allocated_start_date': str(getattr(a, 'allocated_start_date', None)),
            'allocated_end_date': str(getattr(a, 'allocated_end_date', None)),
        })
    pprint(rows)
except Exception as e:
    print('ERROR while inspecting allocations:', e)
    import traceback; traceback.print_exc()
print('=== Done ===')
