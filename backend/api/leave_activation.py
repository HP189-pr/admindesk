from __future__ import annotations

from datetime import timedelta
from decimal import Decimal, ROUND_HALF_UP
import logging

from django.db import transaction
from django.utils import timezone

from .domain_emp import (
    LeavePeriod,
    LeaveAllocation,
    LeaveEntry,
    EmpProfile,
    LeaveType,
    LeaveBalanceSnapshot,
)

logger = logging.getLogger(__name__)


def round_half(x: float) -> float:
    d = Decimal(str(x))
    return float((d * 2).quantize(Decimal('1'), rounding=ROUND_HALF_UP) / 2)


def days_inclusive(start, end):
    return (end - start).days + 1


def _is_carry_allowed(leave_type: LeaveType) -> bool:
    code = (leave_type.leave_code or '').upper()
    return code.startswith('EL') or code.startswith('SL')


def _is_reset_at_end(leave_type: LeaveType) -> bool:
    code = (leave_type.leave_code or '').upper()
    return code.startswith('CL')


@transaction.atomic
def activate_period(period_id: int) -> dict:
    """Activate a LeavePeriod by computing carry-forward and allocating prorated allocations.

    This is idempotent: running it multiple times will upsert allocations and snapshots.
    Returns a summary dict with counts.
    """
    summary = {'created_allocations': 0, 'updated_allocations': 0, 'snapshots': 0}
    period = LeavePeriod.objects.filter(pk=period_id).first()
    if not period:
        raise ValueError('Period not found')

    # find previous period (end date before this period start). choose latest that ends before start.
    prev = LeavePeriod.objects.filter(end_date__lt=period.start_date).order_by('-end_date').first()

    profiles = EmpProfile.objects.all()
    leave_types = LeaveType.objects.filter(is_active=True)

    for prof in profiles:
        # optional: create a balance snapshot for previous closing
        for lt in leave_types:
            # compute previous allocated and used
            allocated_prev = 0.0
            used_prev = 0.0
            opening_prev = 0.0

            if prev:
                # sum allocations for prev period
                alloc = LeaveAllocation.objects.filter(profile=prof, leave_type=lt, period=prev).first()
                if alloc:
                    allocated_prev = float(alloc.allocated or 0)
                # compute used from approved entries overlapping prev
                used_entries = LeaveEntry.objects.filter(
                    emp=prof,
                    leave_type=lt,
                    status__iexact='Approved',
                    start_date__lte=prev.end_date,
                    end_date__gte=prev.start_date,
                )
                used_total = 0.0
                for e in used_entries:
                    s = max(e.start_date, prev.start_date)
                    t = min(e.end_date, prev.end_date)
                    if t >= s:
                        used_total += days_inclusive(s, t) * float(e.leave_type.day_value if e.leave_type else 1)
                used_prev = used_total

                # opening_prev try to read from allocation opening (not persisted separately in current schema)
                # approximate opening_prev = allocated_prev - used_prev at period start (since we don't have opening stored)
                opening_prev = max(0.0, allocated_prev - used_prev)

            closing_prev = opening_prev + allocated_prev - used_prev

            # compute carry
            carry = 0.0
            if _is_reset_at_end(lt):
                carry = 0.0
            else:
                if _is_carry_allowed(lt) and closing_prev > 0:
                    carry = closing_prev
            carry = round_half(carry)

            # compute allocation for this period: existing allocation rows may be auto-seeded; we will prorate the allocated value
            # find existing allocation (if seeded) and adjust by adding carry
            alloc_curr = LeaveAllocation.objects.filter(profile=prof, leave_type=lt, period=period).first()
            if alloc_curr:
                new_alloc = float(alloc_curr.allocated or 0) + carry
                new_alloc = round_half(new_alloc)
                if abs(new_alloc - float(alloc_curr.allocated or 0)) > 0.0001:
                    alloc_curr.allocated = new_alloc
                    alloc_curr.save()
                    summary['updated_allocations'] += 1
            else:
                # create allocation with carry as opening allocation; if the leave type has annual_allocation we add that too
                base_alloc = float(lt.annual_allocation or 0)
                total_alloc = round_half(base_alloc + carry)
                try:
                    LeaveAllocation.objects.create(profile=prof, leave_type=lt, period=period, allocated=total_alloc)
                    summary['created_allocations'] += 1
                except Exception:
                    logger.exception('Failed to create allocation for %s %s', prof, lt)

            # save a snapshot of current opening/closing for audit
            try:
                snap_date = period.start_date
                snapshot, created = LeaveBalanceSnapshot.objects.get_or_create(profile=prof, balance_date=snap_date, defaults={
                    'el_balance': prof.el_balance,
                    'sl_balance': prof.sl_balance,
                    'cl_balance': prof.cl_balance,
                    'vacation_balance': prof.vacation_balance,
                    'note': f'Activation for period {period.period_name}',
                })
                if created:
                    summary['snapshots'] += 1
            except Exception:
                logger.exception('Failed to save snapshot for %s', prof)

    # mark period active
    period.is_active = True
    period.save()

    return summary
