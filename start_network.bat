@echo off
echo ========================================
echo Starting AdminDesk on Network
echo ========================================
echo.
echo Your PC IP: 160.160.109.147
echo.
echo Other PCs can access:
echo   Frontend: http://160.160.109.147:3000
echo   Backend:  http://160.160.109.147:8000
echo.
echo ========================================
echo.

REM Start Django backend on 0.0.0.0:8000
echo Starting Django backend...
start "Django Backend" cmd /k "cd /d %~dp0backend && python manage.py runserver 0.0.0.0:8000"

REM Wait a moment for Django to start
timeout /t 3 /nobreak >nul

REM Start Vite frontend
echo Starting Vite frontend...
start "Vite Frontend" cmd /k "cd /d %~dp0 && npm run dev"

echo.
echo Both servers are starting...
echo Press any key to close this window (servers will keep running)
pause >nul
