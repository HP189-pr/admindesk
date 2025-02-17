from rest_framework import serializers # type: ignore
from .models import Holiday
from .models import User  # Import the User model
from django.contrib.auth.hashers import check_password  # Import check_password


class HolidaySerializer(serializers.ModelSerializer):
    class Meta:
        model = Holiday
        fields = '__all__'
class LoginSerializer(serializers.Serializer):
    identifier = serializers.CharField()  # This will accept either userid or usercode
    usrpassword = serializers.CharField(write_only=True)

    def validate(self, data):
        # First, try to find the user by usercode
        user = None
        try:
            # Check if the identifier is numeric, assuming `userid` is numeric
            if data['identifier'].isdigit():
                user = User.objects.get(userid=data['identifier'])
            else:
                user = User.objects.get(usercode=data['identifier'])
        except User.DoesNotExist:
            raise serializers.ValidationError("Invalid username or password.")

        if not check_password(data['usrpassword'], user.usrpassword):
            raise serializers.ValidationError("Invalid username or password.")

        return user

class UserSerializer(serializers.ModelSerializer):
    class Meta:
        model = User  # ✅ This was causing the error!
        fields = '__all__'