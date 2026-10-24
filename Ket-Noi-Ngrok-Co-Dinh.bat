@echo off
setlocal enabledelayedexpansion
chcp 65001 >nul
title KET NOI TEN MIEN CO DINH NGROK - MEDICAPHARMACY
color 0A

echo ======================================================================
echo    MEDICAPHARMACY - KET NOI TEN MIEN CO DINH QUA NGROK
echo ======================================================================
echo.
echo Ten mien co dinh cua ban:
echo 👉 https://proofread-unissued-roundness.ngrok-free.dev
echo.

REM Kiem tra authtoken
"%~dp0tools\ngrok.exe" config check >nul 2>&1
if %ERRORLEVEL% NEQ 0 (
    echo [!] May tinh chua luu ma Authtoken cua tai khoan Ngrok.
    echo.
    echo 1. Hay mo trang Ngrok: https://dashboard.ngrok.com/get-started/your-authtoken
    echo 2. Bam nut COPY ma Authtoken.
    echo.
    set /p USER_TOKEN="3. Dan ma Authtoken vao day roi bam phim Enter: "
    if not "!USER_TOKEN!"=="" (
        "%~dp0tools\ngrok.exe" config add-authtoken !USER_TOKEN!
    )
)

echo.
echo ======================================================================
echo Dang ket noi may chu tiem thuoc (Cong 80) toi ten mien co dinh...
echo ======================================================================
echo.

"%~dp0tools\ngrok.exe" http 80 --url https://proofread-unissued-roundness.ngrok-free.dev
pause

