@echo off
setlocal
set "SHOP_LOCAL_V2_CONFIG="
set "SHOP_LOCAL_V2_RESTORE_READY="
cd /d "%~dp0"
title Shop Me CaCao

if not exist "node_modules" (
  echo Chua setup lan dau.
  call scripts\SETUP_FIRST_TIME.bat
  if errorlevel 1 exit /b 1
)

if not exist "apps\web\dist\index.html" (
  echo Dang build giao dien...
  call npm run build
  if errorlevel 1 exit /b 1
)

echo Dang khoi dong Shop Me CaCao...
start "Shop Me CaCao Server" cmd /k "cd /d ""%CD%"" && npm run start"

set /a RETRY=0
:wait_server
timeout /t 1 /nobreak >nul
powershell -NoProfile -Command "try { $r=Invoke-WebRequest -UseBasicParsing -TimeoutSec 1 http://127.0.0.1:3000/api/health; if ($r.StatusCode -eq 200) { exit 0 } } catch {}; exit 1" >nul 2>nul
if not errorlevel 1 goto server_ready
set /a RETRY+=1
if %RETRY% GEQ 15 goto server_failed
goto wait_server

:server_ready
echo Server READY - http://localhost:3000
start "" "http://localhost:3000"
exit /b 0

:server_failed
echo.
echo [ERROR] Server khong khoi dong duoc.
echo Xem cua so "Shop Me CaCao Server" de lay loi va gui lai.
pause
exit /b 1
