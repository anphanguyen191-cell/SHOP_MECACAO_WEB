@echo off
setlocal
cd /d "%~dp0"
title Shop Me CaCao - Rollback UNUSED LOCAL V2
node scripts\local-v2-business.mjs rollback
pause
