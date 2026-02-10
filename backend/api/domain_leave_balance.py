# backend/api/domain_leave_balance.py
"""
Leave balance computation and snapshot persistence.
Provides functions to compute leave balances using the leave_engine and persist them to snapshots.
"""

from django.db import connection
from django.utils import timezone
from .leave_engine import engine


def computeLeaveBalances(selectedPeriodId=None, employee_ids=None, leaveCalculationDate=None):
    """
    Compatibility wrapper for legacy code using old signature.
    
    Args:
        selectedPeriodId: Period ID (unused - engine computes all periods)
        employee_ids: Optional list of employee IDs to filter
        leaveCalculationDate: Optional date for calculation
        
    Returns:
        dict: Result from engine.compute()
    """
    return engine.compute(
        employee_ids=employee_ids,
        leave_calculation_date=leaveCalculationDate
    )


def compute_and_persist_leave_balances(period_id=None):
    """
    Compute leave balances and persist them to api_leavebalancesnapshot table.
    
    This function:
    1. Calls the leave_engine to compute balances for all employees
    2. Persists the results to api_leavebalancesnapshot table (upsert)
    3. Returns the computation result
    
    Args:
        period_id: Optional period ID to limit computation. If None, computes all periods.
        
    Returns:
        dict: Result from engine.compute() with 'employees' and 'metadata' keys
    """
    # Compute balances using the engine
    result = engine.compute()
    
    employees = result.get('employees', [])
    
    # Persist to snapshots table
    with connection.cursor() as cur:
        for emp in employees:
            emp_id = emp.get('emp_id')
            emp_name = emp.get('emp_name', '')
            
            for period_data in emp.get('periods', []):
                pid = period_data.get('period_id')
                
                # Skip if filtering by period_id and this isn't it
                if period_id is not None and pid != period_id:
                    continue
                
                # Extract values
                starting = period_data.get('starting', {})
                allocation = period_data.get('allocation', {})
                used = period_data.get('used', {})
                ending = period_data.get('ending', {})
                allocation_meta = period_data.get('allocation_meta', {})
                
                # Get allocation dates from first non-None meta entry
                allocation_start_date = None
                allocation_end_date = None
                allocation_id = None
                
                # Upsert snapshot row
                cur.execute("""
                    INSERT INTO api_leavebalancesnapshot (
                        emp_id, emp_name, period_id,
                        starting_el, starting_cl, starting_sl,
                        allocated_el, allocated_cl, allocated_sl,
                        used_el, used_cl, used_sl,
                        ending_el, ending_cl, ending_sl,
                        carry_forward_el, carry_forward_cl,
                        effective_joining_date, left_date,
                        allocation_id, allocation_start_date, allocation_end_date,
                        allocation_meta, snapshot_date
                    ) VALUES (
                        %s, %s, %s,
                        %s, %s, %s,
                        %s, %s, %s,
                        %s, %s, %s,
                        %s, %s, %s,
                        %s, %s,
                        %s, %s,
                        %s, %s, %s,
                        %s, %s
                    )
                    ON CONFLICT (emp_id, period_id)
                    DO UPDATE SET
                        emp_name = EXCLUDED.emp_name,
                        starting_el = EXCLUDED.starting_el,
                        starting_cl = EXCLUDED.starting_cl,
                        starting_sl = EXCLUDED.starting_sl,
                        allocated_el = EXCLUDED.allocated_el,
                        allocated_cl = EXCLUDED.allocated_cl,
                        allocated_sl = EXCLUDED.allocated_sl,
                        used_el = EXCLUDED.used_el,
                        used_cl = EXCLUDED.used_cl,
                        used_sl = EXCLUDED.used_sl,
                        ending_el = EXCLUDED.ending_el,
                        ending_cl = EXCLUDED.ending_cl,
                        ending_sl = EXCLUDED.ending_sl,
                        carry_forward_el = EXCLUDED.carry_forward_el,
                        carry_forward_cl = EXCLUDED.carry_forward_cl,
                        effective_joining_date = EXCLUDED.effective_joining_date,
                        left_date = EXCLUDED.left_date,
                        allocation_id = EXCLUDED.allocation_id,
                        allocation_start_date = EXCLUDED.allocation_start_date,
                        allocation_end_date = EXCLUDED.allocation_end_date,
                        allocation_meta = EXCLUDED.allocation_meta,
                        snapshot_date = EXCLUDED.snapshot_date
                """, [
                    emp_id, emp_name, pid,
                    starting.get('EL', 0), starting.get('CL', 0), starting.get('SL', 0),
                    allocation.get('EL', 0), allocation.get('CL', 0), allocation.get('SL', 0),
                    used.get('EL', 0), used.get('CL', 0), used.get('SL', 0),
                    ending.get('EL', 0), ending.get('CL', 0), ending.get('SL', 0),
                    ending.get('EL', 0),  # carry_forward_el = ending_el
                    0,  # carry_forward_cl (CL resets, so 0)
                    emp.get('actual_joining', None),
                    emp.get('left_date', None) if emp.get('left_date') != 'Cont' else None,
                    allocation_id, allocation_start_date, allocation_end_date,
                    str(allocation_meta) if allocation_meta else '{}',
                    timezone.now().date()
                ])
    
    return result


def snapshots_fresh_for_period(period_id):
    """
    Check if snapshots exist and are fresh for a given period.
    
    Args:
        period_id: The period ID to check
        
    Returns:
        bool: True if fresh snapshots exist, False otherwise
    """
    with connection.cursor() as cur:
        cur.execute("""
            SELECT COUNT(*) FROM api_leavebalancesnapshot 
            WHERE period_id = %s 
            AND snapshot_date >= CURRENT_DATE - INTERVAL '1 day'
        """, [period_id])
        count = cur.fetchone()[0]
        return count > 0