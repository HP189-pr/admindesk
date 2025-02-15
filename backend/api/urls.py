from django.urls import path, include
from rest_framework.routers import DefaultRouter
from .views import HolidayViewSet  # Import your ViewSet
from .views import LoginView


router = DefaultRouter()
router.register(r'holidays', HolidayViewSet, basename="holiday")

urlpatterns = [
    path("", include(router.urls)),
    path('login/', LoginView.as_view(), name='login'),  # This will list all API endpoints at "/"
]
