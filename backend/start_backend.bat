@echo off
cd /d E:\admindesk\backend

REM If you use virtualenv, activate it
REM call venv\Scripts\activate

waitress-serve ^
  --host=127.0.0.1 ^
  --port=8000 ^
  backend.wsgi:application
