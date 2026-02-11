from django.core.management.base import BaseCommand
from django.db import transaction
from api.domain_letter import InstLetterMain

class Command(BaseCommand):
    help = 'Backfill iv_record_no on InstVerificationMain (compute from inst_veri_number)'

    def handle(self, *args, **options):
        qs = InstVerificationMain.objects.all()
        total = qs.count()
        self.stdout.write(f'Found {total} InstVerificationMain rows')

        to_update = []
        for m in qs:
            try:
                iv = InstLetterMain.compute_iv_record_no_from_inst_veri(m.inst_veri_number)
                if iv is not None and iv != m.iv_record_no:
                    m.iv_record_no = iv
                    to_update.append(m)
            except Exception as e:
                # best-effort; continue
                self.stderr.write(f'Error computing for id={m.id}: {e}')

        if not to_update:
            self.stdout.write('No rows to update')
            # print a few examples
            samples = InstLetterMain.objects.all()[:10]
            for s in samples:
                self.stdout.write(f'{s.id}\t{s.inst_veri_number!r}\t{s.iv_record_no}')
            return

        BATCH = 500
        updated = 0
        for i in range(0, len(to_update), BATCH):
            chunk = to_update[i:i+BATCH]
            with transaction.atomic():
                InstLetterMain.objects.bulk_update(chunk, ['iv_record_no'])
            updated += len(chunk)
            self.stdout.write(f'Updated batch {i}-{i+len(chunk)-1} ({len(chunk)} rows)')

        self.stdout.write(f'Total updated rows: {updated}')
        # show some sample updated rows
        samples = InstLetterMain.objects.filter(iv_record_no__isnull=False).order_by('-id')[:10]
        self.stdout.write('Sample rows after update:')
        for s in samples:
            self.stdout.write(f'{s.id}\t{s.inst_veri_number!r}\t{s.iv_record_no}')
