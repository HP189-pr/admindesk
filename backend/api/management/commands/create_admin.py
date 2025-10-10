from django.core.management.base import BaseCommand
from django.contrib.auth import get_user_model
import os
import getpass

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
        password = options["password"] or os.getenv("ADMIN_PASSWORD")

        if not password:
            # Prompt interactively (hidden) if running in an interactive terminal
            try:
                password = getpass.getpass("Admin password (will not echo): ")
                confirm = getpass.getpass("Confirm password: ")
                if password != confirm:
                    self.stdout.write(self.style.ERROR("Passwords do not match."))
                    return
                if len(password) < 8:
                    self.stdout.write(self.style.ERROR("Password must be at least 8 characters."))
                    return
            except (EOFError, KeyboardInterrupt):
                self.stdout.write(self.style.ERROR("Password input cancelled."))
                return

        try:
            user = User.objects.filter(username=username).first()
            if user:
                user.email = email
                user.is_active = True
                user.is_staff = True
                user.is_superuser = True
                if password:
                    user.set_password(password)
                    user.save()
                self.stdout.write(self.style.SUCCESS(f'Updated superuser "{username}".'))
            else:
                User.objects.create_superuser(username=username, email=email, password=password)
                self.stdout.write(self.style.SUCCESS(f'Created superuser "{username}".'))
        except Exception as e:
            self.stdout.write(self.style.ERROR(f"Error creating/updating superuser: {e}"))
