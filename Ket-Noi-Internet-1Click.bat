@echo off
title Ket Noi Internet 1 Click Cho Dien Thoai - MedicaPharmacy
cd /d "%~dp0"
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0tools\run-tunnel.ps1"
exit

