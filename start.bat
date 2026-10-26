@echo off
cd /d "%~dp0"
if not exist node_modules (
  echo Installing dependencies, this takes a minute the first time...
  call npm install || goto :err
)
call npm start
goto :eof
:err
echo Install failed. Make sure Node.js 20+ is installed from https://nodejs.org
pause
