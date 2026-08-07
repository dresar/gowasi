@echo off
title Build and Deploy GOWA UI
echo ========================================================
echo   Building GOWA UI Single-File Bundle
echo ========================================================
cd /d "%~dp0gowa-ui"
call "C:\Program Files\nodejs\npm.cmd" run build
if %ERRORLEVEL% EQU 0 (
    echo.
    echo Deploying index.html to server storages...
    copy /Y "dist\index.html" "..\src\storages\ui\index.html"
    if not exist "..\storages\ui" mkdir "..\storages\ui"
    copy /Y "dist\index.html" "..\storages\ui\index.html"
    echo ========================================================
    echo   UI Successfully Built & Deployed!
    echo ========================================================
) else (
    echo ========================================================
    echo   Build Failed! Check errors above.
    echo ========================================================
)
pause
