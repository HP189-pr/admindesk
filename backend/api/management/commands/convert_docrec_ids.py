# Script to convert file-path style doc_rec_id to sequential format (e.g., vr26000001)
# Usage: python manage.py shell < backend/scripts/convert_docrec_ids.py

from django.core.management.base import BaseCommand
from api.domain_documents import DocRec, ApplyFor
from django.db import transaction
import re
from datetime import datetime

class Command(BaseCommand):
    help = "Convert file-path style doc_rec_id to sequential format (e.g., vr26000001)"

    def handle(self, *args, **options):
        def is_file_path(value):
            return bool(re.match(r"^[a-zA-Z]:\\\\|^/|\\\\\\\\|\\.png$|\\.jpg$|\\.jpeg$|\\.pdf$", str(value)))

        def is_old_format(value):
            # Matches vr_20_0106, vr_22_1500, iv_21_0001, etc.
            return bool(re.match(r"^(vr|iv|pr|mg|gt)_\d{2}_\d{4,}$", str(value)))

        def convert_old_format(value):
            # Converts vr_20_0106 -> vr20000106, vr_22_1500 -> vr22001500
            m = re.match(r"^(vr|iv|pr|mg|gt)_(\d{2})_(\d+)$", str(value))
            if m:
                prefix, year, seq = m.groups()
                return f"{prefix}{year}{int(seq):06d}"
            return value

        def get_prefix(apply_for):
            return {
                ApplyFor.VERIFICATION: 'vr',
                ApplyFor.INST_VERIFICATION: 'iv',
                ApplyFor.PROVISIONAL: 'pr',
                ApplyFor.MIGRATION: 'mg',
                ApplyFor.GRADE_TRANS: 'gt',
            }.get(apply_for, 'vr')

        yy = datetime.now().year % 100

        def get_next_seq(prefix, year):
            base = f"{prefix}{year:02d}"
            last = DocRec.objects.filter(doc_rec_id__startswith=base).order_by('-doc_rec_id').first()
            if last and last.doc_rec_id:
                try:
                    return int(last.doc_rec_id[len(base):]) + 1
                except Exception:
                    return 1
            return 1

        from api.domain_verification import Verification, InstVerificationMain, InstVerificationStudent
        with transaction.atomic():
            updated = 0
            for docrec in DocRec.objects.all():
                new_id = None
                old_id = docrec.doc_rec_id
                if is_file_path(old_id):
                    prefix = get_prefix(docrec.apply_for)
                    seq = get_next_seq(prefix, yy)
                    new_id = f"{prefix}{yy:02d}{seq:06d}"
                elif is_old_format(old_id):
                    new_id = convert_old_format(old_id)
                if new_id and new_id != old_id:
                    self.stdout.write(f"Updating {old_id} -> {new_id}")
                    # Update all referencing tables
                    Verification.objects.filter(doc_rec_id=old_id).update(doc_rec_id=new_id)
                    InstVerificationMain.objects.filter(doc_rec_id=old_id).update(doc_rec_id=new_id)
                    InstVerificationStudent.objects.filter(doc_rec_id=old_id).update(doc_rec_id=new_id)
                    docrec.doc_rec_id = new_id
                    docrec.save(update_fields=['doc_rec_id'])
                    updated += 1
            self.stdout.write(self.style.SUCCESS(f"Done. Updated {updated} records."))
