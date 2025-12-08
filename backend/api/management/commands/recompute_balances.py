from django.core.management.base import BaseCommand
from api.domain_leave_balance import compute_and_persist_leave_balances


class Command(BaseCommand):
    help = 'Recompute leave balances for a specific period'

    def add_arguments(self, parser):
        parser.add_argument('period_id', type=int, help='Period ID to recompute')

    def handle(self, *args, **options):
        period_id = options['period_id']
        self.stdout.write(f'Recomputing leave balances for period {period_id}...')
        
        result = compute_and_persist_leave_balances(period_id=period_id)
        
        emp_count = len(result.get('employees', []))
        self.stdout.write(self.style.SUCCESS(f'Done! Processed {emp_count} employees'))
        
        # Show employee 17 if exists
        emp17 = [e for e in result.get('employees', []) if e.get('emp_id') == '17']
        if emp17:
            self.stdout.write('\nEmployee 17 (HITENDRA PATEL):')
            for period in emp17[0].get('periods', []):
                self.stdout.write(f"  Allocated: CL={period.get('allocated_cl')}, SL={period.get('allocated_sl')}, EL={period.get('allocated_el')}")
