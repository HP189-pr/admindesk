import os, sys
import argparse

# Ensure project root is in path
BASE = os.path.dirname(__file__)
sys.path.insert(0, os.path.dirname(BASE))

os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'backend.settings')
import django
django.setup()

import pandas as pd
import re
from api.models import DocRec, Enrollment, Institute, MainBranch, SubBranch
from django.utils import timezone

parser = argparse.ArgumentParser(description='Diagnose Migration Excel for upload readiness')
parser.add_argument('file', help='Path to excel file')
parser.add_argument('--sheet', help='Sheet name (optional)')
parser.add_argument('--out', help='Output CSV path', default=os.path.join(BASE, 'migration_diagnostic.csv'))
args = parser.parse_args()

fpath = args.file
if not os.path.exists(fpath):
    print('File not found:', fpath)
    sys.exit(2)

# Read first sheet or specified
try:
    if args.sheet:
        df = pd.read_excel(fpath, sheet_name=args.sheet)
    else:
        dfs = pd.read_excel(fpath, sheet_name=None)
        # pick first sheet
        first = next(iter(dfs.keys()))
        df = dfs[first]
except Exception as e:
    print('Failed to read file:', e)
    sys.exit(3)

# canonical mapping (same as server)
def _canonical(colname):
    if colname is None:
        return None
    s = str(colname).strip().lower()
    s2 = ''.join(ch for ch in s if ch.isalnum() or ch.isspace()).strip()
    s2 = ' '.join(s2.split())
    mapping = {
        'key': 'enrollment_no',
        'enrollment': 'enrollment_no',
        'enrollment no': 'enrollment_no',
        'enrollment_no': 'enrollment_no',
        'docrec': 'doc_rec_id',
        'doc rec': 'doc_rec_id',
        'doc_rec_id': 'doc_rec_id',
        'institute': 'institute_id',
        'institute id': 'institute_id',
        'institute_id': 'institute_id',
        'main': 'maincourse_id',
        'maincourse': 'maincourse_id',
        'main course': 'maincourse_id',
        'maincourse id': 'maincourse_id',
        'sub': 'subcourse_id',
        'subcourse': 'subcourse_id',
        'sub course': 'subcourse_id',
        'subcourse id': 'subcourse_id',
        'mg number': 'mg_number',
        'mg_number': 'mg_number',
        'mg_date': 'mg_date',
        'mg date': 'mg_date',
        'student name': 'student_name',
        'student_name': 'student_name',
        'pay rec no': 'pay_rec_no',
        'pay_rec_no': 'pay_rec_no',
        'exam year': 'exam_year',
        'exam_year': 'exam_year',
        'admission year': 'admission_year',
        'admission_year': 'admission_year',
    }
    return mapping.get(s2, None)

# rename df columns
rename_map = {}
for c in list(df.columns):
    canon = _canonical(c)
    if canon and canon != c:
        if canon not in df.columns:
            rename_map[c] = canon
if rename_map:
    df = df.rename(columns=rename_map)

# fill NaN with None
df = df.where(pd.notnull(df), None)

results = []

def _clean_cell(val):
    if val is None:
        return None
    s = str(val).strip()
    if s == '':
        return None
    if s.lower() in ('nan', 'none', '<na>'):
        return None
    return s

for idx, row in df.iterrows():
    rownum = int(idx)
    key = _clean_cell(row.get('enrollment_no') or row.get('key') or row.get('mg_number'))
    messages = []
    ok = True

    # doc_rec
    doc_rec_id_raw = _clean_cell(row.get('doc_rec_id'))
    doc_rec = None
    if doc_rec_id_raw:
        k = str(doc_rec_id_raw).strip()
        doc_rec = DocRec.objects.filter(doc_rec_id=k).first() or DocRec.objects.filter(doc_rec_id__iexact=k).first()
        if not doc_rec:
            # normalized check
            norm = re.sub(r'[^0-9A-Za-z]', '', k).lower()
            if norm:
                for dr in DocRec.objects.all()[:20000]:
                    try:
                        if re.sub(r'[^0-9A-Za-z]', '', str(dr.doc_rec_id)).lower() == norm:
                            doc_rec = dr
                            break
                    except Exception:
                        continue
    if not doc_rec:
        messages.append('missing_doc_rec')
        ok = False

    # enrollment
    enr_key = _clean_cell(row.get('enrollment_no'))
    enr = None
    if enr_key:
        k = str(enr_key).strip()
        enr = Enrollment.objects.filter(enrollment_no=k).first() or Enrollment.objects.filter(enrollment_no__iexact=k).first()
        if not enr:
            norm = ''.join(k.split()).lower()
            try:
                from django.db.models import Value
                from django.db.models.functions import Replace, Lower
                enr = (Enrollment.objects
                       .annotate(_norm=Replace(Lower('enrollment_no'), Value(' '), Value('')))
                       .filter(_norm=norm)
                       .first())
            except Exception:
                enr = None
    if not enr:
        messages.append('missing_enrollment')
        ok = False

    # institute/main/sub fallback
    inst_key = _clean_cell(row.get('institute_id'))
    main_key = _clean_cell(row.get('maincourse_id'))
    sub_key = _clean_cell(row.get('subcourse_id'))
    inst = Institute.objects.filter(institute_id=str(inst_key)).first() if inst_key else None
    main = MainBranch.objects.filter(maincourse_id=str(main_key)).first() if main_key else None
    sub = SubBranch.objects.filter(subcourse_id=str(sub_key)).first() if sub_key else None
    if enr:
        try:
            if not inst and getattr(enr, 'institute', None):
                inst = enr.institute
            if not main and getattr(enr, 'maincourse', None):
                main = enr.maincourse
            if not sub and getattr(enr, 'subcourse', None):
                sub = enr.subcourse
        except Exception:
            pass
    if not (inst and main and sub):
        messages.append('missing_institute_sub_main')
        ok = False

    # mg_status and mg_date
    mg_status_raw = _clean_cell(row.get('mg_status')) or ''
    mg_status = str(mg_status_raw).strip().upper() if mg_status_raw is not None else ''
    if mg_status == '':
        mg_status = 'ISSUED'
    is_cancel = (mg_status == 'CANCEL')
    mg_date = None
    if 'mg_date' in df.columns:
        raw = row.get('mg_date')
        if raw is None:
            mg_date = None
        else:
            # try parse
            try:
                if hasattr(raw, 'date'):
                    mg_date = raw.date()
                else:
                    mg_date = pd.to_datetime(raw, errors='coerce')
                    if pd.isna(mg_date):
                        mg_date = None
                    else:
                        mg_date = mg_date.date()
            except Exception:
                mg_date = None
        if (not is_cancel) and mg_date is None:
            messages.append('missing_mg_date')
            ok = False

    # exam_year/admission_year/pay_rec_no checks
    missing_required = []
    if not is_cancel:
        # exam_year
        if 'exam_year' in df.columns and _clean_cell(row.get('exam_year')) is None:
            missing_required.append('exam_year')
        if 'admission_year' in df.columns and _clean_cell(row.get('admission_year')) is None:
            missing_required.append('admission_year')
        # pay_rec_no: prefer sheet then doc_rec
        pr = _clean_cell(row.get('pay_rec_no'))
        if not pr and doc_rec is not None:
            pr = getattr(doc_rec, 'pay_rec_no', None)
        if 'pay_rec_no' in df.columns and pr is None:
            missing_required.append('pay_rec_no')
    if missing_required:
        messages.append({'missing_required': missing_required})
        ok = False

    results.append({
        'row': rownum,
        'key': key,
        'ok': ok,
        'messages': ';'.join([m if isinstance(m, str) else str(m) for m in messages])
    })

# write results
out = pd.DataFrame(results)
out.to_csv(args.out, index=False)
print('Wrote diagnostic to', args.out)
print(out.head(30).to_string())
