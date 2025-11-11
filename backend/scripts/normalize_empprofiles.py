#!/usr/bin/env python
"""Normalize EmpProfile rows:
- Convert any datetime-ish values saved into date fields to date-only
- Normalize emp_short values that look like floats (e.g. '17.0') to ints

Run from repo root:
    python backend/scripts/normalize_empprofiles.py
"""
import os
import sys
from datetime import datetime, date

# set DJANGO_SETTINGS_MODULE same as manage.py
os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'backend.settings')

import django
# ensure repo root is on sys.path so Django project package is importable
SCRIPT_DIR = os.path.dirname(os.path.abspath(__file__))
# The Django project package (with settings.py) lives under e:/admindesk/backend/backend
# so ensure the parent 'backend' directory is on sys.path so importlib finds backend.settings
DJANGO_PROJECT_DIR = os.path.abspath(os.path.join(SCRIPT_DIR, '..'))
if DJANGO_PROJECT_DIR not in sys.path:
    sys.path.insert(0, DJANGO_PROJECT_DIR)

django.setup()


from api.domain_emp import EmpProfile


def parse_date_like(v):
    if v is None:
        return None
    if isinstance(v, date) and not isinstance(v, datetime):
        return v
    if isinstance(v, datetime):
        return v.date()
    if isinstance(v, str):
        s = v.strip()
        if not s:
            return None
        # try common formats
        fmts = ["%Y-%m-%d %H:%M:%S", "%Y-%m-%dT%H:%M:%S", "%Y-%m-%d", "%d-%m-%Y %H:%M:%S", "%d-%m-%Y"]
        for f in fmts:
            try:
                dt = datetime.strptime(s, f)
                return dt.date()
            except Exception:
                continue
        # fallback: try ISO parse
        try:
            dt = datetime.fromisoformat(s)
            return dt.date()
        except Exception:
            return None
    return None


def normalize():
    qs = EmpProfile.objects.all()
    total = qs.count()
    print(f"Found {total} EmpProfile rows to check")
    changed = 0
    for p in qs:
        updated = False
        # date fields to normalize
        for fld in ('actual_joining','emp_birth_date','usr_birth_date','leave_calculation_date','left_date'):
            orig = getattr(p, fld)
            parsed = parse_date_like(orig)
            if parsed and orig != parsed:
                setattr(p, fld, parsed)
                updated = True
        # emp_short normalization: cast float-like to int
        emp_short = getattr(p, 'emp_short', None)
        if emp_short is not None:
            try:
                if isinstance(emp_short, float):
                    if emp_short.is_integer():
                        setattr(p, 'emp_short', int(emp_short))
                        updated = True
                elif isinstance(emp_short, str):
                    s = emp_short.strip()
                    if s and '.' in s:
                        try:
                            f = float(s)
                            if f.is_integer():
                                setattr(p, 'emp_short', int(f))
                                updated = True
                        except Exception:
                            pass
            except Exception:
                pass
        if updated:
            try:
                p.save()
                changed += 1
            except Exception as e:
                print(f"Failed to save {p.emp_id}: {e}")
    print(f"Normalization complete. {changed} records updated.")


if __name__ == '__main__':
    normalize()
