from pathlib import Path
p=Path(r'e:/admindesk/src/pages/doc-receive.jsx')
s=p.read_bytes()
print('BYTES', len(s))
print('LAST 200 BYTES:', s[-200:])
print('HEX:', s[-200:].hex())
try:
    t=s.decode('utf-8')
    lines=t.splitlines()
    print('LINES', len(lines))
    print('LAST 20 LINES:')
    for i,l in enumerate(lines[-20:], start=len(lines)-19):
        print(i, repr(l))
except Exception as e:
    print('decode error', e)
