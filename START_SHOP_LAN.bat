@echo off
setlocal
cd /d "%~dp0"
title Shop Me CaCao - Mobile LAN
echo Mo muc Mobile LAN tren giao dien Windows de thiet lap va bat ket noi.
set "SHOP_LAN_ENABLED="
set "SHOP_LAN_BIND="
set "SHOP_LAN_PORT="
call START_SHOP.bat
exit /b %errorlevel%
