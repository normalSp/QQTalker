# QQTalker - QQ聊天机器人

将你的QQ号变成一只可爱的**猫娘AI机器人（Claw）**，支持群聊共享上下文、语音回复、占卜等功能。

## 功能特点

- **\u{1F4AC} 群聊模式（默认）**: 全群共享对话上下文，Claw 记住每个人说了什么，可 @指定人回复
- **\u{1F464} 私聊模式**: 可切换为每人独立对话
- **\u{1F504} AI智能回复**: 接入 DeepSeek/OpenAI 等 OpenAI 兼容 API
- **\u{1F3A7} 语音回复**: TTS 语音输出（默认开启）
- **\u{1F52E} 占卜功能**: 观音灵签、塔罗牌、今日运势、随机占卜
- **@触发**: 群内 @机器人 即可触发回复
- **自动重连**: 断线自动重连机制

## 架构

```
\u250C\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u252C    WebSocket    \u250C\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u252C   HTTP API   \u250C\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2510
\u2502  QQ群消息   \u2502 \u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2192 \u2502 QQTalker  \u2502 \u2500\u2500\u2500\u2500\u2500\u2500\u2192 \u2502  DeepSeek  \u2502
\u2502 (OneBot)   \u2502 \u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2190 \u2502           \u2502 \u2500\u2500\u2500\u2500\u2500\u2190 \u2502    AI     \u2502
\u2514\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2534    消息转发     \u2514\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2534   AI响应     \u2514\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2518
```

---

## \u{1F680} 群内命令大全

所有命令都需要 **@机器人** 才能触发。

### 基础聊天

| 命令 | 说明 | 示例 |
|------|------|------|
| `@Claw <消息>` | 聊天/提问 | `@Claw 你好` |
| `@Claw <消息>` | 在群聊模式下多人同时聊，Claw 会记住每个人的发言并综合回复 | `@Claw 大家觉得这个方案怎么样？` |

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

### 其他

| 操作 | 说明 |
|------|------|
| 直接发文字 | 默认需要 @机器人才响应 |
| 语音消息 | 回复时会自动附带 TTS 语音（可在 .env 中关闭） |

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
TTS_SPEED=4                  # 语速 1-9
AT_TRIGGER=true              # 只响应@消息

# ===== 群设置 =====
GROUP_WHITELIST=             # 允许的群号（逗号分隔，留空允许所有）
MAX_HISTORY=100              # 最大历史消息数

# ===== 日志 =====
LOG_LEVEL=debug              # debug/info/warn/error
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

---

## 项目结构

```
src/
\u251C\u2500\u2500 index.ts                 # 主入口
\u251C\u2500\u2500 types/
\u2502   \u251C\u2500\u2500 config.ts            # 配置类型和验证
\u2502   \u2514\u2500\u2500 onebot.ts            # OneBot协议类型定义 + 工具函数
\u251C\u2500\u2500 services/
\u2502   \u251C\u2500\u2500 onebot-client.ts     # OneBot WebSocket客户端
\u2502   \u251C\u2500\u2500 codebuddy-client.ts  # AI API客户端 + System Prompt
\u2502   \u251C\u2500\u2500 session-manager.ts   # 双模式会话管理器
\u2502   \u251C\u2500\u2500 tts-service.ts       # TTS语音服务（百度）
\u2502   \u2514\u2500\u2500 divination-service.ts # 占卜服务（灵签/塔罗/运势）
\u2514\u2500\u2500 handlers/
    \u2514\u2500\u2500 message-handler.ts   # 消息处理器（核心逻辑）
```

---

## 配置说明

| 变量 | 说明 | 默认值 |
|------|------|--------|
| `WS_URL` | OneBot WebSocket地址 | ws://127.0.0.1:3001 |
| `ACCESS_TOKEN` | OneBot访问令牌 | 空 |
| `AI_API_KEY` | AI API密钥 | 必填 |
| `AI_BASE_URL` | API基础URL（OpenAI兼容） | 必填 |
| `AI_MODEL` | 使用的模型名 | deepseek-chat |
| `BOT_QQ` | 机器人QQ号 | 必填 |
| `BOT_NICKNAME` | 机器人昵称（识别文本@） | 空 |
| `TTS_ENABLED` | 是否启用语音回复 | true |
| `TTS_SPEED` | TTS语速(1-9) | 4 |
| `AT_TRIGGER` | 是否只响应@消息 | true |
| `GROUP_WHITELIST` | 允许的群号(逗号分隔) | 允许所有群 |
| `MAX_HISTORY` | 最大历史消息数 | 100 |
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

### Q: 如何修改机器人人设？
编辑 `src/services/codebuddy-client.ts` 中的 `SYSTEM_PROMPT` 变量。

## License

MIT
