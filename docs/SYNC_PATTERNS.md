# Service Synchronization Patterns

Last updated: March 12, 2026

This file collects the active synchronization rules for DocRec-linked services and Google Sheets-backed request workflows.

## DocRec to Service Synchronization

The system keeps `DocRec` and service records aligned through Django-side sync logic and signals.

### Create behavior

- Creating a `DocRec` for verification creates a linked verification row automatically.
- Creating a service row can create a minimal `DocRec` when the document record does not already exist.

### Update behavior

- Verification updates can push selected values such as remarks and payment-receipt data back to the linked `DocRec`.
- `DocRec` updates keep existing relationships intact.
- For atomic dual-record edits from the doc-receive page, use the unified endpoints described in [docs/UNIFIED_API.md](./UNIFIED_API.md).

### Delete behavior

- Deleting a `DocRec` removes linked service rows.
- Deleting a service row removes the `DocRec` only when no other service still references it.

## Important Verification Compatibility Note

The verification model now aligns with the live schema in these ways:

- verification records use `enrollment_no` string data instead of the earlier assumption of a required enrollment FK in sync helpers
- `doc_rec_date` must be populated when creating verification rows through sync paths
- nullable document-count fields and the updated schema shape must be respected by any sync or bulk-create logic

If a sync path creates a verification row, it must supply fields that match the current model contract.

## Manual Recovery Command

If existing `DocRec` rows need to be reconciled with missing verification rows, use:

```powershell
cd backend
..\.venv\Scripts\python.exe manage.py sync_docrec_services --service=VR
```

## Transcript and Mail Request Google Sheets Sync

Mail requests and transcript requests use a direct API-update sync pattern.

### Current rule

- sync happens in the API update flow after the serializer saves the record
- the backend compares tracked fields before pushing changes to the sheet

### What does not happen by default

- no always-on post-save transcript sync
- no required background queue for ordinary request-status updates
- no guaranteed sheet sync for ad hoc ORM writes outside the API update flow

### Common tracked transcript fields

- `tr_request_no`
- `mail_status`
- `transcript_remark`
- `pdf_generate`

### Common tracked mail-request fields

- `mail_status`
- remarks

## Rate Limiting and Bulk Notes

- Google Sheets helper logic batches compatible field updates when possible.
- Retry and backoff logic is handled in `backend/api/sheets_sync.py`.
- Bulk status operations still sync row by row so request-level behavior stays consistent.

## Related Docs

- [docs/UNIFIED_API.md](./UNIFIED_API.md)
- [docs/GOOGLE_SHEETS_SYNC.md](./GOOGLE_SHEETS_SYNC.md)
- [docs/BACKEND_API.md](./BACKEND_API.md)