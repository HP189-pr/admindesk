"""Auth, profile, navigation, and user management related API views.

Extracted from the former monolithic `views.py` as part of Phase 2 modularization.
Scope in this module:
  - HolidayViewSet (light reference data)
  - Authentication / token issuing (LoginView, CustomTokenObtainPairView)
  - Password management (ChangePasswordView, VerifyPasswordView, VerifyAdminPanelPasswordView)
  - Profile (UserProfileView, ProfilePictureView)
  - Admin access check (CheckAdminAccessView)
  - Navigation / permission aggregation (MyNavigationView)
  - Basic user CRUD (UserAPIView, UserDetailAPIView)

Other functional domains (courses, enrollment, documents, verification, bulk upload, etc.) remain
in `views.py` temporarily and will be extracted in subsequent steps (courses.py, enrollment.py, etc.).

Backward Compatibility: `views.py` imports and re-exports these classes so existing imports
(`from api import views`) continue working without change to routing.
"""

from __future__ import annotations

import datetime
import hmac
import logging
import os
import traceback

from django.conf import settings
from django.contrib.auth import get_user_model
from django.contrib.auth.hashers import check_password
from django.core.exceptions import ObjectDoesNotExist
from django.core.cache import cache
from django.shortcuts import get_object_or_404
from django.utils import timezone

from rest_framework import status, generics, viewsets
from rest_framework.decorators import action  # (retained if future expansions need it)
from rest_framework.permissions import IsAuthenticated, AllowAny
from rest_framework.response import Response
from rest_framework.views import APIView
from rest_framework_simplejwt.tokens import RefreshToken
from rest_framework_simplejwt.views import TokenObtainPairView

from .models import (
    Holiday,
    UserProfile,
    UserPermission,
    Module,
    Menu,
    User,
)
from .serializers import (
    HolidaySerializer,
    LoginSerializer,  # kept for potential future use (original file imported it)
    UserSerializer,
    ChangePasswordSerializer,
    UserProfileSerializer,
    VerifyPasswordSerializer,
    CustomTokenObtainPairSerializer,
)

logger = logging.getLogger(__name__)
User = get_user_model()


class HolidayViewSet(viewsets.ModelViewSet):
    """Return holidays within the next 6 months."""

    serializer_class = HolidaySerializer
    queryset = Holiday.objects.all()
    permission_classes = [AllowAny]

    def get_queryset(self):
        today = datetime.date.today()
        six_months_later = today + datetime.timedelta(days=180)
        return (
            self.queryset.filter(holiday_date__gte=today, holiday_date__lte=six_months_later)
            .order_by("holiday_date")
        )


class LoginView(APIView):
    permission_classes = [AllowAny]

    def post(self, request):
        try:
            username = request.data.get("username")
            password = request.data.get("password")

            if not username or not password:
                return Response(
                    {"detail": "Both username and password are required."},
                    status=status.HTTP_400_BAD_REQUEST,
                )

            user = get_user_model().objects.filter(username__iexact=username.strip()).first()
            if not user or not check_password(password, user.password):
                return Response({"detail": "Invalid credentials."}, status=status.HTTP_400_BAD_REQUEST)

            is_admin = (
                getattr(user, "is_staff", False)
                or getattr(user, "is_superuser", False)
                or user.groups.filter(name__iexact="Admin").exists()
            )
            is_super = user.groups.filter(name__iexact="Super").exists() or getattr(user, "is_superuser", False)
            is_restricted = user.groups.filter(name__iexact="Restricted").exists()

            refresh = RefreshToken.for_user(user)

            return Response(
                {
                    "access": str(refresh.access_token),
                    "refresh": str(refresh),
                    "user": {
                        "id": user.id,
                        "username": user.username,
                        "name": f"{user.first_name} {user.last_name}",
                        "usertype": user.groups.first().name if user.groups.exists() else "No Group",
                        "is_admin": is_admin,
                        "is_super": is_super,
                        "is_restricted": is_restricted,
                    },
                },
                status=status.HTTP_200_OK,
            )
        except get_user_model().DoesNotExist:
            return Response({"detail": "Invalid credentials."}, status=status.HTTP_400_BAD_REQUEST)
        except Exception as e:  # pragma: no cover - defensive
            logger.exception("Login failure")
            return Response(
                {"error": "Internal Server Error", "details": str(e)},
                status=status.HTTP_500_INTERNAL_SERVER_ERROR,
            )


class ChangePasswordView(APIView):
    """Allow authenticated users to change their password."""

    permission_classes = [IsAuthenticated]

    def post(self, request):
        serializer = ChangePasswordSerializer(data=request.data)
        if serializer.is_valid():
            serializer.save()
            return Response({"message": "Password updated successfully."}, status=status.HTTP_200_OK)
        return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)


class UserProfileView(generics.RetrieveUpdateAPIView):
    serializer_class = UserProfileSerializer
    permission_classes = [IsAuthenticated]
    parser_classes = []  # parser_classes provided in original; will inherit DRF defaults unless needed.

    def get_object(self):
        profile, _ = UserProfile.objects.get_or_create(user=self.request.user)
        return profile

    def get_serializer_context(self):
        context = super().get_serializer_context()
        context.update({"request": self.request})
        return context

    def update(self, request, *args, **kwargs):
        profile = self.get_object()
        profile_picture_file = request.FILES.get("profile_picture")
        if profile_picture_file:
            if profile.profile_picture:
                old_file_path = os.path.join(settings.MEDIA_ROOT, profile.profile_picture.name)
                try:
                    if os.path.exists(old_file_path):
                        os.remove(old_file_path)
                except Exception as e:  # pragma: no cover
                    logger.warning("Error deleting old profile picture: %s", e)

            extension = profile_picture_file.name.split('.')[-1]
            filename = f"{request.user.username}_{int(datetime.time.time())}.{extension}"
            file_path = os.path.join(settings.MEDIA_ROOT, "profile_pictures", filename)
            os.makedirs(os.path.dirname(file_path), exist_ok=True)
            with open(file_path, "wb+") as destination:
                for chunk in profile_picture_file.chunks():
                    destination.write(chunk)
            profile.profile_picture = f"profile_pictures/{filename}"
            profile.save()

        serializer = self.get_serializer(profile, data=request.data, partial=True)
        serializer.is_valid(raise_exception=True)
        self.perform_update(serializer)

        return Response(
            {
                "profile_picture": request.build_absolute_uri(profile.profile_picture.url)
                if profile.profile_picture
                else None,
                "message": "Profile updated successfully",
                "data": serializer.data,
            },
            status=status.HTTP_200_OK,
        )


class ProfilePictureView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request):
        profile, _ = UserProfile.objects.get_or_create(user=request.user)
        if profile.profile_picture:
            profile_picture_url = request.build_absolute_uri(f"/media/{profile.profile_picture}")
        else:
            profile_picture_url = None
        return Response({"profile_picture": profile_picture_url})


class VerifyPasswordView(APIView):
    """Verify the logged‑in user's current password."""

    permission_classes = [IsAuthenticated]

    def post(self, request):
        serializer = VerifyPasswordSerializer(data=request.data, context={'request': request})
        if serializer.is_valid():
            return Response({"message": "Password verified successfully."}, status=status.HTTP_200_OK)
        return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)


class VerifyAdminPanelPasswordView(APIView):
    """Verify a special admin panel password (separate from user password)."""

    permission_classes = [IsAuthenticated]
    CACHE_KEY_PREFIX = "admin_panel_verified_at:"
    SESSION_TTL_MINUTES = 30

    def post(self, request):
        try:
            provided = (request.data or {}).get("password", "")
            secret = getattr(settings, "ADMIN_PANEL_SECRET", None)
            if not secret:
                cache_key = f"{self.CACHE_KEY_PREFIX}{request.user.id}"
                cache.set(cache_key, timezone.now().isoformat(), timeout=self.SESSION_TTL_MINUTES * 60)
                return Response({"message": "Admin panel password disabled; access granted."}, status=200)
            ok = hmac.compare_digest(str(provided), str(secret))
            if not ok:
                return Response({"detail": "Invalid admin panel password."}, status=400)
            cache_key = f"{self.CACHE_KEY_PREFIX}{request.user.id}"
            cache.set(cache_key, timezone.now().isoformat(), timeout=self.SESSION_TTL_MINUTES * 60)
            return Response({"message": "Admin panel access granted."}, status=200)
        except Exception as e:  # pragma: no cover
            return Response({"error": "Internal Server Error", "details": str(e)}, status=500)

    def get(self, request):
        try:
            if not getattr(settings, "ADMIN_PANEL_SECRET", None):
                return Response({"verified": True, "disabled": True}, status=200)
            cache_key = f"{self.CACHE_KEY_PREFIX}{request.user.id}"
            ts = cache.get(cache_key)
            return Response({"verified": bool(ts)}, status=200)
        except Exception as e:  # pragma: no cover
            return Response({"error": "Internal Server Error", "details": str(e)}, status=500)


class CustomTokenObtainPairView(TokenObtainPairView):
    """Custom token obtain pair to support login with username."""

    serializer_class = CustomTokenObtainPairSerializer


class CheckAdminAccessView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request):
        try:
            user = request.user
            is_admin = (
                getattr(user, "is_staff", False)
                or getattr(user, "is_superuser", False)
                or user.groups.filter(name__iexact="Admin").exists()
            )
            return Response({"is_admin": is_admin}, status=200 if is_admin else 403)
        except Exception as e:  # pragma: no cover
            return Response({"error": "Internal Server Error", "details": str(e)}, status=500)


class MyNavigationView(APIView):
    """Return modules, menus and rights for the current user."""

    permission_classes = [IsAuthenticated]

    def get(self, request):
        user = request.user
        is_admin_like = getattr(user, "is_staff", False) or getattr(user, "is_superuser", False)
        modules = []
        for mod in Module.objects.all().order_by("name"):
            menus_payload = []
            for mn in Menu.objects.filter(module=mod).order_by("name"):
                rights = {"can_view": False, "can_create": False, "can_edit": False, "can_delete": False}
                if is_admin_like:
                    rights = {k: True for k in rights}
                else:
                    try:
                        perm = UserPermission.objects.filter(user=user, module=mod, menu=mn).first()
                        if perm:
                            rights = {
                                "can_view": bool(perm.can_view),
                                "can_create": bool(perm.can_create),
                                "can_edit": bool(perm.can_edit),
                                "can_delete": bool(perm.can_delete),
                            }
                        else:
                            mod_perm = (
                                UserPermission.objects.filter(user=user, module=mod, menu__isnull=True).first()
                            )
                            if mod_perm:
                                rights = {
                                    "can_view": bool(mod_perm.can_view),
                                    "can_create": bool(mod_perm.can_create),
                                    "can_edit": bool(mod_perm.can_edit),
                                    "can_delete": bool(mod_perm.can_delete),
                                }
                    except ObjectDoesNotExist:  # pragma: no cover
                        pass
                menus_payload.append({
                    "id": getattr(mn, 'menuid', mn.id),
                    "name": mn.name,
                    "rights": rights,
                })
            modules.append({
                "id": getattr(mod, 'moduleid', mod.id),
                "name": mod.name,
                "menus": menus_payload,
            })
        return Response({"modules": modules})


class UserAPIView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request):
        users = User.objects.all()
        serializer = UserSerializer(users, many=True)
        return Response(serializer.data, status=200)

    def post(self, request):
        serializer = UserSerializer(data=request.data)
        if serializer.is_valid():
            serializer.save()
            return Response(serializer.data, status=201)
        return Response(serializer.errors, status=400)


class UserDetailAPIView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request, user_id):
        user = get_object_or_404(User, id=user_id)
        serializer = UserSerializer(user)
        return Response(serializer.data, status=200)

    def put(self, request, user_id):
        user = get_object_or_404(User, id=user_id)
        serializer = UserSerializer(user, data=request.data, partial=True)
        if serializer.is_valid():
            serializer.save()
            return Response(serializer.data, status=200)
        return Response(serializer.errors, status=400)

    def delete(self, request, user_id):
        user = get_object_or_404(User, id=user_id)
        user.delete()
        return Response({"message": "User deleted successfully."}, status=204)


__all__ = [
    'HolidayViewSet', 'LoginView', 'ChangePasswordView', 'UserProfileView', 'ProfilePictureView',
    'VerifyPasswordView', 'VerifyAdminPanelPasswordView', 'CustomTokenObtainPairView',
    'CheckAdminAccessView', 'MyNavigationView', 'UserAPIView', 'UserDetailAPIView'
]
