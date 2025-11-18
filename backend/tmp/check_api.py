import urllib.request, sys
urls = [
    'http://127.0.0.1:8000/api/inst-verification/suggest-doc-rec/?number=25001',
    'http://127.0.0.1:8000/api/inst-verification-main/?doc_rec=iv_25_001',
    'http://127.0.0.1:8000/api/inst-verification-student/?doc_rec=iv_25_001',
]
for u in urls:
    print('---', u)
    try:
        r = urllib.request.urlopen(u, timeout=5)
        data = r.read().decode('utf-8')
        print('status', r.getcode())
        print(data[:2000])
    except Exception as e:
        print('error:', type(e), e)
