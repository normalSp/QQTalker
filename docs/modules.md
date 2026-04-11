# 模块与目录说明

## 顶层目录

### `src/`

Node.js 主服务源码，包含入口、服务层、消息处理器、插件和存储适配层。

### `dashboard-assets/`

Dashboard 前端静态资源。当前不是 React 或 Vue SPA，而是由 `DashboardService` 直接托管的原生静态资源集合。

### `voice-service/`

Python FastAPI 语音服务，对主服务暴露统一 HTTP 接口。

### `data/`

包含语音模型、自学习数据、插件中心数据、人格 JSON、训练工作区等运行资产。

### `scripts/voice-training/`

训练数据同步、切片、转写、manifest 和评测脚本。

### `tests/e2e/`

Dashboard 相关端到端测试和 mock server。

## `src/` 内的主要模块

### 入口与基础设施

- `src/index.ts`
  主装配入口，负责启动顺序、服务注入、插件初始化和优雅退出。
- `src/logger.ts`
  日志输出配置，运行日志会写入项目根目录的 `日志/`。
- `src/start-with-console.ts`
  在本机启动时打印控制台说明，并尝试打开 Dashboard。

### `src/services/`

- `onebot-client.ts`
  OneBot WebSocket 客户端、发送 API、重连和心跳逻辑。
- `codebuddy-client.ts`
  OpenAI 兼容聊天客户端和基础 system prompt。
- `session-manager.ts`
  群共享模式与个人模式上下文管理。
- `persona-service.ts`
  人格档案、群绑定、与自学习 overlay 合成；默认读写 `data/personas.json`。
- `dashboard-service.ts`
  Dashboard HTTP 服务、SSE、配置修改、日志读取、静态资源托管。
- `tts-service.ts`
  文字转语音逻辑和多后端策略。
- `stt-service.ts`
  语音识别链路。
- `vision-service.ts`
  图片理解链路。
- `astrbot-relay.ts`
  Astrbot 命令转发和复杂任务委托。
- `scheduler-service.ts`
  定时任务、AI 插聊、活跃群管理；可注入 `PersonaService`，使插话使用当前群解析出的人格名称与 system prompt。
- `welcome-service.ts`
  入群欢迎消息。
- `block-service.ts`
  用户和群级屏蔽逻辑。
- `divination-service.ts`
  抽签、塔罗、运势等本地占卜能力。

### `src/handlers/`

- `message-handler.ts`
  最重要的业务文件，串起 OneBot、会话、AI、媒体理解、插件、Astrbot 和发送限速。

### `src/plugins/`

- `plugin-manager.ts`
  插件注册、初始化、命令路由、Prompt 注入、Dashboard 路由聚合、适配器注册与桥接插件装载。
- `plugin-types.ts`
  插件上下文、命令返回值和 Dashboard 路由的接口定义。
- `plugin-fs.ts`
  `data/plugins` 下各子路径解析、JSON 读写；支持 `QQTALKER_PLUGIN_DATA_ROOT` 覆盖数据根。
- `plugin-registry.ts` / `plugin-installer.ts` / `plugin-config-service.ts`
  注册表持久化、安装管线、按插件 ID 的 JSON 配置读写。
- `plugin-adapters.ts` / `plugin-ui-registry.ts`
  异构包适配器注册表、Dashboard 侧插件 UI 元数据。
- `astrbot-bridge-adapter.ts`
  安装阶段识别 AstrBot 形态插件包并生成注册表项。
- `astrbot-bridge-support.ts`
  AstrBot 桥接共用的 manifest 构建与检测辅助。
- `astrbot-generic-bridge.ts` / `astrbot-meme-manager-bridge.ts`
  运行时装载的桥接插件：通用 AstrBot 包与 `meme_manager` 专用能力。
- `self-learning/`
  自学习插件、服务层、存储层、高级分析逻辑。
- `voice-broadcast/`
  语音播报相关插件。

### `src/storage/`

- `create-database-adapter.ts`
  根据配置返回 SQLite、MySQL 或 PostgreSQL 适配器。
- `sqljs-adapter.ts`
  默认 SQLite 文件型方案。
- `mysql-adapter.ts`
  MySQL 适配器。
- `postgres-adapter.ts`
  PostgreSQL 适配器。

### `src/types/`

- `config.ts`
  环境变量解析与默认值。
- `onebot.ts`
  OneBot 协议类型和消息工具函数。

## Dashboard 相关目录

### `dashboard-preview.html`

主 Dashboard 入口页面。

### `dashboard-assets/scripts/`

前端模块化后的脚本目录，架构约定见 `dashboard-assets/ARCHITECTURE.md`。

### `log-analyzer.html`

日志分析器入口页。

## 数据目录

### `data/voice-models/`

角色模型目录。可使用根级 `catalog.json` 或子目录 `voice-model.json` 描述模型。

### `data/voice-models/training/`

训练工作区，包含公开来源、切片、转写、训练版本和评测结果。

### `data/self-learning/`

自学习默认数据目录，默认 SQLite 文件也在这里。

### `data/plugins/`

插件中心管理的注册表、锁、各插件 `config/`、`packages/`、`runtime/` 等（根目录可被 `QQTALKER_PLUGIN_DATA_ROOT` 改写）。

### `data/personas.json`

人格数据默认文件（可由 `PersonaService` 构造参数覆盖路径）。

## 测试目录

### `tests/e2e/mock-dashboard-server.cjs`

为 Playwright 提供一个独立 mock Dashboard 后端，避免测试依赖真实服务。

### `tests/e2e/self-learning.e2e.spec.ts`

覆盖自学习中心的关键交互，例如切群、立即学习、人格审批。

## 修改建议

- 改启动链路，先看 `src/index.ts` 和 `src/types/config.ts`。
- 改消息处理，先看 `src/handlers/message-handler.ts`。
- 改 Dashboard，先看 `src/services/dashboard-service.ts` 和 `dashboard-assets/`。
- 改学习或插件，先看 `src/plugins/` 和 `src/storage/`。
- 改语音链路，先看 `voice-service/`、`src/services/tts-service.ts` 和 `data/voice-models/`。
