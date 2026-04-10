# 语音训练迭代报告（2026-04-09）

## 本轮完成

- 已补齐 `voice:transcribe` 与 `voice:manifest` 流程，支持从已切片音频批量生成草稿转写，并整理成正式训练清单。
- 已将人工修订结果回写到 `dongxuelian/manifests/clips.json` 与 `yongchutafi/manifests/clips.json`，使 `clips.json` 成为当前训练数据的权威来源。
- 已重新为永雏塔菲生成并导出 8 段候选，完成 STT 草稿转写与人工筛选。
- 已修复训练脚本侧两个遗漏：
  - `suggest-training-clips.mjs` 现在会保留已有 `transcript`、`reviewStatus`、`usableForTrain`，避免重跑建议时冲掉人工标注。
  - `build-training-manifest.mjs` 现在优先读取 `clips.json` 的人工字段，不再依赖脚本内硬编码规则。
- 已为 `download-public-sources.mjs` 增加参数日志，便于确认下载是否按指定角色/来源执行。
- 已重新同步训练工作区摘要：`npm run voice:training:sync`。

## 当前数据状态

### 冬雪莲

- 当前候选共 3 段。
- 当前可训练候选 3 段。
- 其中 1 段为 `pending-review`，2 段为 `needs-manual-review`。
- 主要问题已从“无 transcript”收敛为“尾词/句末需人工回听确认”。

### 永雏塔菲

- 当前候选共 8 段。
- 当前可训练候选 3 段。
- 本轮新增可训练候选：
  - `yongchutafi-dub-auto-05`
  - `yongchutafi-dub-auto-06`
- 明确排除的坏片段主要问题：
  - 混入日语尾音或拟声
  - 句尾被截断
  - 笑声/角色演出噪声过重

## 计划与待办回溯

- 原始语音播报插件计划里的核心项均已落地完成，包括：
  - 语音 provider / 本地 `voice-service`
  - Dashboard 可视化后端与模型切换
  - GPT-SoVITS 主链路
  - RVC Compatible 本地包装服务
  - 训练下载 / 切片 / 导入 / 评测脚本
- 本轮新增回溯后补齐的遗漏点：
  - 防止建议脚本覆盖人工标注
  - 正式清单改为读取人工标注源
  - 下载脚本增加参数可观测性
- 当前没有未完成的旧 todo 残留在本轮范围内。

## 当前残余风险

- 永雏塔菲当前可训练样本仍偏少，且 3 段里有 1 段仅为 `needs-manual-review`，正式训练前仍建议人工回听。
- 冬雪莲第 2、3 段存在尾词不完全可信的问题，若直接入 GPT-SoVITS 文本标注，可能带入轻微错误对齐。
- `summary.md` 仍偏来源级摘要，不直接反映“当前已筛出多少可训练片段”；更适合当工作区总览，不适合当训练集状态面板。
- RVC 链路已通，但仍缺真实 `model.pth` / `index` 训练产物，A/B 试听闭环还差最终模型导入。

## 下一轮建议

1. 继续补永雏塔菲 `dub` / `live-chat` 类纯中文短句，把可训练候选从 3 段扩到至少 8~12 段。
2. 对冬雪莲与永雏塔菲当前保留段逐条人工回听，产出最终版 transcript，避免训练文本与音频轻微错位。
3. 为 `training-manifest` 增加一个聚合视图，直接统计 `usableForTrain`、`needs-manual-review`、`needs-recut` 数量。
4. 在拿到首版 RVC 训练产物后，立即执行 `voice:rvc:import` + `voice:eval`，形成 GPT-SoVITS / RVC 的主观 A/B 报告。
