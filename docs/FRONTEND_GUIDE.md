# Frontend Guide

Last updated: March 12, 2026

The frontend is a React 18 + Vite application that uses a protected dashboard shell instead of many top-level routes.

## Runtime Defaults

| Mode | URL | Notes |
| --- | --- | --- |
| Dev | `http://127.0.0.1:3000/dashboard` | Vite dev server with proxy to backend `8001` |
| Preview / prod-style | `http://127.0.0.1:8081/dashboard` | Vite preview, usually paired with backend `8000` |

## Application Shell

### Router surface

`src/App.jsx` exposes only a small route surface:

- `/login`
- `/dashboard`

Everything after login is rendered inside the dashboard shell.

### Layout structure

`App.jsx` mounts a layout with these pieces:

- `Sidebar` for module selection
- `WorkArea` for content switching
- `PopupSearch` for floating student lookup
- `ChatBox` for the right-side chat rail

### State-driven navigation

`src/pages/WorkArea.jsx` translates the selected sidebar label into a page key and renders the matching page component. This means most navigation is state-based, not URL-based.

When debugging page switches, check:

1. Sidebar labels and selected menu item values.
2. The key-normalization logic in `WorkArea.jsx`.
3. The page component imported for that key.

## Current Code-Splitting Strategy

The dashboard shell now lazy-loads major modules instead of bundling them into the initial app chunk.

### Lazy-loaded shell pieces

- `Login`
- `Sidebar`
- `WorkArea`
- `CustomDashboard`
- `PopupSearch`
- `ChatBox`

### Lazy-loaded work-area pages

`WorkArea.jsx` now loads heavy pages on demand, including:

- Enrollment
- Verification
- Migration
- Provisional
- Degree
- Institutional letter
- Doc receive
- Admin dashboard
- Leave pages
- Transcript and mail request pages
- Permission wrapper pages such as inventory, document register, fees, and CCTV

### Build result

The March 12, 2026 lazy-loading pass removed the earlier oversized main-bundle warning by splitting the dashboard shell and feature pages into separate chunks.

## Page and Module Map

| Area | Primary files | Notes |
| --- | --- | --- |
| App shell | `src/App.jsx`, `src/Menu/Sidebar.jsx`, `src/pages/WorkArea.jsx` | Login plus protected dashboard shell |
| Dashboard landing | `src/pages/Dashboard.jsx` | `CustomDashboard` is the shell dashboard view |
| Student services | `src/pages/Enrollment.jsx`, `verification.jsx`, `Migration.jsx`, `Provisional.jsx`, `Degree.jsx` | Core student-facing office workflows |
| Document workflows | `src/pages/doc-receive.jsx`, `inst-Letter.jsx`, `Record.jsx` | Doc receive, institutional verification, and record views |
| Office requests | `src/pages/mail_request.jsx`, `transcript_request.jsx` | Sheets-backed operational workflows |
| Search and utilities | `src/pages/student-search.jsx`, `src/components/popupsearch.jsx` | Search entry points |
| Admin tools | `src/components/AdminDashboard.jsx` and child tools | User, module, upload, and analysis tools |
| Access wrappers | `src/hooks/AuthInventory.jsx`, `AuthDocRegister.jsx`, `AuthFees.jsx`, `AuthCCTV.jsx` | Permission-aware module entry components |

## Data and API Layer

### HTTP client

- Shared Axios base instance: `src/api/axiosInstance.js`
- Access token is attached automatically.
- Local dev hosts are normalized so frontend ports still target backend `8001`.

### Auth state

- `src/hooks/AuthContext.jsx` owns login, logout, token refresh, profile fetch, and admin password verification.
- `ProtectedRoute` in `App.jsx` guards `/dashboard`.

### Services

The project uses a mix of direct page fetches and small service modules under `src/services/` and `src/api/`.

## Build and Run Commands

### Development

```powershell
npm install
npm run dev
```

### Production build

```powershell
npm run build
npm run serve -- --host 0.0.0.0 --port 8081
```

## Frontend Change Checklist

- If you add a new major page, update the key mapping in `WorkArea.jsx`.
- If the page is large, keep it lazy-loaded.
- If you add a new protected module, document its permissions flow in [docs/PERMISSIONS_RBAC.md](./PERMISSIONS_RBAC.md).
- If you change ports or proxy behavior, update `vite.config.js`, [docs/README.md](./README.md), and [docs/DEPLOYMENT.md](./DEPLOYMENT.md).

## Related Docs

- [docs/PERMISSIONS_RBAC.md](./PERMISSIONS_RBAC.md)
- [docs/DEPLOYMENT.md](./DEPLOYMENT.md)
- [docs/DATA_ANALYSIS.md](./DATA_ANALYSIS.md)
- [docs/FEATURE_NOTES.md](./FEATURE_NOTES.md)
