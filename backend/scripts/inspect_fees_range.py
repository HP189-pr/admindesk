import os
import django
import json

os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'backend.settings')
import sys
sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), '..')))

django.setup()
from django.test import Client
from django.contrib.auth import get_user_model

c = Client()
User = get_user_model()
# try to use a staff user
u = User.objects.filter(is_staff=True).first() or User.objects.filter(is_superuser=True).first()
if not u:
    print('No staff user found; exiting')
    sys.exit(1)

c.force_login(u)
resp = c.get('/api/receipts/fees-aggregate/', {'date_from': '2025-04-15', 'date_to': '2025-04-30'})
print('STATUS:', resp.status_code)
try:
    data = resp.json()
except Exception as e:
    print('Failed to parse JSON:', e)
    print(resp.content)
    sys.exit(1)

print('keys:', list(data.keys()))
print('total_amount:', data.get('total_amount'))
receipts = data.get('receipts', [])
print('num receipts:', len(receipts))
for i, r in enumerate(receipts[:5]):
    print('\nRECEIPT', i, 'id', r.get('id'), 'receipt_no_full', r.get('receipt_no_full'))
    items = r.get('items', [])
    print(' items count:', len(items))
    for it in items:
        print('  fee code:', it.get('code'), 'amount:', it.get('amount'))

print('\nfee_totals sample:', data.get('fee_totals')[:10])
