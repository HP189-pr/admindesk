import os
import django

# Ensure project root is on sys.path so `import backend.settings` works
import sys
sys.path.append(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'backend.settings')
django.setup()

from api.domain_emp import LeaveBalanceSnapshot

try:
    exists = LeaveBalanceSnapshot.objects.exists()
    print('OK', exists)
except Exception as e:
    print('ERROR', type(e).__name__, e)
