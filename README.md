# QQTalker - QQ聊天机器人

将你的QQ号变成一只可爱的**猫娘AI机器人（Claw）**，支持群聊共享上下文、语音回复、语音识别、图片识别、占卜，以及可插拔的**自学习插件系统**。

## 功能特点

- **💬 群聊模式（默认）**: 全群共享对话上下文，Claw 记住每个人说了什么，可 @指定人回复
- **👤 私聊模式**: 可切换为每人独立对话
- **🔄 AI智能回复**: 接入 DeepSeek/OpenAI 等 OpenAI 兼容 API
- **🎧 语音回复 (TTS)**: 默认使用 `GPT-SoVITS` 自然语音播报，`edge-tts` 作为保底回退
- **🎧 语音识别 (STT)**: 支持将群友的语音消息转成文字再回复（SiliconFlow SenseVoice / OpenAI Whisper）
- **🖼️ 图片识别 (Vision)**: AI 描述图片内容，支持 @图片 时自动触发（需要支持 vision 的模型）
- **🔮 占卜功能**: 观音灵签、塔罗牌、今日运势、随机占卜、民俗黄历
- **👋 入群欢迎**: 新成员入群时自动发送个性化欢迎语
- **📡 Astrbot 转发**: 可将消息转发给其他 AI 机器人（如 Astrbot），实现多 AI 协作
- **🧩 插件运行时**: 支持内置插件和外部插件接入，开放消息钩子、Prompt 注入、命令与 Dashboard API 扩展
- **🧠 自学习插件**: 学习对话风格、群组黑话、22 类社交关系、好感度、情绪、38 类目标场景和长期记忆
- **📈 高级学习分析**: 轻量话题聚类、场景分布、记忆图谱摘要、批量学习运行记录
- **📝 人格审查流**: 自动生成建议人格片段，支持在控制台审批后注入回复上下文
- **📊 Dashboard 控制台**: 内置 Web 控制台，实时查看运行状态和统计
- **@触发**: 群内 @机器人 即可触发回复
- **被动插聊**: 机器人会偶尔主动参与群聊（15%概率，带上下文理解）
- **定时问候**: 每日早安/午安/晚安/运势广播
- **自动重连**: 断线指数退避重连机制
- **频率控制**: 自适应发送限速，避免 QQ 风控

## 架构

```
┌────────────────┬─── WebSocket ───┬────────────┬─ HTTP API ─┬────────────┐
│  QQ消息/事件   │ ──────────────→ │ QQTalker   │ ─────────→ │  AI API    │
│ (OneBot)       │ ←────────────── │            │ ←───────── │           │
└────────────────┴────────  消息转发  └────────────┴── AI响应 ──┴────────────┘
                              +
                    ┌──────────┬ Dashboard ┬────┬ STT/Vision ┐
                    │ :3180     │ TTS/Divine│
                    └──────────┴── Web UI ─┴ Services   ┘
```

## 🖥️ Dashboard 控制台

QQTalker 内置了强大的 Web 控制台，提供实时监控和管理功能。

### 访问控制台

启动 QQTalker 后，在浏览器中访问：
```
http://localhost:3180
```

### 控制台功能

- **📊 仪表盘**：实时显示运行状态、消息统计、系统资源
- **📜 活动日志**：查看实时日志流，支持搜索和筛选
- **📈 数据分析**：图表展示消息趋势、AI调用统计等
- **🧠 自学习中心**：可视化管理风格、黑话、关系图谱、记忆、场景分布、聚类结果与人格审查
- **🧰 学习数据治理**：支持导出/导入学习数据、清理单群记录、重建分析快照、调整自动学习策略
- **🔧 配置管理**：在线修改配置，支持热重载
- **💻 进程信息**：查看系统资源占用和运行状态
- **📊 智能日志分析器**：访问 `http://localhost:3180/analyzer` 查看专业日志分析

### 智能日志分析器功能

- **📈 增强的日志信息展示**：日志摘要面板、服务标签系统、双行布局
- **🔍 强大的搜索和筛选**：实时搜索、级别筛选、服务筛选、组合筛选
- **📥 完整的日志操作工具**：导出功能、回到顶部、清空日志
- **🎨 优化的界面体验**：粒子动画背景、交互式图表、响应式设计、流畅动画
- **📊 数据可视化增强**：8个统计指标、趋势指示、交互式图表（饼图、柱状图、折线图等）

### 控制台启动说明

如果遇到控制台乱码或闪退问题：

**使用 PowerShell 脚本（推荐）**：
```powershell
# 右键点击 start-with-console-ps1.ps1
# 选择"使用 PowerShell 运行"
```

**使用修复后的批处理**：
```bash
start-with-console-fixed.bat
```

---

## 🚀 群内命令大全

所有命令都需要 **@机器人** 才能触发。

### 基础聊天

| 命令 | 说明 | 示例 |
|------|------|------|
| `@Claw <消息>` | 聊天/提问 | `@Claw 你好` |
| `@Claw <消息>` | 在群聊模式下多人同时聊，Claw 会记住每个人的发言并综合回复 | `@Claw 大家觉得这个方案怎么样？` |
| `@Claw [图片]` | 发送图片让 AI 描述（需 vision 模型） | `@Claw [图片] 这是什么？` |

> **默认行为**: 全群共享上下文，每条消息以 `[昵称]: 内容` 格式发送给 AI。Claw 可以记住 A 之前说的话，并在回复 B 时引用。

### 模式切换

| 命令 | 说明 |
|------|------|
| `@Claw 私聊` 或 `个人模式` | 切换到 **私聊模式**：每人独立对话，互不干扰 |
| `@Claw 群聊` 或 `群模式` | 切换回 **群聊模式（默认）**：全群共享上下文 |
| `@Claw 清理` 或 `重置` | 清空当前会话历史，重新开始 |

### 占卜功能

| 命令 | 说明 |
|------|------|
| `@Claw 抽签` | **观音灵签** - 100签随机抽取，附解签 |
| `@Claw 塔罗` | **塔罗牌** - 从22张大阿卡纳中抽一张解读 |
| `@Claw 运势` | **今日运势** - 爱情/事业/财运/综合四个维度 |
| `@Claw 占卜` | **随机占卜** - 混合多种术数的神秘结果 |

> 占卜结果由本地算法生成，不消耗 AI 额度。

### Astrbot 转发（可选）

| 命令 | 说明 |
|------|------|
| `@Claw /Astrbot` | 开启/关闭该群的 Astrbot 转发模式 |
| `@Claw /Astrbot <消息>` | 直接转发消息给 Astrbot |

### 其他

| 操作 | 说明 |
|------|------|
| 直接发文字 | 默认需要 @机器人才响应（但 15% 概率会主动插话） |
| 发送图片 | 如果模型支持 vision，AI 会描述图片内容 |
| 发送语音 | 自动 STT 识别为文字后处理（需开启 STT） |
| 新人入群 | 自动发送欢迎语 |

### 自学习命令

| 命令 | 说明 |
|------|------|
| `@Claw /learning_status` | 查看自学习统计与运行状态 |
| `@Claw /start_learning` | 开启自动学习 |
| `@Claw /stop_learning` | 暂停自动学习 |
| `@Claw /force_learning` | 立即执行一次学习并生成人格审查建议 |
| `@Claw /affection_status` | 查看当前群好感度排行 |
| `@Claw /set_mood <情绪>` | 手动设置当前群情绪 |
| `@Claw /scene_status` | 查看当前群主要对话场景分布 |

---

## 安装配置

### 1. 克隆并安装依赖

```bash
cd QQTalker
npm install
```

### 2. 配置环境变量

```bash
cp .env.example .env
```

编辑 `.env` 文件：

```env
# ===== OneBot 配置 =====
WS_URL=ws://127.0.0.1:3001

# ===== AI 配置（OpenAI兼容接口）=====
AI_API_KEY=sk-xxxxx
AI_BASE_URL=https://api.deepseek.com/v1
AI_MODEL=deepseek-chat

# ===== 机器人身份 =====
BOT_QQ=1802647053
BOT_NICKNAME=深蓝战空        # 用于识别文本格式@

# ===== TTS 语音回复 =====
TTS_ENABLED=true
TTS_PROVIDER=local-http
TTS_SERVICE_URL=http://127.0.0.1:8765
TTS_BACKEND=gpt-sovits
TTS_MODEL=preset-dongxuelian
TTS_MODEL_DIR=./data/voice-models
TTS_VOICE=zh-CN-XiaoyiNeural
TTS_SPEED=4
TTS_STYLE=natural
TTS_FALLBACK_TO_BAIDU=true
TTS_RUNTIME_POLICY=model-default
TTS_FALLBACK_CHAIN=edge-tts,legacy-baidu
TTS_LONG_TEXT_PREFERRED_BACKEND=gpt-sovits
TTS_LONG_TEXT_THRESHOLD=72
TTS_RVC_SHORT_TEXT_MAX_LENGTH=28
TTS_EXPERIMENTAL_RVC_ENABLED=false
TTS_DEFAULT_CHARACTER=永雏塔菲
TTS_CHARACTER_MODEL_MAP=永雏塔菲:preset-yongchutafi,冬雪莲:preset-dongxuelian
TTS_GROUP_VOICE_ROLE_MAP=123456:永雏塔菲

# ===== 功能开关 =====
AT_TRIGGER=true              # 只响应@消息

# ===== STT 语音识别（可选）=====
STT_ENABLED=true              # 开启语音消息转文字
STT_MODEL=FunAudioLLM/SenseVoiceSmall  # 模型（默认 SiliconFlow）
STT_BASE_URL=                 # STT API 地址（留空用 SiliconFlow）

# ===== 群设置 =====
GROUP_WHITELIST=             # 允许的群号（逗号分隔，留空允许所有）
MAX_HISTORY=100              # 最大历史消息数

# ===== 定时任务 =====
SCHEDULE_GROUPS=             # 定时问候的目标群号（留空=所有活跃群）

# ===== Astrbot 转发（可选）=====
ASTRBOT_QQ=                  # 目标 Astrbot QQ 号（不配置则禁用）

# ===== 日志 =====
LOG_LEVEL=info               # debug/info/warn/error

# ===== 自学习插件 =====
SELF_LEARNING_ENABLED=true
SELF_LEARNING_DATA_DIR=./data/self-learning
SELF_LEARNING_TARGETS=
SELF_LEARNING_BLACKLIST=
SELF_LEARNING_INTERVAL_HOURS=6
SELF_LEARNING_MIN_MESSAGES=30
SELF_LEARNING_MAX_BATCH=200
SELF_LEARNING_ENABLE_ML=true
SELF_LEARNING_MAX_ML_SAMPLE=120
SELF_LEARNING_TOTAL_AFFECTION_CAP=250
SELF_LEARNING_MAX_USER_AFFECTION=100
SELF_LEARNING_DB_TYPE=sqlite
SELF_LEARNING_DB_FILE=./data/self-learning/self-learning.sqlite
SELF_LEARNING_MYSQL_URL=
SELF_LEARNING_POSTGRES_URL=

# ===== 外部插件（可选）=====
PLUGIN_PATHS=plugins/example-echo-plugin.cjs
```

### 3. 启动 OneBot 实现

以 NapCat 为例：
```bash
# 确保 NapCat 开启了正向 WebSocket 服务
# 默认地址: ws://127.0.0.1:3001
```

### 4. 运行

```bash
# 开发模式
npm run dev

# 生产模式
npm run build && npm start
```

启动成功后访问 **http://localhost:3180** 查看 Dashboard 控制台。

### 4.1 本机自然语音部署（GPT-SoVITS）

当前仓库已经按以下目录约定完成联调：

```text
CodeBuddyWorkSpace/
  QQTalker/
  GPT-SoVITS/
```

推荐启动顺序：

```bash
# 1. 启动 GPT-SoVITS 官方 API
cd ../GPT-SoVITS
powershell -ExecutionPolicy Bypass -File start-api-v2.ps1

# 2. 启动 QQTalker voice-service
cd ../QQTalker/voice-service
powershell -ExecutionPolicy Bypass -File start-local-service.ps1

# 3. 启动 QQTalker
cd ..
npm run dev
```

本次部署默认使用：

- `GPT-SoVITS`: `http://127.0.0.1:9880/tts`
- `voice-service`: `http://127.0.0.1:8765`
- `QQTalker Dashboard`: `http://127.0.0.1:3180`
- 默认模型: `preset-yongchutafi`

如果希望一键拉起上线所需服务，可以直接运行：

```powershell
powershell -ExecutionPolicy Bypass -File .\start-voice-stack.ps1
```

当前上线口径：

- 默认语音链路固定为 `GPT-SoVITS`
- `edge-tts` 仅作为保底回退
- `RVC` 相关脚本与条目保留在仓库中用于历史实验回溯，但不再属于当前上线范围，也不纳入默认启动流程

已整理好的参考音频位于：

- `data/voice-models/dongxuelian/reference.wav`
- `data/voice-models/yongchutafi/reference.wav`

注意事项：

- `GPT-SoVITS` 参考音频要求在 `3~10 秒` 内，当前仓库已统一裁成 `8 秒` 单声道 WAV。
- Windows 环境下 `jieba_fast` 常见编译失败，仓库已兼容回退到 `jieba`。
- 若官方 API 首次推理报英文词性依赖问题，当前兼容补丁会自动回退，不再阻塞中文播报链路。

### 5. 测试

```bash
# 单元 / 集成测试
npm test

# 前端 E2E（基于 Playwright mock dashboard）
npm run test:e2e
```

本次 GPT 上线链路额外完成了如下运行验证：

- `http://127.0.0.1:9880/tts` 直连合成成功，返回 `540204` 字节 WAV
- `http://127.0.0.1:8765/preview` 代理合成成功，返回 `gpt-sovits / preset-dongxuelian`
- `http://127.0.0.1:3180/api/voice/preview` QQTalker 预览成功，返回 Base64 音频
- 真实 `at-reply` 遥测命中 `gpt-sovits / local-http`，`fallbackRate = 0`

---

## 项目结构

```
src/
├── index.ts                 # 主入口
├── logger.ts                # 日志配置
├── plugins/                 # 插件运行时与内置自学习插件
├── storage/                 # SQLite/MySQL/PostgreSQL 适配层
├── types/
│   ├── config.ts            # 配置类型和验证
│   └── onebot.ts            # OneBot协议类型定义 + 工具函数
├── services/
│   ├── onebot-client.ts     # OneBot WebSocket客户端 + 通知事件
│   ├── codebuddy-client.ts  # AI API客户端 + System Prompt
│   ├── session-manager.ts   # 双模式会话管理器
│   ├── tts-service.ts       # TTS语音服务 (edge-tts)
│   ├── stt-service.ts       # STT语音识别服务 (SenseVoice/Whisper)
│   ├── vision-service.ts    # AI图片识别服务 (Vision)
│   ├── divination-service.ts # 占卜服务（灵签/塔罗/运势）
│   ├── folk-divination.ts   # 民俗黄历/宜忌
│   ├── greeting-service.ts  # 定时问候语生成
│   ├── welcome-service.ts   # 新成员欢迎语
│   ├── scheduler-service.ts # 定时调度器 + AI插聊
│   ├── astrbot-relay.ts     # Astrbot转发中继
│   └── dashboard-service.ts  # HTTP Dashboard 控制台
└── handlers/
    └── message-handler.ts   # 消息处理器（核心逻辑）
```

---

## 配置说明

| 变量 | 说明 | 默认值 |
|------|------|--------|
| `WS_URL` | OneBot WebSocket地址 | ws://127.0.0.1:8080 |
| `ACCESS_TOKEN` | OneBot访问令牌 | 空 |
| `AI_API_KEY` | AI API密钥 | 必填 |
| `AI_BASE_URL` | API基础URL（OpenAI兼容） | 必填 |
| `AI_MODEL` | 使用的模型名 | deepseek-chat |
| `BOT_QQ` | 机器人QQ号 | 必填 |
| `BOT_NICKNAME` | 机器人昵称（识别文本@） | 空 |
| `TTS_ENABLED` | 是否启用语音回复 | true |
| `TTS_VOICE` | TTS音色名称 | zh-CN-XiaoyiNeural |
| `TTS_SPEED` | TTS语速(1-9) | 4 |
| `STT_ENABLED` | 是否启用语音识别 | false |
| `STT_MODEL` | STT模型 | FunAudioLLM/SenseVoiceSmall |
| `STT_BASE_URL` | STT API地址 | 空(SiliconFlow) |
| `AT_TRIGGER` | 是否只响应@消息 | true |
| `GROUP_WHITELIST` | 允许的群号(逗号分隔) | 允许所有群 |
| `MAX_HISTORY` | 最大历史消息数 | 100 |
| `SCHEDULE_GROUPS` | 定时任务目标群(逗号分隔) | 所有活跃群 |
| `ASTRBOT_QQ` | Astrbot QQ号 | 0(禁用) |
| `LOG_LEVEL` | 日志级别 | info |

---

## 常见问题

### Q: 连接失败？
检查 `.env` 中 `WS_URL` 是否正确，确保 NapCat/OneBot 实现正在运行且 WebSocket 服务已开启。

### Q: 不响应消息？
1. 确认 `BOT_QQ` 和 `BOT_NICKNAME` 配置正确
2. 必须在群里 **@机器人** 才能触发回复
3. 检查 `GROUP_WHITELIST` 是否包含目标群

### Q: 怎么让机器人有记忆？
默认就是**群聊共享模式**，所有人的对话都在同一个上下文中。Claw 能记住每个人说过的话。

### Q: 不想要语音回复？
设置 `TTS_ENABLED=false` 即可关闭。

### Q: 语音识别不准确？
1. 确保配置了正确的 `STT_API_KEY`（SiliconFlow 免费额度足够）
2. QQ 语音是 SILK 格式，需要 FFmpeg 或 silk-decoder 工具
3. 运行 `.\install-ffmpeg.ps1` 安装 FFmpeg

### Q: 图片识别不工作？
当前使用的 AI 模型必须支持 vision 能力（如 gpt-4o、gpt-4-vision）。DeepSeek 等纯文本模型不支持图片输入。

### Q: 如何修改机器人人设？
编辑 `src/services/codebuddy-client.ts` 中的 `SYSTEM_PROMPT` 变量。

### Q: Dashboard 打不开？
确认端口 3180 未被占用，启动成功后会打印 `Dashboard 控制台已启动: http://localhost:3180`。

---

## 插件开发

可通过 `PLUGIN_PATHS` 加载 CommonJS 插件，仓库内提供了示例文件 `plugins/example-echo-plugin.cjs`。插件可扩展：

- 消息捕获
- Prompt 上下文注入
- 群命令处理
- Dashboard API 路由

## 自学习高级能力

- 默认使用 `SQL.js` 文件型 SQLite，无需本地 C++ 编译链即可运行。
- 可切换 `SELF_LEARNING_DB_TYPE=mysql|postgres`，并使用 `SELF_LEARNING_MYSQL_URL` / `SELF_LEARNING_POSTGRES_URL` 接入外部数据库。
- 高级学习周期会生成：
  - 用户风格画像
  - 群内黑话候选
  - 22 类社交关系推断
  - 38 类对话场景分布
  - 轻量话题聚类
  - 记忆图谱摘要
  - 人格演化建议与审批记录
- Dashboard 自学习中心新增：
  - 导出 / 导入学习数据（UTF-8 JSON，兼容 Windows 直接查看）
  - 单群学习记录清理
  - 分析快照重建
  - 自动学习运行态开关与定时策略面板
  - 关键前端流程 E2E：立即学习、群切换、人格审批

## License

GPL-3.0-only
