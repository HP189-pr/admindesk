from django.core.management.base import BaseCommand
from django.contrib.auth import get_user_model
from django.contrib.auth.models import Group
import os


class Command(BaseCommand):
    help = "Ensure default groups exist and (optionally) create users for each via env vars or CLI args."

    def add_arguments(self, parser):
        parser.add_argument("--admin-username", default=os.getenv("ADMIN_USER"))
        parser.add_argument("--admin-password", default=os.getenv("ADMIN_PASSWORD"))
        parser.add_argument("--super-username", default=os.getenv("SUPER_USER"))
        parser.add_argument("--super-password", default=os.getenv("SUPER_PASSWORD"))
        parser.add_argument("--restricted-username", default=os.getenv("RESTRICTED_USER"))
        parser.add_argument("--restricted-password", default=os.getenv("RESTRICTED_PASSWORD"))
        parser.add_argument("--no-users", action="store_true", help="Only create groups; skip user creation.")

    def handle(self, *args, **options):
        User = get_user_model()
        groups = ["Admin", "Super", "Restricted"]
        created_groups = []
        for name in groups:
            g, created = Group.objects.get_or_create(name=name)
            if created:
                created_groups.append(name)

        if created_groups:
            self.stdout.write(self.style.SUCCESS(f"Created groups: {', '.join(created_groups)}"))
        else:
            self.stdout.write("Groups already present.")

        if options["no_users"]:
            return

        def upsert_user(username, password, group_name, is_staff=False, is_super=False):
            if not username or not password:
                return
            user = User.objects.filter(username=username).first()
            if user:
                changed = False
                if not user.is_active:
                    user.is_active = True; changed = True
                if user.is_staff != is_staff:
                    user.is_staff = is_staff; changed = True
                if user.is_superuser != is_super:
                    user.is_superuser = is_super; changed = True
                if changed:
                    user.save()
                # Always reset password if env/arg provided (explicit action)
                user.set_password(password)
                user.save()
                self.stdout.write(self.style.WARNING(f"Updated user '{username}'."))
            else:
                user = User.objects.create_user(
                    username=username, password=password,
                    is_staff=is_staff, is_superuser=is_super
                )
                self.stdout.write(self.style.SUCCESS(f"Created user '{username}'."))
            # Ensure group membership
            try:
                grp = Group.objects.get(name=group_name)
                user.groups.add(grp)
            except Group.DoesNotExist:  # pragma: no cover
                self.stdout.write(self.style.ERROR(f"Group '{group_name}' missing (unexpected)."))

        # Admin (full superuser)
        upsert_user(options["admin_username"], options["admin_password"], "Admin", is_staff=True, is_super=True)
        # Super (staff but maybe not superuser)
        upsert_user(options["super_username"], options["super_password"], "Super", is_staff=True, is_super=False)
        # Restricted (normal user)
        upsert_user(options["restricted_username"], options["restricted_password"], "Restricted", is_staff=False, is_super=False)

        self.stdout.write(self.style.SUCCESS("Role seeding complete."))
