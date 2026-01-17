import os
import sys
import django

# Ensure project root is on sys.path so Django settings can be imported
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
if ROOT not in sys.path:
    sys.path.insert(0, ROOT)

os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'backend.settings')
django.setup()
from api.domain_cash_register import FeeType

for ft in FeeType.objects.all().order_by('code'):
    print(repr(ft.code), '->', repr(ft.name))

print('COUNT', FeeType.objects.count())
