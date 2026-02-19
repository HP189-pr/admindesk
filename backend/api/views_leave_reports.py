# --- LeaveReportView: returns flat rows for frontend ---
from rest_framework.views import APIView
from rest_framework.response import Response
from rest_framework import permissions, status
from .leave_engine import compute_leave_balances

class LeaveReportView(APIView):
    permission_classes = [permissions.IsAuthenticated]

    def get(self, request):
        period_id = request.query_params.get("period")
        if not period_id:
            return Response({"rows": [], "metadata": {}}, status=status.HTTP_400_BAD_REQUEST)
        try:
            period_id = int(period_id)
        except Exception:
            return Response({"rows": [], "metadata": {}}, status=status.HTTP_400_BAD_REQUEST)

        payload = compute_leave_balances()
        # DEBUG: Print full payload and selected period_id
        print("[DEBUG] Selected period_id:", period_id)
        print("[DEBUG] Payload:", payload)
        rows = []
        for emp in payload.get("employees", []):
            for p in emp.get("periods", []):
                if p.get("period_id") == period_id:
                    rows.append({
                        "emp_id": emp.get("emp_id"),
                        "emp_name": emp.get("emp_name", ""),
                        "emp_short": emp.get("emp_short", ""),
                        "emp_designation": emp.get("designation", ""),
                        "leave_group": emp.get("leave_group", ""),
                        "actual_joining": emp.get("actual_joining", ""),
                        "left_date": emp.get("left_date", ""),
                        "start_sl": p["starting"].get("SL", 0),
                        "start_el": p["starting"].get("EL", 0),
                        "alloc_cl": p["allocation"].get("CL", 0),
                        "alloc_sl": p["allocation"].get("SL", 0),
                        "alloc_el": p["allocation"].get("EL", 0),
                        "alloc_vac": p["allocation"].get("VAC", 0),
                        "used_cl": p["used"].get("CL", 0),
                        "used_sl": p["used"].get("SL", 0),
                        "used_el": p["used"].get("EL", 0),
                        "used_vac": p["used"].get("VAC", 0),
                        "used_dl": p["used"].get("DL", 0),
                        "used_lwp": p["used"].get("LWP", 0),
                        "used_ml": p["used"].get("ML", 0),
                        "used_pl": p["used"].get("PL", 0),
                        "end_cl": p["ending"].get("CL", 0),
                        "end_sl": p["ending"].get("SL", 0),
                        "end_el": p["ending"].get("EL", 0),
                        "end_vac": p["ending"].get("VAC", 0),
                    })
        return Response({"rows": rows, "metadata": payload.get("metadata", {})})
# views_leave_reports.py
"""
Manager-facing leave reports (employee-summary, employee-range, multi-year, all-employees)
All powered by compute_leave_balances wrapper (compat) so outputs align with your frontend.
"""
from rest_framework.views import APIView
from rest_framework.response import Response
from rest_framework import status, permissions
from datetime import datetime
from decimal import Decimal

from .domain_emp import EmpProfile, LeavePeriod, LeaveType

def _parse_date(s):
    if not s:
        return None
    for fmt in ("%Y-%m-%d", "%d-%m-%Y"):
        try:
            return datetime.strptime(s, fmt).date()
        except Exception:
            pass
    return None

def _is_manager(user):
    if not user or not user.is_authenticated:
        return False
    if user.is_staff or user.is_superuser:
        return True
    return user.groups.filter(name__iexact="leave_management").exists()

def _to_decimal(val):
    if isinstance(val, Decimal):
        return val
    return Decimal(str(val)) if val is not None else Decimal("0")


class EmployeeSummaryView(APIView):
    permission_classes = [permissions.IsAuthenticated]

    def get(self, request):
        if not _is_manager(request.user):
            return Response({"detail": "Forbidden"}, status=status.HTTP_403_FORBIDDEN)
        emp_id = request.query_params.get("emp_id")
        period_id = request.query_params.get("period_id")
        if not emp_id or not period_id:
            return Response({"detail": "emp_id and period_id are required"}, status=status.HTTP_400_BAD_REQUEST)
        try:
            period_id = int(period_id)
        except Exception:
            return Response({"detail": "invalid period_id"}, status=status.HTTP_400_BAD_REQUEST)

        payload = compute_leave_balances()
        emp = next((e for e in payload.get("employees", []) if str(e.get("emp_id")) == str(emp_id)), None)
        if not emp:
            return Response({"detail": "No data"}, status=status.HTTP_404_NOT_FOUND)
        rec = next((p for p in emp.get("periods", []) if p.get("period_id") == period_id), None)
        if not rec:
            return Response({"detail": "No data for period"}, status=status.HTTP_404_NOT_FOUND)

        return Response({
            "emp_id": emp.get("emp_id"),
            "leave_group": emp.get("leave_group", ""),
            "emp_name": emp.get("emp_name"),
            "period": {
                "id": rec.get("period_id"),
                "name": rec.get("period_name"),
                "start": rec.get("period_start").strftime("%d-%m-%Y") if hasattr(rec.get("period_start"), "strftime") else str(rec.get("period_start")),
                "end": rec.get("period_end").strftime("%d-%m-%Y") if hasattr(rec.get("period_end"), "strftime") else str(rec.get("period_end")),
            },
            "opening": rec.get("starting", {}),
            "allocated": rec.get("allocation", {}),
            "used": rec.get("used", {}),
            "closing": rec.get("ending", {})
        })


class EmployeeDateRangeView(APIView):
    permission_classes = [permissions.IsAuthenticated]

    def get(self, request):
        if not _is_manager(request.user):
            return Response({"detail": "Forbidden"}, status=status.HTTP_403_FORBIDDEN)
        emp_id = request.query_params.get("emp_id")
        from_s = request.query_params.get("from")
        to_s = request.query_params.get("to")
        if not emp_id or not from_s or not to_s:
            return Response({"detail": "emp_id, from and to required"}, status=status.HTTP_400_BAD_REQUEST)
        start = _parse_date(from_s)
        end = _parse_date(to_s)
        if not start or not end:
            return Response({"detail": "Invalid dates"}, status=status.HTTP_400_BAD_REQUEST)
        if start > end:
            return Response({"detail": "from must be before to"}, status=status.HTTP_400_BAD_REQUEST)

        # compute whole engine and then derive for custom range using same logic as previous compute wrapper
        payload = compute_leave_balances(employee_ids=[str(emp_id)])
        emp = next((e for e in payload.get("employees", []) if str(e.get("emp_id")) == str(emp_id)), None)
        if not emp:
            return Response({"detail": "No data"}, status=status.HTTP_404_NOT_FOUND)

        # emulate previous _get_employee_balance_summary logic: filter allocations overlapping window and sum used
        # We'll produce opening/allocated/used/closing by aggregating periods that overlap the window
        opening = {"CL":0,"SL":0,"EL":0,"VAC":0}
        allocated = {"CL":0,"SL":0,"EL":0,"VAC":0}
        used = {"CL":0,"SL":0,"EL":0,"VAC":0,"DL":0,"LWP":0,"ML":0,"PL":0}

        # For custom range, consider periods overlapping range and scale allocation proportionally if needed
        for p in emp.get("periods", []):
            pstart = p.get("period_start")
            pend = p.get("period_end")
            if (pstart <= end) and (pend >= start):
                # overlap exists
                period_days = (pend - pstart).days + 1
                overlap_start = max(pstart, start)
                overlap_end = min(pend, end)
                active_days = (overlap_end - overlap_start).days + 1
                for code in ("CL","SL","EL","VAC"):
                    alloc_val = Decimal(str(p.get("allocation", {}).get(code, 0)))
                    prorated = (alloc_val * Decimal(active_days) / Decimal(period_days)) if period_days>0 else Decimal("0")
                    allocated[code] += prorated
                    opening[code] = opening.get(code,0) + Decimal(str(p.get("starting", {}).get(code, 0)))
                    used[code] = used.get(code,0) + Decimal(str(p.get("used", {}).get(code, 0)))

        closing = {}
        for code in ("CL","SL","EL","VAC"):
            closing_val = _to_decimal(opening.get(code,0)) + _to_decimal(allocated.get(code,0)) - _to_decimal(used.get(code,0))
            if code == "CL":
                closing_val = max(Decimal("0"), _to_decimal(allocated.get(code,0)) - _to_decimal(used.get(code,0)))
            closing[code] = closing_val

        # format output with engine rounding rules
        def fmt(d, code):
            return d if isinstance(d, (int,float)) else float(d) if d != d.to_integral_value() else int(d)

        return Response({
            "emp_id": emp.get("emp_id"),
            "leave_group": emp.get("leave_group", ""),
            "emp_name": emp.get("emp_name"),
            "period": {"id": 0, "name": f"{start.strftime('%d-%m-%Y')} to {end.strftime('%d-%m-%Y')}", "start": start.strftime("%d-%m-%Y"), "end": end.strftime("%d-%m-%Y")},
            "opening": {k: fmt(_to_decimal(opening.get(k)), k) for k in opening},
            "allocated": {k: fmt(_to_decimal(allocated.get(k)), k) for k in allocated},
            "used": {k: fmt(_to_decimal(used.get(k)), k) for k in used},
            "closing": {k: fmt(_to_decimal(closing.get(k)), k) for k in closing},
        })


class EmployeeMultiYearView(APIView):
    permission_classes = [permissions.IsAuthenticated]

    def get(self, request):
        if not _is_manager(request.user):
            return Response({"detail": "Forbidden"}, status=status.HTTP_403_FORBIDDEN)
        emp_id = request.query_params.get("emp_id")
        if not emp_id:
            return Response({"detail": "emp_id required"}, status=status.HTTP_400_BAD_REQUEST)
        payload = compute_leave_balances(employee_ids=[str(emp_id)])
        emp = next((e for e in payload.get("employees", []) if str(e.get("emp_id")) == str(emp_id)), None)
        if not emp:
            return Response({"detail": "No data"}, status=status.HTTP_404_NOT_FOUND)
        years = []
        for p in emp.get("periods", []):
            years.append({
                "period": {"id": p.get("period_id"), "name": p.get("period_name"), "start": p.get("period_start").strftime("%d-%m-%Y"), "end": p.get("period_end").strftime("%d-%m-%Y")},
                "opening": p.get("starting", {}),
                "allocated": p.get("allocation", {}),
                "used": p.get("used", {}),
                "closing": p.get("ending", {})
            })
        return Response({"emp_id": emp.get("emp_id"), "leave_group": emp.get("leave_group", ""), "emp_name": emp.get("emp_name"), "years": years})


class AllEmployeesBalanceView(APIView):
    permission_classes = [permissions.IsAuthenticated]

    def get(self, request):
        if not _is_manager(request.user):
            return Response({"detail": "Forbidden"}, status=status.HTTP_403_FORBIDDEN)
        period_id = request.query_params.get("period_id")
        if not period_id:
            return Response({"detail": "period_id required"}, status=status.HTTP_400_BAD_REQUEST)
        try:
            period_id = int(period_id)
            period = LeavePeriod.objects.get(id=period_id)
        except Exception:
            return Response({"detail": "Invalid period_id"}, status=status.HTTP_400_BAD_REQUEST)

        payload = compute_leave_balances()
        employees_out = []
        for emp in payload.get("employees", []):
            rec = next((p for p in emp.get("periods", []) if p.get("period_id") == period_id), None)
            if not rec:
                continue
            lt_list = []
            for code in ("CL","SL","EL","VAC"):
                lt_list.append({
                    "code": code,
                    "starting": rec.get("starting", {}).get(code, 0),
                    "allocated": rec.get("allocation", {}).get(code, 0),
                    "used": rec.get("used", {}).get(code, 0),
                    "balance": rec.get("ending", {}).get(code, 0)
                })
            employees_out.append({
                "emp_id": emp.get("emp_id"),
                    "leave_group": emp.get("leave_group", ""),
                "emp_short": emp.get("emp_short"),
                "emp_name": emp.get("emp_name"),
                "leave_types": lt_list
            })
        return Response({
            "period": {"id": period.id, "name": period.period_name, "start": period.start_date.strftime("%d-%m-%Y"), "end": period.end_date.strftime("%d-%m-%Y")},
            "employees": employees_out
        })
