import os
import django
import sys
from collections import defaultdict

os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'backend.settings')
sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), '..')))

django.setup()
from django.test import Client
from django.contrib.auth import get_user_model

FEE_COLUMNS = [
  { 'key': 'SVF', 'label': 'SVF' },
  { 'key': 'PDF', 'label': 'PDF' },
  { 'key': 'MIGRA', 'label': 'MIGRA' },
  { 'key': 'CORR', 'label': 'CORR' },
  { 'key': 'ENROL', 'label': 'ENROL' },
  { 'key': 'PG REG', 'label': 'PG REG' },
  { 'key': 'RECHECK', 'label': 'RECHECK' },
  { 'key': 'DEGREE', 'label': 'DEGREE' },
  { 'key': 'EXAM', 'label': 'EXAM FEES' },
  { 'key': 'THESIS', 'label': 'THESIS' },
  { 'key': 'LIB', 'label': 'LIB' },
  { 'key': 'PEC', 'label': 'PEC' },
  { 'key': 'MSW', 'label': 'MSW' },
  { 'key': 'PHD', 'label': 'PHD' },
  { 'key': 'UNI DEV', 'label': 'UNI DEV' },
  { 'key': 'OTHER', 'label': 'OTHER / PHD FORM' },
  { 'key': 'EXT', 'label': 'EXTENSION' },
  { 'key': 'KYA', 'label': 'KYA FEES' },
]

c = Client()
User = get_user_model()
user = User.objects.filter(is_staff=True).first() or User.objects.filter(is_superuser=True).first()
if not user:
    print('No staff user found')
    sys.exit(1)

c.force_login(user)
resp = c.get('/api/receipts/fees-aggregate/', {'date_from': '2025-04-15', 'date_to': '2025-04-30'})
if resp.status_code != 200:
    print('API status', resp.status_code)
    print(resp.content)
    sys.exit(1)

data = resp.json()
receipts = data.get('receipts', [])

# group receipts by date
from datetime import datetime

def normalizeDate(value):
    if not value:
        return None
    if isinstance(value, str):
        try:
            return datetime.fromisoformat(value).date().isoformat()
        except Exception:
            try:
                return datetime.strptime(value, '%Y-%m-%d').date().isoformat()
            except Exception:
                return None
    return None

grouped = defaultdict(list)
for r in receipts:
    d = normalizeDate(r.get('date'))
    grouped[d].append(r)

summary_rows = []
for d in sorted(grouped.keys()):
    entries = grouped[d]
    summary = { 'DATE': d, 'TOTAL': 0, 'REC_START': None, 'REC_END': None, 'DEPOSIT_BANK': 0, 'DAY_CLOSING': 0 }
    for cdef in FEE_COLUMNS:
        summary[cdef['key']] = 0
    seqs = []
    for rec in entries:
        items = rec.get('items') or []
        for it in items:
            code = (it.get('code') or it.get('fee_type') or it.get('name') or '').upper()
            try:
                amt = float(str(it.get('amount') or '0'))
            except Exception:
                amt = 0.0
            if code and code in summary:
                summary[code] += amt
            elif code:
                summary['OTHER'] = summary.get('OTHER', 0) + amt
            summary['TOTAL'] += amt
        # extract seq
        full = rec.get('receipt_no_full')
        seq = None
        if full:
            import re
            m = re.search(r"(\d{6})$", full)
            if m:
                seq = int(m.group(1))
        seqs.append((seq, full))
    valid = [s for s in seqs if s[0] is not None]
    valid.sort()
    if valid:
        summary['REC_START'] = valid[0][1]
        summary['REC_END'] = valid[-1][1]
    summary['DAY_CLOSING'] = summary['TOTAL']
    summary_rows.append(summary)

import json
print(json.dumps(summary_rows[:10], indent=2))
print('TOTAL_SUM:', sum(r['TOTAL'] for r in summary_rows))
