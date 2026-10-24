@echo off
title Ket Noi Tu Xa Qua Internet - MedicaPharmacy
cls

cd /d "%~dp0"

if not exist "%~dp0tools\ngrok-domain.txt" (
    echo ========================================================
    echo  [!] Ban chua cai dat ten mien tu xa!
    echo  Vui long chay file 'Cai-Dat-Ket-Noi-Tu-Xa.bat' truoc.
    echo ========================================================
    pause
    exit /b
)

set /p DOMAIN=<"%~dp0tools\ngrok-domain.txt"

rem Kiem tra may chu MedicaServer da chay chua
tasklist /FI "IMAGENAME eq MedicaServer.exe" 2>nul | find /I "MedicaServer.exe" >nul
if errorlevel 1 (
    start "" "%~dp0MedicaServer.exe"
    ping 127.0.0.1 -n 2 >nul
)

rem Khoi dong Ngrok chay an
start "Ngrok Tunnel (Ket Noi Tu Xa)" /min "%~dp0tools\ngrok.exe" http --domain=%DOMAIN% 80

echo ========================================================
echo     DA MO KET NOI INTERNET TU XA (MIEN PHI 100%)
echo ========================================================
echo.
echo  Dia chi truy cap tu dien thoai / 4G / o nha cua ban:
echo.
echo  👉 https://%DOMAIN%
echo.
echo  (Vui long khong tat cua so nay neu ban dang xem tu xa)
echo ========================================================
pause

