import os
import sys
import django
ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), '..'))
if ROOT not in sys.path:
    sys.path.insert(0, ROOT)
os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'backend.settings')
django.setup()
from api.domain_cash_register import FeeType

# Current front-end keys (as used in src/report/CashDailyFeesReport.jsx)
frontend_keys = ['SVF','PDF','MIGRA','CORR','ENROL','PGREG','RECHECK','DEGREE','EXAM','THESIS','LIB','PEC','MSW','PHD','UNIDEV','OTHER','EXT','KYA']

def norm(s):
    return (s or '').upper().replace(' ', '').replace('/', '').replace('-', '')

db_codes = [ft.code for ft in FeeType.objects.all()]
print('DB codes (raw):')
for c in db_codes:
    print(' ', repr(c))

print('\nDB codes normalized:')
for c in db_codes:
    print(' ', c, '=>', norm(c))

print('\nFrontend keys normalized:')
for k in frontend_keys:
    print(' ', k, '=>', norm(k))

# Attempt matching
matches = {}
unmatched = []
for c in db_codes:
    n = norm(c)
    found = None
    for k in frontend_keys:
        if n == norm(k) or n.startswith(norm(k)) or norm(k).startswith(n):
            found = k
            break
    if found:
        matches[c] = found
    else:
        unmatched.append(c)

print('\nMatches (db_code -> frontend_key):')
for k,v in matches.items():
    print(' ', k, '->', v)

print('\nUnmatched DB codes (will go to OTHER):')
for c in unmatched:
    print(' ', c)

print('\nCounts: DB codes:', len(db_codes), 'matches:', len(matches), 'unmatched:', len(unmatched))
