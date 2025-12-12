from django.core.management.base import BaseCommand, CommandError

class Command(BaseCommand):
    help = 'Activate a leave period by id (computes carryforward and allocations)'

    def add_arguments(self, parser):
        parser.add_argument('period_id', type=int, help='ID of the LeavePeriod to activate')

    def handle(self, *args, **options):
        pid = options['period_id']
        try:
            # Import lazily so missing optional `leave_activation` module
            # doesn't break normal runtime. If it's absent, inform the user.
            from ...leave_activation import activate_period
        except Exception as e:
            raise CommandError(f'Activation module not available: {e}')

        try:
            summary = activate_period(pid)
            self.stdout.write(self.style.SUCCESS(f'Activation complete: {summary}'))
        except Exception as e:
            raise CommandError(f'Activation failed: {e}')
