# domain_leave_balance.py
"""
Lightweight leave balance computation engine (clean version).
Provides:
- compute_leave_balances(...) -> canonical computation used by tests / views
- computeLeaveBalances(...) -> backward-compatible wrapper used by views

Rules implemented:
- tracked leave codes: EL, CL, SL, VAC (configurable)
- global allocations (emp=None) and per-employee allocations
- EL/SL waiting period of 1 year after joining (no allocation for new joiners)
- CL prorated for new joiners within first year
- Leave entries split across periods (sandwich flag considered)
- Working days exclude Sundays and Holiday table (if available)
"""
from __future__ import annotations

from collections import defaultdict
from dataclasses import dataclass
from datetime import date
from decimal import Decimal
from typing import Dict, List, Optional, Sequence, Tuple

from django.db.models import QuerySet

# Import your Django models (adjust import path if needed)
from .domain_emp import EmpProfile, LeaveAllocation, LeaveEntry, LeavePeriod, LeaveType
from .domain_core import Holiday

DECIMAL_ZERO = Decimal("0")


@dataclass(frozen=True)
class LeaveComputationConfig:
    """Config knobs for compute_leave_balances."""
    first_period_adds_allocation: bool = False
    clamp_negative: bool = False
    tracked_leave_codes: Sequence[str] = ("EL", "CL", "SL", "VAC")


class LeaveComputationError(Exception):
    pass


def _to_decimal(value: Optional[Decimal]) -> Decimal:
    if value in (None, ""):
        return DECIMAL_ZERO
    if isinstance(value, Decimal):
        return value
    try:
        return Decimal(str(value))
    except Exception:
        return DECIMAL_ZERO


def _effective_day_value(leave_type) -> Decimal:
    """Return the effective day value for a LeaveType (handles half-day types)."""
    if leave_type is None:
        return Decimal("1")
    raw = getattr(leave_type, "day_value", None) or getattr(leave_type, "leave_unit", None)
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
    """Return d + 1 year handling Feb 29."""
    try:
        return d.replace(year=d.year + 1)
    except ValueError:
        return d.replace(month=2, day=28, year=d.year + 1)


def _to_date(value) -> Optional[date]:
    """Convert various date formats to date object."""
    if value is None:
        return None
    if isinstance(value, date):
        return value
    if isinstance(value, str):
        try:
            # Try parsing ISO format YYYY-MM-DD
            from datetime import datetime
            return datetime.strptime(value, '%Y-%m-%d').date()
        except Exception:
            try:
                # Try parsing DD-MM-YYYY format
                from datetime import datetime
                return datetime.strptime(value, '%d-%m-%Y').date()
            except Exception:
                return None
    return None


def _group_code(leave_type) -> Optional[str]:
    """Return the parent group code for a leave type.
    
    This allows HCL1, HCL2 to map to CL group, HSL1 to SL, etc.
    Falls back to the leave_code itself if no parent group is defined.
    """
    if leave_type is None:
        return None
    # Check main_type (db_column: parent_leave) for grouping
    parent = getattr(leave_type, "main_type", None) or getattr(leave_type, "parent_leave", None)
    if parent and str(parent).strip():
        return str(parent).upper()
    # Fallback to the leave_code itself
    code = getattr(leave_type, "leave_code", None)
    return str(code).upper() if code else None


@dataclass
class _PeriodWindow:
    id: int
    name: str
    start: date
    end: date

    @classmethod
    def from_period(cls, period: LeavePeriod) -> "_PeriodWindow":
        return cls(id=period.id, name=period.period_name, start=period.start_date, end=period.end_date)


# -------------------------
# Data loading helpers
# -------------------------
def _load_periods() -> List[_PeriodWindow]:
    qs = LeavePeriod.objects.all().order_by("start_date", "id")
    return [ _PeriodWindow(id=p.id, name=p.period_name, start=p.start_date, end=p.end_date) for p in qs ]


def _load_allocations(period_ids: Sequence[int]) -> List[LeaveAllocation]:
    if not period_ids:
        return []
    # select_related where safe (period only), avoid joining EmpProfile to prevent legacy mismatch
    # Note: LeaveAllocation has leave_code (CharField), not a leave_type FK
    return list(
        LeaveAllocation.objects.select_related("period")
        .filter(period_id__in=list(period_ids))
        .order_by("period_id", "-updated_at")
    )


def _filter_leave_entries(employee_ids: Optional[Sequence[str]], tracked: Sequence[str]) -> QuerySet:
    qs = LeaveEntry.objects.select_related("leave_type").filter(status__iexact=LeaveEntry.STATUS_APPROVED)
    # LeaveEntry.leave_type FK uses to_field="leave_code", so leave_type_id stores the code string (not numeric ID)
    if tracked:
        # Filter directly by leave code strings
        qs = qs.filter(leave_type_id__in=[c.upper() for c in tracked])
    if employee_ids:
        qs = qs.filter(emp_id__in=list(employee_ids))
    return qs


# -------------------------
# Allocation extraction
# -------------------------
def _extract_allocation_for_code(allocation: LeaveAllocation, leave_code: str) -> Decimal:
    # Primary: leave_code field (string)
    alloc_code = getattr(allocation, "leave_code", None)
    if alloc_code and str(alloc_code).upper() == leave_code.upper():
        return _to_decimal(getattr(allocation, "allocated", DECIMAL_ZERO))
    # Fallback to legacy per-code columns
    column_map = {
        "EL": getattr(allocation, "allocated_el", None),
        "CL": getattr(allocation, "allocated_cl", None),
        "SL": getattr(allocation, "allocated_sl", None),
        "VAC": getattr(allocation, "allocated_vac", None),
    }
    val = column_map.get(leave_code)
    return _to_decimal(val)


# -------------------------
# Split leave entry across periods
# -------------------------
def _split_entry_across_periods(
    entry: LeaveEntry,
    periods: Sequence[_PeriodWindow],
    *,
    alloc_flags: Optional[Dict[Tuple[Optional[str], int, str], bool]] = None,
    holidays_set: Optional[set] = None,
    sandwiched_resolver: Optional[callable] = None,
) -> Dict[int, Dict[str, Decimal]]:
    """Split a single leave entry across period windows, returning {period_id: {leave_code: Decimal}}."""
    if not entry.start_date or not entry.end_date:
        return {}
    if entry.end_date < entry.start_date:
        return {}

    code_raw = getattr(entry, "leave_type_id", None) or (getattr(entry.leave_type, "leave_code", None) if getattr(entry, "leave_type", None) else None)
    if not code_raw:
        return {}
    leave_code = str(code_raw).upper()
    
    # Determine the group code (e.g., HCL1 -> CL, HCL2 -> CL)
    leave_type_obj = getattr(entry, "leave_type", None)
    group = _group_code(leave_type_obj) or leave_code
    
    day_value = _effective_day_value(leave_type_obj)

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

        emp_id = getattr(entry, "emp_id", None) or (getattr(entry, "emp", None).emp_id if getattr(entry, "emp", None) else None)
        entry_sandwich = getattr(entry, "sandwich_leave", None)
        if entry_sandwich is True:
            sandwich_applies = True
        elif entry_sandwich is False:
            sandwich_applies = False
        else:
            sandwich_applies = False
            if sandwiched_resolver:
                try:
                    sandwich_applies = bool(sandwiched_resolver(emp_id, period.id, leave_code))
                except Exception:
                    sandwich_applies = False

        if sandwich_applies:
            days_decimal = Decimal((overlap_end - overlap_start).days + 1)
        else:
            if holidays_set is None:
                holidays_set = set()
            cur = overlap_start
            working = 0
            while cur <= overlap_end:
                if cur.weekday() != 6 and cur not in holidays_set:
                    working += 1
                cur = cur.fromordinal(cur.toordinal() + 1)
            days_decimal = Decimal(working)

        amount = days_decimal * day_value
        bucket = result.setdefault(period.id, {})
        # Accumulate usage into the parent group bucket (e.g., HCL1/HCL2 -> CL)
        bucket[group] = bucket.get(group, DECIMAL_ZERO) + amount

    return result


# -------------------------
# Main computation
# -------------------------
def compute_leave_balances(
    *,
    leave_calculation_date: Optional[date] = None,
    employee_ids: Optional[Sequence[str]] = None,
    config: Optional[LeaveComputationConfig] = None,
) -> Dict[str, object]:
    """Compute leave balances per employee per period.

    Returns dict with keys: "employees" (list) and "metadata" (dict).
    """
    cfg = config or LeaveComputationConfig()
    tracked = tuple(cfg.tracked_leave_codes)

    periods = _load_periods()
    if not periods:
        raise LeaveComputationError("No leave periods found; cannot compute balances.")

    # Employees
    emp_qs: QuerySet[EmpProfile] = EmpProfile.objects.all()
    if employee_ids:
        emp_qs = emp_qs.filter(emp_id__in=list(employee_ids))
    employees = list(emp_qs)
    if not employees:
        return {"employees": [], "metadata": {"period_count": len(periods)}}

    # Allocations and entries
    allocations = _load_allocations([p.id for p in periods])
    entries_qs = _filter_leave_entries(employee_ids=employee_ids, tracked=tracked)
    entries = list(entries_qs)

    # Precompute allocation flags and global/employee-specific aggregated allocation buckets
    global_allocs: Dict[int, Dict[str, Decimal]] = defaultdict(lambda: {code: DECIMAL_ZERO for code in tracked})
    employee_allocs: Dict[Tuple[str, int], Dict[str, Decimal]] = defaultdict(lambda: {code: DECIMAL_ZERO for code in tracked})
    alloc_flags: Dict[Tuple[Optional[str], int, str], bool] = {}

    for alloc in allocations:
        pid = getattr(alloc, "period_id", None) or (alloc.period.id if getattr(alloc, "period", None) else None)
        # Access the FK emp field, then get emp_id from it
        emp_fk = getattr(alloc, "emp", None)
        prof = getattr(emp_fk, "emp_id", None) if emp_fk else None
        for code in tracked:
            derived = _extract_allocation_for_code(alloc, code)
            if derived:
                if prof in (None, "", 0):
                    global_allocs[pid][code] = global_allocs[pid][code] + derived
                else:
                    employee_allocs[(str(prof), pid)][code] = employee_allocs[(str(prof), pid)][code] + derived
        # Build flags (sandwich) map
        lt = getattr(alloc, "leave_code", None)
        key_codes = []
        if lt:
            key_codes.append(str(lt).upper())
        key_codes.append('*')
        for kc in key_codes:
            alloc_flags[(str(prof) if prof is not None else None, pid, kc)] = bool(getattr(alloc, "sandwich", False))

    # Load holidays
    try:
        min_start = min((p.start for p in periods))
        max_end = max((p.end for p in periods))
        holiday_qs = Holiday.objects.filter(holiday_date__gte=min_start, holiday_date__lte=max_end).values_list("holiday_date", flat=True)
        holidays_set = set(holiday_qs)
    except Exception:
        holidays_set = set()

    def _is_sandwich_for(emp_id: Optional[str], period_id: int, leave_code: str) -> bool:
        keys = [
            (str(emp_id), period_id, leave_code.upper()),
            (str(emp_id), period_id, "*"),
            (None, period_id, leave_code.upper()),
            (None, period_id, "*"),
        ]
        for k in keys:
            if k in alloc_flags:
                return bool(alloc_flags[k])
        return False

    # Build used days map by splitting entries across periods
    used_days: Dict[Tuple[str, int, str], Decimal] = defaultdict(lambda: DECIMAL_ZERO)
    for entry in entries:
        splits = _split_entry_across_periods(entry, periods, alloc_flags=alloc_flags, holidays_set=holidays_set, sandwiched_resolver=_is_sandwich_for)
        for pid, m in splits.items():
            for code, val in m.items():
                used_days[(entry.emp_id, pid, code)] += _to_decimal(val)

    # Now compute per employee
    response_employees: List[Dict[str, object]] = []
    first_period_start = periods[0].start

    for emp in employees:
        # Determine effective join date
        join_date = None
        for attr in ("actual_joining", "department_joining", "joining_date", "joining"):
            try:
                v = getattr(emp, attr, None)
                if v:
                    join_date = _to_date(v)
                    if join_date:
                        break
            except Exception:
                continue
        calc_date = leave_calculation_date or getattr(emp, "leave_calculation_date", None) or first_period_start
        if isinstance(calc_date, str):
            calc_date = _to_date(calc_date) or first_period_start

        # initial balances (from EmpProfile + joining year allocations)
        balance_attr_map = {
            "EL": getattr(emp, "el_balance", DECIMAL_ZERO),
            "CL": getattr(emp, "cl_balance", DECIMAL_ZERO),
            "SL": getattr(emp, "sl_balance", DECIMAL_ZERO),
            "VAC": getattr(emp, "vacation_balance", DECIMAL_ZERO),
        }
        joining_attr_map = {
            "EL": getattr(emp, "joining_year_allocation_el", DECIMAL_ZERO),
            "CL": getattr(emp, "joining_year_allocation_cl", DECIMAL_ZERO),
            "SL": getattr(emp, "joining_year_allocation_sl", DECIMAL_ZERO),
            "VAC": getattr(emp, "joining_year_allocation_vac", DECIMAL_ZERO),
        }

        balances: Dict[str, Decimal] = {code: _to_decimal(balance_attr_map.get(code, DECIMAL_ZERO)) + _to_decimal(joining_attr_map.get(code, DECIMAL_ZERO)) for code in tracked}

        emp_payload = {
            "emp_id": emp.emp_id,
            "emp_name": getattr(emp, "emp_name", ""),
            "emp_short": getattr(emp, "emp_short", emp.emp_id),
            "designation": getattr(emp, "emp_designation", ""),
            "leave_group": getattr(emp, "leave_group", ""),
            "actual_joining": getattr(emp, "actual_joining", ""),
            "left_date": getattr(emp, "left_date", "") or "Cont",
            "periods": [],
        }

        # Consider periods that end after calculation date
        relevant_periods = [p for p in periods if p.end >= calc_date]
        for idx, period in enumerate(relevant_periods):
            start_snapshot: Dict[str, Decimal] = {}
            alloc_snapshot: Dict[str, Decimal] = {}
            used_snapshot: Dict[str, Decimal] = {}
            end_snapshot: Dict[str, Decimal] = {}
            allocation_meta: Dict[str, Dict[str, object]] = {}

            # base allocations: global + employee-specific
            base_alloc = global_allocs.get(period.id, {code: DECIMAL_ZERO for code in tracked})
            emp_spec = employee_allocs.get((str(emp.emp_id), period.id), {code: DECIMAL_ZERO for code in tracked})

            for code in tracked:
                original_alloc = base_alloc.get(code, DECIMAL_ZERO) + emp_spec.get(code, DECIMAL_ZERO)
                alloc_value = original_alloc
                allocation_allowed = True
                reason = None

                # Determine eligibility / prorating / waiting
                if join_date is None:
                    # veteran
                    alloc_value = original_alloc
                else:
                    if join_date > period.end:
                        allocation_allowed = False
                        reason = "not_joined_yet"
                        alloc_value = DECIMAL_ZERO
                    else:
                        eligible_from = _add_year_safe(join_date)
                        if eligible_from <= period.start:
                            allocation_allowed = True
                            alloc_value = original_alloc
                        else:
                            # within 1 year
                            if code in ("EL", "SL"):
                                allocation_allowed = False
                                reason = "within_waiting_period_for_EL_SL"
                                alloc_value = DECIMAL_ZERO
                            elif code == "CL":
                                period_days = Decimal((period.end - period.start).days + 1)
                                join_effective = join_date if join_date > period.start else period.start
                                if join_effective > period.end:
                                    alloc_value = DECIMAL_ZERO
                                    allocation_allowed = False
                                    reason = "not_joined_yet"
                                else:
                                    days_after_join = Decimal((period.end - join_effective).days + 1)
                                    if period_days > 0 and days_after_join > 0:
                                        alloc_value = (_to_decimal(original_alloc) * (days_after_join / period_days))
                                        allocation_allowed = True
                                        reason = "prorated_CL_for_new_joiner"
                                    else:
                                        alloc_value = DECIMAL_ZERO
                                        allocation_allowed = False
                                        reason = "not_joined_yet"
                            else:
                                alloc_value = original_alloc

                alloc_snapshot[code] = alloc_value
                allocation_meta[code] = {
                    "original_allocation": float(original_alloc),
                    "effective_allocation": float(alloc_value),
                    "applied": bool(allocation_allowed),
                    "reason": reason,
                }

                used_val = used_days.get((emp.emp_id, period.id, code), DECIMAL_ZERO)
                used_snapshot[code] = used_val

                opening = balances.get(code, DECIMAL_ZERO)
                available = opening + alloc_value
                display_start = opening
                if cfg.first_period_adds_allocation and idx == 0:
                    display_start = available
                start_snapshot[code] = display_start

                ending = available - used_val
                if cfg.clamp_negative and ending < DECIMAL_ZERO:
                    ending = DECIMAL_ZERO
                
                # CL does not carry forward - reset to 0 for next period
                # EL and SL carry forward (preserve balance)
                if code == "CL":
                    balances[code] = DECIMAL_ZERO
                else:
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
                    "allocation_meta": allocation_meta,
                }
            )

        response_employees.append(emp_payload)

    metadata = {
        "period_count": len(periods),
        "tracked_leave_codes": list(tracked),
        "periods": [{"id": p.id, "name": p.name, "start": p.start, "end": p.end} for p in periods],
    }

    return {"employees": response_employees, "metadata": metadata}


# -------------------------
# Backwards-compatible wrapper used by your views
# -------------------------
def computeLeaveBalances(*, leaveCalculationDate: Optional[date] = None, selectedPeriodId: Optional[int] = None, periodStart: Optional[date] = None, periodEnd: Optional[date] = None) -> Dict[str, object]:
    """
    Thin wrapper for compute_leave_balances to maintain old signature used in views.
    If selectedPeriodId is provided, we still compute everything but metadata/employee
    periods remain full; callers can pick the period they need. To reduce payload size
    we also optionally filter employee periods to only the selectedPeriodId.
    """
    payload = compute_leave_balances(leave_calculation_date=leaveCalculationDate, config=LeaveComputationConfig())

    if selectedPeriodId:
        for emp in payload.get("employees", []):
            periods = emp.get("periods", [])
            filt = [p for p in periods if p.get("period_id") == selectedPeriodId]
            if filt:
                emp["periods"] = filt

        payload["metadata"]["periods"] = [p for p in payload["metadata"].get("periods", []) if p.get("id") == selectedPeriodId]

    return payload
