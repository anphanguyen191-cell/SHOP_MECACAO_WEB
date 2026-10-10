@echo off
setlocal
set "SHOP_LOCAL_V2_CONFIG="
set "SHOP_LOCAL_V2_RESTORE_READY="
cd /d "%~dp0"
title Shop Me CaCao RESTORE SANDBOX - PORT 3016
echo Mo kho restore READY moi nhat. Khong thay database dang dung.
echo Tao backup va Phuc hoi thu trong Cai dat cua V2 truoc.
if not exist "apps\api\dist\server.js" (
 echo Chay RUN_WINDOWS_V2_SALES_TEST.bat de build ung dung truoc.
 pause
 exit /b 1
)
echo.
echo 1. Mo kho restore cua V2 Sales Sandbox
echo 2. Mo kho restore cua V1 Acceptance Sandbox
choice /c 12 /n /m "Chon 1 hoac 2: "
set "RESTORE_SANDBOX=V2SalesSandbox"
if errorlevel 2 set "RESTORE_SANDBOX=V1AcceptanceSandbox"
node scripts/run-restored-sandbox.mjs %RESTORE_SANDBOX%
pause
