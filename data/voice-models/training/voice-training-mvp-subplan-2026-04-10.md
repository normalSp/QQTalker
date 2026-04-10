# 语音训练中心 MVP 子方案

## 目标
- 把已有的离线训练工作区和脚本链路接入 QQTalker 控制台。
- 先完成“可见、可同步、可评估准备度”的 MVP。
- 暂不直接在浏览器里执行完整训练、下载、切片或转写重任务。

## MVP 范围
- 展示训练工作区根目录。
- 展示每个角色的：
  - 来源数
  - 版本数
  - 切片总数
  - 可用切片数
  - raw / cleaned / segments 文件数
  - summary / manifest / versions 是否就绪
- 展示现有训练脚本链路说明。
- 提供“同步训练摘要”按钮，调用 `sync-training-workspace.mjs`。

## 实现模块
- `src/plugins/voice-broadcast/voice-training-workspace.ts`
- `src/plugins/voice-broadcast/voice-broadcast-plugin.ts`
- `dashboard-preview.html`
- `tests/voice-training-workspace.spec.ts`

## 设计原则
- 训练中心先围绕工作区与元数据，不直接暴露高风险训练执行。
- 使用现有 `voice-broadcast` 插件承载语音训练 API，避免新建一套平行控制面。
- 输出必须面向“任务中断后可恢复”，所以要优先展示状态摘要和脚本入口说明。

## API
- `GET /api/voice-training/overview`
  - 返回训练根目录、角色摘要、脚本说明。
- `POST /api/voice-training/sync`
  - 调用 `sync-training-workspace.mjs`，刷新训练摘要。

## 后续阶段
1. 加入角色详情页：显示 `public-sources.json`、`training-manifest.json`、`versions.json` 关键字段。
2. 加入轻量动作：生成 manifest、执行 STT 草稿、运行 eval。
3. 加入本地素材路径导入与最近任务历史。
4. 再做真正的浏览器上传、任务队列和训练编排。
