"""Normalize IV doc_rec_id values to the new format.

Transforms legacy Institutional Verification doc_rec_id strings like
- "iv_23_001"
- "IV_23_0005"
- "iv25000411"

into canonical uppercase format "IVYY####" (2-digit year + min 4-digit
sequence, padding grows if the sequence already uses more digits).

References in inst_verification_main and inst_verification_student are
updated alongside doc_rec so referential integrity stays intact.

Usage:
    python manage.py normalize_iv_docrec_ids          # dry run
    python manage.py normalize_iv_docrec_ids --apply  # commit changes
"""

from collections import namedtuple
import re

from django.core.management.base import BaseCommand
from django.db import connection, transaction

from api.domain_documents import ApplyFor, DocRec
from api.domain_letter import InstLetterMain, InstLetterStudent


UpdatePlan = namedtuple("UpdatePlan", ["docrec_pk", "old_id", "new_id"])


class Command(BaseCommand):
    help = "Normalize IV doc_rec_id values to IVYY#### (uppercase, min 4-digit sequence)."

    def add_arguments(self, parser):
        parser.add_argument(
            "--apply",
            action="store_true",
            help="Apply the updates. Without this flag, a dry-run summary is shown.",
        )

    @staticmethod
    def _parse_iv_parts(value):
        """Extract (year, seq) from any iv-style identifier.

        Accepts variants with underscores, mixed case, or extra zeros.
        Returns (year_2_digits, seq_str) or None when unparsable.
        """

        if not value:
            return None

        text = str(value).strip()

        # Common legacy forms: iv_23_001, IV_23_0005, iv25000411
        m = re.search(r"(?i)^iv[^0-9]*([0-9]{2})[^0-9]*([0-9]+)$", text)
        if m:
            return m.group(1), m.group(2)

        # Fallback: grab leading 2 digits as year, rest as sequence if available
        digits = re.sub(r"\D", "", text)
        if len(digits) >= 3:
            return digits[:2], digits[2:]

        return None

    @staticmethod
    def _canonical_iv(year_two_digits: str, seq: int) -> str:
        """Return canonical IV identifier using at least 4 digits for the sequence."""

        pad_len = max(4, len(str(seq)))
        return f"IV{year_two_digits}{seq:0{pad_len}d}"

    def handle(self, *args, **options):
        apply = options.get("apply", False)

        qs = DocRec.objects.filter(apply_for=ApplyFor.INST_VERIFICATION)
        existing_ids = set(DocRec.objects.values_list("doc_rec_id", flat=True))

        updates: list[UpdatePlan] = []

        for dr in qs:
            parsed = self._parse_iv_parts(dr.doc_rec_id)
            if not parsed:
                continue

            year, seq_raw = parsed
            try:
                seq_int = max(1, int(seq_raw))
            except ValueError:
                continue

            new_id = self._canonical_iv(year, seq_int)

            # Avoid collisions with existing doc_rec_id values
            while new_id in existing_ids and new_id != dr.doc_rec_id:
                seq_int += 1
                new_id = self._canonical_iv(year, seq_int)

            if new_id == dr.doc_rec_id:
                continue

            updates.append(UpdatePlan(dr.pk, dr.doc_rec_id, new_id))
            existing_ids.add(new_id)

        if not updates:
            self.stdout.write(self.style.SUCCESS("No IV doc_rec_id changes needed."))
            return

        self.stdout.write(f"Planned updates: {len(updates)}")
        for plan in updates[:10]:
            self.stdout.write(f" - {plan.old_id} -> {plan.new_id}")
        if len(updates) > 10:
            self.stdout.write(f" (and {len(updates) - 10} more...) ")

        if not apply:
            self.stdout.write("Dry run only. Re-run with --apply to commit.")
            return

        with transaction.atomic():
            # Defer constraints so we can update FK references in one transaction
            with connection.cursor() as cursor:
                cursor.execute("SET CONSTRAINTS ALL DEFERRED")

            for plan in updates:
                InstLetterMain.objects.filter(doc_rec_id=plan.old_id).update(doc_rec_id=plan.new_id)
                InstLetterStudent.objects.filter(doc_rec_id=plan.old_id).update(doc_rec_id=plan.new_id)
                DocRec.objects.filter(pk=plan.docrec_pk).update(doc_rec_id=plan.new_id)

        self.stdout.write(self.style.SUCCESS(f"Updated {len(updates)} IV doc_rec_id values."))