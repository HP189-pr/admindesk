import json, re, os
from django.conf import settings
from django.template.loader import render_to_string
try:
    import pdfkit
except Exception:
    pdfkit = None

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


def build_group_html(iv_record_no_str):
    results = []
    dr = iv_record_no_str
    if re.fullmatch(r"\d+", dr):
        iv_int = int(dr)
        mains_qs = InstVerificationMain.objects.filter(iv_record_no=iv_int)
        groups = {}
        pages = []
        for main_obj in mains_qs:
            actual_doc_rec = getattr(getattr(main_obj, 'doc_rec', None), 'doc_rec_id', None) or ''
            main_ser = InstVerificationMainSerializer(main_obj).data
            for date_field in ('inst_veri_date', 'ref_date', 'doc_rec_date'):
                main_ser[date_field] = _fmt_date(main_ser.get(date_field)) if date_field in main_ser else _fmt_date(getattr(main_obj, date_field, ''))
            for key in ('rec_inst_sfx_name','rec_inst_name','rec_inst_address_1','rec_inst_address_2','rec_inst_location','rec_inst_city','rec_inst_pin','doc_types','inst_ref_no','rec_by'):
                if main_ser.get(key) is None:
                    main_ser[key] = getattr(main_obj, key, '') or ''
            for _k in ('rec_inst_sfx_name','rec_inst_name','rec_inst_address_1','rec_inst_address_2','rec_inst_location','rec_inst_city','rec_inst_pin','rec_inst_email','doc_types','inst_ref_no','rec_by'):
                main_ser[_k] = _sanitize_template_field(main_ser.get(_k))
            try:
                inst_obj = getattr(main_obj, 'institute', None)
                if inst_obj:
                    rec_name = main_ser.get('rec_inst_name') or ''
                    if rec_name == '' or str(rec_name).strip().isdigit() or (str(getattr(inst_obj, 'institute_id', '')) == str(rec_name).strip()):
                        main_ser['rec_inst_name'] = getattr(inst_obj, 'institute_name', '') or main_ser.get('rec_inst_name', '')
                    if not main_ser.get('rec_inst_address_1'):
                        main_ser['rec_inst_address_1'] = (getattr(inst_obj, 'institute_address', '') or '').split('\n')[0]
                    if not main_ser.get('rec_inst_city'):
                        main_ser['rec_inst_city'] = getattr(inst_obj, 'institute_city', '') or ''
                    if not main_ser.get('rec_inst_sfx_name'):
                        main_ser['rec_inst_sfx_name'] = getattr(inst_obj, 'institute_campus', '') or ''
            except Exception:
                pass
            if isinstance(main_ser.get('iv_record_no', None), (int, str)):
                iv_no = main_ser.get('iv_record_no')
            else:
                iv_no = None
            group_key = str(iv_no) if iv_no is not None else (main_ser.get('inst_veri_number') or actual_doc_rec or dr)
            if group_key not in groups:
                groups[group_key] = {'mains': [], 'students': [], 'doc_recs': []}
            groups[group_key]['mains'].append(main_ser)
            groups[group_key]['doc_recs'].append(actual_doc_rec)
            students_qs = InstVerificationStudent.objects.filter(doc_rec__doc_rec_id=actual_doc_rec).order_by('id')
            students_ser = InstVerificationStudentSerializer(students_qs, many=True).data
            for s in students_ser:
                if isinstance(s, dict):
                    s_copy = dict(s)
                    s_copy['_source_doc_rec'] = actual_doc_rec
                    groups[group_key]['students'].append(s_copy)
                else:
                    groups[group_key]['students'].append({'data': s, '_source_doc_rec': actual_doc_rec})

        # render pages
        for gk, gval in groups.items():
            rep_main = None
            for m in gval['mains']:
                if m and isinstance(m, dict):
                    rep_main = m
                    break
            if not rep_main:
                rep_main = {'inst_veri_number': gk, 'rec_inst_name': '', 'doc_types': '', 'inst_ref_no': '', 'rec_by': '', 'inst_veri_date': ''}
            merged = []
            seen = set()
            for s in gval['students']:
                sid = None
                if isinstance(s, dict):
                    sid = s.get('id') or s.get('enrollment') or s.get('enrollment_no') or s.get('enrollment_no_text')
                if not sid:
                    sid = json.dumps(s, sort_keys=True)
                if sid in seen:
                    continue
                seen.add(sid)
                if isinstance(s, dict) and '_source_doc_rec' in s:
                    s.pop('_source_doc_rec', None)
                merged.append(s)
            credential_header = ''
            for candidate in merged:
                if isinstance(candidate, dict):
                    credential_header = _sanitize_template_field(candidate.get('type_of_credential'))
                    if credential_header:
                        break
            if not credential_header and isinstance(rep_main, dict):
                credential_header = _sanitize_template_field(rep_main.get('type_of_credential'))
            page_html = render_to_string('pdf_templates/inst_verification_record.html', {
                'main': rep_main,
                'students': merged,
                'group_doc_recs': gval.get('doc_recs', []),
                'iv_record_no': gk,
                'credential_header': credential_header or 'Type of Credential',
            })
            pages.append(page_html)

        full_html = render_to_string('pdf_templates/batch_wrapper.html', {'pages': pages})
        return full_html, groups
    return None, {}


if __name__ == '__main__':
    dr = '25001'
    print('tmp_generate_pdf: starting for', dr)
    html, groups = build_group_html(dr)
    print('tmp_generate_pdf: html length', len(html) if html else 0, 'groups:', list(groups.keys()))
    out_html = os.path.join(settings.BASE_DIR, 'backend', 'tmp_iv_25001.html')
    out_pdf = os.path.join(settings.BASE_DIR, 'backend', 'tmp_iv_25001.pdf')
    if not html:
        print('No HTML generated for', dr)
    else:
        print('HTML generated, attempting PDF via pdfkit (pdfkit import:', 'yes' if 'pdfkit' in globals() and pdfkit else 'no')
        # try pdfkit
        try:
            if pdfkit is None:
                raise RuntimeError('pdfkit not installed')
            wkpath = getattr(settings, 'WKHTMLTOPDF_CMD', None) or os.getenv('WKHTMLTOPDF_CMD')
            config = None
            if wkpath:
                config = pdfkit.configuration(wkhtmltopdf=wkpath)
            pdf = pdfkit.from_string(html, out_pdf, configuration=config)
            print('PDF written to', out_pdf)
        except Exception as e:
            # write HTML fallback
            try:
                with open(out_html, 'w', encoding='utf-8') as f:
                    f.write(html)
                print('PDF generation failed:', str(e))
                print('Wrote HTML fallback to', out_html)
            except Exception as ee:
                print('Failed to write HTML fallback:', str(ee))
                print('Original error:', str(e))
