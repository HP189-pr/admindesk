from datetime import date
from decimal import Decimal
from types import SimpleNamespace

from django.test import SimpleTestCase

from ..domain_leave_balance import (
	LeaveComputationConfig,
	_PeriodWindow,
	compute_leave_balances_from_iterables,
)


class LeaveBalanceComputationTests(SimpleTestCase):
	def _employee(
		self,
		*,
		emp_id="E001",
		joining=date(2024, 1, 1),
		base_el=Decimal("50"),
		join_el=Decimal("20"),
		calc_date=None,
	):
		return SimpleNamespace(
			emp_id=emp_id,
			emp_name="Test Emp",
			actual_joining=joining,
			leave_calculation_date=calc_date,
			el_balance=base_el,
			cl_balance=Decimal("0"),
			sl_balance=Decimal("0"),
			vacation_balance=Decimal("0"),
			joining_year_allocation_el=join_el,
			joining_year_allocation_cl=Decimal("0"),
			joining_year_allocation_sl=Decimal("0"),
			joining_year_allocation_vac=Decimal("0"),
		)

	def _period(self, idx, name, start, end):
		return _PeriodWindow(id=idx, name=name, start=start, end=end)

	def _allocation(
		self,
		*,
		emp,
		period,
		el=Decimal("0"),
		cl=Decimal("0"),
		sl=Decimal("0"),
		leave_code=None,
		profile_override=None,
	):
		profile_id = profile_override if profile_override is not None else (emp.emp_id if emp else None)
		return SimpleNamespace(
			period_id=period.id,
			profile_id=profile_id,
			leave_type_id=leave_code,
			allocated_el=el,
			allocated_cl=cl,
			allocated_sl=sl,
			allocated_vac=Decimal("0"),
			allocated=Decimal("0"),
		)

	def _entry(self, *, emp, leave_code, start, end, day_value=Decimal("1")):
		leave_type = SimpleNamespace(day_value=day_value, leave_code=leave_code)
		return SimpleNamespace(
			emp_id=emp.emp_id,
			start_date=start,
			end_date=end,
			leave_type_id=leave_code,
			leave_type=leave_type,
		)

	def test_one_year_rule_blocks_allocation(self):
		period = self._period(1, "2025-26", date(2025, 7, 1), date(2026, 6, 30))
		emp = self._employee(joining=date(2025, 1, 1), calc_date=date(2025, 7, 1))
		allocations = [self._allocation(emp=emp, period=period, el=Decimal("110"))]
		entries = [
			self._entry(
				emp=emp,
				leave_code="EL",
				start=date(2025, 8, 1),
				end=date(2025, 8, 25),
			)
		]

		payload = compute_leave_balances_from_iterables(
			periods=[period],
			employees=[emp],
			allocations=allocations,
			entries=entries,
		)
		first_period = payload["employees"][0]["periods"][0]
		self.assertAlmostEqual(first_period["starting"]["EL"], 70.0)
		self.assertAlmostEqual(first_period["allocation"]["EL"], 0.0)
		self.assertAlmostEqual(first_period["used"]["EL"], 25.0)
		self.assertAlmostEqual(first_period["ending"]["EL"], 45.0)
		meta = first_period["allocation_meta"]["EL"]
		self.assertFalse(meta["applied"])
		self.assertEqual(meta["reason"], "within_waiting_period")
		self.assertAlmostEqual(meta["original_allocation"], 110.0)
		self.assertAlmostEqual(meta["effective_allocation"], 0.0)

	def test_allocation_applies_after_one_year(self):
		period = self._period(1, "2025-26", date(2025, 7, 1), date(2026, 6, 30))
		emp = self._employee(joining=date(2024, 1, 1), calc_date=date(2025, 7, 1))
		allocations = [self._allocation(emp=emp, period=period, el=Decimal("110"))]
		entries = [
			self._entry(
				emp=emp,
				leave_code="EL",
				start=date(2025, 8, 1),
				end=date(2025, 8, 25),
			)
		]

		payload = compute_leave_balances_from_iterables(
			periods=[period],
			employees=[emp],
			allocations=allocations,
			entries=entries,
		)
		first_period = payload["employees"][0]["periods"][0]
		self.assertAlmostEqual(first_period["starting"]["EL"], 70.0)
		self.assertAlmostEqual(first_period["allocation"]["EL"], 110.0)
		self.assertAlmostEqual(first_period["ending"]["EL"], 155.0)
		meta = first_period["allocation_meta"]["EL"]
		self.assertTrue(meta["applied"])
		self.assertAlmostEqual(meta["original_allocation"], 110.0)
		self.assertAlmostEqual(meta["effective_allocation"], 110.0)
		self.assertIsNone(meta["reason"])

	def test_first_period_allocation_toggle(self):
		period = self._period(1, "2025-26", date(2025, 7, 1), date(2026, 6, 30))
		emp = self._employee(joining=date(2024, 1, 1), calc_date=date(2025, 7, 1))
		allocations = [self._allocation(emp=emp, period=period, el=Decimal("40"))]
		payload_default = compute_leave_balances_from_iterables(
			periods=[period],
			employees=[emp],
			allocations=allocations,
			entries=[],
		)
		payload_toggle = compute_leave_balances_from_iterables(
			periods=[period],
			employees=[emp],
			allocations=allocations,
			entries=[],
			config=LeaveComputationConfig(first_period_adds_allocation=True),
		)
		first_default = payload_default["employees"][0]["periods"][0]
		first_toggle = payload_toggle["employees"][0]["periods"][0]
		self.assertAlmostEqual(first_default["starting"]["EL"], 70.0)
		self.assertAlmostEqual(first_toggle["starting"]["EL"], 110.0)

	def test_leave_spanning_two_periods_is_split(self):
		period1 = self._period(1, "FY24-Q4", date(2025, 4, 1), date(2025, 6, 30))
		period2 = self._period(2, "FY25-Q1", date(2025, 7, 1), date(2025, 9, 30))
		emp = self._employee(
			emp_id="E100",
			joining=date(2020, 1, 1),
			calc_date=date(2025, 4, 1),
			base_el=Decimal("0"),
			join_el=Decimal("0"),
		)
		allocations = [
			self._allocation(emp=emp, period=period1, el=Decimal("10")),
			self._allocation(emp=emp, period=period2, el=Decimal("10")),
		]
		entries = [
			self._entry(
				emp=emp,
				leave_code="EL",
				start=date(2025, 6, 25),
				end=date(2025, 7, 5),
			)
		]

		payload = compute_leave_balances_from_iterables(
			periods=[period1, period2],
			employees=[emp],
			allocations=allocations,
			entries=entries,
		)
		periods = payload["employees"][0]["periods"]
		self.assertAlmostEqual(periods[0]["used"]["EL"], 6.0)
		self.assertAlmostEqual(periods[1]["used"]["EL"], 5.0)
		self.assertAlmostEqual(periods[0]["ending"]["EL"], 4.0)
		self.assertAlmostEqual(periods[1]["ending"]["EL"], 9.0)
