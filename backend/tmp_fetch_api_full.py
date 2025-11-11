import requests
r = requests.get('http://127.0.0.1:8000/api/')
with open('api_root_response.html','w', encoding='utf-8') as f:
    f.write(f'STATUS: {r.status_code}\n\n')
    f.write(r.text)
print('Wrote api_root_response.html')
