@echo off
title Go WhatsApp Web Multi-Device Server (gowasi)
echo ========================================================
echo   Starting gowasi WhatsApp Web Server (http://localhost:3000)
echo ========================================================
cd /d "%~dp0"
if exist ".git" (
    echo 📦 Checking for updates from GitHub...
    git pull origin main
)
cd /d "%~dp0src"
if exist "whatsapp.exe" (
    .\whatsapp.exe rest
) else (
    go run -tags purego . rest
)
pause
