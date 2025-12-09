"""
Run this script to raise warnings as errors and import Django apps to get a traceback
showing where a DB access during import is happening.
Run: python backend\scripts\find_db_import_culprit.py
"""
import os
import sys
from pathlib import Path
import warnings

# Ensure project root is on sys.path so the 'backend' package is importable
proj_root = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(proj_root))
os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'backend.settings')
# Turn Django DB-access warnings into errors so we get a traceback
warnings.simplefilter('error', RuntimeWarning)

try:
    import django
    django.setup()
    print('Django setup finished without raising the DB-access warning as error.')
except Exception as e:
    import traceback
    print('ERROR: Exception raised during django.setup()')
    traceback.print_exc()
    raise
