# QQTalker

QQTalker 是一个基于 OneBot 的 QQ 机器人项目，主打“可爱猫娘 + 群聊上下文 + 本机语音 + Dashboard 控制台 + 插件扩展”这条路线喵~ 🐾

它既可以只跑最小文本聊天，也可以继续接上 `voice-service`、`GPT-SoVITS`、Astrbot、自学习插件，逐步升级成一套更完整的本地机器人工作流。

## ✨ 你能用它做什么

- 💬 把 QQ 账号接入 OpenAI 兼容模型做群聊机器人
- 🧠 让机器人记住群里最近在聊什么，而不是每次都失忆
- 🎤 给回复接上自然语音播报，默认联调口径是 `GPT-SoVITS`
- 🎧 把群友发来的语音先转文字再参与对话
- 🖼️ 让机器人看图说话
- 🛰️ 把复杂任务转发给 Astrbot，做多机器人协作
- 📊 用 Dashboard 看运行状态、日志、自学习数据和配置
- 🧩 用插件扩展消息钩子、Prompt 注入、群命令和 Dashboard API

## 🧱 架构概览

```text
OneBot <-> QQTalker(Node.js) <-> AI API
                      |
                      +-> Dashboard (:3180)
                      +-> voice-service (:8765)
                              |
                              +-> GPT-SoVITS (:9880) / edge-tts
```

更详细的开发者架构说明见 [`docs/architecture.md`](docs/architecture.md)。

## 🧰 先准备哪些东西

| 组件 | 是否必需 | 用途 |
|------|----------|------|
| Node.js | 必需 | 运行 QQTalker 主程序与脚本 |
| OneBot 实现（如 NapCat） | 必需 | 接收 QQ 消息、发送回复 |
| OpenAI 兼容 API | 必需 | 提供 AI 对话能力 |
| Python 3.10 左右 | 可选 | 运行 `voice-service` |
| `voice-service` | 可选 | 给 QQTalker 提供统一 TTS HTTP 接口 |
| `GPT-SoVITS` | 可选 | 提供更自然的本机语音合成 |
| `ffmpeg` | 可选但推荐 | 语音处理、训练脚本、部分 STT 场景会用到 |
| Astrbot | 可选 | 做消息转发和复杂任务委托 |

## 🚀 小白推荐上手路线

如果你是第一次接这个项目，推荐按下面顺序来：

1. 先跑通“纯文本聊天”。
2. 确认 Dashboard 能打开。
3. 再接 `voice-service`。
4. 最后再接 `GPT-SoVITS`、Astrbot、训练脚本等进阶模块。

这样最不容易一上来就被多进程和外部依赖绊住喵~ 🌸

## 🪄 路线一：先跑最小可运行版（只聊天）

### 1. 安装主程序依赖

```bash
npm install
```

### 2. 复制配置模板

```bash
cp .env.example .env
```

Windows PowerShell 也可以用：

```powershell
Copy-Item .env.example .env
```

至少需要填写这些配置：

- `WS_URL`
- `AI_API_KEY`
- `AI_BASE_URL`
- `AI_MODEL`
- `BOT_QQ`

说明：

- `.env.example` 是推荐起始模板。
- 运行时最终回退默认值以 `src/types/config.ts` 为准。
- 示例里常见的 NapCat 地址是 `ws://127.0.0.1:3001`。
- 如果你完全不设置 `WS_URL`，代码会回退到 `ws://127.0.0.1:8080`。
- 所以请一定以你自己的 OneBot 实际监听地址为准，不要盲抄端口喵~ ⚠️

### 3. 启动 OneBot

以 NapCat 为例，你需要先确保：

- 已经成功登录要作为机器人的 QQ
- 已启用正向 WebSocket
- `WS_URL` 指向的地址确实能连通

### 4. 启动 QQTalker

```bash
npm run dev
```

如果要跑构建产物：

```bash
npm run build
npm start
```

启动后默认访问：

- Dashboard: [http://127.0.0.1:3180](http://127.0.0.1:3180)
- 日志分析页: [http://127.0.0.1:3180/analyzer](http://127.0.0.1:3180/analyzer)

到这里为止，你已经可以先验证纯文本聊天链路了喵~ ✅

## 🎤 路线二：继续接自然语音（推荐）

如果你想让 QQTalker 发出更自然的角色语音，建议接上：

- `voice-service`
- `GPT-SoVITS`

### 目录约定

当前仓库默认联调约定如下：

```text
CodeBuddyWorkSpace/
  QQTalker/
  GPT-SoVITS/
```

`start-voice-stack.ps1` 和 `npm run start:stack` 都默认你采用这个布局。

### 第一步：安装 `voice-service` 🐍

进入 `voice-service/`：

```bash
python -m venv .venv
.venv\Scripts\activate
pip install -r requirements.txt
```

手动启动：

```bash
uvicorn app:app --host 127.0.0.1 --port 8765
```

Windows 下也可以直接用：

```powershell
powershell -ExecutionPolicy Bypass -File start-local-service.ps1
```

安装好后，建议先检查：

- [http://127.0.0.1:8765/health](http://127.0.0.1:8765/health)

### 第二步：准备 `GPT-SoVITS` 🎙️

这一部分是基于当前仓库已经验证过的本机联调口径整理的，具体细节仍可能因你的显卡、CUDA、上游版本不同而需要微调。

推荐流程：

1. 把官方 `GPT-SoVITS` 放到和 `QQTalker` 同级的目录。
2. 在 `../GPT-SoVITS` 中准备 Python 3.10 虚拟环境。
3. 按上游项目安装依赖。
4. 启动其 API，并确认 `http://127.0.0.1:9880/docs` 可访问。
5. 在 `voice-service` 侧确保：

```text
VOICE_MODEL_DIR=../data/voice-models
VOICE_DEFAULT_BACKEND=gpt-sovits
VOICE_GPTSOVITS_UPSTREAM=http://127.0.0.1:9880/tts
```

仓库内已有的 Windows 联调备注：

- `jieba_fast` 构建失败时，可退回普通 `jieba`
- 首次运行可能缺少 `g2p_en`
- 若 `onnxruntime` 的 CUDA Provider 报错，但 `torch` 侧 CUDA 正常，主推理链仍可能可用

### 第三步：打开主程序里的 TTS 配置 🔊

在 `.env` 中至少确认这些项：

```env
TTS_ENABLED=true
TTS_SERVICE_URL=http://127.0.0.1:8765
TTS_BACKEND=gpt-sovits
TTS_MODEL=
TTS_MODEL_DIR=./data/voice-models
```

如果你希望机器人只在被 `@` 时附带语音，保留：

```env
TTS_REPLY_MODE=mention-only
```

如果你希望连被动插话也尽量带语音，可以改成：

```env
TTS_REPLY_MODE=all-replies
```

### 第四步：一键拉起整条语音链路 🚀

命令行方式：

```bash
npm run start:stack
```

或双击：

```bat
launch-qqtalker.bat
```

这两个入口会按顺序尝试启动：

- `GPT-SoVITS`
- `voice-service`
- `QQTalker`

注意：

- 它更像“本机联调启动器”，不是通用部署脚本
- 它默认使用固定目录布局
- 脚本会检测 `9880/docs`、`8765/health`、`3180/api/status`

### 第五步：语音相关的快速排障 🩺

如果“有文字但没语音”，优先检查：

- `TTS_ENABLED`
- `TTS_SERVICE_URL`
- `voice-service` 是否健康
- `VOICE_GPTSOVITS_UPSTREAM` 是否可达
- `TTS_MODEL` 是否命中有效模型

如果你还没装 `ffmpeg`，可以先试试：

```powershell
.\install-ffmpeg.ps1
```

更多语音链路说明见：

- [`voice-service/README.md`](voice-service/README.md)
- [`data/voice-models/README.md`](data/voice-models/README.md)
- [`data/voice-models/training/README.md`](data/voice-models/training/README.md)
- [`docs/voice-stack.md`](docs/voice-stack.md)

## 🛰️ Astrbot 联动（可选）

QQTalker 已经支持两类 Astrbot 集成能力：

- `/Astrbot` 显式转发
- 复杂任务自动委托

### 先说清边界

本仓库只负责 **QQTalker 侧接入 Astrbot**。

也就是说：

- 这里会教你怎么配置 `ASTRBOT_QQ`
- 会教你怎么让 QQTalker 把消息转发给 Astrbot
- 但 **Astrbot 本体的安装、部署、登录与版本差异** 不在本仓库可控范围内

因此最稳妥的做法是：

1. 先按 Astrbot 上游项目文档完成它自己的安装与登录。
2. 确保你已经有一个可以被当前 QQ 环境私聊到的 Astrbot QQ 号。
3. 再回到 QQTalker 侧做接入。

### QQTalker 侧怎么接 Astrbot

在 `.env` 中至少配置：

```env
ASTRBOT_QQ=123456789
```

如果你还想打开复杂任务委托，可以继续配置：

```env
ASTRBOT_ENABLED_COMPLEX_TASKS=true
ASTRBOT_COMPLEX_TASK_KEYWORDS=分析,总结,规划,排查,设计,方案,roadmap
ASTRBOT_COMPLEX_TASK_MIN_LENGTH=48
ASTRBOT_TIMEOUT_MS=45000
ASTRBOT_FALLBACK_TO_LOCAL=true
```

其他进阶项：

- `ASTRBOT_COMPLEX_TASK_GROUP_ALLOWLIST`
- `ASTRBOT_COMPLEX_TASK_GROUP_DENYLIST`
- `ASTRBOT_COMPLEX_TASK_GROUP_ROUTE_OVERRIDES`

### 群里怎么用

先 `@` 机器人，再输入：

- `/Astrbot`
  开启或关闭当前群的转发模式
- `/Astrbot 你好`
  直接把内容转发给 Astrbot

如果你已经开启复杂任务委托，QQTalker 也会根据关键词、长度和群配置自动判断要不要转发。

更多实现细节见：

- [`docs/core-flow.md`](docs/core-flow.md)
- [`docs/modules.md`](docs/modules.md)

## 🎛️ Dashboard 控制台

QQTalker 自带 Dashboard，可用来查看：

- 📈 运行状态与统计
- 📜 实时日志与日志分析
- 🧠 自学习数据
- 🔧 运行配置
- 💻 进程信息

默认地址：

- [http://127.0.0.1:3180](http://127.0.0.1:3180)
- [http://127.0.0.1:3180/analyzer](http://127.0.0.1:3180/analyzer)

## 💡 常用脚本

- `npm run dev`
- `npm run build`
- `npm start`
- `npm test`
- `npm run test:e2e`
- `npm run start:stack`
- `npm run start:launcher`
- `npm run voice:training:sync`
- `npm run voice:download`
- `npm run voice:clips:suggest`
- `npm run voice:clips`
- `npm run voice:transcribe`
- `npm run voice:manifest`
- `npm run voice:rvc:import`
- `npm run voice:eval`

## 💬 常见群内命令

以下命令都需要先 `@` 机器人：

- 基础聊天：`@Claw 你好`
- 模式切换：`私聊`、`个人模式`、`群聊`、`群模式`
- 清理会话：`清理`、`重置`
- 占卜：`抽签`、`塔罗`、`运势`、`占卜`
- Astrbot：`/Astrbot`、`/Astrbot <消息>`
- 自学习：`/learning_status`、`/start_learning`、`/stop_learning`、`/force_learning`、`/affection_status`、`/set_mood <情绪>`、`/scene_status`

## 🧩 插件与自学习

插件现在同时支持两条接入路线：

- 兼容旧方式：`PLUGIN_PATHS` 加载 CommonJS 模块
- 新平台方式：通过 Dashboard 的“插件中心”安装和管理 `local` / `npm` / `git` 来源插件

平台能力包括：

- 消息钩子
- Prompt 上下文注入
- 群命令处理
- Dashboard API 扩展
- 插件配置 Schema
- 插件启用 / 停用 / 卸载 / 更新
- 异构桥接入口（为 AstrBot 之类外部生态预留）

自学习默认使用 SQLite 文件型存储，可切换到 MySQL 或 PostgreSQL。更详细的接口和数据说明见 [`docs/data-and-plugin.md`](docs/data-and-plugin.md)。

## 📚 开发文档导航

- [`docs/README.md`](docs/README.md)
- [`docs/architecture.md`](docs/architecture.md)
- [`docs/setup-and-run.md`](docs/setup-and-run.md)
- [`docs/core-flow.md`](docs/core-flow.md)
- [`docs/modules.md`](docs/modules.md)
- [`docs/voice-stack.md`](docs/voice-stack.md)
- [`docs/data-and-plugin.md`](docs/data-and-plugin.md)

## 📎 其他项目文档

- [`voice-service/README.md`](voice-service/README.md)
- [`data/voice-models/README.md`](data/voice-models/README.md)
- [`data/voice-models/training/README.md`](data/voice-models/training/README.md)
- [`dashboard-assets/ARCHITECTURE.md`](dashboard-assets/ARCHITECTURE.md)

## 🧪 测试

```bash
npm test
npm run test:e2e
```

说明：

- `npm test` 主要验证 Node 侧逻辑
- `npm run test:e2e` 使用 Playwright + mock dashboard server，适合验证 Dashboard 关键交互，不等同于真实服务全链路联调

## License

GPL-3.0-only
