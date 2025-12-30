#!/usr/bin/env python
"""
Check data integrity in cash register
"""
import os
import sys
import django

os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'backend.settings')
sys.path.insert(0, 'e:/admindesk/backend')
django.setup()

from api.models import Receipt, ReceiptItem
from datetime import datetime, timedelta
from django.db.models import Q

# Check last 5 receipt items
entries = ReceiptItem.objects.select_related('receipt', 'fee_type').all().order_by('-created_at')[:5]
print("=" * 100)
print("LAST 5 ENTRIES IN DATABASE")
print("=" * 100)
for e in entries:
    print(f"ID: {e.id} | DATE: {e.receipt.date} | REC: {e.receipt.receipt_no_full} | FEE: {e.fee_type.code if e.fee_type else 'N/A'} | AMOUNT: {e.amount} (type: {type(e.amount).__name__})")

# Check entries for April 15 (both 2025 and 2028)
print("\n" + "=" * 100)
print("ENTRIES FOR 15-APRIL (checking both years)")
print("=" * 100)
entries_apr15_2025 = ReceiptItem.objects.filter(receipt__date='2025-04-15')
entries_apr15_2028 = ReceiptItem.objects.filter(receipt__date='2028-04-15')
entries_apr15_both = ReceiptItem.objects.filter(receipt__date__startswith='2025-04-15') | ReceiptItem.objects.filter(receipt__date__startswith='2028-04-15')

print(f"\n15-April-2025: {entries_apr15_2025.count()} entries")
for e in entries_apr15_2025[:10]:
    print(f"  {e.receipt.date} | {e.receipt.receipt_no_full} | {e.fee_type.code if e.fee_type else 'N/A'}: {e.amount}")

print(f"\n15-April-2028: {entries_apr15_2028.count()} entries")
for e in entries_apr15_2028[:10]:
    print(f"  {e.receipt.date} | {e.receipt.receipt_no_full} | {e.fee_type.code if e.fee_type else 'N/A'}: {e.amount}")

# Check receipt C01/25/R000082
print("\n" + "=" * 100)
print("ENTRIES FOR RECEIPT C01/25/R000082")
print("=" * 100)
receipt_entries = ReceiptItem.objects.filter(receipt__receipt_no_full__icontains='000082')
print(f"Total entries with '000082': {receipt_entries.count()}")
for e in receipt_entries:
    print(f"  DATE: {e.receipt.date} | REC: {e.receipt.receipt_no_full} | FEE: {e.fee_type.code if e.fee_type else 'N/A'} | AMOUNT: {e.amount}")

# Calculate total for this receipt
total = sum(float(e.amount or 0) for e in receipt_entries)
print(f"\nTOTAL for receipt: {total}")

# Show total count and date range
print("\n" + "=" * 100)
print("OVERALL DATA STATS")
print("=" * 100)
# Total receipt items
total_entries = ReceiptItem.objects.count()
print(f"Total receipt items in database: {total_entries}")

# Get date range
# Date range from receipts
min_date = Receipt.objects.values_list('date', flat=True).order_by('date').first()
max_date = Receipt.objects.values_list('date', flat=True).order_by('-date').first()
print(f"Date range: {min_date} to {max_date}")

# Check for invalid dates (year 2028 seems wrong)
entries_2028 = Receipt.objects.filter(date__startswith='2028')
print(f"\nReceipts with year 2028: {entries_2028.count()}")

if entries_2028.count() > 0:
    print("Sample 2028 dates:")
    for e in entries_2028[:5]:
        print(f"  {e.date} | {e.receipt_no_full}")
