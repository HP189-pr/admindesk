from rest_framework import serializers
from django.contrib.auth.hashers import check_password
from rest_framework_simplejwt.serializers import TokenObtainPairSerializer
from django.utils import timezone
from django.db import transaction
from .models import Holiday, UserProfile, User
from django.conf import settings

# --- Holiday Serializer ---
class HolidaySerializer(serializers.ModelSerializer):
    class Meta:
        model = Holiday
        fields = "__all__"

# --- Login Serializer (Uses `username` as identifier) ---
class LoginSerializer(serializers.Serializer):
    username = serializers.CharField()
    password = serializers.CharField(write_only=True)

    def validate(self, data):
        try:
            user = User.objects.get(username__iexact=data["username"].strip())
        except User.DoesNotExist:
            raise serializers.ValidationError("Invalid username or password.")  # Generic error

        if not user.check_password(data["password"]):  # Use the built-in `check_password`
            raise serializers.ValidationError("Invalid username or password.")

        return {
            "id": user.id,
            "username": user.username,
            "name": user.get_full_name(),  # Use the built-in `get_full_name` method
            "usertype": user.usertype
        }

# --- User Serializer ---
class UserSerializer(serializers.ModelSerializer):
    class Meta:
        model = User
        exclude = ["password"]  # Never expose passwords in API responses

# --- Change Password Serializer ---
class ChangePasswordSerializer(serializers.Serializer):
    id = serializers.IntegerField()
    old_password = serializers.CharField(write_only=True)
    new_password = serializers.CharField(write_only=True)

    def validate(self, data):
        try:
            user = User.objects.get(id=data["id"])
        except User.DoesNotExist:
            raise serializers.ValidationError("Invalid user credentials.")

        if not user.check_password(data["old_password"]):  # Use the built-in `check_password`
            raise serializers.ValidationError("Invalid user credentials.")

        if len(data["new_password"]) < 8:
            raise serializers.ValidationError("New password must be at least 8 characters long.")

        return data

    def save(self):
        user = User.objects.get(id=self.validated_data["id"])
        user.set_password(self.validated_data["new_password"])  # Use the built-in `set_password`
        user.updated_at = timezone.now()

        with transaction.atomic():
            user.save()

        return user

# --- User Profile Serializer (kept similar but adapted) ---
class UserProfileSerializer(serializers.ModelSerializer):
    first_name = serializers.CharField(source="user.first_name", required=False)
    last_name = serializers.CharField(source="user.last_name", required=False)
    email = serializers.EmailField(source="user.email", required=False)
    profile_picture = serializers.SerializerMethodField()  # <--- Add this line

    class Meta:
        model = UserProfile
        fields = [
            "first_name", "last_name", "email",
            "phone", "address", "city", "profile_picture",
            "state", "country", "bio", "social_links"
        ]
        extra_kwargs = {
            "profile_picture": {"required": False},
        }

    def get_profile_picture(self, obj):
            if obj.profile_picture:
                request = self.context.get('request')
                if request:
                    # Use settings.MEDIA_URL to stay flexible
                    media_url = settings.MEDIA_URL  # usually "/media/"
                    full_url = request.build_absolute_uri(f"{media_url}{obj.profile_picture}")
                    return full_url
                # Fallback if request is missing (rare)
                return f"{settings.MEDIA_URL}{obj.profile_picture}"

            return None

    def update(self, instance, validated_data):
        user_data = validated_data.pop("user", {})

        # Update auth_user fields (first_name, last_name, email)
        user = instance.user
        for attr, value in user_data.items():
            setattr(user, attr, value)
        user.save()

        # Update UserProfile fields
        for attr, value in validated_data.items():
            setattr(instance, attr, value)

        instance.save()
        return instance

# --- Verify Password Serializer ---
class VerifyPasswordSerializer(serializers.Serializer):
    password = serializers.CharField(write_only=True)

    def validate(self, data):
        request = self.context.get('request')
        user = request.user

        if not user.check_password(data['password']):  # Use the built-in `check_password`
            raise serializers.ValidationError("Invalid password.")

        return data

# --- Custom TokenObtainPairSerializer (For JWT Login) ---
class CustomTokenObtainPairSerializer(TokenObtainPairSerializer):
    def validate(self, attrs):
        data = super().validate(attrs)
        data['user_id'] = self.user.id  # Use `id` (not `userid`) for the user ID
        return data