@echo off
setlocal
set "SHOP_LOCAL_V2_CONFIG="
set "SHOP_LOCAL_V2_RESTORE_READY="
cd /d "%~dp0"
title Shop Me CaCao - V2 LOCAL release check
set "SHOP_DB_PATH="
set "SHOP_SANDBOX_ROOT="
set "SHOP_ENABLE_V2_DRAFTS="
set "SHOP_ENABLE_V2_SALES="
echo KIEM TRA CHUYEN V2 - CHI DOC, KHONG KICH HOAT KHO THAT
if not exist "node_modules" (
  call scripts\SETUP_FIRST_TIME.bat
  if errorlevel 1 goto :fail
)
call npm run build
if errorlevel 1 goto :fail
node scripts\check-local-v2-release.mjs
if errorlevel 1 goto :fail
pause
exit /b 0
:fail
echo CHUA DU DIEU KIEN. Xem bao cao, giu nguyen du lieu.
pause
exit /b 1
