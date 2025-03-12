from django.urls import path, include
from rest_framework.routers import DefaultRouter
from .views import (
    HolidayViewSet,
    LoginView,
    ChangePasswordView,
    UserProfileView,
    VerifyPasswordView,
    CustomTokenObtainPairView,
    ProfilePictureView,
    CheckAdminAccessView,UserAPIView,UserDetailAPIView
)
from rest_framework_simplejwt.views import TokenRefreshView

# Create router for holiday endpoints
router = DefaultRouter()
router.register(r'holidays', HolidayViewSet, basename='holidays')

urlpatterns = [
    # Include all the holiday routes automatically
    path('', include(router.urls)),

    # JWT Token routes (custom and standard)
    path('backlogin/', CustomTokenObtainPairView.as_view(), name='backlogin'),  # Use CustomTokenObtainPairView
    path('api/token/', CustomTokenObtainPairView.as_view(), name='token_obtain_pair'),  # Optional: alias for clarity
    path('api/token/refresh/', TokenRefreshView.as_view(), name='token_refresh'),

    # Custom login route (your manual login logic with access/refresh tokens and user details)
    path('userlogin/', LoginView.as_view(), name='userlogin'),
    path("check-admin-access/", CheckAdminAccessView.as_view(), name="check_admin_access"),

    # Change password - does not need <userid> if you're using IsAuthenticated (since user info comes from JWT)
    path('change-password/', ChangePasswordView.as_view(), name='change-password'),

    # User profile (get/update)
    path('profile/', UserProfileView.as_view(), name="user-profile"),

    # Verify password for logged-in users
    path('verify-password/', VerifyPasswordView.as_view(), name='verify-password'),
    path('profile-picture/', ProfilePictureView.as_view(), name='profile-picture'),
    path("users/", UserAPIView.as_view(), name="user-list-create"),
    path("users/<int:user_id>/", UserDetailAPIView.as_view(), name="user-detail"),
]
