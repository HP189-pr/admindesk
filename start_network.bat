@echo off
setlocal

for /f "tokens=*" %%I in ('powershell -NoProfile -Command "Get-NetIPAddress -AddressFamily IPv4 ^| Where-Object { $_.IPAddress -notmatch '^(127\.|169\.254\.)' -and $_.PrefixOrigin -ne 'WellKnown' } ^| Sort-Object InterfaceMetric, SkipAsSource ^| Select-Object -ExpandProperty IPAddress -First 1"') do set "LAN_IP=%%I"
if "%LAN_IP%"=="" set "LAN_IP=127.0.0.1"

set "MODE=%~1"
if "%MODE%"=="" set "MODE=dev"

if /I "%MODE%"=="dev" goto MODE_DEV
if /I "%MODE%"=="prod" goto MODE_PROD

echo Invalid mode: %MODE%
echo Usage: %~n0 [dev^|prod]
exit /b 1

:MODE_DEV
set "FRONTEND_PORT=3000"
set "BACKEND_PORT=8001"
set "BACKEND_TITLE=Daphne Backend (Dev)"
set "FRONTEND_TITLE=Vite Frontend (Dev)"
set "BACKEND_CMD=cd /d %~dp0backend && call start_backend.bat dev 0.0.0.0 8001"
set "FRONTEND_CMD=cd /d %~dp0 && npm run dev -- --host 0.0.0.0 --port 3000"
goto START

:MODE_PROD
set "FRONTEND_PORT=8081"
set "BACKEND_PORT=8001"
set "BACKEND_TITLE=Daphne Backend (Prod)"
set "FRONTEND_TITLE=Nginx Frontend (Prod)"
set "BACKEND_CMD=cd /d %~dp0backend && call start_backend.bat prod 0.0.0.0 8001"
set "FRONTEND_CMD=cd /d %~dp0 && npm run build && echo Build done. Open http://localhost:8081/ in a browser. Nginx must be running."
goto START

:START
echo ========================================
echo Starting AdminDesk on Network (%MODE%)
echo ========================================
echo.
echo Your PC IP: %LAN_IP%
echo.
echo Local access:
echo   Frontend: http://localhost:%FRONTEND_PORT%/dashboard
echo   Backend:  http://127.0.0.1:%BACKEND_PORT%
echo.
echo Other PCs can access:
echo   Frontend: http://%LAN_IP%:%FRONTEND_PORT%/dashboard
echo   Backend:  http://%LAN_IP%:%BACKEND_PORT%
echo.
echo ========================================
echo.

echo Starting backend...
start "%BACKEND_TITLE%" cmd /k "%BACKEND_CMD%"

timeout /t 3 /nobreak >nul

echo Starting frontend...
start "%FRONTEND_TITLE%" cmd /k "%FRONTEND_CMD%"

echo.
echo Both servers are starting in %MODE% mode...
echo Press any key to close this window (servers will keep running)
pause >nul
