# QQTalker 开发文档

这组文档面向维护者、二次开发者和排障人员，重点解释项目如何启动、模块如何协作、数据写到哪里，以及哪些目录属于代码、配置、运行资产或实验材料。

## 阅读顺序

1. 先看 `architecture.md`，建立整体组件认知。
2. 再看 `setup-and-run.md`，了解本地开发、启动链路和常用脚本。
3. 然后看 `core-flow.md`，理解消息、人格与 Prompt 组装、AI、TTS/STT、Astrbot、Dashboard 的处理流程。
4. 需要改代码时，配合 `modules.md`、`data-and-plugin.md`、`voice-stack.md` 按模块下钻。

## 文档索引

- `architecture.md`: 系统架构、进程边界、组件关系、外部依赖。
- `setup-and-run.md`: 环境准备、配置来源、启动方式、测试和排障。
- `core-flow.md`: 典型消息链路、上下文、插件、自学习和转发流程。
- `modules.md`: 顶层目录说明和关键文件职责。
- `voice-stack.md`: `voice-service`、`GPT-SoVITS`、模型目录和训练脚本。
- `data-and-plugin.md`: 自学习数据、人格与插件数据目录、数据库适配层、插件接口和 AstrBot 桥接分层。

## 约定与真源

- 配置真源是 `src/types/config.ts`。
- 人格默认存储路径以 `src/services/persona-service.ts` 中 `PersonaService` 构造参数为准（当前默认为 `data/personas.json`），未纳入 `config.ts` 的字段仍以实现代码为准。
- 启动方式以 `package.json`、`start-voice-stack.ps1`、`launch-qqtalker.bat` 为准。
- 语音相关补充材料分散在 `voice-service/README.md`、`data/voice-models/README.md`、`data/voice-models/training/README.md`。
- Dashboard 前端结构说明见 `dashboard-assets/ARCHITECTURE.md`。

## 项目边界

- `src/` 是 Node.js 主程序，负责 OneBot、AI、会话、Dashboard、插件编排。
- `voice-service/` 是独立的 Python FastAPI 服务，负责本机语音模型和上游 TTS 转发。
- `data/voice-models/`、`data/self-learning/`、`data/plugins/`、`data/personas.json` 等既包含代码依赖的数据目录，也包含训练与运行产物（插件与人格路径规则见 `data-and-plugin.md`）。
- `日志/` 是运行日志目录，供 Dashboard 日志分析器和人工排障使用。

## 推荐维护方式

- 新增功能时，优先在对应章节补齐开发文档，而不是只改 `README.md`。
- 涉及环境变量、端口、脚本名、目录路径的改动，应同时核对 `README.md` 与本目录文档。
- 涉及运行链路的改动，至少同步更新 `architecture.md` 或 `core-flow.md` 中的对应小节。
