from django.db import models
from django.contrib.auth.hashers import make_password

class Holiday(models.Model):
    hdid = models.AutoField(primary_key=True)
    holiday_date = models.DateField()
    holiday_name = models.CharField(max_length=255)
    holiday_day = models.CharField(max_length=50)

    class Meta:
        db_table = "holiday"

    def __str__(self):
        return self.holiday_name


class User(models.Model):
    userid = models.AutoField(primary_key=True)
    usercode = models.CharField(max_length=50, unique=True)  # Unique User Code
    username = models.CharField(max_length=255)
    usrpassword = models.CharField(max_length=255)  # Store hashed passwords
    usertype = models.CharField(max_length=50)
    updatedby = models.CharField(max_length=255, null=True, blank=True)
    createdat = models.DateTimeField(auto_now_add=True)  # ✅ Match existing column name
    updatedat = models.DateTimeField(auto_now=True)

    class Meta:
        db_table = "users"


class UserProfile(models.Model):
    profileid = models.AutoField(primary_key=True)
    user = models.OneToOneField(User, on_delete=models.CASCADE, related_name="profile")
    email = models.EmailField(unique=True)
    phone = models.CharField(max_length=15, blank=True, null=True)
    address = models.TextField(blank=True, null=True)
    city = models.CharField(max_length=50, blank=True, null=True)
    state = models.CharField(max_length=50, blank=True, null=True)
    country = models.CharField(max_length=50, blank=True, null=True)
    profile_picture = models.ImageField(
        upload_to="profilepic/", blank=True, null=True, default="profilepic/default.jpg"
    )  # Default Profile Picture
    bio = models.TextField(blank=True, null=True)
    social_links = models.JSONField(blank=True, null=True)

    created_at = models.DateTimeField(auto_now_add=True)  # Consistent Naming
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        db_table = "user_profiles"

    def __str__(self):
        return self.user.username
