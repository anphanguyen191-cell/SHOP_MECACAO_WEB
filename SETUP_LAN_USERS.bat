@echo off
setlocal
cd /d "%~dp0"
title Shop Me CaCao - Tao tai khoan Mobile LAN MAIN TEST
where node >nul 2>nul
if errorlevel 1 (
 echo Can cai Node.js 22.13+.
 pause
 exit /b 1
)
if not exist node_modules (
 call npm ci
 if errorlevel 1 goto :fail
)
node --import tsx scripts\setup-lan-users.mjs
if errorlevel 1 goto :fail
echo Hoan thanh. Kiem tra chung chi cert.pem va key.pem truoc khi mo LAN.
pause
exit /b 0
:fail
echo Khong tao duoc tai khoan. Kiem tra thong bao phia tren.
pause
exit /b 1
