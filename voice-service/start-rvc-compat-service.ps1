$ErrorActionPreference = "Stop"

$root = Split-Path -Parent $MyInvocation.MyCommand.Path
$repoRoot = Resolve-Path (Join-Path $root "..")
$python = "D:\workspace\CodeBuddyWorkSpace\GPT-SoVITS\.venv\Scripts\python.exe"

if (!(Test-Path $python)) {
  throw "GPT-SoVITS python venv not found: $python"
}

$maxWaitRounds = 20
for ($round = 0; $round -lt $maxWaitRounds; $round++) {
  $connections = Get-NetTCPConnection -LocalPort 8766 -ErrorAction SilentlyContinue
  if (-not $connections) {
    break
  }

  $listeners = $connections | Where-Object { $_.State -eq "Listen" -and $_.OwningProcess -ne 0 }
  if ($listeners) {
    throw "port 8766 is already in use by another process"
  }

  Start-Sleep -Seconds 2
}

Set-Location $root
& $python -m uvicorn rvc_compat_service:app --host 127.0.0.1 --port 8766
