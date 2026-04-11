# 本地开发与运行

## 运行前提

至少需要准备以下环境：

- Node.js，用于主服务和训练脚本
- Python 3.10 左右环境，用于 `voice-service`
- 一个 OneBot 实现，例如 NapCat
- 可选的 `GPT-SoVITS` 本机服务
- 可选的 `ffmpeg`，用于语音相关处理和训练脚本

如果只验证文本聊天链路，可以不启动 `voice-service` 和 `GPT-SoVITS`。

## 配置来源

配置相关文件有三个层次：

1. `.env.example`
   用于提供一个可复制的起始模板。
2. `.env`
   本地运行时实际读取的覆盖配置。
3. `src/types/config.ts`
   代码中的最终回退默认值和解析逻辑。

文档编写和排障时，应优先相信 `src/types/config.ts`。

## 最小可运行配置

至少要确认以下项目：

- `WS_URL`
- `AI_API_KEY`
- `AI_BASE_URL`
- `AI_MODEL`
- `BOT_QQ`

常见可选项：

- 文本聊天：`AT_TRIGGER`、`GROUP_WHITELIST`、`MAX_HISTORY`
- 语音回复：`TTS_ENABLED`、`TTS_SERVICE_URL`、`TTS_BACKEND`、`TTS_MODEL`
- 语音识别：`STT_ENABLED`、`STT_API_KEY`、`STT_BASE_URL`、`STT_MODEL`
- Astrbot：`ASTRBOT_QQ` 以及复杂任务相关配置
- 自学习：`SELF_LEARNING_*`

## 安装步骤

### 主服务

```bash
npm install
```

### 语音服务

在 `voice-service/` 目录中：

```bash
python -m venv .venv
.venv\Scripts\activate
pip install -r requirements.txt
```

## 启动方式

### 方式一：分别启动，适合开发调试

1. 启动 OneBot 实现并确认 `WS_URL` 可连通。
2. 如需自然语音，启动 `GPT-SoVITS`。
3. 启动 `voice-service`。
4. 在项目根目录执行：

```bash
npm run dev
```

### 方式二：一键拉起，适合本机联调

```bash
npm run start:stack
```

或双击：

```bat
launch-qqtalker.bat
```

它们会按顺序尝试拉起：

- 同级目录下的 `GPT-SoVITS`
- `voice-service`
- `QQTalker`

### 方式三：构建后运行

```bash
npm run build
npm start
```

## 常用脚本

### 主服务

- `npm run dev`: 使用 `ts-node` 直接运行 `src/index.ts`
- `npm run build`: 编译到 `dist/`
- `npm start`: 运行 `dist/index.js`
- `npm test`: 运行 Vitest
- `npm run test:e2e`: 运行 Dashboard Playwright 测试

### 打包

- `npm run pkg`
- `npm run pkg:win`
- `npm run pkg:linux`

### 训练与语音工作区

- `npm run voice:training:sync`
- `npm run voice:download`
- `npm run voice:clips:suggest`
- `npm run voice:clips`
- `npm run voice:transcribe`
- `npm run voice:manifest`
- `npm run voice:rvc:import`
- `npm run voice:eval`

## 启动后可访问的地址

- Dashboard: `http://127.0.0.1:3180`
- `voice-service` 健康检查: `http://127.0.0.1:8765/health`
- `GPT-SoVITS` 文档页通常是: `http://127.0.0.1:9880/docs`

## 测试与验证

### 单元与集成测试

`npm test` 使用 Vitest，适合验证主服务逻辑。

### Dashboard E2E

`npm run test:e2e` 使用 Playwright，并通过 `tests/e2e/mock-dashboard-server.cjs` 启动一个 mock server，而不是依赖真实的 OneBot 或真实 Dashboard 后端。

这意味着：

- 前端交互回归可以较快验证
- 但它不能证明真实 OneBot、TTS、STT、Dashboard API 全链路完全正常

## 常见排障入口

### OneBot 连不上

- 检查 `WS_URL`
- 检查 OneBot 是否开启正向 WebSocket
- 注意 `OneBotClient` 会尝试多个路径后缀，但基础地址仍要正确

### Dashboard 打不开

- 确认 `3180` 端口没有冲突
- 查看项目根目录 `日志/` 中的最新日志文件
- 检查 `src/start-with-console.ts` 是否已在本机自动打开浏览器

### 有文字但没语音

- 检查 `TTS_ENABLED`
- 检查 `TTS_SERVICE_URL`
- 检查 `voice-service` 是否健康
- 检查 `voice-service` 上游 `VOICE_GPTSOVITS_UPSTREAM` 是否可达

### 语音识别不工作

- 检查 `STT_ENABLED`
- 检查 `STT_API_KEY`
- 检查 OneBot 是否能提供语音文件
- 检查本机是否具备必要的解码工具

### 自学习没有效果

- 检查 `SELF_LEARNING_ENABLED`
- 检查 `SELF_LEARNING_MIN_MESSAGES`、`SELF_LEARNING_INTERVAL_HOURS`
- 检查 `data/self-learning/` 是否可写

## 建议的开发流程

1. 先用最小文本链路跑通 `OneBot -> QQTalker -> AI`。
2. 再单独验证 Dashboard 页面和 API。
3. 然后接入 `voice-service`，确认 `/health` 和 `/models` 正常。
4. 最后再验证 `GPT-SoVITS`、训练脚本或 RVC 兼容链路。
