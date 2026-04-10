# 角色语音训练工作区

这个目录用于管理 `冬雪莲`、`永雏塔菲` 等角色的公开原声整理、清洗、切片与训练版本。

推荐结构：

```text
data/voice-models/training/
  README.md
  dongxuelian/
    raw/
    cleaned/
    segments/
    manifests/
    train/
  yongchutafi/
    raw/
    cleaned/
    segments/
    manifests/
    train/
```

各层含义：

- `raw/`: 原始抓取音频或视频转音频结果，保留来源信息，不直接参与训练
- `cleaned/`: 去 BGM、去噪、统一采样率后的干净音频
- `segments/`: 最终切片结果，适合 GPT-SoVITS / RVC 训练
- `manifests/`: 数据清单、来源、标签、训练集划分
- `train/`: 训练脚本参数、版本记录、评测结果

建议记录的字段：

- `sourceUrl`
- `copyrightNote`
- `speakerState`
- `hasBgm`
- `noiseLevel`
- `emotion`
- `usableForRef`
- `usableForAux`
- `usableForTrain`
- `durationSec`
- `sampleRate`
- `notes`

角色优先级建议：

- `冬雪莲`: 优先补充清晰、稳定、少混响的普通叙述和日常聊天句
- `永雏塔菲`: 在维持当前稳定度的基础上补充更贴角色的高质量中短句

训练版本建议：

- 保留至少一个 `stable` 基线版本
- 保留一个 `experimental` 版本做 A/B 对比
- 每次训练记录训练集范围、模型参数、主观试听结论和失败样本

同步脚本：

- 运行 `npm run voice:training:sync`
- 脚本会检查双角色目录是否齐全，并根据 `manifests/public-sources.json` 与 `train/versions.json` 生成 `manifests/summary.md`
- 这样后续只需要补充公开来源和训练版本记录，就能保持训练工作区摘要同步更新

新增脚本：

- `npm run voice:download -- --character=dongxuelian`
- `npm run voice:clips:suggest -- --character=dongxuelian`
- `npm run voice:clips -- --character=dongxuelian`
- `npm run voice:transcribe -- --character=dongxuelian`
- `npm run voice:manifest -- --character=dongxuelian`
- `npm run voice:eval`
- `node scripts/voice-training/import-rvc-artifacts.mjs --character=dongxuelian --model=D:\path\model.pth --index=D:\path\added.index`
- `node scripts/voice-training/import-rvc-artifacts.mjs --character=yongchutafi --slot=v2 --model=D:\path\model.pth --index=D:\path\added.index`
- `npm run voice:eval -- --profile=tafi-rvc`

说明：

- `voice:download` 通过 `yt-dlp` 抓取 `public-sources.json` 里的公开视频，默认跳过 `space/live-room` 这种大范围入口，避免误下整站内容；需要时再显式加 `--allow-bulk`
- `voice:clips` 读取 `manifests/clips.json`，用 `ffmpeg` 批量切片到 `cleaned/` 或 `segments/`
- `voice:clips:suggest` 会先基于 `ffmpeg silencedetect` 从已下载素材里挑一批 5~9 秒的候选纯人声区间，直接写回 `manifests/clips.json`
- `voice:transcribe` 会调用当前配置好的 STT 接口，给 `segments.generated.json` 批量补录草稿 transcript，并输出 `transcripts.generated.json`
- `voice:manifest` 会把草稿 transcript 整理成正式的 `training-manifest.json/.md` 和训练用 `train/dataset.tsv`
- `voice:eval` 会把同一句文案分别送到 GPT-SoVITS / RVC Compatible，结果写到 `training/eval-results/<timestamp>/`
- `import-rvc-artifacts.mjs` 会把外部训练出的 `model.pth` / `index` 拷到 `data/voice-models/<character>/rvc/`；传 `--slot=v2` 时会导入到 `rvc/v2/`，并更新版本记录
- `voice:eval -- --profile=tafi-rvc` 会固定跑 `GPT / RVC v1 / RVC v2` 三路对比，并额外生成 `summary.json` 与 `subjective-scorecard.template.md`

当前项目口径：

- `GPT-SoVITS` 已作为当前默认上线语音链路
- `RVC` 训练与评测脚本保留在本目录，作为历史实验资产，不再属于当前上线范围

RVC 接入现状：

- 仅导入 `model.pth` 还不够，前端里的 `RVC Compatible` 是否可用还取决于 `voice-service` 是否配置了 `VOICE_RVC_UPSTREAM`
- 当前仓库已经有 RVC 条目和 A/B 评测入口，但如果没有本机 RVC 兼容 HTTP 推理服务，前端会显示“待接入”
