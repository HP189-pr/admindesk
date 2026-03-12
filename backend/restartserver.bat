@echo off
echo Restarting AdminDeskBackend service...
powershell -Command "Start-Process 'E:\nssm\win64\nssm.exe' -ArgumentList 'restart AdminDeskBackend' -Verb RunAs -Wait"
echo Done. Backend will be available on 127.0.0.1:8001 in a few seconds.
