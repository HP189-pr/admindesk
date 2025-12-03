"""
Management command to manually process queued transcript syncs.
"""
from django.core.management.base import BaseCommand
from api.sheet_sync_queue import _sync_queue


class Command(BaseCommand):
    help = 'Process any queued transcript request syncs to Google Sheets'

    def add_arguments(self, parser):
        parser.add_argument(
            '--status',
            action='store_true',
            help='Show queue status only',
        )

    def handle(self, *args, **options):
        if options['status']:
            queue_size = _sync_queue.queue.qsize()
            writes_in_last_minute = len(_sync_queue.write_timestamps)
            is_running = _sync_queue.running
            
            self.stdout.write(self.style.SUCCESS(f"Queue status:"))
            self.stdout.write(f"  Running: {is_running}")
            self.stdout.write(f"  Queued items: {queue_size}")
            self.stdout.write(f"  Writes in last minute: {writes_in_last_minute}/{_sync_queue.max_writes_per_minute}")
        else:
            queue_size = _sync_queue.queue.qsize()
            self.stdout.write(f"Processing {queue_size} queued syncs...")
            
            # Worker thread will process automatically
            if not _sync_queue.running:
                from api.sheet_sync_queue import start_sync_worker
                start_sync_worker()
                self.stdout.write(self.style.SUCCESS("Started sync worker"))
            
            self.stdout.write(self.style.SUCCESS("Worker is processing queue"))
