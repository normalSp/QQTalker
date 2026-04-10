# 语音训练中心 MVP 开发日志

## 2026-04-10

### 启动背景
- 用户要求继续推进“语音训练与联动方案”，并明确询问语音训练部分当前进度。
- 当前仓库已有训练脚本和训练工作区，但前端没有训练中心入口。

### 目标
- 在控制台提供一个可用的语音训练中心 MVP。
- 第一版先解决“看得到、能同步、能知道准备度”，不直接把完整训练重任务搬进浏览器。

### 本轮设计
- 新增训练工作区服务，负责读取 `data/voice-models/training/` 的角色摘要。
- 通过 `voice-broadcast` 插件暴露训练中心 API。
- 在控制台 `语音链路` 区域新增“语音训练中心（MVP）”面板。

### 已完成
- 新增 `voice-training-mvp-subplan-2026-04-10.md`
- 新增 `src/plugins/voice-broadcast/voice-training-workspace.ts`
- 新增 `/api/voice-training/overview`
- 新增 `/api/voice-training/sync`
- 在控制台加入训练工作区状态、脚本链路、角色训练摘要展示

### 下一步
- 补充单测与构建验证
- 汇总本轮完成阶段
- 评估是否进入下一步：角色详情、manifest 生成入口、eval 入口

### 继续推进（第二轮）
- 新增 `tests/voice-training-workspace.spec.ts`
- 为训练中心增加了以下可见能力：
  - 训练工作区总览
  - 角色训练摘要卡片
  - 训练脚本链路说明
  - 一键同步训练摘要
- 训练中心 API 已挂到 `voice-broadcast` 插件：
  - `GET /api/voice-training/overview`
  - `POST /api/voice-training/sync`

### 验证结果
- `npm run build` 通过
- `npm test -- tests/voice-training-workspace.spec.ts tests/astrbot-relay.spec.ts` 通过
- `npm test` 全量通过，当前为 `29/29`
- 最近改动文件 `ReadLints` 无报错

### 当前阶段判断
- 语音训练部分已从“纯方案阶段”推进到 `Phase 1 / MVP 已启动并可用`
- 当前完成的是“训练准备态产品化”
- 尚未完成的部分：
  - 浏览器内上传音频
  - manifest / transcribe / eval 的一键任务化执行
  - 真正的训练任务编排与模型入库

### 推荐下一阶段
- 增加角色详情页，展开 `public-sources`、`versions`、`training-manifest`。
- 增加安全的轻任务入口：`manifest`、`transcribe`、`eval`。
- 再进入上传、任务队列和完整训练编排。

### 继续推进（第三轮）
- 新增角色详情能力：
  - `GET /api/voice-training/detail?character=<id>`
  - 控制台详情面板可查看 `public-sources / versions / manifest entries`
- 新增安全任务入口：
  - `POST /api/voice-training/run`
  - 当前支持 `sync / clips-suggest / transcribe / manifest / eval`
- 控制台训练角色卡已可直接触发：
  - 建议切片
  - 批量转写
  - 生成清单
  - 全局运行试听评测
- 训练工作区总览现已带最近任务记录。

### 第三轮验证结果
- `npm test -- tests/voice-training-workspace.spec.ts` 通过
- `npm run build` 通过
- `npm test` 全量通过，当前为 `30/30`
- 最近改动文件 `ReadLints` 无报错

### 当前阶段结论
- 语音训练部分当前处于 `Phase 2 / 训练中心 MVP 增强版`
- 已完成：
  - 训练工作区总览
  - 角色训练摘要
  - 角色详情查看
  - 训练脚本链路说明
  - 一键同步训练摘要
  - 安全轻任务入口
- 仍未完成：
  - 浏览器上传原始音频
  - 任务队列与后台执行状态流
  - 训练完成后的模型自动导入与 catalog 回写
  - 完整训练编排与发布闭环

### 继续推进（第四轮）
- 新增 `import-raw` 动作，支持把本地文件或目录路径导入到 `training/<character>/raw`
- 训练任务记录已持久化到 `data/voice-models/training/task-history.json`
- 控制台新增：
  - 导入角色输入
  - 本地素材路径输入
  - `导入到 raw` 按钮
  - 最近任务记录列表
- 角色详情现在可看到 `rawFiles`

### 第四轮验证结果
- `npm test -- tests/voice-training-workspace.spec.ts` 通过
- `npm run build` 通过
- `npm test` 全量通过，当前为 `31/31`
- 最近改动文件 `ReadLints` 无报错

### 最新阶段结论
- 语音训练部分当前处于 `Phase 2.5 / 训练中心增强版`
- 已完成：
  - 训练工作区总览
  - 角色训练摘要
  - 角色详情查看
  - 训练脚本链路说明
  - 轻任务执行入口
  - 本地素材路径导入到 `raw`
  - 最近任务历史持久化
- 仍未完成：
  - 浏览器直接上传大文件
  - 后台队列化执行与任务流状态推送
  - 训练结果自动导入模型目录
  - `catalog.json / voice-model.json` 自动回写
  - 完整训练编排与发布闭环

### 继续推进（第五轮）
- 训练中心已补上“浏览器上传素材”入口：
  - 后端新增 `upload-raw` 动作，支持通过浏览器直接把单个音频/视频文件写入 `training/<character>/raw`
  - 控制台新增“选择文件上传”按钮，前端使用 `FileReader` 读取后调用训练中心 API
- 上传任务会和已有 `import-raw` 一样进入最近任务记录，便于中断后回看
- 当前实现使用 JSON Base64 传输，先覆盖单文件、轻量素材的可用路径，便于后续再升级到更大的分片或直传方案

### 第五轮验证结果
- `npm test -- tests/voice-training-workspace.spec.ts tests/astrbot-relay.spec.ts` 通过
- `npm run build` 通过
- 最近改动文件 `ReadLints` 无报错

### 当前阶段更新
- 语音训练部分可视为进入 `Phase 3 起步 / 浏览器上传已打通`
- 新增完成项：
  - 浏览器单文件上传到 `raw`
  - 上传结果进入最近任务历史
- 仍未完成：
  - 浏览器大文件上传优化
  - 后台队列化执行与任务流状态推送
  - 训练结果自动导入模型目录
  - `catalog.json / voice-model.json` 自动回写
  - 完整训练编排与发布闭环

### 继续推进（第六轮）
- 训练中心已补上“任务队列与状态流”基础能力：
  - `clips-suggest / transcribe / manifest / eval` 改为后台队列执行
  - `sync / import-raw / upload-raw` 保持即时执行，避免轻任务体验变差
  - 训练工作区总览新增 `taskState`
  - 新增 `GET /api/voice-training/task-state`
- 控制台现已展示：
  - 当前运行中任务
  - 排队中的任务
  - 最近任务的 queued / started / finished 时间
  - 自动轮询刷新状态
- 这一步把训练中心从“能点按钮”推进到“能看到任务推进过程”

### 第六轮验证结果
- `npm test -- tests/astrbot-relay.spec.ts tests/voice-training-workspace.spec.ts` 通过
- `npm run build` 通过
- 最近改动文件 `ReadLints` 无报错

### 当前阶段再更新
- 语音训练部分可视为进入 `Phase 3.5 / 队列与状态流已接通`
- 已完成新增项：
  - 后台任务队列
  - 运行中 / 排队中状态展示
  - 前端轮询状态流
- 仍未完成：
  - 浏览器大文件上传优化
  - 浏览器内数据质检与转写修订
  - 训练结果自动导入模型目录
  - `catalog.json / voice-model.json` 自动回写
  - 完整训练编排与发布闭环

### 继续推进（第七轮）
- 训练中心已补上“训练结果入库模型目录”能力：
  - 新增 `publish-model` 动作
  - 从 `train/versions.json` 读取版本信息与产物路径
  - 将训练产物发布到 `data/voice-models/<character>/...`
- 当前已支持两类入库：
  - `gpt-sovits`：发布 `reference / aux-*` 并写回角色根目录 `voice-model.json`
  - `rvc-compat`：发布 `model / feature.index`，并写入对应目录 `voice-model.json`
- 发布时会同步：
  - 回写 `data/voice-models/catalog.json`
  - 回填 `train/versions.json` 中对应版本的 `publish` 元信息
  - RVC 版本继续写入 `imported-artifacts.json`
- 控制台角色详情中的训练版本列表现已支持直接点击“入库模型”

### 第七轮验证结果
- `npm test -- tests/voice-training-workspace.spec.ts` 通过
- `npm run build` 通过
- 最近改动文件 `ReadLints` 无报错

### 当前阶段最终更新
- 语音训练部分可视为进入 `Phase 4 / 入库链路已接通`
- 已完成新增项：
  - 训练结果自动入库模型目录
  - `voice-model.json` 自动回写
  - `catalog.json` 自动回写
  - 控制台一键入库入口
- 仍未完成：
  - 浏览器大文件上传优化
  - 浏览器内数据质检与转写修订
  - 发布/回滚与版本化训练闭环

### 继续推进（第八轮）
- 训练发布链路已补上“回滚与发布历史”：
  - 发布前会对目标模型目录做快照备份
  - 发布记录会写入 `train/publish-history.json`
  - 版本发布会记录 `releaseId / publishedAt / active`
- 控制台训练详情页现已展示：
  - 训练版本列表
  - 发布历史列表
  - “回滚到发布前”按钮
- 回滚时会恢复：
  - 目标模型目录快照
  - `catalog.json` 中对应模型条目
  - `versions.json` 中的 active 发布状态
- 这一步让训练中心从“能发布”推进到了“能回退”

### 第八轮验证结果
- `npm test -- tests/voice-training-workspace.spec.ts` 通过
- `npm run build` 通过
- 最近改动文件 `ReadLints` 无报错

### 当前阶段收口更新
- 语音训练部分可视为进入 `Phase 4.5 / 发布回滚闭环已接通`
- 已完成新增项：
  - 发布历史记录
  - 发布前快照备份
  - 一键回滚
  - active 版本状态维护
- 仍未完成：
  - 浏览器大文件上传优化
  - 浏览器内数据质检与转写修订
  - 更完整的发布治理（例如更细的版本策略与回滚策略）

### 继续推进（第九轮，最终收口）
- 训练中心已补上“浏览器内数据质检与转写修订”：
  - `VoiceTrainingWorkspaceService` 新增 `updateReviewEntry`
  - 控制台详情页可直接修改 `transcript / notes / reviewStatus / transcriptionStatus / usableForTrain`
  - 保存时会同步回写：
    - `manifests/training-manifest.json`
    - `manifests/transcripts.generated.json`
- 训练中心已补上“浏览器大文件上传优化”：
  - 新增 `POST /api/voice-training/upload-chunk`
  - 前端对大于 `8MB` 的文件自动走分片上传
  - 服务端按 `uploadId` 追加写入，最后一片到达后再落到 `training/<character>/raw`
  - 分片完成后同样写入最近任务历史，保证中断后可回看
- 这一步让训练中心从“能发布、能回滚”进一步推进到“能在浏览器里完成最后一段人工质检和大素材导入”

### 第九轮验证结果
- `npm run build` 通过
- `npm test` 全量通过，当前为 `43/43`
- 最近改动文件 `ReadLints` 无报错

### 当前阶段最终结论
- 语音训练部分可视为进入 `Phase 5 / 训练闭环已产品化`
- 已完成：
  - 浏览器单文件上传
  - 浏览器大文件分片上传
  - 浏览器内训练条目质检与转写修订
  - 后台任务队列与状态流
  - 训练结果入库、发布、回滚与版本状态维护
- 本轮后，原子方案里属于“语音训练中心 MVP -> 可日常使用”的核心缺口已全部补齐
