param(
  [string]$ProjectRoot = "",
  [ValidateSet("minimal", "full")]
  [string]$Mode = "minimal"
)

$ErrorActionPreference = "Stop"

$repoRoot = Resolve-Path (Join-Path $PSScriptRoot "..\..")
if (-not $ProjectRoot) {
  $ProjectRoot = Join-Path (Split-Path $repoRoot -Parent) "RVC-Project"
}

if (-not (Test-Path $ProjectRoot)) {
  throw "Missing RVC project directory: $ProjectRoot"
}

$pythonExe = if (Test-Path (Join-Path $ProjectRoot ".venv\Scripts\python.exe")) {
  Join-Path $ProjectRoot ".venv\Scripts\python.exe"
} elseif (Test-Path (Join-Path (Split-Path $repoRoot -Parent) "GPT-SoVITS\.venv\Scripts\python.exe")) {
  Join-Path (Split-Path $repoRoot -Parent) "GPT-SoVITS\.venv\Scripts\python.exe"
} else {
  "python"
}

$downloadCode = @'
from pathlib import Path
import requests

BASE = Path(r"__PROJECT_ROOT__")
HF = "https://huggingface.co/lj1995/VoiceConversionWebUI/resolve/main/"
MODE = "__MODE__"

minimal_files = [
    ("hubert_base.pt", BASE / "assets" / "hubert" / "hubert_base.pt"),
    ("rmvpe.pt", BASE / "assets" / "rmvpe" / "rmvpe.pt"),
    ("pretrained_v2/f0G40k.pth", BASE / "assets" / "pretrained_v2" / "f0G40k.pth"),
    ("pretrained_v2/f0D40k.pth", BASE / "assets" / "pretrained_v2" / "f0D40k.pth"),
]

full_extra = [
    ("pretrained_v2/G40k.pth", BASE / "assets" / "pretrained_v2" / "G40k.pth"),
    ("pretrained_v2/D40k.pth", BASE / "assets" / "pretrained_v2" / "D40k.pth"),
]

targets = minimal_files + (full_extra if MODE == "full" else [])

for relative, out_path in targets:
    out_path.parent.mkdir(parents=True, exist_ok=True)
    if out_path.exists() and out_path.stat().st_size > 0:
        print(f"[skip] {out_path}")
        continue
    url = HF + relative
    print(f"[download] {url}")
    with requests.get(url, stream=True, timeout=30) as resp:
        resp.raise_for_status()
        total = int(resp.headers.get("content-length") or 0)
        written = 0
        with open(out_path, "wb") as fh:
            for chunk in resp.iter_content(chunk_size=1024 * 1024):
                if not chunk:
                    continue
                fh.write(chunk)
                written += len(chunk)
                if total:
                    print(f"  -> {out_path.name}: {written}/{total}")
                else:
                    print(f"  -> {out_path.name}: {written}")

print("RVC assets ready.")
'@

$downloadCode = $downloadCode.Replace("__PROJECT_ROOT__", ($ProjectRoot -replace "\\", "\\"))
$downloadCode = $downloadCode.Replace("__MODE__", $Mode)
$tempPy = Join-Path $ProjectRoot "_tmp_setup_rvc_assets.py"
Set-Content -Path $tempPy -Value $downloadCode -Encoding UTF8

Push-Location $ProjectRoot
try {
  & $pythonExe $tempPy
} finally {
  if (Test-Path $tempPy) {
    Remove-Item $tempPy -Force
  }
  Pop-Location
}
