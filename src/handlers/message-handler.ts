import { logger } from '../logger';
import { validateConfig, config } from '../types/config';
import type { OneBotMessage, GroupMessage, PrivateMessage } from '../types/onebot';
import { isAtBot, extractTextContent, formatAtText, formatRecord } from '../types/onebot';
import { OneBotClient } from '../services/onebot-client';
import { CodeBuddyClient } from '../services/codebuddy-client';
import { SessionManager, type ChatMessage, type SessionMode } from '../services/session-manager';
import { DivinationService } from '../services/divination-service';
import { optimizeSpokenReplyText, TTSService } from '../services/tts-service';
import { STTService } from '../services/stt-service';
import { SchedulerService } from '../services/scheduler-service';
import { AstrbotRelayService } from '../services/astrbot-relay';
import { DashboardService } from '../services/dashboard-service';
import { VisionService } from '../services/vision-service';
import { BlockService } from '../services/block-service';
import { hasImage, extractImageCq } from '../types/onebot';
import type { PluginManager } from '../plugins/plugin-manager';
import type { PersonaService, ResolvedPersona } from '../services/persona-service';
import dotenv from 'dotenv';




/** 模式切换命令 */
const MODE_COMMANDS = {
  personal: ['\u79C1\u804A', '\u4E2A\u4EBA\u6A21\u5F0F', '\u79C1\u804A\u6A21\u5F0F'],
  group: ['\u7FA4\u804A', '\u7FA4\u6A21\u5F0F', '\u7FA4\u5171\u4EAB'],
  clear: ['\u6E05\u7406', '\u91CD\u7F6E', '\u6E05\u7A7A\u5BF9\u8BDD'],
};

/**
 * 非@消息的随机回复概率 (15%)
 * 这样机器人会偶尔主动参与聊天，但不会刷屏
 */
const PASSIVE_REPLY_PROBABILITY = 15;

/**
 * 消息处理器
 *
 * 核心改动:
 * 1. 所有群消息(无论是否@)都记录到上下文 → AI知道大家说了什么
 * 2. @机器人 → 必定回复 + 用AI生成有上下文的回复
 * 3. 非@消息 → 记录上下文 + 小概率(15%)主动插话
 * 4. 插聊时传入最近聊天记录 → 回复自然、有针对性
 */
export class MessageHandler {
  private onebot: OneBotClient;
  private codebuddy: CodeBuddyClient;
  private sessionManager: SessionManager;
  private divination: DivinationService;
  private tts: TTSService;
  private stt: STTService;
  private scheduler: SchedulerService | null = null;
  private astrbotRelay: AstrbotRelayService | null = null;
  private dashboard: DashboardService | null = null;
  private blockService: BlockService | null = null;
  private pluginManager: PluginManager | null = null;
  private personas: PersonaService | null = null;
  private vision: VisionService = new VisionService();
  private processing = new Set<string>();
  
  /** 发送频率控制：防止触发 QQ EventChecker (retcode=1200) */
  private lastSendTime = 0;
  private readonly SEND_INTERVAL_MS = 1000; // 基础间隔降到1s（QQ实际风控约1-2条/秒）
  private pendingSends: Array<() => Promise<void>> = [];
  private sending = false;
  /** 连续发送计数：短时间内多次发送会提高风控概率 */
  private recentSendCount = 0;
  private readonly SEND_COUNT_RESET_MS = 15000; // 15秒窗口
  private lastCountResetTime = 0;
  /** 上次失败时间：失败后需要更长冷却期 */
  private lastSendErrorTime = 0;
  private readonly ERROR_COOLDOWN_MS = 3000; // 发送失败后冷却3秒

  constructor(
    onebot: OneBotClient,
    codebuddy: CodeBuddyClient,
    sessionManager: SessionManager
  ) {
    this.onebot = onebot;
    this.codebuddy = codebuddy;
    this.sessionManager = sessionManager;
    this.divination = new DivinationService();
    this.tts = new TTSService();
    this.stt = new STTService(onebot);
    this.astrbotRelay = new AstrbotRelayService(onebot, sessionManager);
  }

  setScheduler(scheduler: SchedulerService): void {
    this.scheduler = scheduler;
    // 将限速发送函数注入 scheduler，使其插聊/广播也受频率控制
    scheduler.setRateLimitedSender((fn) => this.rateLimitSend(fn));
  }

  /** 设置 Dashboard 引用（用于统计埋点） */
  setDashboard(dashboard: DashboardService): void {
    this.dashboard = dashboard;
  }

  /** 设置屏蔽服务引用 */
  setBlockService(blockService: BlockService): void {
    this.blockService = blockService;
  }

  setPluginManager(pluginManager: PluginManager): void {
    this.pluginManager = pluginManager;
  }

  setPersonaService(personas: PersonaService): void {
    this.personas = personas;
    this.astrbotRelay?.setPersonaService(personas);
  }

  getAstrbotStatus(): unknown {
    return this.astrbotRelay?.getRuntimeSnapshot() || null;
  }

  private async resolvePersona(groupId: number): Promise<ResolvedPersona | null> {
    if (!this.personas) return null;
    return this.personas.resolvePersona(groupId);
  }

  refreshAstrbotRuntimeConfig(): void {
    dotenv.config({ override: true });
    this.astrbotRelay?.applyRuntimeConfig({
      targetQQ: parseInt(process.env.ASTRBOT_QQ || '0', 10),
      enabledComplexTasks: process.env.ASTRBOT_ENABLED_COMPLEX_TASKS === 'true',
      complexTaskKeywords: String(process.env.ASTRBOT_COMPLEX_TASK_KEYWORDS || '分析,总结,规划,排查,设计,方案,roadmap')
        .split(',')
        .map((item) => item.trim())
        .filter(Boolean),
      complexTaskGroupAllowlist: String(process.env.ASTRBOT_COMPLEX_TASK_GROUP_ALLOWLIST || '')
        .split(',')
        .map((item) => Number(item.trim()))
        .filter((item) => Number.isFinite(item) && item > 0),
      complexTaskGroupDenylist: String(process.env.ASTRBOT_COMPLEX_TASK_GROUP_DENYLIST || '')
        .split(',')
        .map((item) => Number(item.trim()))
        .filter((item) => Number.isFinite(item) && item > 0),
      complexTaskGroupRouteOverrides: String(process.env.ASTRBOT_COMPLEX_TASK_GROUP_ROUTE_OVERRIDES || '')
        .split(',')
        .map((item) => item.trim())
        .filter(Boolean)
        .reduce<Record<string, string>>((acc, item) => {
          const index = item.indexOf(':');
          if (index > 0) {
            acc[item.slice(0, index).trim()] = item.slice(index + 1).trim();
          }
          return acc;
        }, {}),
      complexTaskMinLength: parseInt(process.env.ASTRBOT_COMPLEX_TASK_MIN_LENGTH || '48', 10),
      complexTaskMessageMaxChars: parseInt(process.env.ASTRBOT_COMPLEX_TASK_MESSAGE_MAX_CHARS || '360', 10),
      timeoutMs: parseInt(process.env.ASTRBOT_TIMEOUT_MS || '45000', 10),
      fallbackToLocal: process.env.ASTRBOT_FALLBACK_TO_LOCAL !== 'false',
    });
  }

  /**
   * 处理收到的消息
   */
  async handle(msg: OneBotMessage): Promise<void> {
    // ===== 私聊消息：检查是否为 Astrbot 回复 =====
    if (msg.message_type === 'private') {
      await this.handlePrivateMessage(msg);
      return;
    }

    if (msg.message_type !== 'group') return;

    const groupMsg = msg as GroupMessage;

    // 注册活跃群
    if (this.scheduler) {
      this.scheduler.registerActiveGroup(groupMsg.group_id);
    }

    if (groupMsg.user_id === config.botQq) return;

    // 屏蔽检查：被屏蔽的用户或群直接忽略
    if (this.blockService?.shouldIgnore(groupMsg.user_id, groupMsg.group_id)) {
      logger.debug(`[屏蔽] 忽略被屏蔽的用户 ${groupMsg.user_id} 在群 ${groupMsg.group_id} 的消息`);
      return;
    }

    const text = extractTextContent(groupMsg);

    // ===== STT 语音识别：如果消息包含语音但没有文字，尝试转文字 =====
    // 提前获取 nickname（STT日志需要）
    const senderCard = (groupMsg as any).sender?.card || '';
    const nickname = groupMsg.sender.nickname || senderCard || `\u7528${groupMsg.user_id}`;

    let finalText = text;
    if ((!text || !text.trim()) && this.stt.isEnabled() && STTService.hasRecord(groupMsg.message)) {
      const recordInfo = STTService.extractRecordInfo(groupMsg.message);
      logger.debug(`[STT] record段完整信息: ${JSON.stringify(recordInfo)}`);
      const fallbackPath = recordInfo?.path || recordInfo?.file || '';
      try {
        const transcribedText = await this.stt.transcribeFile(fallbackPath, recordInfo);
        if (transcribedText) {
          finalText = '[语音] ' + STTService.postProcess(transcribedText);
          this.dashboard?.recordSttCall();
          logger.info(`🎤 [语音识别] ${nickname}: "${transcribedText.substring(0, 40)}"`);
        }
      } catch (error) {
        logger.warn({ error }, '[STT] 语音识别失败，跳过该消息');
      }
    }

    // ===== 图片识别：如果消息包含图片，尝试AI描述（在文字检查之前，纯图片消息也能处理）=====
    let imageDescription: string | null = null;
    if (hasImage(groupMsg.message) && this.vision.isEnabled()) {
      const imageCq = extractImageCq(groupMsg.message);
      if (imageCq) {
        try {
          imageDescription = await this.vision.describeImageWithContext(imageCq, finalText);
          if (imageDescription) {
            finalText = '[图片] ' + imageDescription + (finalText ? ' | ' + finalText : '');
            logger.info(`[Vision] ${nickname} 发了图: ${imageDescription.substring(0, 40)}`);
          }
        } catch (e) {
          logger.warn({ error: e }, '图片识别失败，继续处理文字部分');
        }
      }
    }

    // 文字和图片描述都为空 → 跳过（纯图片识别失败则静默跳过）
    if (!finalText || !finalText.trim()) return;



    const atBot = isAtBot(groupMsg);
    const effectiveMode = this.sessionManager.getEffectiveMode(groupMsg.group_id);

    // 白名单检查
    if (config.groupWhitelist.length > 0 &&
        !config.groupWhitelist.includes(groupMsg.group_id)) {
      return;
    }

    await this.pluginManager?.onMessage({
      message: msg,
      groupMessage: groupMsg,
      groupId: groupMsg.group_id,
      userId: groupMsg.user_id,
      nickname,
      rawText: text,
      finalText,
      isAtBot: atBot,
      mode: effectiveMode,
      timestamp: Date.now(),
    });

    // ===== /Astrbot 命令处理（优先级最高）=====
    if (atBot && this.astrbotRelay?.isAstrbotCommand(finalText)) {
      const msgKey = `${groupMsg.group_id}:${groupMsg.message_id}:astrbot`;
      if (this.processing.has(msgKey)) return;
      this.processing.add(msgKey);

      try {
        const result = await this.astrbotRelay.handleCommand(groupMsg, finalText, nickname);
        if (result.reply) {
          await this.sendReply(groupMsg, formatAtText(groupMsg.user_id, result.reply));
        }
      } catch (error) {
        logger.error({ error }, '处理/Astrbot命令失败');
        try {
          await this.sendReply(groupMsg,
            formatAtText(groupMsg.user_id, '抱歉~ Astrbot转发出错了喵~'));
        } catch {}
      } finally {
        this.processing.delete(msgKey);
      }
      return;
    }

    // ===== 核心改动：所有消息都记录到群上下文 =====
    const userMessage =
      effectiveMode === 'group'
        ? '[' + nickname + ']: ' + finalText
        : finalText;

    // 先保存用户消息到上下文（无论是否@）
    this.sessionManager.addMessage(
      groupMsg.group_id, groupMsg.user_id,
      { role: 'user', content: userMessage },
      effectiveMode
    );

    // ===== 分支处理 =====
    if (atBot) {
      // ===== Astrbot 转发模式优先：@消息也转发给 Astrbot =====
      if (this.astrbotRelay?.isGroupRelaying(groupMsg.group_id)) {
        // 处于转发模式时，@机器人的消息优先转发给 Astrbot（而非AI）
        const msgKey = `${groupMsg.group_id}:${groupMsg.message_id}:astrbot`;
        if (this.processing.has(msgKey)) return;
        this.processing.add(msgKey);

        try {
          await this.astrbotRelay.autoRelay(groupMsg, finalText, nickname);
        } catch (error) {
          logger.error({ error }, 'Astrbot转发(@消息)失败');
        } finally {
          this.processing.delete(msgKey);
        }
        return; // 转发模式下不走 AI 回复逻辑
      }

      // @了机器人 → 必定回复（正常AI回复）
      const msgKey = `${groupMsg.group_id}:${groupMsg.message_id}`;
      if (this.processing.has(msgKey)) return;
      this.processing.add(msgKey);

      try {
        await this.processAtMessage(groupMsg, finalText, userMessage, effectiveMode, nickname);
      } catch (error: any) {
        const errInfo = {
          name: error?.name,
          message: error?.message,
          stack: error?.stack,
          cause: error?.cause,
          rawError: error,
          errorString: String(error),
        };
        logger.error(errInfo, '处理@消息失败');
        logger.error(`[@错误详情] groupId=${groupMsg.group_id} | userId=${groupMsg.user_id} | text="${finalText.substring(0, 50)}"`);
        
        // 判断是否为风控错误（retcode=1200），如果是则不立即重试
        const isRateLimitError = error?.message?.includes('1200') || 
                                  error?.message?.includes('EventChecker');
        
        if (isRateLimitError) {
          logger.warn('[@错误] 检测到QQ风控拦截，跳过降级回复避免加重风控');
        } else {
          // 非风控错误才尝试发送降级回复
          try {
            await this.sendReply(groupMsg,
              formatAtText(groupMsg.user_id, '抱歉~出错了喵~重试看看？'));
          } catch (sendErr: any) {
            logger.error({ message: sendErr?.message, raw: String(sendErr) }, '[@错误] 降级回复也失败了');
          }
        }
      } finally {
        this.processing.delete(msgKey);
      }
    } else {
      // 没@机器人 → 小概率主动插话（用AI，带上下文）
      // 如果处于 Astrbot 转发模式，自动转发给 Astrbot
      if (this.astrbotRelay?.isGroupRelaying(groupMsg.group_id)) {
        try {
          await this.astrbotRelay.autoRelay(groupMsg, finalText, nickname);
        } catch (error) {
          logger.error({ error }, 'Astrbot自动转发失败');
        }
      } else if (Math.random() * 100 < PASSIVE_REPLY_PROBABILITY) {
        // 检查是否有正在处理的@消息或最近的发送活动，避免并发发送导致风控
        const timeSinceLastSend = Date.now() - this.lastSendTime;
        if (this.sending || timeSinceLastSend < this.SEND_INTERVAL_MS) {
          logger.debug(`[被动] 跳过插聊（发送忙碌或距上次发送${Math.round(timeSinceLastSend)}ms）`);
          return;
        }
        
        // 防止太频繁，用message_id做简单去重即可
        try {
          await this.processPassiveMessage(groupMsg, finalText, effectiveMode, nickname);
        } catch (error) {
          logger.error({ error, groupId: groupMsg.group_id }, `被动插话失败: ${(error instanceof Error ? error.message : String(error)).substring(0, 120)}`);
        }     }
    }
  }

  /**
   * 处理 @机器人的消息 → 必定回复
   */
  private async processAtMessage(
    groupMsg: GroupMessage,
    rawText: string,
    userMessage: string,
    mode: SessionMode,
    nickname: string
  ): Promise<void> {
    logger.info(
      '\uD83D\uDCE9 [@\u56DE\u590D] \u7FA4' + groupMsg.group_id +
      ' ' + nickname + ': ' + rawText.substring(0, 50)
    );

    // 模式切换命令
    const modeCmd = this.checkModeCommand(rawText);
    if (modeCmd) {
      await this.handleModeCommand(groupMsg, nickname, modeCmd, rawText);
      return;
    }

    // 屏蔽命令
    if (this.blockService) {
      const blockResult = this.handleBlockCommand(groupMsg, rawText, nickname);
      if (blockResult) {
        await this.sendReply(groupMsg, formatAtText(groupMsg.user_id, blockResult));
        return;
      }
    }

    // 占卜命令
    const divCmd = this.divination.parseCommand(rawText);
    if (divCmd) {
      const result = this.divination.divine(divCmd.type);
      const reply = this.divination.formatResult(result);
      await this.sendReply(groupMsg, formatAtText(groupMsg.user_id, reply));
      this.sessionManager.addMessage(
        groupMsg.group_id, groupMsg.user_id,
        { role: 'assistant', content: reply },
        mode
      );
      return;
    }

    const pluginCommand = await this.pluginManager?.handleCommand({
      groupId: groupMsg.group_id,
      userId: groupMsg.user_id,
      nickname,
      rawText,
      normalizedText: rawText.trim().toLowerCase(),
      isAdmin: ['owner', 'admin'].includes(groupMsg.sender?.role || ''),
    });
    if (pluginCommand?.handled) {
      if (pluginCommand.reply) {
        await this.sendReply(groupMsg, formatAtText(groupMsg.user_id, pluginCommand.reply));
        this.sessionManager.addMessage(
          groupMsg.group_id, groupMsg.user_id,
          { role: 'assistant', content: pluginCommand.reply },
          mode
        );
      }
      return;
    }

    if (this.astrbotRelay) {
      const delegation = await this.astrbotRelay.maybeDelegateComplexTask(groupMsg, rawText, nickname);
      if (delegation.delegated) {
        if (delegation.ackReply) {
          await this.sendReply(groupMsg, formatAtText(groupMsg.user_id, delegation.ackReply));
        }
        return;
      }
      if (delegation.fallbackToLocal) {
        logger.warn(
          {
            groupId: groupMsg.group_id,
            userId: groupMsg.user_id,
            reason: delegation.decision.reason,
            error: delegation.errorMessage,
          },
          'AstrBot复杂任务委托失败，继续由QQTalker本地处理'
        );
      }
    }

    // 获取历史 + AI回复
    logger.debug('[@流程] 1/4 获取历史消息...');
    const history = this.sessionManager.getHistory(
      groupMsg.group_id, groupMsg.user_id, mode
    );
    const persona = await this.resolvePersona(groupMsg.group_id);
    const systemPrefix = await this.pluginManager?.buildSystemPrefix({
      groupId: groupMsg.group_id,
      userId: groupMsg.user_id,
      nickname,
      basePersonaId: persona?.basePersonaId || '',
      rawText,
      userMessage,
      history,
      mode,
    });
    let systemPrompt = persona
      ? this.personas?.buildChatSystemPrompt(persona, mode, systemPrefix)
      : undefined;

    const modelRequest = await this.pluginManager?.beforeModelRequest({
      groupId: groupMsg.group_id,
      userId: groupMsg.user_id,
      nickname,
      mode,
      rawText,
      userMessage,
      history,
      basePersonaId: persona?.basePersonaId || '',
      systemPrefix,
      systemPrompt,
    });
    if (modelRequest?.handled) {
      const interceptedReply = modelRequest.reply || '';
      if (interceptedReply) {
        this.sessionManager.addMessage(
          groupMsg.group_id, groupMsg.user_id,
          { role: 'assistant', content: interceptedReply },
          mode
        );
        await this.sendAiReplyWithOptionalVoice(groupMsg, interceptedReply, {
          textReply: formatAtText(groupMsg.user_id, interceptedReply),
          ttsScene: 'at-reply',
          allowVoice: true,
          logPrefix: '[@流程]',
          voiceLogLabel: '[@语音]',
          persona,
        });
      }
      return;
    }
    const requestUserMessage = modelRequest?.userMessage ?? userMessage;
    const requestHistory = modelRequest?.history ?? history;
    const requestSystemPrefix = modelRequest?.systemPrefix ?? systemPrefix;
    systemPrompt = modelRequest?.systemPrompt ?? systemPrompt;

    logger.debug('[@流程] 2/4 调用AI生成回复...');
    this.dashboard?.recordAiCall();
    let reply = await this.codebuddy.chat(requestUserMessage, requestHistory, {
      isPersonalMode: mode === 'personal',
      systemPrefix: requestSystemPrefix,
      systemPrompt,
    });
    reply = await this.pluginManager?.afterModelResponse({
      groupId: groupMsg.group_id,
      userId: groupMsg.user_id,
      nickname,
      mode,
      rawText,
      userMessage: requestUserMessage,
      history: requestHistory,
      basePersonaId: persona?.basePersonaId || '',
      systemPrefix: requestSystemPrefix,
      systemPrompt,
      reply,
    }) || reply;
    logger.debug(`[@流程] 2/4 AI返回完成, 长度: ${reply.length}`);

    // 保存回复
    this.sessionManager.addMessage(
      groupMsg.group_id, groupMsg.user_id,
      { role: 'assistant', content: reply },
      mode
    );

    const replyWithAt = formatAtText(groupMsg.user_id, reply);
    await this.sendAiReplyWithOptionalVoice(groupMsg, reply, {
      textReply: replyWithAt,
      ttsScene: 'at-reply',
      allowVoice: true,
      logPrefix: '[@流程]',
      voiceLogLabel: '[@语音]',
      persona,
    });
  }

  private async sendAiReplyWithOptionalVoice(
    groupMsg: GroupMessage,
    rawReply: string,
    options: {
      textReply: string;
      ttsScene: 'at-reply' | 'passive-reply';
      allowVoice: boolean;
      logPrefix: string;
      voiceLogLabel: string;
      persona?: ResolvedPersona | null;
    }
  ): Promise<void> {
    const { textReply, ttsScene, allowVoice, logPrefix, voiceLogLabel, persona } = options;
    const shouldSendVoice = allowVoice && this.tts.isEnabled();

    if (shouldSendVoice) {
      logger.debug(`${logPrefix} 3/4 先发送文字回复...`);
      try {
        await this.sendReply(groupMsg, textReply);
        logger.info(`${logPrefix} 群${groupMsg.group_id} 文字发送成功`);
      } catch (e) {
        logger.warn({ error: e }, '文字发送失败');
      }

      logger.debug(`${logPrefix} 4/4 后台TTS合成...`);
      this.dashboard?.recordTtsCall();
      const spokenCharacter =
        persona?.ttsCharacter ||
        config.ttsGroupVoiceRoleMap[String(groupMsg.group_id)] ||
        config.ttsDefaultCharacter;
      const spokenReply = optimizeSpokenReplyText(rawReply, {
        scene: ttsScene,
        character: spokenCharacter,
      });
      this.tts.textToSpeech(spokenReply || rawReply, {
        scene: ttsScene,
        allowExperimental: false,
        groupId: groupMsg.group_id,
      }).then(async (audioBuffer) => {
        if (!audioBuffer || audioBuffer.length <= 1024) return;
        const base64Audio = audioBuffer.toString('base64');
        const recordCq = formatRecord(base64Audio);
        try {
          await this.sendReply(groupMsg, recordCq);
          logger.info(`${voiceLogLabel} 群${groupMsg.group_id} 语音追加发送成功`);
        } catch (e) {
          logger.warn({ error: e }, '语音追加发送失败');
        }
      }).catch((ttsErr) => {
        logger.warn({ error: ttsErr }, 'TTS合成失败（文字已发送）');
      });
      return;
    }

    logger.debug(`${logPrefix} 4/4 发送纯文字回复...`);
    await this.sendReply(groupMsg, textReply);
    logger.info(`${logPrefix} 群${groupMsg.group_id} 文字发送成功`);
  }

  /**
   * 处理非@消息 → 小概率主动参与对话
   *
   * 关键改进:
   * - 传入最近N条聊天记录作为上下文
   * - AI可以根据大家在聊什么来决定说什么
   * - 不是固定模板，而是真正"听懂了"再说话
   */
  private async processPassiveMessage(
    groupMsg: GroupMessage,
    rawText: string,
    mode: SessionMode,
    nickname: string
  ): Promise<void> {
    logger.info(
      '\uD83D\uDCE8 [\u88ab\u52A8\u63d2\u8bdd] \u7fa4' + groupMsg.group_id +
      ' ' + nickname + ': ' + rawText.substring(0, 30)
    );

    // 获取最近的聊天记录作为上下文
    const history = this.sessionManager.getHistory(
      groupMsg.group_id, groupMsg.user_id, mode
    );
    const persona = await this.resolvePersona(groupMsg.group_id);
    const systemPrefix = await this.pluginManager?.buildSystemPrefix({
      groupId: groupMsg.group_id,
      userId: groupMsg.user_id,
      nickname,
      basePersonaId: persona?.basePersonaId || '',
      rawText,
      userMessage: rawText,
      history,
      mode,
    });
    let systemPrompt = persona
      ? this.personas?.buildChatSystemPrompt(persona, mode, systemPrefix)
      : undefined;

    // 构建提示词：告诉AI当前群聊上下文，让它决定是否+如何参与
    const contextPrompt =
      '[\u7fa4\u804a\u4e0a\u4e0b\u6587]\n' +
      `你是QQ群里的${persona?.profile.name || 'Claw'}。` +
      '\u4ee5\u4e0b\u662f\u8fd1\u671f\u7684\u804a\u5929\u8bb0\u5f55\uff0c\u4f60\u53ef\u4ee5\u770b\u5230\u5927\u5bb6\u5728\u804a\u4ec0\u4e48\u3002' +
      '\u5982\u679c\u4f60\u89c9\u5f97\u81ea\u5df1\u6709\u8bdd\u53ef\u4ee5\u8bf4\uff0c\u5c31\u81ea\u7136\u5730\u63d2\u4e00\u53e5\u3002' +
      '\u5982\u679c\u4e0d\u60f3\u8bf4\uff0c\u56de\u590d\u201c\u201d\u5373\u53ef\u3002' +
      '\u8981\u6c42:\u4e0d@\u4eba, \u4e0d\u63d0\u95ee, \u4e24\u53e5\u5185, \u52a0\u55b5~';

    // 把上下文prompt当作用户消息发给AI
    const passiveHistory = history.slice(-20);
    const modelRequest = await this.pluginManager?.beforeModelRequest({
      groupId: groupMsg.group_id,
      userId: groupMsg.user_id,
      nickname,
      mode,
      rawText,
      userMessage: contextPrompt,
      history: passiveHistory,
      basePersonaId: persona?.basePersonaId || '',
      systemPrefix,
      systemPrompt,
    });
    if (modelRequest?.handled) {
      if (!modelRequest.reply || !modelRequest.reply.trim()) {
        logger.debug('[被动] 插件已拦截本次回复');
        return;
      }
      await this.sendAiReplyWithOptionalVoice(groupMsg, modelRequest.reply.trim(), {
        textReply: modelRequest.reply.trim(),
        ttsScene: 'passive-reply',
        allowVoice: config.ttsReplyMode === 'all-replies',
        logPrefix: '[被动流程]',
        voiceLogLabel: '[被动语音]',
        persona,
      });
      return;
    }

    let reply = await this.codebuddy.chat(modelRequest?.userMessage ?? contextPrompt, modelRequest?.history ?? passiveHistory, {
      isPersonalMode: false,
      systemPrefix: modelRequest?.systemPrefix ?? systemPrefix,
      systemPrompt: modelRequest?.systemPrompt ?? systemPrompt,
    });
    reply = await this.pluginManager?.afterModelResponse({
      groupId: groupMsg.group_id,
      userId: groupMsg.user_id,
      nickname,
      mode,
      rawText,
      userMessage: modelRequest?.userMessage ?? contextPrompt,
      history: modelRequest?.history ?? passiveHistory,
      basePersonaId: persona?.basePersonaId || '',
      systemPrefix: modelRequest?.systemPrefix ?? systemPrefix,
      systemPrompt: modelRequest?.systemPrompt ?? systemPrompt,
      reply,
    }) || reply;

    if (!reply || !reply.trim() || reply.trim().length < 3) {
      logger.debug('[\u88ab\u52a8] AI\u9009\u62e9\u4e0d\u8bf4\u8bdd');
      return;
    }

    const passiveReply = reply.trim();
    await this.sendAiReplyWithOptionalVoice(groupMsg, passiveReply, {
      textReply: passiveReply,
      ttsScene: 'passive-reply',
      allowVoice: config.ttsReplyMode === 'all-replies',
      logPrefix: '[被动流程]',
      voiceLogLabel: '[被动语音]',
      persona,
    });

    // 保存到上下文
    this.sessionManager.addMessage(
      groupMsg.group_id, groupMsg.user_id,
      { role: 'assistant', content: `[${persona?.profile.name || 'Claw'}主动插话]: ` + passiveReply },
      mode
    );

    logger.info(
      '\uD83D\uDCE8 [\u88ab\u52a8\u56de\u590d] -> \u7fa4' + groupMsg.group_id +
      ': ' + passiveReply.substring(0, 40)
    );
  }

  /**
   * 检查是否为模式切换命令
   */
  private checkModeCommand(text: string): string | null {
    const trimmed = text.trim().toLowerCase();

    for (const [cmdType, keywords] of Object.entries(MODE_COMMANDS)) {
      for (const kw of keywords) {
        if (
          trimmed === kw ||
          trimmed.includes('\u5207\u6362' + kw) ||
          trimmed.includes('\u8FDB\u5165' + kw) ||
          (kw.length >= 2 && trimmed.startsWith(kw))
        ) {
          return cmdType;
        }
      }
    }
    return null;
  }

  /**
   * 处理模式切换命令
   */
  private async handleModeCommand(
    groupMsg: GroupMessage,
    nickname: string,
    cmdType: string,
    _text: string
  ): Promise<void> {
    const groupId = groupMsg.group_id;

    switch (cmdType) {
      case 'personal':
        if (this.sessionManager.isPersonalMode(groupId)) {
          await this.sendReply(
            groupMsg,
            formatAtText(groupMsg.user_id,
              '\u73B0\u5728\u5DF2\u7ECF\u662F\u79C1\u804A\u6A21\u5F0F\u556A~ \u55B5~')
          );
        } else {
          this.sessionManager.togglePersonalMode(groupId, true);
          await this.sendReply(
            groupMsg,
            formatAtText(groupMsg.user_id,
              '\u5207\u6362\u5230\u79C1\u804A\u6A21\u5F0F\u5562! \u6BCF\u4EBA\u72EC\u7ACB\u5BF9\u8BDD\u55B5~')
          );
        }
        break;

      case 'group':
        if (!this.sessionManager.isPersonalMode(groupId)) {
          await this.sendReply(
            groupMsg,
            formatAtText(groupMsg.user_id,
              '\u5DF2\u7ECF\u662F\u7FA4\u5171\u4EAB\u6A21\u5F0F\u556A~ \u55B5~')
          );
        } else {
          this.sessionManager.togglePersonalMode(groupId, false);
          await this.sendReply(
            groupMsg,
            formatAtText(groupMsg.user_id,
              '\u5207\u6362\u56DE\u7FA4\u5171\u4EAB\u6A21\u5F0F\u5562! \u5927\u5BB6\u7684\u8BD5\u55B5~ \u2728')
          );
        }
        break;

      case 'clear':
        this.sessionManager.clearSession(
          groupId, groupMsg.user_id,
          this.sessionManager.getEffectiveMode(groupId)
        );
        await this.sendReply(
          groupMsg,
          formatAtText(groupMsg.user_id,
            '\u5BF9\u8BDD\u5DF2\u7ECF\u6E05\u7A7A\u5562! \u55B5~ \u2705')
        );
        break;
    }
  }

  /**
   * 处理屏蔽相关命令
   * @returns 回复文本，null 表示不是屏蔽命令
   */
  private handleBlockCommand(groupMsg: GroupMessage, text: string, nickname: string): string | null {
    const trimmed = text.trim().toLowerCase();

    // 屏蔽自己：/屏蔽
    if (trimmed === '/屏蔽' || trimmed === '/block') {
      if (this.blockService!.isUserBlocked(groupMsg.user_id, groupMsg.group_id)) {
        return '你已经处于屏蔽状态了喵~';
      }
      this.blockService!.blockUser(groupMsg.user_id, groupMsg.group_id, nickname, '用户主动屏蔽');
      this.dashboard?.pushLog('system', `用户 ${nickname}(${groupMsg.user_id}) 在群 ${groupMsg.group_id} 主动屏蔽`);
      return '好的，已将你屏蔽，之后不会回复你的消息了喵~ 如需解除请联系管理员喵';
    }

    // 管理员命令：屏蔽整个群 /屏蔽群
    if (trimmed === '/屏蔽群' || trimmed === '/blockgroup') {
      const senderRole = groupMsg.sender?.role;
      if (senderRole !== 'owner' && senderRole !== 'admin') {
        return '只有群主或管理员才能执行一键屏蔽群喵~';
      }
      if (this.blockService!.isGroupBlocked(groupMsg.group_id)) {
        return '本群已经处于屏蔽状态了喵~';
      }
      this.blockService!.blockGroup(groupMsg.group_id);
      this.dashboard?.pushLog('system', `群 ${groupMsg.group_id} 被管理员 ${nickname} 一键屏蔽`);
      return '已屏蔽整个群，机器人将不再响应本群任何消息喵~ 如需解除请在 Dashboard 管理面板操作';
    }

    return null;
  }

  private async sendReply(groupMsg: GroupMessage, message: string): Promise<void> {
    await this.rateLimitSend(() => this.onebot.sendGroupMsg(groupMsg.group_id, message));
  }

  /**
   * 频率控制的发送：确保两次发送间隔 >= SEND_INTERVAL_MS
   * 防止 QQ NT EventChecker (retcode=1200) 风控
   * 
   * 策略：
   * 1. 基础间隔 2.5s
   * 2. 短时间内连续发送时，动态增加间隔（指数退避）
   * 3. 串行队列：同一时间只有一个发送操作
   * 4. 队列超时保护：单次等待不超过30s，避免永久阻塞
   */
  private async rateLimitSend(fn: () => Promise<any>): Promise<void> {
    // 加入队列，确保串行执行
    return new Promise<void>((resolve, reject) => {
      const startTime = Date.now();
      const QUEUE_TIMEOUT_MS = 30000; // 队列等待超时30秒
      
      this.pendingSends.push(async () => {
        try {
          // 检查队列等待是否超时
          const waitTime = Date.now() - startTime;
          if (waitTime > QUEUE_TIMEOUT_MS) {
            logger.warn(`[限速] 队列等待超时 (${Math.round(waitTime)}ms)，跳过本次发送`);
            resolve();
            return;
          }
          
          await this.doRateLimitedSend(fn);
          resolve();
        } catch (e) {
          reject(e);
        }
      });
      this.processSendQueue();
    });
  }

  /**
   * 实际的频率控制逻辑
   * 
   * 策略：
   * 1. 基础间隔 1s（快速响应）
   * 2. 连续发送时平滑递增间隔
   * 3. 发送失败后短暂冷却
   */
  private async doRateLimitedSend(fn: () => Promise<any>): Promise<void> {
    const now = Date.now();

    // 重置连续发送计数器
    if (now - this.lastCountResetTime > this.SEND_COUNT_RESET_MS) {
      this.recentSendCount = 0;
      this.lastCountResetTime = now;
    }

    // 计算基础等待时间
    let requiredInterval = this.SEND_INTERVAL_MS;
    
    // 如果最近发送过失败，增加冷却时间
    if (this.lastSendErrorTime > 0 && (now - this.lastSendErrorTime) < this.ERROR_COOLDOWN_MS) {
      requiredInterval = Math.max(requiredInterval, this.ERROR_COOLDOWN_MS);
      logger.debug(`[限速] 检测到最近发送失败，使用冷却间隔 ${requiredInterval}ms`);
    }
    
    // 连续发送时平滑递增间隔（前3条保持1s，之后每条+200ms，上限2s）
    if (this.recentSendCount >= 3) {
      requiredInterval += Math.min((this.recentSendCount - 3) * 200, 1000);
    }
    
    // 始终确保距上次发送至少 requiredInterval
    const waitMs = this.lastSendTime + requiredInterval - now;
    
    if (waitMs > 0) {
      logger.debug(`[限速] 等待 ${Math.round(waitMs)}ms (连续${this.recentSendCount + 1}条, 间隔${requiredInterval}ms)`);
      await new Promise(resolve => setTimeout(resolve, waitMs));
    }
    
    try {
      await fn();
      // 成功：更新发送时间
      this.lastSendTime = Date.now();
      this.recentSendCount++;
    } catch (e) {
      // 失败：记录错误时间，但不更新 lastSendTime（让下次等待更久）
      this.lastSendErrorTime = Date.now();
      logger.warn(`[限速] 发送失败，已记录冷却时间`);
      throw e;
    }
  }

  /**
   * 串行处理发送队列（带队列长度保护）
   */
  private async processSendQueue(): Promise<void> {
    if (this.sending || this.pendingSends.length === 0) return;
    
    // 队列过长时丢弃最旧的待发送任务（保留最新的）
    const MAX_QUEUE_SIZE = 10;
    if (this.pendingSends.length > MAX_QUEUE_SIZE) {
      const discarded = this.pendingSends.splice(0, this.pendingSends.length - MAX_QUEUE_SIZE);
      logger.warn(`[限速] 队列溢出，丢弃 ${discarded.length} 条旧消息`);
    }
    
    this.sending = true;
    while (this.pendingSends.length > 0) {
      const fn = this.pendingSends.shift();
      if (fn) {
        await fn();
      }
    }
    this.sending = false;
  }

  /**
   * 处理私聊消息
   * 主要用途：接收 Astrbot 机器人的回复并转发回群
   */
  private async handlePrivateMessage(msg: OneBotMessage): Promise<void> {
    if (!this.astrbotRelay) return;

    const senderId = msg.user_id;
    const rawMsg = msg.raw_message || '';

    // 尝试作为 Astrbot 回复处理
    const handled = await this.astrbotRelay.handleAstrbotReply(
      senderId,
      rawMsg,
      msg.message
    );

    if (handled) {
      logger.info(`🔮 [私聊] 来自 ${senderId} 的消息已转发到群`);
    }
    // 非Astrbot的私聊消息忽略（或可扩展处理）
  }
}
