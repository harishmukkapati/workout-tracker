@echo off
cd /d "%~dp0"
call npm install || goto :err
call npm run build || goto :err
echo.
echo Done. The installer is in the dist folder.
explorer dist
pause
goto :eof
:err
echo Build failed. Make sure Node.js 20+ is installed from https://nodejs.org
pause
