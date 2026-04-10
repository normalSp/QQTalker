# AstrBot 复杂任务委托工程化子方案

## 目标
- 保持 `QQTalker` 作为主入口、主角色系统、主语音链路和主控制台。
- 将 `AstrBot` 收敛为复杂任务协处理器，只在命中明确规则时参与处理。
- 第一阶段优先实现“规则可控、失败可回退、可观察”，不做黑盒智能分类。

## 范围
- `src/services/astrbot-relay.ts`
- `src/handlers/message-handler.ts`
- `src/types/config.ts`
- `src/services/dashboard-service.ts`
- `dashboard-preview.html`
- `tests/`

## MVP 能力
1. 显式 `/Astrbot` 委托继续保留。
2. 新增“复杂任务自动委托”规则引擎。
3. 自动委托只对 `@QQTalker` 的群消息生效，不影响普通被动插话。
4. `AstrBot` 失败或超时时，`QQTalker` 自动回退到本地处理。
5. 控制台可配置开关、关键词、最小文本长度、超时与本地回退。
6. 控制台可查看复杂任务委托状态摘要。

## 路由规则
1. 本地保留命令优先。
2. 显式 `/Astrbot` 优先于自动规则。
3. 命中复杂任务规则时委托 `AstrBot`。
4. 未命中规则时由 `QQTalker` 本地处理。

## 自动委托规则
- 必须同时满足：
  - `ASTRBOT_ENABLED_COMPLEX_TASKS=true`
  - 已配置 `ASTRBOT_QQ`
  - 当前消息是 `@QQTalker`
  - 不是本地保留命令
- 再满足任一命中条件：
  - 文本长度达到阈值
  - 命中复杂任务关键词
  - 命中多步骤结构词，例如“先...再...最后...”

## 失败回退
- `AstrBot` 转发失败时，当前消息继续走 `QQTalker` 原本的本地回复链路。
- 回退行为要结构化记录：原因、群号、用户、文本预览。
- 不允许因为 `AstrBot` 故障阻塞主回复。

## 观测指标
- 自动委托总次数
- 显式委托总次数
- 命中关键词次数
- 命中长度阈值次数
- 命中多步骤结构次数
- 本地回退次数
- 最近一次委托原因和时间

## 配置项
- `ASTRBOT_ENABLED_COMPLEX_TASKS`
- `ASTRBOT_COMPLEX_TASK_KEYWORDS`
- `ASTRBOT_COMPLEX_TASK_MIN_LENGTH`
- `ASTRBOT_TIMEOUT_MS`
- `ASTRBOT_FALLBACK_TO_LOCAL`

## 实现顺序
1. 在 `config` 中新增配置项和解析逻辑。
2. 在 `AstrbotRelayService` 中新增复杂任务判定与指标统计。
3. 在 `message-handler` 中接入“自动委托 -> 失败回退 -> 本地处理”主流程。
4. 在 `dashboard-service` 暴露只读配置和委托状态。
5. 在 `dashboard-preview.html` 增加配置输入和状态摘要展示。
6. 补测试，覆盖命中、跳过、回退三类主路径。

## 风险
- 关键词规则过宽会导致误委托，第一版必须保守。
- 回包路由仍然依赖现有私聊桥接，后续还需要继续稳固。
- 配置页当前仍以“保存到 .env 后重启生效”为主，本轮只先接入配置项和展示，不承诺热更新。
