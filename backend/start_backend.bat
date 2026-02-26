@echo off
cd /d E:\admindesk\backend

REM Activate the workspace venv
call ..\.venv\Scripts\activate.bat

REM Ensure GTK runtime (for WeasyPrint) is on PATH; adjust if installed elsewhere
set "PATH=D:\Program Files\GTK3-Runtime Win64\bin;%PATH%"

waitress-serve ^
  --host=0.0.0.0 ^
  --port=8000 ^
  backend.wsgi:application
