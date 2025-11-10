import json, re
from api.models import InstVerificationMain, InstVerificationStudent
from api.serializers import InstVerificationMainSerializer, InstVerificationStudentSerializer

def _fmt_date(v):
    try:
        if not v:
            return ''
        if isinstance(v, str):
            return v
        return v.strftime('%d-%m-%Y')
    except Exception:
        return str(v) if v is not None else ''

def _sanitize_template_field(val):
    try:
        if val is None:
            return ''
        if isinstance(val, (list, tuple, set)):
            cleaned = []
            for item in val:
                item_clean = _sanitize_template_field(item)
                if item_clean:
                    cleaned.append(item_clean)
            if not cleaned:
                return ''
            return ', '.join(dict.fromkeys(cleaned))
        s = str(val).strip()
        if not s:
            return ''
        if re.fullmatch(r"^\[\s*\]$", s):
            return ''
        inner = re.sub(r'^\[\s*|\s*\]$', '', s).strip()
        inner = re.sub(r'^\[\s*|\s*\]$', '', inner).strip()
        if not inner:
            return ''
        if re.fullmatch(r'\d+\.\d+', inner):
            inner = inner.rstrip('0').rstrip('.')
        if re.fullmatch(r'\d+', inner) and len(inner) <= 2:
            return ''
        if inner.lower() in ('nan', 'none', 'null', 'n/a'):
            return ''
        if re.fullmatch(r'\[?\s*\]?$', s):
            return ''
        return inner
    except Exception:
        return ''

results = []
dr = '25001'
if re.fullmatch(r"\d+", dr):
    iv_int = int(dr)
    mains_qs = InstVerificationMain.objects.filter(iv_record_no=iv_int)
    for main_obj in mains_qs:
        main_ser = InstVerificationMainSerializer(main_obj).data
        for date_field in ('inst_veri_date', 'ref_date', 'doc_rec_date'):
            if date_field in main_ser:
                main_ser[date_field] = _fmt_date(main_ser.get(date_field))
            else:
                try:
                    val = getattr(main_obj, date_field)
                    main_ser[date_field] = _fmt_date(val)
                except Exception:
                    main_ser[date_field] = ''
        for key in ('rec_inst_sfx_name','rec_inst_name','rec_inst_address_1','rec_inst_address_2','rec_inst_location','rec_inst_city','rec_inst_pin','doc_types','inst_ref_no','rec_by'):
            if main_ser.get(key) is None:
                try:
                    main_ser[key] = getattr(main_obj, key) or ''
                except Exception:
                    main_ser[key] = ''
        for _k in ('rec_inst_sfx_name','rec_inst_name','rec_inst_address_1','rec_inst_address_2','rec_inst_location','rec_inst_city','rec_inst_pin','rec_inst_email','doc_types','inst_ref_no','rec_by'):
            main_ser[_k] = _sanitize_template_field(main_ser.get(_k))
        actual_doc_rec = getattr(getattr(main_obj, 'doc_rec', None), 'doc_rec_id', None) or dr
        students_qs = InstVerificationStudent.objects.filter(doc_rec__doc_rec_id=actual_doc_rec).order_by('id')
        students_ser = InstVerificationStudentSerializer(students_qs, many=True).data
        results.append({'doc_rec': dr, 'found': True, 'actual_doc_rec': actual_doc_rec, 'main': main_ser, 'students_count': len(students_ser)})

print(json.dumps({'debug': True, 'results': results}, indent=2, default=str))
