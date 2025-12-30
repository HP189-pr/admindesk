import os
import sys

# Ensure project root on path
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
if ROOT not in sys.path:
    sys.path.insert(0, ROOT)

os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'backend.settings')
import django
django.setup()

from django.test import Client
from django.contrib.auth import get_user_model

User = get_user_model()
user, created = User.objects.get_or_create(username='admintest', defaults={'is_staff': True, 'is_superuser': True, 'email': 'test@example.com'})
if created:
    user.set_password('password')
    user.save()

client = Client()
client.force_login(user)

def call(path):
    r = client.get(path)
    print('PATH:', path)
    print('STATUS:', r.status_code)
    try:
        data = r.json()
        print('JSON keys:', list(data.keys()) if isinstance(data, dict) else type(data))
        if isinstance(data, dict):
            print('receipts:', len(data.get('receipts') or []))
            print('fee_totals:', len(data.get('fee_totals') or []))
            print('total_amount:', data.get('total_amount'))
    except Exception:
        print('RAW:', r.content[:1000])


if __name__ == '__main__':
    # call without filters
    call('/api/receipts/fees-aggregate/')
    # with date range (small sample)
    call('/api/receipts/fees-aggregate/?date_from=2025-01-01&date_to=2025-12-31')
    # check flattened endpoint
    call('/api/receipts/flattened/')
