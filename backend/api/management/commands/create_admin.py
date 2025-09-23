from django.core.management.base import BaseCommand
from django.contrib.auth import get_user_model
import os

class Command(BaseCommand):
    help = "Create or update a Django superuser from env vars or command args."

    def add_arguments(self, parser):
        parser.add_argument("--username", default=os.getenv("ADMIN_USER", "admin"))
        parser.add_argument("--email", default=os.getenv("ADMIN_EMAIL", "admin@example.com"))
        parser.add_argument("--password", default=os.getenv("ADMIN_PASSWORD", None))

    def handle(self, *args, **options):
        User = get_user_model()
        username = options["username"]
        email = options["email"]
        password = options["password"]

        if not password:
            self.stdout.write(self.style.ERROR(
                "No password provided. Set ADMIN_PASSWORD env var or pass --password."
            ))
            return

        try:
            user = User.objects.filter(username=username).first()
            if user:
                user.email = email
                user.is_active = True
                user.is_staff = True
                user.is_superuser = True
                user.set_password(password)
                user.save()
                self.stdout.write(self.style.SUCCESS(f'Updated superuser "{username}".'))
            else:
                User.objects.create_superuser(username=username, email=email, password=password)
                self.stdout.write(self.style.SUCCESS(f'Created superuser "{username}".'))
        except Exception as e:
            self.stdout.write(self.style.ERROR(f"Error creating/updating superuser: {e}"))
