import os
import json
os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'backend.settings')
import django
django.setup()
from api.domain_transcript_generate import TranscriptRequest
qs = TranscriptRequest.objects.filter(tr_request_no__in=[25235,25236,25237,25238])
print('COUNT:', qs.count())
print(json.dumps(list(qs.values('id','tr_request_no','request_ref_no','mail_status','raw_row')), default=str))
