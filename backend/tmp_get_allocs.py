import requests
from requests.auth import HTTPBasicAuth
url='http://127.0.0.1:8000/api/leave-allocations/?period=1'
try:
    r = requests.get(url, auth=HTTPBasicAuth('devadmin','DevAdmin123'))
    print('STATUS', r.status_code)
    print(r.headers.get('Content-Type'))
    print(r.text[:4000])
except Exception as e:
    print('ERROR', e)
