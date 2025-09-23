from django.urls import path, include
from django.http import HttpResponse

# Try to import DRF and API views; if unavailable, provide a friendly fallback.
try:
    from rest_framework.routers import DefaultRouter
    from rest_framework_simplejwt.views import TokenObtainPairView, TokenRefreshView, TokenVerifyView
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
        UserDetailAPIView,
    )

    # Register router and API endpoints (normal path when DRF is installed)
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
        path('token/', CustomTokenObtainPairView.as_view(), name='token_obtain_pair'),
        path('token/refresh/', TokenRefreshView.as_view(), name='token_refresh'),
        path('token/verify/', TokenVerifyView.as_view(), name='token_verify'),

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
        path("modules/<int:module_id>/menus/", MenuViewSet.as_view({"get": "menus_by_module"}), name="menus-by-module"),
    ]

except Exception as e:
    # Fallback: DRF (or simplejwt) not installed or import failed.
    # Provide a simple endpoint so Django can start and admin works.
    def api_unavailable(request, *args, **kwargs):
        msg = (
            "API unavailable: required packages missing (djangorestframework / simplejwt).\n"
            "Install with: pip install djangorestframework djangorestframework-simplejwt\n"
            f"Server import error: {e}"
        )
        return HttpResponse(msg, status=503, content_type="text/plain")

    urlpatterns = [
        path('', api_unavailable),
    ]
