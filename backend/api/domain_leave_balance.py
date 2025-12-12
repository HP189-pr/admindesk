# domain_leave_balance.py
"""
Compatibility wrapper that preserves the old function names for existing views/tests.
It forwards to the new live engine (leave_engine.engine).
"""
from datetime import date
from typing import Optional, Sequence, Dict, Any

from .leave_engine import engine, compute_leave_balances  # new engine

class LeaveComputationConfig:
    # placeholder for compatibility (previous code used this object)
    def __init__(self, first_period_adds_allocation: bool = False, clamp_negative: bool = False, tracked_leave_codes: Sequence[str] = ("EL","CL","SL","VAC")):
        self.first_period_adds_allocation = first_period_adds_allocation
        self.clamp_negative = clamp_negative
        self.tracked_leave_codes = tuple(tracked_leave_codes)

def computeLeaveBalances(*, leaveCalculationDate: Optional[date] = None, selectedPeriodId: Optional[int] = None, periodStart: Optional[date] = None, periodEnd: Optional[date] = None, employee_ids: Optional[Sequence[str]] = None) -> Dict[str,Any]:
    """
    Backwards-compatible wrapper: uses compute_leave_balances from the live engine.
    If selectedPeriodId is provided, we filter employee.periods to that single period in the returned payload.
    """
    payload = compute_leave_balances(employee_ids=employee_ids, leave_calculation_date=leaveCalculationDate)
    if selectedPeriodId:
        for emp in payload.get("employees", []):
            ps = emp.get("periods", [])
            emp["periods"] = [p for p in ps if p.get("period_id") == selectedPeriodId]
        payload["metadata"]["periods"] = [p for p in payload["metadata"].get("periods", []) if p.get("id") == selectedPeriodId]
    return payload


def compute_and_persist_leave_balances(*, period_id: Optional[int] = None) -> Dict[str, Any]:
    """
    Minimal compatibility shim for the old snapshotting workflow.
    It invokes the live engine and returns the payload. It does NOT
    persist snapshots to the DB — snapshot persistence was removed
    in the new engine per current project direction.
    """
    # ignore period_id for persistence (no-op here) but keep API compatible
    return compute_leave_balances()


def snapshots_fresh_for_period(period_id: Optional[int]) -> bool:
    """
    Compatibility shim used by the report endpoint. Since we no
    longer maintain snapshot rows in this workflow, always return
    False so the caller may invoke a fresh compute.
    """
    return False
