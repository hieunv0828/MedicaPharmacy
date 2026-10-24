@echo off
title Cai Dat Ket Noi Tu Xa Qua Internet (Mien Phi 100%)
cls

echo ========================================================
echo   CAI DAT TRUY CAP TU XA QUA INTERNET (MIEN PHI 100%)
echo ========================================================
echo.
echo De truy cap phan mem tu xa qua 4G/o nha mien phi,
echo ban can 1 tai khoan Ngrok mien phi (dang ky bang Google):
echo.
echo  Buoc 1: Mo link nay dang nhap Google: https://dashboard.ngrok.com/signup
echo  Buoc 2: Vao menu 'Domains' tao 1 ten mien free (VD: xxx.ngrok-free.app)
echo  Buoc 3: Lay AuthToken tai: https://dashboard.ngrok.com/get-started/your-authtoken
echo.
echo ========================================================
echo.

set /p TOKEN="Dien AuthToken cua ban vao day: "
if "%TOKEN%"=="" (
    echo [!] Ban chua nhap AuthToken. Thoat.
    pause
    exit /b
)

"%~dp0tools\ngrok.exe" config add-authtoken %TOKEN%

echo.
set /p DOMAIN="Dien ten mien free cua ban (VD: nhathuocmedica.ngrok-free.app): "
if "%DOMAIN%"=="" (
    echo [!] Ban chua nhap ten mien. Thoat.
    pause
    exit /b
)

echo %DOMAIN% > "%~dp0tools\ngrok-domain.txt"

echo.
echo ========================================================
echo  [OK] CAI DAT THANH CONG!
echo  Tu gio ban co the mo file 'Ket-Noi-Tu-Xa.bat' de bat mang ngoai.
echo  Tren dien thoai ban chi can vao: https://%DOMAIN%
echo ========================================================
echo.
pause

