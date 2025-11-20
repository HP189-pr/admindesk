from __future__ import annotations

from typing import Optional

from django.core.management.base import BaseCommand, CommandError

from api.domain_mail_request import GoogleFormSubmission


class Command(BaseCommand):
    help = "Debug helper: print GoogleFormSubmission by mail_req_no or list recent rows."

    def add_arguments(self, parser):
        parser.add_argument("mail_req_no", nargs="?", type=int, help="mail_req_no to look up")
        parser.add_argument("--limit", type=int, default=20, help="How many recent rows to show when no id provided")

    def handle(self, *args, **options):
        mail_req_no: Optional[int] = options.get("mail_req_no")
        if mail_req_no:
            try:
                obj = GoogleFormSubmission.objects.get(mail_req_no=mail_req_no)
            except GoogleFormSubmission.DoesNotExist:
                raise CommandError(f"No GoogleFormSubmission found for mail_req_no={mail_req_no}")
            self.stdout.write(self.style.SUCCESS(f"Found submission id={obj.pk} mail_req_no={obj.mail_req_no}"))
            self.stdout.write(f"submitted_at: {obj.submitted_at}\n enrollment_no: {obj.enrollment_no}\n student_name: {obj.student_name}\n rec_official_mail: {obj.rec_official_mail}\n mail_status: {obj.mail_status}\n remark: {obj.remark}\n raw_row: {obj.raw_row}")
            return

        limit = options.get("limit") or 20
        qs = GoogleFormSubmission.objects.all().order_by("-mail_req_no")[:limit]
        if not qs:
            self.stdout.write("No GoogleFormSubmission rows found.")
            return
        for row in qs:
            self.stdout.write(f"mail_req_no={row.mail_req_no} id={row.pk} status={row.mail_status} submitted_at={row.submitted_at}")
