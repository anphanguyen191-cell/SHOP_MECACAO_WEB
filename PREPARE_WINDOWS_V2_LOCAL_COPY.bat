@echo off
setlocal
cd /d "%~dp0"
title Shop Me CaCao - Prepare V2 LOCAL copy
set "SHOP_DB_PATH="
set "SHOP_SANDBOX_ROOT="
set "SHOP_ENABLE_V2_DRAFTS="
set "SHOP_ENABLE_V2_SALES="
set "SHOP_LOCAL_V2_REVIEW="
echo CHUAN BI V2 TREN BAN SAO BACKUP V1 - KHONG DOI KHO THAT
if not exist "node_modules" (
  call scripts\SETUP_FIRST_TIME.bat
  if errorlevel 1 goto :fail
)
call npm run build
if errorlevel 1 goto :fail
node scripts\prepare-local-v2.mjs
if errorlevel 1 goto :fail
pause
exit /b 0
:fail
echo [ERROR] Chua co goi san sang. Giu nguyen thu muc do de kiem tra.
pause
exit /b 1
