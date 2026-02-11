import os, sys
# Ensure project root is on sys.path so 'backend.settings' can be imported
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'backend.settings')
import django
django.setup()
from api.domain_letter import InstLetterMain, InstLetterStudent

import os
iv = int(os.environ.get('IV', '25001'))
qs = InstLetterMain.objects.filter(iv_record_no=iv)
print('InstLetterMain count for iv_record_no', iv, ':', qs.count())
for m in qs:
    doc_rec = getattr(getattr(m, 'doc_rec', None), 'doc_rec_id', None)
    print('\n--- MAIN ---')
    print('id:', m.id)
    print('doc_rec:', doc_rec)
    fields = ['inst_veri_number','inst_veri_date','rec_inst_name','rec_inst_address_1','rec_inst_address_2','rec_inst_location','rec_inst_city','rec_inst_pin','doc_types','inst_ref_no','rec_by','iv_record_no']
    for f in fields:
        try:
            print(f+':', getattr(m, f))
        except Exception as e:
            print(f+': <error>')
    studs = InstLetterStudent.objects.filter(doc_rec__doc_rec_id=doc_rec).order_by('id')
    print('\nstudents count:', studs.count())
    for s in studs:
        try:
            print({'id': s.id, 'student_name': s.student_name, 'enrollment_no': getattr(s,'enrollment_no',''), 'iv_degree_name': getattr(s,'iv_degree_name',''), 'type_of_credential': getattr(s,'type_of_credential',''), 'verification_status': getattr(s,'verification_status','')})
        except Exception as e:
            print('student read error', e)

if qs.count() == 0:
    print('\nNo InstLetterMain found for iv_record_no', iv)
