import os,sys
proj_root = os.path.abspath(os.path.join(os.path.dirname(__file__), '..'))
if proj_root not in sys.path:
    sys.path.insert(0, proj_root)
os.environ.setdefault('DJANGO_SETTINGS_MODULE','backend.settings')
import django
django.setup()
from django.db import connection
print('\nDB tables (sorted):')
tbls = sorted(connection.introspection.table_names())
for t in tbls:
    print(t)
print('\nTotal tables:', len(tbls))
