# FFmpeg Installer for QQTalker STT
# Usage: .\install-ffmpeg.ps1

$ErrorActionPreference = "Stop"

Write-Host "=== QQTalker FFmpeg Installer ===" -ForegroundColor Cyan
Write-Host ""

$toolsDir = Join-Path $PSScriptRoot "tools"
$ffmpegExe = Join-Path $toolsDir "ffmpeg.exe"

if (-not (Test-Path $toolsDir)) {
    New-Item -ItemType Directory -Path $toolsDir -Force | Out-Null
}

if (Test-Path $ffmpegExe) {
    Write-Host "[OK] Local FFmpeg found: $ffmpegExe" -ForegroundColor Green
    & $ffmpegExe -version 2>&1 | Select-Object -First 3
    exit 0
}

Write-Host "Trying to install FFmpeg automatically..." -ForegroundColor Yellow
$installed = $false

# Method 1: winget
try {
    Write-Host "`n[1] Trying winget install Gyan.FFmpeg ..." -ForegroundColor Yellow
    winget install --id Gyan.FFmpeg -e --accept-source-agreements --accept-package-agreements 2>$null
    if ($LASTEXITCODE -eq 0) {
        Write-Host "[OK] Installed via winget" -ForegroundColor Green
        ffmpeg -version 2>&1 | Select-Object -First 1
        $installed = $true
    }
} catch {
    Write-Host "    winget failed: $_"
}

# Method 2: scoop
if (-not $installed) {
    try {
        Write-Host "`n[2] Trying scoop install ffmpeg ..." -ForegroundColor Yellow
        scoop install ffmpeg 2>$null
        if ($LASTEXITCODE -eq 0) {
            Write-Host "[OK] Installed via scoop" -ForegroundColor Green
            $installed = $true
        }
    } catch {
        Write-Host "    scoop not available"
    }
}

# Method 3: choco
if (-not $installed) {
    try {
        Write-Host "`n[3] Trying choco install ffmpeg ..." -ForegroundColor Yellow
        choco install ffmpeg -y 2>$null
        if ($LASTEXITCODE -eq 0) {
            Write-Host "[OK] Installed via choco" -ForegroundColor Green
            $installed = $true
        }
    } catch {
        Write-Host "    choco not available"
    }
}

# Method 4: download to project tools dir
if (-not $installed) {
    try {
        Write-Host "`n[4] Downloading FFmpeg to project tools/ ..." -ForegroundColor Yellow
        Write-Host "    (~80MB from gyan.dev)" -ForegroundColor DarkGray
        
        [Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12
        $downloadUrl = "https://www.gyan.dev/ffmpeg/builds/ffmpeg-release-essentials.zip"
        $zipPath = Join-Path $toolsDir "ffmpeg.zip"
        
        Invoke-WebRequest -Uri $downloadUrl -OutFile $zipPath -UseBasicParsing
        
        Write-Host "    Extracting..."
        Expand-Archive -Path $zipPath -DestinationPath $toolsDir -Force
        
        $extractedDirs = Get-ChildItem -Path $toolsDir -Directory
        foreach ($dir in $extractedDirs) {
            $binFFmpeg = Join-Path $dir.FullName "bin\ffmpeg.exe"
            if (Test-Path $binFFmpeg) {
                Copy-Item $binFFmpeg $ffmpegExe -Force
                $probeSrc = Join-Path $dir.FullName "bin\ffprobe.exe"
                if (Test-Path $probeSrc) {
                    Copy-Item $probeSrc (Join-Path $toolsDir "ffprobe.exe") -Force
                }
                Remove-Item -Recurse -Force $dir.FullName -ErrorAction SilentlyContinue
                break
            }
        }
        
        Remove-Item -Force $zipPath -ErrorAction SilentlyContinue
        
        if (Test-Path $ffmpegExe) {
            Write-Host "`n[OK] FFmpeg installed: $ffmpegExe" -ForegroundColor Green
            & $ffmpegExe -version 2>&1 | Select-Object -First 3
            exit 0
        }
    } catch {
        Write-Host "    Download failed: $_" -ForegroundColor Red
    }
}

# All failed
if (-not (Test-Path $ffmpegExe)) {
    Write-Host ""
    Write-Host "========================================" -ForegroundColor Red
    Write-Host "Auto-install FAILED. Manual steps:" -ForegroundColor Red
    Write-Host ""
    Write-Host "Option A - Download to project (recommended):" -ForegroundColor Cyan
    Write-Host "  1. Open: https://www.gyan.dev/ffmpeg/builds/"
    Write-Host "  2. Download: ffmpeg-release-essentials.zip (~80MB)"
    Write-Host "  3. Extract and copy bin\\ffmpeg.exe to: tools\\ffmpeg.exe"
    Write-Host ""
    Write-Host "Option B - System install (needs admin):" -ForegroundColor Cyan
    Write-Host "  winget install Gyan.FFmpeg"
    Write-Host "  or: choco install ffmpeg -y"
    Write-Host ""
    Write-Host "Without FFmpeg, STT uses built-in AMR converter (limited quality)" -ForegroundColor DarkGray
    exit 1
}
