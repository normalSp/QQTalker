param(
  [Parameter(Mandatory = $true)]
  [string]$Character,
  [string]$ProjectRoot = "",
  [switch]$Execute
)

$ErrorActionPreference = "Stop"

$repoRoot = Resolve-Path (Join-Path $PSScriptRoot "..\..")
$trainingRoot = Join-Path $repoRoot "data\voice-models\training\$Character"
$configPath = Join-Path $trainingRoot "train\rvc-config.example.json"
$clipsPath = Join-Path $trainingRoot "manifests\clips.json"
$segmentsDir = Join-Path $trainingRoot "segments"

if (-not (Test-Path $configPath)) {
  throw "Missing config file: $configPath"
}
if (-not (Test-Path $clipsPath)) {
  throw "Missing clips manifest: $clipsPath"
}

if (-not $ProjectRoot) {
  $ProjectRoot = if ($env:RVC_PROJECT_ROOT) {
    $env:RVC_PROJECT_ROOT
  } else {
    Join-Path (Split-Path $repoRoot -Parent) "RVC-Project"
  }
}

$cfg = Get-Content -Raw -Encoding UTF8 -Path $configPath | ConvertFrom-Json
$versionId = if ($cfg.versionId) { [string]$cfg.versionId } else { "custom-rvc" }
$sampleRate = if ($cfg.targetSampleRate) { [int]$cfg.targetSampleRate } else { 40000 }
$sampleRateTag = if ($sampleRate -eq 40000) {
  "40k"
} elseif ($sampleRate -eq 48000) {
  "48k"
} else {
  "32k"
}
$expName = "$Character-$versionId"
$expDir = "logs/$expName"
$expAbsDir = Join-Path $ProjectRoot $expDir
$outputDir = Join-Path $repoRoot "data\voice-models\$Character\rvc"
$commandsPath = Join-Path $trainingRoot "train\rvc\$versionId\commands.generated.ps1"
$helperPath = Join-Path $trainingRoot "train\rvc\$versionId\prepare_experiment.py"
$rvcInputDir = Join-Path $trainingRoot "train\rvc\$versionId\input"
if (Test-Path $expAbsDir) {
  Get-ChildItem -Path $expAbsDir -Force -ErrorAction SilentlyContinue | Remove-Item -Recurse -Force
}
New-Item -ItemType Directory -Force -Path (Split-Path $commandsPath -Parent), $outputDir, $expAbsDir, $rvcInputDir | Out-Null

$pythonExe = if (Test-Path (Join-Path $ProjectRoot ".venv\Scripts\python.exe")) {
  Join-Path $ProjectRoot ".venv\Scripts\python.exe"
} elseif (Test-Path (Join-Path (Split-Path $repoRoot -Parent) "GPT-SoVITS\.venv\Scripts\python.exe")) {
  Join-Path (Split-Path $repoRoot -Parent) "GPT-SoVITS\.venv\Scripts\python.exe"
} else {
  "python"
}

$configRelPath = if ($sampleRate -eq 40000) {
  "configs/v1/40k.json"
} elseif ($sampleRate -eq 48000) {
  "configs/v2/48k.json"
} else {
  "configs/v2/32k.json"
}

$pretrainG = if ($sampleRate -eq 40000) {
  "assets/pretrained_v2/f0G40k.pth"
} else {
  ""
}

$pretrainD = if ($sampleRate -eq 40000) {
  "assets/pretrained_v2/f0D40k.pth"
} else {
  ""
}

$clipsManifest = Get-Content -Raw -Encoding UTF8 -Path $clipsPath | ConvertFrom-Json
Get-ChildItem -Path $rvcInputDir -Filter "*.wav" -ErrorAction SilentlyContinue | Remove-Item -Force
$selectedClips = @($clipsManifest.clips | Where-Object {
  $_.enabled -ne $false -and $_.usableForTrain -eq $true
})
if ($selectedClips.Count -eq 0) {
  throw "No usable clips found for RVC training in $clipsPath"
}
foreach ($clip in $selectedClips) {
  $sourcePath = Join-Path $segmentsDir ($clip.id + ".wav")
  if (-not (Test-Path $sourcePath)) {
    throw "Missing segment audio for clip $($clip.id): $sourcePath"
  }
  Copy-Item -Path $sourcePath -Destination (Join-Path $rvcInputDir ($clip.id + ".wav")) -Force
}
Write-Host "Prepared curated RVC input dir: $rvcInputDir ($($selectedClips.Count) clips)"

$prepareCode = @"
from pathlib import Path
import json
import shutil

project = Path(r"$ProjectRoot")
exp_dir = project / "logs" / "$expName"
exp_dir.mkdir(parents=True, exist_ok=True)
config_src = project / "$configRelPath"
config_dst = exp_dir / "config.json"
if not config_dst.exists():
    shutil.copyfile(config_src, config_dst)

gt_dir = exp_dir / "0_gt_wavs"
feature_dir = exp_dir / "3_feature768"
f0_dir = exp_dir / "2a_f0"
f0nsf_dir = exp_dir / "2b-f0nsf"
rows = []
if gt_dir.exists() and feature_dir.exists():
    for wav_path in sorted(gt_dir.glob("*.wav")):
        name = wav_path.stem
        feature_path = feature_dir / f"{name}.npy"
        f0_path = f0_dir / f"{name}.wav.npy"
        f0nsf_path = f0nsf_dir / f"{name}.wav.npy"
        if not feature_path.exists():
            continue
        if f0_path.exists() and f0nsf_path.exists():
            rows.append(f"{wav_path}|{feature_path}|{f0_path}|{f0nsf_path}|0")

with open(exp_dir / "filelist.txt", "w", encoding="utf-8") as fh:
    fh.write("\n".join(rows))

print(f"prepared {len(rows)} training rows in {exp_dir / 'filelist.txt'}")
"@

Set-Content -Path $helperPath -Value $prepareCode -Encoding UTF8

$commands = @(
  "# RVC training command template for common Retrieval-based-Voice-Conversion-WebUI layouts",
  "# Adjust script names or parameters if your local fork differs",
  "& `"$pythonExe`" `"infer/modules/train/preprocess.py`" `"$rvcInputDir`" $sampleRate 2 `"$expDir`" False 3.7",
  "& `"$pythonExe`" `"infer/modules/train/extract/extract_f0_rmvpe.py`" 1 0 0 `"$expDir`" False",
  "& `"$pythonExe`" `"infer/modules/train/extract_feature_print.py`" cpu 1 0 0 `"$expDir`" v2 False",
  "& `"$pythonExe`" `"$helperPath`"",
  "`$env:RVC_NUM_WORKERS='0'; `$env:RVC_PREFETCH_FACTOR='2'; `$env:PYTORCH_CUDA_ALLOC_CONF='max_split_size_mb:64'; & `"$pythonExe`" `"infer/modules/train/train.py`" -e `"$expName`" -sr $sampleRateTag -f0 1 -bs 2 -te 160 -se 20 -v v2 -l 1 -c 0 -pg `"$pretrainG`" -pd `"$pretrainD`"",
  "# This RVC version builds index via infer-web.py::train_index(...) instead of a standalone train_index.py",
  "& `"$pythonExe`" -c `"import importlib.util; spec=importlib.util.spec_from_file_location('infer_web', 'infer-web.py'); m=importlib.util.module_from_spec(spec); spec.loader.exec_module(m); [print(x) for x in m.train_index('$expName','v2')]`"",
  "",
  "# After training, import artifacts into QQTalker:",
  "# node scripts/voice-training/import-rvc-artifacts.mjs --character=$Character --model=<model.pth> --index=<added.index>"
)

Set-Content -Path $commandsPath -Value ($commands -join "`r`n") -Encoding UTF8

Write-Host "Generated RVC command template: $commandsPath"
Write-Host "RVC artifact import directory: $outputDir"
if (-not (Test-Path $ProjectRoot)) {
  Write-Warning "Local RVC project directory not found: $ProjectRoot"
  Write-Warning "This is one of the main reasons why RVC Compatible is still unavailable in the frontend."
}

if ($Execute) {
  if (-not (Test-Path $ProjectRoot)) {
    throw "Missing RVC project directory: $ProjectRoot"
  }
  Push-Location $ProjectRoot
  try {
    Invoke-Expression ($commands[2])
    Invoke-Expression ($commands[3])
    Invoke-Expression ($commands[4])
    Invoke-Expression ($commands[5])
    Invoke-Expression ($commands[6])
    Invoke-Expression ($commands[8])
  } finally {
    Pop-Location
  }
}
