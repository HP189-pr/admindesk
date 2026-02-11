import os
import sys
import json

def main():
    if len(sys.argv) < 2:
        print('Usage: debug_iv_print.py <iv_record_no>')
        return
    iv = sys.argv[1]
    try:
        iv_int = int(iv)
    except Exception:
        print(json.dumps({'error': 'iv_record_no must be numeric', 'input': iv}))
        return

    # Configure Django
    proj_path = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
    if proj_path not in sys.path:
        sys.path.insert(0, proj_path)
    os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'backend.settings')
    try:
        import django
        django.setup()
    except Exception as e:
        print(json.dumps({'error': 'django setup failed', 'exception': str(e)}))
        return

    try:
        from api.domain_letter import InstLetterMain, InstLetterStudent
    except Exception as e:
        print(json.dumps({'error': 'import models failed', 'exception': str(e)}))
        return

    out = []
    try:
        mains = InstLetterMain.objects.filter(iv_record_no=iv_int)
        for m in mains:
            # also get serializer representation if available
            ser_data = None
            try:
                from api.serializers_documents import InstVerificationMainSerializer as IVSerializer
                ser_data = IVSerializer(m).data
            except Exception:
                try:
                    from api.serializers import InstVerificationMainSerializer as IVSerializer2
                    ser_data = IVSerializer2(m).data
                except Exception:
                    ser_data = None
            doc_rec_id = getattr(getattr(m, 'doc_rec', None), 'doc_rec_id', None)
            def fmt(d):
                try:
                    if not d:
                        return ''
                    if hasattr(d, 'strftime'):
                        return d.strftime('%d-%m-%Y')
                    return str(d)
                except Exception:
                    return str(d)

            main_dict = {
                'doc_rec': doc_rec_id,
                'inst_veri_number': getattr(m, 'inst_veri_number', ''),
                'inst_veri_date': fmt(getattr(m, 'inst_veri_date', '')),
                'rec_inst_sfx_name': getattr(m, 'rec_inst_sfx_name', '') or '',
                'rec_inst_name': getattr(m, 'rec_inst_name', '') or '',
                'rec_inst_address_1': getattr(m, 'rec_inst_address_1', '') or '',
                'rec_inst_address_2': getattr(m, 'rec_inst_address_2', '') or '',
                'rec_inst_location': getattr(m, 'rec_inst_location', '') or '',
                'rec_inst_city': getattr(m, 'rec_inst_city', '') or '',
                'rec_inst_pin': getattr(m, 'rec_inst_pin', '') or '',
                'doc_types': getattr(m, 'doc_types', '') or '',
                'inst_ref_no': getattr(m, 'inst_ref_no', '') or '',
                'rec_by': getattr(m, 'rec_by', '') or '',
                'ref_date': fmt(getattr(m, 'ref_date', '')),
            }
            students = []
            if doc_rec_id:
                studs = InstLetterStudent.objects.filter(doc_rec__doc_rec_id=doc_rec_id).order_by('id')
                for s in studs:
                    students.append({
                        'id': getattr(s, 'id', None),
                        'student_name': getattr(s, 'student_name', '') or '',
                        'enrollment_no': getattr(s, 'enrollment_no', '') or '',
                        'iv_degree_name': getattr(s, 'iv_degree_name', '') or '',
                        'month_year': getattr(s, 'month_year', '') or '',
                        'type_of_credential': getattr(s, 'type_of_credential', '') or '',
                        'verification_status': getattr(s, 'verification_status', '') or '',
                    })
            out.append({'doc_rec_input_iv': iv, 'doc_rec': doc_rec_id, 'main': main_dict, 'serialized': ser_data, 'students': students})
    except Exception as e:
        print(json.dumps({'error': 'query failed', 'exception': str(e)}))
        return

    print(json.dumps({'results': out}, indent=2))

if __name__ == '__main__':
    main()
