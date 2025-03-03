from django.urls import path, include
from rest_framework.routers import DefaultRouter
from .views import HolidayViewSet, LoginView, ChangePasswordView, UserProfileView,VerifyPasswordView  # Import views
from rest_framework_simplejwt.views import TokenObtainPairView,TokenRefreshView

# Create the router and register the HolidayViewSet
router = DefaultRouter()
router.register(r'holidays', HolidayViewSet)  # Automatically generates routes for the viewset

urlpatterns = [
    path('', include(router.urls)),  # Includes all the routes generated by the viewset
    path('backlogin/', TokenObtainPairView.as_view(), name='backlogin'),
    path('userlogin/', LoginView.as_view(), name='userlogin'),  # Ensure this matches the frontend URL
    path('change-password/<str:userid>/', ChangePasswordView.as_view(), name='change-password'),  # New route for change password
    path('profile/', UserProfileView.as_view(), name="user-profile"),
    path('verify-password/', VerifyPasswordView.as_view(), name='verify-password'),
    path('token/refresh/', TokenRefreshView.as_view(), name='token_refresh'),
]