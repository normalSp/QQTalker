# 核心业务流程

## 消息主链路

QQTalker 的大多数业务都从 `MessageHandler.handle()` 进入。

```mermaid
flowchart TD
  oneBotEvent[OneBot消息事件] --> handler[MessageHandler]
  handler --> stt[STT可选转写]
  handler --> vision[Vision可选识图]
  handler --> pluginOnMessage[PluginOnMessage]
  pluginOnMessage --> session[SessionManager写入上下文]
  session --> branch{是否@机器人}
  branch -->|是| atFlow[命令或AI回复]
  branch -->|否| passiveFlow[记录上下文后可选插话]
  atFlow --> personaLayer[人格解析与System组装]
  personaLayer --> aiClient[CodeBuddyClient]
  aiClient --> sendText[发送文字]
  sendText --> tts[可选追加TTS语音]
  passiveFlow --> astrbot[Astrbot转发或被动AI插话]
```

## 详细处理顺序

### 1. 收到消息

`OneBotClient` 收到 WebSocket 消息后：

- 识别 `post_type === message` 的消息事件
- 记录日志
- 分发给 `src/index.ts` 中注册的 `onMessage` 处理器

### 2. 前置过滤

`MessageHandler` 会先做这些检查：

- 私聊消息是否属于 Astrbot 回复
- 只处理群消息
- 忽略机器人自己发送的消息
- 检查屏蔽用户或屏蔽群
- 按需执行群白名单过滤

### 3. 媒体理解增强

在真正进入 AI 逻辑前，消息可能被增强：

- 语音消息：若启用 STT，会转写成 `[语音] xxx`
- 图片消息：若启用 Vision，会转成 `[图片] xxx`
- 这样后续 AI 看见的是带语义提示的文字，而不是原始 CQ 码

### 4. 插件消息钩子

`pluginManager.onMessage()` 会在 AI 逻辑前执行。

这一步非常关键：

- 自学习插件会在这里采集消息、更新实时信号
- 其他插件也可以在这里做统计、拦截或附加记录

### 5. 写入会话上下文

不论是否 `@` 机器人，消息都会先写入 `SessionManager`：

- 群模式：内容被格式化成 `[昵称]: 消息`
- 个人模式：只保留消息本身

因此，机器人即使没有立刻回复，也能“记住”群里最近发生了什么。

## `@` 机器人的处理流程

当 `isAtBot(groupMsg)` 为真时，主流程如下：

1. 先判断是不是 `/Astrbot` 命令。
2. 再判断是不是模式切换命令、占卜命令、插件命令或屏蔽命令。
3. 若启用了 Astrbot 复杂任务委托，可能先尝试外部委托。
4. 获取当前会话历史。
5. 按群 `group_id` 解析人格：`PersonaService.resolvePersona`，再与当前模式（群共享 / 个人）叠加自学习产生的 overlay（若有），组装发往模型的 system 侧内容（`buildChatSystemPrompt` 等）；TTS 侧也会使用解析结果中的角色字段。
6. 让插件通过 `beforeChat` 等钩子构建额外的 system prefix，并拼入最终请求。
7. 调用 `CodeBuddyClient.chat()`。
8. 保存 AI 回复到会话。
9. 先发文字，再根据 TTS 开关决定是否异步追加语音。

## 非 `@` 消息的处理流程

默认情况下，非 `@` 消息不会强制回复，但会继续参与上下文构建。

存在两个特殊分支：

- 如果当前群处于 Astrbot 转发模式，会自动转发。
- 否则按 15% 概率触发被动插话。

被动插话和普通回复的差别：

- 使用最近的聊天历史构造“群聊上下文提示”
- 允许 AI 选择“什么都不说”
- 只有在 `TTS_REPLY_MODE=all-replies` 时才允许给被动插话追加语音

## TTS 追加发送

AI 回复完成后，`sendAiReplyWithOptionalVoice()` 会：

1. 先发送文字消息
2. 调用 `TTSService` 合成音频
3. 将音频转为 CQ 语音消息后再次发送

语音发送是异步追加的，所以“看到文字但稍后才出现语音”是正常行为。

## Astrbot 集成

Astrbot 相关能力分为两层：

- 显式命令转发：`/Astrbot`
- 复杂任务委托：根据关键词、长度、群路由规则决定是否转发

当复杂任务委托失败时，`MessageHandler` 还可以按配置回退到本地 AI 处理。

## Dashboard 的插入点

Dashboard 不直接参与 AI 决策，但在链路里承担运行时可观测性：

- 收到消息时记录消息数
- 调用 AI、TTS、STT 时计数
- 记录错误信息
- 通过 SSE 向前端实时推送状态和日志

## 自学习的插入点

自学习主要有两类介入方式：

- 在 `onMessage` 阶段采集和学习消息
- 在 `beforeChat` 阶段把情绪、好感度、黑话、长期记忆、人格审查结果等注入 Prompt

这意味着它不是“另一个回复器”，而是主 AI 的上下文增强器。

## 发送限速与风控规避

`MessageHandler` 内部维护了一个串行发送队列，目标是减少 QQ 风控：

- 限制两次发送的最小间隔
- 连续高频发送时逐步增加等待时间
- 发送失败后增加冷却时间
- 队列过长时丢弃较旧的待发送任务

因此在高并发群聊里，偶尔出现延迟回复是设计上的保护行为，不一定是 bug。
