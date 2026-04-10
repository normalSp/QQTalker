$ErrorActionPreference = "Stop"

$root = Split-Path -Parent $MyInvocation.MyCommand.Path
Set-Location $root

$python = Join-Path $root ".venv\Scripts\python.exe"
if (!(Test-Path $python)) {
  throw "voice-service venv not found"
}

$modelDir = (Resolve-Path '..\data\voice-models').Path
$env:VOICE_MODEL_DIR = $modelDir
$env:VOICE_DEFAULT_BACKEND = "gpt-sovits"
$env:VOICE_GPTSOVITS_UPSTREAM = "http://127.0.0.1:9880/tts"
if (-not $env:VOICE_RVC_UPSTREAM) {
  $env:VOICE_RVC_UPSTREAM = "http://127.0.0.1:8766/convert"
}

# Windows 上快速重启 uvicorn 时，8765 端口可能短暂停留在 TIME_WAIT。
# 这里先等待端口完全释放，避免反复启动时误报“地址已被使用”。
$maxWaitRounds = 20
for ($round = 0; $round -lt $maxWaitRounds; $round++) {
  $connections = Get-NetTCPConnection -LocalPort 8765 -ErrorAction SilentlyContinue
  if (-not $connections) {
    break
  }

  $listeners = $connections | Where-Object { $_.State -eq "Listen" -and $_.OwningProcess -ne 0 }
  if ($listeners) {
    throw "port 8765 is already in use by another process"
  }

  Start-Sleep -Seconds 2
}

& $python -m uvicorn app:app --host 127.0.0.1 --port 8765
