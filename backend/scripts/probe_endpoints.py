import urllib.request

def probe(path):
    url = 'http://127.0.0.1:8000' + path
    try:
        req = urllib.request.Request(url, method='GET')
        resp = urllib.request.urlopen(req)
        print(path, resp.status)
    except Exception as e:
        print(path, 'ERR', type(e).__name__, e)

if __name__ == '__main__':
    for path in ['/api/userlogin/','/api/token/refresh/','/api/my-leave-balance/']:
        probe(path)
