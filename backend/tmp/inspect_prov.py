import sys, os, pandas as pd, re

path = sys.argv[1] if len(sys.argv) > 1 else None
if not path or not os.path.exists(path):
    print('File not found:', path)
    sys.exit(2)

# canonical mapping (same rules as dry_run_migration)
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

try:
    dfs = pd.read_excel(path, sheet_name=None)
    first_sheet = next(iter(dfs.keys()))
    df = dfs[first_sheet]
except Exception as e:
    print('Failed to read Excel:', e)
    sys.exit(3)

# Rename columns
rename = {}
for c in list(df.columns):
    canon = _canonical(c)
    if canon and canon != c:
        if canon not in df.columns:
            rename[c] = canon
if rename:
    df = df.rename(columns=rename)

# Build canonical column list as importer would
force_keys = ['enrollment_no', 'doc_rec_id', 'prv_number', 'mg_number', 'final_no']
cols = []
for c in df.columns:
    cols.append(c)
for k in force_keys:
    if k in df.columns and k not in cols:
        cols.append(k)

print('Detected sheet:', first_sheet)
print('Canonical columns detected (first 50):')
print(cols[:50])

print('\nFirst 10 rows (values shown as string or <NULL>):')
for i, row in df.iterrows():
    if i >= 10:
        break
    out = {}
    for c in cols:
        try:
            v = row.get(c) if c in row.index else None
        except Exception:
            v = None
        if pd.isna(v):
            v = None

        # Format passing_year specially to convert Excel serials / dates to 'MON-YYYY'
        if c == 'passing_year' and v is not None:
            try:
                norm = None
                if isinstance(v, (int, float)):
                    try:
                        parsed = pd.to_datetime(v, unit='D', origin='1899-12-30')
                        if not pd.isna(parsed):
                            norm = parsed.to_pydatetime().strftime('%b-%Y').upper()
                    except Exception:
                        norm = None
                elif isinstance(v, pd.Timestamp):
                    try:
                        parsed = pd.to_datetime(v, errors='coerce')
                        if not pd.isna(parsed):
                            norm = parsed.to_pydatetime().strftime('%b-%Y').upper()
                    except Exception:
                        norm = None
                else:
                    s = str(v).strip()
                    if s:
                        try:
                            parsed = pd.to_datetime(s, errors='coerce', dayfirst=True)
                            if not pd.isna(parsed):
                                norm = parsed.to_pydatetime().strftime('%b-%Y').upper()
                        except Exception:
                            norm = None
                out[c] = (norm if norm is not None else str(v))
            except Exception:
                out[c] = str(v)

        # Format numeric 'number' fields without unnecessary decimals (e.g., 2650.0 -> 2650)
        elif c.endswith('_number') and v is not None:
            try:
                if isinstance(v, float) and v.is_integer():
                    out[c] = str(int(v))
                elif isinstance(v, int):
                    out[c] = str(v)
                else:
                    sv = str(v).strip()
                    if sv.replace('.', '', 1).isdigit():
                        fv = float(sv)
                        out[c] = (str(int(fv)) if fv.is_integer() else sv)
                    else:
                        out[c] = sv
            except Exception:
                out[c] = str(v)
        else:
            out[c] = (str(v) if v is not None else '<NULL>')
    print(f'Row {i}:', out)

print('\nYou can re-run with additional file path argument to inspect another file.')
