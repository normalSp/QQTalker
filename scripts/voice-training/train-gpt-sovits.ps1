param(
  [Parameter(Mandatory = $true)]
  [string]$Character,
  [string]$ProjectRoot = "",
  [switch]$Execute
)

$ErrorActionPreference = "Stop"

$repoRoot = Resolve-Path (Join-Path $PSScriptRoot "..\..")
$trainingRoot = Join-Path $repoRoot "data\voice-models\training\$Character"
$configPath = Join-Path $trainingRoot "train\gpt-sovits-config.example.json"
$segmentsDir = Join-Path $trainingRoot "segments"
$preparedDir = Join-Path $trainingRoot "train\prepared"

if (-not (Test-Path $configPath)) {
  throw "Missing config file: $configPath"
}

if (-not $ProjectRoot) {
  $ProjectRoot = Join-Path (Split-Path $repoRoot -Parent) "GPT-SoVITS"
}

$cfg = Get-Content -Raw -Encoding UTF8 -Path $configPath | ConvertFrom-Json
$versionId = if ($cfg.versionId) { [string]$cfg.versionId } else { "custom-gpt" }
$workRoot = Join-Path $trainingRoot "train\gpt-sovits\$versionId"
$stage1Dir = Join-Path $workRoot "stage1"
$stage2Dir = Join-Path $workRoot "stage2"
$halfWeightsDir = Join-Path $stage1Dir "half_weights"
$stage1ConfigPath = Join-Path $workRoot "s1.generated.yaml"
$stage2ConfigPath = Join-Path $workRoot "s2.generated.json"

New-Item -ItemType Directory -Force -Path $stage1Dir, $stage2Dir, $halfWeightsDir | Out-Null

$stage1Yaml = @"
train:
  seed: 1234
  epochs: 20
  batch_size: 8
  save_every_n_epoch: 1
  precision: 16-mixed
  gradient_clip: 1.0
  if_save_latest: true
  if_save_every_weights: true
  half_weights_save_dir: "$($halfWeightsDir -replace '\\','/')"
  exp_name: "$Character-$versionId"
optimizer:
  lr: 0.01
  lr_init: 0.00001
  lr_end: 0.0001
  warmup_steps: 2000
  decay_steps: 40000
data:
  max_eval_sample: 8
  max_sec: 54
  num_workers: 4
  pad_val: 1024
model:
  vocab_size: 1025
  phoneme_vocab_size: 732
  embedding_dim: 512
  hidden_dim: 512
  head: 16
  linear_units: 2048
  n_layer: 24
  dropout: 0
  EOS: 1024
  random_bert: 0
inference:
  top_k: 15
output_dir: "$($stage1Dir -replace '\\','/')"
train_semantic_path: "$((Join-Path $preparedDir '6-name2semantic.tsv') -replace '\\','/')"
train_phoneme_path: "$((Join-Path $preparedDir '2-name2text.txt') -replace '\\','/')"
"@
Set-Content -Path $stage1ConfigPath -Value $stage1Yaml -Encoding UTF8

$stage2Config = [ordered]@{
  train = [ordered]@{
    log_interval = 100
    eval_interval = 500
    seed = 1234
    epochs = 100
    learning_rate = 0.0001
    betas = @(0.8, 0.99)
    eps = 1e-09
    batch_size = 8
    fp16_run = $true
    lr_decay = 0.999875
    segment_size = 20480
    init_lr_ratio = 1
    warmup_epochs = 0
    c_mel = 45
    c_kl = 1.0
    text_low_lr_rate = 0.4
    grad_ckpt = $false
  }
  data = [ordered]@{
    max_wav_value = 32768.0
    sampling_rate = [int]$cfg.targetSampleRate
    filter_length = 2048
    hop_length = 640
    win_length = 2048
    n_mel_channels = 128
    mel_fmin = 0.0
    mel_fmax = $null
    add_blank = $true
    n_speakers = 1
    cleaned_text = $true
    exp_dir = ($workRoot -replace '\\','/')
    training_files = ((Join-Path $preparedDir 'train.list') -replace '\\','/')
    validation_files = ((Join-Path $preparedDir 'val.list') -replace '\\','/')
  }
  model = [ordered]@{
    inter_channels = 192
    hidden_channels = 192
    filter_channels = 768
    n_heads = 2
    n_layers = 6
    kernel_size = 3
    p_dropout = 0.1
    resblock = "1"
    resblock_kernel_sizes = @(3, 7, 11)
    resblock_dilation_sizes = @(@(1, 3, 5), @(1, 3, 5), @(1, 3, 5))
    upsample_rates = @(10, 8, 2, 2, 2)
    upsample_initial_channel = 512
    upsample_kernel_sizes = @(16, 16, 8, 2, 2)
    n_layers_q = 3
    use_spectral_norm = $false
    gin_channels = 512
    semantic_frame_rate = "25hz"
    freeze_quantizer = $true
    version = "v2"
  }
  s2_ckpt_dir = ($stage2Dir -replace '\\','/')
  content_module = "cnhubert"
}
$stage2Config | ConvertTo-Json -Depth 8 | Set-Content -Path $stage2ConfigPath -Encoding UTF8

$pythonExe = if (Test-Path (Join-Path $ProjectRoot ".venv\Scripts\python.exe")) {
  Join-Path $ProjectRoot ".venv\Scripts\python.exe"
} else {
  "python"
}

$cmd1 = "& `"$pythonExe`" `"GPT_SoVITS\s1_train.py`" --config_file `"$stage1ConfigPath`""
$cmd2 = "& `"$pythonExe`" `"GPT_SoVITS\s2_train.py`" --config `"$stage2ConfigPath`""

Write-Host "Generated GPT-SoVITS training templates:"
Write-Host "  $stage1ConfigPath"
Write-Host "  $stage2ConfigPath"
Write-Host ""
Write-Host "Training data directory: $segmentsDir"
Write-Host "Prepare these files first:"
Write-Host "  $preparedDir\2-name2text.txt"
Write-Host "  $preparedDir\6-name2semantic.tsv"
Write-Host "  $preparedDir\train.list"
Write-Host "  $preparedDir\val.list"
Write-Host ""
Write-Host "Suggested commands:"
Write-Host "  $cmd1"
Write-Host "  $cmd2"

if ($Execute) {
  if (-not (Test-Path $ProjectRoot)) {
    throw "Missing GPT-SoVITS directory: $ProjectRoot"
  }
  Push-Location $ProjectRoot
  try {
    Invoke-Expression $cmd1
    Invoke-Expression $cmd2
  } finally {
    Pop-Location
  }
}
