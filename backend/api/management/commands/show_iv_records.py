from django.core.management.base import BaseCommand
from api.domain_verification import InstVerificationMain

class Command(BaseCommand):
    help = 'Show InstVerificationMain rows for given ids or show first N rows'

    def add_arguments(self, parser):
        parser.add_argument('ids', nargs='*', type=int, help='IDs to show (optional)')
        parser.add_argument('--first', type=int, default=0, help='Show first N rows if no ids specified')

    def handle(self, *args, **options):
        ids = options.get('ids') or []
        first = options.get('first') or 0
        if ids:
            qs = InstVerificationMain.objects.filter(id__in=ids).order_by('id')
        elif first>0:
            qs = InstVerificationMain.objects.all().order_by('id')[:first]
        else:
            qs = InstVerificationMain.objects.all().order_by('id')[:50]
        for m in qs:
            self.stdout.write(f'{m.id}\t{m.inst_veri_number!r}\t{m.iv_record_no}')
