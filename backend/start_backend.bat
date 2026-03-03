@echo off
cd /d E:\admindesk\backend

REM Activate the workspace venv
call ..\.venv\Scripts\activate.bat

if not exist "..\.venv\Scripts\python.exe" (
  echo ERROR: Python not found in workspace venv at ..\.venv\Scripts\python.exe
  exit /b 1
)

REM Ensure GTK runtime (for WeasyPrint) is on PATH; adjust if installed elsewhere
set "PATH=D:\Program Files\GTK3-Runtime Win64\bin;%PATH%"

REM WebSocket-compatible ASGI server (replaces Waitress WSGI)
..\.venv\Scripts\python.exe -m daphne -b 0.0.0.0 -p 8001 backend.asgi:application
