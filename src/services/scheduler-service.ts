import pino from 'pino';
import { config } from '../types/config';
import { OneBotClient } from './onebot-client';
import { CodeBuddyClient } from './codebuddy-client';
import { GreetingService } from './greeting-service';
import { FolkDivinationService } from './folk-divination';
import { SessionManager } from './session-manager';

const logger = pino({ level: config.logLevel });

/** 定时任务配置 */
interface ScheduledTask {
  name: string;
  hour: number;
  minute: number;
  handler: () => Promise<void>;
}

/**
 * ===== AI 智能插聊参数 =====
 *
 * - 间隔: 3~6 分钟
 * - 只在群活跃(最近3分钟有人说话)时才发言
 * - 关键改进: 传入群聊上下文，让AI根据大家在聊什么来决定说什么
 */
const CHATTER_MIN_INTERVAL = 180;
const CHATTER_MAX_INTERVAL = 360;
const CHATTER_PROBABILITY = 75;     // 群活跃时的触发概率
const ACTIVITY_WINDOW_SEC = 180;    // 3分钟活跃窗口

/**
 * 定时调度器 + AI智能插聊
 *
 * 改进:
 * 1. AI插聊传入最近聊天记录 → 回复有上下文、自然
 * 2. 定时问候对活跃群也生效（不再依赖 SCHEDULE_GROUPS）
 * 3. 非@消息也会被记录到上下文
 */
export class SchedulerService {
  private onebot: OneBotClient;
  private ai: CodeBuddyClient;
  private greeting: GreetingService;
  private folk: FolkDivinationService;
  private sessionManager: SessionManager;
  private timer: ReturnType<typeof setInterval> | null = null;
  private lastExecutedDates: Map<string, string> = new Map();

  /** 下次可插聊时间 */
  private nextChatterTime = 0;

  /** 正在进行中的插聊 */
  private chattering = false;

  /** 已知的群列表 */
  private activeGroups: Set<number> = new Set();

  /** 群活跃记录: groupId => 最后消息时间戳 */
  private groupLastActivity: Map<number, number> = new Map();

  constructor(onebot: OneBotClient, ai: CodeBuddyClient) {
    this.onebot = onebot;
    this.ai = ai;
    this.greeting = new GreetingService();
    this.folk = new FolkDivinationService();
    this.sessionManager = new SessionManager();
  }

  /**
   * 注册一个活跃群号 (每条群消息都调用)
   */
  registerActiveGroup(groupId: number): void {
    this.activeGroups.add(groupId);
    this.groupLastActivity.set(groupId, Date.now());
  }

  /**
   * 获取最近N秒内有消息的活跃群
   */
  getActiveChatterGroups(): number[] {
    const now = Date.now();
    const windowMs = ACTIVITY_WINDOW_SEC * 1000;
    const result: number[] = [];
    for (const [gid, ts] of this.groupLastActivity) {
      if (now - ts <= windowMs) result.push(gid);
    }
    return result;
  }

  start(scheduleGroups: number[]): void {
    // 始终创建定时任务（即使 scheduleGroups 为空）
    const broadcastGroups = (scheduleGroups && scheduleGroups.length > 0)
      ? scheduleGroups
      : undefined; // undefined 表示"对所有活跃群广播"

    const tasks: ScheduledTask[] = [
      { name: 'morning', hour: 8, minute: 0,
        handler: async () => this.broadcastToActiveGroups(
          '\u65e9', () => this.greeting.getGreeting('morning')
        ) },
      { name: 'noon', hour: 12, minute: 0,
        handler: async () => this.broadcastToActiveGroups(
          '\u5348', () => this.greeting.getGreeting('noon')
        ) },
      { name: 'fortune', hour: 21, minute: 0,
        handler: async () => this.broadcastToActiveGroups(
          '\u8fd0',
          () => '\u{1f4e9} **\u4eca\u65e5\u6c11\u4fd3\u8fd0\u52bf**\n\n' + this.folk.getShortFortune()
        ) },
      { name: 'night', hour: 0, minute: 0,
        handler: async () => this.broadcastToActiveGroups(
          '\u665a', () => this.greeting.getGreeting('night')
        ) },
    ];

    this.scheduleNextChatter();

    this.timer = setInterval(() => {
      this.checkScheduledTasks(tasks);
      this.checkRandomChatter();
    }, 1000);

    logger.info(
      `\u{1F553} \u5b9a\u65f6\u8c03\u5ea6\u5df2\u542f\u52a8:` +
      `\n   08:00 \u65e9\u5b89 | 12:00 \u5348\u5b89 | 21:00 \u8fd0\u52bf | 00:00 \u665a\u5b89` +
      `\n   \u76ee\u6807: ${scheduleGroups.length > 0
        ? '\u914d\u7f6e\u7fa4(' + scheduleGroups.join(',') + ')'
        : '\u6240\u6709\u6d3b\u8dc0\u7fa4(\u81ea\u52a8)'}` +
      `\n` +
      `\n   \u{1f4ac} AI\u63d2\u804a:` +
      `\n   \u95f4\u9694: ${CHATTER_MIN_INTERVAL/60}-${CHATTER_MAX_INTERVAL/60}\u5206` +
      `\n   \u6982\u7387: ${CHATTER_PROBABILITY}% (\u7fa4\u6d3b\u8dc5\u65f6)` +
      `\n   \u6d3b\u8dc0\u7a97\u53e3: ${ACTIVITY_WINDOW_SEC/60}\u5206\u949f` +
      `\n   \u4e0a\u4e0b\u6587: \u263c \u4f20\u5165\u6700\u8fd1\u804a\u5929\u8bb0\u5f55`
    );
  }

  stop(): void {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
  }

  // ===== 定时任务 =====

  private checkScheduledTasks(tasks: ScheduledTask[]): void {
    const now = new Date();
    const dateKey = now.toISOString().slice(0, 10);

    for (const task of tasks) {
      if (
        now.getHours() === task.hour &&
        now.getMinutes() === task.minute &&
        now.getSeconds() === 0
      ) {
        const execKey = dateKey + ':' + task.name;
        if (this.lastExecutedDates.has(execKey)) continue;
        this.lastExecutedDates.set(execKey, dateKey);

        task.handler().catch(err => {
          logger.error({ err, task: task.name }, '\u5b9a\u65f6\u4efb\u52a1\u6267\u884c\u5931\u8d25');
        });
      }
    }
  }

  // ===== AI 智能插聊 (核心: 传入上下文) =====

  private scheduleNextChatter(): void {
    const interval = CHATTER_MIN_INTERVAL +
      Math.floor(Math.random() * (CHATTER_MAX_INTERVAL - CHATTER_MIN_INTERVAL));
    this.nextChatterTime = Date.now() + interval * 1000;
  }

  /**
   * AI 插聊 - 带上下文版本
   *
   * 核心改进:
   * - 不再用固定提示词模板
   * - 而是获取该群的最近聊天记录作为上下文传给AI
   * - AI根据"大家正在聊什么"决定是否+如何参与
   */
  private async checkRandomChatter(): Promise<void> {
    if (Date.now() < this.nextChatterTime) return;
    if (this.chattering) return;

    const h = new Date().getHours();
    if (h < 7 || h >= 24) return;

    // 找出当前活跃的群
    const activeGroups = this.getActiveChatterGroups();
    if (activeGroups.length === 0) {
      this.scheduleNextChatter();
      return;
    }

    // 概率判定
    if (Math.random() * 100 > CHATTER_PROBABILITY) {
      this.scheduleNextChatter();
      return;
    }

    this.chattering = true;

    try {
      // 随机选一个活跃群
      const targetGroup = activeGroups[
        Math.floor(Math.random() * activeGroups.length)
      ];

      // 获取该群的最近聊天记录作为上下文
      const history = this.sessionManager.getHistory(targetGroup, 0, 'group');

      // 构建带上下文的提示词
      const contextSummary = history.slice(-15).map(msg =>
        msg.role === 'user'
          ? msg.content
          : '[Claw]: ' + msg.content
      ).join('\n');

      const prompt =
        '[\u7fa4\u804a\u53c2\u4e0e]\n' +
        '\u4f60\u662f\u5728QQ\u7fa4\u91cc\u7684\u732b\u5a18Claw\uff0c\u5927\u5bb6\u6b63\u5728\u70ed\u70c8\u804a\u5929\u3002\n' +
        '\u4ee5\u4e0b\u662f\u6700\u8fd1\u7684\u804a\u5929\u8bb0\u5f55:\n\n' +
        contextSummary +
        '\n\n---\n' +
        '\u6839\u636e\u4e0a\u9762\u7684\u804a\u5929\u5185\u5bb9\uff0c\u4f60\u89c9\u5f97\u81ea\u5df1\u6709\u4ec0\u4e48\u503c\u5f97\u8bf4\u7684\u5417\uff1f\n' +
        '\u82e5\u6709\uff0c\u5c31\u81ea\u7136\u5730\u63d2\u4e00\u53e5\uff0c\u50cf\u771f\u6b63\u7684\u7fa4\u53cb\u4e00\u6837\u53c2\u4e0e\u3002\n' +
        '\u82e5\u6ca1\u6709\uff0c\u56de\u590d\u201c\u201d\u3002\n' +
        '\u8981\u6c42: \u4e0d@任何人, \u4e0d\u63d0\u95ee, \u4e24\u53e5\u5185, \u52a0\u55b5~';

      // 调用 AI (带上下文历史)
      const msg = await this.ai.chat(prompt, history.slice(-10), {
        isPersonalMode: false,
      });

      if (!msg || !msg.trim() || msg.trim().length < 3) {
        this.scheduleNextChatter();
        return;
      }

      await this.onebot.sendGroupMsg(targetGroup, msg.trim());

      logger.info(
        `\u{1f4ac} [AI\u63d2\u804a|\u6709\u4e0a\u4e0b\u6587] -> \u7fa4${targetGroup}: ` +
        msg.trim().substring(0, 50).replace(/\n/g, '\\')
      );

      // 保存插话记录到会话
      this.sessionManager.addMessage(
        targetGroup, 0,
        { role: 'user', content: '[\u7cfb\u7edf]\u63d0\u793aAI\u63d2\u8bdd' },
        'group'
      );
      this.sessionManager.addMessage(
        targetGroup, 0,
        { role: 'assistant', content: '[Claw\u4e3b\u52a8]: ' + msg.trim() },
        'group'
      );
    } catch (err) {
      logger.error({ err }, 'AI\u63d2\u804a\u751f\u6210\u5931\u8d25');
    } finally {
      this.chattering = false;
      this.scheduleNextChatter();
    }
  }

  /**
   * 广播到所有活跃的群 (解决定时任务不触发的问题)
   */
  private async broadcastToActiveGroups(
    type: string,
    getMessage: () => string
  ): Promise<void> {
    const message = getMessage();

    // 确定目标群列表
    let targetGroups: number[];
    if (config.scheduleGroups && config.scheduleGroups.length > 0) {
      targetGroups = config.scheduleGroups;
    } else {
      // 没有配置时，广播到所有已知活跃群
      targetGroups = Array.from(this.activeGroups);
    }

    if (targetGroups.length === 0) {
      logger.debug(`[\u5b9a\u65f6${type}] \u65e0\u53ef\u7528\u7fa4\uff0c\u8df3\u7565`);
      return;
    }

    for (const groupId of targetGroups) {
      try {
        await this.onebot.sendGroupMsg(groupId, message);
        logger.info(
          `\u{1f4ac} [\u5b9a\u65f6}${type}] -> ${groupId}: ` +
          message.substring(0, 40).replace(/\n/g, ' ')
        );
      } catch (err) {
        logger.error({ err, groupId }, `\u5e7f\u64ad${type}\u5931\u8d25`);
      }
    }
  }

  destroy(): void {
    this.stop();
  }
}
