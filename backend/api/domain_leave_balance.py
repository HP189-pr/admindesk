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
    return list(
        LeaveAllocation.objects.select_related("period", "leave_type", "profile")
        .filter(period_id__in=list(period_ids))
        .order_by("period__start_date", "period_id")
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
        join_date = getattr(emp, "actual_joining", None)
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
                original_alloc = alloc_base.get(code, DECIMAL_ZERO) + emp_specific.get(code, DECIMAL_ZERO)
                alloc_value = original_alloc
                allocation_allowed = True
                reason = None
                if code in ("EL", "SL") and join_date:
                    eligible_from = _add_year_safe(join_date)
                    if eligible_from > period.start:
                        allocation_allowed = False
                        reason = "within_waiting_period"
                        alloc_value = DECIMAL_ZERO
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

    day_value = Decimal(str(getattr(entry.leave_type, "day_value", 1) or 1))
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
