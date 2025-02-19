from rest_framework import serializers # type: ignore
from .models import Holiday
from .models import User  # Import the User model
from django.contrib.auth.hashers import check_password, make_password


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


class ChangePasswordSerializer(serializers.Serializer):
    userid = serializers.IntegerField()  # The user's ID for identification
    old_password = serializers.CharField(write_only=True)  # The current password
    new_password = serializers.CharField(write_only=True)  # The new password
    
    def validate(self, data):
        # Get the user by userid
        try:
            user = User.objects.get(userid=data['userid'])
        except User.DoesNotExist:
            raise serializers.ValidationError("User not found.")

        # Check if the old password is correct
        if not check_password(data['old_password'], user.usrpassword):
            raise serializers.ValidationError("Old password is incorrect.")
        
        # Check the new password criteria (optional validation)
        if len(data['new_password']) < 8:
            raise serializers.ValidationError("New password must be at least 8 characters long.")
        
        return data
    
    def save(self):
        # Get the validated data
        userid = self.validated_data['userid']
        new_password = self.validated_data['new_password']
        
        # Get the user and update the password within a transaction
        try:
            user = User.objects.get(userid=userid)
        except User.DoesNotExist:
            raise serializers.ValidationError("User not found.")
        
        # Update the password with the hashed new password
        user.usrpassword = make_password(new_password)  # Hash the new password
        
        # Explicitly set the updatedat field to the current timestamp
        user.updatedat = timezone.now()  # Set the updatedat field
        
        # Optionally wrap this in a transaction to ensure atomicity
        with transaction.atomic():
            user.save()

        return user