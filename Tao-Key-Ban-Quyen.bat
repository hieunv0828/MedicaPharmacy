@echo off
title MEDICAPHARMACY - TRINH TAO KHOA BAN QUYEN
chcp 65001 >nul
cd /d "%~dp0"

echo ======================================================================
echo       MEDICAPHARMACY - CONG CU TAO KHOA BAN QUYEN (ADMIN)
echo ======================================================================
echo.
echo Dang khoi dong giao dien tao khoa ban quyen...
start "" "%~dp0tools\MedicaKeyGen.exe"
exit
