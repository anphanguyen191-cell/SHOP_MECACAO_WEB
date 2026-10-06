@echo off
setlocal
cd /d "%~dp0.."
title Shop Me CaCao - First Time Setup
where node >nul 2>nul
if errorlevel 1 (echo [ERROR] Chua tim thay Node.js.&pause&exit /b 1)
for /f "tokens=1 delims=." %%v in ('node -p "process.versions.node"') do set NODE_MAJOR=%%v
if %NODE_MAJOR% LSS 22 (echo [ERROR] Can Node.js 22 tro len de dung SQLite an toan.&pause&exit /b 1)
echo [1/4] Cai thu vien...
call npm install
if errorlevel 1 goto :fail
echo [2/4] Kiem tra TypeScript...
call npm run typecheck
if errorlevel 1 goto :fail
echo [3/4] Chay schema + core self-test...
call npm run test:schema
if errorlevel 1 goto :fail
call npm run test:core
if errorlevel 1 goto :fail
echo [4/4] Build ban local...
call npm run build
if errorlevel 1 goto :fail
echo SETUP PASS.
pause
exit /b 0
:fail
echo SETUP FAILED.
pause
exit /b 1
