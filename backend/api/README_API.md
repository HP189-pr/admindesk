# AdminDesk - Current System Documentation
Django + DRF + Channels + React + Vite + PostgreSQL

Last Updated: March 12, 2026

---

## Table of Contents
1. System Overview
2. Current Runtime and Ports
3. Technology Stack
4. Architecture Overview
5. Authentication and Authorization
6. Backend API Surface
7. Bulk Upload and Excel Import Architecture
8. Google Sheets Integration
9. PDF, Reports, and Media
10. Frontend Application
11. Development and Operations
12. Recent Updates
13. Reference Files

---

## System Overview

AdminDesk is a university administration platform that combines student services, office workflows, finance, leave management, internal chat, and reporting in a single React + Django system.

The currently active feature areas are:

- Student services: enrollment, verification, migration, provisional, degree, student profiles, student search.
- Document workflows: doc receipt, institutional letter / institutional verification, inward and outward registers.
- Finance: fee types, receipts, cash outward, cash-on-hand reports, student fees ledger.
- Office operations: official mail requests, transcript requests, CCTV monitoring, inventory.
- HR and leave: employee profiles, leave types, allocations, leave entries, balance and reporting endpoints.
- Shared platform services: JWT auth, role-based navigation, dashboard preferences, admin tools, bulk imports, Google Sheets sync, audit logging, media delivery, WebSocket chat.

Two naming notes matter in the current codebase:

- The institutional verification PDF flow is now centered on `InstLetter` code and routes, but legacy `inst-verification/*` aliases still exist for older clients.
- The `cash-register/` API route is kept as a backward-compatible alias; new clients should prefer the `receipts/` route family.

---

## Current Runtime and Ports

### Development defaults

| Service | Default URL | Source of truth |
|---------|-------------|-----------------|
| Frontend dev server | `http://127.0.0.1:3000/dashboard` | `vite.config.js` |
| Backend ASGI server | `http://127.0.0.1:8001` | `backend/start_backend.bat`, `vite.config.js`, `src/api/axiosInstance.js` |
| WebSocket chat | `ws://127.0.0.1:8001/ws/chat/` | `backend/backend/asgi.py`, `backend/api/chatbox/routing.py` |

### Production / preview defaults

| Service | Default URL | Source of truth |
|---------|-------------|-----------------|
| Frontend preview | `http://127.0.0.1:8081/dashboard` | `vite.config.js`, `start_network.bat` |
| Backend ASGI server | `http://127.0.0.1:8000` | `backend/start_backend.bat`, `start_network.bat` |

### Important operational behavior

- Vite proxies `/api`, `/media`, and `/ws` to the backend origin.
- Local frontend URLs on ports `3000`, `5173`, `5174`, and `8081` are normalized to backend port `8001` in development.
- The backend should be run with Daphne / ASGI when chat or WebSocket features are required.
- Django development static and media serving is enabled in `backend/backend/urls.py` when `DEBUG=True`, including when the app is served by Daphne.

---

## Technology Stack

### Backend

- Django
- Django REST Framework
- djangorestframework-simplejwt
- Channels + Daphne
- PostgreSQL
- pandas, openpyxl, xlrd
- ReportLab
- gspread for Google Sheets sync
- Optional PDF helpers available in dependencies: WeasyPrint, xhtml2pdf

### Frontend

- React 18
- Vite 6
- React Router DOM 6
- Axios
- Tailwind CSS + PostCSS
- `xlsx` for spreadsheet-related UI workflows
- `jspdf` and `jspdf-autotable` for client-side PDF/report export where needed

### Integration and deployment

- Google Sheets service-account integration
- Media file serving through Django in development
- Windows batch launchers for local dev and network-facing preview / production-style startup

---

## Architecture Overview

### High-level request flow

```text
Browser
  -> React app on Vite (3000 dev / 8081 preview)
  -> /api, /media, /ws proxied to Django ASGI backend
  -> Django + DRF + Channels (8001 dev / 8000 prod)
  -> PostgreSQL, Google Sheets, media storage
```

### Backend structure

```text
backend/
├── api/
│   ├── domain_*.py              # Domain model modules
│   ├── serializers_*.py         # DRF serializers by domain
│   ├── views_*.py               # API views and viewsets
│   ├── excel_import/            # Shared Excel import engine, registry, importers
│   ├── chatbox/                 # WebSocket chat auth, routing, consumers, API views
│   ├── cctv/                    # CCTV monitoring APIs and PDF output
│   ├── management/commands/     # Operational commands
│   ├── middleware_logs.py       # Request / exception logging
│   ├── sheets_sync.py           # Google Sheets push helpers
│   └── urls.py                  # API routing
├── reports/
│   ├── urls.py                  # `/api/reports/*`
│   └── utils/                   # Report helpers (leave calendar, etc.)
├── backend/
│   ├── settings.py
│   ├── urls.py
│   └── asgi.py
└── manage.py
```

### Frontend structure

```text
src/
├── App.jsx                      # Router entrypoint
├── pages/                       # Feature pages
├── components/                  # Shared UI and admin tools
├── hooks/                       # Auth wrappers and shared hooks
├── services/                    # API helper modules
├── api/                         # Axios base instance and API origin logic
├── Menu/                        # Sidebar navigation
└── utils/                       # Shared utilities
```

### Current frontend routing model

The current UI no longer uses many top-level React routes for individual modules. Instead:

- React Router exposes `/login` and a protected `/dashboard` shell.
- `App.jsx` mounts `Layout` at `/dashboard`.
- `WorkArea.jsx` switches page content based on the currently selected sidebar label.
- Chat and popup student search remain mounted alongside the dashboard shell.

This is important when debugging navigation: most page switching is state-driven inside the dashboard shell, not path-driven.

---

## Authentication and Authorization

### Login flow

- Primary login endpoint: `/api/backlogin/`
- Refresh endpoint: `/api/token/refresh/`
- Token verification endpoint: `/api/token/verify/`

The backend login view supports either:

- username
- `usercode` fallback through raw DB lookup

The frontend stores:

- `access_token`
- `refresh_token`
- `user`

### Frontend auth behavior

- `src/hooks/AuthContext.jsx` owns login, token refresh, profile fetch, admin-password verification, and logout.
- `src/api/axiosInstance.js` resolves the backend origin dynamically and attaches the `Authorization: Bearer <access_token>` header automatically.
- `App.jsx` protects `/dashboard` with `ProtectedRoute`.

### Permission model

Module and menu access still comes from user permissions exposed by:

- `/api/my-navigation/`
- `/api/userpermissions/`

The current frontend permission wrappers include:

- `AuthInventory`
- `AuthDocRegister`
- `AuthFees`
- `AuthCCTV`

### Admin access checks

- `/api/check-admin-access/`
- `/api/verify-admin-panel-password/`

Current behavior:

- In development, admin panel password verification can be treated as disabled when no secret is configured.
- Outside development, the API returns an error if the admin secret is not configured.
- Admin password changes now use Django password validation, not only a length check.

---

## Backend API Surface

Base API prefix:

```text
http://127.0.0.1:8001/api/
```

Use `8000` instead of `8001` for production-style startup.

### Core and auth endpoints

| Endpoint | Purpose |
|----------|---------|
| `/api/health/` | Simple health response |
| `/api/backlogin/` | JWT login |
| `/api/token/refresh/` | Refresh JWT access token |
| `/api/token/verify/` | Verify JWT token |
| `/api/userlogin/` | Alternate login endpoint retained in backend |
| `/api/profile/` | User profile retrieve / update |
| `/api/profile-picture/` | Profile picture API |
| `/api/change-password/` | Self-service password change |
| `/api/users/<id>/change-password/` | Admin password change |
| `/api/check-admin-access/` | Server-side admin check |
| `/api/verify-admin-panel-password/` | Admin panel verification |
| `/api/my-navigation/` | Current user menu / module rights |
| `/api/userpermissions/` | Permission CRUD / listing |
| `/api/dashboard-preferences/` | Dashboard preference state |
| `/api/users/` and `/api/users/<id>/` | User management |
| `/api/holidays/` | Holiday CRUD |

### Student and academic services

| Endpoint | Purpose |
|----------|---------|
| `/api/enrollments/` | Enrollment CRUD |
| `/api/enrollment-stats/` | Enrollment stats |
| `/api/admission-cancel/` | Admission cancellation records |
| `/api/student-profiles/` | Student profile CRUD |
| `/api/student-search/` | Search across student records |
| `/api/verification/` | Verification CRUD |
| `/api/migration/` | Migration record CRUD |
| `/api/provisional/` | Provisional record CRUD |
| `/api/degrees/` | Student degree CRUD |
| `/api/convocations/` | Convocation master data |
| `/api/eca/` | ECA-related records |

### Document and institutional letter workflows

| Endpoint | Purpose |
|----------|---------|
| `/api/docrec/` | Document receipt CRUD |
| `/api/inst-verification-main/` | Main institutional letter records |
| `/api/inst-verification-student/` | Institutional letter student rows |
| `/api/inst-letter/generate-pdf/` | Preferred institutional letter PDF endpoint |
| `/api/inst-letter/suggest-doc-rec/` | Preferred doc_rec suggestion endpoint |
| `/api/inst-letter/debug/` | Preferred debug endpoint |
| `/api/inst-verification/generate-pdf/` | Legacy alias |
| `/api/inst-verification/suggest-doc-rec/` | Legacy alias |
| `/api/inst-verification/debug/` | Legacy alias |

### Office operations and registers

| Endpoint | Purpose |
|----------|---------|
| `/api/mail-requests/` | Official mail request CRUD |
| `/api/transcript-requests/` | Transcript request CRUD |
| Inward / outward endpoints from `IN_OUT_REGISTER_URLS` | Internal / external register flows |
| `/api/inventory-items/` | Inventory items |
| `/api/inventory-inward/` | Inventory inward |
| `/api/inventory-outward/` | Inventory outward |
| `/api/inventory-stock-summary/` | Stock summary report |
| `/api/exam/`, `/api/centre/`, `/api/dvd/`, `/api/cctv-outward/` | CCTV monitoring module |

### Finance and fees

| Endpoint | Purpose |
|----------|---------|
| `/api/fee-types/` | Fee type master |
| `/api/receipts/` | Current receipt API |
| `/api/cash-register/` | Backward-compatible alias |
| `/api/cash-outward/` | Cash outward entries |
| `/api/cash-on-hand/report/` | Cash-on-hand report |
| `/api/cash-on-hand/close/` | Close cash day action |
| `/api/student-fees/` | Student fees ledger API |

### Leave and employee module

| Endpoint | Purpose |
|----------|---------|
| `/api/empprofile/` | Employee profiles |
| `/api/leavetype/` | Leave types |
| `/api/leave-periods/` | Leave periods |
| `/api/leaveentry/` | Leave entries |
| `/api/leave-allocations/` | Leave allocation list / detail |
| `/api/my-leave-balance/` | Logged-in user leave balance |
| `/api/leave-report/` | Core leave report endpoint |
| `/api/leave-report/employee-summary/` | Leave summary by employee |
| `/api/leave-report/employee-range/` | Leave date-range report |
| `/api/leave-report/multi-year/` | Multi-year leave report |
| `/api/leave-report/all-employees-balance/` | Balance report across employees |
| `/api/reports/leave-calendar/` | Leave calendar report endpoint |

### Chat endpoints

| Endpoint | Purpose |
|----------|---------|
| `/api/chat/ping/` | Availability check |
| `/api/chat/presence/` | Presence information |
| `/api/chat/send/` | Send message |
| `/api/chat/history/<userid>/` | Message history |
| `/api/chat/files/<userid>/` | File history |
| `/api/chat/clear/<userid>/` | Clear chat |
| `/api/chat/pending-files/` | Pending file delivery |
| `/api/chat/mark-downloaded/` | Mark file downloaded |
| `/api/chat/mark-seen/` | Mark message seen |
| `/ws/chat/` | WebSocket endpoint |

### Utility and admin endpoints

| Endpoint | Purpose |
|----------|---------|
| `/api/bulk-upload/` | Shared API bulk upload |
| `/api/data-analysis/` | Analytics / duplicate detection |
| `/api/admin/upload-docrec/` | Admin document receipt upload |
| `/api/admin/upload-cash-excel/` | Admin cash upload |
| `/api/modules/`, `/api/menus/`, `/api/modules/<id>/menus/` | Module / menu configuration |
| `/api/institutes/`, `/api/mainbranch/`, `/api/subbranch/`, `/api/institute-course-offerings/` | Course and institute master data |

---

## Bulk Upload and Excel Import Architecture

Bulk upload behavior changed materially and the current README should treat it as shared infrastructure, not isolated feature code.

### Current architecture

The current import stack lives in `backend/api/excel_import/` and is shared by:

- API bulk upload: `backend/api/view_bulkupload.py`
- Django admin model uploads: `backend/api/admin_excelupload.py`

Key modules:

- `registry.py` - service / model to importer mapping
- `engine.py` - common execution pipeline
- `readers.py` - workbook reading with deterministic engine fallback
- `column_mapper.py` - canonical header resolution and aliases
- `controller_utils.py` - preview and controller helpers
- `import_specs.py` - allowed columns and requirements
- `importers/*.py` - row-level importer implementations

### API bulk upload behavior

`/api/bulk-upload/` currently supports:

- template download via `GET`
- sample template generation via `GET ?sample=true`
- progress polling via `GET ?upload_id=<id>`
- file upload and row processing via `POST`

Current bulk services registered in `registry.py` include:

- `DOCREC`
- `INSTITUTE`
- `INSTITUTIONAL_VERIFICATION`
- `ENROLLMENT`
- `MIGRATION`
- `PROVISIONAL`
- `VERIFICATION`
- `DEGREE`
- `EMP_PROFILE`
- `LEAVE`
- `STUDENT_FEES`
- `STUDENT_PROFILE`

### Admin Excel upload behavior

The admin-side upload mixin now:

- stores the uploaded workbook in session
- auto-detects the best header row
- previews normalized columns and rows
- uses the same importer registry and engine as the API flow
- supports `.xlsx` and `.xls`

### Reader behavior worth documenting

The current Excel reader intentionally does more than `pd.read_excel(...)`:

- deterministic engine choice for `.xlsx` and `.xls`
- support for mixed or mislabeled uploads
- fallback parsing of text-delimited content that arrives with Excel extensions

This behavior exists to support real-world uploads from admin and staff users, not only ideal workbooks.

---

## Google Sheets Integration

Google Sheets sync remains active and is implemented in `backend/api/sheets_sync.py`.

### Active integrations

- mail requests
- transcript requests
- CCTV import helpers

### Current implementation notes

- Authentication uses a service-account JSON file.
- The backend reads the path from `GOOGLE_SERVICE_ACCOUNT_FILE` or related settings.
- `gspread` is used directly in both sync helpers and management commands.
- Transcript sync also includes a queue processor command for pending updates.

### Relevant management commands

- `python manage.py import_mail_requests`
- `python manage.py import_transcript_requests`
- `python manage.py sync_transcript_queue`

### Recommended configuration note

Keep the service-account file outside version control and point to it through environment configuration rather than hardcoding paths.

---

## PDF, Reports, and Media

### Institutional letter PDF generation

The institutional letter PDF path is currently code-driven in `backend/api/views_Letter.py`.

Important current facts:

- PDF generation uses ReportLab directly.
- QR content is generated in Python during the PDF build.
- The old `backend/api/templates/pdf_templates/` HTML templates are no longer used and were removed from the workspace.
- The preferred endpoint is `/api/inst-letter/generate-pdf/`, with legacy aliases retained for older clients.

### CCTV PDF generation

The CCTV outward flow also generates PDFs from Python using ReportLab in `backend/api/cctv/views_cctv.py`.

### Reports app

The separate reports app is still mounted under:

- `/api/reports/leave-calendar/`

### Media serving in development

When `DEBUG=True`, `backend/backend/urls.py` serves:

- collected static assets needed by Django admin
- uploaded media files under `MEDIA_URL`

---

## Frontend Application

### Current routing model

| Route | Purpose |
|-------|---------|
| `/login` | Login screen |
| `/dashboard` | Protected application shell |

Inside `/dashboard`, `WorkArea.jsx` chooses which page to render based on sidebar selection.

### Current major frontend pages and shells

- Dashboard (`CustomDashboard`)
- Verification
- Migration
- Provisional
- Enrollment
- Degree
- Inst Letter
- Doc Receive
- Mail Request
- Transcript Request
- Student Search
- Record
- Employee Leave
- Profile Update
- Admin Dashboard
- Permission-wrapped modules: inventory, doc register, fees, CCTV

### Shared frontend infrastructure

- `AuthProvider` centralizes login, refresh, profile, admin password verification, and user CRUD helpers.
- `axiosInstance.js` resolves backend origin dynamically and keeps `/api/*` in request paths.
- `ChatBox` stays mounted on the dashboard shell.
- `PopupSearch` stays mounted globally in the dashboard shell.

### Frontend build and serve behavior

- Dev server: `3000`, strict port enforced
- Preview server: `8081`, strict port enforced
- Proxy targets are derived from environment or from local-port normalization

---

## Development and Operations

### Install and bootstrap

Backend:

```powershell
cd e:\admindesk\backend
e:\admindesk\.venv\Scripts\python.exe -m pip install -r requirements.txt
e:\admindesk\.venv\Scripts\python.exe manage.py migrate
```

Frontend:

```powershell
cd e:\admindesk
npm install
```

### Start the system

Recommended full-stack dev launcher:

```powershell
cd e:\admindesk
start_network.bat dev
```

Manual backend start:

```powershell
cd e:\admindesk\backend
start_backend.bat dev 127.0.0.1 8001
```

Manual frontend dev start:

```powershell
cd e:\admindesk
npm run dev -- --host 127.0.0.1 --port 3000
```

Production-style local preview:

```powershell
cd e:\admindesk
start_network.bat prod
```

### Why Daphne matters

Use Daphne rather than plain `manage.py runserver` when you need:

- WebSocket chat
- behavior that matches deployed ASGI startup
- correct local port alignment with the frontend proxy defaults

### Useful management commands

| Command | Purpose |
|---------|---------|
| `python manage.py check` | Django system checks |
| `python manage.py seed_roles` | Seed role / permission data |
| `python manage.py create_admin` | Create admin user |
| `python manage.py seed_leave_allocations` | Seed leave allocations |
| `python manage.py activate_period` | Activate leave period |
| `python manage.py recompute_balances` | Recompute leave balances |
| `python manage.py sync_docrec_services` | Sync doc_rec-linked service records |
| `python manage.py import_mail_requests` | Import mail requests from Google Sheets |
| `python manage.py import_transcript_requests` | Import transcript requests from Google Sheets |
| `python manage.py sync_transcript_queue` | Process queued transcript syncs |
| `python manage.py rebuild_enrollment_search` | Rebuild enrollment search data |

### Validation and smoke checks

```powershell
cd e:\admindesk\backend
e:\admindesk\.venv\Scripts\python.exe manage.py check
```

Useful API checks:

```powershell
curl http://127.0.0.1:8001/api/health/
curl -H "Authorization: Bearer <token>" http://127.0.0.1:8001/api/my-navigation/
curl -H "Authorization: Bearer <token>" http://127.0.0.1:8001/api/my-leave-balance/
```

### Operational notes

- Development frontend default is `3000`, not `5173`.
- Development backend default is `8001`, not `8000`.
- Production-style preview uses frontend `8081` and backend `8000`.
- Build before preview in production-style mode to avoid stale frontend API host values.

---

## Recent Updates

### March 2026

#### 1. Shared Excel import architecture is now the primary upload path

- `BulkUploadView` and admin Excel uploads were consolidated around the `api/excel_import/` engine, registry, and row importers.
- Degree and institutional verification flows now run through the same shared import framework instead of large isolated controller logic.
- Excel reading now uses explicit engine ordering and better fallback behavior for imperfect uploads.

#### 2. Dev and production port alignment was cleaned up

- Daphne is now the documented backend server for current runtime behavior.
- Development defaults are `3000` for Vite and `8001` for the backend.
- Production-style preview defaults are `8081` for Vite preview and `8000` for Daphne.
- `start_backend.bat` and `start_network.bat` now encode those defaults directly.

#### 3. Institutional letter PDF generation is fully code-driven

- `views_Letter.py` generates institutional verification PDFs directly with ReportLab.
- The old unused `backend/api/templates/pdf_templates/` folder was removed.
- Preferred routes now use the `inst-letter` prefix, with legacy `inst-verification` aliases retained.

#### 4. Auth and admin flows were tightened

- Login continues to support username or `usercode` fallback.
- Frontend token storage is standardized around `access_token` and `refresh_token`.
- Admin password changes use Django password validators.
- Admin panel verification fails safely outside development if no admin secret is configured.

---

## Reference Files

Useful project documentation outside this file:

- `DEPLOYMENT_GUIDE.md`
- `NETWORK_ACCESS.md`
- `UNIFIED_API_GUIDE.md`
- `STUDENT_SEARCH_FEATURE.md`
- `backend/AUTOMATIC_SYNC_GUIDE.md`
- `backend/api/TRANSCRIPT_SYNC_PATTERN.md`
- `backend/SYNC_FIX_COMPLETE.md`

---

## Summary

The current AdminDesk system is an ASGI-first Django backend with a single-shell React frontend, shared Excel import infrastructure, Google Sheets synchronization, ReportLab-based server PDF generation, and JWT + permission-driven access control.

When updating this document in the future, verify at least these files first:

- `backend/backend/settings.py`
- `backend/backend/asgi.py`
- `backend/api/urls.py`
- `backend/api/view_bulkupload.py`
- `backend/api/admin_excelupload.py`
- `backend/api/views_Letter.py`
- `src/App.jsx`
- `src/pages/WorkArea.jsx`
- `src/api/axiosInstance.js`
- `vite.config.js`
