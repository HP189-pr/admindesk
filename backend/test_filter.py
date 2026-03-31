#!/usr/bin/env python
import os
os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'backend.settings')

import django
django.setup()

from api.cctv.domain_cctv import CCTVExam

# Test with session filter
exams = CCTVExam.objects.filter(exam_year_session='2026-1').order_by('exam_date')
print(f"Total with session '2026-1': {exams.count()}")
print(f"April 9: {exams.filter(exam_date='9-Apr-2026').count()}")
print(f"April 11: {exams.filter(exam_date='11-Apr-2026').count()}")

print("\nDate range in filtered set:")
dates = exams.values_list('exam_date', flat=True).distinct().order_by('exam_date')
for d in list(dates):
    print(f"  {d}")
