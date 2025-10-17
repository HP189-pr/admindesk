from django.db import models
from django.contrib.auth.models import User
from django.utils import timezone


class UserActivityLog(models.Model):
    """Record of user actions performed via the web API/UI.

    This is a lightweight audit table capturing who did what and when.
    """
    id = models.BigAutoField(primary_key=True)
    user = models.ForeignKey(User, on_delete=models.SET_NULL, null=True, blank=True)
    module = models.CharField(max_length=200, blank=True, null=True)
    action = models.CharField(max_length=50, blank=True, null=True)
    path = models.CharField(max_length=1000, blank=True, null=True)
    method = models.CharField(max_length=10, blank=True, null=True)
    payload = models.JSONField(blank=True, null=True)
    status_code = models.IntegerField(blank=True, null=True)
    note = models.TextField(blank=True, null=True)
    created_at = models.DateTimeField(default=timezone.now)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        db_table = 'user_activity_log'
        ordering = ['-created_at']

    def __str__(self):
        who = self.user.username if self.user else 'Anonymous'
        return f"{who} {self.method or ''} {self.path or ''} @ {self.created_at}"


class ErrorLog(models.Model):
    """Record of server errors and exceptions for debugging/ops."""
    id = models.BigAutoField(primary_key=True)
    user = models.ForeignKey(User, on_delete=models.SET_NULL, null=True, blank=True)
    path = models.CharField(max_length=1000, blank=True, null=True)
    method = models.CharField(max_length=10, blank=True, null=True)
    message = models.TextField(blank=True, null=True)
    stack = models.TextField(blank=True, null=True)
    payload = models.JSONField(blank=True, null=True)
    created_at = models.DateTimeField(default=timezone.now)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        db_table = 'error_log'
        ordering = ['-created_at']

    def __str__(self):
        who = self.user.username if self.user else 'Anonymous'
        return f"Error by {who} on {self.path or 'unknown'} @ {self.created_at}"
