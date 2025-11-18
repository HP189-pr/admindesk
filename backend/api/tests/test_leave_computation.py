from types import SimpleNamespace
from datetime import date, timedelta
from decimal import Decimal

from api.domain_leave_balance import (
    _PeriodWindow,
    compute_leave_balances_from_iterables,
    LeaveComputationConfig,
)


def make_emp(emp_id, emp_name='X', el=0, cl=0, sl=0, vacation=0, actual_joining=None, joining_year_alloc_el=0, joining_year_alloc_cl=0, joining_year_alloc_sl=0):
    e = SimpleNamespace()
    e.emp_id = emp_id
    e.emp_name = emp_name
    e.el_balance = Decimal(str(el))
    e.cl_balance = Decimal(str(cl))
    e.sl_balance = Decimal(str(sl))
    e.vacation_balance = Decimal(str(vacation))
    e.actual_joining = actual_joining
    e.department_joining = None
    e.leave_calculation_date = None
    e.joining_year_allocation_el = Decimal(str(joining_year_alloc_el))
    e.joining_year_allocation_cl = Decimal(str(joining_year_alloc_cl))
    e.joining_year_allocation_sl = Decimal(str(joining_year_alloc_sl))
    return e


def make_alloc(emp_id, period_id, allocated_el=0, allocated_cl=0, allocated_sl=0):
    a = SimpleNamespace()
    # legacy LeaveAllocation uses profile_id when serialized; compute functions use profile_id
    a.profile_id = emp_id
    a.period_id = period_id
    a.allocated_el = Decimal(str(allocated_el))
    a.allocated_cl = Decimal(str(allocated_cl))
    a.allocated_sl = Decimal(str(allocated_sl))
    a.leave_type_id = None
    a.allocated = None
    return a


def make_entry(emp_id, start, end, leave_code='CL', day_value=1):
    e = SimpleNamespace()
    e.emp_id = emp_id
    e.start_date = start
    e.end_date = end
    e.leave_type_id = leave_code
    e.leave_type = SimpleNamespace()
    setattr(e.leave_type, 'day_value', day_value)
    return e


def test_veteran_all_allocations_apply():
    # Period covering Jan 1 - Dec 31
    p = _PeriodWindow(id=1, name='P1', start=date(2024,1,1), end=date(2024,12,31))
    emp = make_emp('E1', el=10, cl=2, sl=5)
    # global allocations
    alloc = make_alloc(None, 1, allocated_el=12, allocated_cl=6, allocated_sl=8)

    res = compute_leave_balances_from_iterables(periods=[p], employees=[emp], allocations=[alloc], entries=[], config=LeaveComputationConfig())
    employees = res['employees']
    assert len(employees) == 1
    ent = employees[0]
    period_entry = ent['periods'][0]
    # starting = profile + joining_year_alloc (none)
    assert period_entry['starting']['EL'] == 10.0
    assert period_entry['allocation']['EL'] == 12.0
    assert period_entry['ending']['EL'] == 22.0


def test_new_joiner_one_year_wait_EL_SL_and_prorated_CL():
    # Period 1: Jan 1 - Dec 31 2024
    p = _PeriodWindow(id=1, name='P1', start=date(2024,1,1), end=date(2024,12,31))
    # New joiner on 2024-09-01 -> within first year for this period
    emp = make_emp('E2', el=0, cl=0, sl=0, actual_joining=date(2024,9,1))
    # allocations: EL 12, CL 6
    alloc = make_alloc('E2', 1, allocated_el=12, allocated_cl=6, allocated_sl=8)

    res = compute_leave_balances_from_iterables(periods=[p], employees=[emp], allocations=[alloc], entries=[], config=LeaveComputationConfig())
    ent = res['employees'][0]
    pe = ent['periods'][0]
    # EL and SL should be zero due to one-year waiting
    assert pe['allocation']['EL'] == 0.0
    assert pe['allocation']['SL'] == 0.0
    # CL prorated from 2024-09-01 to 2024-12-31 -> 122 days of 366? but function uses period days inclusive (365)
    # expected prorated roughly: 6 * (122/365) ~ 2.008 -> allow small tolerance
    assert abs(pe['allocation']['CL'] - (6.0 * ((date(2024,12,31) - date(2024,9,1)).days + 1) / ((date(2024,12,31) - date(2024,1,1)).days + 1))) < 0.01


def test_entry_spanning_two_periods_is_split():
    # Periods: P1 Jan-Jun, P2 Jul-Dec
    p1 = _PeriodWindow(id=1, name='P1', start=date(2024,1,1), end=date(2024,6,30))
    p2 = _PeriodWindow(id=2, name='P2', start=date(2024,7,1), end=date(2024,12,31))
    emp = make_emp('E3', el=0, cl=0, sl=0)
    # No allocations
    # Create an approved leave entry from Jun 25 to Jul 5 (11 days) for CL
    entry = make_entry('E3', date(2024,6,25), date(2024,7,5), leave_code='CL')

    res = compute_leave_balances_from_iterables(periods=[p1,p2], employees=[emp], allocations=[], entries=[entry], config=LeaveComputationConfig())
    ent = res['employees'][0]
    # find p1 and p2 periods
    p1_entry = next((pp for pp in ent['periods'] if pp['period_id'] == 1), None)
    p2_entry = next((pp for pp in ent['periods'] if pp['period_id'] == 2), None)
    assert p1_entry is not None and p2_entry is not None
    # used in p1 should cover 6 days (Jun25-30) and p2 should cover 5 days (Jul1-5)
    assert abs(p1_entry['used']['CL'] - 6.0) < 0.01
    assert abs(p2_entry['used']['CL'] - 5.0) < 0.01
