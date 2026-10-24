@echo off
taskkill /F /IM MedicaServer.exe >nul 2>&1
echo Da tat may chu MedicaServer thanh cong.
ping 127.0.0.1 -n 2 >nul
exit

