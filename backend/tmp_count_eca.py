from django.db import connection
from api.domain_documents import DocRec
from api.domain_documents import Eca as EcaModel
from django.db.models import Count

# Use ORM to get distribution of Eca rows per doc_rec
from api import domain_documents

from api.domain_documents import Eca

qs = Eca.objects.values('doc_rec__doc_rec_id').annotate(cnt=Count('id')).order_by('-cnt')
rows = list(qs[:50])
print('Top 50 doc_rec counts (doc_rec, count):')
for r in rows:
    print(r['doc_rec__doc_rec_id'], r['cnt'])

from django.db import connection
cur = connection.cursor()
cur.execute("SELECT COUNT(DISTINCT doc_rec_id) FROM eca WHERE doc_rec_id IS NOT NULL")
print('Distinct doc_rec with Eca rows:', cur.fetchone()[0])
cur.execute("SELECT MAX(cnt) FROM (SELECT doc_rec_id, COUNT(*) as cnt FROM eca GROUP BY doc_rec_id) t")
maxcnt = cur.fetchone()[0]
print('Max Eca rows per doc_rec:', maxcnt)
