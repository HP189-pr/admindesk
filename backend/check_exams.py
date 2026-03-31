#!/usr/bin/env python
import os
os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'backend.settings')

import django
django.setup()

from api.cctv.domain_cctv import CCTVExam

exams = list(CCTVExam.objects.all().order_by('exam_date'))
print(f"Total in DB: {len(exams)}")

april_exams = [e for e in exams if 'Apr' in e.exam_date]
print(f"April total: {len(april_exams)}")

april_9 = [e for e in exams if e.exam_date == '9-Apr-2026']
april_11 = [e for e in exams if e.exam_date == '11-Apr-2026']

print(f"April 9: {len(april_9)}")
print(f"April 11: {len(april_11)}")

# Show sample from April 11
if april_11:
    print("\nSample April 11 exams:")
    for e in april_11[:3]:
        print(f"  ID:{e.id} {e.exam_date} - {e.subject_code} ({e.exam_year_session})")
