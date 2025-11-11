import os
os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'backend.settings')
import django
try:
    django.setup()
    import api.urls
    print('imported api.urls OK')
except Exception as e:
    import traceback
    print('IMPORT ERROR:', e)
    traceback.print_exc()
