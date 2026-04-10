# AstrBot 复杂任务委托开发日志

## 2026-04-10

### 任务启动
- 目标：把 `AstrBot` 收敛为复杂任务协处理器，不让 `QQTalker` 退化成 `AstrBot` 插件。
- 约束：保留 `/Astrbot` 显式委托；自动委托只做保守规则；失败必须回退本地处理。

### 调研结论
- `AstrBot` 当前实现集中在 `src/services/astrbot-relay.ts`，现状更接近“QQ 私聊转发桥”。
- `message-handler.ts` 已在 `@` 消息和转发模式里接入 `AstrBot`，但还没有“复杂任务自动委托”的独立判定层。
- `dashboard-service.ts` 与 `dashboard-preview.html` 已有配置管理与 `ASTRBOT_QQ` 输入，可复用现有配置页接入更多字段。

### 本轮工程化子方案
- 新增 `data/voice-models/training/astrbot-complex-task-subplan-2026-04-10.md`
- 定义了 MVP 范围、规则、失败回退、观测指标、配置项与实现顺序。

### 下一步
- 在 `config.ts` 中新增复杂任务委托配置项。
- 在 `AstrbotRelayService` 中新增复杂任务判定、委托原因与统计快照。
- 在 `message-handler.ts` 中接入自动委托与本地回退主流程。

### 已完成代码改动（第一轮）
- `src/types/config.ts`
  - 新增复杂任务委托相关配置：
    - `ASTRBOT_ENABLED_COMPLEX_TASKS`
    - `ASTRBOT_COMPLEX_TASK_KEYWORDS`
    - `ASTRBOT_COMPLEX_TASK_MIN_LENGTH`
    - `ASTRBOT_TIMEOUT_MS`
    - `ASTRBOT_FALLBACK_TO_LOCAL`
- `src/services/astrbot-relay.ts`
  - 新增复杂任务判定方法。
  - 新增委托运行时快照。
  - 新增待回包队列，修复“一次性委托没有明确回包目标”的基础问题。
  - 新增超时控制与本地回退所需结果结构。
- `src/handlers/message-handler.ts`
  - 在本地命令处理完成后、AI 主回复前，接入复杂任务自动委托尝试。
  - `AstrBot` 委托成功时直接返回等待处理；失败时继续本地处理。
- `src/services/dashboard-service.ts`
  - 暴露 `AstrBot` 运行时状态提供器，供控制台读取委托统计。
- `src/index.ts`
  - 将 `MessageHandler` 的 `AstrBot` 状态注入 `DashboardService`。
- `dashboard-preview.html`
  - 新增复杂任务委托开关、关键词、长度阈值、超时、回退配置项。
  - 新增复杂任务委托状态摘要展示。

### 当前实现口径
- 自动委托第一版只针对 `@QQTalker` 的消息。
- 本地模式命令、插件命令、占卜等仍优先本地处理，不会被 `AstrBot` 抢走。
- 判定逻辑仍然保守：关键词、结构词、长度阈值三类信号。

### 待验证
- TypeScript 编译是否通过。
- 新增控制台字段是否与 `/api/config` 正确双向绑定。
- 复杂任务委托失败后是否稳定回退到本地 AI 回复。

### 验证结果
- `npm run build` 通过。
- `npm test -- tests/astrbot-relay.spec.ts` 通过，新增 `4` 条复杂任务委托单测。
- `npm test` 全量通过，当前为 `26/26`。
- 最近改动文件 `ReadLints` 无报错。

### 当前可用能力
- 保留 `/Astrbot` 显式委托。
- 新增复杂任务自动委托，默认只作用于 `@QQTalker` 消息。
- 自动委托命中信号：
  - 复杂关键词
  - 多步骤结构词
  - 长文本阈值
- `AstrBot` 失败或超时时可自动回退到 `QQTalker` 本地处理。
- 控制台可配置复杂任务委托相关开关与阈值，并看到基础运行摘要。

### 当前边界
- 第一版仍是规则引擎，不是模型分类器。
- 回复路由已从“只看活跃转发群”升级为“优先走待回包队列”，但仍建立在私聊桥接假设上。
- 配置仍是写 `.env` 后重启生效，本轮没有做热更新。

### 建议的下一开发步
- 把复杂任务命中原因写入更细的 dashboard 日志和可筛选事件流。
- 增加群级 allowlist / denylist，控制哪些群允许自动委托复杂任务。
- 把显式委托、自动委托、转发模式三种来源在控制台拆开显示。

### 继续推进（群级控制）
- 已新增 `ASTRBOT_COMPLEX_TASK_GROUP_ALLOWLIST`
- 自动委托现在支持按群限制，不再默认对所有群全局放开
- 控制台已增加 allowlist 配置输入
- 单测已覆盖 `group-not-allowed` 路径

### 继续推进（可观测性增强）
- `AstrBot` 运行时快照已补充：
  - `decisionCounts`：统计命中/跳过/回退的原因计数
  - `recentEvents`：最近联动事件流，覆盖 delegated / skipped / fallback / forwarded
- 控制台新增“`AstrBot 联动详情`”面板：
  - 展示激活转发群
  - 展示最近匹配关键词
  - 展示决策计数
  - 展示最近事件流
- 这一步没有改变“QQTalker 主导、AstrBot 只处理复杂任务”的架构原则，主要是把联动过程从“能跑”推进到“能看懂”

### 本轮验证结果
- `npm test -- tests/voice-training-workspace.spec.ts tests/astrbot-relay.spec.ts` 通过
- `npm run build` 通过
- 最近改动文件 `ReadLints` 无报错

### 当前阶段更新
- `AstrBot 联动` 进入 `Phase 1.5 / 可观测性增强`
- 已完成：
  - 复杂任务自动委托
  - 失败回退本地处理
  - 群级 allowlist
  - 联动决策计数
  - 最近事件流展示
- 仍可继续推进：
  - denylist / 更细粒度路由控制
  - 可筛选事件流
  - 热更新配置与免重启生效

### 继续推进（细粒度路由控制）
- 已新增 `ASTRBOT_COMPLEX_TASK_GROUP_DENYLIST`
- 自动委托现在支持“denylist 优先于 allowlist”的显式收口策略：
  - 命中 denylist 的群不会自动委托
  - 即使同一个群同时出现在 allowlist 中，denylist 仍优先生效
- 运行时快照新增 `lastEvent`
  - 控制台无需翻最近事件列表，也能直接看到最近一次 delegated / skipped / fallback 的原因
- 控制台配置区已增加 denylist 输入框
- 控制台联动详情已增加“最近决策”摘要

### 本轮验证结果
- `npm test -- tests/astrbot-relay.spec.ts` 通过
- `npm run build` 通过
- 最近改动文件 `ReadLints` 无报错

### 当前阶段再更新
- `AstrBot 联动` 可视为进入 `Phase 1.8 / 路由收口增强`
- 已完成新增项：
  - 群级 denylist
  - denylist 优先级控制
  - 最近一次决策快照
- 下一步更值得推进：
  - 事件流筛选与分类查看
  - 更细粒度的群级路由策略
  - 配置热更新与免重启生效

### 继续推进（事件筛选与路由 override）
- 控制台已增加最近事件筛选器：
  - 按状态筛选
  - 按 route 筛选
  - 按 reason / preview 关键字筛选
- 已新增 `ASTRBOT_COMPLEX_TASK_GROUP_ROUTE_OVERRIDES`
  - 支持 `groupId:local-only`
  - 支持 `groupId:force-delegate`
- 当前群级路由优先级可表述为：
  - `route override`
  - `denylist`
  - `allowlist`
  - 通用复杂任务规则
- 这一步继续保持了“QQTalker 主导”的原则，因为 `local-only` 可以更明确地把指定群锁回本地主链路

### 本轮验证结果
- `npm test -- tests/astrbot-relay.spec.ts tests/voice-training-workspace.spec.ts` 通过
- `npm run build` 通过
- 最近改动文件 `ReadLints` 无报错

### 当前阶段再结论
- `AstrBot 联动` 可视为进入 `Phase 2 / 可筛选 + 可分路由`
- 已完成新增项：
  - 事件筛选
  - 群级 route override
  - `local-only / force-delegate` 策略
- 仍可继续推进：
  - 热更新配置与免重启生效
  - 事件流持久化和历史检索
  - 更细粒度的回复回包路由治理

### 继续推进（热更新与回包稳固）
- `AstrbotRelayService` 新增运行时配置对象与 `applyRuntimeConfig`
- `MessageHandler` 新增 `refreshAstrbotRuntimeConfig`
  - 保存控制台配置后重新读取 `.env`
  - 直接刷新：
    - `ASTRBOT_QQ`
    - `ASTRBOT_ENABLED_COMPLEX_TASKS`
    - `ASTRBOT_COMPLEX_TASK_KEYWORDS`
    - `ASTRBOT_COMPLEX_TASK_GROUP_ALLOWLIST`
    - `ASTRBOT_COMPLEX_TASK_GROUP_DENYLIST`
    - `ASTRBOT_COMPLEX_TASK_GROUP_ROUTE_OVERRIDES`
    - `ASTRBOT_COMPLEX_TASK_MIN_LENGTH`
    - `ASTRBOT_TIMEOUT_MS`
    - `ASTRBOT_FALLBACK_TO_LOCAL`
- `DashboardService` 新增配置更新回调
  - 控制台保存相关配置后可立即刷新 `AstrBot` 运行时策略
  - 不再停留在“写进 `.env` 但必须重启才能试”的状态
- 单测已新增运行时配置热更新路径，验证无需重建 relay service 即可切换委托策略

### 最新验证结果
- `npm run build` 通过
- `npm test` 全量通过，当前为 `43/43`
- 最近改动文件 `ReadLints` 无报错

### 当前阶段最终判断
- `AstrBot 联动` 可视为进入 `Phase 3 / 热更新可用`
- 对原方案中“热更新与回包路由进一步稳固”的收口目标，本轮已完成热更新主路径补齐
