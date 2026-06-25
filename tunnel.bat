@echo off
setlocal enabledelayedexpansion

REM Cloudflare Tunnel + Dev Server Launcher
title Spendly - Dev Server + Cloudflare Tunnel

cd /d "%~dp0"

REM Kill any existing node processes
taskkill /F /IM node.exe >nul 2>&1
timeout /t 2 >nul

echo.
echo ===================================
echo   SPENDLY DEV + TUNNEL LAUNCHER
echo ===================================
echo.

REM Start API Server
echo 📡 Starting API Server (8080)...
start "API Server" cmd /k "cd artifacts\api-server && pnpm dev"

REM Start Frontend
echo ⚡ Starting Frontend (3000)...
timeout /t 4 >nul
start "Frontend" cmd /k "cd artifacts\ksef-monitor && pnpm dev"

REM Wait for servers to start
timeout /t 8 >nul

REM Start Cloudflare Tunnel
echo.
echo 🌐 Starting Cloudflare Tunnel (localhost:22900 -> Public URL)
echo.
cloudflared tunnel --url localhost:22900

echo.
echo ===================================
echo   Press CTRL+C to stop all services
echo ===================================
pause
