import os
import sys
import django
import json

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), '..'))
if ROOT not in sys.path:
    sys.path.insert(0, ROOT)

os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'backend.settings')
django.setup()
from django.test import Client
from django.contrib.auth import get_user_model

c = Client()
User = get_user_model()
user = User.objects.filter(is_staff=True).first() or User.objects.filter(is_superuser=True).first()
if not user:
    print('No staff user found')
    sys.exit(1)

c.force_login(user)
from_date = '2025-11-30'
to_date = '2025-12-30'
print('Requesting fees-aggregate', from_date, to_date)
resp = c.get('/api/receipts/fees-aggregate/', {'date_from': from_date, 'date_to': to_date})
print('STATUS', resp.status_code)
if resp.status_code != 200:
    print(resp.content)
    sys.exit(1)

data = resp.json()
print('\nFEE_TOTALS:')
for f in data.get('fee_totals', []):
    print(' ', f['code'], f['name'], f['amount'])

print('\nTOTAL_AMOUNT:', data.get('total_amount'))

# condensed per-day totals
receipts = data.get('receipts', [])
from collections import defaultdict
per_day = defaultdict(float)
for r in receipts:
    d = r.get('date')
    for it in r.get('items', []):
        try:
            per_day[d] += float(it.get('amount') or 0)
        except Exception:
            pass

print('\nPer-day totals (sample up to 20 days):')
for i, (d, amt) in enumerate(sorted(per_day.items())):
    if i >= 20:
        break
    print(' ', d, amt)

print('\nNum receipts:', len(receipts))
print('Done')
