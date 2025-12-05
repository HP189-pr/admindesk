print('=== Auto seed and test script starting ===')
import traceback
try:
    from api.domain_emp import LeaveType, EmpProfile, LeaveAllocation, LeavePeriod, LeaveEntry
    from api.domain_leave_balance import computeLeaveBalances
    from django.db import transaction
    from pprint import pprint

    period = LeavePeriod.objects.filter(is_active=True).first()
    if not period:
        print('No active LeavePeriod found; aborting seed.')
    else:
        print('Active period:', period.id, period.period_name, period.start_date, period.end_date)
        types = LeaveType.objects.filter(is_active=True)
        profiles = EmpProfile.objects.all()
        created = 0
        skipped = 0
        for p in profiles:
            for lt in types:
                try:
                    exists = LeaveAllocation.objects.filter(profile=p, leave_type=lt, period=period).exists()
                except Exception as e:
                    print('Allocation exists check error for', p, lt, '->', e)
                    exists = False
                if not exists:
                    try:
                        LeaveAllocation.objects.create(profile=p, leave_type=lt, period=period, allocated=(lt.annual_allocation or 0))
                        created += 1
                    except Exception as e:
                        print('Failed to create allocation for', p, lt, 'error:', e)
                        skipped += 1
                else:
                    skipped += 1
        print('Seeding complete. created=', created, 'skipped=', skipped)
        try:
            total_allocs = LeaveAllocation.objects.filter(period=period).count()
            print('Total allocations for period:', total_allocs)
        except Exception:
            print('Could not count allocations:', traceback.format_exc())

        # pick or create a test employee
        emp = EmpProfile.objects.first()
        if not emp:
            print('No EmpProfile found; creating test profile...')
            emp = EmpProfile.objects.create(emp_id='TEST1', emp_name='Test User')
            print('Created EmpProfile', emp.emp_id)
        else:
            print('Using EmpProfile', emp.emp_id)

        lt = LeaveType.objects.filter(leave_code__iexact='CL').first() or LeaveType.objects.first()
        if not lt:
            print('No LeaveType found; cannot create test LeaveEntry')
        else:
            print('Using LeaveType', getattr(lt, 'leave_code', getattr(lt, 'id', None)))
            try:
                e = LeaveEntry(emp=emp, leave_type=lt, start_date='2025-05-01', end_date='2025-05-05', status='Approved')
                e.save()
                print('Created LeaveEntry id=', getattr(e, 'id', None), 'total_days=', getattr(e, 'total_days', None))
            except Exception as ex:
                print('Failed to create LeaveEntry:', ex)

        # compute balances using backend function
        try:
            payload = computeLeaveBalances(leaveCalculationDate=None, selectedPeriodId=period.id)
            print('Computed payload keys:', list(payload.keys()))
            emp_entry = None
            for x in payload.get('employees', []):
                if x.get('emp_id') == emp.emp_id or str(x.get('emp_id')) == str(emp.emp_id):
                    emp_entry = x
                    break
            if emp_entry:
                print('Computed entry for employee:')
                pprint(emp_entry)
            else:
                print('No computed entry found for employee', emp.emp_id)
        except Exception as ex:
            print('Failed to compute balances:', ex)

except Exception:
    traceback.print_exc()
print('=== Auto seed and test script finished ===')
