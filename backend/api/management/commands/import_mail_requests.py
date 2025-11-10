"""Management command to pull Google Form mail requests into the local DB."""

from __future__ import annotations

import logging
import os
from datetime import datetime
from pathlib import Path
from typing import Any, Dict, Iterable, Iterator, List, Tuple

import gspread
from django.conf import settings
from django.core.management.base import BaseCommand, CommandError
from django.db import transaction
from django.utils import timezone

from api.domain_mail_request import GoogleFormSubmission

logger = logging.getLogger(__name__)


FIELD_ALIASES: Dict[str, Tuple[str, ...]] = {
    "submitted_at": (
        "Timestamp",
        "timestamp",
        "Submitted",
        "Submission Time",
        "Submission Timestamp",
    ),
    "enrollment_no": (
        "Enrollment No",
        "enrollment_no",
        "Enrollment",
        "Enrollment Number",
    ),
    "student_name": (
        "Student Name",
        "student_name",
        "Full Name",
    ),
    "rec_institute_name": (
        "Institute Name",
        "rec_institute_name",
        "Institution",
    ),
    "rec_official_mail": (
        "Official Mail",
        "rec_official_mail",
        "Official Email",
    ),
    "rec_ref_id": (
        "Ref ID",
        "rec_ref_id",
        "Reference Id",
    ),
    "send_doc_type": (
        "Document Type",
        "send_doc_type",
        "Document",
    ),
    "form_submit_mail": (
        "Form Submit Mail",
        "form_submit_mail",
        "Email",
    ),
    "remark": (
        "remark",
        "remarks",
        "Remarks",
        "Notes",
    ),
    "mail_status": (
        "mail_status",
        "Mail Status",
        "Status",
    ),
}

TIME_FORMATS = (
    "%m/%d/%Y %H:%M:%S",
    "%m/%d/%Y %H:%M",
    "%d/%m/%Y %H:%M:%S",
    "%d/%m/%Y %H:%M",
    "%Y-%m-%d %H:%M:%S",
    "%Y-%m-%d %H:%M",
    "%d-%m-%Y %H:%M:%S",
    "%d-%m-%Y %H:%M",
)

VALID_STATUSES = {
    GoogleFormSubmission.MAIL_STATUS_PENDING,
    GoogleFormSubmission.MAIL_STATUS_PROGRESS,
    GoogleFormSubmission.MAIL_STATUS_DONE,
}


class Command(BaseCommand):
    help = "Import mail request submissions from Google Sheets into GoogleFormSubmission."

    def add_arguments(self, parser) -> None:
        parser.add_argument(
            "--service-account-file",
            dest="service_account_file",
            default=None,
            help="Path to service account JSON. Defaults to GOOGLE_SERVICE_ACCOUNT_FILE or settings.GOOGLE_SERVICE_ACCOUNT_FILE.",
        )
        parser.add_argument(
            "--sheet-url",
            dest="sheet_url",
            default=None,
            help="Full Google Sheet URL or ID. Defaults to GOOGLE_SHEETS_SPREADSHEET_ID.",
        )
        parser.add_argument(
            "--worksheet-title",
            dest="worksheet_title",
            default=None,
            help="Worksheet title. If omitted the first worksheet is used.",
        )
        parser.add_argument(
            "--worksheet-gid",
            dest="worksheet_gid",
            type=int,
            default=None,
            help="Worksheet GID. Takes precedence over the title when provided.",
        )
        parser.add_argument(
            "--batch-size",
            dest="batch_size",
            type=int,
            default=200,
            help="Rows to process per transaction batch (default: 200).",
        )
        parser.add_argument(
            "--dry-run",
            dest="dry_run",
            action="store_true",
            help="Parse the sheet and report changes without writing to the database.",
        )

    def handle(self, *args, **options) -> None:
        sa_file = self._resolve_option(options, "service_account_file", "GOOGLE_SERVICE_ACCOUNT_FILE")
        sheet_url = self._resolve_option(options, "sheet_url", "GOOGLE_SHEETS_SPREADSHEET_ID")
        worksheet_title = options.get("worksheet_title")
        worksheet_gid = options.get("worksheet_gid")
        batch_size = options["batch_size"]
        dry_run = options["dry_run"]

        if not sa_file:
            raise CommandError("Service account file not provided. Use --service-account-file or set GOOGLE_SERVICE_ACCOUNT_FILE.")
        if not sheet_url:
            raise CommandError("Sheet URL or ID not provided. Use --sheet-url or set GOOGLE_SHEETS_SPREADSHEET_ID.")

        client = self._build_client(Path(sa_file))
        worksheet = self._open_worksheet(client, sheet_url, worksheet_title, worksheet_gid)
        raw_rows = worksheet.get_all_records(head=1)
        rows = [
            {**row, "__row_number": index}
            for index, row in enumerate(raw_rows, start=2)
        ]

        if not rows:
            self.stdout.write(self.style.WARNING("No rows found in the worksheet. Nothing to import."))
            return

        self.stdout.write(
            f"Found {len(rows)} rows; starting import{' (dry run)' if dry_run else ''}"
        )

        created_total = 0
        updated_total = 0
        processed = 0

        for chunk in self._chunk(rows, batch_size):
            created, updated = self._sync_batch(chunk, dry_run)
            created_total += created
            updated_total += updated
            processed += len(chunk)
            self.stdout.write(f"Processed {processed}/{len(rows)} rows")

        self.stdout.write(
            self.style.SUCCESS(
                f"Import complete. Created: {created_total}, Updated: {updated_total}{' (dry run)' if dry_run else ''}"
            )
        )

    def _resolve_option(self, options: Dict[str, Any], opt_key: str, env_key: str) -> str | None:
        explicit = options.get(opt_key)
        if explicit:
            return explicit
        if hasattr(settings, env_key):
            value = getattr(settings, env_key)
            if value:
                return str(value)
        value = os.getenv(env_key)
        return str(value) if value else None

    def _build_client(self, sa_path: Path) -> gspread.Client:
        sa_path = sa_path.expanduser()
        if not sa_path.exists():
            raise CommandError(f"Service account file not found: {sa_path}")
        try:
            return gspread.service_account(filename=str(sa_path))
        except Exception as exc:  # pragma: no cover
            raise CommandError(f"Failed to authenticate with Google Sheets: {exc}") from exc

    def _open_worksheet(
        self,
        client: gspread.Client,
        sheet_url: str,
        worksheet_title: str | None,
        worksheet_gid: int | None,
    ) -> gspread.Worksheet:
        try:
            sheet = client.open_by_url(sheet_url)
        except gspread.SpreadsheetNotFound:
            sheet = client.open_by_key(sheet_url)
        except Exception:
            try:
                sheet = client.open_by_key(sheet_url)
            except Exception as exc:  # pragma: no cover
                raise CommandError(f"Unable to open sheet '{sheet_url}': {exc}") from exc

        if worksheet_gid is not None:
            try:
                return sheet.get_worksheet_by_id(worksheet_gid)
            except AttributeError:
                for candidate in sheet.worksheets():
                    if getattr(candidate, "id", None) == worksheet_gid:
                        return candidate
                raise CommandError(f"Worksheet with GID {worksheet_gid} not found.")
            except gspread.WorksheetNotFound as exc:  # pragma: no cover
                raise CommandError(f"Worksheet with GID {worksheet_gid} not found.") from exc

        if worksheet_title:
            try:
                return sheet.worksheet(worksheet_title)
            except gspread.WorksheetNotFound as exc:  # pragma: no cover
                raise CommandError(f"Worksheet '{worksheet_title}' not found.") from exc

        worksheet = sheet.get_worksheet(0)
        if worksheet is None:
            raise CommandError("The sheet does not contain any worksheets.")
        return worksheet

    def _chunk(self, rows: List[Dict[str, Any]], size: int) -> Iterator[List[Dict[str, Any]]]:
        for start in range(0, len(rows), size):
            yield rows[start : start + size]

    def _sync_batch(self, batch: Iterable[Dict[str, Any]], dry_run: bool) -> Tuple[int, int]:
        created = 0
        updated = 0
        skipped: List[str] = []

        with transaction.atomic():
            for row in batch:
                normalized = self._normalize_row(row)
                if normalized is None:
                    skipped.append("timestamp")
                    continue

                submitted_at = normalized.pop("submitted_at")
                enrollment_no = normalized.get("enrollment_no")
                rec_official_mail = normalized.get("rec_official_mail")

                if not enrollment_no and not rec_official_mail:
                    skipped.append("missing identifiers")
                    continue

                lookup: Dict[str, Any] = {"submitted_at": submitted_at}
                if enrollment_no:
                    lookup["enrollment_no"] = enrollment_no
                if rec_official_mail:
                    lookup["rec_official_mail"] = rec_official_mail

                _, was_created = GoogleFormSubmission.objects.update_or_create(
                    defaults=normalized,
                    **lookup,
                )

                if was_created:
                    created += 1
                else:
                    updated += 1

            if dry_run:
                transaction.set_rollback(True)

        if skipped:
            logger.warning("Skipped %s rows during import.", len(skipped))
        return created, updated

    def _normalize_row(self, row: Dict[str, Any]) -> Dict[str, Any] | None:
        submitted_at = self._parse_timestamp(row)
        if submitted_at is None:
            logger.warning("Skipping row without parsable timestamp: %s", row)
            return None

        def pick(field: str) -> str:
            aliases = FIELD_ALIASES.get(field, ())
            for key in aliases:
                value = row.get(key)
                if value is None:
                    continue
                text = str(value).strip()
                if text:
                    return text
            return ""

        mail_status = pick("mail_status").lower()
        if mail_status not in VALID_STATUSES:
            mail_status = GoogleFormSubmission.MAIL_STATUS_PENDING

        normalized: Dict[str, Any] = {
            "submitted_at": submitted_at,
            "enrollment_no": pick("enrollment_no"),
            "student_name": pick("student_name"),
            "rec_institute_name": pick("rec_institute_name"),
            "rec_official_mail": pick("rec_official_mail"),
            "rec_ref_id": pick("rec_ref_id"),
            "send_doc_type": pick("send_doc_type"),
            "form_submit_mail": pick("form_submit_mail"),
            "remark": pick("remark"),
            "mail_status": mail_status,
            "raw_row": self._serialize_raw_row(row),
        }

        return normalized

    def _parse_timestamp(self, row: Dict[str, Any]) -> datetime | None:
        raw = None
        for key in FIELD_ALIASES["submitted_at"]:
            candidate = row.get(key)
            if candidate not in (None, ""):
                raw = candidate
                break

        if raw is None:
            return None

        if isinstance(raw, datetime):
            dt = raw
        else:
            text = str(raw).strip()
            dt = None
            for fmt in TIME_FORMATS:
                try:
                    dt = datetime.strptime(text, fmt)
                    break
                except ValueError:
                    continue
            if dt is None:
                logger.warning("Unable to parse timestamp '%s'", text)
                return None

        if timezone.is_naive(dt):
            dt = timezone.make_aware(dt, timezone.get_current_timezone())
        return dt

    def _serialize_raw_row(self, row: Dict[str, Any]) -> Dict[str, Any]:
        serialized: Dict[str, Any] = {}
        for key, value in row.items():
            if isinstance(value, datetime):
                serialized[key] = value.isoformat()
            else:
                serialized[key] = value
        return serialized
