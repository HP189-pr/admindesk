# backend/api/views_auth.py
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
from django.contrib.auth import get_user_model, password_validation
from django.contrib.auth.hashers import check_password
from django.core.exceptions import ObjectDoesNotExist, ValidationError
from django.core.cache import cache
from django.shortcuts import get_object_or_404
from django.utils import timezone
from django.db import connection, DatabaseError

from rest_framework import status, generics, viewsets, serializers
from rest_framework.decorators import action  # (retained if future expansions need it)
from rest_framework.permissions import IsAuthenticated, AllowAny
from rest_framework.response import Response
from rest_framework.views import APIView
from rest_framework.parsers import MultiPartParser, FormParser
from rest_framework_simplejwt.tokens import RefreshToken
from rest_framework_simplejwt.views import TokenObtainPairView

from .models import (
    Holiday,
    UserProfile,
    UserPermission,
    Module,
    Menu,
    User,
    EmpProfile,
    DashboardPreference,
)
from .serializers import (
    HolidaySerializer,
    UserSerializer,
    ChangePasswordSerializer,
    UserProfileSerializer,
    VerifyPasswordSerializer,
    CustomTokenObtainPairSerializer,
    DashboardPreferenceSerializer,
)

logger = logging.getLogger(__name__)
User = get_user_model()


def _parse_shotchat_flag(value):
    if value is None:
        return None
    if isinstance(value, bool):
        return value
    text = str(value).strip().lower()
    if text in {"1", "true", "yes", "y", "on", "enable", "enabled"}:
        return True
    if text in {"0", "false", "no", "n", "off", "disable", "disabled"}:
        return False
    return None


def _to_shotchat_db_value(value):
    parsed = _parse_shotchat_flag(value)
    if parsed is None:
        return None
    return "Yes" if parsed else "No"


def _enrich_user_with_extra_fields(request, user_payload):
    user_data = dict(user_payload)
    user_id = user_data.get('id')
    username = str(user_data.get('username') or '').strip().lower()

    picture = None
    try:
        profile = UserProfile.objects.filter(user_id=user_id).only('profile_picture').first()
        if profile and profile.profile_picture:
            try:
                picture = profile.profile_picture.url
            except Exception:
                picture = f"{settings.MEDIA_URL}{profile.profile_picture}"
    except Exception:
        picture = None

    user_data['profile_picture'] = picture
    user_data['profile_picture_url'] = picture
    user_data['usrpic'] = picture

    usr_birth_date = None
    usercode = None
    shotchat_raw = None
    try:
        with connection.cursor() as cur:
            try:
                cur.execute("SELECT usr_birth_date, usercode, shotchat FROM auth_user WHERE id=%s", [user_id])
                row = cur.fetchone()
                if row:
                    usr_birth_date, usercode, shotchat_raw = row[0], row[1], row[2]
            except DatabaseError:
                logger.debug("Falling back to auth_user extra field query without shotchat column for user_id=%s", user_id, exc_info=True)
                cur.execute("SELECT usr_birth_date, usercode FROM auth_user WHERE id=%s", [user_id])
                row = cur.fetchone()
                if row:
                    usr_birth_date, usercode = row[0], row[1]
    except DatabaseError:
        logger.warning("Failed to fetch auth_user extra fields for user_id=%s", user_id, exc_info=True)

    emp_shotchat = None
    emp_usercode = None
    if username or usercode:
        try:
            emp_qs = EmpProfile.objects.all()
            if username:
                emp_qs = emp_qs.filter(username__iexact=username)
            elif usercode:
                emp_qs = emp_qs.filter(usercode=usercode)
            emp = emp_qs.only('shotchat', 'usercode').first()
            if emp:
                emp_shotchat = emp.shotchat
                emp_usercode = emp.usercode
        except DatabaseError:
            logger.warning("Failed to fetch EmpProfile extras for user_id=%s", user_id, exc_info=True)
            emp_shotchat = None
            emp_usercode = None

    if (not usercode) and emp_usercode:
        usercode = emp_usercode

    shotchat_value = _parse_shotchat_flag(shotchat_raw)
    if shotchat_value is None:
        shotchat_value = _parse_shotchat_flag(emp_shotchat)
    if shotchat_value is None:
        shotchat_value = False

    user_data['usr_birth_date'] = usr_birth_date.isoformat() if usr_birth_date else None
    user_data['usercode'] = usercode
    user_data['shotchat'] = bool(shotchat_value)
    user_data['chat_enabled'] = bool(shotchat_value)
    return user_data


def _persist_extra_user_fields(user_id, username, request_data):
    birth_date = request_data.get('usr_birth_date', None)
    usercode = request_data.get('usercode', None)
    has_shotchat = ('shotchat' in request_data) or ('chat_enabled' in request_data)
    shotchat_input = request_data.get('shotchat', request_data.get('chat_enabled', None))
    shotchat_db = _to_shotchat_db_value(shotchat_input) if has_shotchat else None

    try:
        with connection.cursor() as cur:
            if birth_date is not None:
                if birth_date:
                    cur.execute("UPDATE auth_user SET usr_birth_date = %s WHERE id = %s", [birth_date, user_id])
                else:
                    cur.execute("UPDATE auth_user SET usr_birth_date = NULL WHERE id = %s", [user_id])
            if usercode is not None:
                cur.execute("UPDATE auth_user SET usercode = %s WHERE id = %s", [usercode or None, user_id])
            if has_shotchat:
                try:
                    cur.execute("UPDATE auth_user SET shotchat = %s WHERE id = %s", [1 if shotchat_db == 'Yes' else 0, user_id])
                except DatabaseError:
                    logger.debug("Unable to persist auth_user shotchat flag for user_id=%s", user_id, exc_info=True)
    except DatabaseError:
        logger.warning("Failed to persist auth_user extra fields for user_id=%s", user_id, exc_info=True)

    if has_shotchat or usercode is not None:
        try:
            emp_updates = {}
            if has_shotchat:
                emp_updates['shotchat'] = shotchat_db
            if usercode is not None:
                emp_updates['usercode'] = usercode or None

            if emp_updates:
                updated = 0
                if username:
                    updated = EmpProfile.objects.filter(username__iexact=username).update(**emp_updates)
                if not updated and usercode:
                    EmpProfile.objects.filter(usercode=usercode).update(**emp_updates)
        except DatabaseError:
            logger.warning("Failed to sync EmpProfile extra fields for user_id=%s", user_id, exc_info=True)


class HolidayViewSet(viewsets.ModelViewSet):
    """Return holidays within the next 6 months."""

    serializer_class = HolidaySerializer
    queryset = Holiday.objects.all()
    permission_classes = [AllowAny]

    def get_queryset(self):
        # Allow requesting all holidays or by year via query params
        q = self.request.query_params
        if q.get('all') in ('1', 'true', 'True'):
            return self.queryset.order_by('holiday_date')
        year = q.get('year')
        if year:
            try:
                y = int(year)
                return self.queryset.filter(holiday_date__year=y).order_by('holiday_date')
            except (TypeError, ValueError):
                logger.debug("Ignoring invalid holiday year filter: %r", year)
        # Default behaviour: holidays within the next 6 months
        today = datetime.date.today()
        six_months_later = today + datetime.timedelta(days=180)
        return (
            self.queryset.filter(holiday_date__gte=today, holiday_date__lte=six_months_later)
            .order_by("holiday_date")
        )


class LoginSerializer(serializers.Serializer):
    username = serializers.CharField()
    password = serializers.CharField(write_only=True)

    def validate(self, data):
        identifier = data.get("username", "").strip()
        password = data.get("password", "")

        if not identifier or not password:
            raise serializers.ValidationError({"detail": "Both username (or usercode) and password are required."})

        UserModel = get_user_model()
        # 1. Try normal username lookup (case-insensitive)
        user = UserModel.objects.filter(username__iexact=identifier).first()
        usercode = None

        # 2. Try raw SQL on usercode column (ignore errors if column missing)
        if not user:
            try:
                with connection.cursor() as cur:
                    cur.execute("SELECT id, usercode FROM auth_user WHERE LOWER(usercode)=LOWER(%s) LIMIT 1", [identifier])
                    row = cur.fetchone()
                    if row:
                        uid, uc = row
                        user = UserModel.objects.filter(pk=uid).first()
                        usercode = uc
            except DatabaseError:
                logger.debug("Fallback auth_user usercode lookup failed during login", exc_info=True)

        if not user or not check_password(password, user.password):
            raise serializers.ValidationError({"detail": "Invalid credentials."})

        if not user.is_active:
            raise serializers.ValidationError({"detail": "User account is disabled."})

        # Fetch usercode if available (if we found user by username)
        if user and not usercode:
            try:
                with connection.cursor() as cur:
                    cur.execute("SELECT usercode FROM auth_user WHERE id=%s", [user.id])
                    r = cur.fetchone()
                    if r:
                        usercode = r[0]
            except DatabaseError:
                logger.debug("Failed to fetch usercode for authenticated user id=%s", user.id, exc_info=True)

        data['user'] = user
        data['usercode'] = usercode
        return data


class LoginView(APIView):
    """Login using either username OR a custom raw DB column `usercode`.

    Request body accepted keys:
      - username (string)  -> existing behaviour (still required name used by frontend)
      - password (string)

    If the supplied identifier does not match a username, we attempt a fallback raw SQL
    lookup on `auth_user.usercode` (non-standard column you said you added). This avoids
    needing a custom user model migration while still enabling login by usercode.

    NOTE: Because the default Django User model is still in use, the ORM does not know
    about the extra column. We therefore access it via parameterised raw SQL.
    """
    permission_classes = [AllowAny]
    serializer_class = LoginSerializer

    def post(self, request):  # noqa: C901 (complexity acceptable for clarity)
        serializer = self.serializer_class(data=request.data)
        if not serializer.is_valid():
            return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)

        try:
            user = serializer.validated_data['user']
            usercode_val = serializer.validated_data['usercode']

            # Determine privilege flags
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
                        "usercode": usercode_val,  # may be None if column absent
                        "name": f"{user.first_name} {user.last_name}".strip(),
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
        except Exception as e:  # pragma: no cover
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
    # Accept multipart/form-data for profile picture uploads
    parser_classes = [MultiPartParser, FormParser]

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
            # Use current timestamp for a unique filename. datetime.time has no 'time' method —
            # use datetime.datetime.now().timestamp() instead.
            filename = f"{request.user.username}_{int(datetime.datetime.now().timestamp())}.{extension}"
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
                if settings.DEBUG:
                    cache_key = f"{self.CACHE_KEY_PREFIX}{request.user.id}"
                    cache.set(cache_key, timezone.now().isoformat(), timeout=self.SESSION_TTL_MINUTES * 60)
                    return Response({"message": "Admin panel password disabled in development; access granted."}, status=200)
                logger.warning("Admin panel verification denied because ADMIN_PANEL_SECRET is not configured.")
                return Response({"detail": "Admin panel password is not configured."}, status=503)
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
                if settings.DEBUG:
                    return Response({"verified": True, "disabled": True}, status=200)
                logger.warning("Admin panel verification status requested while ADMIN_PANEL_SECRET is not configured.")
                return Response({"verified": False, "detail": "Admin panel password is not configured."}, status=503)
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
            return Response({"is_admin": is_admin}, status=200)
        except Exception as e:  # pragma: no cover
            return Response({"error": "Internal Server Error", "details": str(e)}, status=500)


class DashboardPreferenceView(APIView):
    """Get or update the current user's dashboard module selection.

    - GET: returns {"selected_modules": ["verification", ...]}
    - PUT/PATCH: accepts same payload and persists it for this user.
    """

    permission_classes = [IsAuthenticated]

    def get_object(self, user):
        pref, _ = DashboardPreference.objects.get_or_create(user=user)
        return pref

    def get(self, request):
        try:
            pref = self.get_object(request.user)
            serializer = DashboardPreferenceSerializer(pref)
            return Response(serializer.data, status=200)
        except Exception as e:  # pragma: no cover
            logger.exception("DashboardPreferenceView.get failed")
            return Response({"error": "Internal Server Error", "details": str(e)}, status=500)

    def put(self, request):
        return self._update(request)

    def patch(self, request):
        return self._update(request)

    def _update(self, request):
        try:
            pref = self.get_object(request.user)
            data = request.data or {}
            selected = data.get("selected_modules", [])
            if not isinstance(selected, list):
                return Response({"selected_modules": ["Must be a list of module keys."]}, status=400)
            # Normalise to a de-duplicated list of strings
            normalised = []
            for k in selected:
                s = str(k).strip()
                if s and s not in normalised:
                    normalised.append(s)
            pref.selected_modules = normalised
            pref.save()
            serializer = DashboardPreferenceSerializer(pref)
            return Response(serializer.data, status=200)
        except Exception as e:  # pragma: no cover
            logger.exception("DashboardPreferenceView.update failed")
            return Response({"error": "Internal Server Error", "details": str(e)}, status=500)


class MyNavigationView(APIView):
    """Return modules, menus and rights for the current user."""

    permission_classes = [IsAuthenticated]

    def get(self, request):
        user = request.user
        is_admin_like = getattr(user, "is_staff", False) or getattr(user, "is_superuser", False)
        # Fetch all permissions for this user in one query — avoids N+1 inside the loop
        if not is_admin_like:
            perm_map = {
                (p.module_id, p.menu_id): p
                for p in UserPermission.objects.filter(user=user)
            }
        else:
            perm_map = {}
        modules = []
        for mod in Module.objects.all().order_by("name"):
            menus_payload = []
            for mn in Menu.objects.filter(module=mod).order_by("name"):
                rights = {"can_view": False, "can_create": False, "can_edit": False, "can_delete": False}
                if is_admin_like:
                    rights = {k: True for k in rights}
                else:
                    perm = perm_map.get((mod.pk, mn.pk))
                    if perm:
                        rights = {
                            "can_view": bool(perm.can_view),
                            "can_create": bool(perm.can_create),
                            "can_edit": bool(perm.can_edit),
                            "can_delete": bool(perm.can_delete),
                        }
                    else:
                        mod_perm = perm_map.get((mod.pk, None))
                        if mod_perm:
                            rights = {
                                "can_view": bool(mod_perm.can_view),
                                "can_create": bool(mod_perm.can_create),
                                "can_edit": bool(mod_perm.can_edit),
                                "can_delete": bool(mod_perm.can_delete),
                            }
                menus_payload.append({
                    "id": getattr(mn, 'menuid', None) or mn.pk,
                    "name": mn.name,
                    "rights": rights,
                })
            modules.append({
                "id": getattr(mod, 'moduleid', None) or mod.pk,
                "name": mod.name,
                "menus": menus_payload,
            })
        return Response({"modules": modules})


class UserAPIView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request):
        users = User.objects.all()
        serializer = UserSerializer(users, many=True)
        out = []
        for u in serializer.data:
            out.append(_enrich_user_with_extra_fields(request, u))
        return Response(out, status=200)

    def post(self, request):
        payload = dict(request.data)
        payload.pop('usr_birth_date', None)
        payload.pop('usercode', None)
        payload.pop('shotchat', None)
        payload.pop('chat_enabled', None)
        serializer = UserSerializer(data=payload)
        if serializer.is_valid():
            serializer.save()
            created_id = serializer.data.get('id')
            username = serializer.data.get('username')
            _persist_extra_user_fields(created_id, username, request.data)

            b = request.data.get('usr_birth_date')

            # If user has no usable password, set default password based on birthdate (ddmmyy)
            try:
                from django.contrib.auth import get_user_model
                from datetime import date
                UserModel = get_user_model()
                user_obj = UserModel.objects.filter(id=created_id).first()
                if user_obj:
                    needs = False
                    try:
                        needs = (not user_obj.has_usable_password()) or (not user_obj.password)
                    except AttributeError:
                        needs = not bool(user_obj.password)
                    if needs:
                        # prefer provided usr_birth_date, otherwise try to read from auth_user via SQL
                        birth = None
                        if b:
                            try:
                                birth = date.fromisoformat(b)
                            except ValueError:
                                birth = None
                        else:
                            try:
                                from django.db import connection
                                with connection.cursor() as cur:
                                    cur.execute("SELECT usr_birth_date FROM auth_user WHERE id=%s", [user_obj.id])
                                    r = cur.fetchone()
                                    if r and r[0]:
                                        birth = r[0]
                            except DatabaseError:
                                logger.warning("Failed to fetch usr_birth_date for new user id=%s", user_obj.id, exc_info=True)
                                birth = None

                        if birth:
                                try:
                                    pw = birth.strftime('%d%m%y')
                                    user_obj.set_password(pw)
                                    user_obj.save()
                                    logger.debug("Set default password for user id=%s from birthdate", user_obj.id)
                                except Exception:
                                    logger.warning("Failed to set default password for user id=%s", user_obj.id)
            except Exception:
                logger.warning("Failed to derive default password for new user id=%s", created_id, exc_info=True)

            enriched = _enrich_user_with_extra_fields(request, serializer.data)
            return Response(enriched, status=201)
        return Response(serializer.errors, status=400)


class AdminChangePasswordView(APIView):
    """Allow admin/staff to set a user's password without needing the old password."""

    permission_classes = [IsAuthenticated]

    def post(self, request, user_id):
        # only staff/superuser may change other users' passwords
        if not (request.user.is_staff or request.user.is_superuser):
            return Response({"detail": "Not authorized."}, status=403)

        new_password = (request.data or {}).get('new_password')
        if not new_password:
            return Response({"new_password": ["New password is required."]}, status=400)

        UserModel = get_user_model()
        try:
            u = UserModel.objects.get(id=user_id)
        except UserModel.DoesNotExist:
            return Response({"detail": "User not found."}, status=404)

        try:
            password_validation.validate_password(new_password, user=u)
        except ValidationError as exc:
            return Response({"new_password": list(exc.messages)}, status=400)

        u.set_password(new_password)
        u.save()
        return Response({"message": "Password changed successfully."}, status=200)


class UserDetailAPIView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request, user_id):
        user = get_object_or_404(User, id=user_id)
        serializer = UserSerializer(user)
        enriched = _enrich_user_with_extra_fields(request, serializer.data)
        return Response(enriched, status=200)

    def put(self, request, user_id):
        user = get_object_or_404(User, id=user_id)
        payload = dict(request.data)
        payload.pop('usr_birth_date', None)
        payload.pop('usercode', None)
        payload.pop('shotchat', None)
        payload.pop('chat_enabled', None)
        serializer = UserSerializer(user, data=payload, partial=True)
        if serializer.is_valid():
            serializer.save()
            updated_username = serializer.data.get('username') or user.username
            _persist_extra_user_fields(user_id, updated_username, request.data)
            enriched = _enrich_user_with_extra_fields(request, serializer.data)
            return Response(enriched, status=200)
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
