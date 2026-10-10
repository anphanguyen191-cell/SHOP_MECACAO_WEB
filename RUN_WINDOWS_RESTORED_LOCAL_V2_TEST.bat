@echo off
setlocal
cd /d "%~dp0"
title Shop Me CaCao - LOCAL V2 RESTORE TEST
node scripts\local-v2-business.mjs restore
pause
