from django.contrib.auth.models import User
from django.db import models

# ✅ Holiday Model
class Holiday(models.Model):
    hdid = models.AutoField(primary_key=True)
    holiday_date = models.DateField()
    holiday_name = models.CharField(max_length=255)
    holiday_day = models.CharField(max_length=50)

    class Meta:
        db_table = "holiday"

    def __str__(self):
        return self.holiday_name

# ✅ User Profile Model
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

class Module(models.Model):
    moduleid = models.AutoField(primary_key=True)
    name = models.CharField(max_length=255, unique=True)
    created_at = models.DateTimeField(db_column="createdat", auto_now_add=True)
    updated_at = models.DateTimeField(db_column="updatedat", auto_now=True)
    updated_by = models.ForeignKey(
        User, 
        on_delete=models.SET_NULL, 
        null=True, 
        blank=True, 
        db_column="updatedby"  # ✅ Use the correct column name from the database
    )

    class Meta:
        db_table = "api_module"  # ✅ Explicitly set table name

    def __str__(self):
        return self.name

class Menu(models.Model):
    menuid = models.AutoField(primary_key=True)
    module = models.ForeignKey(
        Module, 
        on_delete=models.CASCADE, 
        db_column="moduleid"  # ✅ Ensure correct column reference
    )
    name = models.CharField(max_length=255)
    created_at = models.DateTimeField(db_column="createdat", auto_now_add=True)  # ✅ Fix column name
    updated_at = models.DateTimeField(db_column="updatedat", auto_now=True)  # ✅ Fix column name
    updated_by = models.ForeignKey(
        User, 
        on_delete=models.SET_NULL, 
        null=True, 
        blank=True, 
        db_column="updatedby"  # ✅ Correct column name
    )

    class Meta:
        db_table = "api_menu"  # ✅ Explicitly set table name

    def __str__(self):
        return f"{self.module.name} - {self.name}"

class UserPermission(models.Model):
    permitid = models.AutoField(primary_key=True)
    user = models.ForeignKey(
        User, 
        on_delete=models.CASCADE, 
        db_column="userid"  # ✅ Correct column reference
    )
    module = models.ForeignKey(
        Module, 
        on_delete=models.CASCADE, 
        null=True, 
        blank=True, 
        db_column="moduleid"  # ✅ Correct column reference
    )
    menu = models.ForeignKey(
        Menu, 
        on_delete=models.CASCADE, 
        null=True, 
        blank=True, 
        db_column="menuid"  # ✅ Correct column reference
    )
    
    # ✅ Fix column names to match database
    can_view = models.BooleanField(default=False, db_column="canview")
    can_edit = models.BooleanField(default=False, db_column="canedit")
    can_delete = models.BooleanField(default=False, db_column="candelete")
    can_create = models.BooleanField(default=False, db_column="cancreate")
    
    created_at = models.DateTimeField(db_column="createdat", auto_now_add=True)
    updated_at = models.DateTimeField(db_column="updatedat", auto_now=True)

    class Meta:
        db_table = "api_userpermissions"  # ✅ Explicitly set table name
        unique_together = ('user', 'module', 'menu')  # Prevent duplicate entries

    def __str__(self):
        if self.menu:
            return f"{self.user.username} - {self.module.name} - {self.menu.name}"
        else:
            return f"{self.user.username} - {self.module.name} (Full Module Access)"
