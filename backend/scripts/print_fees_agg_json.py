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
resp = c.get('/api/receipts/fees-aggregate/', {'date_from': '2025-04-15', 'date_to': '2025-04-17'})
print('STATUS', resp.status_code)
print(json.dumps(resp.json(), indent=2))
