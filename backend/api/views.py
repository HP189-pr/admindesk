from rest_framework_simplejwt.tokens import RefreshToken
import hmac
import traceback
from rest_framework.views import APIView
from rest_framework.decorators import action
from rest_framework.response import Response
from django.http import HttpResponse
from rest_framework import status, generics, viewsets
from rest_framework.permissions import IsAuthenticated, AllowAny
from rest_framework.parsers import MultiPartParser, FormParser
from django.contrib.auth.hashers import check_password
from django.shortcuts import get_object_or_404
from rest_framework_simplejwt.views import TokenObtainPairView
import datetime
import os
from django.contrib.auth import get_user_model
from django.conf import settings
from django.utils import timezone
from io import BytesIO
import logging
from django.db import models
from django.db.models import Value
from django.db.models.functions import Lower, Replace
from django.db.models import Q
from django.core.exceptions import ObjectDoesNotExist

from .models import Holiday, UserProfile,User, Module, Menu, UserPermission, InstituteCourseOffering, Institute, MainBranch, SubBranch, Enrollment, DocRec, MigrationRecord, ProvisionalRecord, InstVerificationMain, InstVerificationStudent, Verification, Eca, StudentProfile, MigrationStatus, ProvisionalStatus, VerificationStatus, PayBy
from .serializers import (
    HolidaySerializer, LoginSerializer, UserSerializer,
    ChangePasswordSerializer, UserProfileSerializer,
    VerifyPasswordSerializer, CustomTokenObtainPairSerializer, ModuleSerializer, MenuSerializer, UserPermissionSerializer,
    InstituteCourseOfferingSerializer, InstituteSerializer, MainBranchSerializer, SubBranchSerializer, EnrollmentSerializer,
    DocRecSerializer, VerificationSerializer, MigrationRecordSerializer, ProvisionalRecordSerializer, InstVerificationMainSerializer, InstVerificationStudentSerializer, EcaSerializer, StudentProfileSerializer
    
)

logger = logging.getLogger(__name__)


User = get_user_model()
class HolidayViewSet(viewsets.ModelViewSet):
    """
    Returns holidays within the next 6 months.
    """
    serializer_class = HolidaySerializer
    queryset = Holiday.objects.all()
    permission_classes = [AllowAny]

    def get_queryset(self):
        today = datetime.date.today()
        six_months_later = today + datetime.timedelta(days=180)
        return self.queryset.filter(
            holiday_date__gte=today, holiday_date__lte=six_months_later
        ).order_by("holiday_date")


class LoginView(APIView):
    permission_classes = [AllowAny]

    def post(self, request):
        try:
            username = request.data.get("username")
            password = request.data.get("password")

            if not username or not password:
                return Response({"detail": "Both username and password are required."}, status=status.HTTP_400_BAD_REQUEST)

            # Get user
            user = get_user_model().objects.filter(username__iexact=username.strip()).first()
            if not user or not check_password(password, user.password):
                return Response({"detail": "Invalid credentials."}, status=status.HTTP_400_BAD_REQUEST)

            # Robust admin flags independent of specific group IDs
            is_admin = (
                getattr(user, "is_staff", False)
                or getattr(user, "is_superuser", False)
                or user.groups.filter(name__iexact="Admin").exists()
            )
            # Optional: other flags by name if you use them
            is_super = user.groups.filter(name__iexact="Super").exists() or getattr(user, "is_superuser", False)
            is_restricted = user.groups.filter(name__iexact="Restricted").exists()

            # Generate JWT tokens only once
            refresh = RefreshToken.for_user(user)

            return Response({
                "access": str(refresh.access_token),
                "refresh": str(refresh),
                "user": {
                    "id": user.id,
                    "username": user.username,
                    "name": f"{user.first_name} {user.last_name}",
                    "usertype": user.groups.first().name if user.groups.exists() else "No Group",
                    "is_admin": is_admin,  # Send admin status
                    "is_super": is_super,  # Super user flag
                    "is_restricted": is_restricted,
                }
            }, status=status.HTTP_200_OK)

        except get_user_model().DoesNotExist:
            return Response({"detail": "Invalid credentials."}, status=status.HTTP_400_BAD_REQUEST)

        except Exception as e:
            print(traceback.format_exc())
            return Response({"error": "Internal Server Error", "details": str(e)}, status=status.HTTP_500_INTERNAL_SERVER_ERROR)

class ChangePasswordView(APIView):
    """
    Allows authenticated users to change their password.
    """
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

        # Handle profile picture update
        profile_picture_file = request.FILES.get("profile_picture")
        if profile_picture_file:
            # Delete old picture if exists
            if profile.profile_picture:
                old_file_path = os.path.join(settings.MEDIA_ROOT, profile.profile_picture.name)
                try:
                    if os.path.exists(old_file_path):
                        os.remove(old_file_path)
                except Exception as e:
                    print(f"⚠️ Error deleting old profile picture: {e}")

            # Save new profile picture with timestamp
            extension = profile_picture_file.name.split('.')[-1]
            filename = f"{request.user.username}_{int(datetime.time.time())}.{extension}"
            file_path = os.path.join(settings.MEDIA_ROOT, "profile_pictures", filename)

            # Ensure directory exists
            os.makedirs(os.path.dirname(file_path), exist_ok=True)

            # Write new file
            with open(file_path, "wb+") as destination:
                for chunk in profile_picture_file.chunks():
                    destination.write(chunk)

            # Save relative path to profile
            profile.profile_picture = f"profile_pictures/{filename}"
            profile.save()

        # Continue with normal profile update
        serializer = self.get_serializer(profile, data=request.data, partial=True)
        serializer.is_valid(raise_exception=True)
        self.perform_update(serializer)

        return Response(
            {
                "profile_picture": request.build_absolute_uri(profile.profile_picture.url),
                "message": "Profile updated successfully",
                "data": serializer.data
            },
            status=status.HTTP_200_OK
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
    """
    Verify the logged-in user's current password.
    """
    permission_classes = [IsAuthenticated]

    def post(self, request):
        serializer = VerifyPasswordSerializer(data=request.data, context={'request': request})

        if serializer.is_valid():
            return Response({"message": "Password verified successfully."}, status=status.HTTP_200_OK)

        return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)


from django.core.cache import cache


class VerifyAdminPanelPasswordView(APIView):
    """
    Verify a special, backend-configured Admin Panel password (separate from user password).
    When correct, set a session flag that allows Admin Panel access without re-prompting for a short time.
    """
    permission_classes = [IsAuthenticated]

    # Allow a short-lived session window (minutes)
    CACHE_KEY_PREFIX = "admin_panel_verified_at:"
    SESSION_TTL_MINUTES = 30

    def post(self, request):
        try:
            provided = (request.data or {}).get("password", "")
            secret = getattr(settings, "ADMIN_PANEL_SECRET", None)
            if not secret:
                # Secret not configured -> feature disabled; grant access without prompt
                cache_key = f"{self.CACHE_KEY_PREFIX}{request.user.id}"
                cache.set(cache_key, timezone.now().isoformat(), timeout=self.SESSION_TTL_MINUTES * 60)
                return Response({"message": "Admin panel password disabled; access granted."}, status=status.HTTP_200_OK)

            # Use constant time comparison to mitigate timing attacks
            ok = hmac.compare_digest(str(provided), str(secret))
            if not ok:
                return Response({"detail": "Invalid admin panel password."}, status=status.HTTP_400_BAD_REQUEST)

            # Mark as verified in cache keyed by user id
            cache_key = f"{self.CACHE_KEY_PREFIX}{request.user.id}"
            cache.set(cache_key, timezone.now().isoformat(), timeout=self.SESSION_TTL_MINUTES * 60)
            return Response({"message": "Admin panel access granted."}, status=status.HTTP_200_OK)
        except Exception as e:
            return Response({"error": "Internal Server Error", "details": str(e)}, status=status.HTTP_500_INTERNAL_SERVER_ERROR)

    def get(self, request):
        """Check if admin panel password was verified recently for this user (server-side cache)."""
        try:
            # If secret not configured, consider verified (feature disabled)
            if not getattr(settings, "ADMIN_PANEL_SECRET", None):
                return Response({"verified": True, "disabled": True}, status=status.HTTP_200_OK)
            cache_key = f"{self.CACHE_KEY_PREFIX}{request.user.id}"
            ts = cache.get(cache_key)
            return Response({"verified": bool(ts)}, status=status.HTTP_200_OK)
        except Exception as e:
            return Response({"error": "Internal Server Error", "details": str(e)}, status=status.HTTP_500_INTERNAL_SERVER_ERROR)


class CustomTokenObtainPairView(TokenObtainPairView):
    """
    Custom token obtain pair to support login with `username` for default Django User model.
    """
    serializer_class = CustomTokenObtainPairSerializer

class CheckAdminAccessView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request):
        try:
            user = request.user
            # Consider staff/superuser or group named "Admin" as admin
            is_admin = (
                getattr(user, "is_staff", False)
                or getattr(user, "is_superuser", False)
                or user.groups.filter(name__iexact="Admin").exists()
            )

            return Response({"is_admin": is_admin}, status=status.HTTP_200_OK if is_admin else status.HTTP_403_FORBIDDEN)

        except Exception as e:
            return Response(
                {"error": "Internal Server Error", "details": str(e)},
                status=status.HTTP_500_INTERNAL_SERVER_ERROR
            )


class MyNavigationView(APIView):
    """Return modules, menus and rights for the current user.

    Shape:
    {
      "modules": [
        {"id": 1, "name": "Student Module", "menus": [
          {"id": 10, "name": "Enrollment", "rights": {"can_view": true, "can_create": false, "can_edit": false, "can_delete": false}}
        ]}
      ]
    }
    """
    permission_classes = [IsAuthenticated]

    def get(self, request):
        user = request.user
        # Shortcut: staff/superuser get full rights
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
                            # Optional: module-level perms where menu is NULL
                            mod_perm = UserPermission.objects.filter(user=user, module=mod, menu__isnull=True).first()
                            if mod_perm:
                                rights = {
                                    "can_view": bool(mod_perm.can_view),
                                    "can_create": bool(mod_perm.can_create),
                                    "can_edit": bool(mod_perm.can_edit),
                                    "can_delete": bool(mod_perm.can_delete),
                                }
                    except ObjectDoesNotExist:
                        pass

                menus_payload.append({
                    "id": mn.menuid if hasattr(mn, "menuid") else mn.id,
                    "name": mn.name,
                    "rights": rights,
                })

            modules.append({
                "id": mod.moduleid if hasattr(mod, "moduleid") else mod.id,
                "name": mod.name,
                "menus": menus_payload,
            })

        return Response({"modules": modules})


class UserAPIView(APIView):
    """
    API to list users and add new users.
    """
    permission_classes = [IsAuthenticated]

    def get(self, request):
        """
        Get a list of all users.
        """
        users = User.objects.all()
        serializer = UserSerializer(users, many=True)
        return Response(serializer.data, status=200)

    def post(self, request):
        """
        Create a new user.
        """
        serializer = UserSerializer(data=request.data)
        if serializer.is_valid():
            serializer.save()
            return Response(serializer.data, status=201)
        return Response(serializer.errors, status=400)

class UserDetailAPIView(APIView):
    """
    API to update and delete a user.
    """
    permission_classes = [IsAuthenticated]

    def get(self, request, user_id):
        """
        Get user details.
        """
        user = get_object_or_404(User, id=user_id)
        serializer = UserSerializer(user)
        return Response(serializer.data, status=200)

    def put(self, request, user_id):
        """
        Update user details.
        """
        user = get_object_or_404(User, id=user_id)
        serializer = UserSerializer(user, data=request.data, partial=True)
        if serializer.is_valid():
            serializer.save()
            return Response(serializer.data, status=200)
        return Response(serializer.errors, status=400)

    def delete(self, request, user_id):
        """
        Delete a user.
        """
        user = get_object_or_404(User, id=user_id)
        user.delete()
        return Response({"message": "User deleted successfully."}, status=204)        
    # ✅ Module API View
class ModuleViewSet(viewsets.ModelViewSet):
    queryset = Module.objects.all()
    serializer_class = ModuleSerializer

# ✅ Menu API View
class MenuViewSet(viewsets.ModelViewSet):
    queryset = Menu.objects.all()
    serializer_class = MenuSerializer

    @action(detail=False, methods=["get"], url_path="by-module/(?P<module_id>[^/.]+)")
    def menus_by_module(self, request, module_id=None):
        """
        Get menus filtered by a specific module_id
        """
        menus = self.queryset.filter(module_id=module_id)
        serializer = self.get_serializer(menus, many=True)
        return Response(serializer.data, status=status.HTTP_200_OK)

# ✅ User Permission API View
class UserPermissionViewSet(viewsets.ModelViewSet):
    queryset = UserPermission.objects.all()
    serializer_class = UserPermissionSerializer

# ✅ Main Branch (Main Course) ViewSet
class MainBranchViewSet(viewsets.ModelViewSet):
    queryset = MainBranch.objects.all()
    serializer_class = MainBranchSerializer

# ✅ Sub Branch (Sub Course) ViewSet
class SubBranchViewSet(viewsets.ModelViewSet):
    queryset = SubBranch.objects.all()
    serializer_class = SubBranchSerializer

    def get_queryset(self):
        """Optionally filter sub-branches by maincourse_id query param.

        Example: /api/subbranch/?maincourse_id=BCA
        """
        qs = super().get_queryset()
        mcid = self.request.query_params.get("maincourse_id")
        if mcid:
            return qs.filter(maincourse_id__iexact=str(mcid).strip())
        return qs

# ✅ Institute ViewSet
class InstituteViewSet(viewsets.ModelViewSet):
    queryset = Institute.objects.all()
    serializer_class = InstituteSerializer

# ✅ Institute Course Offering ViewSet
class InstituteCourseOfferingViewSet(viewsets.ModelViewSet):
    queryset = InstituteCourseOffering.objects.all().select_related("institute", "maincourse", "subcourse", "updated_by")
    serializer_class = InstituteCourseOfferingSerializer


# ---------- DocRec / Verification / Migration / Provisional / InstVerification Main ----------

class DocRecViewSet(viewsets.ModelViewSet):
    queryset = DocRec.objects.all().order_by('-id')
    serializer_class = DocRecSerializer
    permission_classes = [IsAuthenticated]

    @action(detail=False, methods=["get"], url_path="next-id")
    def next_id(self, request):
        """Return the next doc_rec_id that would be assigned for a given apply_for.
        Example: /api/docrec/next-id/?apply_for=VR
        """
        apply_for = (request.query_params.get('apply_for') or '').strip().upper()
        if not apply_for:
            return Response({"detail": "apply_for is required"}, status=400)
        try:
            tmp = DocRec(apply_for=apply_for, pay_by=PayBy.NA)
            # simulate generation logic using private helpers
            now = timezone.now()
            yy = now.year % 100
            prefix = tmp._prefix_for_apply()
            year_str = f"{yy:02d}"
            base = f"{prefix}_{year_str}_"
            last = (
                DocRec.objects
                .filter(doc_rec_id__startswith=base)
                .order_by("-doc_rec_id")
                .first()
            )
            next_num = 1
            if last and last.doc_rec_id:
                try:
                    next_num = int(last.doc_rec_id.split("_")[-1]) + 1
                except Exception:
                    next_num = 1
            return Response({"next_id": f"{base}{next_num:04d}"})
        except Exception as e:
            return Response({"detail": str(e)}, status=500)


class VerificationViewSet(viewsets.ModelViewSet):
    queryset = Verification.objects.select_related('enrollment', 'second_enrollment').order_by('-id')
    serializer_class = VerificationSerializer
    permission_classes = [IsAuthenticated]

    def get_queryset(self):
        qs = super().get_queryset()
        search = self.request.query_params.get('search', '').strip()
        if search:
            norm_q = ''.join(search.split()).lower()
            qs = qs.annotate(
                n_en=Replace(Lower(models.F('enrollment__enrollment_no')), Value(' '), Value('')),
                n_name=Replace(Lower(models.F('student_name')), Value(' '), Value('')),
                n_final=Replace(Lower(models.F('final_no')), Value(' '), Value('')),
            ).filter(
                Q(n_en__contains=norm_q) | Q(n_name__contains=norm_q) | Q(n_final__contains=norm_q)
            )
        return qs


class MigrationRecordViewSet(viewsets.ModelViewSet):
    queryset = MigrationRecord.objects.select_related('doc_rec', 'enrollment', 'institute').order_by('-id')
    serializer_class = MigrationRecordSerializer
    permission_classes = [IsAuthenticated]

    def get_queryset(self):
        qs = super().get_queryset()
        search = self.request.query_params.get('search', '').strip()
        if search:
            norm_q = ''.join(search.split()).lower()
            qs = qs.annotate(
                n_en=Replace(Lower(models.F('enrollment__enrollment_no')), Value(' '), Value('')),
                n_name=Replace(Lower(models.F('student_name')), Value(' '), Value('')),
                n_mg=Replace(Lower(models.F('mg_number')), Value(' '), Value('')),
            ).filter(Q(n_en__contains=norm_q) | Q(n_name__contains=norm_q) | Q(n_mg__contains=norm_q))
        return qs


class ProvisionalRecordViewSet(viewsets.ModelViewSet):
    queryset = ProvisionalRecord.objects.select_related('doc_rec', 'enrollment', 'institute').order_by('-id')
    serializer_class = ProvisionalRecordSerializer
    permission_classes = [IsAuthenticated]

    def get_queryset(self):
        qs = super().get_queryset()
        search = self.request.query_params.get('search', '').strip()
        if search:
            norm_q = ''.join(search.split()).lower()
            qs = qs.annotate(
                n_en=Replace(Lower(models.F('enrollment__enrollment_no')), Value(' '), Value('')),
                n_name=Replace(Lower(models.F('student_name')), Value(' '), Value('')),
                n_prv=Replace(Lower(models.F('prv_number')), Value(' '), Value('')),
            ).filter(Q(n_en__contains=norm_q) | Q(n_name__contains=norm_q) | Q(n_prv__contains=norm_q))
        return qs


class InstVerificationMainViewSet(viewsets.ModelViewSet):
    queryset = InstVerificationMain.objects.select_related('doc_rec', 'institute').order_by('-id')
    serializer_class = InstVerificationMainSerializer
    permission_classes = [IsAuthenticated]

    def get_queryset(self):
        qs = super().get_queryset()
        search = self.request.query_params.get('search', '').strip()
        if search:
            norm_q = ''.join(search.split()).lower()
            qs = qs.annotate(
                n_instno=Replace(Lower(models.F('inst_veri_number')), Value(' '), Value('')),
                n_recname=Replace(Lower(models.F('rec_inst_name')), Value(' '), Value('')),
                n_ref=Replace(Lower(models.F('inst_ref_no')), Value(' '), Value('')),
            ).filter(Q(n_instno__contains=norm_q) | Q(n_recname__contains=norm_q) | Q(n_ref__contains=norm_q))
        return qs

    @action(detail=False, methods=["get"], url_path="search-rec-inst")
    def search_rec_inst(self, request):
        """Autocomplete for rec_inst_name by prefix (min 3 chars)."""
        q = request.query_params.get('q', '').strip()
        if len(q) < 3:
            return Response([], status=200)
        qs = self.queryset.filter(rec_inst_name__icontains=q)[:20]
        return Response([{ 'id': x.id, 'name': x.rec_inst_name } for x in qs], status=200)

    def perform_create(self, serializer):
        serializer.save()

    def perform_update(self, serializer):
        serializer.save()


class EcaViewSet(viewsets.ModelViewSet):
    queryset = Eca.objects.select_related('doc_rec').order_by('-id')
    serializer_class = EcaSerializer
    permission_classes = [IsAuthenticated]


class InstVerificationStudentViewSet(viewsets.ModelViewSet):
    queryset = InstVerificationStudent.objects.select_related('doc_rec', 'enrollment', 'institute', 'sub_course', 'main_course').order_by('-id')
    serializer_class = InstVerificationStudentSerializer
    permission_classes = [IsAuthenticated]
# ✅ Institute ViewSet

# ✅ Enrollment ViewSet
class EnrollmentViewSet(viewsets.ModelViewSet):
    queryset = Enrollment.objects.all().select_related("institute", "subcourse", "maincourse", "updated_by")
    serializer_class = EnrollmentSerializer
    lookup_field = "enrollment_no"
    lookup_value_regex = r"[^/]+"  # allow string with dashes etc.

    def get_queryset(self):
        qs = super().get_queryset().order_by("-created_at")
        search = self.request.query_params.get("search", "").strip()
        if search:
            norm_q = ''.join(search.split()).lower().replace('-', '').replace('_', '')
            # Build normalized annotations: lowercased and without spaces/dashes/underscores
            # Replace is nested to strip multiple characters.
            n_en = Replace(
                Replace(
                    Replace(
                        Replace(Lower(models.F('enrollment_no')), Value(' '), Value('')),
                        Value('-'), Value('')
                    ),
                    Value('_'), Value('')
                ),
                Value('/'), Value('')
            )
            n_temp = Replace(
                Replace(
                    Replace(
                        Replace(Lower(models.F('temp_enroll_no')), Value(' '), Value('')),
                        Value('-'), Value('')
                    ),
                    Value('_'), Value('')
                ),
                Value('/'), Value('')
            )
            n_name = Replace(
                Replace(
                    Replace(Lower(models.F('student_name')), Value(' '), Value('')),
                    Value('-'), Value('')
                ),
                Value('_'), Value('')
            )
            qs = qs.annotate(n_en=n_en, n_temp=n_temp, n_name=n_name).filter(
                Q(n_en__contains=norm_q) | Q(n_temp__contains=norm_q) | Q(n_name__contains=norm_q)
            )
        return qs

    def list(self, request, *args, **kwargs):
        # Simple manual pagination to return { items, total }
        queryset = self.get_queryset()
        try:
            limit = int(request.query_params.get("limit", 10))
            page = int(request.query_params.get("page", 1))
            if limit <= 0:
                limit = 10
            if page <= 0:
                page = 1
        except ValueError:
            limit = 10
            page = 1

        total = queryset.count()
        start = (page - 1) * limit
        end = start + limit
        page_items = queryset[start:end]

        serializer = self.get_serializer(page_items, many=True)
        return Response({"items": serializer.data, "total": total})

    def perform_create(self, serializer):
        serializer.save(updated_by=self.request.user if self.request.user.is_authenticated else None)


# -------- Bulk Upload & Data Analysis --------
class BulkService(str):
    ENROLLMENT = 'ENROLLMENT'
    DOCREC = 'DOCREC'
    MIGRATION = 'MIGRATION'
    PROVISIONAL = 'PROVISIONAL'
    VERIFICATION = 'VERIFICATION'
    DEGREE = 'DEGREE'  # not implemented


def _parse_excel_date_safe(val):
    # Reuse robust parser similar to admin
    try:
        import pandas as pd
    except Exception:
        pd = None
    if val is None:
        return None
    if isinstance(val, datetime.date) and not isinstance(val, datetime.datetime):
        return val
    if isinstance(val, datetime.datetime):
        return (val.replace(tzinfo=None) if val.tzinfo else val).date()
    if pd is not None:
        try:
            if pd.isna(val):
                return None
            if isinstance(val, pd.Timestamp):
                py_dt = val.to_pydatetime()
                if getattr(py_dt, 'tzinfo', None) is not None:
                    py_dt = py_dt.replace(tzinfo=None)
                return py_dt.date()
            parsed = pd.to_datetime(val, errors='coerce', dayfirst=True)
            if pd.isna(parsed):
                return None
            py_dt = parsed.to_pydatetime()
            if getattr(py_dt, 'tzinfo', None) is not None:
                py_dt = py_dt.replace(tzinfo=None)
            return py_dt.date()
        except Exception:
            pass
    for fmt in ("%d-%m-%Y", "%Y-%m-%d", "%d/%m/%Y", "%m/%d/%Y"):
        try:
            return datetime.datetime.strptime(str(val), fmt).date()
        except Exception:
            continue
    return None


class BulkUploadView(APIView):
    permission_classes = [IsAuthenticated]
    parser_classes = [MultiPartParser, FormParser]

    def get(self, request):
        """Download sample template for selected service as Excel."""
        service = request.query_params.get('service', '').upper().strip()
        custom_sheet = (request.query_params.get('sheet_name') or '').strip() or None
        try:
            import pandas as pd
        except Exception:
            return Response({"detail": "pandas is required on server for Excel operations."}, status=500)

        columns_map = {
            BulkService.DOCREC: [
                "apply_for","doc_rec_id","pay_by","pay_rec_no_pre","pay_rec_no","pay_amount","doc_rec_date"
            ],
            BulkService.ENROLLMENT: [
                "student_name","institute_id","batch","enrollment_date","subcourse_id","maincourse_id","enrollment_no","temp_enroll_no","admission_date"
            ],
            BulkService.MIGRATION: [
                "doc_rec_id","enrollment_no","student_name","institute_id","maincourse_id","subcourse_id","mg_number","mg_date","exam_year","admission_year","exam_details","mg_status","pay_rec_no"
            ],
            BulkService.PROVISIONAL: [
                "doc_rec_id","enrollment_no","student_name","institute_id","maincourse_id","subcourse_id","prv_number","prv_date","class_obtain","passing_year","prv_status","pay_rec_no"
            ],
            BulkService.VERIFICATION: [
                "doc_rec_id","date","enrollment_no","second_enrollment_no","student_name","no_of_transcript","no_of_marksheet","no_of_degree","no_of_moi","no_of_backlog","status","final_no","pay_rec_no"
            ],
            BulkService.DEGREE: None,
        }
        cols = columns_map.get(service)
        if not cols:
            return Response({"detail": f"Template not available for {service or 'service'}"}, status=501)
        df = pd.DataFrame(columns=cols)
        output = BytesIO()
        with pd.ExcelWriter(output, engine='openpyxl') as writer:
            df.to_excel(writer, index=False, sheet_name=custom_sheet or service.title())
        output.seek(0)
        filename = f"template_{service.lower()}_{timezone.now().strftime('%Y%m%d_%H%M%S')}.xlsx"
        resp = HttpResponse(output.getvalue(), content_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet")
        resp['Content-Disposition'] = f'attachment; filename="{filename}"'
        return resp

    def post(self, request):
        action = request.query_params.get('action', 'preview')
        service = request.data.get('service', '').upper().strip()
        preferred_sheet = (request.data.get('sheet_name') or '').strip()
        file = request.FILES.get('file')
        if not service:
            return Response({"detail": "service is required"}, status=400)
        if not file:
            return Response({"detail": "file is required"}, status=400)
        try:
            import pandas as pd
        except Exception as e:
            return Response({"detail": f"pandas required: {e}"}, status=500)

        # Load excel
        try:
            df_sheets = pd.read_excel(file, sheet_name=None)
        except Exception as e:
            return Response({"detail": f"Error reading Excel: {e}"}, status=400)

        # pick the requested sheet if present else the first
        if preferred_sheet and preferred_sheet in df_sheets:
            sheet_name, df = preferred_sheet, df_sheets[preferred_sheet]
        else:
            sheet_name, df = next(iter(df_sheets.items())) if df_sheets else (None, None)
        if df is None:
            return Response({"detail": "No sheets found"}, status=400)

        def _bool(v):
            s = str(v).strip().lower()
            return s in ("1","true","yes","y","t")

        # Preview returns top rows
        if action == 'preview':
            preview_rows = df.fillna('').head(100).to_dict(orient='records')
            return Response({"sheet": sheet_name, "count": len(df), "preview": preview_rows})

        # Confirm: iterate and upsert
        results = []
        def _log(row_idx, key, status_msg, ok):
            results.append({"row": int(row_idx), "key": key, "status": "OK" if ok else "FAIL", "message": status_msg})

        if service == BulkService.DOCREC:
            for idx, row in df.iterrows():
                try:
                    apply_for = str(row.get("apply_for") or "").strip().upper()
                    pay_by = str(row.get("pay_by") or "").strip().upper()
                    doc_rec_id = str(row.get("doc_rec_id") or "").strip()
                    pay_rec_no_pre = str(row.get("pay_rec_no_pre") or "").strip()
                    pay_rec_no = str(row.get("pay_rec_no") or "").strip() or None
                    raw_amt = row.get("pay_amount")
                    pay_amount = None
                    try:
                        if str(raw_amt).strip() not in ("", "None"):
                            pay_amount = float(raw_amt)
                    except Exception:
                        pay_amount = None
                    # When pay_by is NA, allow prefixes/receipt to be null
                    if not (apply_for and pay_by and doc_rec_id):
                        _log(idx, doc_rec_id, "Missing required fields (apply_for/pay_by/doc_rec_id)", False); continue
                    if pay_by != PayBy.NA and not pay_rec_no_pre:
                        _log(idx, doc_rec_id, "pay_rec_no_pre required unless pay_by=NA", False); continue
                    # Parse doc_rec_date if present
                    dr_date = _parse_excel_date_safe(row.get("doc_rec_date")) or timezone.now().date()
                    obj, created = DocRec.objects.get_or_create(
                        doc_rec_id=doc_rec_id,
                        defaults={
                            "apply_for": apply_for,
                            "pay_by": pay_by,
                            "pay_rec_no_pre": pay_rec_no_pre,
                            "pay_rec_no": pay_rec_no,
                            "pay_amount": pay_amount or 0,
                            "doc_rec_date": dr_date,
                            "created_by": request.user,
                        }
                    )
                    if not created:
                        obj.apply_for = apply_for
                        obj.pay_by = pay_by
                        obj.pay_rec_no_pre = pay_rec_no_pre if pay_by != PayBy.NA else None
                        obj.pay_rec_no = pay_rec_no if pay_by != PayBy.NA else None
                        obj.pay_amount = pay_amount or 0
                        obj.doc_rec_date = dr_date
                        obj.save()
                    _log(idx, doc_rec_id, "Upserted", True)
                except Exception as e:
                    _log(idx, row.get("doc_rec_id"), str(e), False)

        elif service == BulkService.ENROLLMENT:
            for idx, row in df.iterrows():
                try:
                    institute = Institute.objects.filter(institute_id=row.get("institute_id")).first()
                    subcourse = SubBranch.objects.filter(subcourse_id=row.get("subcourse_id")).first()
                    maincourse = MainBranch.objects.filter(maincourse_id=row.get("maincourse_id")).first()
                    if not (institute and subcourse and maincourse):
                        _log(idx, row.get("enrollment_no"), "Missing related institute/subcourse/maincourse", False); continue
                    enrollment_date = _parse_excel_date_safe(row.get("enrollment_date"))
                    admission_date = _parse_excel_date_safe(row.get("admission_date"))
                    Enrollment.objects.update_or_create(
                        enrollment_no=row.get("enrollment_no"),
                        defaults={
                            "student_name": row.get("student_name"),
                            "institute": institute,
                            "batch": row.get("batch"),
                            "enrollment_date": enrollment_date,
                            "admission_date": admission_date,
                            "subcourse": subcourse,
                            "maincourse": maincourse,
                            "temp_enroll_no": row.get("temp_enroll_no"),
                            "updated_by": request.user
                        }
                    )
                    _log(idx, row.get("enrollment_no"), "Upserted", True)
                except Exception as e:
                    _log(idx, row.get("enrollment_no"), str(e), False)

        elif service == BulkService.MIGRATION:
            for idx, row in df.iterrows():
                try:
                    doc_rec = DocRec.objects.filter(doc_rec_id=str(row.get("doc_rec_id")).strip()).first()
                    enr = Enrollment.objects.filter(enrollment_no=str(row.get("enrollment_no")).strip()).first()
                    inst = Institute.objects.filter(institute_id=row.get("institute_id")).first()
                    main = MainBranch.objects.filter(maincourse_id=row.get("maincourse_id")).first()
                    sub = SubBranch.objects.filter(subcourse_id=row.get("subcourse_id")).first()
                    if not (doc_rec and enr and inst and main and sub):
                        _log(idx, row.get("mg_number"), "Missing related (doc_rec/enrollment/institute/main/sub)", False); continue
                    mg_date = _parse_excel_date_safe(row.get("mg_date"))
                    MigrationRecord.objects.update_or_create(
                        mg_number=str(row.get("mg_number")).strip(),
                        defaults={
                            "doc_rec": doc_rec,
                            "enrollment": enr,
                            "student_name": row.get("student_name") or (enr.student_name if enr else ""),
                            "institute": inst,
                            "maincourse": main,
                            "subcourse": sub,
                            "mg_date": mg_date,
                            "exam_year": row.get("exam_year"),
                            "admission_year": row.get("admission_year"),
                            "exam_details": row.get("exam_details"),
                            "mg_status": row.get("mg_status") or MigrationStatus.PENDING,
                            "pay_rec_no": row.get("pay_rec_no") or (doc_rec.pay_rec_no if doc_rec else ""),
                            "created_by": request.user,
                        }
                    )
                    _log(idx, row.get("mg_number"), "Upserted", True)
                except Exception as e:
                    _log(idx, row.get("mg_number"), str(e), False)

        elif service == BulkService.PROVISIONAL:
            for idx, row in df.iterrows():
                try:
                    doc_rec = DocRec.objects.filter(doc_rec_id=str(row.get("doc_rec_id")).strip()).first()
                    enr = Enrollment.objects.filter(enrollment_no=str(row.get("enrollment_no")).strip()).first()
                    inst = Institute.objects.filter(institute_id=row.get("institute_id")).first()
                    main = MainBranch.objects.filter(maincourse_id=row.get("maincourse_id")).first()
                    sub = SubBranch.objects.filter(subcourse_id=row.get("subcourse_id")).first()
                    if not (doc_rec and enr and inst and main and sub):
                        _log(idx, row.get("prv_number"), "Missing related (doc_rec/enrollment/institute/main/sub)", False); continue
                    prv_date = _parse_excel_date_safe(row.get("prv_date"))
                    ProvisionalRecord.objects.update_or_create(
                        prv_number=str(row.get("prv_number")).strip(),
                        defaults={
                            "doc_rec": doc_rec,
                            "enrollment": enr,
                            "student_name": row.get("student_name") or (enr.student_name if enr else ""),
                            "institute": inst,
                            "maincourse": main,
                            "subcourse": sub,
                            "class_obtain": row.get("class_obtain"),
                            "prv_date": prv_date,
                            "passing_year": row.get("passing_year"),
                            "prv_status": row.get("prv_status") or ProvisionalStatus.PENDING,
                            "pay_rec_no": row.get("pay_rec_no") or (doc_rec.pay_rec_no if doc_rec else ""),
                            "created_by": request.user,
                        }
                    )
                    _log(idx, row.get("prv_number"), "Upserted", True)
                except Exception as e:
                    _log(idx, row.get("prv_number"), str(e), False)

        elif service == BulkService.VERIFICATION:
            for idx, row in df.iterrows():
                try:
                    doc_rec = DocRec.objects.filter(doc_rec_id=str(row.get("doc_rec_id")).strip()).first()
                    enr = Enrollment.objects.filter(enrollment_no=str(row.get("enrollment_no")).strip()).first()
                    senr = None
                    if str(row.get("second_enrollment_no") or '').strip():
                        senr = Enrollment.objects.filter(enrollment_no=str(row.get("second_enrollment_no")).strip()).first()
                    if not (doc_rec and enr):
                        _log(idx, row.get("final_no"), "Missing related (doc_rec/enrollment)", False); continue
                    date_v = _parse_excel_date_safe(row.get("date")) or timezone.now().date()
                    Verification.objects.update_or_create(
                        final_no=(str(row.get("final_no")).strip() or None),
                        defaults={
                            "doc_rec": doc_rec,
                            "date": date_v,
                            "enrollment": enr,
                            "second_enrollment": senr,
                            "student_name": row.get("student_name") or (enr.student_name if enr else ""),
                            "tr_count": int(row.get("no_of_transcript") or 0),
                            "ms_count": int(row.get("no_of_marksheet") or 0),
                            "dg_count": int(row.get("no_of_degree") or 0),
                            "moi_count": int(row.get("no_of_moi") or 0),
                            "backlog_count": int(row.get("no_of_backlog") or 0),
                            "status": row.get("status") or VerificationStatus.IN_PROGRESS,
                            "pay_rec_no": row.get("pay_rec_no") or (doc_rec.pay_rec_no if doc_rec else ""),
                            "updatedby": request.user,
                        }
                    )
                    _log(idx, row.get("final_no") or row.get("enrollment_no"), "Upserted", True)
                except Exception as e:
                    _log(idx, row.get("final_no") or row.get("enrollment_no"), str(e), False)

        else:
            return Response({"detail": f"Service {service} not implemented"}, status=501)

        # Build log excel
        try:
            import pandas as pd
            logs_dir = os.path.join(settings.MEDIA_ROOT, 'logs')
            os.makedirs(logs_dir, exist_ok=True)
            df_log = pd.DataFrame(results)
            out = BytesIO()
            with pd.ExcelWriter(out, engine='openpyxl') as writer:
                df_log.to_excel(writer, index=False, sheet_name='result')
            out.seek(0)
            fname = f"upload_log_{service.lower()}_{timezone.now().strftime('%Y%m%d_%H%M%S')}.xlsx"
            fpath = os.path.join(logs_dir, fname)
            with open(fpath, 'wb') as f:
                f.write(out.getvalue())
            file_url = request.build_absolute_uri(os.path.join(settings.MEDIA_URL, 'logs', fname))
        except Exception as e:
            file_url = None

        ok_count = sum(1 for r in results if r['status'] == 'OK')
        fail_count = sum(1 for r in results if r['status'] != 'OK')
        return Response({"summary": {"ok": ok_count, "fail": fail_count, "total": len(results)}, "log_url": file_url, "results": results})


class DataAnalysisView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request):
        service = request.query_params.get('service', '').upper().strip()
        issues = []

        def add(issue_type, key, msg):
            issues.append({"type": issue_type, "key": key, "message": msg})

        if service == BulkService.ENROLLMENT:
            # Duplicates by enrollment_no and temp_enroll_no
            dups = (Enrollment.objects.values('enrollment_no').annotate(c=models.Count('id')).filter(c__gt=1))
            for d in dups:
                add('DUPLICATE_ENROLLMENT_NO', d['enrollment_no'], f"Appears {d['c']} times")
            dups2 = (Enrollment.objects.values('temp_enroll_no').annotate(c=models.Count('id')).filter(temp_enroll_no__isnull=False, temp_enroll_no__gt='', c__gt=1))
            for d in dups2:
                add('DUPLICATE_TEMP_ENROLL_NO', d['temp_enroll_no'], f"Appears {d['c']} times")
            # Course mismatch
            for e in Enrollment.objects.select_related('subcourse__maincourse', 'maincourse')[:5000]:
                try:
                    if e.subcourse and e.maincourse and e.subcourse.maincourse_id != e.maincourse.maincourse_id:
                        add('COURSE_MISMATCH', e.enrollment_no, 'Subcourse not under Maincourse')
                except Exception:
                    pass

        elif service == BulkService.MIGRATION:
            dups = MigrationRecord.objects.values('mg_number').annotate(c=models.Count('id')).filter(c__gt=1)
            for d in dups:
                add('DUPLICATE_MG_NUMBER', d['mg_number'], f"Appears {d['c']} times")
            for m in MigrationRecord.objects.select_related('doc_rec')[:5000]:
                if not m.doc_rec:
                    add('MISSING_DOC_REC', m.mg_number, 'No doc_rec linked')

        elif service == BulkService.PROVISIONAL:
            dups = ProvisionalRecord.objects.values('prv_number').annotate(c=models.Count('id')).filter(c__gt=1)
            for d in dups:
                add('DUPLICATE_PRV_NUMBER', d['prv_number'], f"Appears {d['c']} times")
            for p in ProvisionalRecord.objects.select_related('doc_rec')[:5000]:
                if not p.doc_rec:
                    add('MISSING_DOC_REC', p.prv_number, 'No doc_rec linked')

        elif service == BulkService.VERIFICATION:
            dups = Verification.objects.values('final_no').annotate(c=models.Count('id')).filter(final_no__isnull=False, final_no__gt='', c__gt=1)
            for d in dups:
                add('DUPLICATE_FINAL_NO', d['final_no'], f"Appears {d['c']} times")
            for v in Verification.objects.select_related('doc_rec')[:5000]:
                if not v.enrollment:
                    add('MISSING_ENROLLMENT', v.id, 'No enrollment linked')
                if v.status in [VerificationStatus.PENDING, VerificationStatus.CANCEL] and v.final_no:
                    add('STATUS_RULE', v.id, 'final_no must be empty for PENDING/CANCEL')

        else:
            return Response({"detail": f"Service {service} not implemented"}, status=501)

        # Return analysis and a quick summary
        summary = {
            'total_issues': len(issues),
            'by_type': {}
        }
        for it in issues:
            summary['by_type'][it['type']] = summary['by_type'].get(it['type'], 0) + 1
        return Response({"summary": summary, "issues": issues})
    def perform_update(self, serializer):
        serializer.save(updated_by=self.request.user if self.request.user.is_authenticated else None)
    

class StudentProfileViewSet(viewsets.ModelViewSet):
    queryset = StudentProfile.objects.select_related('enrollment').order_by('-id')
    serializer_class = StudentProfileSerializer
    permission_classes = [IsAuthenticated]

    def get_queryset(self):
        qs = super().get_queryset()
        search = self.request.query_params.get('search', '').strip()
        if search:
            norm_q = ''.join(search.split()).lower()
            qs = qs.annotate(
                n_en=Replace(Lower(models.F('enrollment__enrollment_no')), Value(' '), Value('')),
                n_name=Replace(Lower(models.F('enrollment__student_name')), Value(' '), Value('')),
            ).filter(Q(n_en__contains=norm_q) | Q(n_name__contains=norm_q))
        return qs

