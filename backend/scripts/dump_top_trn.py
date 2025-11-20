import os, sys, pathlib, django
PROJECT_ROOT = pathlib.Path(__file__).resolve().parents[1]
sys.path.insert(0, str(PROJECT_ROOT))
os.environ.setdefault('DJANGO_SETTINGS_MODULE','backend.settings')
django.setup()
from api.domain_transcript_generate import TranscriptRequest
for row in TranscriptRequest.objects.order_by('-tr_request_no').values_list('tr_request_no','request_ref_no')[:10]:
    print(row)
