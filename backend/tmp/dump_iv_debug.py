import os, sys, json
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'backend.settings')
import django
django.setup()
from api.domain_letter import InstLetterMain, InstLetterStudent
from api.serializers_Letter import InstLetterMainSerializer, InstLetterStudentSerializer
import re

def fmt_date(v):
    try:
        if not v:
            return ''
        if isinstance(v, str):
            return v
        return v.strftime('%d-%m-%Y')
    except Exception:
        return str(v) if v is not None else ''

def sanitize_field(val):
    try:
        if val is None:
            return ''
        if isinstance(val, (list, tuple)):
            return '' if len(val) == 0 else str(val)
        s = str(val).strip()
        if not s:
            return ''
        if re.fullmatch(r"^\[\s*\]$", s):
            return ''
        s2 = re.sub(r'^\[\s*|\s*\]$', '', s)
        if re.fullmatch(r'\d+', s2):
            return ''
        if s2.strip().lower() in ('nan','none','null','n/a'):
            return ''
        if re.fullmatch(r'\[?\s*\]?$', s):
            return ''
        return s2
    except Exception:
        return ''

iv = int(os.environ.get('IV', '25002'))
results = []
qs = InstLetterMain.objects.filter(iv_record_no=iv)
for main_obj in qs:
    actual_doc_rec = getattr(getattr(main_obj, 'doc_rec', None), 'doc_rec_id', None) or ''
    main_ser = InstVerificationMainSerializer(main_obj).data
    # format date fields
    for date_field in ('inst_veri_date','ref_date','doc_rec_date'):
        if date_field in main_ser:
            main_ser[date_field] = fmt_date(main_ser.get(date_field))
        else:
            try:
                val = getattr(main_obj, date_field)
                main_ser[date_field] = fmt_date(val)
            except Exception:
                main_ser[date_field] = ''
    # ensure keys
    for key in ('rec_inst_sfx_name','rec_inst_name','rec_inst_address_1','rec_inst_address_2','rec_inst_location','rec_inst_city','rec_inst_pin','doc_types','inst_ref_no','rec_by'):
        if main_ser.get(key) is None:
            try:
                main_ser[key] = getattr(main_obj, key) or ''
            except Exception:
                main_ser[key] = ''
    # sanitize
    for _k in ('rec_inst_sfx_name','rec_inst_name','rec_inst_address_1','rec_inst_address_2','rec_inst_location','rec_inst_city','rec_inst_pin','rec_inst_email','doc_types','inst_ref_no','rec_by'):
        main_ser[_k] = sanitize_field(main_ser.get(_k))
    # institute fallback
    try:
        inst_obj = getattr(main_obj, 'institute', None)
        if inst_obj:
            rec_name = main_ser.get('rec_inst_name') or ''
            if rec_name == '' or str(rec_name).strip().isdigit() or (str(getattr(inst_obj, 'institute_id','')) == str(rec_name).strip()):
                main_ser['rec_inst_name'] = getattr(inst_obj, 'institute_name','') or main_ser.get('rec_inst_name','')
            if not main_ser.get('rec_inst_address_1'):
                main_ser['rec_inst_address_1'] = (getattr(inst_obj, 'institute_address','') or '').split('\n')[0]
            if not main_ser.get('rec_inst_city'):
                main_ser['rec_inst_city'] = getattr(inst_obj, 'institute_city','') or ''
            if not main_ser.get('rec_inst_sfx_name'):
                main_ser['rec_inst_sfx_name'] = getattr(inst_obj, 'institute_campus','') or ''
    except Exception:
        pass
    # hide numeric-only rec_inst_name
    try:
        rname = main_ser.get('rec_inst_name','')
        if isinstance(rname, str) and rname.strip().isdigit():
            main_ser['rec_inst_name'] = ''
    except Exception:
        pass
    students_qs = InstLetterStudent.objects.filter(doc_rec=getattr(main_obj, 'doc_rec', None)).order_by('id')
    students_ser = InstVerificationStudentSerializer(students_qs, many=True).data
    results.append({
        'requested': str(iv),
        'doc_rec': actual_doc_rec,
        'found': True,
        'actual_doc_rec': actual_doc_rec,
        'main': main_ser,
        'students': students_ser,
        'students_count': len(students_ser),
    })

if not results:
    results.append({'requested': str(iv), 'doc_rec': None, 'found': False, 'attempts': [str(iv)], 'students': []})

print(json.dumps({'debug': True, 'results': results}, indent=2))
