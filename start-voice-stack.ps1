param(
  [switch]$RestartQQTalker
)

$ErrorActionPreference = "Stop"

$root = Split-Path -Parent $MyInvocation.MyCommand.Path
$workspaceRoot = Split-Path -Parent $root
$gptRoot = Join-Path $workspaceRoot "GPT-SoVITS"
$voiceRoot = Join-Path $root "voice-service"

function Test-HttpReady {
  param(
    [string]$Url
  )

  try {
    $response = Invoke-WebRequest -UseBasicParsing -Uri $Url -TimeoutSec 3
    return $response.StatusCode -ge 200 -and $response.StatusCode -lt 500
  } catch {
    return $false
  }
}

function Wait-HttpReady {
  param(
    [string]$Url,
    [int]$TimeoutSeconds = 60
  )

  $deadline = (Get-Date).AddSeconds($TimeoutSeconds)
  while ((Get-Date) -lt $deadline) {
    if (Test-HttpReady -Url $Url) {
      return $true
    }
    Start-Sleep -Seconds 2
  }
  return $false
}

function Start-ServiceWindow {
  param(
    [string]$Title,
    [string]$WorkingDirectory,
    [string]$Command
  )

  $script = "[Console]::Title='$Title'; Set-Location '$WorkingDirectory'; $Command"
  Start-Process powershell -ArgumentList @(
    '-NoExit',
    '-ExecutionPolicy', 'Bypass',
    '-Command', $script
  ) | Out-Null
}

function Invoke-QQTalkerRestart {
  $stopScript = Join-Path $root "stop-qqtalker.ps1"
  if (!(Test-Path $stopScript)) {
    return
  }

  try {
    & powershell -ExecutionPolicy Bypass -File $stopScript | Out-Null
    Start-Sleep -Seconds 2
  } catch {
    Write-Host "QQTalker restart requested, but stop-qqtalker.ps1 did not complete cleanly." -ForegroundColor Yellow
  }
}

if (!(Test-Path $gptRoot)) {
  throw "GPT-SoVITS sibling directory not found: $gptRoot"
}

if (!(Test-Path $voiceRoot)) {
  throw "voice-service directory not found: $voiceRoot"
}

Write-Host "Starting QQTalker GPT launch stack..." -ForegroundColor Cyan

if (Test-HttpReady -Url 'http://127.0.0.1:9880/docs') {
  Write-Host "GPT-SoVITS is already running on 9880." -ForegroundColor Yellow
} else {
  Start-ServiceWindow -Title 'GPT-SoVITS API' -WorkingDirectory $gptRoot -Command "powershell -ExecutionPolicy Bypass -File start-api-v2.ps1"
  if (Wait-HttpReady -Url 'http://127.0.0.1:9880/docs' -TimeoutSeconds 120) {
    Write-Host "GPT-SoVITS is ready." -ForegroundColor Green
  } else {
    Write-Host "GPT-SoVITS did not become ready within 120 seconds." -ForegroundColor Yellow
  }
}

if (Test-HttpReady -Url 'http://127.0.0.1:8765/health') {
  Write-Host "voice-service is already running on 8765." -ForegroundColor Yellow
} else {
  Start-ServiceWindow -Title 'QQTalker voice-service' -WorkingDirectory $voiceRoot -Command "powershell -ExecutionPolicy Bypass -File start-local-service.ps1"
  if (Wait-HttpReady -Url 'http://127.0.0.1:8765/health' -TimeoutSeconds 30) {
    Write-Host "voice-service is ready." -ForegroundColor Green
  } else {
    Write-Host "voice-service did not become ready within 30 seconds." -ForegroundColor Yellow
  }
}

if ($RestartQQTalker) {
  Invoke-QQTalkerRestart
}

if (Test-HttpReady -Url 'http://127.0.0.1:3180/api/status') {
  Write-Host "QQTalker Dashboard is already running on 3180." -ForegroundColor Yellow
} else {
  Start-ServiceWindow -Title 'QQTalker' -WorkingDirectory $root -Command "npm run dev"
  if (Wait-HttpReady -Url 'http://127.0.0.1:3180/api/status' -TimeoutSeconds 45) {
    Write-Host "QQTalker is ready." -ForegroundColor Green
  } else {
    Write-Host "QQTalker did not become ready within 45 seconds." -ForegroundColor Yellow
  }
}

Write-Host ""
Write-Host "QQTalker GPT launch stack is ready." -ForegroundColor Cyan
Write-Host "GPT-SoVITS: http://127.0.0.1:9880/docs"
Write-Host "voice-service: http://127.0.0.1:8765/health"
Write-Host "QQTalker Dashboard: http://127.0.0.1:3180"
