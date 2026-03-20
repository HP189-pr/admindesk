# backend/api/views_exam_schedule.py
from datetime import timedelta

from django.db.models import Q
from rest_framework import permissions, serializers, status
from rest_framework.response import Response
from rest_framework.views import APIView

from .domain_core import Holiday
from .domain_emp import EmpProfile


class ExamScheduleEmployeeSerializer(serializers.Serializer):
    emp_id = serializers.CharField()
    emp_name = serializers.CharField()
    emp_designation = serializers.CharField(allow_blank=True, allow_null=True)
    status = serializers.CharField(allow_blank=True, allow_null=True)


class ExamScheduleRequestSerializer(serializers.Serializer):
    start_date = serializers.DateField(input_formats=["%Y-%m-%d", "%d-%m-%Y", "iso-8601"])
    days_per_phase = serializers.IntegerField(min_value=1, max_value=365)
    phase_count = serializers.IntegerField(min_value=1, max_value=24)
    employee_ids = serializers.ListField(child=serializers.CharField(), allow_empty=False)

    def validate_employee_ids(self, value):
        cleaned = []
        seen = set()
        for raw in value:
            key = str(raw or "").strip()
            if not key or key in seen:
                continue
            seen.add(key)
            cleaned.append(key)
        if not cleaned:
            raise serializers.ValidationError("Select at least one employee.")
        return cleaned


def _serialize_employee(emp):
    return {
        "emp_id": emp.emp_id,
        "emp_name": emp.emp_name,
        "emp_designation": emp.emp_designation or "",
        "status": emp.status or "",
    }


def _skip_reasons(current_date, holiday_lookup):
    reasons = []
    holiday = holiday_lookup.get(current_date)
    if current_date.weekday() == 6:
        reasons.append("Sunday")
    if holiday:
        holiday_name = (holiday.get("holiday_name") or "Holiday").strip() or "Holiday"
        reasons.append(f"Holiday: {holiday_name}")
    return reasons


def _build_schedule_window(start_candidate, total_days, holiday_lookup):
    cursor = start_candidate
    counted_days = []
    skipped_dates = []

    while len(counted_days) < total_days:
        reasons = _skip_reasons(cursor, holiday_lookup)
        if reasons:
            skipped_dates.append({
                "date": cursor.isoformat(),
                "reasons": reasons,
            })
        else:
            counted_days.append(cursor)
        cursor += timedelta(days=1)

    return counted_days[0], counted_days[-1], skipped_dates, cursor


class ExamScheduleEmployeeOptionsView(APIView):
    permission_classes = [permissions.IsAuthenticated]

    def get(self, request):
        query = str(request.query_params.get("q") or "").strip()
        queryset = EmpProfile.objects.all()
        if query:
            queryset = queryset.filter(
                Q(emp_id__icontains=query)
                | Q(emp_name__icontains=query)
                | Q(emp_designation__icontains=query)
            )

        rows = [
            _serialize_employee(emp)
            for emp in queryset.order_by("emp_name", "emp_id")[:500]
        ]
        return Response({
            "employees": rows,
            "count": len(rows),
        })


class ExamScheduleGenerateView(APIView):
    permission_classes = [permissions.IsAuthenticated]

    def post(self, request):
        serializer = ExamScheduleRequestSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)

        start_date = serializer.validated_data["start_date"]
        days_per_phase = serializer.validated_data["days_per_phase"]
        phase_count = serializer.validated_data["phase_count"]
        employee_ids = serializer.validated_data["employee_ids"]

        employees_by_id = {
            emp.emp_id: emp
            for emp in EmpProfile.objects.filter(emp_id__in=employee_ids)
        }
        missing_ids = [emp_id for emp_id in employee_ids if emp_id not in employees_by_id]
        if missing_ids:
            return Response(
                {
                    "detail": "Some employees were not found.",
                    "missing_employee_ids": missing_ids,
                },
                status=status.HTTP_400_BAD_REQUEST,
            )

        employees = [employees_by_id[emp_id] for emp_id in employee_ids]
        holiday_lookup = {
            holiday.holiday_date: {
                "holiday_name": holiday.holiday_name,
                "holiday_day": holiday.holiday_day,
            }
            for holiday in Holiday.objects.filter(holiday_date__gte=start_date).order_by("holiday_date")
        }

        generation_rows = []
        skipped_dates = []
        cursor = start_date

        for phase_index in range(1, phase_count + 1):
            for employee_order, employee in enumerate(employees, start=1):
                phase_start, phase_end, row_skipped_dates, next_cursor = _build_schedule_window(
                    cursor,
                    days_per_phase,
                    holiday_lookup,
                )
                row = {
                    "employee_no": employee.emp_id,
                    "employee_name": employee.emp_name,
                    "phase": phase_index,
                    "start_date": phase_start.isoformat(),
                    "end_date": phase_end.isoformat(),
                    "total_days": days_per_phase,
                    "employee_order": employee_order,
                    "skipped_dates": row_skipped_dates,
                }
                generation_rows.append(row)
                for skipped in row_skipped_dates:
                    skipped_dates.append(
                        {
                            "employee_no": employee.emp_id,
                            "employee_name": employee.emp_name,
                            "phase": phase_index,
                            **skipped,
                        }
                    )
                cursor = next_cursor

        display_rows = sorted(
            generation_rows,
            key=lambda row: (row["employee_order"], row["phase"]),
        )

        schedule_end = generation_rows[-1]["end_date"] if generation_rows else start_date.isoformat()
        relevant_holidays = [
            {
                "date": holiday_date.isoformat(),
                "holiday_name": holiday_data.get("holiday_name") or "",
                "holiday_day": holiday_data.get("holiday_day") or "",
            }
            for holiday_date, holiday_data in holiday_lookup.items()
            if holiday_date.isoformat() <= schedule_end
        ]

        return Response(
            {
                "rows": display_rows,
                "generation_rows": generation_rows,
                "skipped_dates": skipped_dates,
                "employees": [_serialize_employee(emp) for emp in employees],
                "holidays": relevant_holidays,
                "metadata": {
                    "start_date": start_date.isoformat(),
                    "days_per_phase": days_per_phase,
                    "phase_count": phase_count,
                    "employee_count": len(employees),
                    "schedule_end_date": schedule_end,
                },
            }
        )