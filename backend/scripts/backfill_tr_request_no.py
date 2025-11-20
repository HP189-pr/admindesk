from api.domain_transcript_generate import TranscriptRequest

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
            # skip problematic conversions
            continue

print('Updated', updated)
