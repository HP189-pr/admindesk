"""Read-only checks against the configured database; no fixture data is inserted."""
from datetime import date
from io import BytesIO
from django.contrib.auth.models import User
from rest_framework.test import APIRequestFactory, force_authenticate
from openpyxl import load_workbook
from api.views_enrollment import EnrollmentAnalyticsView
from api.analytics_documents import display_value


def fetch(params, expected=200):
    request = APIRequestFactory().get('/api/enrollment-analytics/', params)
    force_authenticate(request, user=User(username='analytics-read-only-check'))
    response = EnrollmentAnalyticsView.as_view()(request)
    assert response.status_code == expected, response.status_code
    return response


assert display_value(0) == 0
assert all(display_value(value) == 'NA' for value in (None, '', ' null ', 'None', 'undefined'))
base = fetch({}).data
for dimension, rows in base['cross_analysis'].items():
    assert sum(row['total'] for row in rows) == base['summary']['total'], dimension
    for row in rows:
        assert sum(row['years'].values()) == row['total']
    for key, total in base['issuance'].items():
        assert sum(row['documents'][key] for row in rows) == total, (dimension, key)
for key, total in base['issuance'].items():
    assert sum(row[key] for row in base['document_trend']['rows']) + base['document_trend']['undated'][key] == total
assert base['certificate_records']['count'] == sum(base['issuance'][key] for key in ('degree','provisional','migration'))
assert base['verification_records']['count'] == sum(row['total'] for row in base['verification_summary'])
assert len(base['certificate_records']['results']) <= 25
print('PASS: cross matrices, timelines, summaries and record totals reconcile')
for key in ('degree','provisional','migration','verification'):
    result = fetch({'certificate': key}).data
    assert all(total == 0 for other, total in result['issuance'].items() if other != key)
    assert all(row['document_type'] == key for row in result['certificate_records']['results'])
print('PASS: document types apply consistently across counts and records')
params = {'issue_date_from':'2024-01-01','issue_date_to':'2024-12-31'}
dated = fetch(params).data
assert dated['issuance']['degree'] == 0
assert all(row['year'] == 2024 for row in dated['document_trend']['rows'])
for group in ('certificate_records','verification_records'):
    assert all(date(2024,1,1) <= row['event_date'] <= date(2024,12,31) for row in dated[group]['results'])
fetch({'issue_date_from':'invalid'},400)
fetch({'issue_date_from':'2025-01-01','issue_date_to':'2024-01-01'},400)
assert fetch({'certificate':'degree',**params}).data['summary']['total'] == 0
print('PASS: actual document dates, undated degree exclusion and invalid dates')
if base['certificate_records']['results']:
    number = base['certificate_records']['results'][0]['enrollment_number']
    result = fetch({'search':number,'export':'json'}).data
    for group in ('certificate_records','verification_records'):
        assert len(result[group]['results']) == result[group]['count']
    workbook=load_workbook(BytesIO(fetch({'search':number,'export':'excel'}).content),read_only=True)
    assert 'Summary' in workbook.sheetnames
    for sheet, key in [('Certificate Records','certificate_records'),('Verification Records','verification_records')]:
        if result[key]['count']:
            assert workbook[sheet].max_row-1 == result[key]['count']
            assert 'record_id' not in next(workbook[sheet].values)
    print('PASS: filtered Excel and PDF source include all linked rows without internal IDs')
print('PASS: display normalization preserves numeric zero')
