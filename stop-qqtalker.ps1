$ErrorActionPreference = "Stop"

$root = Split-Path -Parent $MyInvocation.MyCommand.Path
$shutdownUrl = "http://127.0.0.1:3180/api/admin/shutdown"

function Invoke-GracefulShutdown {
  try {
    $payload = @{ reason = "task-finished" } | ConvertTo-Json -Compress
    Invoke-RestMethod -Uri $shutdownUrl -Method Post -ContentType "application/json" -Body $payload -TimeoutSec 5 | Out-Null
    Start-Sleep -Seconds 2
    return $true
  } catch {
    return $false
  }
}

function Get-QQTalkerProcess {
  try {
    $connection = Get-NetTCPConnection -LocalPort 3180 -State Listen -ErrorAction Stop | Select-Object -First 1
    if (-not $connection) {
      return $null
    }

    $process = Get-CimInstance Win32_Process -Filter "ProcessId = $($connection.OwningProcess)"
    if (-not $process) {
      return $null
    }

    $commandLine = $process.CommandLine
    $executablePath = $process.ExecutablePath
    $matchesWorkspace = ($commandLine -and $commandLine.Contains($root)) -or ($executablePath -and $executablePath.Contains($root))
    $isPackagedExe = $process.Name -ieq "qq-talker.exe"
    if ($matchesWorkspace -or $isPackagedExe) {
      return $process
    }
  } catch {
    return $null
  }

  return $null
}

if (Invoke-GracefulShutdown) {
  Write-Host "QQTalker graceful shutdown requested." -ForegroundColor Green
  exit 0
}

$process = Get-QQTalkerProcess
if (-not $process) {
  Write-Host "QQTalker is not running or the process does not belong to this workspace." -ForegroundColor Yellow
  exit 0
}

try {
  Stop-Process -Id $process.ProcessId -ErrorAction Stop
  Start-Sleep -Milliseconds 800
  Write-Host "QQTalker process stopped: PID $($process.ProcessId)" -ForegroundColor Yellow
} catch {
  Stop-Process -Id $process.ProcessId -Force -ErrorAction Stop
  Write-Host "QQTalker process force-stopped: PID $($process.ProcessId)" -ForegroundColor Red
}
