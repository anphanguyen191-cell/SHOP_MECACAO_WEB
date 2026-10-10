@echo off
setlocal
cd /d "%~dp0"
title Shop Me CaCao - V2 LOCAL COPY REVIEW
if not exist "apps\api\dist\localV2Preparation.js" (
  echo Chay PREPARE_WINDOWS_V2_LOCAL_COPY.bat truoc.
  pause
  exit /b 1
)
node scripts\run-local-v2-review.mjs
if errorlevel 1 pause
