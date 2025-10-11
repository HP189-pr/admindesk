from django.core.management.base import BaseCommand
from api.domain_emp import LeavePeriod, LeaveAllocation, LeaveType, EmpProfile
from django.db import transaction


class Command(BaseCommand):
    help = 'Seed LeaveAllocation rows for the active leave period using LeaveType.annual_allocation'

    def add_arguments(self, parser):
        parser.add_argument('--period-id', type=int, help='Specific LeavePeriod id to seed. Defaults to active period')
        parser.add_argument('--dry-run', action='store_true', help='Do not write to DB; just report')

    def handle(self, *args, **options):
        period_id = options.get('period_id')
        dry = options.get('dry_run')

        if period_id:
            period = LeavePeriod.objects.filter(id=period_id).first()
            if not period:
                self.stderr.write(self.style.ERROR(f'LeavePeriod id={period_id} not found'))
                return
        else:
            period = LeavePeriod.objects.filter(is_active=True).first()
            if not period:
                self.stderr.write(self.style.ERROR('No active LeavePeriod found'))
                return

        leave_types = list(LeaveType.objects.filter(is_active=True))
        emps = list(EmpProfile.objects.all())

        created = 0
        skipped = 0
        self.stdout.write(f'Seeding allocations for period {period} — {len(emps)} employees, {len(leave_types)} leave types')

        for emp in emps:
            for lt in leave_types:
                alloc_value = lt.annual_allocation if lt.annual_allocation is not None else 0
                exists = LeaveAllocation.objects.filter(profile=emp, leave_type=lt, period=period).exists()
                if exists:
                    skipped += 1
                    continue
                if dry:
                    created += 1
                    continue
                with transaction.atomic():
                    LeaveAllocation.objects.create(profile=emp, leave_type=lt, period=period, allocated=alloc_value)
                    created += 1

        self.stdout.write(self.style.SUCCESS(f'Done. created={created}, skipped={skipped}'))
