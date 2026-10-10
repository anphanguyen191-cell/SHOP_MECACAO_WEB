@echo off
setlocal
rem Setup tests must not inherit the caller's operational database or V2 mode.
rem SETLOCAL restores these values when returning to the sandbox launcher.
set "SHOP_DB_PATH="
set "SHOP_SANDBOX_ROOT="
set "SHOP_ENABLE_V2_DRAFTS="
set "SHOP_ENABLE_V2_SALES="
set "SHOP_LOCAL_V2_CONFIG="
set "SHOP_LOCAL_V2_RESTORE_READY="
cd /d "%~dp0.."
title Shop Me CaCao - First Time Setup
where node >nul 2>nul
if errorlevel 1 (echo [ERROR] Chua tim thay Node.js.&pause&exit /b 1)
for /f "tokens=1,2 delims=." %%a in ('node -p "process.versions.node"') do (
  set "NODE_MAJOR=%%a"
  set "NODE_MINOR=%%b"
)
if %NODE_MAJOR% LSS 22 (echo [ERROR] Can Node.js 22.13 tro len vi ung dung dung node:sqlite.&pause&exit /b 1)
if %NODE_MAJOR% EQU 22 if %NODE_MINOR% LSS 13 (echo [ERROR] Can Node.js 22.13 tro len vi ung dung dung node:sqlite.&pause&exit /b 1)
echo [1/4] Cai thu vien...
call npm ci
if errorlevel 1 goto :fail
echo [2/4] Kiem tra TypeScript...
call npm run typecheck
if errorlevel 1 goto :fail
echo [3/4] Chay schema + core self-test...
call npm run test:schema
if errorlevel 1 goto :fail
call npm run test:core
if errorlevel 1 goto :fail
call npm run test:performance
if errorlevel 1 goto :fail
call npm run test:warehouse
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
