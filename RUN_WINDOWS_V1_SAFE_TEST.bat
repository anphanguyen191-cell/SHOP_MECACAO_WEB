@echo off
setlocal
cd /d "%~dp0"
title Shop Me CaCao V1 - SANDBOX TEST
color 0E
echo ===============================================================
echo   SHOP ME CACAO V1 - CHI THU NGHIEM, KHONG DUNG KHO THAT
echo ===============================================================
echo.
echo CANH BAO: Khong chon thu muc D:\1-Me CaCao Store de ghi thu.
echo Du lieu thu nghiem duoc tao rieng trong LOCALAPPDATA.
echo.

where node >nul 2>nul
if errorlevel 1 (
  echo [ERROR] Chua tim thay Node.js 22.5+.
  pause
  exit /b 1
)
for /f "tokens=1,2 delims=." %%a in ('node -p "process.versions.node"') do (
  set "NODE_MAJOR=%%a"
  set "NODE_MINOR=%%b"
)
if %NODE_MAJOR% LSS 22 (
  echo [ERROR] Can Node.js 22.5 tro len vi ung dung dung node:sqlite.
  pause
  exit /b 1
)
if %NODE_MAJOR% EQU 22 if %NODE_MINOR% LSS 5 (
  echo [ERROR] Can Node.js 22.5 tro len vi ung dung dung node:sqlite.
  pause
  exit /b 1
)

set "SHOP_SANDBOX_ROOT=%LOCALAPPDATA%\ShopMeCaCao\V1AcceptanceSandbox"
set "SHOP_DB_PATH=%SHOP_SANDBOX_ROOT%\database\shop-acceptance.db"
set "PORT=3005"
set "SHOP_HOST=127.0.0.1"

if not exist "node_modules" (
  echo [1/4] Dang cai dependencies va tu kiem...
  call scripts\SETUP_FIRST_TIME.bat
  if errorlevel 1 goto :fail
)

echo [2/4] Tao kho anh va thu muc nhap GIA LAP...
node scripts\create-windows-acceptance-sandbox.mjs
if errorlevel 1 goto :fail

if not exist "apps\api\dist\server.js" (
  echo [3/4] Dang build ung dung...
  call npm run build
  if errorlevel 1 goto :fail
)

echo [4/4] Khoi dong LOCAL TEST tren port 3005...
start "Shop Me CaCao V1 - TEST SANDBOX" cmd /k "cd /d ""%CD%"" && npm run start"
set /a RETRY=0
:wait_server
timeout /t 1 /nobreak >nul
powershell -NoProfile -Command "try { $r=Invoke-WebRequest -UseBasicParsing -TimeoutSec 1 http://127.0.0.1:3005/api/health; if ($r.StatusCode -eq 200) { exit 0 } } catch {}; exit 1" >nul 2>nul
if not errorlevel 1 goto :ready
set /a RETRY+=1
if %RETRY% GEQ 20 goto :fail
goto wait_server
:ready
echo TEST SANDBOX READY - http://127.0.0.1:3005
echo Kho gia lap: %SHOP_SANDBOX_ROOT%\warehouse
echo Anh nhap gia lap: %SHOP_SANDBOX_ROOT%\incoming
start "" "http://127.0.0.1:3005"
exit /b 0
:fail
echo [ERROR] Khong the khoi dong. Khong duoc ghi du lieu kho that.
pause
exit /b 1
