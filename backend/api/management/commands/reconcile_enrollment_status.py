"""Reconcile enrollment status from degree records without changing other fields."""

from django.core.management.base import BaseCommand
from django.db import transaction
from django.db.models import Exists, OuterRef

from api.domain_degree import StudentDegree
from api.domain_enrollment import Enrollment


class Command(BaseCommand):
    help = (
        "Set non-cancelled enrollment statuses from degree records "
        "(dry-run unless --apply is provided)."
    )

    def add_arguments(self, parser):
        parser.add_argument(
            "--apply",
            action="store_true",
            help="Commit the proposed status changes.",
        )

    def handle(self, *args, **options):
        apply_changes = options["apply"]

        with transaction.atomic():
            degrees = StudentDegree.objects.all()
            enrollments = (
                Enrollment.objects
                .exclude(cancel=True)
                .filter(status="ACTIVE")
                .annotate(
                    has_degree=Exists(
                        degrees.filter(
                            enrollment_no=OuterRef("enrollment_no")
                        )
                    )
                )
            )
            to_pass_out = enrollments.filter(has_degree=True)
            to_pending_closure = enrollments.filter(
                batch__gte=2007,
                batch__lte=2020,
                has_degree=False,
            ).exclude(status="PENDING_CLOSURE")

            pass_count = to_pass_out.count()
            pending_count = to_pending_closure.count()
            self.stdout.write(f"Records to change to PASS_OUT: {pass_count}")
            self.stdout.write(
                f"Records to change to PENDING_CLOSURE: {pending_count}"
            )

            if apply_changes:
                pass_updated = to_pass_out.update(status="PASS_OUT")
                pending_updated = to_pending_closure.update(
                    status="PENDING_CLOSURE"
                )
            else:
                pass_updated = pending_updated = 0

        if apply_changes:
            self.stdout.write(f"Updated to PASS_OUT: {pass_updated}")
            self.stdout.write(
                f"Updated to PENDING_CLOSURE: {pending_updated}"
            )
        else:
            self.stdout.write("DRY RUN: no database changes made.")
