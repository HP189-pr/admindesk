"""File: backend/api/serializers_core.py
Core/user/navigation related serializers split from monolithic serializers.py.
Safe extraction: imports original models via facade. No behavior changes.
"""
from rest_framework import serializers
from django.utils import timezone
from django.db import transaction
from django.conf import settings
from .models import Holiday, UserProfile, User, Module, Menu, UserPermission

__all__ = [
    'HolidaySerializer','LoginSerializer','UserSerializer','ChangePasswordSerializer',
    'UserProfileSerializer','VerifyPasswordSerializer','CustomTokenObtainPairSerializer',
    'ModuleSerializer','MenuSerializer','UserPermissionSerializer'
]

class HolidaySerializer(serializers.ModelSerializer):
    class Meta:
        model = Holiday
        fields = "__all__"

class LoginSerializer(serializers.Serializer):
    username = serializers.CharField()
    password = serializers.CharField(write_only=True)
    def validate(self, data):
        try:
            user = User.objects.get(username__iexact=data["username"].strip())
        except User.DoesNotExist:
            raise serializers.ValidationError("Invalid username or password.")
        if not user.check_password(data["password"]):
            raise serializers.ValidationError("Invalid username or password.")
        return {"id": user.id,"username": user.username,"name": user.get_full_name(),"usertype": getattr(user,'usertype', None)}

class UserSerializer(serializers.ModelSerializer):
    """User serializer with secure password handling.

    - Accepts `password` write-only on create / update.
    - Does not expose password hash.
    - Requires password on create; optional on update.
    """
    password = serializers.CharField(write_only=True, required=True, min_length=8)

    class Meta:
        model = User
        fields = ["id", "username", "email", "first_name", "last_name", "is_active", "is_staff", "is_superuser", "password"]
        read_only_fields = ["is_active", "is_staff", "is_superuser", "id"]

    def create(self, validated_data):
        password = validated_data.pop("password")
        user = User(**validated_data)
        user.set_password(password)
        user.save()
        return user

    def update(self, instance, validated_data):
        password = validated_data.pop("password", None)
        for attr, value in validated_data.items():
            setattr(instance, attr, value)
        if password:
            instance.set_password(password)
        instance.save()
        return instance

class ChangePasswordSerializer(serializers.Serializer):
    id = serializers.IntegerField()
    old_password = serializers.CharField(write_only=True)
    new_password = serializers.CharField(write_only=True)
    def validate(self, data):
        try:
            user = User.objects.get(id=data["id"])
        except User.DoesNotExist:
            raise serializers.ValidationError("Invalid user credentials.")
        if not user.check_password(data["old_password"]):
            raise serializers.ValidationError("Invalid user credentials.")
        if len(data["new_password"]) < 8:
            raise serializers.ValidationError("New password must be at least 8 characters long.")
        return data
    def save(self):
        user = User.objects.get(id=self.validated_data["id"])
        user.set_password(self.validated_data["new_password"])
        user.updated_at = timezone.now()
        with transaction.atomic():
            user.save()
        return user

class UserProfileSerializer(serializers.ModelSerializer):
    first_name = serializers.CharField(source="user.first_name", required=False)
    last_name = serializers.CharField(source="user.last_name", required=False)
    email = serializers.EmailField(source="user.email", required=False)
    username = serializers.CharField(source="user.username", read_only=True)
    is_admin = serializers.SerializerMethodField()
    profile_picture = serializers.SerializerMethodField()
    class Meta:
        model = UserProfile
        fields = ["username","first_name","last_name","email","phone","address","city","profile_picture","state","country","bio","social_links","is_admin"]
    def get_profile_picture(self, obj):
        if obj.profile_picture:
            request = self.context.get('request')
            if request:
                media_url = settings.MEDIA_URL
                return request.build_absolute_uri(f"{media_url}{obj.profile_picture}")
            return f"{settings.MEDIA_URL}{obj.profile_picture}"
        return None
    def get_is_admin(self, obj):
        user = obj.user
        try:
            return bool(getattr(user,'is_superuser',False) or getattr(user,'is_staff',False) or user.groups.filter(name__iexact="Admin").exists() or user.groups.filter(id=1).exists())
        except Exception:
            return False
    def update(self, instance, validated_data):
        user_data = validated_data.pop("user", {})
        user = instance.user
        for k,v in user_data.items():
            setattr(user,k,v)
        user.save()
        for k,v in validated_data.items():
            setattr(instance,k,v)
        instance.save()
        return instance

class VerifyPasswordSerializer(serializers.Serializer):
    password = serializers.CharField(write_only=True)
    def validate(self, data):
        user = self.context.get('request').user
        if not user.check_password(data['password']):
            raise serializers.ValidationError("Invalid password.")
        return data

from rest_framework_simplejwt.serializers import TokenObtainPairSerializer
class CustomTokenObtainPairSerializer(TokenObtainPairSerializer):
    def validate(self, attrs):
        data = super().validate(attrs)
        data['user_id'] = self.user.id
        return data

class ModuleSerializer(serializers.ModelSerializer):
    class Meta:
        model = Module
        fields = "__all__"

class MenuSerializer(serializers.ModelSerializer):
    module_name = serializers.CharField(source="module.name", read_only=True)
    class Meta:
        model = Menu
        fields = "__all__"

class UserPermissionSerializer(serializers.ModelSerializer):
    username = serializers.CharField(source="user.username", read_only=True)
    module_name = serializers.CharField(source="module.name", read_only=True)
    menu_name = serializers.CharField(source="menu.name", read_only=True)
    class Meta:
        model = UserPermission
        fields = "__all__"
