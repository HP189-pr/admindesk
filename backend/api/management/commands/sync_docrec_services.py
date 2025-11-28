from django.core.management.base import BaseCommand
from django.utils import timezone

from api.models import DocRec, Verification, InstVerificationMain


class Command(BaseCommand):
    help = 'Scan DocRec rows and create missing service rows (Verification/InstVerification) where possible.'

    def add_arguments(self, parser):
        parser.add_argument('--service', type=str, default='ALL', help='Service to sync: VR, IV, ALL')

    def handle(self, *args, **options):
        svc = (options.get('service') or 'ALL').upper()
        total = 0
        created = 0

        qs = DocRec.objects.all()
        if svc == 'VR':
            qs = qs.filter(doc_rec_id__istartswith='vr')
        elif svc == 'IV':
            qs = qs.filter(doc_rec_id__istartswith='iv')
        elif svc == 'ALL':
            qs = qs.filter(doc_rec_id__iregex=r'^(vr|iv)')
        else:
            self.stdout.write(self.style.ERROR(f'Unknown service: {svc}'))
            return

        for dr in qs.order_by('id'):
            total += 1
            docid = dr.doc_rec_id
            try:
                if docid.lower().startswith('vr'):
                    exists = Verification.objects.filter(doc_rec__doc_rec_id=docid).exists()
                    if not exists:
                        vr = Verification(
                            enrollment=None,
                            student_name='')
                        vr.doc_rec = dr
                        vr.status = 'IN_PROGRESS'
                        try:
                            vr.full_clean()
                        except Exception:
                            pass
                        vr.save()
                        created += 1
                        self.stdout.write(self.style.SUCCESS(f'Created Verification for {docid}'))
                elif docid.lower().startswith('iv'):
                    exists = InstVerificationMain.objects.filter(doc_rec__doc_rec_id=docid).exists()
                    if not exists:
                        iv = InstVerificationMain(doc_rec=dr)
                        try:
                            iv.full_clean()
                        except Exception:
                            pass
                        iv.save()
                        created += 1
                        self.stdout.write(self.style.SUCCESS(f'Created InstVerificationMain for {docid}'))
            except Exception as e:
                self.stdout.write(self.style.WARNING(f'Failed for {docid}: {e}'))

        self.stdout.write(self.style.NOTICE(f'Scanned {total} DocRec rows; created {created} service rows.'))
