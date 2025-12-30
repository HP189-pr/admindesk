import os
import sys

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
if ROOT not in sys.path:
    sys.path.insert(0, ROOT)

os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'backend.settings')
import django
django.setup()

from django.test import Client
from django.contrib.auth import get_user_model

User = get_user_model()
user, _ = User.objects.get_or_create(username='admintest', defaults={'is_staff': True, 'is_superuser': True, 'email': 'test@example.com'})
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
        if isinstance(data, dict):
            print('receipts_count:', len(data.get('receipts') or []))
            print('fee_totals_count:', len(data.get('fee_totals') or []))
            print('total_amount:', data.get('total_amount'))
        else:
            print('resp_type:', type(data))
    except Exception:
        print('RAW:', r.content[:1000])

if __name__ == '__main__':
    # check specific date 15-Apr-2025
    call('/api/receipts/fees-aggregate/?date_from=2025-04-15&date_to=2025-04-15')
