from rest_framework import serializers # type: ignore
from .models import Holiday
from .models import User  # Import the User model


class HolidaySerializer(serializers.ModelSerializer):
    class Meta:
        model = Holiday
        fields = '__all__'
class LoginSerializer(serializers.Serializer):
    usercode = serializers.CharField()
    usrpassword = serializers.CharField(write_only=True)

    def validate(self, data):
        try:
            user = User.objects.get(usercode=data['usercode'])
        except User.DoesNotExist:
            raise serializers.ValidationError("Invalid username or password.")

        if not check_password(data['usrpassword'], user.usrpassword):
            raise serializers.ValidationError("Invalid username or password.")

        return user

class UserSerializer(serializers.ModelSerializer):
    class Meta:
        model = User  # ✅ This was causing the error!
        fields = '__all__'