@echo off
title Go WhatsApp Web Multi-Device Server
echo ========================================================
echo   Starting Go WhatsApp Web Server (http://localhost:3000)
echo ========================================================
cd /d "%~dp0src"
"C:\Program Files\Go\bin\go.exe" run -tags purego . rest
pause
