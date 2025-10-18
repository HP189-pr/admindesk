# Script to check for DocRec and Enrollment presence
# Run via: python manage.py shell < check_docrec.py
from api.models import DocRec, Enrollment
import re

doc_ids = ['mg_2009_0001','mg_2009_0002','mg_2009_0003','mg_2009_0004']
enr_ids = ['0809BEdG069','0809BEdE033','0809BEdE099','0809BEdE011']

print('Checking DocRec exact / iexact / normalized matches')
for did in doc_ids:
    exact = DocRec.objects.filter(doc_rec_id=did).exists()
    iexact = DocRec.objects.filter(doc_rec_id__iexact=did).exists()
    norm = ''.join(re.findall(r'[0-9A-Za-z]', did)).lower()
    norm_matches = [d.doc_rec_id for d in DocRec.objects.all()[:20000] if ''.join(re.findall(r'[0-9A-Za-z]', str(d.doc_rec_id))).lower()==norm]
    print(f"{did}: exact={exact}, iexact={iexact}, normalized_count={len(norm_matches)}, samples={norm_matches[:5]}")

print('\nChecking Enrollment existence and linked relations')
for eid in enr_ids:
    en = Enrollment.objects.filter(enrollment_no=eid).first()
    if en:
        inst = getattr(en, 'institute', None)
        main = getattr(en, 'maincourse', None)
        sub = getattr(en, 'subcourse', None)
        print(f"{eid}: FOUND - institute={(inst.institute_id if inst else None)}, main={(main.maincourse_id if main else None)}, sub={(sub.subcourse_id if sub else None)}")
    else:
        # try iexact
        en2 = Enrollment.objects.filter(enrollment_no__iexact=eid).first()
        print(f"{eid}: FOUND iexact={bool(en2)}")

print('\nDone.')
