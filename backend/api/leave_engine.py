"""
Live Leave Balance Calculation Engine

This module provides real-time leave balance calculations without relying on snapshots.
All balances are computed on-demand from source data (allocations + leave entries).

Key Features:
- Zero snapshot dependency
- Always accurate, even with historical data changes
- Automatic cascade recalculation across all periods
- Supports both ALL and PARTICULAR allocations
- Handles carry-forward balances correctly

Author: AdminDesk System
Date: December 9, 2025
"""

from decimal import Decimal
from datetime import date
from typing import Dict, List, Optional, Tuple
from django.db.models import Q
from .domain_emp import EmpProfile, LeaveType, LeaveEntry, LeavePeriod, LeaveAllocation


class LeaveBalanceEngine:
	"""
	Core engine for live leave balance calculations.
	
	This engine computes leave balances in real-time without requiring
	pre-computed snapshots. All calculations are derived from:
	1. Leave allocations (both ALL and PARTICULAR)
	2. Approved leave entries
	3. Period definitions
	"""
	
	def __init__(self):
		self.cache = {}  # Optional: for request-level caching
	
	def get_all_periods(self, ordered=True) -> List[LeavePeriod]:
		"""
		Get all leave periods.
		
		Args:
			ordered: If True, return periods ordered by start_date
		
		Returns:
			List of LeavePeriod objects
		"""
		qs = LeavePeriod.objects.all()
		if ordered:
			qs = qs.order_by('start_date')
		return list(qs)
	
	def get_periods_until(self, target_period: LeavePeriod, include_target=False) -> List[LeavePeriod]:
		"""
		Get all periods before (and optionally including) the target period.
		
		Args:
			target_period: The period to use as cutoff
			include_target: Whether to include the target period itself
		
		Returns:
			List of LeavePeriod objects ordered by start_date
		"""
		if include_target:
			qs = LeavePeriod.objects.filter(start_date__lte=target_period.start_date)
		else:
			qs = LeavePeriod.objects.filter(start_date__lt=target_period.start_date)
		return list(qs.order_by('start_date'))
	
	def get_leave_entries_for_employee(
		self, 
		emp: EmpProfile, 
		leave_code: str = None,
		status: str = 'Approved',
		up_to_date: date = None
	) -> List[LeaveEntry]:
		"""
		Get leave entries for a specific employee.
		
		Args:
			emp: Employee profile
			leave_code: Optional leave code filter (e.g., 'CL', 'EL')
			status: Leave status filter (default: 'Approved')
			up_to_date: Optional cutoff date (entries ending on or before this date)
		
		Returns:
			List of LeaveEntry objects
		"""
		filters = Q(emp=emp)
		
		if status:
			filters &= Q(status__iexact=status)
		
		if leave_code:
			try:
				leave_type = LeaveType.objects.get(leave_code=leave_code)
				filters &= Q(leave_type=leave_type)
			except LeaveType.DoesNotExist:
				return []
		
		if up_to_date:
			filters &= Q(end_date__lte=up_to_date)
		
		return list(LeaveEntry.objects.filter(filters).order_by('start_date'))
	
	def get_allocations_for_employee(
		self,
		emp: EmpProfile,
		period: LeavePeriod = None,
		leave_code: str = None
	) -> List[LeaveAllocation]:
		"""
		Get effective allocations for an employee (including both ALL and PARTICULAR).
		
		Args:
			emp: Employee profile
			period: Optional period filter
			leave_code: Optional leave code filter
		
		Returns:
			List of LeaveAllocation objects that apply to this employee
		"""
		filters = Q(apply_to='ALL') | Q(apply_to='PARTICULAR', emp=emp)
		
		if period:
			filters &= Q(period=period)
		
		if leave_code:
			filters &= Q(leave_code=leave_code)
		
		return list(LeaveAllocation.objects.filter(filters))
	
	def calculate_used_days_in_period(
		self,
		emp: EmpProfile,
		leave_code: str,
		period: LeavePeriod,
		status: str = 'Approved'
	) -> Decimal:
		"""
		Calculate total leave days used in a specific period.
		
		Args:
			emp: Employee profile
			leave_code: Leave code (e.g., 'CL', 'EL')
			period: The period to calculate for
			status: Leave status (default: 'Approved')
		
		Returns:
			Decimal: Total days used in the period
		"""
		try:
			leave_type = LeaveType.objects.get(leave_code=leave_code)
		except LeaveType.DoesNotExist:
			return Decimal('0')
		
		entries = LeaveEntry.objects.filter(
			emp=emp,
			leave_type=leave_type,
			status__iexact=status,
			start_date__lte=period.end_date,
			end_date__gte=period.start_date
		)
		
		total = Decimal('0')
		
		for entry in entries:
			# Calculate overlap between entry and period
			overlap_start = max(entry.start_date, period.start_date)
			overlap_end = min(entry.end_date, period.end_date)
			
			if overlap_end >= overlap_start:
				overlap_days = (overlap_end - overlap_start).days + 1
				
				# Get day value (handles half-day leaves)
				day_value = self._get_day_value(leave_type)
				
				total += Decimal(overlap_days) * day_value
		
		return total
	
	def _get_day_value(self, leave_type: LeaveType) -> Decimal:
		"""
		Get the day value for a leave type (handles half-day leaves).
		
		Args:
			leave_type: LeaveType object
		
		Returns:
			Decimal: Day value (1.0 for full day, 0.5 for half day, etc.)
		"""
		try:
			raw_value = getattr(leave_type, 'day_value', None)
			day_value = Decimal(str(raw_value)) if raw_value not in (None, '') else Decimal('1')
			
			is_half = bool(getattr(leave_type, 'is_half', False))
			
			if is_half and day_value >= Decimal('1'):
				return Decimal('0.5')
			
			return day_value
		except Exception:
			return Decimal('1')
	
	def get_allocation_for_period(
		self,
		emp: EmpProfile,
		leave_code: str,
		period: LeavePeriod
	) -> Decimal:
		"""
		Get the effective allocation for an employee in a specific period.
		Considers both ALL and PARTICULAR allocations (PARTICULAR takes precedence).
		
		Args:
			emp: Employee profile
			leave_code: Leave code
			period: The period to check
		
		Returns:
			Decimal: Allocated days for this period
		"""
		# Check for PARTICULAR allocation first (higher priority)
		particular = LeaveAllocation.objects.filter(
			apply_to='PARTICULAR',
			emp=emp,
			leave_code=leave_code,
			period=period
		).first()
		
		if particular:
			return Decimal(str(particular.allocated))
		
		# Fall back to ALL allocation
		all_allocation = LeaveAllocation.objects.filter(
			apply_to='ALL',
			leave_code=leave_code,
			period=period
		).first()
		
		if all_allocation:
			return Decimal(str(all_allocation.allocated))
		
		# No allocation found
		return Decimal('0')
	
	def calculate_opening_balance(
		self,
		emp: EmpProfile,
		leave_code: str,
		period: LeavePeriod
	) -> Decimal:
		"""
		Calculate opening balance for a period.
		
		Opening Balance = Sum of all previous period ending balances
		                = Sum(allocations) - Sum(used) for all periods before this one
		
		Args:
			emp: Employee profile
			leave_code: Leave code
			period: The period to calculate opening balance for
		
		Returns:
			Decimal: Opening balance
		"""
		previous_periods = self.get_periods_until(period, include_target=False)
		
		total_allocated = Decimal('0')
		total_used = Decimal('0')
		
		for prev_period in previous_periods:
			allocated = self.get_allocation_for_period(emp, leave_code, prev_period)
			used = self.calculate_used_days_in_period(emp, leave_code, prev_period)
			
			total_allocated += allocated
			total_used += used
		
		return total_allocated - total_used
	
	def calculate_period_balance(
		self,
		emp: EmpProfile,
		leave_code: str,
		period: LeavePeriod
	) -> Dict[str, Decimal]:
		"""
		Calculate complete balance breakdown for a specific period.
		
		Returns:
			Dict containing:
			- opening_balance: Balance at start of period
			- allocated: New allocation in this period
			- used: Leave taken in this period
			- closing_balance: Balance at end of period
		"""
		opening = self.calculate_opening_balance(emp, leave_code, period)
		allocated = self.get_allocation_for_period(emp, leave_code, period)
		used = self.calculate_used_days_in_period(emp, leave_code, period)
		closing = opening + allocated - used
		
		return {
			'opening_balance': opening,
			'allocated': allocated,
			'used': used,
			'closing_balance': closing
		}
	
	def calculate_current_balance(
		self,
		emp: EmpProfile,
		leave_code: str,
		as_of_date: date = None
	) -> Decimal:
		"""
		Calculate current balance for an employee as of a specific date.
		
		Args:
			emp: Employee profile
			leave_code: Leave code
			as_of_date: Date to calculate balance as of (default: today)
		
		Returns:
			Decimal: Current balance
		"""
		if as_of_date is None:
			as_of_date = date.today()
		
		# Get all periods up to and including the date
		periods = LeavePeriod.objects.filter(
			start_date__lte=as_of_date
		).order_by('start_date')
		
		total_allocated = Decimal('0')
		total_used = Decimal('0')
		
		for period in periods:
			allocated = self.get_allocation_for_period(emp, leave_code, period)
			
			# Only count usage up to as_of_date
			if period.end_date <= as_of_date:
				# Entire period is in the past
				used = self.calculate_used_days_in_period(emp, leave_code, period)
			else:
				# Partial period - need to calculate usage up to as_of_date
				entries = LeaveEntry.objects.filter(
					emp=emp,
					leave_type__leave_code=leave_code,
					status__iexact='Approved',
					start_date__lte=as_of_date,
					end_date__gte=period.start_date
				)
				
				used = Decimal('0')
				for entry in entries:
					overlap_start = max(entry.start_date, period.start_date)
					overlap_end = min(entry.end_date, as_of_date)
					
					if overlap_end >= overlap_start:
						overlap_days = (overlap_end - overlap_start).days + 1
						day_value = self._get_day_value(entry.leave_type)
						used += Decimal(overlap_days) * day_value
			
			total_allocated += allocated
			total_used += used
		
		return total_allocated - total_used
	
	def calculate_all_leave_types_for_period(
		self,
		emp: EmpProfile,
		period: LeavePeriod
	) -> Dict[str, Dict[str, Decimal]]:
		"""
		Calculate balances for all leave types in a specific period.
		
		Args:
			emp: Employee profile
			period: The period to calculate for
		
		Returns:
			Dict mapping leave_code to balance breakdown
		"""
		leave_types = LeaveType.objects.all()
		result = {}
		
		for leave_type in leave_types:
			result[leave_type.leave_code] = self.calculate_period_balance(
				emp,
				leave_type.leave_code,
				period
			)
		
		return result
	
	def calculate_all_periods_for_employee(
		self,
		emp: EmpProfile,
		leave_code: str = None
	) -> List[Dict]:
		"""
		Calculate balance breakdown for all periods for an employee.
		
		Args:
			emp: Employee profile
			leave_code: Optional leave code filter (if None, calculates all leave types)
		
		Returns:
			List of dicts, one per period, containing balance breakdown
		"""
		periods = self.get_all_periods(ordered=True)
		
		if leave_code:
			leave_codes = [leave_code]
		else:
			leave_codes = list(LeaveType.objects.values_list('leave_code', flat=True))
		
		result = []
		
		for period in periods:
			period_data = {
				'period_id': period.id,
				'period_name': period.period_name,
				'start_date': period.start_date,
				'end_date': period.end_date,
				'leave_types': {}
			}
			
			for lc in leave_codes:
				balance = self.calculate_period_balance(emp, lc, period)
				period_data['leave_types'][lc] = {
					'opening_balance': float(balance['opening_balance']),
					'allocated': float(balance['allocated']),
					'used': float(balance['used']),
					'closing_balance': float(balance['closing_balance'])
				}
			
			result.append(period_data)
		
		return result
	
	def get_employee_summary(
		self,
		emp: EmpProfile,
		as_of_date: date = None
	) -> Dict[str, Decimal]:
		"""
		Get current balance summary for all leave types for an employee.
		
		Args:
			emp: Employee profile
			as_of_date: Date to calculate balance as of (default: today)
		
		Returns:
			Dict mapping leave_code to current balance
		"""
		if as_of_date is None:
			as_of_date = date.today()
		
		leave_types = LeaveType.objects.all()
		summary = {}
		
		for leave_type in leave_types:
			balance = self.calculate_current_balance(emp, leave_type.leave_code, as_of_date)
			summary[leave_type.leave_code] = float(balance)
		
		return summary


# Singleton instance for easy import
leave_engine = LeaveBalanceEngine()
