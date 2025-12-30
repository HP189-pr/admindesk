import os
import sys

# Ensure project root (one level up from this scripts dir) is on sys.path
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
if ROOT not in sys.path:
	sys.path.insert(0, ROOT)

os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'backend.settings')
import django
django.setup()
from api.domain_cash_register import Receipt, ReceiptItem

print('Receipts', Receipt.objects.count())
print('Items', ReceiptItem.objects.count())
