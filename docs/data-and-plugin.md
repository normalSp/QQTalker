# 数据、自学习与插件扩展

## 数据目录

QQTalker 有两类数据：

- 运行必需数据
  例如模型索引、自学习数据库、日志文件
- 开发与实验数据
  例如训练素材、评测结果、导出包、实验脚本产物

主要目录如下：

- `data/self-learning/`
- `data/voice-models/`
- `data/voice-models/training/`
- `data/plugins/`（插件中心；根路径可被环境变量覆盖，见下文）
- `data/personas.json`（人格档案与群绑定，默认路径；真源见 `PersonaService` 构造参数）
- `日志/`

## 人格数据

- 默认由 `src/services/persona-service.ts` 读写项目根下 `data/personas.json`（首启可自动创建默认人格）。
- Dashboard 配置页可维护档案与群绑定；与自学习联动时，审查通过的人格 overlay 会由 `SelfLearningService` 提供，再由 `PersonaService` 与基础 profile 合成 `ResolvedPersona`，供 `MessageHandler` 与 Astrbot 转发链路使用。
- 若文件损坏或不可写，会导致人格加载失败或无法保存；排障时优先检查 JSON 有效性与进程对 `data/` 的写权限。

## 自学习数据

### 默认存储位置

默认配置来自 `src/types/config.ts`：

- `SELF_LEARNING_DATA_DIR=./data/self-learning`
- `SELF_LEARNING_DB_FILE=./data/self-learning/self-learning.sqlite`
- `SELF_LEARNING_DB_TYPE=sqlite`

### 数据库适配层

`src/storage/create-database-adapter.ts` 会根据配置选择：

- `sqlite` -> `SqlJsAdapter`
- `mysql` -> `MySqlAdapter`
- `postgres` -> `PostgresAdapter`

默认 SQLite 方案通过 SQL.js 直接读写文件，适合本机运行和无需额外数据库服务的场景。

## 自学习插件的工作方式

入口是 `src/plugins/self-learning/self-learning-plugin.ts`。

它通过三种方式介入系统：

1. `onMessage`
   采集消息并更新实时信号。
2. `beforeChat`
   把情绪、好感度、场景、黑话、长期记忆等注入 Prompt。
3. `handleCommand`
   处理 `/learning_status`、`/force_learning` 等群内命令。

另外，它还向 Dashboard 暴露一组 `/api/self-learning/*` 路由。

## 自学习的几类产物

从 `SelfLearningService` 可见，它会维护多类结构化信号：

- 风格特征
- 群内黑话
- 社交关系
- 好感度
- 群情绪
- 用户目标
- 长期记忆
- 人格审查建议
- 高级分析摘要
- 聚类结果
- 场景分布
- 记忆图谱
- 学习运行记录

这也是 Dashboard 自学习中心里各面板的数据来源。

## 插件接口

插件契约定义在 `src/plugins/plugin-types.ts`。

当前插件模型分成三层：

- `PluginManifest`
  描述插件身份、版本、来源、权限、UI 入口和能力声明
- `PluginHostApi`
  提供稳定 SDK 边界，避免外部插件直接依赖内部服务类
- `QQTalkerPlugin`
  负责真正的运行时钩子与生命周期

一个插件可以实现这些能力：

- `initialize`
- `onLoad`
- `onEnable`
- `onDisable`
- `dispose`
- `onMessage`
- `beforeModelRequest`
- `afterModelResponse`
- `beforeChat`
- `handleCommand`
- `getDashboardRoutes`
- `getDashboardPages`
- `getConfigSchema`
- `onConfigChanged`

插件运行上下文会收到：

- `onebot`
- `aiClient`
- `sessions`
- `dashboard`
- `personas`
- `dataDir`
- `host`

其中 `host` 是新的稳定 SDK 入口，按能力拆成：

- `host.messaging`
- `host.storage`
- `host.config`
- `host.dashboard`
- `host.logger`

因此插件既能兼容当前进程内模式，也为未来子进程 / 桥接模式预留了边界。

## 插件加载方式

`PluginManager` 的加载方式分两类：

- 内置注册
  在 `src/index.ts` 中直接 `register(new SelfLearningPlugin())` 之类
- 外部插件
  通过 `PLUGIN_PATHS` 指向 CommonJS 模块，或通过插件中心注册到 `data/plugins/registry.json`

插件中心支持三种来源：

- `local`
- `npm`
- `git`

并把插件元数据、安装来源和运行状态持久化到：

- `data/plugins/registry.json`
- `data/plugins/lock.json`
- `data/plugins/config/<pluginId>.json`
- `data/plugins/packages/<pluginId>/`
- `data/plugins/runtime/<pluginId>/`

外部插件模块导出对象需至少包含 `id`；若目录中提供 `qqtalker.plugin.json` 或 `package.json#qqtalkerPlugin`，则会优先读取 Manifest。

## 插件数据根目录覆盖

- 默认插件数据根为项目下的 `data/plugins/`（由 `src/plugins/plugin-fs.ts` 解析）。
- 设置环境变量 **`QQTALKER_PLUGIN_DATA_ROOT`** 为绝对或相对路径时，注册表、锁文件、`config/`、`packages/`、`runtime/` 等均相对于该根目录创建，便于多实例并行或测试沙箱隔离。
- 未设置时行为与旧版一致；变更后需自行迁移原 `data/plugins` 下文件，或从新根重新安装插件。

## 插件配置

插件配置不再混写进根目录 `.env`。

- 核心系统配置仍走 `.env`
- 插件自身配置写入 `data/plugins/config/<pluginId>.json`

如果插件实现 `getConfigSchema()`，Dashboard 的插件中心会自动渲染配置表单。

对于复杂插件，Manifest 的 `ui.mode` 和 `ui.pages` 可声明额外页面入口。

## Dashboard 扩展

插件可通过 `getDashboardRoutes()` 返回路由数组，`DashboardService` 会在运行时动态读取。

这使得插件可以：

- 增加新的查询接口
- 增加管理操作接口
- 为前端页面提供独立数据源

此外，Dashboard 新增了“插件中心”页，提供：

- 插件安装
- 插件启停
- 插件更新 / 卸载
- Schema 配置编辑
- 插件日志与健康状态查看

如果插件只需要基础配置，不必再手改 `dashboard-assets/`；只有复杂自定义界面才需要额外前端页面。

## 异构插件桥接

用于接入非 QQTalker 原生插件生态（当前以 AstrBot 包为主），分三层理解：

1. **安装适配器 `AstrBotBridgeAdapter`**（`astrbot-bridge-adapter.ts`）  
   在 `PluginInstaller` 扫描阶段识别 AstrBot 形态目录（如含 `metadata.yaml` 等），生成注册表项与安装产物路径，使插件中心能统一安装、启停与配置。

2. **共享支持 `astrbot-bridge-support.ts`**  
   供适配器与运行时代码共用的 manifest 构建、能力检测等辅助逻辑，避免各桥接插件重复实现。

3. **运行时桥接插件**（由 `PluginManager` 在加载已安装条目时选择）  
   - `AstrBotMemeManagerBridgePlugin`：针对 `meme_manager` 等已深度对接的包。  
   - `AstrBotGenericBridgePlugin`：其他已识别的 AstrBot 包的通用桥接实现。

注意：

- 这类插件当前不会在 QQTalker Node 进程内直接执行 AstrBot 的 Python 逻辑；桥接侧主要提供统一入口、配置承载、Dashboard API 及与 QQTalker 消息/Prompt 链路的衔接能力。
- 后续可继续补 AstrBot 运行时代理和 WebUI 嵌入。

## 日志与排障数据

`DashboardService` 会从以下目录寻找最新日志文件：

- `日志/`
- `logs/`
- `log/`

项目当前实际使用的是根目录 `日志/`。日志不仅用于人工排障，也被 Dashboard 的日志分析器和聊天记录解析逻辑复用。

## 数据维护建议

- 不要把大型模型、训练素材和本机缓存当成普通源码处理。
- 变更自学习数据结构时，优先查看 `self-learning-store.ts`、`self-learning-service.ts` 和 Dashboard 对应接口。
- 若从 SQLite 切换到 MySQL 或 PostgreSQL，要同时检查连接串、初始化流程和备份方案。
- 增加插件接口时，要同步更新 `plugin-types.ts` 和 `PluginManager` 的调用点。
- 变更人格存储路径或字段时，同步检查 `PersonaService`、Dashboard 配置 API 与自学习审查流程。
