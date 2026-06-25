@echo off
setlocal enabledelayedexpansion

REM All-In-One: Dev Server + Cloudflare Tunnel
title Spendly - Complete Setup
cd /d "%~dp0"

REM Kill any existing processes
taskkill /F /IM node.exe >nul 2>&1
timeout /t 2 >nul

cls
echo.
echo =====================================
echo   SPENDLY - ONE-CLICK LAUNCHER
echo =====================================
echo.

REM Start API Server (window 1)
echo [API] Starting API Server...
start "API Server" cmd /k "cd artifacts\api-server && pnpm dev"

REM Start Frontend (window 2)
echo [Frontend] Starting Frontend...
timeout /t 4 >nul
start "Frontend" cmd /k "cd artifacts\ksef-monitor && pnpm dev"

REM Start Tunnel (window 3)
echo [Tunnel] Starting Cloudflare Tunnel...
timeout /t 8 >nul
start "Cloudflare Tunnel" cmd /k "echo Tunnel starting... && timeout /t 2 && %USERPROFILE%\scoop\shims\cloudflared.exe tunnel --url localhost:3000"

REM Wait for servers to start
timeout /t 6 >nul

REM Open browser to Settings page
echo [Browser] Opening application...
start http://localhost:3000/settings/ksef

REM Show info
cls
echo.
echo ========================================
echo    SPENDLY - KSEF SETTINGS OPENED!
echo ========================================
echo.
echo Browser window should open automatically.
echo.
echo If not, visit:
echo    http://localhost:3000/settings/ksef
echo.
echo You can now paste your KSeF token!
echo.
pause
