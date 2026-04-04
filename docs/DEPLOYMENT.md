# Deployment and Operations Guide

Last updated: March 12, 2026

This is the current deployment reference for local development, LAN access, and prod-style local runs.

## Runtime Matrix

| Scenario | Frontend | Backend | Recommended launcher |
| --- | --- | --- | --- |
| Local development | `127.0.0.1:3000` | `127.0.0.1:8001` | `npm run dev` plus `backend/start_backend.bat dev 127.0.0.1 8001` |
| LAN development | `<host-ip>:3000` | `<host-ip>:8001` | `start_network.bat dev` |
| Local prod-style preview | `127.0.0.1:8081` | `127.0.0.1:8001` | `npm run build`, `npm run serve -- --port 8081`, `backend/start_backend.bat prod 127.0.0.1 8001` |
| LAN prod-style preview | `<host-ip>:8081` | `<host-ip>:8001` | `start_network.bat prod` |

## Important Rule

Do not use `manage.py runserver` as the main documented startup path for the current system. The live app expects the ASGI stack so that chat and websocket features work correctly.

Use:

```powershell
cd backend
start_backend.bat dev 127.0.0.1 8001
```

or

```powershell
cd backend
start_backend.bat prod 0.0.0.0 8001
```

## Local Development

### Backend

```powershell
cd backend
start_backend.bat dev 127.0.0.1 8001
```

### Frontend

```powershell
npm install
npm run dev
```

### Convenience launcher

You can also use `run_backend.ps1`, which now defaults to `backend/start_backend.bat dev 0.0.0.0 8001` so LAN testing works without extra flags.

If the Windows service `AdminDeskBackend` is already installed for prod-style runs, use `backend/restartserver.bat` from an elevated prompt. The helper resets the NSSM service to `--host=0.0.0.0 --port=8001` before restarting it.

For a script-level audit of the remaining backend startup helper, see [docs/OPERATIONS_SCRIPTS.md](./OPERATIONS_SCRIPTS.md).

## LAN Access

### One-step launcher

```powershell
start_network.bat dev
```

This starts:

- backend on `0.0.0.0:8001`
- frontend on `0.0.0.0:3000`

### Prod-style LAN launcher

```powershell
start_network.bat prod
```

This starts:

- backend on `0.0.0.0:8001`
- frontend preview on `0.0.0.0:8081`

## Always-On Boot Startup

This machine is already set up for boot-time hosting through Windows services:

- `AdminDeskBackend` runs the Django/Daphne backend
- `Nginx` serves the frontend on `http://160.160.160.130:8081`
- both services use `Automatic` startup, so they can start before Windows user login

Use the same backend for both development and production-style access:

- development frontend can point to `http://127.0.0.1:8001`
- production frontend on `:8081` proxies `/api`, `/media`, and `/ws` to `127.0.0.1:8001`

After frontend changes, rebuild and restart the services once from an elevated prompt:

```powershell
cd e:\admindesk
restart_production_services.bat
```

## Frontend Build Modes

### Standard build

```powershell
npm run build
```

Use this when media stays on the backend and is served separately.

## Reverse Proxy and Production Notes

For a more permanent deployment:

- serve the built frontend with a reverse proxy or static host
- expose `/api`, `/media`, and `/ws` to the backend origin
- keep backend media separate from the frontend bundle when possible
- run the backend with Daphne or another ASGI-capable service wrapper

## Static and Media Behavior

- In debug mode, Django serves `/media/` and `/static/` directly, including when running under Daphne.
- If Django admin assets 404 under ASGI, verify the debug static URL patterns are still enabled in `backend/backend/urls.py`.
- In production, prefer your reverse proxy to serve static files directly.

## Environment and Port Notes

- `vite.config.js` defaults the backend target to `8001` in both development and prod-style runs.
- Keep `VITE_API_BASE_URL` and `VITE_WS_BASE_URL` aligned with the backend mode you are running.
- Avoid optional chaining on `import.meta.env` in Vite source when you expect static environment replacement in production builds.

## Verification Checklist

After startup or deployment changes:

1. Open `/dashboard` and confirm login works.
2. Verify `/api/health/` from the frontend host.
3. Open a module that performs API requests.
4. Open chat and confirm the websocket connects.
5. Check profile pictures or media URLs.
6. Run a production build if frontend config changed.

## Related Docs

- [docs/BACKEND_API.md](./BACKEND_API.md)
- [docs/README.md](./README.md)
- [docs/OPERATIONS_SCRIPTS.md](./OPERATIONS_SCRIPTS.md)
