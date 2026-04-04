@echo off
setlocal EnableExtensions
cd /d "%~dp0"

if not exist "E:\nssm\win64\nssm.exe" (
  echo ERROR: NSSM not found at E:\nssm\win64\nssm.exe
  exit /b 1
)

if not exist "E:\nginx\nginx.exe" (
  echo ERROR: nginx not found at E:\nginx\nginx.exe
  exit /b 1
)

echo Building frontend bundle...
call npm run build
if errorlevel 1 (
  echo ERROR: Frontend build failed.
  exit /b 1
)

echo Restarting always-on backend service on port 8001...
call backend\restartserver.bat
if errorlevel 1 (
  echo ERROR: Backend service restart failed.
  exit /b 1
)

echo Restarting nginx service on port 8081...
powershell -NoProfile -Command "Start-Process 'E:\nssm\win64\nssm.exe' -ArgumentList 'restart Nginx' -Verb RunAs -Wait"
if errorlevel 1 (
  echo ERROR: Nginx service restart failed.
  exit /b 1
)

echo.
echo Production services refreshed.
echo Frontend: http://160.160.160.130:8081/dashboard
echo Backend:  http://127.0.0.1:8001