import os, sys
from pathlib import Path
BASE = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(BASE))

os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'backend.settings')
import django
django.setup()

import importlib
u = importlib.import_module('api.urls')
print('module', u)
try:
    for p in getattr(u, 'urlpatterns', []):
        try:
            print('PATTERN', getattr(p, 'pattern', p), getattr(p, 'name', None))
        except Exception:
            print('PATTERN', p)
except Exception as e:
    import traceback
    traceback.print_exc()
