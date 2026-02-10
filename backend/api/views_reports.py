from rest_framework.views import APIView
from rest_framework.response import Response
from rest_framework import status
from rest_framework.permissions import IsAuthenticated
import json
from .views_emp import IsLeaveManager
from django.db import connection
from django.utils import timezone

from .domain_leave_balance import compute_and_persist_leave_balances
from .snapshot_queue import enqueue_recompute_task, process_queue_once
from .leave_activation import activate_period


class LeaveBalanceReportView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request, *args, **kwargs):
        # Accept either `period_id` (canonical) or `period` (used by frontend)
        period_id = request.query_params.get('period_id') or request.query_params.get('period')
        force = request.query_params.get('force_recompute', 'false').lower() in ('1', 'true', 'yes')
        async_q = request.query_params.get('async', 'false').lower() in ('1', 'true', 'yes')

        if not period_id:
            return Response({'detail': 'period_id is required'}, status=status.HTTP_400_BAD_REQUEST)

        try:
            pid = int(period_id)
        except Exception:
            return Response({'detail': 'invalid period_id'}, status=status.HTTP_400_BAD_REQUEST)

        # check if snapshots exist and are fresh for this period
        from .domain_leave_balance import snapshots_fresh_for_period
        fresh = snapshots_fresh_for_period(pid)

        if force or not fresh:
            if async_q:
                task_id = enqueue_recompute_task(pid)
                return Response({'task_id': task_id, 'status': 'enqueued'})
            # synchronous compute
            started = timezone.now()
            compute_and_persist_leave_balances(period_id=pid)
            duration = (timezone.now() - started).total_seconds()

        # fetch snapshot rows for period
        with connection.cursor() as cur:
            cur.execute(
                """
                SELECT emp_id, emp_name, period_id, allocation_id, allocation_start_date, allocation_end_date,
                       COALESCE(starting_el,0) AS starting_el, COALESCE(starting_cl,0) AS starting_cl, COALESCE(starting_sl,0) AS starting_sl,
                       COALESCE(allocated_el,0) AS allocated_el, COALESCE(allocated_cl,0) AS allocated_cl, COALESCE(allocated_sl,0) AS allocated_sl,
                       COALESCE(used_el,0) AS used_el, COALESCE(used_cl,0) AS used_cl, COALESCE(used_sl,0) AS used_sl,
                       COALESCE(ending_el,0) AS ending_el, COALESCE(ending_cl,0) AS ending_cl, COALESCE(ending_sl,0) AS ending_sl,
                       COALESCE(carry_forward_el,0) AS carry_forward_el, COALESCE(carry_forward_cl,0) AS carry_forward_cl,
                       effective_joining_date, left_date, allocation_meta
                FROM api_leavebalancesnapshot
                WHERE period_id = %s
                ORDER BY emp_id
                """,
                [pid],
            )
            cols = [c[0] for c in cur.description]
            rows = [dict(zip(cols, r)) for r in cur.fetchall()]

        # normalize allocation_meta JSON
        for r in rows:
            am = r.get('allocation_meta')
            try:
                if isinstance(am, str):
                    r['allocation_meta'] = json.loads(am)
                else:
                    r['allocation_meta'] = am or {}
            except Exception:
                r['allocation_meta'] = {}

        return Response(rows)


class RecomputeSnapshotsView(APIView):
    # Admin endpoint to request recompute; allow leave managers only
    permission_classes = [IsLeaveManager]

    def post(self, request, *args, **kwargs):
        period_id = request.query_params.get('period_id') or request.data.get('period_id')
        async_q = request.query_params.get('async', 'false').lower() in ('1', 'true', 'yes')

        if period_id:
            try:
                pid = int(period_id)
            except Exception:
                return Response({'detail': 'invalid period_id'}, status=status.HTTP_400_BAD_REQUEST)
        else:
            pid = None

        if async_q:
            task_id = enqueue_recompute_task(pid)
            return Response({'task_id': task_id, 'status': 'enqueued'})

        started = timezone.now()
        res = compute_and_persist_leave_balances(period_id=pid)
        duration = (timezone.now() - started).total_seconds()
        return Response({'status': 'done', 'periods_processed': len(res.get('metadata', {}).get('periods', [])), 'rows': len(res.get('employees', [])), 'duration_seconds': duration})


class ActivatePeriodView(APIView):
    """Activate a leave period (idempotent). Calls `activate_period` in `leave_activation`.

    POST body or query param: `period_id` or `period`.
    Only users with `IsLeaveManager` permission can call this.
    """
    permission_classes = [IsLeaveManager]

    def post(self, request, *args, **kwargs):
        pid = request.query_params.get('period_id') or request.query_params.get('period') or request.data.get('period_id')
        if not pid:
            return Response({'detail': 'period_id is required'}, status=status.HTTP_400_BAD_REQUEST)
        try:
            period_id = int(pid)
        except Exception:
            return Response({'detail': 'invalid period_id'}, status=status.HTTP_400_BAD_REQUEST)
        try:
            summary = activate_period(period_id)
            return Response({'status': 'ok', 'summary': summary})
        except Exception as e:
            import traceback
            traceback.print_exc()
            return Response({'detail': str(e)}, status=status.HTTP_500_INTERNAL_SERVER_ERROR)
