"""
Live Leave Balance Views - Using Real-time Calculation Engine

This module provides API endpoints that use the live balance calculation engine
(leave_engine.py) instead of pre-computed snapshots. All balances are calculated
on-demand from source data (LeaveAllocation + LeaveEntry).

Benefits:
- Always accurate, even with historical changes
- No snapshot recomputation needed
- Automatic cascade updates
- Zero chance of balance mismatch

Endpoints:
- GET /api/leave-balance/current/ - Current balance for authenticated user
- GET /api/leave-balance/period/<period_id>/ - Balance breakdown for specific period
- GET /api/leave-balance/history/ - Complete leave history for user
- GET /api/leave-balance/report/ - Balance report for all employees (HR/Admin only)
"""

from rest_framework import generics, status
from rest_framework.views import APIView
from rest_framework.response import Response
from rest_framework.permissions import IsAuthenticated
from django.utils import timezone
from datetime import date
from decimal import Decimal

from .leave_engine import leave_engine
from .domain_emp import EmpProfile, LeavePeriod, LeaveType


def _user_identifiers(user):
	"""Extract username/usercode from user object."""
	values = []
	for attr in ('username', 'usercode'):
		try:
			val = getattr(user, attr, None)
		except Exception:
			val = None
		if val:
			values.append(str(val))
	return values


def _first_profile_for_user(user):
	"""Find EmpProfile matching authenticated user."""
	from django.db.models import Q
	identifiers = _user_identifiers(user)
	valid = [i for i in identifiers if i]
	if not valid:
		return None
	lookup = Q()
	for ident in valid:
		lookup |= Q(username__iexact=ident) | Q(usercode__iexact=ident)
	return EmpProfile.objects.filter(lookup).first()


def _is_hr_or_admin(user):
	"""Check if user has HR/Admin permissions."""
	if not user or not user.is_authenticated:
		return False
	if user.is_staff or user.is_superuser:
		return True
	return user.groups.filter(name__iexact='leave_management').exists()


class CurrentLeaveBalanceView(APIView):
	"""
	Get current leave balance for authenticated user.
	
	GET /api/leave-balance/current/
	
	Response:
	{
	    "emp_id": "12345",
	    "emp_name": "John Doe",
	    "as_of_date": "2025-01-15",
	    "balances": [
	        {
	            "leave_code": "CL",
	            "leave_name": "Casual Leave",
	            "current_balance": 12.5,
	            "unit": "days"
	        },
	        ...
	    ]
	}
	"""
	permission_classes = [IsAuthenticated]
	
	def get(self, request):
		# Find employee profile for authenticated user
		profile = _first_profile_for_user(request.user)
		if not profile:
			return Response(
				{'detail': 'Employee profile not found for authenticated user'},
				status=status.HTTP_404_NOT_FOUND
			)
		
		# Get as_of_date from query params or use today
		as_of_str = request.query_params.get('as_of_date')
		if as_of_str:
			try:
				as_of_date = date.fromisoformat(as_of_str)
			except ValueError:
				return Response(
					{'detail': 'Invalid as_of_date format. Use YYYY-MM-DD'},
					status=status.HTTP_400_BAD_REQUEST
				)
		else:
			as_of_date = date.today()
		
		# Calculate current balance for all leave types
		try:
			summary = leave_engine.get_employee_summary(profile, as_of_date)
		except Exception as e:
			return Response(
				{'detail': f'Failed to calculate balance: {str(e)}'},
				status=status.HTTP_500_INTERNAL_SERVER_ERROR
			)
		
		# Format response
		balances = []
		for item in summary:
			leave_type = LeaveType.objects.filter(leave_code=item['leave_code']).first()
			balances.append({
				'leave_code': item['leave_code'],
				'leave_name': leave_type.leave_name if leave_type else item['leave_code'],
				'current_balance': float(item['balance']),
				'unit': 'days'
			})
		
		return Response({
			'emp_id': profile.emp_id,
			'emp_name': profile.emp_name,
			'as_of_date': as_of_date.isoformat(),
			'balances': balances
		})


class PeriodLeaveBalanceView(APIView):
	"""
	Get detailed leave balance breakdown for a specific period.
	
	GET /api/leave-balance/period/<period_id>/
	GET /api/leave-balance/period/<period_id>/?leave_code=CL
	
	Response:
	{
	    "emp_id": "12345",
	    "emp_name": "John Doe",
	    "period": {
	        "id": 5,
	        "name": "2024-2025",
	        "start_date": "2024-04-01",
	        "end_date": "2025-03-31"
	    },
	    "balances": [
	        {
	            "leave_code": "CL",
	            "leave_name": "Casual Leave",
	            "opening_balance": 10.0,
	            "allocated_in_period": 12.0,
	            "used_in_period": 5.5,
	            "closing_balance": 16.5
	        },
	        ...
	    ]
	}
	"""
	permission_classes = [IsAuthenticated]
	
	def get(self, request, period_id):
		# Find employee profile for authenticated user
		profile = _first_profile_for_user(request.user)
		if not profile:
			return Response(
				{'detail': 'Employee profile not found for authenticated user'},
				status=status.HTTP_404_NOT_FOUND
			)
		
		# Get period
		try:
			period = LeavePeriod.objects.get(id=period_id)
		except LeavePeriod.DoesNotExist:
			return Response(
				{'detail': 'Leave period not found'},
				status=status.HTTP_404_NOT_FOUND
			)
		
		# Get optional leave_code filter
		leave_code = request.query_params.get('leave_code')
		
		# Calculate balance for period
		try:
			if leave_code:
				# Single leave type
				breakdown = leave_engine.calculate_period_balance(profile, leave_code, period)
				leave_type = LeaveType.objects.filter(leave_code=leave_code).first()
				balances = [{
					'leave_code': leave_code,
					'leave_name': leave_type.leave_name if leave_type else leave_code,
					'opening_balance': float(breakdown['opening_balance']),
					'allocated_in_period': float(breakdown['allocated_in_period']),
					'used_in_period': float(breakdown['used_in_period']),
					'closing_balance': float(breakdown['closing_balance'])
				}]
			else:
				# All leave types
				all_balances = leave_engine.calculate_all_leave_types_for_period(profile, period)
				balances = []
				for item in all_balances:
					leave_type = LeaveType.objects.filter(leave_code=item['leave_code']).first()
					balances.append({
						'leave_code': item['leave_code'],
						'leave_name': leave_type.leave_name if leave_type else item['leave_code'],
						'opening_balance': float(item['opening_balance']),
						'allocated_in_period': float(item['allocated_in_period']),
						'used_in_period': float(item['used_in_period']),
						'closing_balance': float(item['closing_balance'])
					})
		except Exception as e:
			return Response(
				{'detail': f'Failed to calculate balance: {str(e)}'},
				status=status.HTTP_500_INTERNAL_SERVER_ERROR
			)
		
		return Response({
			'emp_id': profile.emp_id,
			'emp_name': profile.emp_name,
			'period': {
				'id': period.id,
				'name': period.period_name,
				'start_date': period.start_date.isoformat(),
				'end_date': period.end_date.isoformat()
			},
			'balances': balances
		})


class LeaveHistoryView(APIView):
	"""
	Get complete leave balance history across all periods.
	
	GET /api/leave-balance/history/
	GET /api/leave-balance/history/?leave_code=CL
	
	Response:
	{
	    "emp_id": "12345",
	    "emp_name": "John Doe",
	    "history": [
	        {
	            "period": {...},
	            "leave_code": "CL",
	            "leave_name": "Casual Leave",
	            "opening_balance": 0.0,
	            "allocated_in_period": 12.0,
	            "used_in_period": 2.0,
	            "closing_balance": 10.0
	        },
	        ...
	    ]
	}
	"""
	permission_classes = [IsAuthenticated]
	
	def get(self, request):
		# Find employee profile for authenticated user
		profile = _first_profile_for_user(request.user)
		if not profile:
			return Response(
				{'detail': 'Employee profile not found for authenticated user'},
				status=status.HTTP_404_NOT_FOUND
			)
		
		# Get optional leave_code filter
		leave_code = request.query_params.get('leave_code')
		
		# Calculate history
		try:
			if leave_code:
				# Single leave type across all periods
				history_data = leave_engine.calculate_all_periods_for_employee(profile, leave_code)
				leave_type = LeaveType.objects.filter(leave_code=leave_code).first()
				history = []
				for item in history_data:
					history.append({
						'period': {
							'id': item['period'].id,
							'name': item['period'].period_name,
							'start_date': item['period'].start_date.isoformat(),
							'end_date': item['period'].end_date.isoformat()
						},
						'leave_code': leave_code,
						'leave_name': leave_type.leave_name if leave_type else leave_code,
						'opening_balance': float(item['opening_balance']),
						'allocated_in_period': float(item['allocated_in_period']),
						'used_in_period': float(item['used_in_period']),
						'closing_balance': float(item['closing_balance'])
					})
			else:
				# All leave types across all periods
				periods = leave_engine.get_all_periods()
				history = []
				for period in periods:
					balances = leave_engine.calculate_all_leave_types_for_period(profile, period)
					for item in balances:
						leave_type = LeaveType.objects.filter(leave_code=item['leave_code']).first()
						history.append({
							'period': {
								'id': period.id,
								'name': period.period_name,
								'start_date': period.start_date.isoformat(),
								'end_date': period.end_date.isoformat()
							},
							'leave_code': item['leave_code'],
							'leave_name': leave_type.leave_name if leave_type else item['leave_code'],
							'opening_balance': float(item['opening_balance']),
							'allocated_in_period': float(item['allocated_in_period']),
							'used_in_period': float(item['used_in_period']),
							'closing_balance': float(item['closing_balance'])
						})
		except Exception as e:
			return Response(
				{'detail': f'Failed to calculate history: {str(e)}'},
				status=status.HTTP_500_INTERNAL_SERVER_ERROR
			)
		
		return Response({
			'emp_id': profile.emp_id,
			'emp_name': profile.emp_name,
			'history': history
		})


class LeaveBalanceReportView(APIView):
	"""
	Get leave balance report for all employees (HR/Admin only).
	
	GET /api/leave-balance/report/?period_id=5
	GET /api/leave-balance/report/?period_id=5&leave_code=CL
	
	Response:
	{
	    "period": {...},
	    "leave_code": "CL",  # if filtered
	    "employees": [
	        {
	            "emp_id": "12345",
	            "emp_name": "John Doe",
	            "opening_balance": 10.0,
	            "allocated_in_period": 12.0,
	            "used_in_period": 5.5,
	            "closing_balance": 16.5
	        },
	        ...
	    ]
	}
	"""
	permission_classes = [IsAuthenticated]
	
	def get(self, request):
		# Check HR/Admin permission
		if not _is_hr_or_admin(request.user):
			return Response(
				{'detail': 'Only HR/Admin can access leave balance reports'},
				status=status.HTTP_403_FORBIDDEN
			)
		
		# Get period_id (required for report)
		period_id_str = request.query_params.get('period_id')
		if not period_id_str:
			# Default to latest period
			period = LeavePeriod.objects.order_by('-start_date').first()
			if not period:
				return Response(
					{'detail': 'No leave periods found'},
					status=status.HTTP_404_NOT_FOUND
				)
		else:
			try:
				period = LeavePeriod.objects.get(id=int(period_id_str))
			except (ValueError, LeavePeriod.DoesNotExist):
				return Response(
					{'detail': 'Invalid or missing period_id'},
					status=status.HTTP_400_BAD_REQUEST
				)
		
		# Get optional leave_code filter
		leave_code = request.query_params.get('leave_code')
		
		# Get all active employees
		employees = EmpProfile.objects.filter(emp_status='Active').order_by('emp_id')
		
		# Calculate balances for all employees
		report_data = []
		for emp in employees:
			try:
				if leave_code:
					# Single leave type
					breakdown = leave_engine.calculate_period_balance(emp, leave_code, period)
					report_data.append({
						'emp_id': emp.emp_id,
						'emp_name': emp.emp_name,
						'opening_balance': float(breakdown['opening_balance']),
						'allocated_in_period': float(breakdown['allocated_in_period']),
						'used_in_period': float(breakdown['used_in_period']),
						'closing_balance': float(breakdown['closing_balance'])
					})
				else:
					# All leave types
					all_balances = leave_engine.calculate_all_leave_types_for_period(emp, period)
					for item in all_balances:
						report_data.append({
							'emp_id': emp.emp_id,
							'emp_name': emp.emp_name,
							'leave_code': item['leave_code'],
							'opening_balance': float(item['opening_balance']),
							'allocated_in_period': float(item['allocated_in_period']),
							'used_in_period': float(item['used_in_period']),
							'closing_balance': float(item['closing_balance'])
						})
			except Exception as e:
				# Log error but continue with other employees
				print(f"[WARN] Failed to calculate balance for {emp.emp_id}: {e}")
				continue
		
		response_data = {
			'period': {
				'id': period.id,
				'name': period.period_name,
				'start_date': period.start_date.isoformat(),
				'end_date': period.end_date.isoformat()
			},
			'employees': report_data
		}
		
		if leave_code:
			response_data['leave_code'] = leave_code
		
		return Response(response_data)
