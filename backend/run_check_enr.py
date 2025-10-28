import os, sys

# Ensure project root is in path
os.chdir(os.path.dirname(__file__))
sys.path.insert(0, os.getcwd())

os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'backend.settings')
import django
django.setup()

# Now run the check script
from api.models import Enrollment
import re

enr_ids = ['0809BEdG069','0809BEdE033','0809BEdE099','0809BEdE011','0809BEdE018','0811BBA295','0809BEdE075','0809BCOM172']

print('Checking Enrollment existence and linked relations')
for eid in enr_ids:
    en = Enrollment.objects.filter(enrollment_no=eid).first()
    if en:
        inst = getattr(en, 'institute', None)
        main = getattr(en, 'maincourse', None)
        sub = getattr(en, 'subcourse', None)
        print(f"{eid}: FOUND - institute={(inst.institute_id if inst else None)}, main={(main.maincourse_id if main else None)}, sub={(sub.subcourse_id if sub else None)}")
    else:
        en2 = Enrollment.objects.filter(enrollment_no__iexact=eid).first()
        print(f"{eid}: FOUND iexact={bool(en2)}")

print('\nDone.')
