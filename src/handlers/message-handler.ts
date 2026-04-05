import pino from 'pino';
import { config } from '../types/config';
import type { OneBotMessage, GroupMessage } from '../types/onebot';
import { isAtBot, extractTextContent, formatAtText, formatRecord } from '../types/onebot';
import { OneBotClient } from '../services/onebot-client';
import { CodeBuddyClient } from '../services/codebuddy-client';
import { SessionManager, type ChatMessage, type SessionMode } from '../services/session-manager';
import { DivinationService } from '../services/divination-service';
import { TTSService } from '../services/tts-service';
import { SchedulerService } from '../services/scheduler-service';

const logger = pino({ level: config.logLevel });

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
  private scheduler: SchedulerService | null = null;
  private processing = new Set<string>();

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
  }

  setScheduler(scheduler: SchedulerService): void {
    this.scheduler = scheduler;
  }

  /**
   * 处理收到的消息
   */
  async handle(msg: OneBotMessage): Promise<void> {
    if (msg.message_type !== 'group') return;

    const groupMsg = msg as GroupMessage;

    // 注册活跃群
    if (this.scheduler) {
      this.scheduler.registerActiveGroup(groupMsg.group_id);
    }

    if (groupMsg.user_id === config.botQq) return;

    const text = extractTextContent(groupMsg);
    if (!text || !text.trim()) return;

    const atBot = isAtBot(groupMsg);
    const effectiveMode = this.sessionManager.getEffectiveMode(groupMsg.group_id);

    // 白名单检查
    if (config.groupWhitelist.length > 0 &&
        !config.groupWhitelist.includes(groupMsg.group_id)) {
      return;
    }

    // ===== 核心改动：所有消息都记录到群上下文 =====
    const senderCard = (groupMsg as any).sender?.card || '';
    const nickname = groupMsg.sender.nickname || senderCard || `\u7528${groupMsg.user_id}`;
    const userMessage =
      effectiveMode === 'group'
        ? '[' + nickname + ']: ' + text
        : text;

    // 先保存用户消息到上下文（无论是否@）
    this.sessionManager.addMessage(
      groupMsg.group_id, groupMsg.user_id,
      { role: 'user', content: userMessage },
      effectiveMode
    );

    // ===== 分支处理 =====
    if (atBot) {
      // @了机器人 → 必定回复
      const msgKey = `${groupMsg.group_id}:${groupMsg.message_id}`;
      if (this.processing.has(msgKey)) return;
      this.processing.add(msgKey);

      try {
        await this.processAtMessage(groupMsg, text, userMessage, effectiveMode, nickname);
      } catch (error) {
        logger.error({ error, groupId: groupMsg.group_id }, '\u5904\u7406@\u6D88\u606F\u5931\u8D25');
        try {
          await this.sendReply(groupMsg,
            formatAtText(groupMsg.user_id, '\u62B1\u6B49\u54DF~\u51FA\u9519\u4E86\uFF0C\u91CD\u8BD5\u55B5~'));
        } catch {}
      } finally {
        this.processing.delete(msgKey);
      }
    } else {
      // 没@机器人 → 小概率主动插话（用AI，带上下文）
      if (Math.random() * 100 < PASSIVE_REPLY_PROBABILITY) {
        // 防止太频繁，用message_id做简单去重即可
        try {
          await this.processPassiveMessage(groupMsg, text, effectiveMode, nickname);
        } catch (error) {
          logger.error({ error }, '\u88AB\u52A8\u63D2\u8bdd\u5931\u8D25(\u5DF2\u9758\u9ED8\u5FFD\u8BA4)');
        }
      }
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

    // 获取历史 + AI回复
    const history = this.sessionManager.getHistory(
      groupMsg.group_id, groupMsg.user_id, mode
    );

    const reply = await this.codebuddy.chat(userMessage, history, {
      isPersonalMode: mode === 'personal',
    });

    // 保存回复
    this.sessionManager.addMessage(
      groupMsg.group_id, groupMsg.user_id,
      { role: 'assistant', content: reply },
      mode
    );

    const replyWithAt = formatAtText(groupMsg.user_id, reply);

    // TTS
    if (this.tts.isEnabled()) {
      const audioBuffer = await this.tts.textToSpeech(reply);
      if (audioBuffer && audioBuffer.length > 1024) {
        const base64Audio = audioBuffer.toString('base64');
        const recordCq = formatRecord(base64Audio);
        try {
          await this.onebot.sendGroupRecord(groupMsg.group_id, recordCq);
          await this.onebot.sendGroupMsg(groupMsg.group_id, '[\u6587\u5B57] ' + replyWithAt);
          return;
        } catch (e) {
          logger.warn({ error: e }, 'TTS\u53d1\u9001\u5931\u8d25');
        }
      }
    }

    await this.sendReply(groupMsg, replyWithAt);
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

    // 构建提示词：告诉AI当前群聊上下文，让它决定是否+如何参与
    const contextPrompt =
      '[\u7fa4\u804a\u4e0a\u4e0b\u6587]\n' +
      '\u4f60\u662f\u5728QQ\u7fa4\u91cc\u7684\u732b\u5a18Claw\u3002' +
      '\u4ee5\u4e0b\u662f\u8fd1\u671f\u7684\u804a\u5929\u8bb0\u5f55\uff0c\u4f60\u53ef\u4ee5\u770b\u5230\u5927\u5bb6\u5728\u804a\u4ec0\u4e48\u3002' +
      '\u5982\u679c\u4f60\u89c9\u5f97\u81ea\u5df1\u6709\u8bdd\u53ef\u4ee5\u8bf4\uff0c\u5c31\u81ea\u7136\u5730\u63d2\u4e00\u53e5\u3002' +
      '\u5982\u679c\u4e0d\u60f3\u8bf4\uff0c\u56de\u590d\u201c\u201d\u5373\u53ef\u3002' +
      '\u8981\u6c42:\u4e0d@\u4eba, \u4e0d\u63d0\u95ee, \u4e24\u53e5\u5185, \u52a0\u55b5~';

    // 把上下文prompt当作用户消息发给AI
    const reply = await this.codebuddy.chat(contextPrompt, history.slice(-20), {
      isPersonalMode: false,
    });

    if (!reply || !reply.trim() || reply.trim().length < 3) {
      logger.debug('[\u88ab\u52a8] AI\u9009\u62e9\u4e0d\u8bf4\u8bdd');
      return;
    }

    // 只发送文字，不@任何人（因为是主动插聊）
    await this.sendReply(groupMsg, reply.trim());

    // 保存到上下文
    this.sessionManager.addMessage(
      groupMsg.group_id, groupMsg.user_id,
      { role: 'assistant', content: '[Claw\u4e3b\u52a8\u63d2\u8bdd]: ' + reply.trim() },
      mode
    );

    logger.info(
      '\uD83D\uDCE8 [\u88ab\u52a8\u56de\u590d] -> \u7fa4' + groupMsg.group_id +
      ': ' + reply.trim().substring(0, 40)
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

  private async sendReply(groupMsg: GroupMessage, message: string): Promise<void> {
    await this.onebot.sendGroupMsg(groupMsg.group_id, message);
  }
}
