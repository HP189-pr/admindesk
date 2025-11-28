API Architecture & Recent API Changes
=====================================

Overview
--------
This document describes the API layout and the recent domain changes (Nov 2025+) related to
DocRec / Verification / service-table syncing and frontend expectations. It complements the
module-level notes and serves as a quick reference for backend maintainers and frontend
developers integrating with the API.

High-level goals covered here
-----------------------------
- Provide robust two-way synchronization between `doc_rec` rows and service tables (Verification/InstVerification/Migration/Provisional/etc.) on the server-side so the frontend doesn't need to manually create service rows.
- Improve verification/docrec UX: show `Doc Rec ID` as the sequence, format dates as `dd-mm-yyyy` on the frontend, auto-resolve enrollment on Doc Receive, and avoid duplicate DocRec rows on uploads.
- Make serializer and model shapes stable and forgiving (accept enrollment as PK or enrollment_no; expose doc_rec date on verification payloads).

Key Files / Modules
-------------------
- `backend/api/serializers_documents.py` — Verification + related serializers. Notable serializer behavior:
  - `VerificationSerializer` now exposes `doc_rec_date` (read-only) mapped from `doc_rec.doc_rec_date` to make the DocRec date available at the top level.
  - `sequence` SerializerMethodField returns the `doc_rec.doc_rec_id` so frontend shows Doc Rec ID instead of numeric sequence.
  - `doc_rec_id` is accepted as a write-field (maps to `doc_rec` FK by `doc_rec_id`) for creating/updating links.
  - `validate()` resolves `enrollment` from incoming `enrollment` (PK) or `enrollment_no` (case-insensitive lookup).

- `backend/api/domain_verification.py` — verification model changes:
  - `date` is stored using DB column `doc_rec_date` (DateField defaulting to now).
  - `vr_done_date` is stored on column `vr_done_date` (nullable DateField) and is used as the "Done Date" in UI.
  - `enrollment` FK is allowed to be `null=True` (Django-level change; DB migration required) so placeholder Verification rows can be created for DocRec rows whose enrollment is unknown at insertion time.

- `backend/api/signals.py` — new module with `post_save` handlers:
  - Ensures service rows exist when DocRec or service-table rows are saved (best-effort, exceptions swallowed so primary save is not blocked).
  - Copies common fields (e.g., `doc_rec_remark`, `pay_rec_no`) between DocRec and linked service rows.

- `backend/api/management/commands/sync_docrec_services.py` — reconciliation command:
  - Retroactively scans `doc_rec` rows and creates placeholder service rows for missing entries (useful after introducing the signals).
  - Usage examples (run from `backend`):
    ```powershell
    python manage.py sync_docrec_services --service=VR
    python manage.py sync_docrec_services --service=IV
    ```

Frontend expectations
---------------------
- `src/pages/verification.jsx`:
  - Table shows a `Doc Rec ID` column (via `doc_rec_key` / `sequence`) instead of the legacy numeric sequence.
  - Date presentation: frontend uses `dd-mm-yyyy` format. It prefers, in order: verification `date` (top-level), `doc_rec_date` (now present on the verification payload), or `createdat` as a fallback. The Done Date column prefers `vr_done_date` and falls back to verification date/doc_rec date if `vr_done_date` is absent.

- `src/pages/doc-receive.jsx`:
  - When enrollment is entered/resolved, student_name is auto-filled and a linked Verification row is created (status IN_PROGRESS) either server-side via signals or client-side fallback.
  - Uploads and search treat doc_rec-like queries (prefixes like `vr_`, `iv_`, `pr_`, `mg_`, `gt_`) specially and filter by `doc_rec` identifier.

Behavior & Compatibility Notes
-----------------------------
- Verification dates
  - `date` in the `Verification` model maps to DB column `doc_rec_date`. `vr_done_date` is the field used for "Done Date" in reports and UI.

- Enrollment resolution
  - The `VerificationSerializer` validate logic accepts either a numeric primary key for `enrollment` or a string enrollment number. The lookup is case-insensitive for the enrollment number.

- Admin / bulk uploads
  - Upload flow normalizes enrollment numbers (case-insensitive) and upserts DocRec rows by `doc_rec_id` to avoid duplicate doc_rec entries.

- Two-way server sync
  - Signal handlers and viewset hooks attempt to keep DocRec and service table rows in sync: creating a DocRec may auto-create a placeholder Verification/IV row; saving a service row may ensure a DocRec exists. These are best-effort and will not raise for transient errors.

Migration & Operational Notes
----------------------------
- Important: the codebase expects `Verification.enrollment` to be nullable in the DB. If you added the model change locally, you must run migrations so the DB column allows NULL.

- Migration conflict troubleshooting (observed during development):
  - In some environments a migration (e.g., `api.0035_add_mail_req_no`) may attempt to add a column that already exists in the DB, causing `migrate` to abort. If you confirm the DB already has that column, mark the migration as applied (fake) and continue:
    ```powershell
    # from e:\admindesk\backend
    python manage.py showmigrations api
    python manage.py migrate api 0035 --fake
    python manage.py migrate
    ```
  - After migrations are applied, run the reconciliation command to create placeholder rows:
    ```powershell
    python manage.py sync_docrec_services --service=VR
    ```

API verification & debugging
-----------------------------
- Quick checks (examples):
  - Verify verification payload includes `doc_rec_date` and `vr_done_date`:
    ```powershell
    curl -s -H "Authorization: Bearer <token>" "http://127.0.0.1:8000/api/verification/?limit=1" | jq .
    ```
    Look for `doc_rec_date` (yyyy-mm-dd) and `vr_done_date` fields in the returned object.

- If the frontend shows blank Date in the verification grid:
  1. Inspect the API JSON — verify whether `date`, `doc_rec_date`, or `createdat` are present for the affected rows.
  2. If `doc_rec_date` is missing but exists on the nested `doc_rec` object, ensure the serializer change (exposing `doc_rec_date`) is deployed and the server restarted.

Testing
-------
- Run the Django tests as usual; additional smoke checks include verifying that `sync_docrec_services` returns created counts and that a sample `doc_rec` like `vr_25_0931` results in a `Verification` row after reconciliation.

Changelog (Recent)
------------------
2025-11-26: Added server-side doc_rec↔service sync (signals); made `Verification.enrollment` nullable at model level; added `doc_rec_date` field to `VerificationSerializer`; updated frontend mapping to show Doc Rec ID and format dates dd-mm-yyyy; added management command `sync_docrec_services`.

Ownership & Maintenance
-----------------------
Follow existing naming conventions. For the new sync logic, ensure signal handlers remain idempotent and intentionally swallow non-fatal exceptions so primary writes are not interrupted. When adding further reconciliation logic, prefer incremental, idempotent steps and add a dedicated management command for large data migrations.

Questions / Improvements
------------------------
- Consider converting best-effort signal handlers into queue-backed tasks (Celery/RQ) for safer retry and observability on production workloads.

End of document.