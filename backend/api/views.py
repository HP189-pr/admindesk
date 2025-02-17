from rest_framework.views import APIView
from rest_framework.response import Response
from rest_framework import status
from django.contrib.auth.hashers import check_password
from .models import User, Holiday
from .serializers import LoginSerializer, UserSerializer
import jwt
import datetime
from django.conf import settings
from rest_framework import viewsets
from .serializers import HolidaySerializer
from django.utils import timezone  # Import timezone.now()

class HolidayViewSet(viewsets.ModelViewSet):
    serializer_class = HolidaySerializer
    queryset = Holiday.objects.all()

    def get_queryset(self):
        # Use datetime to get current date and filter for the next 6 months
        today = datetime.date.today()
        six_months_later = today + datetime.timedelta(days=180)
        
        # Filter holidays by date range (next 6 months)
        return Holiday.objects.filter(
            holiday_date__gte=today,
            holiday_date__lte=six_months_later
        ).order_by("holiday_date")
    
class LoginView(APIView):
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
