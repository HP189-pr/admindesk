from django.urls import path

from .views import leave_calendar_report

urlpatterns = [
    path("leave-calendar/", leave_calendar_report, name="leave-calendar-report"),
]
