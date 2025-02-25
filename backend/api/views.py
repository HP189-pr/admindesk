from rest_framework.views import APIView
from rest_framework.response import Response
from rest_framework import status, generics, viewsets
from rest_framework.permissions import IsAuthenticated, AllowAny
from django.contrib.auth.hashers import check_password, make_password
from django.conf import settings
from django.shortcuts import get_object_or_404
import jwt
import datetime

from .models import User, Holiday, UserProfile
from .serializers import (
    HolidaySerializer, LoginSerializer, UserSerializer, 
    ChangePasswordSerializer, UserProfileSerializer
)


class HolidayViewSet(viewsets.ModelViewSet):
    """Returns holidays within the next 6 months"""
    serializer_class = HolidaySerializer
    queryset = Holiday.objects.all()  # ✅ Ensure queryset is defined
    permission_classes = [AllowAny]

    def get_queryset(self):
        today = datetime.date.today()
        six_months_later = today + datetime.timedelta(days=180)
        return self.queryset.filter(
            holiday_date__gte=today, holiday_date__lte=six_months_later
        ).order_by("holiday_date")

class LoginView(APIView):
    """Handles user authentication and JWT token generation"""
    permission_classes = [AllowAny]  # ✅ Ensure login is open to all users

    def post(self, request):
        try:
            print("🔥 Incoming Login Request:", request.data)  # ✅ Debugging

            serializer = LoginSerializer(data=request.data)
            if serializer.is_valid():
                user = serializer.validated_data

                print(f"✅ User Found: {user.username}, ID: {user.userid}")  # ✅ Debug

                payload = {
                    'id': user.userid,
                    'exp': datetime.datetime.utcnow() + datetime.timedelta(days=1),
                    'iat': datetime.datetime.utcnow()
                }
                token = jwt.encode(payload, settings.SECRET_KEY, algorithm='HS256')

                return Response({"token": token, "user": UserSerializer(user).data}, status=status.HTTP_200_OK)

            print("❌ Validation Failed:", serializer.errors)  # ✅ Debug
            return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)

        except Exception as e:
            print("🔥 Login Error:", traceback.format_exc())  # ✅ Show error
            return Response({"error": "Internal Server Error", "details": str(e)}, status=500)


class ChangePasswordView(APIView):
    """Allows authenticated users to change their password"""
    permission_classes = [IsAuthenticated]  # Only logged-in users can change their password

    def post(self, request):
        serializer = ChangePasswordSerializer(data=request.data)
        if serializer.is_valid():
            serializer.save()
            return Response({"message": "Password updated successfully"}, status=status.HTTP_200_OK)
        return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)


class UserProfileView(generics.RetrieveUpdateAPIView):
    """Allows users to retrieve and update their profile"""
    serializer_class = UserProfileSerializer
    permission_classes = [IsAuthenticated]  # Only logged-in users can access this

    def get_object(self):
        """Returns the profile of the currently authenticated user"""
        user_profile = get_object_or_404(UserProfile, user=self.request.user)
        return user_profile
