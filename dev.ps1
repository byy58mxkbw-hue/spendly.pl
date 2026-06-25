$ErrorActionPreference = 'SilentlyContinue'

Write-Host "🚀 SPENDLY DEVELOPER MODE" -ForegroundColor Green
Write-Host "========================" -ForegroundColor Green
Write-Host ""

# Kill any existing node processes
Write-Host "🔄 Restarting servers..." -ForegroundColor Cyan
Get-Process node -ErrorAction SilentlyContinue | Stop-Process -Force
Start-Sleep 2

$scriptPath = Split-Path -Parent $MyInvocation.MyCommand.Path
$apiPath = Join-Path $scriptPath "artifacts\api-server"
$frontendPath = Join-Path $scriptPath "artifacts\ksef-monitor"

# Start API Server
Write-Host "📡 Starting API Server (8080)..." -ForegroundColor Cyan
$apiCmd = 'cd /d "' + $apiPath + '" && pnpm dev'
Start-Process cmd.exe -ArgumentList "/k", $apiCmd -NoNewWindow | Out-Null

# Start Frontend
Write-Host "⚡ Starting Frontend (3000)..." -ForegroundColor Cyan
Start-Sleep 3
$frontendCmd = 'cd /d "' + $frontendPath + '" && pnpm dev'
Start-Process cmd.exe -ArgumentList "/k", $frontendCmd -NoNewWindow | Out-Null

# Wait for servers to start and check health
Write-Host "⏳ Waiting for servers to start..." -ForegroundColor Yellow
$maxWait = 30
$waited = 0
$frontendReady = $false

while ($waited -lt $maxWait -and -not $frontendReady) {
  try {
    $response = Invoke-WebRequest -Uri "http://localhost:3000" -TimeoutSec 2 -ErrorAction Stop
    if ($response.StatusCode -eq 200) {
      $frontendReady = $true
      Write-Host "✅ Frontend ready!" -ForegroundColor Green
    }
  } catch {
    Start-Sleep 1
    $waited++
  }
}

# Open browser in Chrome
Write-Host "🌐 Opening Chrome..." -ForegroundColor Cyan
$chromeExe = "C:\Program Files\Google\Chrome\Application\chrome.exe"
if (Test-Path $chromeExe) {
  Start-Process $chromeExe "http://localhost:3000"
} else {
  $chromeExe = "C:\Program Files (x86)\Google\Chrome\Application\chrome.exe"
  if (Test-Path $chromeExe) {
    Start-Process $chromeExe "http://localhost:3000"
  } else {
    Write-Host "⚠️  Chrome not found, opening with default browser..." -ForegroundColor Yellow
    Start-Process "http://localhost:3000"
  }
}

Write-Host ""
Write-Host "✅ All systems GO!" -ForegroundColor Green
Write-Host ""
Write-Host "  Frontend:  http://localhost:3000" -ForegroundColor Cyan
Write-Host "  API:       http://localhost:8080" -ForegroundColor Cyan
Write-Host ""
Write-Host "Close PowerShell window to stop all servers" -ForegroundColor Yellow
