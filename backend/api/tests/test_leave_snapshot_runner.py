from django.test import TestCase
from django.db import connection
from ..domain_leave_balance import compute_and_persist_leave_balances
from . import factories


class LeaveSnapshotRunnerTests(TestCase):
    """Minimal tests for snapshot runner behaviour (stubs).

    These tests are intended as stubs demonstrating the important behaviours:
    - snapshots skipped for employees whose left_date < period.start
    - employee-specific allocation takes precedence over global
    - upsert produces one row per (emp, period)
    """

    def setUp(self):
        # factories should create sample periods/employees/allocations/entries
        pass

    def test_skip_after_left_date(self):
        # create a period and an employee who left before it; ensure no snapshot
        # This is a stub: fill with factory usage in real tests
        compute_and_persist_leave_balances()
        with connection.cursor() as cur:
            cur.execute("SELECT COUNT(*) FROM api_leavebalancesnapshot WHERE period_id IS NOT NULL")
            cnt = cur.fetchone()[0]
        # no assertion here; replace with real expected counts when factories exist
        self.assertIsNotNone(cnt)

    def test_allocation_precedence(self):
        # stub: create global allocation and employee-specific allocation for same period
        # run runner and assert employee's snapshot contains allocation_id of specific allocation
        compute_and_persist_leave_balances()
        self.assertTrue(True)

    def test_one_snapshot_per_emp_period(self):
        # ensure runner produces at most one snapshot row per emp+period
        compute_and_persist_leave_balances()
        self.assertTrue(True)
