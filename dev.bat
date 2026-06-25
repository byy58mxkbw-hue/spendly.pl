@echo off
setlocal enabledelayedexpansion

REM Kill any existing node processes
taskkill /F /IM node.exe >nul 2>&1
timeout /t 2 >nul

REM Start API Server
start "API Server" cmd /k "cd /d "%~dp0artifacts\api-server" && pnpm dev"

REM Wait and start Frontend
timeout /t 4 >nul
start "Frontend" cmd /k "cd /d "%~dp0artifacts\ksef-monitor" && pnpm dev"

REM Wait for servers to fully start
timeout /t 10 >nul

REM Open Chrome
set CHROME_PATH=C:\Program Files\Google\Chrome\Application\chrome.exe
if exist "%CHROME_PATH%" (
  start "" "%CHROME_PATH%" "http://localhost:3000"
) else (
  set CHROME_PATH=C:\Program Files ^(x86^)\Google\Chrome\Application\chrome.exe
  if exist "%CHROME_PATH%" (
    start "" "%CHROME_PATH%" "http://localhost:3000"
  ) else (
    start http://localhost:3000
  )
)

REM Show info
cls
echo.
echo ===================================
echo   SPENDLY DEVELOPER MODE ACTIVE
echo ===================================
echo.
echo Frontend:  http://localhost:3000
echo API:       http://localhost:8080
echo.
echo Chrome should open automatically
echo Close the other windows to stop servers
echo.
pause
