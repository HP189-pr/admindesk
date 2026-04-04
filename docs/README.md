# AdminDesk Documentation Hub

Last updated: March 12, 2026

This folder is the current entry point for system documentation. It groups the live backend, frontend, security, deployment, operations, sync, and feature notes in one place.

## Start Here

- [Backend API and runtime overview](./BACKEND_API.md)
- [Frontend shell and build guide](./FRONTEND_GUIDE.md)
- [Models and domain map](./MODELS_SCHEMA.md)
- [Authentication and RBAC](./PERMISSIONS_RBAC.md)
- [Google Sheets sync](./GOOGLE_SHEETS_SYNC.md)
- [Data analysis and reporting](./DATA_ANALYSIS.md)
- [Deployment and network operations](./DEPLOYMENT.md)
- [Unified DocRec and service API workflows](./UNIFIED_API.md)
- [Service sync patterns](./SYNC_PATTERNS.md)
- [Feature and schema notes](./FEATURE_NOTES.md)
- [Operational scripts](./OPERATIONS_SCRIPTS.md)
- [Changelog](./CHANGELOG.md)

## Current Runtime Matrix

| Mode | Frontend | Backend | Notes |
| --- | --- | --- | --- |
| Development | `http://127.0.0.1:3000/dashboard` | `http://127.0.0.1:8001` | Vite proxies `/api`, `/media`, and `/ws` to Daphne |
| Preview / prod-style local run | `http://127.0.0.1:8081/dashboard` | `http://127.0.0.1:8001` | Matches `start_network.bat prod` and the always-on backend service |
| Network dev | `http://<host-ip>:3000/dashboard` | `http://<host-ip>:8001` | Use `start_network.bat dev` |
| Network prod-style | `http://<host-ip>:8081/dashboard` | `http://<host-ip>:8001` | Use `start_network.bat prod` |

## Canonical Docs In This Folder

| File | Scope | Use when |
| --- | --- | --- |
| [docs/BACKEND_API.md](./BACKEND_API.md) | Active backend architecture, endpoint families, runtime | You are changing API behavior or backend startup |
| [docs/FRONTEND_GUIDE.md](./FRONTEND_GUIDE.md) | React shell, page loading, build/runtime behavior | You are changing navigation, pages, or frontend bundling |
| [docs/MODELS_SCHEMA.md](./MODELS_SCHEMA.md) | Domain and model layout across backend modules | You need to locate the right backend data module |
| [docs/PERMISSIONS_RBAC.md](./PERMISSIONS_RBAC.md) | JWT flow, permissions endpoints, wrappers | You are working on login, auth state, or access control |
| [docs/GOOGLE_SHEETS_SYNC.md](./GOOGLE_SHEETS_SYNC.md) | Mail/transcript sync behavior and commands | You are changing Google Sheets integrations |
| [docs/DATA_ANALYSIS.md](./DATA_ANALYSIS.md) | Analysis screens, exports, and search/report flows | You are working on reporting or admin analysis tools |
| [docs/DEPLOYMENT.md](./DEPLOYMENT.md) | Current launch commands and deployment notes | You are running the app locally, over LAN, or in prod-style mode |
| [docs/UNIFIED_API.md](./UNIFIED_API.md) | DocRec plus service atomic workflow reference | You are changing doc receive edit or delete flows |
| [docs/SYNC_PATTERNS.md](./SYNC_PATTERNS.md) | Signal sync and sheet sync behavior | You are changing synchronization or background consistency rules |
| [docs/FEATURE_NOTES.md](./FEATURE_NOTES.md) | Focused implementation notes for search and schema changes | You need historical context for specific feature-level changes |
| [docs/OPERATIONS_SCRIPTS.md](./OPERATIONS_SCRIPTS.md) | Script roles for build and backend startup helpers | You are reviewing helper scripts or operator workflows |
| [docs/CHANGELOG.md](./CHANGELOG.md) | Notable release history and recent cleanup notes | You need historical context for recent changes |

## Project Overview

AdminDesk combines:

- student services such as enrollment, verification, migration, provisional, degree, and student search
- document workflows such as doc receive, institutional verification, and inward/outward registers
- office requests such as mail requests and transcript requests with Google Sheets sync
- finance, inventory, CCTV, leave management, dashboard preferences, and websocket chat

The frontend mainly exposes `/login` and `/dashboard`. Inside `/dashboard`, `WorkArea.jsx` switches pages based on sidebar state rather than many separate browser routes.

## Documentation Conventions

- Treat the files in `docs/` as the primary high-level documentation set.
- Keep focused implementation notes in this folder so the repository has one markdown home.
- When runtime defaults change, update `docs/README.md`, `docs/DEPLOYMENT.md`, and `docs/BACKEND_API.md` together.
- When auth or permission behavior changes, update `docs/PERMISSIONS_RBAC.md` and verify the linked endpoints still match `backend/api/urls.py`.
- When build or code-splitting behavior changes, update `docs/FRONTEND_GUIDE.md`.

## Suggested Reading Order

1. Start with [docs/README.md](./README.md) for the current project summary.
2. Use [docs/DEPLOYMENT.md](./DEPLOYMENT.md) to boot the app in the right mode.
3. Read [docs/BACKEND_API.md](./BACKEND_API.md) and [docs/FRONTEND_GUIDE.md](./FRONTEND_GUIDE.md) before changing feature behavior.
4. Use the focused guides only when you are touching that exact subsystem.
