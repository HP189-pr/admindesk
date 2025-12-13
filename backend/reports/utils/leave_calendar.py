"""Leave calendar service helpers.

Provides sandwich-aware leave day expansion so the frontend can render
month views without reimplementing business rules in JavaScript.
"""
from __future__ import annotations

from collections import defaultdict
from dataclasses import dataclass
from datetime import date, timedelta
from decimal import Decimal
from typing import Dict, Iterable, List, Sequence, Tuple

from api.domain_core import Holiday
from api.domain_emp import LeaveEntry, LeavePeriod

WEEKEND_DAYS: Tuple[int, ...] = (6,)  # Sunday only
LEAVE_COLOR_MAP = {
    "CL": "#F4B183",
    "HCL1": "#FAD7A0",
    "HCL2": "#FAD7A0",
    "SL": "#9DC3E6",
    "HSL1": "#BDD7EE",
    "HSL2": "#BDD7EE",
    "EL": "#FFF2CC",
    "DL": "#D9D2E9",
    "LWP": "#F4CCCC",
    "VAC": "#FCE5CD",
    "ML": "#F4B6C2",
    "PL": "#CFE2F3",
    "SANDWICH": "#B7B7B7",
    "WEEKEND": "#E7E6E6",
    "HOLIDAY": "#C6E0B4",
}


def decimal_map_to_float(mapping: Dict[str, Decimal]) -> Dict[str, float]:
    """Convert Decimal mapping to plain float dict for JSON serialization."""

    return {key: float(value) for key, value in mapping.items()}


def resolve_period_window(year: int) -> Tuple[date, date, LeavePeriod | None]:
    """Return the configured fiscal period bounds for a given year if available."""

    period = (
        LeavePeriod.objects.filter(start_date__year=year)
        .order_by("-start_date")
        .first()
    )

    if not period:
        period = (
            LeavePeriod.objects.filter(end_date__year=year)
            .order_by("-start_date")
            .first()
        )

    if not period:
        period = (
            LeavePeriod.objects.filter(
                start_date__lte=date(year, 12, 31),
                end_date__gte=date(year, 1, 1),
            )
            .order_by("-start_date")
            .first()
        )

    if period:
        return period.start_date, period.end_date, period

    return date(year, 1, 1), date(year, 12, 31), None


def daterange(start: date, end: date) -> Iterable[date]:
    """Yield every day between start and end (inclusive)."""
    current = start
    while current <= end:
        yield current
        current += timedelta(days=1)


def is_weekend(day: date) -> bool:
    return day.weekday() in WEEKEND_DAYS


def get_holidays(year: int) -> set[date]:
    return set(
        Holiday.objects.filter(holiday_date__year=year).values_list("holiday_date", flat=True)
    )


@dataclass(frozen=True)
class LeaveCalendarResult:
    calendar: Dict[date, str]
    sandwich_days: Sequence[date]


def apply_sandwich_logic(entries: Sequence[LeaveEntry], holidays: set[date]) -> LeaveCalendarResult:
    """Expand leave entries into per-day calendar map and mark sandwich days."""
    calendar: Dict[date, str] = {}

    for entry in entries:
        leave_code = entry.leave_type.leave_code if entry.leave_type else "UNKNOWN"
        for day in daterange(entry.start_date, entry.end_date):
            calendar[day] = leave_code

    sandwich_days: List[date] = []
    ordered = list(entries)
    for idx in range(len(ordered) - 1):
        current = ordered[idx]
        nxt = ordered[idx + 1]
        gap_start = current.end_date + timedelta(days=1)
        gap_end = nxt.start_date - timedelta(days=1)
        if gap_start > gap_end:
            continue
        cursor = gap_start
        gap_block: List[date] = []
        all_weekend_or_holiday = True
        while cursor <= gap_end:
            gap_block.append(cursor)
            if not (is_weekend(cursor) or cursor in holidays):
                all_weekend_or_holiday = False
                break
            cursor += timedelta(days=1)
        if all_weekend_or_holiday and gap_block:
            sandwich_days.extend(gap_block)

    for day in sandwich_days:
        calendar.setdefault(day, "SANDWICH")

    return LeaveCalendarResult(calendar=calendar, sandwich_days=sandwich_days)


def generate_leave_calendar(
    emp_id: str, year: int
) -> Tuple[Dict[str, dict], Dict[str, object], Dict[str, object], Dict[str, object]]:
    """Return (calendar-by-date, summary, metadata, period info).

    Calendar keys are ISO date strings for easy serialization.
    Summary payload includes decimal-precision aggregates by main leave type
    plus child-code breakdowns (sandwich excluded).
    Metadata currently includes sandwich days, color map, holidays, period bounds,
    and monthly aggregates for reporting tables.
    """
    start_window, end_window, period_obj = resolve_period_window(year)

    entries = (
        LeaveEntry.objects.filter(
            emp_id=emp_id,
            start_date__lte=end_window,
            end_date__gte=start_window,
            status__in=[LeaveEntry.STATUS_APPROVED, LeaveEntry.STATUS_PENDING],
        )
        .select_related("leave_type", "emp")
        .order_by("start_date", "end_date")
    )

    # Fetch holidays for both the requested window and spill-over edges
    holiday_years = set(range(start_window.year - 1, end_window.year + 2))
    holidays: set[date] = set()
    for yr in holiday_years:
        holidays.update(get_holidays(yr))

    # Pre-build entry detail map for richer frontend data
    entry_details: Dict[date, List[dict]] = defaultdict(list)
    leave_name_map: Dict[str, str] = {"SANDWICH": "Sandwich"}
    for entry in entries:
        leave_code = entry.leave_type.leave_code if entry.leave_type else "UNKNOWN"
        main_leave_code = getattr(entry.leave_type, "main_type", None) or leave_code
        try:
            day_value = float(entry.leave_type.day_value)
        except (TypeError, ValueError, AttributeError):
            day_value = 1.0
        base_info = {
            "report_no": entry.leave_report_no,
            "leave_type": leave_code,
            "leave_type_name": getattr(entry.leave_type, "leave_name", leave_code),
            "status": entry.status,
            "remark": entry.leave_remark or entry.reason or "",
            "sandwich_leave": entry.sandwich_leave,
            "start_date": entry.start_date.isoformat(),
            "end_date": entry.end_date.isoformat(),
            "main_leave_type": main_leave_code,
            "day_value": day_value,
        }
        leave_name_map.setdefault(leave_code, base_info["leave_type_name"])
        leave_name_map.setdefault(main_leave_code, base_info["leave_type_name"] if main_leave_code == leave_code else main_leave_code)
        for day in daterange(entry.start_date, entry.end_date):
            entry_details[day].append(
                {
                    **base_info,
                    "is_range_start": day == entry.start_date,
                    "is_range_end": day == entry.end_date,
                }
            )

    expanded = apply_sandwich_logic(entries, holidays)

    calendar_payload: Dict[str, dict] = {}
    summary_main: defaultdict[str, Decimal] = defaultdict(lambda: Decimal("0"))
    summary_by_code: defaultdict[str, Decimal] = defaultdict(lambda: Decimal("0"))
    summary_breakdown: Dict[str, defaultdict[str, Decimal]] = defaultdict(
        lambda: defaultdict(lambda: Decimal("0"))
    )
    monthly_summary: Dict[str, defaultdict[str, Decimal]] = defaultdict(
        lambda: defaultdict(lambda: Decimal("0"))
    )

    for day, leave_code in expanded.calendar.items():
        if not (start_window <= day <= end_window):
            continue
        color = LEAVE_COLOR_MAP.get(leave_code, "#9E9E9E")
        iso = day.isoformat()
        entries_for_day = entry_details.get(day, [])
        calendar_payload[iso] = {
            "leave": leave_code,
            "color": color,
            "is_weekend": is_weekend(day),
            "is_holiday": day in holidays,
            "is_sandwich": leave_code == "SANDWICH",
            "entries": entries_for_day,
        }

        month_key = f"{day.year}-{day.month:02d}"

        if leave_code == "SANDWICH":
            monthly_summary[month_key]["SANDWICH"] += Decimal("1")
            continue

        if not entries_for_day:
            continue

        for detail in entries_for_day:
            code = detail.get("leave_type", leave_code)
            main_code = detail.get("main_leave_type") or code
            try:
                day_value = Decimal(str(detail.get("day_value", 1)))
            except (TypeError, ValueError):
                day_value = Decimal("1")

            summary_by_code[code] += day_value
            summary_main[main_code] += day_value
            summary_breakdown[main_code][code] += day_value
            monthly_summary[month_key][main_code] += day_value

    period_payload = {
        "start": start_window.isoformat(),
        "end": end_window.isoformat(),
    }
    if period_obj:
        period_payload.update(
            {
                "id": period_obj.id,
                "name": period_obj.period_name,
                "description": period_obj.description or "",
            }
        )

    summary_payload = {
        "main": decimal_map_to_float(summary_main),
        "by_code": decimal_map_to_float(summary_by_code),
        "breakdown": {
            code: decimal_map_to_float(children) for code, children in summary_breakdown.items()
        },
    }

    metadata = {
        "sandwich_days": [
            d.isoformat() for d in expanded.sandwich_days if start_window <= d <= end_window
        ],
        "color_map": LEAVE_COLOR_MAP,
        "holiday_dates": [
            d.isoformat() for d in holidays if start_window <= d <= end_window
        ],
        "period": period_payload,
        "monthly_summary": {
            month: decimal_map_to_float(values) for month, values in monthly_summary.items()
        },
        "leave_names": leave_name_map,
    }
    return calendar_payload, summary_payload, metadata, period_payload