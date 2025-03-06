from django.contrib.auth.backends import BaseBackend
from django.contrib.auth.hashers import check_password
from api.models import User  # Make sure the path is correct for your project

class UsernameOrIdBackend(BaseBackend):
    """
    Custom authentication backend to allow login with either `username` (string) or `id` (numeric).
    """

    def authenticate(self, request, username=None, password=None, **kwargs):
        """
        Authenticate using either `username` (string) or `id` (numeric).
        Django passes `username` from the login form, so this represents either the `username` or `id`.
        """
        user = None

        if username.isnumeric():  # Check if it's a numeric user ID
            try:
                user = User.objects.get(id=int(username))
            except User.DoesNotExist:
                return None
        else:  # Otherwise, treat it as username
            try:
                user = User.objects.get(username=username)
            except User.DoesNotExist:
                return None

        # Check the hashed password
        if user and user.check_password(password):
            return user

        return None

    def get_user(self, user_id):
        """
        Required method to fetch user by ID.
        """
        try:
            return User.objects.get(pk=user_id)
        except User.DoesNotExist:
            return None
