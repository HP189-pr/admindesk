from django.contrib.auth.models import User
from django.db import models

class Holiday(models.Model):
    hdid = models.AutoField(primary_key=True)
    holiday_date = models.DateField()
    holiday_name = models.CharField(max_length=255)
    holiday_day = models.CharField(max_length=50)

    class Meta:
        db_table = "holiday"

    def __str__(self):
        return self.holiday_name


class UserProfile(models.Model):
    profileid = models.AutoField(primary_key=True)  # Explicit primary key

    # Link to auth_user.id - note db_column="id" ensures it maps correctly
    user = models.OneToOneField(
        User,
        on_delete=models.CASCADE,
        related_name="profile",
        db_column="id"  # Important: links to the "id" column in your table
    )

    phone = models.CharField(max_length=255, blank=True, null=True)
    address = models.TextField(blank=True, null=True)
    city = models.CharField(max_length=255, blank=True, null=True)
    state = models.CharField(max_length=255, blank=True, null=True)
    country = models.CharField(max_length=255, blank=True, null=True)
    profile_picture = models.ImageField(upload_to="profile_pictures/", null=True, blank=True)
    bio = models.TextField(blank=True, null=True)
    social_links = models.JSONField(blank=True, null=True)

    created_at = models.DateTimeField(db_column="createdat", auto_now_add=True)
    updated_at = models.DateTimeField(db_column="updatedat", auto_now=True)

    class Meta:
        db_table = "user_profiles"

    def __str__(self):
        return self.user.username