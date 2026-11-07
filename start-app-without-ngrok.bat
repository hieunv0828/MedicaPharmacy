@echo off
chcp 65001 >nul
cd /d "%~dp0"
echo ======================================================================
echo   KHOI DONG MEDICAPHARMACY - CHE DO NOI BO (DA TAT NGROK)
echo   Ten mien ngrok tu xa da duoc giai phong cho may khach hang!
echo ======================================================================
echo.

echo [1/3] Dang tat tien trinh Ngrok de giai phong ten mien tu xa...
taskkill /F /IM ngrok.exe >nul 2>&1

echo [2/3] Dang tat may chu cu neu dang chay...
taskkill /F /IM MedicaServer.exe >nul 2>&1
ping 127.0.0.1 -n 2 >nul

if exist "%~dp0MedicaServer.new.exe" (
    move /y "%~dp0MedicaServer.new.exe" "%~dp0MedicaServer.exe" >nul 2>&1
)

echo [3/3] Dang khoi dong MedicaServer che do cuc bo (khong bat Ngrok)...
start "" "%~dp0MedicaServer.exe" --no-ngrok

echo.
echo May chu dang hoat dong tai: http://medica.com
echo Ngrok da duoc tat hoan toan tren may nay, khong lo xung dot voi may khach!
ping 127.0.0.1 -n 2 >nul
exit

