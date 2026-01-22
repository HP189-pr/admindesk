# views_leave_balance.py
"""
DRF views that use the live engine for balances.
Endpoints:
- GET /api/leave-balance/current/         -> CurrentLeaveBalanceView
- GET /api/leave-balance/period/<id>/     -> PeriodLeaveBalanceView
- GET /api/leave-balance/history/         -> LeaveHistoryView
- GET /api/leave-balance/report/          -> LeaveBalanceReportView (HR/Admin only)
"""
from rest_framework.views import APIView
from rest_framework.response import Response
from rest_framework import status, permissions
from datetime import date


from .leave_engine import engine
from .domain_emp import EmpProfile, LeavePeriod, LeaveType

def _user_identifiers(user):
    vals = []
    for f in ("username", "usercode"):
        try:
            v = getattr(user, f, None)
            if v:
                vals.append(str(v))
        except Exception:
            pass
    return vals

def _first_profile_for_user(user):
    from django.db.models import Q
    ids = _user_identifiers(user)
    if not ids:
        return None
    q = Q()
    for ident in ids:
        q |= Q(username__iexact=ident) | Q(usercode__iexact=ident)
    return EmpProfile.objects.filter(q).first()

def _is_hr_admin(user):
    if not user or not user.is_authenticated:
        return False
    if user.is_staff or user.is_superuser:
        return True
    return user.groups.filter(name__iexact="leave_management").exists()

class CurrentLeaveBalanceView(APIView):
    permission_classes = [permissions.IsAuthenticated]

    def get(self, request):
        profile = _first_profile_for_user(request.user)
        if not profile:
            return Response({"detail": "Profile not found"}, status=status.HTTP_404_NOT_FOUND)

        as_of = request.query_params.get("as_of_date")
        if as_of:
            try:
                as_of_date = date.fromisoformat(as_of)
            except Exception:
                return Response({"detail": "Invalid date format (YYYY-MM-DD)"}, status=status.HTTP_400_BAD_REQUEST)
        else:
            as_of_date = date.today()

        # Cache leave type names (N+1 fix)
        leave_type_map = {lt.leave_code.upper(): lt.leave_name for lt in LeaveType.objects.all()}

        # compute entire payload for employee
        payload = engine.compute(employee_ids=[str(profile.emp_id)], leave_calculation_date=as_of_date)
        emp = next((e for e in payload.get("employees", []) if str(e.get("emp_id")) == str(profile.emp_id)), None)
        if not emp:
            return Response({"balances": []})

        # Correct current period selection logic
        periods = emp.get("periods", [])
        target_period = None
        for p in periods:
            ps_start = p.get("period_start")
            ps_end = p.get("period_end")
            if ps_start and ps_end and ps_start <= as_of_date <= ps_end:
                target_period = p
                break
        # fallback: latest past period
        if not target_period:
            for p in reversed(periods):
                ps_end = p.get("period_end")
                if ps_end and ps_end < as_of_date:
                    target_period = p
                    break
        if not target_period and periods:
            target_period = periods[-1]

        balances = []
        codes = payload.get("metadata", {}).get("tracked_leave_codes", ["CL","SL","EL","VAC"])
        for code in codes:
            balances.append({
                "leave_code": code,
                "leave_name": leave_type_map.get(code.upper(), code),
                "current_balance": target_period.get("ending", {}).get(code, 0) if target_period else 0,
                "unit": "days"
            })
        return Response({
            "emp_id": profile.emp_id,
            "emp_name": profile.emp_name,
            "as_of_date": as_of_date.isoformat(),
            "balances": balances
        })


class PeriodLeaveBalanceView(APIView):
    permission_classes = [permissions.IsAuthenticated]

    def get(self, request, period_id):
        profile = _first_profile_for_user(request.user)
        if not profile:
            return Response({"detail": "Profile not found"}, status=status.HTTP_404_NOT_FOUND)
        try:
            period = LeavePeriod.objects.get(id=period_id)
        except LeavePeriod.DoesNotExist:
            return Response({"detail": "Period not found"}, status=status.HTTP_404_NOT_FOUND)

        leave_code = request.query_params.get("leave_code")

        as_of = request.query_params.get("as_of_date")
        if as_of:
            try:
                as_of_date = date.fromisoformat(as_of)
            except Exception:
                return Response({"detail": "Invalid date format (YYYY-MM-DD)"}, status=status.HTTP_400_BAD_REQUEST)
        else:
            as_of_date = date.today()

        leave_type_map = {lt.leave_code.upper(): lt.leave_name for lt in LeaveType.objects.all()}
        payload = engine.compute(employee_ids=[str(profile.emp_id)], leave_calculation_date=as_of_date)
        emp = next((e for e in payload.get("employees", []) if str(e.get("emp_id")) == str(profile.emp_id)), None)
        if not emp:
            return Response({"detail": "No data"}, status=status.HTTP_404_NOT_FOUND)
        rec = next((p for p in emp.get("periods", []) if p.get("period_id") == int(period_id)), None)
        if not rec:
            return Response({"detail": "No data for requested period"}, status=status.HTTP_404_NOT_FOUND)

        balances = []
        codes = [leave_code] if leave_code else payload.get("metadata", {}).get("tracked_leave_codes", ["CL","SL","EL","VAC"])
        for code in codes:
            balances.append({
                "leave_code": code,
                "leave_name": leave_type_map.get(code.upper(), code),
                "opening_balance": rec.get("starting", {}).get(code, 0),
                "allocated_in_period": rec.get("allocation", {}).get(code, 0),
                "used_in_period": rec.get("used", {}).get(code, 0),
                "closing_balance": rec.get("ending", {}).get(code, 0),
            })
        return Response({
            "emp_id": profile.emp_id,
            "emp_name": profile.emp_name,
            "period": {
                "id": period.id, "name": period.period_name,
                "start_date": period.start_date.isoformat(), "end_date": period.end_date.isoformat()
            },
            "balances": balances
        })


class LeaveHistoryView(APIView):
    permission_classes = [permissions.IsAuthenticated]

    def get(self, request):
        profile = _first_profile_for_user(request.user)
        if not profile:
            return Response({"detail": "Profile not found"}, status=status.HTTP_404_NOT_FOUND)

        leave_code = request.query_params.get("leave_code")
        as_of = request.query_params.get("as_of_date")
        if as_of:
            try:
                as_of_date = date.fromisoformat(as_of)
            except Exception:
                return Response({"detail": "Invalid date format (YYYY-MM-DD)"}, status=status.HTTP_400_BAD_REQUEST)
        else:
            as_of_date = date.today()
        payload = engine.compute(employee_ids=[str(profile.emp_id)], leave_calculation_date=as_of_date)
        emp = next((e for e in payload.get("employees", []) if str(e.get("emp_id")) == str(profile.emp_id)), None)
        if not emp:
            return Response({"emp_id": profile.emp_id, "emp_name": profile.emp_name, "history": []})

        history = []
        for p in emp.get("periods", []):
            codes = [leave_code] if leave_code else payload.get("metadata", {}).get("tracked_leave_codes", [])
            for code in codes:
                history.append({
                    "period": {
                        "id": p.get("period_id"),
                        "name": p.get("period_name"),
                        "start_date": p.get("period_start").isoformat() if isinstance(p.get("period_start"), date) else str(p.get("period_start")),
                        "end_date": p.get("period_end").isoformat() if isinstance(p.get("period_end"), date) else str(p.get("period_end")),
                    },
                    "leave_code": code,
                    "opening_balance": p.get("starting", {}).get(code, 0),
                    "allocated_in_period": p.get("allocation", {}).get(code, 0),
                    "used_in_period": p.get("used", {}).get(code, 0),
                    "closing_balance": p.get("ending", {}).get(code, 0),
                })
        return Response({"emp_id": profile.emp_id, "emp_name": profile.emp_name, "history": history})


class LeaveBalanceReportView(APIView):
    permission_classes = [permissions.IsAuthenticated]

    def get(self, request):
        if not _is_hr_admin(request.user):
            return Response({"detail": "Only HR/Admin can access"}, status=status.HTTP_403_FORBIDDEN)

        period_id = request.query_params.get("period_id")
        if not period_id:
            period = LeavePeriod.objects.order_by("-start_date").first()
            if not period:
                return Response({"detail": "No periods defined"}, status=status.HTTP_404_NOT_FOUND)
        else:
            try:
                period = LeavePeriod.objects.get(id=int(period_id))
            except Exception:
                return Response({"detail": "Invalid period_id"}, status=status.HTTP_400_BAD_REQUEST)

        leave_code = request.query_params.get("leave_code")
        # compute for all employees (engine will load employees itself)
        as_of = request.query_params.get("as_of_date")
        if as_of:
            try:
                as_of_date = date.fromisoformat(as_of)
            except Exception:
                return Response({"detail": "Invalid date format (YYYY-MM-DD)"}, status=status.HTTP_400_BAD_REQUEST)
        else:
            as_of_date = date.today()
        leave_type_map = {lt.leave_code.upper(): lt.leave_name for lt in LeaveType.objects.all()}
        payload = engine.compute(leave_calculation_date=as_of_date)
        employees_out = []
        for emp in payload.get("employees", []):
            rec = next((p for p in emp.get("periods", []) if p.get("period_id") == period.id), None)
            if not rec:
                continue
            if leave_code:
                employees_out.append({
                    "emp_id": emp.get("emp_id"),
                    "emp_name": emp.get("emp_name"),
                    "opening_balance": rec.get("starting", {}).get(leave_code, 0),
                    "allocated_in_period": rec.get("allocation", {}).get(leave_code, 0),
                    "used_in_period": rec.get("used", {}).get(leave_code, 0),
                    "closing_balance": rec.get("ending", {}).get(leave_code, 0),
                })
            else:
                lt_list = []
                for c in payload.get("metadata", {}).get("tracked_leave_codes", ["CL","SL","EL","VAC"]):
                    lt_list.append({
                        "code": c,
                        "name": leave_type_map.get(c.upper(), c),
                        "allocated": rec.get("allocation", {}).get(c, 0),
                        "used": rec.get("used", {}).get(c, 0),
                        "balance": rec.get("ending", {}).get(c, 0)
                    })
                employees_out.append({
                    "emp_id": emp.get("emp_id"),
                    "emp_short": emp.get("emp_short"),
                    "emp_name": emp.get("emp_name"),
                    "leave_types": lt_list
                })

        response = {
            "period": {"id": period.id, "name": period.period_name, "start": period.start_date.isoformat(), "end": period.end_date.isoformat()},
            "employees": employees_out
        }
        if leave_code:
            response["leave_code"] = leave_code
        return Response(response)
