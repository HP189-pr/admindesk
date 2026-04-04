@echo off
REM Convenience launcher for the Django/Daphne backend from the workspace root.
REM Usage: start_backend.bat [dev|prod] [host] [port]
REM   dev  - binds to 127.0.0.1:8001 (default)
REM   prod - binds to 0.0.0.0:8001 (LAN/nginx accessible)
REM Both dev and prod-style frontend runs target the same backend on :8001.
cd /d "%~dp0backend"
call start_backend.bat %*
