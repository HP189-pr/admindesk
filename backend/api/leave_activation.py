# backend/api/leave_activation.py
"""
Leave period activation logic.
Handles period activation, carryforward computation, and snapshot generation.
"""

from .domain_emp import LeavePeriod
from .domain_leave_balance import compute_and_persist_leave_balances


def activate_period(period_id: int) -> dict:
    """
    Activate a leave period (idempotent operation).
    
    This function:
    1. Validates the period exists
    2. Computes carryforward from previous periods
    3. Generates leave balance snapshots
    4. Returns a summary of the activation
    
    Args:
        period_id: The ID of the LeavePeriod to activate
        
    Returns:
        dict: Summary containing status and metadata
        
    Raises:
        ValueError: If period_id is invalid or period doesn't exist
    """
    try:
        period = LeavePeriod.objects.get(id=period_id)
    except LeavePeriod.DoesNotExist:
        raise ValueError(f"LeavePeriod with id={period_id} not found")
    
    # Compute and persist leave balances for this period
    result = compute_and_persist_leave_balances(period_id=period_id)
    
    # Build summary
    summary = {
        'period_id': period_id,
        'period_name': period.period_name,
        'start_date': str(period.start_date),
        'end_date': str(period.end_date),
        'employees_processed': len(result.get('employees', [])),
        'status': 'activated'
    }
    
    return summary
