import urllib.request, json

def post_json(path, data):
    url = 'http://127.0.0.1:8000' + path
    req = urllib.request.Request(url, data=json.dumps(data).encode('utf-8'), headers={'Content-Type':'application/json'}, method='POST')
    try:
        resp = urllib.request.urlopen(req)
        print(path, 'POST', resp.status, resp.read().decode()[:300])
    except Exception as e:
        print(path, 'POST ERR', type(e).__name__, e)

def get_url(url):
    try:
        req = urllib.request.Request(url, method='GET')
        resp = urllib.request.urlopen(req)
        print(url, 'GET', resp.status, resp.read().decode()[:300])
    except Exception as e:
        print(url, 'GET ERR', type(e).__name__, e)

if __name__ == '__main__':
    post_json('/api/userlogin/', {'username':'x', 'password':'x'})
    post_json('/api/token/refresh/', {'refresh':'x'})
    get_url('http://localhost:8000/api/my-leave-balance/')
