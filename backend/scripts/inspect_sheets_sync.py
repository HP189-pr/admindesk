p='e:/admindesk/backend/api/sheets_sync.py'
with open(p,'rb') as f:
    data=f.read().splitlines()
for i,line in enumerate(data[490:526], start=491):
    print(i, repr(line))
