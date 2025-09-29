from rest_framework_simplejwt.tokens import RefreshToken
import traceback
from rest_framework.views import APIView
from rest_framework.decorators import action
from rest_framework.response import Response
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
import logging
from django.db import models
from django.db.models import Q
from django.core.exceptions import ObjectDoesNotExist

from .models import Holiday, UserProfile,User, Module, Menu, UserPermission, InstituteCourseOffering, Institute, MainBranch, SubBranch, Enrollment
from .serializers import (
    HolidaySerializer, LoginSerializer, UserSerializer,
    ChangePasswordSerializer, UserProfileSerializer,
    VerifyPasswordSerializer, CustomTokenObtainPairSerializer, ModuleSerializer, MenuSerializer, UserPermissionSerializer,
    InstituteCourseOfferingSerializer, InstituteSerializer, MainBranchSerializer, SubBranchSerializer, EnrollmentSerializer
    
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

    def perform_create(self, serializer):
        serializer.save(updated_by=self.request.user if self.request.user.is_authenticated else None)

    def perform_update(self, serializer):
        serializer.save(updated_by=self.request.user if self.request.user.is_authenticated else None)
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
            qs = qs.filter(models.Q(enrollment_no__icontains=search) | models.Q(student_name__icontains=search))
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

    def perform_update(self, serializer):
        serializer.save(updated_by=self.request.user if self.request.user.is_authenticated else None)
    
