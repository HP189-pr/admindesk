import os, sys, json
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'backend.settings')
import django
django.setup()
from api.domain_letter import InstLetterMain, InstLetterStudent
from api.serializers_Letter import InstLetterMainSerializer, InstLetterStudentSerializer
from django.template.loader import render_to_string
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

DOC = os.environ.get('DOC_REC', 'iv_00_021')
print('Looking up doc_rec:', DOC)
main_qs = InstLetterMain.objects.filter(doc_rec__doc_rec_id=DOC)
if not main_qs.exists():
    print('No InstLetterMain found for doc_rec', DOC)
    sys.exit(0)
for main_obj in main_qs:
    actual_doc_rec = getattr(getattr(main_obj, 'doc_rec', None), 'doc_rec_id', None) or ''
    main_ser = InstVerificationMainSerializer(main_obj).data
    for date_field in ('inst_veri_date','ref_date','doc_rec_date'):
        if date_field in main_ser:
            main_ser[date_field] = fmt_date(main_ser.get(date_field))
        else:
            try:
                val = getattr(main_obj, date_field)
                main_ser[date_field] = fmt_date(val)
            except Exception:
                main_ser[date_field] = ''
    for key in ('rec_inst_sfx_name','rec_inst_name','rec_inst_address_1','rec_inst_address_2','rec_inst_location','rec_inst_city','rec_inst_pin','doc_types','inst_ref_no','rec_by'):
        if main_ser.get(key) is None:
            try:
                main_ser[key] = getattr(main_obj, key) or ''
            except Exception:
                main_ser[key] = ''
    for _k in ('rec_inst_sfx_name','rec_inst_name','rec_inst_address_1','rec_inst_address_2','rec_inst_location','rec_inst_city','rec_inst_pin','rec_inst_email','doc_types','inst_ref_no','rec_by'):
        main_ser[_k] = sanitize_field(main_ser.get(_k))
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
    try:
        rname = main_ser.get('rec_inst_name','')
        if isinstance(rname, str) and rname.strip().isdigit():
            main_ser['rec_inst_name'] = ''
    except Exception:
        pass
    students_qs = InstLetterStudent.objects.filter(doc_rec__doc_rec_id=actual_doc_rec).order_by('id')
    students_ser = InstVerificationStudentSerializer(students_qs, many=True).data
    out = {'doc_rec': DOC, 'actual_doc_rec': actual_doc_rec, 'main': main_ser, 'students_count': len(students_ser), 'students': students_ser}
    print(json.dumps(out, indent=2, default=str))
    # try render template
    try:
        credential_header = ''
        for candidate in students_ser:
            if isinstance(candidate, dict):
                val = candidate.get('type_of_credential')
                if val:
                    credential_header = val
                    break
        if not credential_header:
            credential_header = main_ser.get('type_of_credential') or 'Type of Credential'
        html = render_to_string('pdf_templates/inst_verification_record.html', {
            'main': main_ser,
            'students': students_ser,
            'group_doc_recs': [actual_doc_rec],
            'iv_record_no': main_ser.get('iv_record_no') or '',
            'credential_header': credential_header,
        })
        print('\nRendered HTML length:', len(html))
    except Exception as e:
        import traceback
        print('\nTemplate rendering failed:')
        traceback.print_exc()

print('done')
