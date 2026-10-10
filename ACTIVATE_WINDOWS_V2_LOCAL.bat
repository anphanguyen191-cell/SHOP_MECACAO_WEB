@echo off
setlocal
cd /d "%~dp0"
title Shop Me CaCao - Activate LOCAL V2
set "SHOP_LOCAL_V2_CONFIG="
set "SHOP_LOCAL_V2_RESTORE_READY="
if not exist "node_modules" call scripts\SETUP_FIRST_TIME.bat
if errorlevel 1 goto :fail
call npm run build
if errorlevel 1 goto :fail
node scripts\local-v2-business.mjs activate
if errorlevel 1 goto :fail
pause
exit /b 0
:fail
echo [ERROR] Dung an toan. Khong xoa folder/marker de thu lai.
pause
exit /b 1
