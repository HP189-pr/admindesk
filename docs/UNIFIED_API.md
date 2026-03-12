# Unified DocRec and Service APIs

Last updated: March 12, 2026

This guide covers the unified CRUD flows that let the doc-receive module update or delete both a `DocRec` row and its linked service row in one request.

## Main Endpoints

### Unified endpoints used from doc receive

- `POST /api/docrec/unified-update/`
- `POST /api/docrec/unified-delete/`

### Service-only update endpoints used from feature pages

- `POST /api/verification/update-service-only/`
- `POST /api/migration/update-service-only/`
- `POST /api/provisional/update-service-only/`
- `POST /api/instverification/update-service-only/`

## When To Use Which Flow

- Use the unified endpoints when the UI is editing or deleting a `DocRec` record together with its linked service data.
- Use the service-only endpoints when a dedicated service page is editing only the service record and should leave `DocRec` untouched except for normal sync rules.

## Unified Update Request Shape

```json
{
  "doc_rec_id": "vr_25_0201",
  "service_type": "VR",
  "doc_rec": {
    "apply_for": "Transcript",
    "pay_amount": 500,
    "doc_rec_date": "2025-01-15",
    "doc_rec_remark": "Urgent request"
  },
  "service": {
    "enrollment_no": "2019010123",
    "student_name": "John Doe",
    "tr_count": 2,
    "ms_count": 1
  }
}
```

## Unified Delete Request Shape

```json
{
  "doc_rec_id": "vr_25_0201",
  "service_type": "VR"
}
```

## Supported Service Types

- `VR` for verification
- `PR` for provisional
- `MG` for migration
- `IV` for institutional verification

## Expected Behavior

- The backend locates the target `DocRec` by `doc_rec_id`.
- `service_type` tells the backend which linked service model should be updated or deleted.
- Unified update can modify only `doc_rec`, only `service`, or both.
- Unified delete removes both records together through the service-aware workflow.

## Frontend Integration Notes

- The doc-receive page is the main consumer of these endpoints.
- Dedicated service pages should keep using their own update-service-only endpoints.
- Requests must carry the normal JWT `Authorization` header.

## Operational Notes

- These endpoints complement, not replace, the signal-based sync rules described in [docs/SYNC_PATTERNS.md](./SYNC_PATTERNS.md).
- If the linked service row is missing, responses should be handled carefully in the UI because a `DocRec` row may still exist.

## Related Docs

- [docs/BACKEND_API.md](./BACKEND_API.md)
- [docs/SYNC_PATTERNS.md](./SYNC_PATTERNS.md)