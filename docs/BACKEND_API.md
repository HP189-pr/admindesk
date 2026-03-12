# Backend API Guide

Last updated: March 12, 2026

This file is the backend guide for the current live system. Focused workflow notes now live in other files inside `docs/`.

## Runtime Defaults

| Mode | Bind | Main use |
| --- | --- | --- |
| Dev | `127.0.0.1:8001` | Local Vite development with WebSocket chat |
| Prod-style local / LAN | `0.0.0.0:8000` | Preview, LAN access, or service-style startup |

Use `backend/start_backend.bat` rather than `manage.py runserver` when you need the real ASGI stack.

## Request Flow

```text
Browser
  -> Vite frontend (3000 dev / 8081 preview)
  -> /api, /media, /ws proxy
  -> Django + DRF + Channels via Daphne
  -> PostgreSQL, media storage, Google Sheets
```

## Main Backend Areas

| Area | Primary files | Notes |
| --- | --- | --- |
| Settings and ASGI | `backend/backend/settings.py`, `backend/backend/asgi.py`, `backend/backend/urls.py` | Runtime config, static/media handling in debug, Channels setup |
| API routing | `backend/api/urls.py` | Central API route registration |
| Domain models | `backend/api/domain_*.py`, `backend/api/models.py` | Business entities split by functional area |
| Serializers | `backend/api/serializers_*.py`, `backend/api/serializers.py` | DRF serializers by domain plus compatibility exports |
| Feature views | `backend/api/views_*.py` and feature modules | Student services, admin flows, leaves, mail, transcript, CCTV |
| Shared uploads | `backend/api/excel_import/` | Shared Excel engine used by API and Django admin upload flows |
| Google Sheets sync | `backend/api/sheets_sync.py` | Transcript and mail request updates |
| Chat | `backend/api/chatbox/` | WebSocket routing, auth middleware, consumers |
| Reports | `backend/reports/` and PDF-capable feature views | Leave/report APIs plus ReportLab outputs |

## Endpoint Families

The API surface is large, but the current app groups it into a few stable families.

### Core and security

- `/api/health/`
- `/api/backlogin/`
- `/api/token/refresh/`
- `/api/token/verify/`
- `/api/profile/`
- `/api/change-password/`
- `/api/check-admin-access/`
- `/api/verify-admin-panel-password/`
- `/api/my-navigation/`
- `/api/userpermissions/`
- `/api/dashboard-preferences/`

### Student and academic services

- Enrollment, verification, migration, provisional, degree, student profile, and student search routes
- Institutional verification / letter endpoints, including legacy aliases retained for compatibility
- Transcript and mail request endpoints

### Office, finance, and operations

- Doc receive and related unified workflows
- Inward and outward register APIs
- Receipts, cash register compatibility routes, fee types, and student fee ledgers
- Inventory and CCTV APIs

### HR and leave

- Employee profile, leave type, leave allocation, leave entry, and leave balance/report endpoints
- Holiday and calendar-related routes used by the frontend leave screens

## Excel and Bulk Upload Architecture

The current upload stack is centralized under `backend/api/excel_import/`.

### Why it matters

- One registry maps a `service` value to the right reader and importer.
- Both API uploads and admin uploads use the same parsing and validation pipeline.
- This reduces drift between upload entry points.

### Current entry points

- API upload handlers under `backend/api/view_bulkupload.py`
- Django admin upload helpers under `backend/api/admin_excelupload.py`
- Shared registry and importers under `backend/api/excel_import/`

## Google Sheets Integration

The active sync paths are mail requests and transcript requests.

- Sync helpers live in `backend/api/sheets_sync.py`.
- Transcript sync follows the direct update pattern summarized in [docs/SYNC_PATTERNS.md](./SYNC_PATTERNS.md).
- Sync is triggered from the API update flows, not from background queues by default.

## Unified Workflows and Synchronization

- Doc receive uses unified update and delete flows for service-aware edits. See [docs/UNIFIED_API.md](./UNIFIED_API.md).
- DocRec-to-service synchronization and transcript sync behavior are summarized in [docs/SYNC_PATTERNS.md](./SYNC_PATTERNS.md).
- Recent feature-level schema notes, including verification-model alignment and the degree contact field, are summarized in [docs/FEATURE_NOTES.md](./FEATURE_NOTES.md).

## Reports, PDFs, and Media

- Institutional verification PDFs are generated directly in Python with ReportLab.
- CCTV reports also generate PDF output from backend code.
- Django serves media and static files in debug mode, including when running under Daphne.
- The old HTML-based `backend/api/templates/pdf_templates/` path is no longer part of the active institutional PDF flow.

## Chat and Realtime

- WebSocket entry: `/ws/chat/`
- ASGI app: `backend/backend/asgi.py`
- Middleware: JWT-aware chat auth middleware in `backend/api/chatbox/`

If chat is failing locally, verify that the backend is running on the port expected by the frontend environment and Vite proxy.

## Operations Reference

### Development start

```powershell
cd backend
start_backend.bat dev 127.0.0.1 8001
```

### Prod-style local or LAN start

```powershell
cd backend
start_backend.bat prod 0.0.0.0 8000
```

### Validate Django configuration

```powershell
cd backend
..\.venv\Scripts\python.exe manage.py check
```

## Related Docs

- [docs/PERMISSIONS_RBAC.md](./PERMISSIONS_RBAC.md)
- [docs/GOOGLE_SHEETS_SYNC.md](./GOOGLE_SHEETS_SYNC.md)
- [docs/UNIFIED_API.md](./UNIFIED_API.md)
- [docs/SYNC_PATTERNS.md](./SYNC_PATTERNS.md)
- [docs/FEATURE_NOTES.md](./FEATURE_NOTES.md)
