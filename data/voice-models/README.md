# 语音模型目录

将你的角色模型清单保存为 `catalog.json`，或在各子目录中放置 `voice-model.json`。

- 示例清单见 `catalog.example.json`
- 预设角色已在前端内置展示：冬雪莲、永雏塔菲等
- 模型文件不随仓库分发，请自行放入此目录
- 当前仓库已提供可直接联调的 `reference.wav` 示例目录结构

推荐目录结构：

```text
data/voice-models/
  catalog.json
  training/
    README.md
  dongxuelian/
    source.m4a
    model.ckpt
    reference.wav
    aux-1.wav
    aux-2.wav
    aux-3.wav
    rvc/
      model.pth
      index.faiss
    dataset-manifest.md
    voice-model.json
  yongchutafi/
    source.m4a
    model.ckpt
    reference.wav
    aux-1.wav
    aux-2.wav
    aux-3.wav
    rvc/
      model.pth
      index.faiss
    dataset-manifest.md
    voice-model.json
```

## 参考音频要求

对于 `GPT-SoVITS`：

- `reference.wav` 建议为单人干声
- 时长必须控制在 `3~10 秒`
- 当前仓库统一整理为 `32000 Hz`、单声道、约 `8 秒`
- `auxPaths` 可额外挂 2~3 段同角色、同说话状态的干净短句，通常能明显改善稳定性与音色还原
- 冬雪莲这类可懂度波动较大的角色，建议优先只挂 1 段最稳定的 `aux`，而不是盲目多挂
- 推荐同时填写 `promptText` 和 `promptLang`

## 扩展字段说明

- `recommendedBackend`: 前端默认推荐的后端
- `alternateBackends`: 可用于试听对比的备用后端列表
- `qualityTier`: `stable` / `experimental` / `fallback`
- `trainingStatus`: 当前训练阶段，例如 `reference-ready`、`dataset-planned`
- `previewHint`: 前端提示用户如何更稳地试听这个角色
- `backendOverrides`: 后端专属参数覆盖。当前已支持 `preferredAuxCount`、`recommendedTextMinLength`、`promptText`、`topP`、`temperature`、`repetitionPenalty`、`fragmentInterval`

## RVC Compatible 约定

- 建议把 RVC 实验产物放到角色目录下的 `rvc/`
- 推荐在 `catalog.json` 中单独建一个 `rvc-compat` 条目，而不是复用同一个 `id`
- 例如：`preset-dongxuelian-rvc`、`preset-yongchutafi-rvc`

## 训练素材工作区

- 训练素材和公开原声整理流程说明放在 `data/voice-models/training/README.md`
- 每个角色目录建议维护自己的 `dataset-manifest.md`，记录来源、切片质量和训练版本

当前已整理完成：

- `dongxuelian/reference.wav`
- `dongxuelian/aux-1.wav`
- `dongxuelian/aux-2.wav`
- `dongxuelian/aux-3.wav`
- `yongchutafi/reference.wav`
- `yongchutafi/aux-1.wav`
- `yongchutafi/aux-2.wav`
- `yongchutafi/aux-3.wav`

如果你要重新替换参考音频，建议保留原始抓取文件到 `source.*`，再重新导出 `reference.wav`，这样方便后续调整裁切位置。
