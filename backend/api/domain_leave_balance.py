# Compatibility wrapper for new engine signature
from .leave_engine import engine

def computeLeaveBalances(selectedPeriodId=None, employee_ids=None, leaveCalculationDate=None):
    return engine.compute(
        employee_ids=employee_ids,
        leave_calculation_date=leaveCalculationDate
    )
# backend/api/domain_leave_balance.py

def computeLeaveBalances(*args, **kwargs):
    """
    Temporary stub to unblock API imports.
    Replace with real implementation later.
    """
    return {}
def computeLeaveBalances(*args, **kwargs):
    """Temporary stub to unblock API. Replace with real logic later."""
    return {}