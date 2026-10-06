@echo off
setlocal
cd /d "%~dp0.."
if not exist "node_modules" call scripts\SETUP_FIRST_TIME.bat
start "" "http://localhost:5173"
call npm run dev
