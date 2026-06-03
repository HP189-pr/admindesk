from datetime import date
from decimal import Decimal
from types import SimpleNamespace

from django.test import SimpleTestCase

from ..leave_engine import LeaveEngine, PeriodWindow


class LeaveEngineGroupingTests(SimpleTestCase):
    def test_half_leave_uses_main_type_bucket(self):
        engine = LeaveEngine()
        period = PeriodWindow(id=1, name="2025-26", start=date(2025, 6, 1), end=date(2026, 5, 31))
        leave_type = SimpleNamespace(leave_code="HCL1", main_type="CL", day_value=Decimal("0.5"), is_half=True)
        entry = SimpleNamespace(
            emp_id="25",
            start_date=date(2025, 9, 1),
            end_date=date(2025, 9, 1),
            leave_type_id="HCL1",
            leave_type=leave_type,
        )

        split = engine._split_entry(entry, [period], set())

        self.assertEqual(split[1]["CL"], Decimal("0.5"))
        self.assertNotIn("HCL1", split[1])

    def test_half_leave_code_falls_back_to_main_bucket(self):
        engine = LeaveEngine()
        period = PeriodWindow(id=1, name="2025-26", start=date(2025, 6, 1), end=date(2026, 5, 31))
        leave_type = SimpleNamespace(leave_code="HSL2", main_type="", day_value=Decimal("0.5"), is_half=True)
        entry = SimpleNamespace(
            emp_id="25",
            start_date=date(2025, 9, 1),
            end_date=date(2025, 9, 1),
            leave_type_id="HSL2",
            leave_type=leave_type,
        )

        split = engine._split_entry(entry, [period], set())

        self.assertEqual(split[1]["SL"], Decimal("0.5"))
        self.assertNotIn("HSL2", split[1])

    def test_joining_year_cl_allocation_applies_once_in_first_active_period(self):
        from unittest.mock import patch

        class FakeQS(list):
            def filter(self, *args, **kwargs):
                if "emp_id__in" in kwargs:
                    allowed = set(str(v) for v in kwargs["emp_id__in"])
                    return FakeQS([item for item in self if str(getattr(item, "emp_id", None)) in allowed])
                return self

            def order_by(self, *args, **kwargs):
                return self

        class FakeManager:
            def __init__(self, objs):
                self._objs = objs

            def all(self):
                return FakeQS(self._objs)

            def filter(self, *args, **kwargs):
                return self.all().filter(*args, **kwargs)

        periods = [
            PeriodWindow(id=1, name="FY25", start=date(2025, 7, 1), end=date(2026, 6, 30)),
            PeriodWindow(id=2, name="FY26", start=date(2026, 7, 1), end=date(2027, 6, 30)),
        ]

        employee = SimpleNamespace(
            emp_id="E1",
            emp_name="Test Employee",
            emp_short="E1",
            emp_designation="",
            leave_group="",
            actual_joining=date(2025, 9, 1),
            department_joining=None,
            leave_calculation_date=None,
            left_date=None,
            status="Active",
            el_balance=Decimal("0"),
            cl_balance=Decimal("0"),
            sl_balance=Decimal("0"),
            vacation_balance=Decimal("0"),
            joining_year_allocation_el=Decimal("0"),
            joining_year_allocation_cl=Decimal("6"),
            joining_year_allocation_sl=Decimal("0"),
            joining_year_allocation_vac=Decimal("0"),
        )

        allocations = [
            SimpleNamespace(period_id=1, emp=None, leave_code="CL", allocated=Decimal("6"), sandwich=False),
            SimpleNamespace(period_id=2, emp=None, leave_code="CL", allocated=Decimal("6"), sandwich=False),
        ]

        with patch.object(LeaveEngine, "load_periods", return_value=periods), \
             patch.object(LeaveEngine, "load_allocations_for_periods", return_value=allocations), \
             patch.object(LeaveEngine, "load_entries", return_value=[]), \
             patch.object(LeaveEngine, "load_holidays", return_value=set()), \
             patch("api.leave_engine.EmpProfile.objects", FakeManager([employee])):
            result = LeaveEngine().compute()

        self.assertEqual(len(result["employees"]), 1)
        employee_result = result["employees"][0]
        self.assertEqual(len(employee_result["periods"]), 2)

        first_period = employee_result["periods"][0]
        second_period = employee_result["periods"][1]

        self.assertEqual(first_period["starting"]["CL"], 0)
        self.assertEqual(first_period["allocation"]["CL"], 11)
        self.assertEqual(first_period["ending"]["CL"], 11)

        self.assertEqual(second_period["starting"]["CL"], 0)
        self.assertEqual(second_period["allocation"]["CL"], 6)
        self.assertEqual(second_period["ending"]["CL"], 6)
