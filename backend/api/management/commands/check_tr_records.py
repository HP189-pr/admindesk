from django.core.management.base import BaseCommand
import json

class Command(BaseCommand):
    help = 'Check transcript_request rows by tr_request_no and print details'

    def add_arguments(self, parser):
        parser.add_argument('--numbers', nargs='+', type=int, help='TR numbers to check')

    def handle(self, *args, **options):
        nums = options.get('numbers') or []
        from api.domain_transcript_generate import TranscriptRequest
        qs = TranscriptRequest.objects.filter(tr_request_no__in=nums)
        self.stdout.write(f'COUNT: {qs.count()}')
        rows = list(qs.values('id', 'tr_request_no', 'request_ref_no', 'mail_status', 'raw_row'))
        self.stdout.write(json.dumps(rows, default=str, indent=2))
