"""
Re-import Excel data for CashRegister with support for multiple fees per receipt
"""
import os
import sys
import django
import pandas as pd
from datetime import datetime

os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'backend.settings')
django.setup()

from api.models import Receipt, ReceiptItem, FeeType
from api.cash_register import ReceiptNumberService
from django.db import transaction
from django.contrib.auth.models import User

# List of FEE column names in your Excel
FEE_COLUMNS = [
    'SVF', 'PDF', 'MIGRA', 'CORRECTION', 'ENROLMENT', 'PG REG',
    'RECHECKING/REASS', 'DEGREE', 'EXAM FEES', 'THESIS', 'LIB', 'PEC',
    'MSW', 'PHD', 'UNI DEV', 'Other / phd Form', 'EXTENSION', 'KYA FEES'
]

# Map Excel column names to FeeType codes
COLUMN_TO_FEETYPE = {
    'SVF': 'SVF',
    'PDF': 'PDF',
    'MIGRA': 'MIGRA',
    'CORRECTION': 'CORR',
    'ENROLMENT': 'ENROL',
    'PG REG': 'PGREG',
    'RECHECKING/REASS': 'RECHECK',
    'DEGREE': 'DEGREE',
    'EXAM FEES': 'EXAM',
    'THESIS': 'THESIS',
    'LIB': 'LIB',
    'PEC': 'PEC',
    'MSW': 'MSW',
    'PHD': 'PHD',
    'UNI DEV': 'UNIDEV',
    'Other / phd Form': 'OTHER',
    'EXTENSION': 'EXT',
    'KYA FEES': 'KYA'
}

def parse_date(date_val):
    """Parse date from Excel"""
    if isinstance(date_val, str):
        # Try multiple formats
        for fmt in ['%d-%b-%Y', '%d-%m-%Y', '%Y-%m-%d', '%d/%m/%Y']:
            try:
                return datetime.strptime(date_val, fmt).date()
            except:
                continue
        return None
    elif isinstance(date_val, datetime):
        return date_val.date()
    elif hasattr(date_val, 'date'):
        return date_val.date()
    return None

def import_excel_data(excel_path):
    """Import Excel file with support for multiple fees per receipt"""
    print(f"Loading Excel file: {excel_path}")
    df = pd.read_excel(excel_path)
    
    print(f"Found {len(df)} rows in Excel")
    print(f"Columns: {list(df.columns)}")
    
    created_count = 0
    skipped_count = 0
    admin_user = User.objects.filter(is_superuser=True).first() or User.objects.filter(is_staff=True).first()
    
    with transaction.atomic():
        for idx, row in df.iterrows():
            date_val = parse_date(row.get('DATE'))
            if not date_val:
                print(f"Row {idx+2}: Skipping - invalid date '{row.get('DATE')}'")
                skipped_count += 1
                continue
            
            payment_mode = str(row.get('Payment Mode', 'CASH')).upper().strip()
            if payment_mode not in ['CASH', 'BANK', 'UPI']:
                payment_mode = 'CASH'
            
            rec_ref = str(row.get('Rec Ref', '')).strip()
            rec_no_str = str(row.get('Rec No', '')).strip()
            
            try:
                rec_no = int(rec_no_str) if rec_no_str else None
            except:
                rec_no = None
            
            receipt_no_full = str(row.get('Receipt No', '')).strip()
            
            # Check if entry already exists for this receipt
            if receipt_no_full:
                existing = Receipt.objects.filter(receipt_no_full=receipt_no_full).exists()
                if existing:
                    print(f"Row {idx+2}: Skipping - receipt {receipt_no_full} already exists")
                    skipped_count += 1
                    continue
            
            # Process each fee column and create a Receipt header + ReceiptItems
            fee_created_for_row = False
            header = None
            for excel_col, fee_code in COLUMN_TO_FEETYPE.items():
                # Find column in Excel (case-insensitive)
                fee_col = None
                for col in df.columns:
                    if col.strip().lower() == excel_col.lower():
                        fee_col = col
                        break
                
                if fee_col is None:
                    continue
                
                amount = row.get(fee_col)
                if amount is None or (isinstance(amount, float) and amount == 0):
                    continue
                
                try:
                    amount = float(amount)
                    if amount <= 0:
                        continue
                except (ValueError, TypeError):
                    print(f"Row {idx+2}: Invalid amount '{amount}' for {fee_code}")
                    continue
                
                # Get FeeType
                try:
                    fee_type = FeeType.objects.get(code=fee_code)
                except FeeType.DoesNotExist:
                    print(f"Row {idx+2}: FeeType '{fee_code}' not found in database")
                    continue
                
                try:
                    # Ensure header exists for this row
                    if header is None:
                        # If a full receipt string was present, try to parse or else allocate new numbers
                        if receipt_no_full:
                            header = Receipt.objects.filter(receipt_no_full=receipt_no_full).first()
                        if not header:
                            numbers = ReceiptNumberService.next_numbers(payment_mode, date_val, lock=True)
                            header = Receipt.objects.create(
                                date=date_val,
                                payment_mode=payment_mode,
                                rec_ref=numbers["rec_ref"],
                                rec_no=numbers["rec_no"],
                                receipt_no_full=numbers["receipt_no_full"],
                                total_amount=0,
                                remark="Imported from Excel",
                                created_by=admin_user,
                            )
                    # Create a ReceiptItem for this fee
                    ReceiptItem.objects.create(receipt=header, fee_type=fee_type, amount=amount, remark="Imported from Excel")
                    fee_created_for_row = True
                    print(f"Row {idx+2}: Created receipt {header.receipt_no_full} + {fee_code} = {amount}")
                except Exception as e:
                    print(f"Row {idx+2}: Error creating entry for {fee_code}: {e}")
            
            if header and fee_created_for_row:
                # Update total on header
                try:
                    total = ReceiptItem.objects.filter(receipt=header).aggregate(total_amount=models.Sum('amount'))['total_amount'] or 0
                    header.total_amount = total
                    header.save()
                    created_count += 1
                except Exception:
                    pass
            else:
                skipped_count += 1
    
    print(f"\n{'='*60}")
    print(f"Import complete:")
    print(f"  Created: {created_count} entries")
    print(f"  Skipped: {skipped_count} rows")
    print(f"{'='*60}")

if __name__ == '__main__':
    import sys
    if len(sys.argv) < 2:
        print("Usage: python import_excel_cashregister.py <path_to_excel>")
        print("\nExample:")
        print("  python import_excel_cashregister.py '/path/to/data.xlsx'")
        sys.exit(1)
    
    excel_file = sys.argv[1]
    if not os.path.exists(excel_file):
        print(f"Error: File not found: {excel_file}")
        sys.exit(1)
    
    import_excel_data(excel_file)
