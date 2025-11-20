"""Leave balance computation utilities.

This module provides a high-level helper ``compute_leave_balances`` that
collates per-period leave balances for each employee from the legacy leave
schema (``EmpProfile``, ``LeaveAllocation``, ``LeaveEntry``, ``LeavePeriod``).

The implementation keeps the business rules listed in the request, notably:

* Base balances start from ``EmpProfile`` balances combined with the
  one-time joining-year allocations.
* Allocations may be employee specific or global (``LeaveAllocation.profile``
  is ``NULL``).
* The EL/SL one-year eligibility rule is enforced.
* Leave usage is considered only for approved entries and is split across
  periods when an entry spans multiple periods.

The function is designed to operate efficiently on the Django ORM by
pre-loading all required rows and working with dictionaries in memory, thus
avoiding per-employee database chatter. Results are returned as plain Python
structures (ready for JSON serialisation).
"""
from __future__ import annotations

from collections import defaultdict
from dataclasses import dataclass
from datetime import date
from decimal import Decimal
from typing import Dict, Iterable, List, Optional, Sequence, Tuple

from django.db.models import QuerySet

from .domain_emp import EmpProfile, LeaveAllocation, LeaveEntry, LeavePeriod
from .domain_emp import LeaveType


DECIMAL_ZERO = Decimal("0")


@dataclass(frozen=True)
class LeaveComputationConfig:
    """Configuration knobs for ``compute_leave_balances``.

    ``first_period_adds_allocation`` controls whether the first period should
    behave like subsequent periods (carry-forward + allocation). The default is
    ``False`` to match the provided spreadsheet expectation where the first
    period "Starting" column reflects the snapshot balance prior to adding the
    current allocation. Toggle to ``True`` if the legacy balances already
    excluded the period allocation and you want the first period to follow the
    generic formula.

    ``clamp_negative`` clamps period endings at zero instead of allowing
    overdrafts. When enabled, the amount that would push the balance below zero
    is logged in the ``overdrawn`` list in the response payload.

    ``tracked_leave_codes`` allows changing which leave codes are included in
    the computation. The default matches the explicit requirement (``EL``/``CL``
    and ``SL``).
    """

    first_period_adds_allocation: bool = False
    clamp_negative: bool = False
    tracked_leave_codes: Sequence[str] = ("EL", "CL", "SL", "VAC")


class LeaveComputationError(Exception):
    """Raised when the computation cannot be completed."""


def _to_decimal(value: Optional[Decimal]) -> Decimal:
    if value in (None, ""):
        return DECIMAL_ZERO
    if isinstance(value, Decimal):
        return value
    return Decimal(str(value))


def _effective_day_value(leave_type) -> Decimal:
    """Return the effective day value for a LeaveType, handling half-day types.

    Rules:
    - If leave_type is None, return 1
    - If leave_type.is_half is True and reported day_value is missing or >= 1,
      treat as 0.5
    - Otherwise use the numeric leave_type.day_value if present, else 1
    """
    if leave_type is None:
        return Decimal("1")
    raw = getattr(leave_type, "day_value", None)
    dv = None
    try:
        if raw not in (None, ""):
            dv = Decimal(str(raw))
    except Exception:
        dv = None
    is_half = bool(getattr(leave_type, "is_half", False))
    if is_half:
        if dv is None or dv >= Decimal("1"):
            return Decimal("0.5")
        return dv
    return dv if dv is not None else Decimal("1")


def _add_year_safe(d: date) -> date:
    """Return ``d`` + 1 year handling leap years gracefully."""

    try:
        return d.replace(year=d.year + 1)
    except ValueError:
        # 29 Feb -> 28 Feb on the next year
        return d.replace(month=2, day=28, year=d.year + 1)


@dataclass
class _PeriodWindow:
    id: int
    name: str
    start: date
    end: date

    @classmethod
    def from_period(cls, period: LeavePeriod) -> "_PeriodWindow":  # pragma: no cover - trivial
        return cls(
            id=period.id,
            name=period.period_name,
            start=period.start_date,
            end=period.end_date,
        )


def compute_leave_balances(
    *,
    leave_calculation_date: Optional[date] = None,
    employee_ids: Optional[Sequence[str]] = None,
    config: Optional[LeaveComputationConfig] = None,
) -> Dict[str, object]:
    """Compute leave balances per employee per period.

    Parameters
    ----------
    leave_calculation_date:
        Global calculation start date. If omitted the per-employee
        ``EmpProfile.leave_calculation_date`` is used, falling back to the first
        available period start date.
    employee_ids:
        Optional subset (EmpProfile.emp_id) to compute. When omitted every
        employee with at least one active period is included.
    config:
        Optional ``LeaveComputationConfig`` instance.

    Returns
    -------
    dict
        Payload with ``employees`` (list) and ``metadata`` (dict). Each employee
        entry carries ``periods`` describing starting balance, allocation, used
        amount, and ending balance for each tracked leave code. All numeric
        values are returned as ``float`` to keep downstream JSON serialisation
        simple.

    Raises
    ------
    LeaveComputationError
        If there are no leave periods available or another fatal condition is
        encountered.
    """

    cfg = config or LeaveComputationConfig()
    tracked = tuple(cfg.tracked_leave_codes)

    periods = _load_periods()
    if not periods:
        raise LeaveComputationError("No leave periods found; cannot compute balances.")

    # Load employees with optional filter
    employees_qs: QuerySet[EmpProfile] = EmpProfile.objects.all()
    if employee_ids:
        employees_qs = employees_qs.filter(emp_id__in=list(employee_ids))
    employees = list(employees_qs)
    if not employees:
        return {"employees": [], "metadata": {"period_count": len(periods)}}

    allocations = _load_allocations([p.id for p in periods])
    entries = list(_filter_leave_entries(employee_ids, tracked))

    return _compute_balances(
        periods=periods,
        employees=employees,
        allocations=allocations,
        entries=entries,
        config=cfg,
        leave_calculation_date=leave_calculation_date,
    )


def compute_leave_balances_from_iterables(
    *,
    periods: Sequence[_PeriodWindow],
    employees: Sequence[EmpProfile],
    allocations: Sequence[LeaveAllocation],
    entries: Sequence[LeaveEntry],
    config: Optional[LeaveComputationConfig] = None,
    leave_calculation_date: Optional[date] = None,
) -> Dict[str, object]:
    """Compute balances from already-loaded collections (test helper)."""

    cfg = config or LeaveComputationConfig()
    return _compute_balances(
        periods=list(periods),
        employees=list(employees),
        allocations=list(allocations),
        entries=list(entries),
        config=cfg,
        leave_calculation_date=leave_calculation_date,
    )


def _load_periods() -> List[_PeriodWindow]:
    periods_qs: QuerySet[LeavePeriod] = LeavePeriod.objects.all().order_by("start_date", "id")
    return [
        _PeriodWindow(
            id=p.id,
            name=p.period_name,
            start=p.start_date,
            end=p.end_date,
        )
        for p in periods_qs
    ]


def _load_allocations(period_ids: Sequence[int]) -> List[LeaveAllocation]:
    if not period_ids:
        return []
    # Avoid select_related('profile') because some deployments store
    # heterogeneous types for the emp/profile FK column and a join may
    # fail due to type mismatch. We still join period and leave_type for
    # convenience.
    # Order allocations so that explicit/profile-specific rows with the
    # newest updates appear first (we prefer newest explicit allocation
    # when multiple exist for same profile+period).
    return list(
        LeaveAllocation.objects.select_related("period", "leave_type")
        .filter(period_id__in=list(period_ids))
        .order_by("period_id", "-updated_at")
    )


def _filter_leave_entries(employee_ids: Optional[Sequence[str]], tracked: Sequence[str]) -> QuerySet[LeaveEntry]:
    entries_qs = (
        LeaveEntry.objects.select_related("leave_type")
        .filter(status__iexact=LeaveEntry.STATUS_APPROVED, leave_type_id__in=tracked)
    )
    if employee_ids:
        entries_qs = entries_qs.filter(emp_id__in=list(employee_ids))
    return entries_qs


def _compute_balances(
    *,
    periods: Sequence[_PeriodWindow],
    employees: Sequence[EmpProfile],
    allocations: Sequence[LeaveAllocation],
    entries: Sequence[LeaveEntry],
    config: LeaveComputationConfig,
    leave_calculation_date: Optional[date],
) -> Dict[str, object]:
    tracked = tuple(config.tracked_leave_codes)

    # Maps keyed by period or (emp_id, period_id)
    global_allocs: Dict[int, Dict[str, Decimal]] = defaultdict(lambda: {code: DECIMAL_ZERO for code in tracked})
    employee_allocs: Dict[Tuple[str, int], Dict[str, Decimal]] = defaultdict(
        lambda: {code: DECIMAL_ZERO for code in tracked}
    )

    for alloc in allocations:
        period_id = alloc.period_id
        bucket = (
            global_allocs[period_id]
            if alloc.profile_id is None
            else employee_allocs[(alloc.profile_id, period_id)]
        )
        for code in tracked:
            derived = _extract_allocation_for_code(alloc, code)
            if derived:
                bucket[code] = bucket[code] + derived

    used_days: Dict[Tuple[str, int, str], Decimal] = defaultdict(lambda: DECIMAL_ZERO)
    for entry in entries:
        period_splits = _split_entry_across_periods(entry, periods)
        for period_id, used_map in period_splits.items():
            for code, value in used_map.items():
                used_days[(entry.emp_id, period_id, code)] += value

    response_employees: List[Dict[str, object]] = []
    overdrawn: List[Dict[str, object]] = []

    if not periods:
        return {
            "employees": [],
            "metadata": {"period_count": 0, "tracked_leave_codes": tracked, "overdrawn": overdrawn},
        }

    first_period_start = periods[0].start

    for emp in employees:
        # Resolve effective joining date: prefer actual_joining, then department_joining, then joining_date
        join_date = None
        for attr in ("actual_joining", "department_joining", "joining_date", "joining"):
            jd = getattr(emp, attr, None)
            if jd:
                join_date = jd
                break
        calc_date = leave_calculation_date or getattr(emp, "leave_calculation_date", None) or first_period_start
        relevant_periods = [p for p in periods if p.end >= calc_date]
        if not relevant_periods:
            continue

        balance_attr_map = {
            "EL": "el_balance",
            "CL": "cl_balance",
            "SL": "sl_balance",
            "VAC": "vacation_balance",
        }
        joining_attr_map = {
            "EL": "joining_year_allocation_el",
            "CL": "joining_year_allocation_cl",
            "SL": "joining_year_allocation_sl",
            "VAC": "joining_year_allocation_vac",
        }

        balances = {code: DECIMAL_ZERO for code in tracked}
        for code, attr in balance_attr_map.items():
            if code in tracked:
                balances[code] = _to_decimal(getattr(emp, attr, DECIMAL_ZERO))

        joining_alloc = {code: DECIMAL_ZERO for code in tracked}
        for code, attr in joining_attr_map.items():
            if code in tracked:
                joining_alloc[code] = _to_decimal(getattr(emp, attr, DECIMAL_ZERO))

        for code in tracked:
            balances[code] = balances.get(code, DECIMAL_ZERO) + joining_alloc.get(code, DECIMAL_ZERO)

        emp_payload = {
            "emp_id": emp.emp_id,
            "emp_name": getattr(emp, "emp_name", ""),
            "periods": [],
        }

        for index, period in enumerate(relevant_periods):
            start_snapshot: Dict[str, Decimal] = {}
            alloc_snapshot: Dict[str, Decimal] = {}
            used_snapshot: Dict[str, Decimal] = {}
            end_snapshot: Dict[str, Decimal] = {}
            allocation_meta: Dict[str, Dict[str, object]] = {}

            alloc_base = global_allocs.get(period.id, {code: DECIMAL_ZERO for code in tracked})
            emp_specific = employee_allocs.get((emp.emp_id, period.id), {code: DECIMAL_ZERO for code in tracked})


            for code in tracked:
                # resolved original allocation from global + employee-specific (precedence already summed)
                original_alloc = alloc_base.get(code, DECIMAL_ZERO) + emp_specific.get(code, DECIMAL_ZERO)
                alloc_value = original_alloc
                allocation_allowed = True
                reason = None

                # If employee has no effective join date, treat as veteran (apply allocations)
                if join_date is None:
                    # nothing to change
                    pass
                else:
                    # Future joiner: not joined yet for this period
                    if join_date > period.end:
                        allocation_allowed = False
                        reason = "not_joined_yet"
                        alloc_value = DECIMAL_ZERO
                    else:
                        # Determine veteran vs new joiner: veteran if joined at least 1 year before period.start
                        eligible_from = _add_year_safe(join_date)
                        if eligible_from <= period.start:
                            # veteran: full allocations apply
                            allocation_allowed = True
                            reason = None
                            alloc_value = original_alloc
                        else:
                            # new joiner within waiting period for EL/SL
                            if code in ("EL", "SL"):
                                allocation_allowed = False
                                reason = "within_waiting_period_for_EL_SL"
                                alloc_value = DECIMAL_ZERO
                            elif code == "CL":
                                # prorate CL allocation from effective_joining_date up to period.end
                                period_days = Decimal((period.end - period.start).days + 1)
                                join_effective = join_date if join_date > period.start else period.start
                                if join_effective > period.end:
                                    days_after_join = Decimal(0)
                                else:
                                    days_after_join = Decimal((period.end - join_effective).days + 1)
                                if period_days > 0 and days_after_join > 0:
                                    # use exact decimal prorating; caller may format to desired precision
                                    prorated = ( _to_decimal(original_alloc) * (days_after_join / period_days) )
                                    alloc_value = prorated
                                    allocation_allowed = True
                                    reason = "prorated_CL_for_new_joiner"
                                else:
                                    alloc_value = DECIMAL_ZERO
                                    allocation_allowed = False
                                    reason = "not_joined_yet"
                            else:
                                # other codes (VAC etc) default to full allocation
                                allocation_allowed = True
                                reason = None
                                alloc_value = original_alloc

                alloc_snapshot[code] = alloc_value
                allocation_meta[code] = {
                    "original_allocation": float(original_alloc),
                    "effective_allocation": float(alloc_value),
                    "applied": allocation_allowed,
                    "reason": reason,
                }

                used_value = used_days.get((emp.emp_id, period.id, code), DECIMAL_ZERO)
                used_snapshot[code] = used_value

                opening = balances.get(code, DECIMAL_ZERO)
                available = opening + alloc_value
                display_start = opening
                if config.first_period_adds_allocation and index == 0:
                    display_start = available
                start_snapshot[code] = display_start
                ending = available - used_value
                if config.clamp_negative and ending < DECIMAL_ZERO:
                    overdrawn.append(
                        {
                            "emp_id": emp.emp_id,
                            "period_id": period.id,
                            "leave_code": code,
                            "overdrawn": float(abs(ending)),
                        }
                    )
                    ending = DECIMAL_ZERO
                balances[code] = ending
                end_snapshot[code] = ending

            emp_payload["periods"].append(
                {
                    "period_id": period.id,
                    "period_name": period.name,
                    "period_start": period.start,
                    "period_end": period.end,
                    "starting": {code: float(start_snapshot.get(code, DECIMAL_ZERO)) for code in tracked},
                    "allocation": {code: float(alloc_snapshot.get(code, DECIMAL_ZERO)) for code in tracked},
                    "used": {code: float(used_snapshot.get(code, DECIMAL_ZERO)) for code in tracked},
                    "ending": {code: float(end_snapshot.get(code, DECIMAL_ZERO)) for code in tracked},
                    "allocation_meta": {code: allocation_meta.get(code, {}) for code in tracked},
                }
            )

        response_employees.append(emp_payload)

    return {
        "employees": response_employees,
        "metadata": {
            "period_count": len(periods),
            "tracked_leave_codes": tracked,
            "overdrawn": overdrawn,
            "periods": [
                {
                    "id": p.id,
                    "name": p.name,
                    "start": p.start,
                    "end": p.end,
                }
                for p in periods
            ],
        },
    }


def _extract_allocation_for_code(allocation: LeaveAllocation, leave_code: str) -> Decimal:
    # Priority: dedicated per-type column > polymorphic ``allocated`` for matching leave type.
    column_map = {
        "EL": getattr(allocation, "allocated_el", None),
        "CL": getattr(allocation, "allocated_cl", None),
        "SL": getattr(allocation, "allocated_sl", None),
        "VAC": getattr(allocation, "allocated_vac", None),
    }
    column_value = column_map.get(leave_code)
    if column_value not in (None, ""):
        return _to_decimal(column_value)
    alloc_code = getattr(allocation, "leave_type_id", None)
    if alloc_code and alloc_code.upper() == leave_code.upper():
        return _to_decimal(allocation.allocated)
    return DECIMAL_ZERO


def _split_entry_across_periods(entry: LeaveEntry, periods: Sequence[_PeriodWindow]) -> Dict[int, Dict[str, Decimal]]:
    """Split a leave entry across overlapping periods.

    Returns a mapping ``{period_id: {leave_code: Decimal(amount)}}``. Entries
    that do not intersect any tracked period yield an empty dict.
    """

    if not entry.start_date or not entry.end_date:
        return {}
    if entry.end_date < entry.start_date:
        return {}

    leave_code = entry.leave_type_id or (entry.leave_type.leave_code if entry.leave_type else None)
    if not leave_code:
        return {}

    day_value = _effective_day_value(getattr(entry, 'leave_type', None))
    result: Dict[int, Dict[str, Decimal]] = {}

    for period in periods:
        if period.end < entry.start_date:
            continue
        if period.start > entry.end_date:
            break
        overlap_start = max(entry.start_date, period.start)
        overlap_end = min(entry.end_date, period.end)
        if overlap_start > overlap_end:
            continue
        days = Decimal((overlap_end - overlap_start).days + 1)
        amount = days * day_value
        bucket = result.setdefault(period.id, {})
        bucket[leave_code] = bucket.get(leave_code, DECIMAL_ZERO) + amount

    return result


def computeLeaveBalances(*, leaveCalculationDate: Optional[date] = None, selectedPeriodId: Optional[int] = None, periodStart: Optional[date] = None, periodEnd: Optional[date] = None) -> Dict[str, object]:
    """Compute leave balances following the exact rules requested.

    Parameters:
        leaveCalculationDate: date used to locate initial period P0 and as fallback in effective join date.
        selectedPeriodId: if provided, can be used to limit output or highlight a period.
        periodStart/periodEnd: optional override for period bounds (not used by default).

    Returns: payload dict matching the required output structure.
    """
    # load and order periods
    periods_qs = LeavePeriod.objects.all().order_by('start_date', 'id')
    periods = [_PeriodWindow(id=p.id, name=p.period_name, start=p.start_date, end=p.end_date) for p in periods_qs]
    if not periods:
        return {"employees": [], "metadata": {"periods": []}}

    # determine P0: period that contains leaveCalculationDate or next after it
    calc_date = leaveCalculationDate
    if calc_date is None:
        # fallback to first period start
        calc_date = periods[0].start

    p0 = None
    for p in periods:
        if p.start <= calc_date <= p.end:
            p0 = p
            break
        if calc_date < p.start:
            p0 = p
            break
    if p0 is None:
        p0 = periods[0]

    # load employees
    employees = list(EmpProfile.objects.all())

    # load leave types for day_value (not strictly required here but kept for mapping)
    leavetype_map = {lt.leave_code.upper(): (lt.leave_code.upper(), getattr(lt, 'day_value', getattr(lt, 'leave_unit', 1))) for lt in LeaveType.objects.all()}

    # pre-aggregate leave entries (approved only)
    entries_qs = LeaveEntry.objects.select_related('leave_type').filter(status__iexact='APPROVED')
    entries = list(entries_qs)

    # build used map: (emp_id, period_id, code) -> Decimal
    used_days: Dict[Tuple[str, int, str], Decimal] = defaultdict(lambda: DECIMAL_ZERO)
    for entry in entries:
        # map leave code: legacy LeaveEntry doesn't have `leave_code`; use FK id or related object
        code_raw = (
            getattr(entry, 'leave_type_id', None)
            or (getattr(entry.leave_type, 'leave_code', None) if getattr(entry, 'leave_type', None) else None)
            or ''
        )
        code_raw = str(code_raw).upper()
        day_value = Decimal(str(getattr(entry.leave_type, 'leave_unit', getattr(entry.leave_type, 'day_value', 1)) or 1))
        # create simple namespace to reuse splitter
        class _E: pass
        e = _E()
        e.start_date = entry.start_date
        e.end_date = entry.end_date
        e.leave_type_id = code_raw
        e.leave_type = entry.leave_type
        splits = _split_entry_across_periods(e, periods)
        for period_id, m in splits.items():
            for lc, val in m.items():
                # val already includes day_value multiplication in splitter
                used_days[(entry.emp_id, period_id, lc)] += _to_decimal(val)

    # load allocations for periods
    period_ids = [p.id for p in periods]
    # avoid select_related('profile') since legacy schema may use mismatched types
    # and a join can fail; use the raw profile_id value instead
    alloc_qs = LeaveAllocation.objects.filter(period_id__in=period_ids)
    # map allocations: by (emp_id, period_id) and global by period
    alloc_map_emp: Dict[Tuple[str, int], LeaveAllocation] = {}
    alloc_map_global: Dict[int, LeaveAllocation] = {}
    for a in alloc_qs:
        pid = a.period_id
        # prefer raw profile_id to avoid triggering a FK join
        prof_id = getattr(a, 'profile_id', None) or getattr(a, 'emp_id', None)
        if prof_id:
            alloc_map_emp[(str(prof_id), pid)] = a
        else:
            alloc_map_global[pid] = a

    # helper to resolve allocation row for emp and period
    def resolve_alloc(emp_id: str, period_id: int) -> Optional[LeaveAllocation]:
        key = (str(emp_id), period_id)
        if key in alloc_map_emp:
            return alloc_map_emp[key]
        return alloc_map_global.get(period_id)

    response_employees: List[Dict[str, object]] = []

    # iterate employees and carry-forward from P0
    for emp in employees:
        # effective joining date per spec: COALESCE(actual_joining, department_joining, leaveCalculationDate)
        effective_join = getattr(emp, 'actual_joining', None)
        if not effective_join:
            # department_joining may be stored as string; try to parse
            dj = getattr(emp, 'department_joining', None)
            if dj:
                # try ISO first
                try:
                    effective_join = date.fromisoformat(str(dj))
                except Exception:
                    # try dd-mm-yyyy or dd/mm/yyyy
                    try:
                        from datetime import datetime

                        effective_join = datetime.strptime(str(dj), '%d-%m-%Y').date()
                    except Exception:
                        try:
                            effective_join = datetime.strptime(str(dj), '%d/%m/%Y').date()
                        except Exception:
                            effective_join = None
        if not effective_join:
            effective_join = getattr(emp, 'leave_calculation_date', None) or calc_date

        # initialize balances at P0
        cur_el = _to_decimal(getattr(emp, 'el_balance', DECIMAL_ZERO)) + _to_decimal(getattr(emp, 'joining_year_allocation_el', DECIMAL_ZERO))
        cur_cl = _to_decimal(getattr(emp, 'cl_balance', DECIMAL_ZERO)) + _to_decimal(getattr(emp, 'joining_year_allocation_cl', DECIMAL_ZERO))
        cur_sl = _to_decimal(getattr(emp, 'sl_balance', DECIMAL_ZERO)) + _to_decimal(getattr(emp, 'joining_year_allocation_sl', DECIMAL_ZERO))

        emp_payload = { 'emp_id': emp.emp_id, 'emp_name': getattr(emp, 'emp_name', ''), 'periods': [] }

        start_index = 0
        for i, p in enumerate(periods):
            if p.id == p0.id:
                start_index = i
                break

        balances = {'EL': cur_el, 'CL': cur_cl, 'SL': cur_sl}

        for period in periods[start_index:]:
            # resolve allocation row
            alloc_row = resolve_alloc(emp.emp_id, period.id)
            orig_el = _to_decimal(getattr(alloc_row, 'allocated_el', DECIMAL_ZERO)) if alloc_row else DECIMAL_ZERO
            orig_cl = _to_decimal(getattr(alloc_row, 'allocated_cl', DECIMAL_ZERO)) if alloc_row else DECIMAL_ZERO
            orig_sl = _to_decimal(getattr(alloc_row, 'allocated_sl', DECIMAL_ZERO)) if alloc_row else DECIMAL_ZERO

            alloc_meta = {}
            alloc_effective = {}

            # apply one-year and prorate logic
            for code, original_alloc in (('EL', orig_el), ('CL', orig_cl), ('SL', orig_sl)):
                applied = True
                reason = None
                effective_val = original_alloc

                if effective_join is None:
                    # treat as veteran
                    applied = True
                    effective_val = original_alloc
                else:
                    # future joiner
                    if effective_join > period.end:
                        applied = False
                        reason = 'not_joined_yet'
                        effective_val = DECIMAL_ZERO
                    else:
                        eligible_from = _add_year_safe(effective_join)
                        if eligible_from <= period.start:
                            # veteran
                            applied = True
                            effective_val = original_alloc
                        else:
                            # new joiner within waiting period
                            if code in ('EL', 'SL'):
                                applied = False
                                reason = 'within_waiting_period_for_EL_SL'
                                effective_val = DECIMAL_ZERO
                            elif code == 'CL':
                                period_days = Decimal((period.end - period.start).days + 1)
                                join_effective = effective_join if effective_join > period.start else period.start
                                if join_effective > period.end:
                                    days_eligible = Decimal(0)
                                else:
                                    days_eligible = Decimal((period.end - join_effective).days + 1)
                                if period_days > 0 and days_eligible > 0:
                                    effective_val = _to_decimal(original_alloc) * (days_eligible / period_days)
                                    applied = True
                                    reason = 'prorated_cl_for_new_joiner'
                                else:
                                    effective_val = DECIMAL_ZERO
                                    applied = False
                                    reason = 'not_joined_yet'

                alloc_meta[code] = {
                    'applied': bool(applied),
                    'reason': reason,
                    'original_allocation': float(original_alloc),
                    'effective_allocation': float(effective_val),
                }
                alloc_effective[code] = effective_val

            # starting balances
            starting = { 'EL': float(balances['EL']), 'CL': float(balances['CL']), 'SL': float(balances['SL']) }

            # allocation effective for this period
            allocation = { code: float(_to_decimal(alloc_effective[code])) for code in ('EL','CL','SL') }

            # used for this period
            used = {}
            for code in ('EL','CL','SL'):
                used_val = used_days.get((emp.emp_id, period.id, code), DECIMAL_ZERO)
                used[code] = float(used_val)

            # compute ending and carry forward
            ending = {}
            for code in ('EL','CL','SL'):
                start_val = _to_decimal(balances[code])
                eff = _to_decimal(alloc_effective[code])
                used_val = _to_decimal(used[code])
                after = start_val + eff
                endv = after - used_val
                ending[code] = float(endv)
                balances[code] = endv

            emp_payload['periods'].append({
                'period_id': period.id,
                'period_start': period.start,
                'period_end': period.end,
                'effective_joining_date': effective_join,
                'starting': starting,
                'allocation': allocation,
                'used': used,
                'ending': ending,
                'allocation_meta': alloc_meta,
            })

        response_employees.append(emp_payload)

    metadata = {'periods': [{'id': p.id, 'name': p.name, 'start': p.start, 'end': p.end} for p in periods]}
    return {'employees': response_employees, 'metadata': metadata}


# ---------------------------------------------------------------------------
# New persistent snapshot computation runner
# Implements the rules described by product requirements and upserts into
# `api_leavebalancesnapshot`.
# ---------------------------------------------------------------------------

from django.db import connection
import json
from django.utils import timezone


def loadEmployeesWithEffectiveJoin():
    """Return list of EmpProfile objects with computed attribute
    `effective_joining_date` resolved from actual_joining, department_joining,
    or `leave_calculation_date`/None. Also include `left_date` as-is.
    """
    emps = list(EmpProfile.objects.all())
    for emp in emps:
        eff = getattr(emp, 'actual_joining', None)
        if not eff:
            dj = getattr(emp, 'department_joining', None)
            if dj:
                try:
                    eff = date.fromisoformat(str(dj))
                except Exception:
                    try:
                        from datetime import datetime

                        eff = datetime.strptime(str(dj), '%d-%m-%Y').date()
                    except Exception:
                        try:
                            eff = datetime.strptime(str(dj), '%d/%m/%Y').date()
                        except Exception:
                            eff = None
        if not eff:
            eff = getattr(emp, 'leave_calculation_date', None)
        setattr(emp, 'effective_joining_date', eff)
    return emps


def loadPeriods():
    return [ _PeriodWindow(id=p.id, name=p.period_name, start=p.start_date, end=p.end_date) for p in LeavePeriod.objects.all().order_by('start_date','id') ]


def loadAllocations(period_ids):
    if not period_ids:
        return []
    # Avoid select_related('profile') to prevent legacy-type join issues
    return list(LeaveAllocation.objects.filter(period_id__in=list(period_ids)).order_by('period_id'))


def loadLeaveEntriesSplitByPeriod(employee_ids, periods):
    """Return mapping (emp_id, period_id, leave_code) -> Decimal used days
    considering only APPROVED entries, splitting across periods and clamping
    to left_date when necessary.
    """
    tracked_codes = None  # include all found codes
    # restrict entries to those that intersect the combined period span
    if not periods:
        return defaultdict(lambda: DECIMAL_ZERO)
    span_start = min(p.start for p in periods)
    span_end = max(p.end for p in periods)
    entries_qs = (
        LeaveEntry.objects.select_related('leave_type')
        .filter(status__iexact=LeaveEntry.STATUS_APPROVED, end_date__gte=span_start, start_date__lte=span_end)
    )
    if employee_ids:
        entries_qs = entries_qs.filter(emp_id__in=list(employee_ids))
    used_days = defaultdict(lambda: DECIMAL_ZERO)
    for entry in entries_qs:
        # clamp by left_date if profile has left
        left = None
        try:
            left = getattr(entry.emp, 'left_date', None) if getattr(entry, 'emp', None) else None
        except Exception:
            left = None
        s = entry.start_date
        e = entry.end_date
        if left and left < e:
            e = left
        if e < s:
            continue
        # determine leave code
        code_raw = (getattr(entry, 'leave_type_id', None) or (getattr(entry.leave_type, 'leave_code', None) if getattr(entry, 'leave_type', None) else None) or '')
        code = str(code_raw).upper()
        day_value = Decimal(str(getattr(entry.leave_type, 'leave_unit', getattr(entry.leave_type, 'day_value', 1)))) if getattr(entry, 'leave_type', None) else Decimal('1')
        # create temporary object for splitting
        class _E: pass
        eobj = _E()
        eobj.start_date = s
        eobj.end_date = e
        eobj.leave_type_id = code
        eobj.leave_type = entry.leave_type
        splits = _split_entry_across_periods(eobj, periods)
        for period_id, m in splits.items():
            for lc, val in m.items():
                used_days[(entry.emp_id, period_id, lc)] += _to_decimal(val)
    return used_days


def _resolve_allocation_for_emp_period(emp_id, period_id, allocations):
    # allocations is list of LeaveAllocation objects
    # prefer employee-specific (profile emp_id) else global (profile NULL)
    emp_key = str(emp_id)
    # Collect explicit allocations for this emp+period (ordered by updated_at desc by loader)
    specific = [a for a in allocations if getattr(a, 'profile_id', None) and str(getattr(a, 'profile_id')) == emp_key and a.period_id == period_id]
    if specific:
        # allocations are pre-ordered with newest first; return the newest
        return specific[0]
    # fallback to global allocation for the period; prefer newest updated
    global_allocs = [a for a in allocations if (getattr(a, 'profile_id', None) in (None, '')) and a.period_id == period_id]
    if global_allocs:
        return global_allocs[0]
    return None


def computeEmployeePeriodBalance(emp, period, alloc_obj, used_map):
    """Compute starting, allocation, used, ending for codes EL, CL, SL, VAC and others.

    Returns dict with keys: starting, allocation, used, ending, carry_forward, allocation_meta, allocation_start_date, allocation_end_date, effective_joining_date
    """
    tracked = ('EL','CL','SL','VAC')
    # determine starting: for first period use profile balances + joining_year allocations,
    # otherwise calling code should pass starting value via emp._running_balances
    # Here expect emp has attribute _starting_balances set by caller.
    starting = getattr(emp, '_starting_balances', {code: DECIMAL_ZERO for code in tracked})
    effective_join = getattr(emp, 'effective_joining_date', None)
    left_date = getattr(emp, 'left_date', None)

    # resolve original allocations
    original = {code: DECIMAL_ZERO for code in tracked}
    if alloc_obj:
        original['EL'] = _to_decimal(getattr(alloc_obj, 'allocated_el', None) or 0)
        original['CL'] = _to_decimal(getattr(alloc_obj, 'allocated_cl', None) or 0)
        original['SL'] = _to_decimal(getattr(alloc_obj, 'allocated_sl', None) or 0)
        original['VAC'] = _to_decimal(getattr(alloc_obj, 'allocated_vac', None) or 0)
    # fallback: if leave_type matches, use allocated field
    # but we expect per-type columns present; keep generic fallback
    alloc_effective = {code: DECIMAL_ZERO for code in tracked}
    allocation_meta = {}
    period_days = Decimal((period.end - period.start).days + 1)

    def _prorate(base_amount, eligible_start, eligible_end):
        if eligible_start is None or eligible_end is None:
            return DECIMAL_ZERO
        if eligible_end < eligible_start:
            return DECIMAL_ZERO
        eligible_days = Decimal((eligible_end - eligible_start).days + 1)
        if period_days <= 0:
            return DECIMAL_ZERO
        return _to_decimal(base_amount) * (eligible_days / period_days)

    # handle leaving before period start: no allocation
    if left_date and left_date < period.start:
        for code in tracked:
            alloc_effective[code] = DECIMAL_ZERO
            allocation_meta[code] = {'applied': False, 'reason': 'left_before_period'}
        allocation_start_date = None
        allocation_end_date = None
    else:
        # compute per code
        for code in tracked:
            orig = original.get(code, DECIMAL_ZERO)
            # determine eligible window
            if left_date and left_date >= period.start and left_date <= period.end:
                alloc_end = left_date
            else:
                alloc_end = period.end

            if effective_join is None:
                # veteran: full allocation
                alloc_effective[code] = _to_decimal(orig)
                allocation_meta[code] = {'applied': True, 'reason': None, 'original_allocation': float(orig), 'effective_allocation': float(_to_decimal(orig))}
            else:
                # if joined after period end -> no allocation
                if effective_join > period.end:
                    alloc_effective[code] = DECIMAL_ZERO
                    allocation_meta[code] = {'applied': False, 'reason': 'not_joined_yet', 'original_allocation': float(orig), 'effective_allocation': 0.0}
                else:
                    eligible_start = period.start if effective_join <= period.start else effective_join
                    # determine 1-year waiting: veteran if effective_join +1yr <= period.start
                    eligible_from = _add_year_safe(effective_join)
                    if eligible_from <= period.start:
                        # veteran
                        alloc_effective[code] = _to_decimal(orig)
                        allocation_meta[code] = {'applied': True, 'reason': None, 'original_allocation': float(orig), 'effective_allocation': float(_to_decimal(orig))}
                    else:
                        # within 1-year
                        if code in ('EL','SL'):
                            # no allocation
                            alloc_effective[code] = DECIMAL_ZERO
                            allocation_meta[code] = {'applied': False, 'reason': 'within_waiting_period_for_EL_SL', 'original_allocation': float(orig), 'effective_allocation': 0.0}
                        elif code == 'CL':
                            # prorate from eligible_start to alloc_end
                            effective_val = _prorate(orig, eligible_start, alloc_end)
                            alloc_effective[code] = effective_val
                            allocation_meta[code] = {'applied': True if effective_val > DECIMAL_ZERO else False, 'reason': 'prorated_CL_for_new_joiner', 'original_allocation': float(orig), 'effective_allocation': float(effective_val)}
                        else:
                            alloc_effective[code] = _to_decimal(orig)
                            allocation_meta[code] = {'applied': True, 'reason': None, 'original_allocation': float(orig), 'effective_allocation': float(_to_decimal(orig))}
        allocation_start_date = None
        allocation_end_date = None

    # compute used from used_map
    used = {code: _to_decimal(used_map.get((emp.emp_id, period.id, code), DECIMAL_ZERO)) for code in tracked}
    # starting_after_allocation
    starting_after = {code: _to_decimal(starting.get(code, DECIMAL_ZERO)) + _to_decimal(alloc_effective.get(code, DECIMAL_ZERO)) for code in tracked}
    ending = {code: starting_after[code] - used.get(code, DECIMAL_ZERO) for code in tracked}
    carry_forward = ending.copy()

    return {
        'starting': {code: float(starting.get(code, DECIMAL_ZERO)) for code in tracked},
        'allocated': {code: float(alloc_effective.get(code, DECIMAL_ZERO)) for code in tracked},
        'used': {code: float(used.get(code, DECIMAL_ZERO)) for code in tracked},
        'ending': {code: float(ending.get(code, DECIMAL_ZERO)) for code in tracked},
        'carry_forward': {code: float(carry_forward.get(code, DECIMAL_ZERO)) for code in tracked},
        'allocation_meta': allocation_meta,
        'allocation_start_date': allocation_start_date,
        'allocation_end_date': allocation_end_date,
        'effective_joining_date': getattr(emp, 'effective_joining_date', None),
    }


def upsertSnapshot(emp, period, period_data, alloc_obj=None, emp_pk: Optional[int] = None):
    """Upsert a snapshot row into `api_leavebalancesnapshot` for emp and period.

    Compose columns using the period_data produced by computeEmployeePeriodBalance.
    Use raw SQL ON CONFLICT upsert keyed by (emp_id, period_id) — if such
    constraint doesn't exist this will raise; caller should ensure DB schema.
    """
    try:
        starting = period_data.get('starting', {})
        allocated = period_data.get('allocated', {})
        used = period_data.get('used', {})
        ending = period_data.get('ending', {})
        carry = period_data.get('carry_forward', {})
        meta = period_data.get('allocation_meta', {})
        eff_join = period_data.get('effective_joining_date')
        alloc_start = period_data.get('allocation_start_date')
        alloc_end = period_data.get('allocation_end_date')

        # Resolve profile PK if caller didn't pass it
        if emp_pk is None:
            with connection.cursor() as cur:
                cur.execute("SELECT id FROM api_empprofile WHERE emp_id = %s", [getattr(emp, 'emp_id', None)])
                row = cur.fetchone()
                if not row:
                    print(f"[WARN] upsertSnapshot: skipping emp {getattr(emp,'emp_id', None)} - no matching EmpProfile PK found")
                    return
                emp_pk = row[0]

        params = {
            'emp_id': emp_pk,
            'period_id': period.id,
            'balance_date': period.start,
            'allocation_id': getattr(alloc_obj, 'id', None) if alloc_obj is not None else None,
            'allocation_start_date': alloc_start,
            'allocation_end_date': alloc_end,
            'effective_joining_date': eff_join,
            'starting_el': starting.get('EL', 0.0),
            'allocated_el': allocated.get('EL', 0.0),
            'used_el': used.get('EL', 0.0),
            'ending_el': ending.get('EL', 0.0),
            'carry_forward_el': carry.get('EL', 0.0),
            'starting_cl': starting.get('CL', 0.0),
            'allocated_cl': allocated.get('CL', 0.0),
            'used_cl': used.get('CL', 0.0),
            'ending_cl': ending.get('CL', 0.0),
            'carry_forward_cl': carry.get('CL', 0.0),
            'starting_sl': starting.get('SL', 0.0),
            'allocated_sl': allocated.get('SL', 0.0),
            'used_sl': used.get('SL', 0.0),
            'ending_sl': ending.get('SL', 0.0),
            'carry_forward_sl': carry.get('SL', 0.0),
            'ending_vacation': ending.get('VAC', 0.0),
            'used_vacation': used.get('VAC', 0.0),
            'notes': json.dumps(meta, default=str),
        }

        with connection.cursor() as cur:
            # Safe upsert: do not rely on DB unique index changes. Select existing row by emp_id+period_id.
            cur.execute("SELECT id FROM api_leavebalancesnapshot WHERE emp_id = %s AND period_id = %s", [params['emp_id'], params['period_id']])
            row = cur.fetchone()
            if row:
                snap_id = row[0]
                cur.execute(
                    """
                    UPDATE api_leavebalancesnapshot SET
                      balance_date = %s,
                      allocation_id = %s,
                      allocation_start_date = %s,
                      allocation_end_date = %s,
                      effective_joining_date = %s,
                      el_balance = %s,
                      cl_balance = %s,
                      sl_balance = %s,
                      vacation_balance = %s,
                      starting_el = %s,
                      allocated_el = %s,
                      used_el = %s,
                      ending_el = %s,
                      carry_forward_el = %s,
                      starting_cl = %s,
                      allocated_cl = %s,
                      used_cl = %s,
                      ending_cl = %s,
                      starting_sl = %s,
                      allocated_sl = %s,
                      used_sl = %s,
                      ending_sl = %s,
                      carry_forward_sl = %s,
                      ending_vacation = %s,
                      used_vacation = %s,
                      notes = %s,
                      snapshot_date = now(),
                      updated_at = now()
                    WHERE id = %s
                    """,
                    [
                        params['balance_date'],
                        params['allocation_id'],
                        params['allocation_start_date'],
                        params['allocation_end_date'],
                        params['effective_joining_date'],
                        # system balance columns (not-null in legacy schema)
                        params['ending_el'],
                        params['ending_cl'],
                        params['ending_sl'],
                        params['ending_vacation'],
                        # detailed columns
                        params['starting_el'],
                        params['allocated_el'],
                        params['used_el'],
                        params['ending_el'],
                        params['carry_forward_el'],
                        params['starting_cl'],
                        params['allocated_cl'],
                        params['used_cl'],
                        params['ending_cl'],
                        params['starting_sl'],
                        params['allocated_sl'],
                        params['used_sl'],
                        params['ending_sl'],
                        params['carry_forward_sl'],
                        params['ending_vacation'],
                        params['used_vacation'],
                        params['notes'],
                        snap_id,
                    ],
                )
            else:
                cur.execute(
                    """
                    INSERT INTO api_leavebalancesnapshot
                    (emp_id, period_id, balance_date, allocation_id, allocation_start_date, allocation_end_date, effective_joining_date,
                     el_balance, cl_balance, sl_balance, vacation_balance,
                     starting_el, allocated_el, used_el, ending_el, carry_forward_el,
                     starting_cl, allocated_cl, used_cl, ending_cl,
                     starting_sl, allocated_sl, used_sl, ending_sl, carry_forward_sl,
                     ending_vacation, used_vacation, notes, snapshot_date, created_at, updated_at)
                    VALUES (%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,now(),now(),now())
                    """,
                    [
                        params['emp_id'], params['period_id'], params['balance_date'], params['allocation_id'], params['allocation_start_date'], params['allocation_end_date'], params['effective_joining_date'],
                        # main system balance columns
                        params['ending_el'], params['ending_cl'], params['ending_sl'], params['ending_vacation'],
                        # detailed columns
                        params['starting_el'], params['allocated_el'], params['used_el'], params['ending_el'], params['carry_forward_el'],
                        params['starting_cl'], params['allocated_cl'], params['used_cl'], params['ending_cl'],
                        params['starting_sl'], params['allocated_sl'], params['used_sl'], params['ending_sl'], params['carry_forward_sl'],
                        params['ending_vacation'], params['used_vacation'], params['notes'],
                    ],
                )
    except Exception:
        import traceback
        print('[WARN] upsertSnapshot failed:')
        traceback.print_exc()
        # Re-raise so outer caller's savepoint/atomic can rollback cleanly
        raise


def compute_and_persist_leave_balances(period_id: Optional[int] = None):
    """Main runner: compute balances for all employees from their P0 and
    persist snapshots for each (emp, period).

    If `period_id` is provided, restrict allocations/periods to that period
    and compute for all employees for that single period (useful for on-demand recompute).
    """
    periods = loadPeriods()
    if not periods:
        return {'employees': [], 'metadata': {'periods': []}}

    period_map = {p.id: p for p in periods}
    selected_periods = [period_map[period_id]] if period_id and period_id in period_map else periods

    from django.db import transaction

    employees = loadEmployeesWithEffectiveJoin()
    employee_ids = [e.emp_id for e in employees]
    allocations = loadAllocations([p.id for p in selected_periods])
    # pre-aggregate approved leave entries that intersect the selected periods
    used_map = loadLeaveEntriesSplitByPeriod(employee_ids, selected_periods)

    results = []
    # resolve emp_id -> pk mapping in a single query to avoid per-row lookups in upsert
    emp_pk_map = {}
    if employee_ids:
        with connection.cursor() as cur:
            # returns rows of (emp_id, id) where emp_id is the string identifier
            cur.execute("SELECT emp_id, id FROM api_empprofile WHERE emp_id = ANY(%s)", [employee_ids])
            for r in cur.fetchall():
                emp_pk_map[str(r[0])] = r[1]

    # Preload snapshots for previous period when computing a single period (seed starting balances)
    prev_snapshot_map = {}
    if period_id:
        # find previous period (by ordering)
        idx = next((i for i, p in enumerate(periods) if p.id == period_id), None)
        prev_id = periods[idx - 1].id if idx is not None and idx > 0 else None
        if prev_id:
            with connection.cursor() as cur:
                # join to api_empprofile to obtain the string emp_id key
                cur.execute(
                    "SELECT p.emp_id, s.ending_el, s.ending_cl, s.ending_sl, s.ending_vacation FROM api_leavebalancesnapshot s JOIN api_empprofile p ON p.id = s.emp_id WHERE s.period_id = %s",
                    [prev_id],
                )
                for r in cur.fetchall():
                    prev_snapshot_map[str(r[0])] = {
                        'EL': _to_decimal(r[1] or 0),
                        'CL': _to_decimal(r[2] or 0),
                        'SL': _to_decimal(r[3] or 0),
                        'VAC': _to_decimal(r[4] or 0) if len(r) > 4 else DECIMAL_ZERO,
                    }

    # initialize starting balances on each employee object
    for emp in employees:
        emp._starting_balances = {
            'EL': _to_decimal(getattr(emp, 'el_balance', DECIMAL_ZERO)) + _to_decimal(getattr(emp, 'joining_year_allocation_el', DECIMAL_ZERO)),
            'CL': _to_decimal(getattr(emp, 'cl_balance', DECIMAL_ZERO)) + _to_decimal(getattr(emp, 'joining_year_allocation_cl', DECIMAL_ZERO)),
            'SL': _to_decimal(getattr(emp, 'sl_balance', DECIMAL_ZERO)) + _to_decimal(getattr(emp, 'joining_year_allocation_sl', DECIMAL_ZERO)),
            'VAC': _to_decimal(getattr(emp, 'vacation_balance', DECIMAL_ZERO)),
        }
        # if previous snapshot exists for this emp (when computing single period), seed
        if period_id and prev_snapshot_map.get(emp.emp_id):
            emp._starting_balances.update(prev_snapshot_map.get(emp.emp_id))

    # Run persistence: iterate periods then employees to ensure one snapshot per emp+period.
    # Each upsert runs inside its own atomic savepoint so a single failing upsert
    # does not leave the connection in an aborted state and does not abort the
    # whole batch.
    for p in selected_periods:
        for emp in employees:
            # skip employees who left before this period starts
            left_date = getattr(emp, 'left_date', None)
            if left_date and left_date < p.start:
                continue

            # skip periods before the employee's calculation start
            calc_date = getattr(emp, 'leave_calculation_date', None) or getattr(emp, 'effective_joining_date', None) or periods[0].start
            if p.end < calc_date:
                continue

            # resolve allocation for this emp & period
            alloc_obj = _resolve_allocation_for_emp_period(emp.emp_id, p.id, allocations)

            pdata = computeEmployeePeriodBalance(emp, p, alloc_obj, used_map)

            # persist snapshot per spec inside a savepoint/atomic to isolate failures
            emp_pk = emp_pk_map.get(str(getattr(emp, 'emp_id', '')))
            try:
                with transaction.atomic():
                    upsertSnapshot(emp, p, pdata, alloc_obj, emp_pk=emp_pk)
            except Exception:
                # log and continue to next employee; individual failures rollback to savepoint
                print(f"[WARN] upsert for emp {getattr(emp,'emp_id',None)} period {p.id} failed; continuing")

            # carry forward for next period
            emp._starting_balances = {code: _to_decimal(pdata['carry_forward'].get(code, DECIMAL_ZERO)) for code in ('EL','CL','SL','VAC')}

            # collect result for response
            results.append({'emp_id': emp.emp_id, 'period_id': p.id, 'data': pdata})

    return {'employees': results, 'metadata': {'periods': [ { 'id': p.id, 'start': p.start, 'end': p.end } for p in periods ]}}


def snapshots_fresh_for_period(period_id: int) -> bool:
    """Return True if snapshots exist for period_id and are newer than
    latest relevant changes in allocations/entries/profiles for that period.
    """
    if not period_id:
        return False
    # get latest snapshot timestamp
    with connection.cursor() as cur:
        cur.execute("SELECT MAX(snapshot_date) FROM api_leavebalancesnapshot WHERE period_id = %s", [period_id])
        row = cur.fetchone()
        snap_ts = row[0] if row else None
    if not snap_ts:
        return False

    # compute last change among allocations, entries and profiles relevant to this period
    with connection.cursor() as cur:
        # allocations for the period
        cur.execute("SELECT MAX(COALESCE(updated_at, created_at)) FROM api_leaveallocation WHERE period_id = %s", [period_id])
        a_row = cur.fetchone()
        alloc_ts = a_row[0] if a_row else None

        # leave entries that intersect the period
        cur.execute("SELECT start_date, end_date FROM api_leaveperiod WHERE id = %s", [period_id])
        p_row = cur.fetchone()
        if not p_row:
            return False
        p_start, p_end = p_row[0], p_row[1]
        cur.execute("SELECT MAX(COALESCE(updated_at, created_at, approved_at)) FROM api_leaveentry WHERE status ILIKE 'APPROVED' AND end_date >= %s AND start_date <= %s", [p_start, p_end])
        e_row = cur.fetchone()
        entry_ts = e_row[0] if e_row else None

        # employee profile changes
        cur.execute("SELECT MAX(COALESCE(updated_at, created_at)) FROM api_empprofile")
        ep_row = cur.fetchone()
        profile_ts = ep_row[0] if ep_row else None

    # determine latest change
    latest = None
    for t in (alloc_ts, entry_ts, profile_ts):
        if t and (latest is None or t > latest):
            latest = t

    if not latest:
        # no changes recorded; treat snapshots as fresh
        return True

    # if snapshot timestamp >= latest change => fresh
    return snap_ts >= latest
