"""Domain Core Models
Contains general system models: Holiday, UserProfile, Module, Menu, UserPermission.
Split from monolithic models.py (Phase 2 refactor). No schema changes.
"""
from django.contrib.auth.models import User
from django.db import models

__all__ = [
    'Holiday', 'UserProfile', 'Module', 'Menu', 'UserPermission'
]

class Holiday(models.Model):
    hdid = models.AutoField(primary_key=True)
    holiday_date = models.DateField()
    holiday_name = models.CharField(max_length=255)
    holiday_day = models.CharField(max_length=50)

    class Meta:
        db_table = 'holiday'

    def __str__(self):
        return self.holiday_name

class UserProfile(models.Model):
    profileid = models.AutoField(primary_key=True)
    user = models.OneToOneField(
        User,
        on_delete=models.CASCADE,
        related_name='profile',
        db_column='id'
    )
    phone = models.CharField(max_length=255, blank=True, null=True)
    address = models.TextField(blank=True, null=True)
    city = models.CharField(max_length=255, blank=True, null=True)
    state = models.CharField(max_length=255, blank=True, null=True)
    country = models.CharField(max_length=255, blank=True, null=True)
    profile_picture = models.ImageField(upload_to='profile_pictures/', null=True, blank=True)
    bio = models.TextField(blank=True, null=True)
    social_links = models.JSONField(blank=True, null=True)
    created_at = models.DateTimeField(db_column='createdat', auto_now_add=True)
    updated_at = models.DateTimeField(db_column='updatedat', auto_now=True)

    class Meta:
        db_table = 'user_profiles'

    def __str__(self):
        return self.user.username

class Module(models.Model):
    moduleid = models.AutoField(primary_key=True)
    name = models.CharField(max_length=255, unique=True)
    created_at = models.DateTimeField(db_column='createdat', auto_now_add=True)
    updated_at = models.DateTimeField(db_column='updatedat', auto_now=True)
    updated_by = models.ForeignKey(User, on_delete=models.SET_NULL, null=True, blank=True, db_column='updatedby')

    class Meta:
        db_table = 'api_module'

    def __str__(self):
        return self.name

class Menu(models.Model):
    menuid = models.AutoField(primary_key=True)
    module = models.ForeignKey(Module, on_delete=models.CASCADE, db_column='moduleid')
    name = models.CharField(max_length=255)
    created_at = models.DateTimeField(db_column='createdat', auto_now_add=True)
    updated_at = models.DateTimeField(db_column='updatedat', auto_now=True)
    updated_by = models.ForeignKey(User, on_delete=models.SET_NULL, null=True, blank=True, db_column='updatedby')

    class Meta:
        db_table = 'api_menu'

    def __str__(self):
        return f"{self.module.name} - {self.name}"

class UserPermission(models.Model):
    permitid = models.AutoField(primary_key=True)
    user = models.ForeignKey(User, on_delete=models.CASCADE, db_column='userid')
    module = models.ForeignKey(Module, on_delete=models.CASCADE, null=True, blank=True, db_column='moduleid')
    menu = models.ForeignKey(Menu, on_delete=models.CASCADE, null=True, blank=True, db_column='menuid')
    can_view = models.BooleanField(default=False, db_column='canview')
    can_edit = models.BooleanField(default=False, db_column='canedit')
    can_delete = models.BooleanField(default=False, db_column='candelete')
    can_create = models.BooleanField(default=False, db_column='cancreate')
    created_at = models.DateTimeField(db_column='createdat', auto_now_add=True)
    updated_at = models.DateTimeField(db_column='updatedat', auto_now=True)

    class Meta:
        db_table = 'api_userpermissions'
        unique_together = ('user', 'module', 'menu')

    def __str__(self):
        if self.menu:
            return f"{self.user.username} - {self.module.name} - {self.menu.name}"
        return f"{self.user.username} - {self.module.name} (Full Module Access)"
