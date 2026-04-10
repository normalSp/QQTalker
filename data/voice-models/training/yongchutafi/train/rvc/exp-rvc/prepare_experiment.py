from pathlib import Path
import json
import shutil

project = Path(r"D:\workspace\CodeBuddyWorkSpace\RVC-Project")
exp_dir = project / "logs" / "yongchutafi-exp-rvc"
exp_dir.mkdir(parents=True, exist_ok=True)
config_src = project / "configs/v1/40k.json"
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
