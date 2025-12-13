from rest_framework.decorators import api_view, permission_classes
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from rest_framework import status

from api.domain_emp import EmpProfile
from .utils.leave_calendar import generate_leave_calendar


@api_view(["GET"])
@permission_classes([IsAuthenticated])
def leave_calendar_report(request):
    """Return sandwich-aware leave calendar payload for a single employee/year."""
    emp_id = request.query_params.get("emp_id")
    year_param = request.query_params.get("year")

    if not emp_id or not year_param:
        return Response(
            {"detail": "emp_id and year are required query params"},
            status=status.HTTP_400_BAD_REQUEST,
        )

    try:
        year = int(year_param)
    except (TypeError, ValueError):
        return Response({"detail": "year must be a valid integer"}, status=status.HTTP_400_BAD_REQUEST)

    employee = (
        EmpProfile.objects.filter(emp_id=emp_id)
        .values("emp_id", "emp_name", "emp_designation", "leave_group")
        .first()
    )
    if not employee:
        return Response({"detail": "Employee not found"}, status=status.HTTP_404_NOT_FOUND)

    calendar, summary, metadata, period = generate_leave_calendar(emp_id, year)

    return Response(
        {
            "employee": employee,
            "year": year,
            "calendar": calendar,
            "summary": summary,
            "metadata": metadata,
            "period": period,
        }
    )
