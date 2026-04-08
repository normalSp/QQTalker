# QQTalker - QQ聊天机器人

将你的QQ号变成一只可爱的**猫娘AI机器人（Claw）**，支持群聊共享上下文、语音回复、语音识别、图片识别、占卜等功能。

## 功能特点

- **💬 群聊模式（默认）**: 全群共享对话上下文，Claw 记住每个人说了什么，可 @指定人回复
- **👤 私聊模式**: 可切换为每人独立对话
- **🔄 AI智能回复**: 接入 DeepSeek/OpenAI 等 OpenAI 兼容 API
- **🎧 语音回复 (TTS)**: edge-tts 语音输出（默认开启）
- **🎧 语音识别 (STT)**: 支持将群友的语音消息转成文字再回复（SiliconFlow SenseVoice / OpenAI Whisper）
- **🖼️ 图片识别 (Vision)**: AI 描述图片内容，支持 @图片 时自动触发（需要支持 vision 的模型）
- **🔮 占卜功能**: 观音灵签、塔罗牌、今日运势、随机占卜、民俗黄历
- **👋 入群欢迎**: 新成员入群时自动发送个性化欢迎语
- **📡 Astrbot 转发**: 可将消息转发给其他 AI 机器人（如 Astrbot），实现多 AI 协作
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

# ===== 功能开关 =====
TTS_ENABLED=true             # 语音回复（默认开启）
TTS_VOICE=zh-CN-XiaoyiNeural  # TTS 音色
TTS_SPEED=4                  # 语速 1-9
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

---

## 项目结构

```
src/
├── index.ts                 # 主入口
├── logger.ts                # 日志配置
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

## License

MIT
