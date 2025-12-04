"""Test FTS search functionality"""
import os
import django

os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'backend.settings')
django.setup()

from api.models import Enrollment
from django.contrib.postgres.search import SearchQuery, SearchRank
from django.db.models import F

# Test 1: Search for "21MSCBT22012" with prefix matching
print("=" * 60)
print("Test 1: FTS Prefix Search for '21MSCBT22012'")
print("=" * 60)

search_term = "21MSCBT22012"
query = SearchQuery(f"{search_term}:*", search_type='raw')
results = Enrollment.objects.annotate(
    rank=SearchRank(F('search_vector'), query)
).filter(search_vector=query).order_by('-rank')[:10]

print(f"Found {results.count()} results:")
for r in results:
    print(f"  - {r.enrollment_no} | {r.student_name}")

# Test 2: Traditional icontains search for comparison
print("\n" + "=" * 60)
print("Test 2: Traditional icontains search for '21MSCBT22012'")
print("=" * 60)

results2 = Enrollment.objects.filter(
    enrollment_no__icontains=search_term
)[:10]

print(f"Found {results2.count()} results:")
for r in results2:
    print(f"  - {r.enrollment_no} | {r.student_name}")

# Test 3: Check if search_vector field exists
print("\n" + "=" * 60)
print("Test 3: Verify search_vector field exists")
print("=" * 60)

sample = Enrollment.objects.first()
if sample:
    print(f"Sample enrollment: {sample.enrollment_no}")
    print(f"Has search_vector: {hasattr(sample, 'search_vector')}")
    if hasattr(sample, 'search_vector'):
        print(f"search_vector value: {sample.search_vector}")
else:
    print("No enrollment records found")
