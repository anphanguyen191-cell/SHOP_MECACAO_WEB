@echo off
setlocal
cd /d "%~dp0"
title Shop Me CaCao - V7.3.0
where node >nul 2>nul
if errorlevel 1 (
 echo Can cai Node.js 22.13 hoac moi hon truoc khi mo ung dung.
 pause
 exit /b 1
)
node -e "const [a,b]=process.versions.node.split('.').map(Number);process.exit(a>22||(a===22&&b>=13)?0:1)"
if errorlevel 1 goto :node_error
echo SHOP ME CACAO - Dang mo ung dung...
node scripts\open-shop.mjs
if errorlevel 1 goto :fail
exit /b 0
:node_error
echo Can Node.js 22.13 hoac moi hon.
:fail
echo Khong khoi dong duoc. Xem thong bao loi ben tren.
pause
exit /b 1
