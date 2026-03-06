@echo off
cd /d E:\admindesk\backend

set "BIND_HOST=%~1"
if "%BIND_HOST%"=="" set "BIND_HOST=127.0.0.1"
set "BIND_PORT=8001"

REM Activate the workspace venv
call ..\.venv\Scripts\activate.bat

if not exist "..\.venv\Scripts\python.exe" (
  echo ERROR: Python not found in workspace venv at ..\.venv\Scripts\python.exe
  exit /b 1
)

REM Ensure GTK runtime (for WeasyPrint) is on PATH; adjust if installed elsewhere
set "PATH=D:\Program Files\GTK3-Runtime Win64\bin;%PATH%"

REM WebSocket-compatible ASGI server (replaces Waitress WSGI)
echo Starting ASGI backend at http://%BIND_HOST%:%BIND_PORT%
..\.venv\Scripts\python.exe -m daphne -b %BIND_HOST% -p %BIND_PORT% backend.asgi:application
