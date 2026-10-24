@echo off
title Cai Dat Ten Mien http://medica.com
cls

rem Kiem tra quyen Administrator
net session >nul 2>&1
if errorlevel 1 (
    echo ========================================================
    echo  Dang yeu cau quyen Administrator de cau hinh ten mien...
    echo ========================================================
    powershell -NoProfile -Command "Start-Process cmd -ArgumentList '/c \"\"%~f0\"\"' -Verb RunAs"
    exit /b
)

echo ========================================================
echo     CAU HINH TEN MIEN NOI BO: http://medica.com
echo ========================================================
echo.

set HOSTS_FILE=%WINDIR%\System32\drivers\etc\hosts

rem 1. Kiem tra va them medica.com vao file hosts
findstr /C:"medica.com" "%HOSTS_FILE%" >nul 2>&1
if errorlevel 1 (
    echo. >> "%HOSTS_FILE%"
    echo 127.0.0.1 medica.com >> "%HOSTS_FILE%"
    echo  [+] Da them '127.0.0.1 medica.com' vao file hosts thanh cong!
) else (
    echo  [v] Ten mien 'medica.com' da ton tai san trong file hosts.
)

rem 2. Mo quyen HTTP Cong 80 va 8080 cho tat ca nguoi dung
netsh http add urlacl url=http://+:80/ sddl=D:(A;;GX;;;WD) >nul 2>&1
netsh http add urlacl url=http://+:8080/ sddl=D:(A;;GX;;;WD) >nul 2>&1
echo  [+] Da cap quyen lang nghe Cong 80 va 8080 tren Windows.

rem 3. Mo tuong lua Windows Firewall de cac may khac bat Wifi ket noi duoc
netsh advfirewall firewall delete rule name="Medica Pharmacy Server" >nul 2>&1
netsh advfirewall firewall add rule name="Medica Pharmacy Server" dir=in action=allow protocol=TCP localport=80,8080 >nul 2>&1
echo  [+] Da mo Firewall cho cac may khac ket noi chung mang Wifi.

echo.
echo ========================================================
echo  HOAN TAT CAU HINH TEN MIEN!
echo  Bay gio ban co the mo: http://medica.com
echo ========================================================
echo.
pause
