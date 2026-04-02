@echo off
setlocal EnableExtensions
cd /d "%~dp0"

REM Usage:
REM   start_backend.bat dev [host] [port]
REM   start_backend.bat prod [host] [port]
REM   start_backend.bat [host] [port]   (legacy/backward compatible)

set "MODE=%~1"
set "BIND_HOST="
set "BIND_PORT="

if /I "%MODE%"=="dev" (
  set "BIND_HOST=%~2"
  if "%BIND_HOST%"=="" set "BIND_HOST=127.0.0.1"
  set "BIND_PORT=%~3"
  if "%BIND_PORT%"=="" set "BIND_PORT=8001"
) else if /I "%MODE%"=="prod" (
  set "BIND_HOST=%~2"
  if "%BIND_HOST%"=="" set "BIND_HOST=0.0.0.0"
  set "BIND_PORT=%~3"
  if "%BIND_PORT%"=="" set "BIND_PORT=8001"
) else (
  set "BIND_HOST=%~1"
  if "%BIND_HOST%"=="" set "BIND_HOST=127.0.0.1"
  set "BIND_PORT=%~2"
  if "%BIND_PORT%"=="" set "BIND_PORT=8001"
)

if not exist "..\.venv\Scripts\python.exe" (
  echo ERROR: Python not found in workspace venv at ..\.venv\Scripts\python.exe
  exit /b 1
)

if exist "D:\Program Files\GTK3-Runtime Win64\bin" (
  set "PATH=D:\Program Files\GTK3-Runtime Win64\bin;%PATH%"
)

set "PYTHONUNBUFFERED=1"

REM WebSocket-compatible ASGI server
echo Starting ASGI backend at http://%BIND_HOST%:%BIND_PORT%
..\.venv\Scripts\python.exe -m daphne -b %BIND_HOST% -p %BIND_PORT% backend.asgi:application
