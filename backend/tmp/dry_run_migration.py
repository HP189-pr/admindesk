import os, sys
import argparse

BASE = os.path.dirname(__file__)
sys.path.insert(0, os.path.dirname(BASE))

os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'backend.settings')
import django
django.setup()

import pandas as pd
import re
from api.models import DocRec, Enrollment, Institute, MainBranch, SubBranch, MigrationRecord

parser = argparse.ArgumentParser(description='Dry-run Migration commit honoring selected columns')
parser.add_argument('file', help='Path to excel file')
parser.add_argument('--selected', nargs='+', help='Selected columns (space-separated)', required=True)
parser.add_argument('--sheet', help='Sheet name (optional)')
parser.add_argument('--out', help='Output CSV path', default=os.path.join(BASE, 'migration_dryrun.csv'))
args = parser.parse_args()

fpath = args.file
selected = [s.strip() for s in args.selected]
if not os.path.exists(fpath):
    print('File not found:', fpath)
    sys.exit(2)

# Read first sheet or specified
try:
    if args.sheet:
        df = pd.read_excel(fpath, sheet_name=args.sheet)
    else:
        dfs = pd.read_excel(fpath, sheet_name=None)
        first = next(iter(dfs.keys()))
        df = dfs[first]
except Exception as e:
    print('Failed to read file:', e)
    sys.exit(3)

# canonical mapping
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
            'prv degree name': 'prv_degree_name',
            'prv_degree_name': 'prv_degree_name',
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

# Canonicalize selected columns too (user may have used original names)
selected_canon = []
for s in selected:
    c = _canonical(s) or s
    # if canonical name exists in df, use it; else try exact/case-insensitive
    if c in df.columns:
        selected_canon.append(c)
    elif s in df.columns:
        selected_canon.append(s)
    else:
        # case-insensitive
        found = None
        for col in df.columns:
            try:
                if str(col).strip().lower() == s.strip().lower():
                    found = col; break
            except Exception:
                continue
        if found:
            selected_canon.append(found)
        else:
            # still include the canonical name even if missing; this indicates omission
            selected_canon.append(c)

# Subset df to only selected columns + force keys (same rules as server)
force_keys = ['enrollment_no', 'doc_rec_id', 'prv_number', 'mg_number', 'final_no']
keep = []
for c in selected_canon:
    if c in df.columns and c not in keep:
        keep.append(c)
for k in force_keys:
    if k in df.columns and k not in keep:
        keep.append(k)
if keep:
    df = df.loc[:, [c for c in keep if c in df.columns]]

# Normalize NaN to None
import numpy as np
for col in df.columns:
    df[col] = df[col].where(~pd.isna(df[col]), None)

results = []

def _clean_cell(v):
    if v is None:
        return None
    s = str(v).strip()
    if s == '' or s.lower() in ('nan','none','<na>'):
        return None
    return s


def _is_valid_passing_year(raw):
    """Return True if raw represents a valid passing-year (month/year or parseable date)."""
    if raw is None:
        return False
    s = str(raw).strip()
    if s == '' or s.lower() in ('nan','none','<na>'):
        return False
    try:
        import pandas as _pd
        # If it's numeric (Excel serial), treat as valid by converting
        if isinstance(raw, (int, float)):
            if float(raw) > 1000:
                return True
        parsed = _pd.to_datetime(s, errors='coerce', dayfirst=True)
        if not _pd.isna(parsed):
            return True
    except Exception:
        pass
    import re
    # match 'Jul-16', 'Apr-2010', 'Jul 2016'
    if re.match(r'^[A-Za-z]{3,9}[-/ ]\d{2,4}$', s):
        return True
    if re.match(r'^\d{4}$', s):
        return True
    return False


def _normalize_month_year(val):
    """Return formatted 'MON-YYYY' (e.g., 'JUN-2016') for date-like or Excel serial values, else None."""
    if val is None:
        return None
    try:
        import pandas as _pd
    except Exception:
        _pd = None
    try:
        # numeric Excel serial
        if isinstance(val, (int, float)):
            try:
                if _pd is not None:
                    parsed = _pd.to_datetime(val, unit='D', origin='1899-12-30')
                    if not _pd.isna(parsed):
                        return parsed.to_pydatetime().strftime('%b-%Y').upper()
                else:
                    import datetime as _dt
                    base = _dt.datetime(1899, 12, 30)
                    parsed = base + _dt.timedelta(days=int(val))
                    return parsed.strftime('%b-%Y').upper()
            except Exception:
                pass
        # pandas Timestamp or datetime
        import datetime as _dt
        if _pd is not None and isinstance(val, _pd.Timestamp):
            dt = val.to_pydatetime()
            return dt.strftime('%b-%Y').upper()
        if isinstance(val, (_dt.date, _dt.datetime)):
            return val.strftime('%b-%Y').upper()
        s = str(val).strip()
        if s == '' or s.lower() in ('nan','none','<na>'):
            return None
        if _pd is not None:
            try:
                parsed = _pd.to_datetime(s, errors='coerce', dayfirst=True)
                if not _pd.isna(parsed):
                    return parsed.to_pydatetime().strftime('%b-%Y').upper()
            except Exception:
                pass
        # regex fallback
        import re
        m = re.search(r'([A-Za-z]{3,9})[\s\-_/]*(\d{2,4})', s)
        if m:
            mon = m.group(1)[:3].upper()
            yr = m.group(2)
            if len(yr) == 2:
                yy = int(yr)
                yr = f"{2000+yy:04d}"
            return f"{mon}-{yr}"
    except Exception:
        pass
    return None

for idx, row in df.iterrows():
    idx = int(idx)
    key = _clean_cell(row.get('enrollment_no') or row.get('key') or row.get('mg_number'))
    msgs = []
    ok = True

    # doc_rec
    doc_rec_id_raw = _clean_cell(row.get('doc_rec_id'))
    doc_rec = None
    if doc_rec_id_raw:
        k = str(doc_rec_id_raw).strip()
        doc_rec = DocRec.objects.filter(doc_rec_id=k).first() or DocRec.objects.filter(doc_rec_id__iexact=k).first()
        if not doc_rec:
            norm = re.sub(r'[^0-9A-Za-z]','',k).lower()
            if norm:
                for dr in DocRec.objects.all()[:20000]:
                    try:
                        if re.sub(r'[^0-9A-Za-z]','',str(dr.doc_rec_id)).lower() == norm:
                            doc_rec = dr; break
                    except Exception:
                        continue
    if not doc_rec:
        msgs.append('missing_doc_rec')
        ok = False

    # enrollment
    enr = None
    enr_key = _clean_cell(row.get('enrollment_no'))
    if enr_key:
        k = str(enr_key).strip()
        enr = Enrollment.objects.filter(enrollment_no=k).first() or Enrollment.objects.filter(enrollment_no__iexact=k).first()
        if not enr:
            norm = ''.join(k.split()).lower()
            try:
                from django.db.models import Value
                from django.db.models.functions import Replace, Lower
                enr = (Enrollment.objects.annotate(_norm=Replace(Lower('enrollment_no'), Value(' '), Value(''))).filter(_norm=norm).first())
            except Exception:
                enr = None
    # determine mg_status/is_cancel early so CANCEL rows can be treated specially
    mg_status_raw = _clean_cell(row.get('mg_status')) or ''
    mg_status = str(mg_status_raw).strip().upper() if mg_status_raw is not None else ''
    if mg_status == '':
        mg_status = 'ISSUED'
    is_cancel = (mg_status == 'CANCEL')

# enrollment required only if enrollment_no in selected_canon and not a CANCEL row
    if (not is_cancel) and ('enrollment_no' in selected_canon) and not enr:
        msgs.append('missing_enrollment')
        ok = False

    # institute/main/sub
    inst_key = _clean_cell(row.get('institute_id'))
    main_key = _clean_cell(row.get('maincourse_id'))
    sub_key = _clean_cell(row.get('subcourse_id'))
    inst = Institute.objects.filter(institute_id=str(inst_key)).first() if inst_key else None
    main = MainBranch.objects.filter(maincourse_id=str(main_key)).first() if main_key else None
    sub = SubBranch.objects.filter(subcourse_id=str(sub_key)).first() if sub_key else None
    if enr:
        try:
            if not inst and getattr(enr,'institute',None): inst = enr.institute
            if not main and getattr(enr,'maincourse',None): main = enr.maincourse
            if not sub and getattr(enr,'subcourse',None): sub = enr.subcourse
        except Exception:
            pass
    # require institute/main/sub only for non-CANCEL rows if selected OR enrollment absent
    if not is_cancel:
        if not inst and (('institute_id' in selected_canon) or (not enr)):
            msgs.append('missing_institute')
            ok = False
        if not main and (('maincourse_id' in selected_canon) or (not enr)):
            msgs.append('missing_main')
            ok = False
        if not sub and (('subcourse_id' in selected_canon) or (not enr)):
            msgs.append('missing_sub')
            ok = False

    # mg_status and mg_date required only if mg_date in selected_canon
    mg_status_raw = _clean_cell(row.get('mg_status')) or ''
    mg_status = str(mg_status_raw).strip().upper() if mg_status_raw is not None else ''
    if mg_status == '': mg_status = 'ISSUED'
    is_cancel = (mg_status == 'CANCEL')
    if (not is_cancel) and 'mg_date' in selected_canon:
        raw = row.get('mg_date')
        mg_date = None
        if raw is not None:
            try:
                if hasattr(raw,'date'): mg_date = raw.date()
                else:
                    mg_date = pd.to_datetime(raw, errors='coerce')
                    if pd.isna(mg_date): mg_date = None
                    else: mg_date = mg_date.date()
            except Exception:
                mg_date = None
        if (not is_cancel) and mg_date is None:
            msgs.append('missing_mg_date')
            ok = False

    # exam_year/admission_year/pay_rec_no required only if selected
    missing_required = []
    if not is_cancel:
        if 'exam_year' in selected_canon and _clean_cell(row.get('exam_year')) is None:
            missing_required.append('exam_year')
        if 'admission_year' in selected_canon and _clean_cell(row.get('admission_year')) is None:
            missing_required.append('admission_year')
        # passing_year: accept month-year formats like 'Apr-2010' or 'Jul-16'
        if 'passing_year' in selected_canon and not _is_valid_passing_year(row.get('passing_year')):
            missing_required.append('passing_year')
        pr = _clean_cell(row.get('pay_rec_no'))
        if not pr and doc_rec is not None:
            pr = getattr(doc_rec,'pay_rec_no',None)
        if 'pay_rec_no' in selected_canon and pr is None:
            missing_required.append('pay_rec_no')
    if missing_required:
        msgs.append({'missing_required': missing_required})
        ok = False

    # include normalized passing_year in result for visibility
    py_raw = row.get('passing_year') if 'passing_year' in row.index else None
    py_norm = _normalize_month_year(py_raw)
    # normalize prv_number display (strip .0 for integer floats)
    prv_raw = row.get('prv_number') if 'prv_number' in row.index else None
    prv_display = None
    try:
        if prv_raw is None:
            prv_display = None
        else:
            if isinstance(prv_raw, float) and float(prv_raw).is_integer():
                prv_display = str(int(prv_raw))
            elif isinstance(prv_raw, int):
                prv_display = str(prv_raw)
            else:
                s = str(prv_raw).strip()
                if s.replace('.', '', 1).isdigit():
                    f = float(s)
                    prv_display = str(int(f)) if f.is_integer() else s
                else:
                    prv_display = s
    except Exception:
        prv_display = str(prv_raw)

    results.append({'row': idx, 'key': key, 'ok': ok, 'prv_number': prv_display, 'passing_year_raw': (str(py_raw) if py_raw is not None else None), 'passing_year': py_norm, 'messages': ';'.join([m if isinstance(m,str) else str(m) for m in msgs])})

out = pd.DataFrame(results)
out.to_csv(args.out, index=False)
print('Wrote dry-run to', args.out)
print(out.head(30).to_string())
