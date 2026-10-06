@echo off
setlocal
cd /d "%~dp0.."
title Shop Me CaCao - First Time Setup
where node >nul 2>nul
if errorlevel 1 (echo [ERROR] Chua tim thay Node.js.&pause&exit /b 1)
echo [1/3] Cai thu vien...
call npm install
if errorlevel 1 goto :fail
echo [2/3] Kiem tra TypeScript...
call npm run typecheck
if errorlevel 1 goto :fail
echo [3/3] Build ban local...
call npm run build
if errorlevel 1 goto :fail
echo SETUP PASS.
pause
exit /b 0
:fail
echo SETUP FAILED.
pause
exit /b 1
