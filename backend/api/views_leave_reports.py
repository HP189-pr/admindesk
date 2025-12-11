# views_leave_reports.py
"""
New leave report views supporting 4 different modes:
1. Employee Summary (single employee, single period)
2. Employee Date Range (single employee, custom date range)
3. Multi-Year Employee Report (single employee, all periods)
4. All Employees Year Report (all employees, single period)
"""
from decimal import Decimal
from datetime import datetime
from django.db import models
from rest_framework.views import APIView
from rest_framework.response import Response
from rest_framework import permissions, status

from .domain_emp import EmpProfile, LeavePeriod, LeaveEntry, LeaveType, LeaveAllocation
from .domain_leave_balance import compute_leave_balances, LeaveComputationConfig, _group_code, _to_decimal


def _parse_date(date_str):
    """Parse date from YYYY-MM-DD or DD-MM-YYYY format."""
    if not date_str:
        return None
    try:
        return datetime.strptime(date_str, '%Y-%m-%d').date()
    except:
        try:
            return datetime.strptime(date_str, '%d-%m-%Y').date()
        except:
            return None


def _format_date(d):
    """Format date as DD-MM-YYYY."""
    if not d:
        return ''
    return d.strftime('%d-%m-%Y')


def _get_employee_balance_summary(emp_id, period_id=None, start_date=None, end_date=None):
    """
    Core function to compute employee balance summary.
    Used by multiple endpoints.
    
    Returns:
    {
        'emp_id': str,
        'emp_name': str,
        'emp_short': int,
        'period': {'id': int, 'name': str, 'start': str, 'end': str},
        'opening': {'CL': 0, 'SL': 24.5, 'EL': 154, 'VAC': 0},
        'allocated': {'CL': 10, 'SL': 10, 'EL': 30, 'VAC': 0},
        'used': {'CL': 8.5, 'SL': 0, 'EL': 4, 'VAC': 0, 'DL': 5, 'LWP': 0, 'ML': 0, 'PL': 0},
        'closing': {'CL': 1.5, 'SL': 34.5, 'EL': 180, 'VAC': 0}
    }
    """
    try:
        profile = EmpProfile.objects.get(emp_id=emp_id)
    except EmpProfile.DoesNotExist:
        return None
    
    # Determine period
    if period_id:
        try:
            period = LeavePeriod.objects.get(id=period_id)
            start_date = period.start_date
            end_date = period.end_date
        except LeavePeriod.DoesNotExist:
            return None
    elif start_date and end_date:
        # Custom date range - create virtual period
        period = type('obj', (object,), {
            'id': 0,
            'period_name': f"{_format_date(start_date)} to {_format_date(end_date)}",
            'start_date': start_date,
            'end_date': end_date
        })()
    else:
        return None
    
    # Get all leave entries for this employee
    entries = LeaveEntry.objects.filter(
        emp_id=emp_id,
        end_date__gte=start_date,
        start_date__lte=end_date,
        status='Approved'
    ).select_related('leave_type')
    
    # Group used leaves by main type (CL includes HCL1, HCL2, etc.)
    used = {}
    for entry in entries:
        leave_type = entry.leave_type
        group = _group_code(leave_type) or str(leave_type.leave_code).upper()
        
        # Calculate day value
        day_value = _to_decimal(getattr(leave_type, 'day_value', 1))
        days = (entry.end_date - entry.start_date).days + 1
        amount = Decimal(days) * day_value
        
        used[group] = used.get(group, Decimal('0')) + amount
    
    # Get opening balances (from EmpProfile)
    opening = {
        'CL': Decimal('0'),  # CL always starts at 0
        'SL': _to_decimal(profile.sl_balance),
        'EL': _to_decimal(profile.el_balance),
        'VAC': _to_decimal(profile.vacation_balance)
    }
    
    # Get allocations from LeaveAllocation table for this period
    allocated = {
        'CL': Decimal('0'),
        'SL': Decimal('0'),
        'EL': Decimal('0'),
        'VAC': Decimal('0')
    }
    
    if period_id:
        # Get allocations for this employee in this period
        # Check both specific allocations (emp=profile) and global allocations (emp=None, apply_to='All')
        allocations = LeaveAllocation.objects.filter(
            period_id=period_id
        ).filter(
            models.Q(emp=profile) | models.Q(emp=None, apply_to='All')
        )
        
        for alloc in allocations:
            # Get the leave type to determine the group
            try:
                leave_type = LeaveType.objects.get(leave_code=alloc.leave_code)
                group = _group_code(leave_type) or str(leave_type.leave_code).upper()
                allocated[group] = allocated.get(group, Decimal('0')) + _to_decimal(alloc.allocated)
            except LeaveType.DoesNotExist:
                # Fallback to using leave_code directly
                code = str(alloc.leave_code).upper()
                if code in allocated:
                    allocated[code] = allocated.get(code, Decimal('0')) + _to_decimal(alloc.allocated)
    
    # Fallback to joining year allocations if no period allocations found
    if all(v == 0 for v in allocated.values()):
        allocated = {
            'CL': _to_decimal(profile.joining_year_allocation_cl),
            'SL': _to_decimal(profile.joining_year_allocation_sl),
            'EL': _to_decimal(profile.joining_year_allocation_el),
            'VAC': _to_decimal(profile.joining_year_allocation_vac)
        }
    
    # Calculate closing balance
    closing = {}
    for code in ['CL', 'SL', 'EL', 'VAC']:
        closing[code] = opening[code] + allocated[code] - used.get(code, Decimal('0'))
        # CL doesn't carry forward
        if code == 'CL':
            closing[code] = max(Decimal('0'), allocated[code] - used.get(code, Decimal('0')))
    
    # Format all decimal values
    def fmt(val):
        return float(val) if isinstance(val, Decimal) else val
    
    return {
        'emp_id': profile.emp_id,
        'emp_name': profile.emp_name,
        'emp_short': profile.emp_short,
        'emp_designation': profile.emp_designation or '',
        'leave_group': profile.leave_group or '',
        'actual_joining': _format_date(profile.actual_joining),
        'left_date': _format_date(profile.left_date) if profile.left_date else 'Cont',
        'period': {
            'id': period.id if hasattr(period, 'id') else 0,
            'name': getattr(period, 'period_name', ''),
            'start': _format_date(period.start_date),
            'end': _format_date(period.end_date)
        },
        'opening': {k: fmt(v) for k, v in opening.items()},
        'allocated': {k: fmt(v) for k, v in allocated.items()},
        'used': {k: fmt(used.get(k, Decimal('0'))) for k in ['CL', 'SL', 'EL', 'VAC', 'DL', 'LWP', 'ML', 'PL']},
        'closing': {k: fmt(v) for k, v in closing.items()}
    }


class EmployeeSummaryView(APIView):
    """
    Mode 1: Employee Summary for a specific period.
    
    GET /api/leave-report/employee-summary/?emp_id=12&period_id=1
    
    Returns:
    {
        "emp_id": "12",
        "emp_name": "URJITA PATEL",
        "period": {"id": 1, "name": "2025-2026", "start": "01-06-2025", "end": "31-05-2026"},
        "opening": {"CL": 0, "SL": 24.5, "EL": 154, "VAC": 0},
        "allocated": {"CL": 10, "SL": 10, "EL": 30, "VAC": 0},
        "used": {"CL": 8.5, "SL": 0, "EL": 4, "VAC": 0, "DL": 5, "LWP": 0, "ML": 0, "PL": 0},
        "closing": {"CL": 1.5, "SL": 34.5, "EL": 180, "VAC": 0}
    }
    """
    permission_classes = [permissions.IsAuthenticated]
    
    def get(self, request):
        emp_id = request.query_params.get('emp_id')
        period_id = request.query_params.get('period_id')
        
        if not emp_id or not period_id:
            return Response(
                {"detail": "emp_id and period_id are required"},
                status=status.HTTP_400_BAD_REQUEST
            )
        
        try:
            period_id = int(period_id)
        except ValueError:
            return Response(
                {"detail": "Invalid period_id"},
                status=status.HTTP_400_BAD_REQUEST
            )
        
        result = _get_employee_balance_summary(emp_id, period_id=period_id)
        
        if not result:
            return Response(
                {"detail": "Employee or period not found"},
                status=status.HTTP_404_NOT_FOUND
            )
        
        return Response(result)


class EmployeeDateRangeView(APIView):
    """
    Mode 2: Employee balance for custom date range.
    
    GET /api/leave-report/employee-range/?emp_id=12&from=2025-01-01&to=2025-03-31
    
    Returns same structure as EmployeeSummaryView but for custom date range.
    """
    permission_classes = [permissions.IsAuthenticated]
    
    def get(self, request):
        emp_id = request.query_params.get('emp_id')
        from_date = request.query_params.get('from')
        to_date = request.query_params.get('to')
        
        if not all([emp_id, from_date, to_date]):
            return Response(
                {"detail": "emp_id, from, and to are required"},
                status=status.HTTP_400_BAD_REQUEST
            )
        
        start = _parse_date(from_date)
        end = _parse_date(to_date)
        
        if not start or not end:
            return Response(
                {"detail": "Invalid date format. Use YYYY-MM-DD or DD-MM-YYYY"},
                status=status.HTTP_400_BAD_REQUEST
            )
        
        if start > end:
            return Response(
                {"detail": "from date must be before to date"},
                status=status.HTTP_400_BAD_REQUEST
            )
        
        result = _get_employee_balance_summary(emp_id, start_date=start, end_date=end)
        
        if not result:
            return Response(
                {"detail": "Employee not found"},
                status=status.HTTP_404_NOT_FOUND
            )
        
        return Response(result)


class EmployeeMultiYearView(APIView):
    """
    Mode 3: Multi-year summary for single employee.
    
    GET /api/leave-report/multi-year/?emp_id=12
    
    Returns:
    {
        "emp_id": "12",
        "emp_name": "URJITA PATEL",
        "years": [
            {
                "period": {"id": 1, "name": "2023-2024", ...},
                "opening": {...},
                "allocated": {...},
                "used": {...},
                "closing": {...}
            },
            {
                "period": {"id": 2, "name": "2024-2025", ...},
                ...
            }
        ]
    }
    """
    permission_classes = [permissions.IsAuthenticated]
    
    def get(self, request):
        emp_id = request.query_params.get('emp_id')
        
        if not emp_id:
            return Response(
                {"detail": "emp_id is required"},
                status=status.HTTP_400_BAD_REQUEST
            )
        
        try:
            profile = EmpProfile.objects.get(emp_id=emp_id)
        except EmpProfile.DoesNotExist:
            return Response(
                {"detail": "Employee not found"},
                status=status.HTTP_404_NOT_FOUND
            )
        
        # Get all periods, ordered by start date
        periods = LeavePeriod.objects.all().order_by('start_date')
        
        years = []
        for period in periods:
            summary = _get_employee_balance_summary(emp_id, period_id=period.id)
            if summary:
                years.append({
                    'period': summary['period'],
                    'opening': summary['opening'],
                    'allocated': summary['allocated'],
                    'used': summary['used'],
                    'closing': summary['closing']
                })
        
        return Response({
            'emp_id': profile.emp_id,
            'emp_name': profile.emp_name,
            'emp_short': profile.emp_short,
            'years': years
        })


class AllEmployeesBalanceView(APIView):
    """
    Mode 4: Balance certificate showing all employees with leave type breakdown.
    
    GET /api/leave-report/all-employees-balance/?period_id=1
    
    Returns:
    {
        "period": {"id": 1, "name": "2025-2026", "start": "01-06-2025", "end": "31-05-2026"},
        "employees": [
            {
                "emp_id": "1",
                "emp_name": "S. K. MANTRALA",
                "leave_types": [
                    {"code": "CL", "allocated": 10, "used": 8.5, "balance": 1.5},
                    {"code": "SL", "allocated": 10, "used": 0, "balance": 34.5},
                    {"code": "EL", "allocated": 30, "used": 4, "balance": 180},
                    {"code": "VAC", "allocated": 0, "used": 0, "balance": 0}
                ]
            },
            ...
        ]
    }
    """
    permission_classes = [permissions.IsAuthenticated]
    
    def get(self, request):
        period_id = request.query_params.get('period_id')
        
        if not period_id:
            return Response(
                {"detail": "period_id is required"},
                status=status.HTTP_400_BAD_REQUEST
            )
        
        try:
            period_id = int(period_id)
            period = LeavePeriod.objects.get(id=period_id)
        except (ValueError, LeavePeriod.DoesNotExist):
            return Response(
                {"detail": "Invalid or not found period_id"},
                status=status.HTTP_404_NOT_FOUND
            )
        
        # Get all active employees
        profiles = EmpProfile.objects.filter(status='Cont').order_by('emp_short')
        
        employees = []
        for profile in profiles:
            summary = _get_employee_balance_summary(profile.emp_id, period_id=period_id)
            if summary:
                leave_types = []
                for code in ['CL', 'SL', 'EL', 'VAC']:
                    leave_types.append({
                        'code': code,
                        'allocated': summary['allocated'][code],
                        'used': summary['used'][code],
                        'balance': summary['closing'][code]
                    })
                
                employees.append({
                    'emp_id': profile.emp_id,
                    'emp_short': profile.emp_short,
                    'emp_name': profile.emp_name,
                    'leave_types': leave_types
                })
        
        return Response({
            'period': {
                'id': period.id,
                'name': period.period_name,
                'start': _format_date(period.start_date),
                'end': _format_date(period.end_date)
            },
            'employees': employees
        })
