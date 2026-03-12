# Google Sheets Sync Guide

Last updated: March 12, 2026

AdminDesk currently syncs selected workflow data with Google Sheets, primarily for official mail requests and transcript requests.

## Active Integration Areas

| Area | Main files | Notes |
| --- | --- | --- |
| Mail requests | `backend/api/domain_mail_request.py`, `serializers_mail_request.py`, `views_mail_request.py` | Pushes status and remark updates back to Sheets |
| Transcript requests | `backend/api/domain_transcript_generate.py`, `serializers_transcript_generate.py`, `view_transcript_generate.py` | Uses the same direct-update sync pattern as mail requests |
| Shared helpers | `backend/api/sheets_sync.py` | Batch update helpers, retries, and common API logic |

## Sync Pattern

The current sync approach is direct and request-driven.

### What happens

1. The API update view captures the original record values.
2. The serializer updates the record.
3. The view compares the changed fields.
4. If tracked fields changed, the backend pushes those values to Google Sheets.

### What does not happen by default

- No always-on post-save signal sync for transcript requests
- No mandatory background queue for ordinary status updates
- No sheet sync for every ORM write outside the API update flow

For transcript requests, the focused reference is [docs/SYNC_PATTERNS.md](./SYNC_PATTERNS.md).

## Tracked Updates

### Mail requests

Common tracked fields include:

- `mail_status`
- request remarks

### Transcript requests

Common tracked fields include:

- `tr_request_no`
- `mail_status`
- `transcript_remark`
- `pdf_generate`

## Bulk and Import Operations

Management commands and import flows are still part of the broader integration story.

Common operational commands in the repository include:

- `import_mail_requests`
- `import_transcript_requests`
- `sync_transcript_queue`

Use these when importing or reconciling sheet-backed data, not as a replacement for the direct update pattern used by the normal UI.

## Rate Limiting and Retries

`backend/api/sheets_sync.py` includes retry logic and batched field updates to reduce Google API quota pressure.

Typical behavior:

- combine several field updates into one sheet operation when possible
- retry with backoff on quota or temporary API failures
- log warnings instead of crashing the user request when a sync call ultimately fails

## Validation Checklist

After changing a sync-related view:

1. Update a single record from the UI.
2. Confirm the matching Google Sheet row updates.
3. Test a no-op edit to confirm unchanged fields do not trigger unnecessary sync work.
4. Test a multi-record bulk action if that page supports it.
5. Review backend logs for retries or rate-limit warnings.

## Related Docs

- [docs/BACKEND_API.md](./BACKEND_API.md)
- [docs/SYNC_PATTERNS.md](./SYNC_PATTERNS.md)
