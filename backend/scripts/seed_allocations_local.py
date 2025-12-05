from pprint import pprint
print('=== Local seeding: seed_allocations_local ===')
created=0
skipped=0
try:
    from api.domain_emp import LeaveType, EmpProfile, LeaveAllocation, LeavePeriod
    period = LeavePeriod.objects.filter(is_active=True).first()
    if not period:
        print('No active period; abort')
    else:
        print('Active period:', period.id, period.period_name, period.start_date, period.end_date)
        types = LeaveType.objects.filter(is_active=True)
        period_days = (period.end_date - period.start_date).days + 1
        # Create global (profile=None) allocations per leave type to populate legacy per-type columns.
        for lt in types:
                try:
                    annual = float(lt.annual_allocation or 0)
                except Exception:
                    annual = 0.0
                prorated = round(annual * (period_days / 365.0), 2)
                # Prepare per-type allocated_* fields to satisfy legacy schemas
                # Default all per-type columns to 0.0 to avoid NOT NULL DB constraints
                alloc_el = 0.0
                alloc_cl = 0.0
                alloc_sl = 0.0
                alloc_vac = 0.0

                # Derive base code for types like HCL1 -> CL, HEL2 -> EL, HVAC1 -> VAC
                code = (lt.leave_code or '').upper()
                base = code
                # strip leading H (half) prefix
                if base.startswith('H') and len(base) > 1:
                    base = base[1:]
                # strip trailing digits
                import re
                base = re.sub(r"\d+$", "", base)

                if base == 'EL':
                    alloc_el = prorated
                elif base == 'CL':
                    alloc_cl = prorated
                elif base == 'SL':
                    alloc_sl = prorated
                elif base == 'VAC' or base == 'VACATION':
                    alloc_vac = prorated

                exists = LeaveAllocation.objects.filter(profile=None, leave_type=lt, period=period).exists()
                if not exists:
                    try:
                        LeaveAllocation.objects.create(
                            profile=None,
                            leave_type=lt,
                            period=period,
                            allocated=prorated,
                            allocated_el=alloc_el,
                            allocated_cl=alloc_cl,
                            allocated_sl=alloc_sl,
                            allocated_vac=alloc_vac,
                            allocated_start_date=period.start_date,
                            allocated_end_date=period.end_date,
                        )
                        created += 1
                    except Exception as e:
                        print('create error for global', lt, e)
                        skipped += 1
                else:
                    skipped += 1
        print('Done seeding. created=', created, 'skipped=', skipped)
except Exception as e:
    print('ERROR in local seeding:', e)
    import traceback; traceback.print_exc()
print('=== seed_allocations_local finished ===')
