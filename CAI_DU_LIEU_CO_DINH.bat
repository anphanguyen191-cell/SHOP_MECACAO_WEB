@echo off
setlocal
cd /d "%~dp0"
title Shop Me CaCao - Chuyen du lieu co dinh
where node >nul 2>nul
if errorlevel 1 (echo Can Node.js 22.13+ hoac 24.&pause&exit /b 1)
echo CHON THU MUC SHOP CU DANG CO DU LIEU.
echo Khong xoa thu muc data hoac kho anh cu.
node scripts\install-managed.mjs
if errorlevel 1 (echo CHUA CHUYEN. Du lieu goc duoc giu nguyen.)
pause
