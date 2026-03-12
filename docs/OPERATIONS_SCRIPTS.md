# Operational Scripts

Last updated: March 12, 2026

This file documents the helper scripts the current workspace still uses for backend startup.

## `run_backend.ps1`

Purpose:

- Windows convenience wrapper for starting the backend in development mode

Current behavior:

1. Verifies the workspace virtual environment Python exists.
2. Verifies `backend/start_backend.bat` exists.
3. Upgrades `pip` and installs `backend/requirements.txt`.
4. Runs Django migrations.
5. Starts the backend through `start_backend.bat dev 127.0.0.1 8001`.

Assessment:

- aligned with the current ASGI-first backend runtime
- still useful as a one-command Windows helper
- slower than calling `backend/start_backend.bat` directly because it reinstalls dependencies and reruns migrations each time

Use it when you want a conservative, operator-friendly startup. Use `backend/start_backend.bat` directly when you want a faster repeat start.

## Recommendation Summary

- keep `run_backend.ps1` if operators use it for safe local startup
- keep backend-served `/media` as the only supported media path for both development and production-style runs

## Related Docs

- [docs/DEPLOYMENT.md](./DEPLOYMENT.md)
- [docs/BACKEND_API.md](./BACKEND_API.md)