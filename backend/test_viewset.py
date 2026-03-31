import os
import sys
sys.path.insert(0, 'e:\\admindesk\\backend')
os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'backend.settings')

import django
django.setup()

from api.cctv.domain_cctv import CCTVExam

# Test direct queryset (same as backend)
qs = CCTVExam.objects.all().order_by("exam_date")
print(f"Queryset count: {qs.count()}")

april_9 = qs.filter(exam_date='9-Apr-2026').count()
april_11 = qs.filter(exam_date='11-Apr-2026').count()

print(f"April 9: {april_9}")
print(f"April 11: {april_11}")

# Show dates in order
dates = qs.values_list('exam_date', flat=True).distinct()
april_dates = sorted([d for d in dates if 'Apr' in str(d)])
print(f"\nApril dates (unique): {april_dates}")
