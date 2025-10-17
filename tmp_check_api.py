import os
import json
from urllib import request, error

API_BASE = os.environ.get('API_BASE', 'http://127.0.0.1:8000')
HEADERS = {
    'Accept': 'application/json',
    'User-Agent': 'tmp_check_api/1.0'
}
token = os.environ.get('ACCESS_TOKEN') or os.environ.get('access_token')
if token:
    HEADERS['Authorization'] = f'Bearer {token}'

def fetch(path):
    url = API_BASE.rstrip('/') + path
    req = request.Request(url, headers=HEADERS)
    try:
        with request.urlopen(req, timeout=10) as resp:
            status = resp.getcode()
            body = resp.read().decode('utf-8', errors='replace')
            snippet = body[:400]
            return status, snippet
    except error.HTTPError as he:
        try:
            body = he.read().decode('utf-8', errors='replace')
        except Exception:
            body = str(he)
        return he.code, body[:400]
    except Exception as e:
        return None, f'Error: {e}'

if __name__ == '__main__':
    for p in ['/api/empprofile/', '/api/leave-allocations/']:
        status, snippet = fetch(p)
        print(p, status)
        print(snippet)
