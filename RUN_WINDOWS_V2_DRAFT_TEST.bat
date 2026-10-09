@echo off
setlocal
cd /d "%~dp0"
title Shop Me CaCao V2 DRAFTS - SANDBOX TEST
color 0E
echo ===============================================================
echo   SHOP ME CACAO V2 DRAFTS - CHI THU NGHIEM, KHONG DUNG KHO THAT
echo ===============================================================
echo.
echo CANH BAO: Khong chon thu muc D:\1-Me CaCao Store de ghi thu.
echo Du lieu thu nghiem duoc tao rieng trong LOCALAPPDATA.
echo.

where node >nul 2>nul
if errorlevel 1 (
  echo [ERROR] Chua tim thay Node.js 22.13+.
  pause
  exit /b 1
)
for /f "tokens=1,2 delims=." %%a in ('node -p "process.versions.node"') do (
  set "NODE_MAJOR=%%a"
  set "NODE_MINOR=%%b"
)
if %NODE_MAJOR% LSS 22 (
  echo [ERROR] Can Node.js 22.13 tro len vi ung dung dung node:sqlite.
  pause
  exit /b 1
)
if %NODE_MAJOR% EQU 22 if %NODE_MINOR% LSS 13 (
  echo [ERROR] Can Node.js 22.13 tro len vi ung dung dung node:sqlite.
  pause
  exit /b 1
)

set "SHOP_ENABLE_V2_DRAFTS=1"
set "SHOP_SANDBOX_ROOT=%LOCALAPPDATA%\ShopMeCaCao\V2DraftSandbox"
set "SHOP_DB_PATH=%SHOP_SANDBOX_ROOT%\database\shop-v2-drafts.db"
set "PORT=3006"
set "SHOP_HOST=127.0.0.1"

powershell -NoProfile -Command "try { $r=Invoke-WebRequest -UseBasicParsing -TimeoutSec 2 http://127.0.0.1:3006/api/health; if ($r.StatusCode -eq 200) { exit 0 } } catch {}; exit 1" >nul 2>nul
if not errorlevel 1 (
  echo [ERROR] Port 3006 dang co ung dung chay. Dong cua so server TEST cu roi thu lai.
  pause
  exit /b 1
)

if not exist "node_modules" (
  echo [1/4] Dang cai dependencies va tu kiem...
  call scripts\SETUP_FIRST_TIME.bat
  if errorlevel 1 goto :fail
)

echo [2/4] Tao kho anh va thu muc nhap GIA LAP...
node scripts\create-windows-acceptance-sandbox.mjs
if errorlevel 1 goto :fail

echo [3/4] Build lai source hien tai de khong chay ban dist cu...
call npm run build
if errorlevel 1 goto :fail

echo [4/4] Khoi dong LOCAL TEST tren port 3006...
start "Shop Me CaCao V2 DRAFTS - TEST SANDBOX" cmd /k "cd /d ""%CD%"" && npm run start"
set /a RETRY=0
:wait_server
timeout /t 1 /nobreak >nul
powershell -NoProfile -Command "try { $r=Invoke-RestMethod -TimeoutSec 1 http://127.0.0.1:3006/api/health; if ($r.ok -and $r.app -eq 'SHOP_MECACAO_WEB' -and $r.sandbox -eq $true -and $r.salesDrafts -eq $true -and $r.database -eq 'shop-v2-drafts.db') { exit 0 } } catch {}; exit 1" >nul 2>nul
if not errorlevel 1 goto :ready
set /a RETRY+=1
if %RETRY% GEQ 20 goto :fail
goto wait_server
:ready
echo TEST SANDBOX READY - http://127.0.0.1:3006
echo Kho gia lap: %SHOP_SANDBOX_ROOT%\warehouse
echo Anh nhap gia lap: %SHOP_SANDBOX_ROOT%\incoming
start "" "http://127.0.0.1:3006"
exit /b 0
:fail
echo [ERROR] Khong the khoi dong. Khong duoc ghi du lieu kho that.
pause
exit /b 1
