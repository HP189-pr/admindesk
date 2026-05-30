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
