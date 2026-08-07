@echo off
title Go WhatsApp Web Multi-Device Server (gowasi)
echo ========================================================
echo   Starting gowasi WhatsApp Web Server (http://localhost:3000)
echo ========================================================
cd /d "%~dp0src"
if exist "whatsapp.exe" (
    del /f /q whatsapp.exe
)
go run -tags purego . rest
pause
