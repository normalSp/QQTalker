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
 * 消息处理器
 * 核心逻辑:
 * - 默认群共享模式: 全群共享上下文, @机器人才回复
 * - 私聊模式: 每人独立对话
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

  /**
   * 设置调度器 (用于注册活跃群号)
   */
  setScheduler(scheduler: SchedulerService): void {
    this.scheduler = scheduler;
  }

  /**
   * 处理收到的消息
   */
  async handle(msg: OneBotMessage): Promise<void> {
    logger.debug('[handle] \u6536\u5230\u6D88\u606F: post_type=' + msg.post_type + ', type=' + msg.message_type);
    
    if (msg.message_type !== 'group') {
      logger.debug('[handle] \u5FFD\u7565\u975E\u7FA4\u6D88\u606F');
      return;
    }

    const groupMsg = msg as GroupMessage;

    // ===== 注册活跃群 (让 AI 插聊知道往哪个群发) =====
    if (this.scheduler) {
      this.scheduler.registerActiveGroup(groupMsg.group_id);
    }
    
    if (groupMsg.user_id === config.botQq) return;

    const text = extractTextContent(groupMsg);
    if (!text || !text.trim()) return;

    // ====== 判断是否需要处理 ======
    const atBot = isAtBot(groupMsg);
    const effectiveMode = this.sessionManager.getEffectiveMode(groupMsg.group_id);

    // 规则:
    // 1. @了机器人 -> 处理（无论什么模式）
    // 2. 否则不处理（除非未来添加其他触发方式）
    if (!atBot) return;

    // 白名单检查
    if (config.groupWhitelist.length > 0 && 
        !config.groupWhitelist.includes(groupMsg.group_id)) {
      return;
    }

    const msgKey = `${groupMsg.group_id}:${groupMsg.message_id}`;
    if (this.processing.has(msgKey)) return;
    this.processing.add(msgKey);

    try {
      await this.processGroupMessage(groupMsg, text, effectiveMode);
    } catch (error) {
      logger.error({ error, groupId: groupMsg.group_id }, '\u5904\u7406\u6D88\u606F\u5931\u8D25');
      try {
        await this.sendReply(groupMsg, formatAtText(groupMsg.user_id, '\u62B1\u6B49\u54DF~\u5904\u7406\u6D88\u606F\u65F6\u51FA\u9519\u4E86\uFF0C\u8BD5\u8BD5\u91CD\u65B0\u53D1\u9001\u55B5~'));
      } catch {}
    } finally {
      this.processing.delete(msgKey);
    }
  }

  /**
   * 处理群消息核心逻辑
   */
  private async processGroupMessage(
    groupMsg: GroupMessage,
    text: string,
    mode: SessionMode
  ): Promise<void> {
    const senderCard = (groupMsg as any).sender?.card || '';
    const nickname = groupMsg.sender.nickname || senderCard || `\u7528${groupMsg.user_id}`;

    logger.info(
      '\uD83D\uDCE9 [' +
      (mode === 'group' ? '\u7FA4\u5171\u4EAB' : '\u79C1\u804A') +
      ' \u7FA4' + groupMsg.group_id + '] ' +
      nickname + '(' + groupMsg.user_id + '): ' +
      text.substring(0, 50)
    );

    // ====== 模式切换命令 ======
    const modeCmd = this.checkModeCommand(text);
    if (modeCmd) {
      await this.handleModeCommand(groupMsg, nickname, modeCmd, text);
      return;
    }

    // ====== 占卜命令 ======
    const divCmd = this.divination.parseCommand(text);
    if (divCmd) {
      const result = this.divination.divine(divCmd.type);
      const reply = this.divination.formatResult(result);
      await this.sendReply(groupMsg, formatAtText(groupMsg.user_id, reply));

      // 占卜结果也保存到会话（让AI知道发生了什么）
      const userMessage = '[' + nickname + ']: ' + text;
      this.sessionManager.addMessage(
        groupMsg.group_id, groupMsg.user_id,
        { role: 'user', content: userMessage },
        mode
      );
      this.sessionManager.addMessage(
        groupMsg.group_id, groupMsg.user_id,
        { role: 'assistant', content: reply },
        mode
      );
      return;
    }

    // ====== 构建带昵称的用户消息 ======
    const userMessage =
      mode === 'group'
        ? '[' + nickname + ']: ' + text
        : text;

    // 获取历史
    const history = this.sessionManager.getHistory(
      groupMsg.group_id,
      groupMsg.user_id,
      mode
    );

    // AI调用
    const reply = await this.codebuddy.chat(userMessage, history, {
      isPersonalMode: mode === 'personal',
    });

    // 保存对话历史
    this.sessionManager.addMessage(
      groupMsg.group_id, groupMsg.user_id,
      { role: 'user', content: userMessage },
      mode
    );
    this.sessionManager.addMessage(
      groupMsg.group_id, groupMsg.user_id,
      { role: 'assistant', content: reply },
      mode
    );

    // 构建回复消息
    const replyWithAt = formatAtText(groupMsg.user_id, reply);

    // TTS语音
    if (this.tts.isEnabled()) {
      const audioBuffer = await this.tts.textToSpeech(reply);
      if (audioBuffer && audioBuffer.length > 1024) {
        const base64Audio = audioBuffer.toString('base64');
        const recordCq = formatRecord(base64Audio);
        try {
          await this.onebot.sendGroupRecord(groupMsg.group_id, recordCq);
          await this.onebot.sendGroupMsg(groupMsg.group_id, '[\u6587\u5B57\u7248] ' + replyWithAt);
          return;
        } catch (e) {
          logger.warn({ error: e }, '\u8BED\u97F3\u53D1\u9001\u5931\u8D25');
        }
      }
    }

    await this.sendReply(groupMsg, replyWithAt);
  }

  /**
   * 检查是否为模式切换命令
   */
  private checkModeCommand(text: string): string | null {
    const trimmed = text.trim().toLowerCase();

    for (const [cmdType, keywords] of Object.entries(MODE_COMMANDS)) {
      for (const kw of keywords) {
        // 匹配 "切换到xxx" 或直接 "xxx"
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
            formatAtText(
              groupMsg.user_id,
              '\u73B0\u5728\u5DF2\u7ECF\u662F\u79C1\u804A\u6A21\u5F0F\u5566~ \u6BCF\u4EBA\u7684\u5BF9\u8BDD\u72EC\u7ACB\uFF01\u55B5~'
            )
          );
        } else {
          this.sessionManager.togglePersonalMode(groupId, true);
          logger.info(
            '\u{1F4AC} [\u7FA4' + groupId + '] ' + nickname +
            ' \u5207\u6362\u5230\u79C1\u804A\u6A21\u5F0F'
          );
          await this.sendReply(
            groupMsg,
            formatAtText(
              groupMsg.user_id,
              '\u597D\u54E7~\u5DF2\u5207\u6362\u5230\u79C1\u804A\u6A21\u5F0F\u5562!' +
              ' \u73B0\u5728\u6BCF\u4E2A\u4EBA\u7684\u5BF9\u8BDDClaw\u4F1A\u5206\u5F00\u8BB0\u4F4F\u55B5~' +
              ' \u56DE\u5230\u7FA4\u804A\u6A21\u5F0F\u8BF4"\u7FA4\u804A\u6A21\u5F0F"\u5C31\u53EF\u4EE5\u2728'
            )
          );
        }
        break;

      case 'group':
        if (!this.sessionManager.isPersonalMode(groupId)) {
          await this.sendReply(
            groupMsg,
            formatAtText(
              groupMsg.user_id,
              '\u73B0\u5728\u5DF2\u7ECF\u662F\u7FA4\u5171\u4EAB\u6A21\u5F0F\u5566~ \u5927\u5BB6\u7684\u5BF9\u8BDD\u90FD\u5728\u4E00\u8D77\uFF01\u55B5~'
            )
          );
        } else {
          this.sessionManager.togglePersonalMode(groupId, false);
          logger.info(
            '\u{1F4AC} [\u7FA4' + groupId + '] ' + nickname +
            ' \u5207\u6362\u56DE\u7FA4\u5171\u4EAB\u6A21\u5F0F'
          );
          await this.sendReply(
            groupMsg,
            formatAtText(
              groupMsg.user_id,
              '\u597D\u54E7~\u5DF2\u5207\u6362\u56DE\u7FA4\u5171\u4EAB\u6A21\u5F0F\u5562!' +
              ' \u73B0\u5728\u6240\u6709\u4EBA\u7684\u5BF9\u8BDD\u90FD\u5728\u540C\u4E00\u4E2A\u4E0A\u4E0B\u6587\u4E2D\uFF0CClaw\u4F1A\u8BB0\u4F4F\u6BCF\u4E2A\u4EBA\u8BF4\u4EC0\u4E48\u55B5~' +
              ' \u2728'
            )
          );
        }
        break;

      case 'clear':
        this.sessionManager.clearSession(
          groupId,
          groupMsg.user_id,
          this.sessionManager.getEffectiveMode(groupId)
        );
        logger.info(
          '\u{1F5D1} [\u7FA4' + groupId + '] ' + nickname + ' \u6E05\u7A7A\u4E86\u5BF9\u8BDD'
        );
        await this.sendReply(
          groupMsg,
          formatAtText(
            groupMsg.user_id,
            '\u597D\u54E7~\u5BF9\u8BDD\u5DF2\u7ECF\u6E05\u7A7A\u5562! \u91CD\u65B0\u5F00\u59CB\u5427\u55B5~ \u2705'
          )
        );
        break;
    }
  }

  private async sendReply(groupMsg: GroupMessage, message: string): Promise<void> {
    await this.onebot.sendGroupMsg(groupMsg.group_id, message);
  }
}
