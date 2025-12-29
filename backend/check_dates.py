import os
import django
os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'backend.settings')
django.setup()

from api.models import CashRegister
from django.db.models import Sum

# Check entries for April 15, 2025
entries_apr15_2025 = CashRegister.objects.filter(date='2025-04-15')
print("=" * 100)
print(f"ENTRIES FOR 15-APRIL-2025: {entries_apr15_2025.count()} entries")
print("=" * 100)
for e in entries_apr15_2025:
    print(f"DATE: {e.date} | REC: {e.receipt_no_full} | FEE: {e.fee_type.code if e.fee_type else 'N/A'} | AMOUNT: {e.amount}")

total_2025 = entries_apr15_2025.aggregate(Sum('amount'))['amount__sum'] or 0
print(f"\nTOTAL for 15-April-2025: {total_2025}")

# Check entries for April 15, 2028
entries_apr15_2028 = CashRegister.objects.filter(date='2028-04-15')
print("\n" + "=" * 100)
print(f"ENTRIES FOR 15-APRIL-2028: {entries_apr15_2028.count()} entries")
print("=" * 100)
for e in entries_apr15_2028:
    print(f"DATE: {e.date} | REC: {e.receipt_no_full} | FEE: {e.fee_type.code if e.fee_type else 'N/A'} | AMOUNT: {e.amount}")

# Check receipt C01/25/R000082
print("\n" + "=" * 100)
print("ENTRIES FOR RECEIPT C01/25/R000082")
print("=" * 100)
receipt_entries = CashRegister.objects.filter(receipt_no_full__icontains='000082')
print(f"Total entries: {receipt_entries.count()}")
for e in receipt_entries:
    print(f"DATE: {e.date} | REC: {e.receipt_no_full} | FEE: {e.fee_type.code if e.fee_type else 'N/A'} | AMOUNT: {e.amount}")

total_receipt = receipt_entries.aggregate(Sum('amount'))['amount__sum'] or 0
print(f"\nTOTAL for receipt: {total_receipt}")

# Show overall stats
print("\n" + "=" * 100)
print("DATABASE STATS")
print("=" * 100)
total_all = CashRegister.objects.count()
print(f"Total entries: {total_all}")

# Sample entries
print("\nLast 10 entries:")
for e in CashRegister.objects.all().order_by('-id')[:10]:
    print(f"  {e.date} | {e.receipt_no_full} | {e.fee_type.code if e.fee_type else 'N/A'}: {e.amount}")
