@echo off
setlocal
cd /d "%~dp0"
title Shop Me CaCao - Windows + Mobile LAN HTTPS
echo Chi bat LAN khi da co cert.pem, key.pem va users.json trong data\stage4\lan.
if not exist "data\stage4\lan\users.json" goto :setup
if not exist "data\stage4\lan\cert.pem" goto :setup
if not exist "data\stage4\lan\key.pem" goto :setup
echo Nhap IP Wi-Fi cua MAY WINDOWS (vd 192.168.1.100).
set "SHOP_LAN_BIND="
set /p "SHOP_LAN_BIND=IP LAN: "
set "SHOP_LAN_ENABLED=1"
set "SHOP_LAN_PORT=3443"
call START_SHOP.bat
exit /b %errorlevel%
:setup
echo Chua du 3 file cau hinh. Khong mo API ra LAN.
echo Hay doc STAGE6_MOBILE_LAN_SETUP.md truoc khi thuc hien.
pause
exit /b 1
