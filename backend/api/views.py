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
from django.db.models import Q
import pandas as pd



from .models import Holiday, UserProfile,User, Module, Menu, UserPermission, Enrollment, Institute, MainBranch, SubBranch
from .serializers import (
    HolidaySerializer, LoginSerializer, UserSerializer,
    ChangePasswordSerializer, UserProfileSerializer,
    VerifyPasswordSerializer, CustomTokenObtainPairSerializer, ModuleSerializer, MenuSerializer, UserPermissionSerializer, 
    EnrollmentSerializer, InstituteSerializer, MainBranchSerializer, SubBranchSerializer
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

                        
            is_admin = user.groups.filter(id=1).exists()
            is_super = user.groups.filter(id=2).exists()
            is_restricted = user.groups.filter(id=3).exists()

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
            filename = f"{request.user.username}_{int(time.time())}.{extension}"
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
            is_admin = user.groups.filter(id=1).exists()  # Check by group ID (Admin = 1)

            return Response({"is_admin": is_admin}, status=status.HTTP_200_OK if is_admin else status.HTTP_403_FORBIDDEN)

        except Exception as e:
            return Response(
                {"error": "Internal Server Error", "details": str(e)},
                status=status.HTTP_500_INTERNAL_SERVER_ERROR
            )


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

    @action(detail=False, methods=['get'], url_path='module/(?P<module_id>[^/.]+)')
    def menus_by_module(self, request, module_id=None):
            """Fetch menus by module ID"""
            module = get_object_or_404(Module, moduleid=module_id)  # ✅ Use moduleid instead of id
            menus = Menu.objects.filter(module=module)
            serializer = self.get_serializer(menus, many=True)
            return Response(serializer.data)

# ✅ User Permission API View
class UserPermissionViewSet(viewsets.ModelViewSet):
    queryset = UserPermission.objects.all()
    serializer_class = UserPermissionSerializer
# ✅ Institute ViewSet
class InstituteViewSet(viewsets.ModelViewSet):
    queryset = Institute.objects.all()
    serializer_class = InstituteSerializer

# ✅ Main Branch ViewSet
class MainBranchViewSet(viewsets.ModelViewSet):
    queryset = MainBranch.objects.all()
    serializer_class = MainBranchSerializer

# ✅ Sub Branch ViewSet
class SubBranchViewSet(viewsets.ModelViewSet):
    queryset = SubBranch.objects.all()
    serializer_class = SubBranchSerializer

# ✅ Enrollment ViewSet
class EnrollmentViewSet(viewsets.ModelViewSet):
    queryset = Enrollment.objects.all()
    serializer_class = EnrollmentSerializer
    parser_classes = (MultiPartParser, FormParser)
    permission_classes = [IsAuthenticated]

    # ✅ Create Enrollment
    def create(self, request, *args, **kwargs):
        try:
            serializer = self.get_serializer(data=request.data)
            serializer.is_valid(raise_exception=True)
            self.perform_create(serializer)
            headers = self.get_success_headers(serializer.data)
            return Response(serializer.data, status=status.HTTP_201_CREATED, headers=headers)
        except Exception as e:
            logger.error(f"Error creating enrollment: {str(e)}")
            return Response({"error": str(e)}, status=status.HTTP_400_BAD_REQUEST)

    # ✅ Update Enrollment
    def update(self, request, *args, **kwargs):
        try:
            instance = self.get_object()
            serializer = self.get_serializer(instance, data=request.data, partial=False)
            serializer.is_valid(raise_exception=True)
            self.perform_update(serializer)
            return Response(serializer.data, status=status.HTTP_200_OK)
        except Exception as e:
            logger.error(f"Error updating enrollment: {str(e)}")
            return Response({"error": str(e)}, status=status.HTTP_400_BAD_REQUEST)

    # ✅ Partial Update Enrollment
    def partial_update(self, request, *args, **kwargs):
        try:
            instance = self.get_object()
            serializer = self.get_serializer(instance, data=request.data, partial=True)
            serializer.is_valid(raise_exception=True)
            self.perform_update(serializer)
            return Response(serializer.data, status=status.HTTP_200_OK)
        except Exception as e:
            logger.error(f"Error partially updating enrollment: {str(e)}")
            return Response({"error": str(e)}, status=status.HTTP_400_BAD_REQUEST)

    # ✅ Delete Enrollment
    def destroy(self, request, *args, **kwargs):
        try:
            instance = self.get_object()
            self.perform_destroy(instance)
            return Response({"message": "Enrollment deleted successfully"}, status=status.HTTP_204_NO_CONTENT)
        except Exception as e:
            logger.error(f"Error deleting enrollment: {str(e)}")
            return Response({"error": str(e)}, status=status.HTTP_400_BAD_REQUEST)

    # ✅ Search Enrollment Records
    @action(detail=False, methods=["GET"], url_path="search")
    def search_enrollment(self, request):
        query = request.GET.get("query", "")

        enrollments = Enrollment.objects.filter(
            Q(enrollment_no__icontains=query) | Q(student_name__icontains=query)
        ) if query else Enrollment.objects.all()

        serializer = self.get_serializer(enrollments, many=True)
        return Response(serializer.data, status=status.HTTP_200_OK)

    # ✅ Upload Excel File & Get Sheet Names
    @action(detail=False, methods=["POST"], url_path="upload-excel")
    def upload_excel(self, request):
        file = request.FILES.get("file")
        if not file:
            return Response({"error": "No file uploaded"}, status=status.HTTP_400_BAD_REQUEST)

        try:
            df = pd.ExcelFile(file)
            sheet_names = df.sheet_names
            return Response({"sheets": sheet_names}, status=status.HTTP_200_OK)
        except Exception as e:
            return Response({"error": str(e)}, status=status.HTTP_400_BAD_REQUEST)

    # ✅ Process Selected Sheet and Store in Database
    @action(detail=False, methods=["POST"], url_path="process-sheet")
    def process_sheet(self, request):
        file = request.FILES.get("file")
        sheet_name = request.data.get("sheet_name")
        column_mapping = request.data.get("column_mapping")

        if not file or not sheet_name or not column_mapping:
            return Response({"error": "Missing required parameters"}, status=status.HTTP_400_BAD_REQUEST)

        try:
            column_mapping = json.loads(column_mapping)
            df = pd.read_excel(file, sheet_name=sheet_name)

            # Validate column mapping
            missing_columns = [col for col in column_mapping.values() if col not in df.columns]
            if missing_columns:
                return Response({"error": f"The following columns are missing in the sheet: {missing_columns}"}, status=status.HTTP_400_BAD_REQUEST)

            df.rename(columns=column_mapping, inplace=True)
            df = df[list(column_mapping.values())]

            enrollment_records = df.to_dict(orient="records")

            # ✅ Handle unique constraint: Upsert instead of ignore_conflicts
            for record in enrollment_records:
                Enrollment.objects.update_or_create(
                    enrollment_no=record.get("enrollment_no"),
                    defaults=record
                )

            return Response({"message": "Data uploaded successfully"}, status=status.HTTP_201_CREATED)
        except Exception as e:
            return Response({"error": str(e)}, status=status.HTTP_400_BAD_REQUEST)
