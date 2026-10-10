@echo off
setlocal
cd /d "%~dp0"
title Shop Me CaCao - Tao kho MAIN TEST gia lap
where node >nul 2>nul
if errorlevel 1 goto :fail
if not exist node_modules call npm ci
if errorlevel 1 goto :fail
node scripts\create-stage6-main-test-warehouse.mjs
if errorlevel 1 goto :fail
echo.
echo Kho gia lap da san sang. Chon dung thu muc trong START_SHOP.bat.
pause
exit /b 0
:fail
echo Tao kho thu that bai. Khong su dung kho kinh doanh.
pause
exit /b 1
