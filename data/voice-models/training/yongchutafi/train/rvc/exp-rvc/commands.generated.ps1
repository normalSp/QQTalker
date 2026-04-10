# RVC training command template for common Retrieval-based-Voice-Conversion-WebUI layouts
# Adjust script names or parameters if your local fork differs
& "D:\workspace\CodeBuddyWorkSpace\GPT-SoVITS\.venv\Scripts\python.exe" "infer/modules/train/preprocess.py" "D:\workspace\CodeBuddyWorkSpace\QQTalker\data\voice-models\training\yongchutafi\train\rvc\exp-rvc\input" 40000 2 "logs/yongchutafi-exp-rvc" False 3.7
& "D:\workspace\CodeBuddyWorkSpace\GPT-SoVITS\.venv\Scripts\python.exe" "infer/modules/train/extract/extract_f0_rmvpe.py" 1 0 0 "logs/yongchutafi-exp-rvc" False
& "D:\workspace\CodeBuddyWorkSpace\GPT-SoVITS\.venv\Scripts\python.exe" "infer/modules/train/extract_feature_print.py" cpu 1 0 0 "logs/yongchutafi-exp-rvc" v2 False
& "D:\workspace\CodeBuddyWorkSpace\GPT-SoVITS\.venv\Scripts\python.exe" "D:\workspace\CodeBuddyWorkSpace\QQTalker\data\voice-models\training\yongchutafi\train\rvc\exp-rvc\prepare_experiment.py"
$env:RVC_NUM_WORKERS='0'; $env:RVC_PREFETCH_FACTOR='2'; $env:PYTORCH_CUDA_ALLOC_CONF='max_split_size_mb:64'; & "D:\workspace\CodeBuddyWorkSpace\GPT-SoVITS\.venv\Scripts\python.exe" "infer/modules/train/train.py" -e "yongchutafi-exp-rvc" -sr 40k -f0 1 -bs 2 -te 160 -se 20 -v v2 -l 1 -c 0 -pg "assets/pretrained_v2/f0G40k.pth" -pd "assets/pretrained_v2/f0D40k.pth"
# This RVC version builds index via infer-web.py::train_index(...) instead of a standalone train_index.py
& "D:\workspace\CodeBuddyWorkSpace\GPT-SoVITS\.venv\Scripts\python.exe" -c "import importlib.util; spec=importlib.util.spec_from_file_location('infer_web', 'infer-web.py'); m=importlib.util.module_from_spec(spec); spec.loader.exec_module(m); [print(x) for x in m.train_index('yongchutafi-exp-rvc','v2')]"

# After training, import artifacts into QQTalker:
# node scripts/voice-training/import-rvc-artifacts.mjs --character=yongchutafi --model=<model.pth> --index=<added.index>
