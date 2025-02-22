from rest_framework.views import APIView
from rest_framework.response import Response
from rest_framework import status, generics, viewsets
from django.contrib.auth.hashers import check_password, make_password
from django.shortcuts import render, redirect
from django.conf import settings
from rest_framework.permissions import IsAuthenticated, AllowAny
import jwt
import datetime

from .models import User, Holiday, UserProfile
from .ChangePasswordForm import ChangePasswordForm
from .serializers import (
    HolidaySerializer, LoginSerializer, UserSerializer, 
    ChangePasswordSerializer, UserProfileSerializer
)


class HolidayViewSet(viewsets.ModelViewSet):
    serializer_class = HolidaySerializer
    queryset = Holiday.objects.all()
    permission_classes = [AllowAny]

    def get_queryset(self):
        today = datetime.date.today()
        six_months_later = today + datetime.timedelta(days=180)
        return Holiday.objects.filter(
            holiday_date__gte=today,
            holiday_date__lte=six_months_later
        ).order_by("holiday_date")


class LoginView(APIView):
    permission_classes = [AllowAny]

    def post(self, request):
        serializer = LoginSerializer(data=request.data)
        if serializer.is_valid():
            user = serializer.validated_data
            payload = {
                'id': user.userid,
                'exp': datetime.datetime.utcnow() + datetime.timedelta(days=1),
                'iat': datetime.datetime.utcnow()
            }
            token = jwt.encode(payload, settings.SECRET_KEY, algorithm='HS256')
            return Response({"token": token, "user": UserSerializer(user).data}, status=status.HTTP_200_OK)
        return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)


class ChangePasswordView(APIView):
    permission_classes = [AllowAny]  # Adjust if you want only authenticated users

    def get(self, request, *args, **kwargs):
        userid = kwargs.get('userid')
        
        if not userid:
            return Response({"error": "User ID is required"}, status=status.HTTP_400_BAD_REQUEST)
        
        try:
            user = User.objects.get(userid=userid)
        except User.DoesNotExist:
            return Response({"error": "User not found"}, status=status.HTTP_404_NOT_FOUND)
        
        form = ChangePasswordForm()  # Empty form for GET request
        return render(request, 'change-password.html', {'form': form, 'user': user})

    def post(self, request, *args, **kwargs):
        userid = kwargs.get('userid')

        if not userid:
            return Response({"error": "User ID is required"}, status=status.HTTP_400_BAD_REQUEST)

        try:
            user = User.objects.get(userid=userid)
        except User.DoesNotExist:
            return Response({"error": "User not found"}, status=status.HTTP_404_NOT_FOUND)

        form = ChangePasswordForm(request.POST)
        if form.is_valid():
            form.save(user=user)  # Save the new password for the user
            return redirect('password_changed')  # Redirect to success page after password change

        return render(request, 'change-password.html', {'form': form, 'user': user})


class UserProfileView(generics.RetrieveUpdateAPIView):
    serializer_class = UserProfileSerializer
    permission_classes = [AllowAny]  # Ensures only logged-in users can access profiles

    def get_object(self):
        return UserProfile.objects.get(user=self.request.user)
