from rest_framework_simplejwt.tokens import RefreshToken
import traceback
from rest_framework.views import APIView
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

from .models import Holiday, UserProfile,User
from .serializers import (
    HolidaySerializer, LoginSerializer, UserSerializer,
    ChangePasswordSerializer, UserProfileSerializer,
    VerifyPasswordSerializer, CustomTokenObtainPairSerializer
)
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

        profile_picture_file = request.FILES.get("profile_picture")
        if profile_picture_file:
            # Delete old picture if exists
            if profile.profile_picture:
                old_file_path = os.path.join(settings.MEDIA_ROOT, profile.profile_picture.name)
                if os.path.exists(old_file_path):
                    os.remove(old_file_path)

            # Save new profile picture
            extension = profile_picture_file.name.split('.')[-1]
            filename = f"{request.user.username}.{extension}"
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

        return Response(serializer.data, status=status.HTTP_200_OK)
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
