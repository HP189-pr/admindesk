# leave_engine.py
"""
Live Leave Balance Engine (single source of truth).

- Auto-carries EL/SL (Option A).
- CL resets at end of period (no carry).
- Prorates allocations when employee joins/leaves within a period.
- Splits leave entries across periods and respects sandwich flag and holidays (uses domain_core.Holiday).
- Rounds EL to nearest integer, others to nearest 0.5 for output consistency.
"""
from __future__ import annotations
from dataclasses import dataclass
from datetime import date, timedelta, datetime
from decimal import Decimal, ROUND_HALF_UP
from typing import Dict, List, Optional, Sequence, Tuple, Any
from collections import defaultdict

from django.db.models import QuerySet
from django.db.models import Q

from .domain_emp import EmpProfile, LeaveAllocation, LeaveEntry, LeavePeriod, LeaveType
from .domain_core import Holiday

DEC0 = Decimal("0")


def _to_decimal(v) -> Decimal:
    if v is None or v == "":
        return DEC0
    if isinstance(v, Decimal):
        return v
    try:
        return Decimal(str(v))
    except Exception:
        return DEC0


def _day_value_for(lt: Optional[LeaveType]) -> Decimal:
    if lt is None:
        return Decimal("1")
    raw = getattr(lt, "day_value", None) or getattr(lt, "leave_unit", None)
    dv = None
    try:
        dv = Decimal(str(raw)) if raw not in (None, "") else None
    except Exception:
        dv = None
    is_half = bool(getattr(lt, "is_half", False))
    if is_half:
        if dv is None or dv >= Decimal("1"):
            return Decimal("0.5")
        return dv
    return dv if dv is not None else Decimal("1")


def _group_code(lt: Optional[LeaveType]) -> Optional[str]:
    if lt is None:
        return None
    parent = getattr(lt, "main_type", None) or getattr(lt, "parent_leave", None)
    if parent and str(parent).strip():
        return str(parent).upper()
    code = getattr(lt, "leave_code", None)
    return str(code).upper() if code else None


def _round_output(val: Decimal, code: str):
    """Round for API output: EL -> nearest integer, others -> nearest 0.5"""
    try:
        v = Decimal(val)
    except Exception:
        v = DEC0
    code = (code or "").upper()
    if code == "EL":
        return int(v.to_integral_value(rounding=ROUND_HALF_UP))
    # round to nearest 0.5
    doubled = (v * 2).quantize(Decimal("1"), rounding=ROUND_HALF_UP)
    half = doubled / Decimal("2")
    # return float for non-integers, int when whole
    if half == half.to_integral_value():
        return int(half)
    return float(half)


@dataclass
class PeriodWindow:
    id: int
    name: str
    start: date
    end: date

    @classmethod
    def from_model(cls, p: LeavePeriod) -> "PeriodWindow":
        return cls(id=p.id, name=p.period_name, start=p.start_date, end=p.end_date)


class LeaveEngine:
    def __init__(self, tracked: Sequence[str] = ("EL", "CL", "SL", "VAC")):
        self.tracked = tuple(x.upper() for x in tracked)

    # -------------------------
    # Data loaders
    # -------------------------
    def load_periods(self) -> List[PeriodWindow]:
        qs = LeavePeriod.objects.all().order_by("start_date", "id")
        return [PeriodWindow.from_model(p) for p in qs]

    def load_allocations_for_periods(self, period_ids: Sequence[int]) -> List[LeaveAllocation]:
        if not period_ids:
            return []
        return list(
            LeaveAllocation.objects.select_related("period")
            .filter(period_id__in=list(period_ids))
            .order_by("period_id", "-updated_at")
        )

    def load_entries(self, employee_ids: Optional[Sequence[str]] = None) -> QuerySet:
        qs = LeaveEntry.objects.select_related("leave_type").filter(status__iexact=LeaveEntry.STATUS_APPROVED)
        if self.tracked:
            qs = qs.filter(
                Q(leave_type__leave_code__in=[c.upper() for c in self.tracked]) |
                Q(leave_type__main_type__in=[c.upper() for c in self.tracked])
            )
        if employee_ids:
            qs = qs.filter(emp_id__in=list(employee_ids))
        return qs

    def load_holidays(self, start: date, end: date) -> set:
        try:
            qs = Holiday.objects.filter(holiday_date__gte=start, holiday_date__lte=end).values_list("holiday_date", flat=True)
            return set(qs)
        except Exception:
            return set()

    # -------------------------
    # Entry splitting
    # -------------------------
    def _split_entry(self, entry: LeaveEntry, periods: List[PeriodWindow], holidays_set: set, sandwiched_resolver=None) -> Dict[int, Dict[str, Decimal]]:
        """Return mapping period_id -> {group_code: Decimal amount}"""
        if not entry.start_date or not entry.end_date or entry.end_date < entry.start_date:
            return {}
        code_raw = getattr(entry, "leave_type_id", None) or (getattr(entry.leave_type, "leave_code", None) if getattr(entry, "leave_type", None) else None)
        if not code_raw:
            return {}
        leave_code = str(code_raw).upper()
        lt_obj = getattr(entry, "leave_type", None)
        group = _group_code(lt_obj) or leave_code
        dv = _day_value_for(lt_obj)

        res: Dict[int, Dict[str, Decimal]] = {}
        for p in periods:
            if p.end < entry.start_date:
                continue
            if p.start > entry.end_date:
                break
            overlap_start = max(entry.start_date, p.start)
            overlap_end = min(entry.end_date, p.end)
            if overlap_start > overlap_end:
                continue

            # resolve sandwich
            entry_sand = getattr(entry, "sandwich_leave", None)
            if entry_sand is True:
                days_decimal = Decimal((overlap_end - overlap_start).days + 1)
            else:
                cur = overlap_start
                working = 0
                while cur <= overlap_end:
                    if cur.weekday() != 6 and cur not in holidays_set:
                        working += 1
                    cur = cur + timedelta(days=1)
                days_decimal = Decimal(working)

            amount = days_decimal * dv
            bucket = res.setdefault(p.id, {})
            bucket[group] = bucket.get(group, DEC0) + amount

        return res

    # -------------------------
    # Core compute
    # -------------------------
    def compute(self, *, employee_ids: Optional[Sequence[str]] = None, leave_calculation_date: Optional[date] = None, config: Optional[dict] = None) -> Dict[str, Any]:
        """
        Returns { employees: [ ... ], metadata: {...} }
        Each employee includes per-period starting/allocation/used/ending for tracked codes.
        """
        periods = self.load_periods()
        if not periods:
            return {"employees": [], "metadata": {"periods": []}}

        period_map = {p.id: p for p in periods}
        allocations = self.load_allocations_for_periods([p.id for p in periods])
        entries_qs = list(self.load_entries(employee_ids))
        min_start = min((p.start for p in periods))
        max_end = max((p.end for p in periods))
        holidays = self.load_holidays(min_start, max_end)

        # aggregate allocations: global per period and per-employee per period
        global_allocs = defaultdict(lambda: {c: DEC0 for c in self.tracked})
        employee_allocs = defaultdict(lambda: {c: DEC0 for c in self.tracked})
        alloc_sandwich_flags = {}  # (emp_id_or_None, period_id, code_or_*) -> bool

        for alloc in allocations:
            pid = getattr(alloc, "period_id", None) or (alloc.period.id if getattr(alloc, "period", None) else None)
            emp_fk = getattr(alloc, "emp", None)
            prof_id = getattr(emp_fk, "emp_id", None) if emp_fk else None
            code = (getattr(alloc, "leave_code", "") or "").upper()

            # prefer explicit leave_code field -> allocate into matching tracked group
            for tcode in self.tracked:
                if code == tcode:
                    amt = _to_decimal(getattr(alloc, "allocated", DEC0))
                    if prof_id in (None, "", 0):
                        global_allocs[pid][tcode] = global_allocs[pid][tcode] + amt
                    else:
                        employee_allocs[(str(prof_id), pid)][tcode] = employee_allocs[(str(prof_id), pid)][tcode] + amt

            # flags
            key_codes = [code, "*"]
            for kc in key_codes:
                alloc_sandwich_flags[(str(prof_id) if prof_id is not None else None, pid, kc)] = bool(getattr(alloc, "sandwich", False))

        # helper to check sandwich
        def is_sandwich(emp_id, pid, code):
            keys = [
                (str(emp_id), pid, code.upper()),
                (str(emp_id), pid, "*"),
                (None, pid, code.upper()),
                (None, pid, "*"),
            ]
            for k in keys:
                if k in alloc_sandwich_flags:
                    return alloc_sandwich_flags[k]
            return False

        # split entries -> used_days[(emp_id, period_id, group)] = Decimal
        used_days = defaultdict(lambda: DEC0)
        for e in entries_qs:
            splits = self._split_entry(e, periods, holidays, sandwiched_resolver=is_sandwich)
            for pid, mapping in splits.items():
                for grp, amt in mapping.items():
                    used_days[(e.emp_id, pid, grp)] += _to_decimal(amt)

        # employees to iterate
        emps_qs = EmpProfile.objects.all()
        if employee_ids:
            emps_qs = emps_qs.filter(emp_id__in=list(employee_ids))
        emps = list(emps_qs)

        result_emps = []
        first_period_start = periods[0].start

        for emp in emps:
            join_date = None
            for attr in ("actual_joining", "department_joining", "joining_date"):
                v = getattr(emp, attr, None)
                if v:
                    join_date = v
                    break
            # ensure join_date is a date object (some records may store strings)
            if isinstance(join_date, str):
                try:
                    join_date = datetime.strptime(join_date, "%Y-%m-%d").date()
                except Exception:
                    try:
                        join_date = datetime.strptime(join_date, "%d-%m-%Y").date()
                    except Exception:
                        join_date = None
            calc_date = leave_calculation_date or getattr(emp, "leave_calculation_date", None) or first_period_start
            if isinstance(calc_date, str):
                try:
                    calc_date = datetime.strptime(calc_date, "%Y-%m-%d").date()
                except Exception:
                    calc_date = first_period_start

            # initial balances from profile + joining year allocations
            balances = {
                "EL": _to_decimal(getattr(emp, "el_balance", DEC0)) + _to_decimal(getattr(emp, "joining_year_allocation_el", DEC0)),
                "CL": _to_decimal(getattr(emp, "cl_balance", DEC0)) + _to_decimal(getattr(emp, "joining_year_allocation_cl", DEC0)),
                "SL": _to_decimal(getattr(emp, "sl_balance", DEC0)) + _to_decimal(getattr(emp, "joining_year_allocation_sl", DEC0)),
                "VAC": _to_decimal(getattr(emp, "vacation_balance", DEC0)) + _to_decimal(getattr(emp, "joining_year_allocation_vac", DEC0)),
            }

            emp_payload = {
                "emp_id": emp.emp_id,
                "emp_name": getattr(emp, "emp_name", ""),
                "emp_short": getattr(emp, "emp_short", emp.emp_id),
                "designation": getattr(emp, "emp_designation", ""),
                "leave_group": getattr(emp, "leave_group", ""),
                "actual_joining": getattr(emp, "actual_joining", ""),
                "left_date": getattr(emp, "left_date", "") or "Cont",
                "periods": []
            }

            # consider periods that end >= calc_date
            relevant_periods = [p for p in periods if p.end >= calc_date]
            for idx, p in enumerate(relevant_periods):
                start_snap = {}
                alloc_snap = {}
                used_snap = {}
                end_snap = {}
                meta_alloc = {}

                base_alloc = global_allocs.get(p.id, {c: DEC0 for c in self.tracked})
                emp_spec = employee_allocs.get((str(emp.emp_id), p.id), {c: DEC0 for c in self.tracked})

                for code in self.tracked:
                    original_alloc = base_alloc.get(code, DEC0) + emp_spec.get(code, DEC0)
                    alloc_value = original_alloc
                    applied = True
                    reason = None

                    # employee active window in period
                    eff_start = p.start
                    if join_date and join_date > eff_start:
                        eff_start = join_date
                    eff_end = p.end
                    left_date = getattr(emp, "left_date", None)
                    if left_date and left_date < eff_end:
                        eff_end = left_date

                    if eff_end < eff_start:
                        applied = False
                        alloc_value = DEC0
                        reason = "not_active"
                    else:
                        # waiting period rules: no EL/SL in first year after join
                        if join_date and code in ("EL", "SL"):
                            join_plus_year = join_date.replace(year=join_date.year + 1) if not (join_date.month == 2 and join_date.day == 29) else join_date.replace(year=join_date.year + 1, day=28)
                            if join_plus_year > p.start:
                                applied = False
                                alloc_value = DEC0
                                reason = "waiting_period_EL_SL"
                        # prorate if joined/left inside period
                        if applied:
                            period_days = Decimal((p.end - p.start).days + 1)
                            active_days = Decimal((eff_end - eff_start).days + 1)
                            if active_days < period_days:
                                alloc_value = _to_decimal(original_alloc) * (active_days / period_days)
                                reason = "prorated"
                            else:
                                alloc_value = _to_decimal(original_alloc)

                    alloc_snap[code] = alloc_value
                    allocation_meta = {
                        "original_allocation": float(_to_decimal(original_alloc)),
                        "effective_allocation": float(_to_decimal(alloc_value)),
                        "applied": applied,
                        "reason": reason,
                    }
                    meta_alloc[code] = allocation_meta

                    used_val = used_days.get((emp.emp_id, p.id, code), DEC0)
                    used_snap[code] = used_val

                    opening = balances.get(code, DEC0)
                    # optionally first_period_adds_allocation can be toggled; default False
                    start_snapshot = opening
                    ending = (opening + alloc_value) - used_val

                    # clamp negative not default; keep negative to reflect overuse unless desired
                    # CL reset rule
                    if code == "CL":
                        balances[code] = DEC0
                    else:
                        balances[code] = ending

                    start_snap[code] = _round_output(start_snapshot, code)
                    alloc_snap[code] = _round_output(alloc_snap[code], code)
                    used_snap[code] = _round_output(used_snap[code], code)
                    end_snap[code] = _round_output(ending, code)

                emp_payload["periods"].append({
                    "period_id": p.id,
                    "period_name": p.name,
                    "period_start": p.start,
                    "period_end": p.end,
                    "starting": start_snap,
                    "allocation": alloc_snap,
                    "used": used_snap,
                    "ending": end_snap,
                    "allocation_meta": meta_alloc
                })

            result_emps.append(emp_payload)

        metadata = {
            "period_count": len(periods),
            "tracked_leave_codes": list(self.tracked),
            "periods": [{"id": p.id, "name": p.name, "start": p.start, "end": p.end} for p in periods]
        }
        return {"employees": result_emps, "metadata": metadata}


# single engine instance
engine = LeaveEngine()
# convenience API
def compute_leave_balances(*, employee_ids: Optional[Sequence[str]] = None, leave_calculation_date: Optional[date] = None) -> Dict:
    return engine.compute(employee_ids=employee_ids, leave_calculation_date=leave_calculation_date)
