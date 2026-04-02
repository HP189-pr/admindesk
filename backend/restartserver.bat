@echo off
echo Reconfiguring AdminDeskBackend service (daphne on port 8001)...
powershell -NoProfile -Command "Start-Process 'E:\nssm\win64\nssm.exe' -ArgumentList 'set AdminDeskBackend AppDirectory E:\admindesk\backend' -Verb RunAs -Wait; Start-Process 'E:\nssm\win64\nssm.exe' -ArgumentList 'set AdminDeskBackend Application E:\admindesk\.venv\Scripts\python.exe' -Verb RunAs -Wait; Start-Process 'E:\nssm\win64\nssm.exe' -ArgumentList 'set AdminDeskBackend AppParameters ""-m daphne -b 0.0.0.0 -p 8001 backend.asgi:application""' -Verb RunAs -Wait; Start-Process 'E:\nssm\win64\nssm.exe' -ArgumentList 'restart AdminDeskBackend' -Verb RunAs -Wait"
echo Done. Backend (daphne ASGI) available on 0.0.0.0:8001 in a few seconds.
