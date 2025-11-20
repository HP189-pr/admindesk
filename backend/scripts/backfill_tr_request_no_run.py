import os
import sys
import pathlib
import django

# Ensure project root is on sys.path so `backend` package is importable.
PROJECT_ROOT = pathlib.Path(__file__).resolve().parents[1]
sys.path.insert(0, str(PROJECT_ROOT))

# Ensure Django is configured for standalone script run
os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'backend.settings')
django.setup()

from api.domain_transcript_generate import TranscriptRequest

def main():
    qs = TranscriptRequest.objects.filter(tr_request_no__isnull=True)
    updated = 0
    for obj in qs:
        r = (obj.request_ref_no or '')
        s = ''.join(ch for ch in r if ch.isdigit())
        if s:
            try:
                obj.tr_request_no = int(s)
                obj.save(update_fields=['tr_request_no'])
                updated += 1
            except Exception:
                continue
    print('Updated', updated)

if __name__ == '__main__':
    main()
