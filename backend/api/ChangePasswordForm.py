from django import forms
from django.contrib.auth.hashers import make_password
from .models import User

class ChangePasswordForm(forms.ModelForm):
    new_password = forms.CharField(
        widget=forms.PasswordInput(attrs={'class': 'form-control'}), 
        label='New Password'
    )

    class Meta:
        model = User
        fields = ['new_password']

    def save(self, user=None, commit=True):
        if user is None:
            raise ValueError("A user must be provided to change their password.")

        # Set the new password (hashed)
        user.usrpassword = make_password(self.cleaned_data['new_password'])

        if commit:
            user.save()
        return user

    def clean_new_password(self):
        new_password = self.cleaned_data.get('new_password')

        # Add any password validation logic here, e.g., minimum length, complexity, etc.
        if len(new_password) < 8:
            raise forms.ValidationError("Password must be at least 8 characters long.")
        
        return new_password
