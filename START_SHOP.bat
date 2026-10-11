@echo off
setlocal
cd /d "%~dp0"
title Shop Me CaCao - V7.1.2
where node >nul 2>nul
if errorlevel 1 (
 echo Can cai Node.js 22.13 hoac moi hon truoc khi mo ung dung.
 pause
 exit /b 1
)
node -e "const [a,b]=process.versions.node.split('.').map(Number);process.exit(a>22||(a===22&&b>=13)?0:1)"
if errorlevel 1 goto :node_error
if not exist node_modules (
 call npm ci
 if errorlevel 1 goto :fail
)
call npm run build
if errorlevel 1 goto :fail
echo SHOP ME CACAO V7.1.2 - Mo kho cua shop tren giao dien.
node scripts\start-stage2.mjs
if errorlevel 1 goto :fail
exit /b 0
:node_error
echo Can Node.js 22.13 hoac moi hon.
:fail
echo Khong khoi dong duoc. Xem thong bao loi ben tren.
pause
exit /b 1
