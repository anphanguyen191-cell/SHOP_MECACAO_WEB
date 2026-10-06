@echo off
setlocal
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

start "Shop Me CaCao Server" cmd /c "cd /d \"%CD%\" && npm run start"
timeout /t 2 /nobreak >nul
start "" "http://localhost:3000"
exit /b 0
