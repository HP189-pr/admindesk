from django.urls import path, include
from rest_framework.routers import DefaultRouter
from .views import (
    HolidayViewSet,
    ModuleViewSet,
    MenuViewSet,
    UserPermissionViewSet,
    LoginView,
    ChangePasswordView,
    UserProfileView,
    VerifyPasswordView,
    CustomTokenObtainPairView,
    ProfilePictureView,
    CheckAdminAccessView,
    UserAPIView,
    UserDetailAPIView
)
from rest_framework_simplejwt.views import TokenRefreshView

# Create router and register viewsets
router = DefaultRouter()
router.register(r'holidays', HolidayViewSet, basename='holidays')
router.register(r'modules', ModuleViewSet, basename='modules')  # ✅ Modules API
router.register(r'menus', MenuViewSet, basename='menus')  # ✅ Menus API
router.register(r'userpermissions', UserPermissionViewSet, basename='userpermissions')  # ✅ User Permissions API

urlpatterns = [
    # Include all registered routes automatically
    path('', include(router.urls)),

    # JWT Token routes (custom and standard)
    path('backlogin/', CustomTokenObtainPairView.as_view(), name='backlogin'),
    path('api/token/', CustomTokenObtainPairView.as_view(), name='token_obtain_pair'),
    path('api/token/refresh/', TokenRefreshView.as_view(), name='token_refresh'),

    # Custom login route
    path('userlogin/', LoginView.as_view(), name='userlogin'),
    path("check-admin-access/", CheckAdminAccessView.as_view(), name="check_admin_access"),

    # Change password
    path('change-password/', ChangePasswordView.as_view(), name='change-password'),

    # User profile management
    path('profile/', UserProfileView.as_view(), name="user-profile"),
    path('verify-password/', VerifyPasswordView.as_view(), name='verify-password'),
    path('profile-picture/', ProfilePictureView.as_view(), name='profile-picture'),

    # User API endpoints
    path("users/", UserAPIView.as_view(), name="user-list-create"),
    path("users/<int:user_id>/", UserDetailAPIView.as_view(), name="user-detail"),
]
