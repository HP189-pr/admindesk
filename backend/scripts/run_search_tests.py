"""
Automated enrollment search tests (authenticated)
Run: python backend\scripts\run_search_tests.py

This script will attempt to obtain a JWT access token from `/api/userlogin/` using
credentials provided via environment variables `TEST_USERNAME` and `TEST_PASSWORD`,
or via an interactive prompt if not set. The access token is then used to call
`/api/enrollments/?search=...` to verify case-insensitive search behavior.
"""
import os
import requests

BASE_URL = "http://127.0.0.1:8000/api/enrollments/"
LOGIN_URL = "http://127.0.0.1:8000/api/userlogin/"

TESTS = [
    ("JOHN", "Uppercase name"),
    ("john", "Lowercase name"),
    ("21MSC", "Enrollment prefix uppercase"),
    ("21msc", "Enrollment prefix lowercase"),
    ("raj", "Partial name"),
]


def get_token():
    # Try environment variables first
    username = os.getenv('TEST_USERNAME')
    password = os.getenv('TEST_PASSWORD')
    if not username:
        username = input('Enter test username (or press Enter to skip auth): ').strip()
    if username and not password:
        # Prompt for password if username provided but not password
        import getpass
        password = getpass.getpass('Enter password: ')

    if not username:
        return None

    try:
        resp = requests.post(LOGIN_URL, json={'username': username, 'password': password}, timeout=10)
        if resp.status_code == 200:
            data = resp.json()
            token = data.get('access') or data.get('token') or data.get('access_token')
            if token:
                print('✓ Obtained access token via /api/userlogin/')
                return token
            else:
                print('✗ Login succeeded but no access token found in response:', data)
                return None
        else:
            print(f'✗ Login failed: HTTP {resp.status_code} - {resp.text}')
            return None
    except Exception as e:
        print('✗ Exception during login:', e)
        return None


def run_test(session, term, desc):
    print('\n' + '='*60)
    print(f'TEST: {desc} — "{term}"')
    print('='*60)
    try:
        resp = session.get(BASE_URL, params={'search': term, 'page': 1, 'limit': 5}, timeout=10)
        if resp.status_code != 200:
            print(f'✗ HTTP {resp.status_code} — {resp.text}')
            return
        data = resp.json()
        total = data.get('total', 0)
        items = data.get('items', [])
        print(f'✓ total: {total} — showing {len(items)} items')
        for i, item in enumerate(items, 1):
            print(f"{i}. enrollment_no={item.get('enrollment_no')}, temp_enroll_no={item.get('temp_enroll_no')}, student_name={item.get('student_name')}")
    except Exception as e:
        print('✗ Exception:', e)


if __name__ == '__main__':
    print('Starting enrollment search tests against', BASE_URL)
    token = get_token()
    headers = {}
    if token:
        headers['Authorization'] = f'Bearer {token}'
    else:
        print('No token provided — requests will be unauthenticated and likely forbidden.')

    session = requests.Session()
    session.headers.update(headers)

    for term, desc in TESTS:
        run_test(session, term, desc)
    print('\nAll tests done.')
