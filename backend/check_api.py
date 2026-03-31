import requests

resp = requests.get('http://127.0.0.1:8001/api/exam/')
print(f'Content-Type: {resp.headers.get("content-type")}')
print(f'Status: {resp.status_code}')

try:
    data = resp.json()
except Exception as e:
    print(f'JSON parse error: {e}')
    print(f'Response text (first 500 chars): {resp.text[:500]}')
    exit(1)

april_9_count = sum(1 for e in data if e.get('exam_date') == '9-Apr-2026')
april_11_count = sum(1 for e in data if e.get('exam_date') == '11-Apr-2026')

print(f'API Status: {resp.status_code}')
print(f'Total exams: {len(data)}')
print(f'April 9: {april_9_count}')
print(f'April 11: {april_11_count}')
print()

april_11_samples = [e for e in data if e.get('exam_date') == '11-Apr-2026'][:3]
if april_11_samples:
    print('Sample April 11:')
    for e in april_11_samples:
        print(f"  {e.get('exam_date')} - {e.get('subject_code')}")
