import urllib.request
url = 'http://127.0.0.1:8000/api/token/refresh/'
try:
    resp = urllib.request.urlopen(url)
    print('STATUS', resp.status)
    print(resp.read().decode('utf-8')[:1000])
except Exception as e:
    import traceback
    traceback.print_exc()
