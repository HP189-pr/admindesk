from rest_framework import serializers
from django.contrib.auth.hashers import check_password, make_password
from django.utils import timezone
from django.db import transaction
from .models import Holiday, User, UserProfile


class HolidaySerializer(serializers.ModelSerializer):
    class Meta:
        model = Holiday
        fields = "__all__"


class LoginSerializer(serializers.Serializer):
    identifier = serializers.CharField()  # Accepts either `userid` or `usercode`
    usrpassword = serializers.CharField(write_only=True)

    def validate(self, data):
        user = None
        identifier = data["identifier"].strip().lower()  # ✅ Case-insensitive login

        try:
            if identifier.isdigit():
                user = User.objects.get(userid=identifier)
            else:
                user = User.objects.get(usercode__iexact=identifier)  # ✅ Case-insensitive match
        except User.DoesNotExist:
            raise serializers.ValidationError("Invalid username or password.")  # ✅ Generic error

        if not check_password(data["usrpassword"], user.usrpassword):
            raise serializers.ValidationError("Invalid username or password.")  # ✅ Prevents user existence leak

        return user


class UserSerializer(serializers.ModelSerializer):
    class Meta:
        model = User
        exclude = ["usrpassword"]  # ✅ Never expose passwords


class ChangePasswordSerializer(serializers.Serializer):
    userid = serializers.IntegerField()
    old_password = serializers.CharField(write_only=True)
    new_password = serializers.CharField(write_only=True)

    def validate(self, data):
        try:
            user = User.objects.get(userid=data["userid"])
        except User.DoesNotExist:
            raise serializers.ValidationError("Invalid user credentials.")  # ✅ Generic error

        if not check_password(data["old_password"], user.usrpassword):
            raise serializers.ValidationError("Invalid user credentials.")  # ✅ Prevents user enumeration

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
        user.updated_at = timezone.now()  # ✅ Fix: Ensuring correct timestamp update

        with transaction.atomic():
            user.save()

        return user


class UserProfileSerializer(serializers.ModelSerializer):
    class Meta:
        model = UserProfile
        fields = "__all__"

    def update(self, instance, validated_data):
        # Ensure that only the owner can update their profile
        request_user = self.context.get("request").user
        if instance.user != request_user:
            raise serializers.ValidationError("You can only update your own profile.")

        return super().update(instance, validated_data)
