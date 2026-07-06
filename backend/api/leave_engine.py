# backend/api/leave_engine.py
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

from django.db.models import Case, IntegerField, QuerySet, Value
from django.db.models import Q, When

from .domain_emp import EmpProfile, LeaveAllocation, LeaveEntry, LeavePeriod, LeaveType
from .domain_core import Holiday

DEC0 = Decimal("0")
MAIN_LEAVE_CODES = {"EL", "CL", "SL", "VAC", "DL", "LWP", "ML", "PL", "SPL"}


def _emp_short_order():
    return (
        Case(
            When(emp_short__isnull=True, then=Value(1)),
            default=Value(0),
            output_field=IntegerField(),
        ),
        "emp_short",
        "emp_id",
    )


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
    main_type = getattr(lt, "main_type", None) or getattr(lt, "parent_leave", None)
    if main_type:
        return str(main_type).strip().upper()
    code = getattr(lt, "leave_code", None)
    name = getattr(lt, "leave_name", None)
    if code:
        code = str(code).strip().upper()
    else:
        code = None
    if code and code.startswith("H"):
        half_base = code[1:].rstrip("0123456789")
        if half_base in MAIN_LEAVE_CODES:
            return half_base
    special_code_aliases = {"OTHER/SPECIAL", "OTHERSPECIAL", "SPECIAL", "OTHER SPECIAL"}
    if code in special_code_aliases:
        return "SPL"
    if code and code in MAIN_LEAVE_CODES:
        return code
    if name:
        name_norm = str(name).strip().upper()
        if "SPECIAL" in name_norm:
            return "SPL"
    return code


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


def _parse_date_value(value) -> Optional[date]:
    if isinstance(value, datetime):
        return value.date()
    if isinstance(value, date):
        return value
    if isinstance(value, str):
        for fmt in ("%Y-%m-%d", "%d-%m-%Y"):
            try:
                return datetime.strptime(value, fmt).date()
            except Exception:
                pass
    return None


def _add_one_year(value: date) -> date:
    try:
        return value.replace(year=value.year + 1)
    except ValueError:
        # Feb 29 joins become eligible on Feb 28 in the following year.
        return value.replace(year=value.year + 1, day=28)


def _entitlement_code_for_leave_group(leave_group) -> str:
    normalized = str(leave_group or "").strip().upper()
    if normalized in ("VAC", "VACATION"):
        return "VAC"
    return "EL"


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
    def __init__(self, tracked: Sequence[str] = ("EL", "CL", "SL", "VAC", "DL", "LWP", "ML", "PL", "SPL")):
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
            tracked_codes = [c.upper() for c in self.tracked]
            half_code_filter = Q()
            for code in tracked_codes:
                half_code_filter |= Q(leave_type__leave_code__istartswith=f"H{code}")
            base_filter = (
                Q(leave_type__leave_code__in=tracked_codes) |
                Q(leave_type__main_type__in=tracked_codes) |
                half_code_filter
            )
            if "SPL" in tracked_codes:
                base_filter |= (
                    Q(leave_type__leave_code__in=["OTHER/SPECIAL", "SPECIAL", "OTHER SPECIAL"]) |
                    Q(leave_type__leave_name__icontains="SPECIAL")
                )
            qs = qs.filter(base_filter)
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
        saved_total_days = _to_decimal(getattr(entry, "total_days", None))

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

            if saved_total_days > DEC0:
                if overlap_start == entry.start_date and overlap_end == entry.end_date:
                    amount = saved_total_days
                else:
                    entry_days = Decimal((entry.end_date - entry.start_date).days + 1)
                    overlap_days = Decimal((overlap_end - overlap_start).days + 1)
                    amount = saved_total_days * (overlap_days / entry_days)
            else:
                # Fallback for older rows without total_days.
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
        emps = list(emps_qs.order_by(*_emp_short_order()))

        result_emps = []
        first_period_start = periods[0].start

        for emp in emps:
            leave_group = getattr(emp, "leave_group", "")
            entitlement_code = _entitlement_code_for_leave_group(leave_group)
            other_entitlement_code = "EL" if entitlement_code == "VAC" else "VAC"

            actual_join_date = _parse_date_value(getattr(emp, "actual_joining", None))
            department_join_date = _parse_date_value(getattr(emp, "department_joining", None))
            leave_calc_date = _parse_date_value(getattr(emp, "leave_calculation_date", None))
            left_date = _parse_date_value(getattr(emp, "left_date", None))

            # Employee visibility starts from department joining when present,
            # but never before leave calculation starts.
            join_date = department_join_date or actual_join_date
            if join_date and leave_calc_date:
                effective_employee_start = max(join_date, leave_calc_date)
            elif join_date:
                effective_employee_start = join_date
            else:
                effective_employee_start = leave_calc_date

            # SL/EL/VAC eligibility is based only on actual joining.
            eligibility_date = _add_one_year(actual_join_date) if actual_join_date else None

            allow_opening_balance = True
            if actual_join_date and leave_calc_date:
                allow_opening_balance = (leave_calc_date - actual_join_date).days >= 365
            elif actual_join_date:
                allow_opening_balance = (first_period_start - actual_join_date).days >= 365

            # initial balances from profile; joining-year allocations are treated as a
            # one-time credit in the first active period rather than a permanent opening balance.
            balances = {
                "EL": _to_decimal(getattr(emp, "el_balance", DEC0)),
                "CL": _to_decimal(getattr(emp, "cl_balance", DEC0)),
                "SL": _to_decimal(getattr(emp, "sl_balance", DEC0)),
                "VAC": _to_decimal(getattr(emp, "vacation_balance", DEC0)),
            }
            joining_year_allocations = {
                "EL": _to_decimal(getattr(emp, "joining_year_allocation_el", DEC0)),
                "CL": _to_decimal(getattr(emp, "joining_year_allocation_cl", DEC0)),
                "SL": _to_decimal(getattr(emp, "joining_year_allocation_sl", DEC0)),
                "VAC": _to_decimal(getattr(emp, "joining_year_allocation_vac", DEC0)),
            }
            balances[entitlement_code] = balances.get("EL", DEC0) + balances.get("VAC", DEC0)
            balances[other_entitlement_code] = DEC0
            joining_year_allocations[entitlement_code] = (
                joining_year_allocations.get("EL", DEC0) + joining_year_allocations.get("VAC", DEC0)
            )
            joining_year_allocations[other_entitlement_code] = DEC0
            joining_year_allocation_applied = {code: False for code in joining_year_allocations}

            if not allow_opening_balance:
                balances["EL"] = DEC0
                balances["SL"] = DEC0
                balances["VAC"] = DEC0

            emp_payload = {
                "emp_id": emp.emp_id,
                "emp_name": getattr(emp, "emp_name", ""),
                "emp_short": getattr(emp, "emp_short", emp.emp_id),
                "designation": getattr(emp, "emp_designation", ""),
                "leave_group": leave_group,
                "actual_joining": getattr(emp, "actual_joining", ""),
                "left_date": getattr(emp, "left_date", "") or "Cont",
                "status": getattr(emp, "status", "Active") or "Active",
                "periods": []
            }

            # IMPORTANT: include ALL periods (reports are historical)
            relevant_periods = periods
            for idx, p in enumerate(relevant_periods):
                if effective_employee_start and effective_employee_start > p.end:
                    continue

                if left_date and left_date < p.start:
                    continue

                start_snap = {}
                alloc_snap = {}
                used_snap = {}
                end_snap = {}
                meta_alloc = {}

                base_alloc = dict(global_allocs.get(p.id, {c: DEC0 for c in self.tracked}))
                emp_spec = dict(employee_allocs.get((str(emp.emp_id), p.id), {c: DEC0 for c in self.tracked}))
                for alloc_bucket in (base_alloc, emp_spec):
                    alloc_bucket[entitlement_code] = alloc_bucket.get("EL", DEC0) + alloc_bucket.get("VAC", DEC0)
                    alloc_bucket[other_entitlement_code] = DEC0

                for code in self.tracked:
                    original_alloc = base_alloc.get(code, DEC0) + emp_spec.get(code, DEC0)
                    alloc_value = original_alloc
                    applied = True
                    reason = None

                    # employee active window in period
                    eff_start = p.start
                    if effective_employee_start and effective_employee_start > eff_start:
                        eff_start = effective_employee_start
                    eff_end = p.end
                    if left_date and left_date < eff_end:
                        eff_end = left_date

                    period_active = eff_end >= eff_start
                    if eff_end < eff_start:
                        applied = False
                        alloc_value = DEC0
                        reason = "not_active"
                    else:
                        # CL is always allowed while active. SL/EL/VAC start
                        # only after 1 year of service from actual joining.
                        if eligibility_date and code in ("EL", "SL", "VAC"):
                            if eligibility_date > eff_end:
                                applied = False
                                alloc_value = DEC0
                                reason = "waiting_period"
                            elif eligibility_date > eff_start:
                                eff_start = eligibility_date
                                reason = "waiting_period_prorated"

                        # prorate if joined/left/waiting-period eligibility cuts the period
                        if applied:
                            period_days = Decimal((p.end - p.start).days + 1)
                            active_days = Decimal((eff_end - eff_start).days + 1)
                            if active_days < period_days:
                                alloc_value = _to_decimal(original_alloc) * (active_days / period_days)
                                reason = reason or "prorated"
                            else:
                                alloc_value = _to_decimal(original_alloc)

                    extra_joining_year_allocation = DEC0
                    joining_year_allocation = joining_year_allocations.get(code, DEC0)
                    if (
                        period_active
                        and not joining_year_allocation_applied.get(code, False)
                        and joining_year_allocation != DEC0
                        and applied
                    ):
                        extra_joining_year_allocation = joining_year_allocation
                        alloc_value = _to_decimal(alloc_value) + extra_joining_year_allocation

                    alloc_snap[code] = alloc_value
                    allocation_meta = {
                        "original_allocation": float(_to_decimal(original_alloc) + extra_joining_year_allocation),
                        "effective_allocation": float(_to_decimal(alloc_value)),
                        "applied": applied,
                        "reason": reason,
                    }
                    meta_alloc[code] = allocation_meta

                    if code == entitlement_code:
                        used_val = (
                            used_days.get((emp.emp_id, p.id, "EL"), DEC0)
                            + used_days.get((emp.emp_id, p.id, "VAC"), DEC0)
                        )
                    elif code == other_entitlement_code:
                        used_val = DEC0
                    else:
                        used_val = used_days.get((emp.emp_id, p.id, code), DEC0)
                    used_snap[code] = used_val

                    opening = balances.get(code, DEC0)
                    if code == "SPL":
                        opening = DEC0
                        alloc_value = DEC0
                        alloc_snap[code] = DEC0

                    # optionally first_period_adds_allocation can be toggled; default False
                    start_snapshot = opening
                    ending = (opening + alloc_value) - used_val

                    # clamp negative not default; keep negative to reflect overuse unless desired
                    # CL/SPL reset rule: SPL is period-only usage, not a carried balance.
                    if code in ("CL", "SPL"):
                        balances[code] = DEC0
                    else:
                        balances[code] = ending

                    start_snap[code] = _round_output(start_snapshot, code)
                    alloc_snap[code] = _round_output(alloc_snap[code], code)
                    used_snap[code] = _round_output(used_snap[code], code)
                    end_snap[code] = 0 if code == "SPL" else _round_output(ending, code)

                if period_active:
                    for code in joining_year_allocation_applied:
                        if meta_alloc.get(code, {}).get("applied"):
                            joining_year_allocation_applied[code] = True

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
