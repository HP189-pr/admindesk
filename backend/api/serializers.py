from rest_framework import serializers  # type: ignore
from django.contrib.auth.hashers import check_password, make_password
from django.utils import timezone  # ✅ Fix: Import timezone for updating timestamps
from django.db import transaction  # ✅ Fix: Import transaction for atomic updates

from .models import Holiday, User, UserProfile  # ✅ Consolidated imports


class HolidaySerializer(serializers.ModelSerializer):
    class Meta:
        model = Holiday
        fields = "__all__"


class LoginSerializer(serializers.Serializer):
    identifier = serializers.CharField()  # Accepts either userid or usercode
    usrpassword = serializers.CharField(write_only=True)

    def validate(self, data):
        user = None
        try:
            if data["identifier"].isdigit():
                user = User.objects.get(userid=data["identifier"])
            else:
                user = User.objects.get(usercode=data["identifier"])
        except User.DoesNotExist:
            raise serializers.ValidationError("Invalid username or password.")

        if not check_password(data["usrpassword"], user.usrpassword):
            raise serializers.ValidationError("Invalid username or password.")

        return user


class UserSerializer(serializers.ModelSerializer):
    class Meta:
        model = User
        fields = "__all__"


class ChangePasswordSerializer(serializers.Serializer):
    userid = serializers.IntegerField()
    old_password = serializers.CharField(write_only=True)
    new_password = serializers.CharField(write_only=True)

    def validate(self, data):
        try:
            user = User.objects.get(userid=data["userid"])
        except User.DoesNotExist:
            raise serializers.ValidationError("User not found.")

        if not check_password(data["old_password"], user.usrpassword):
            raise serializers.ValidationError("Old password is incorrect.")

        if len(data["new_password"]) < 8:
            raise serializers.ValidationError("New password must be at least 8 characters long.")

        return data

    def save(self):
        userid = self.validated_data["userid"]
        new_password = self.validated_data["new_password"]

        try:
            user = User.objects.get(userid=userid)
        except User.DoesNotExist:
            raise serializers.ValidationError("User not found.")

        user.usrpassword = make_password(new_password)
        user.updatedat = timezone.now()

        with transaction.atomic():
            user.save()

        return user


# ✅ Fix: Moved `UserProfileSerializer` out of `ChangePasswordSerializer`
class UserProfileSerializer(serializers.ModelSerializer):
    class Meta:
        model = UserProfile
        fields = "__all__"
