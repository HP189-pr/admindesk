# Models and Domain Map

Last updated: March 12, 2026

The backend schema is split across domain-focused modules instead of one monolithic file. This guide is a map to the active data areas, not an exhaustive field-by-field dump.

## Where the Schema Lives

| File area | Purpose |
| --- | --- |
| `backend/api/models.py` | Aggregated model exports used across the app |
| `backend/api/domain_models.py` | Shared or base model definitions |
| `backend/api/domain_core.py` | Core user, profile, permission, and common models |
| `backend/api/domain_enrollment.py` | Enrollment and admission-related entities |
| `backend/api/domain_verification.py` | Verification records and related student service data |
| `backend/api/domain_degree.py` | Degree records and related academic outputs |
| `backend/api/domain_documents.py` | Document receipt and related workflow entities |
| `backend/api/domain_mail_request.py` | Official mail request records |
| `backend/api/domain_transcript_generate.py` | Transcript request records |
| `backend/api/domain_emp.py` and `domain_leave_balance.py` | Employee and leave-related entities |
| `backend/api/domain_logs.py` | Activity and audit logging |
| `backend/api/cash_register.py`, `in_out_register.py`, `inventory.py` | Finance and office operation entities |

## Domain Overview

### Identity, users, and permissions

This area covers:

- User accounts and profile data
- Navigation and module permissions
- Admin-access checks and password-change flows
- Holidays and shared organization-level settings used by dashboards and leave views

### Student services

This area covers:

- Enrollment and student profile records
- Verification, migration, provisional, and degree outputs
- Student search data sources
- Relationships between student service records and document-receive entries

### Document workflows

This area covers:

- Doc receive records and related status fields
- Institutional verification and institutional letter workflows
- Inward and outward register records
- Auto-sync relationships between DocRec and linked service rows

### Office requests and integrations

This area covers:

- Mail requests
- Transcript requests
- Google Sheets import and sync metadata
- PDF generation flags and status tracking for request-processing flows

### Finance and inventory

This area covers:

- Receipts and cash-register-compatible data
- Student fee ledgers and fee type masters
- Inventory tracking and related approval-style flows

### HR and leave

This area covers:

- Employee profiles
- Leave types, leave allocations, and leave entries
- Live balance calculation inputs and outputs
- Leave calendar/report support data

### Logging and operational records

This area covers:

- Request logs
- Activity logs
- Error-tracking models and operational history where present

## Important Relationships

### DocRec to service sync

The repository keeps document-receive and service records aligned through shared logic and signals. See [docs/SYNC_PATTERNS.md](./SYNC_PATTERNS.md) for the current behavior summary.

### Transcript and mail request sync

Transcript and mail request records carry status fields that are pushed to Google Sheets from API update flows. See [docs/GOOGLE_SHEETS_SYNC.md](./GOOGLE_SHEETS_SYNC.md).

### Leave balance engine

Leave balances are calculated from source records rather than maintained only as snapshots. The active calculation logic lives in `backend/api/leave_engine.py`.

## When to Edit Which File

- Add or change a student-service field: start in the matching `domain_*` file and serializer file.
- Add or change API representation: update the matching serializer and viewset.
- Add a shared model import: update `backend/api/models.py` only after the domain model is correct.
- Add a reporting-only transformation: prefer report utilities or serializers instead of bloating the base model.

## Recommended Verification Steps

After schema-affecting changes:

```powershell
cd backend
..\.venv\Scripts\python.exe manage.py makemigrations api
..\.venv\Scripts\python.exe manage.py migrate
..\.venv\Scripts\python.exe manage.py check
```

## Related Docs

- [docs/BACKEND_API.md](./BACKEND_API.md)
- [docs/PERMISSIONS_RBAC.md](./PERMISSIONS_RBAC.md)
- [docs/FEATURE_NOTES.md](./FEATURE_NOTES.md)
