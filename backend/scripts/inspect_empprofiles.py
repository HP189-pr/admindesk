#!/usr/bin/env python
import os, sys
from datetime import datetime, date
SCRIPT_DIR = os.path.dirname(os.path.abspath(__file__))
DJANGO_PROJECT_DIR = os.path.abspath(os.path.join(SCRIPT_DIR, '..'))
if DJANGO_PROJECT_DIR not in sys.path:
    sys.path.insert(0, DJANGO_PROJECT_DIR)
os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'backend.settings')
import django
django.setup()
from api.domain_emp import EmpProfile

for i, p in enumerate(EmpProfile.objects.all()[:10], start=1):
    print(f"Row {i}: emp_id={p.emp_id}")
    for fld in ('el_balance','sl_balance','cl_balance','vacation_balance','actual_joining'):
        val = getattr(p, fld)
        print(f"  {fld}: value={val!r} type={type(val)}")
    print('')
