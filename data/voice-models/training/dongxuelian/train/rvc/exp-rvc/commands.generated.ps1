# RVC training command template for common Retrieval-based-Voice-Conversion-WebUI layouts
# Adjust script names or parameters if your local fork differs
& "python" "infer/modules/train/preprocess.py" "D:\workspace\CodeBuddyWorkSpace\QQTalker\data\voice-models\training\dongxuelian\segments" 40000 2 "dongxuelian-exp-rvc" 0
& "python" "infer/modules/train/extract/extract_f0_rmvpe.py" 1 0 0 "dongxuelian-exp-rvc"
& "python" "infer/modules/train/extract_feature_print.py" cpu 1 0 0 "dongxuelian-exp-rvc" v2
& "python" "infer/modules/train/train.py" -e "dongxuelian-exp-rvc" -sr 40000 -f0 1 -bs 8 -te 200 -se 10 -v v2
& "python" "infer/modules/train/train_index.py" "dongxuelian-exp-rvc"

# After training, import artifacts into QQTalker:
# node scripts/voice-training/import-rvc-artifacts.mjs --character=dongxuelian --model=<model.pth> --index=<added.index>
