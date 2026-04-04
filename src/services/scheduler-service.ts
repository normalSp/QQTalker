import pino from 'pino';
import { config } from '../types/config';
import { OneBotClient } from './onebot-client';
import { CodeBuddyClient } from './codebuddy-client';
import { GreetingService } from './greeting-service';
import { FolkDivinationService } from './folk-divination';

const logger = pino({ level: config.logLevel });

/** 定时任务配置 */
interface ScheduledTask {
  name: string;
  hour: number;
  minute: number;
  handler: () => Promise<void>;
}

/**
 * ===== AI 随机插聊参数 =====
 *
 * 设计目标：
 * - 间隔 3~6 分钟检查一次
 * - 只有群活跃时（最近3分钟有人说话）才发言
 * - 活跃时 80% 概率插话
 */
const CHATTER_MIN_INTERVAL = 180;   // 最快 3 分钟
const CHATTER_MAX_INTERVAL = 360;   // 最慢 6 分钟
const CHATTER_PROBABILITY = 80;     // 群活跃时 80% 概率发声

/**
 * 群活跃度判定:
 * 最近 N 秒内有真人消息才算"活跃"
 */
const ACTIVITY_WINDOW_SEC = 180;    // 3分钟窗口：最近3分钟有人说话 = 群活跃

/** AI 提示词 - 让 AI 生成自然的插聊 */
const CHATTER_PROMPTS: string[] = [
  '\u4F60\u662F\u5728QQ\u7FA4\u91CC\u7684\u732B\u5A18Claw\u3002\u73B0\u5728\u5927\u5BB6\u5728\u804A\u5929\uFF0C\u4F60\u60F3\u63D2\u53E5\u8BDD\u3002' +
  '\u8BF7\u751F\u6210\u4E00\u53E5\u77ED\u5C0F\u3001\u81EA\u7136\u3001\u50CF\u771F\u6B63\u7FA4\u53CB\u4E00\u6837\u7684\u63D2\u8BDD\u3002' +
  '\u8981\u6C42:\uFF081\uFF09\u4E0D\u898130\u4EFB\u4F55\u4EBA\uFF0C\uFF082\uFF09\u4E0D\u8981\u63D0\u95EE\uFF0C\uFF083\uFF09\u4E0D\u8981\u592A\u957F\uFF08\u4E24\u53E5\u5185\uFF09' +
  '\uFF084\uFF09\u4E0D\u8981\u8BF4"\u6211\u662FAI"/"\u6211\u662F\u673A\u5668\u4EBA"\uFF0C\uFF085\uFF09\u6BCF\u53E5\u52A0"\u55B5~"' +
  '\u76F4\u63A5\u8F93\u51FA\u90A3\u53E5\u8BDD\uFF0C\u4E0D\u8981\u52A0\u5F15\u53F7\u6216\u89E3\u91CA\u3002',

  '\u4F60\u662FClaw\uFF0C\u4E00\u53EA\u6D3B\u6CFE\u53EF\u7231\u7684\u732B\u5A18\u3002\u7FA4\u91CC\u5927\u5BB6\u5728\u70ED\u95F7\u804A\u5929\uFF0C' +
  '\u4F60\u60F3\u8BF4\u70B9\u4EC0\u4E48\uFF1F \u8BF7\u751F\u6210\u4E00\u53E5\u77ED\u5C0F\u7684\u3001\u6709\u8DA3\u7684\u3001\u81EA\u7136\u7684\u8BD5\u63A2\u6027\u8BDD\u8BED\u3002' +
  '\u4E0D\u8981@任何人, 不要提问, 两句以内, 结尾加"喵~". 直接输出内容。',

  '\u4F60\u662FClaw\u732B\u5A18\uFF0CQQ\u7FA4\u91CC\u7684\u4E00\u5458\u3002\u73B0\u5728\u7FA4\u6C14\u6BD4\u8F83\u6D3B\u8DC3\uFF0C' +
  '\u4F60\u60F3\u5206\u4EAB\u4E00\u4E2A\u5C0F\u60F3\u6CD5\u6216\u8005\u56DE\u5E94\u522B\u4EBA\u7684\u8BDD\u9898\u3002' +
  '\u751F\u6210\u4E00\u53E5\u81EA\u7136\u7684\u3001\u77ED\u5C0F\u7684\uFF08\u4E0D\u898130\u4EBA\u4E0D\u63D0\u95EE\uFF09\u8BDD\u8BED\uFF0C\u52A0\u55B5~' +
  '\u76F4\u63A5\u8F93\u51FA\u5185\u5BB9\u3002',

  '\u4F60\u662FClaw\u732B\u5A18~ QQ\u7FA4\u91CC\u5927\u5BB6\u5728\u804A\u5929\uFF0C\u4F60\u7A81\u7136\u60F3\u5230\u4E86\u4EC0\u4E48\u6709\u8DA3\u7684\u4E8B\u3002' +
  '\u8BF4\u4E00\u53E5\u5427\uFF01\u77ED\u5C0F\uFF0C\u81EA\u7136\uFF0C\u4E0D@人不提问\uFF0C\u52A0\u55B5~ \u76F4\u63A5\u8F93\u51FA\u3002',

  '\u4F60\u662FClaw\u732B\u5A18\uFF0C\u4E00\u53EA\u5728QQ\u7FA4\u91CC\u7684\u8D85\u7EA7\u6D3B\u6CFE\u7684\u732B\u54AA\u3002' +
  '\u73B0\u5728\u5927\u5BB6\u804A\u5F97\u6B63\u70ED\u70C8\uFF0C\u4F60\u4E5F\u60F3\u53C2\u4E0E\u8FDB\u6765\u3002' +
  '\u8BF4\u4E00\u53E5\u5427\uFF01\u77ED\u5C0F\uFF0C\u6709\u8DAE\uFF0C\u50CF\u771F\u6B63\u7684\u7FA4\u53CB\u4E00\u6837\u3002' +
  '\u4E0D@人, 不提问, 加"喵~", 直接说。',

  '\u4F60\u662FClaw\u732B\u5A18~ \u7FA4\u91CC\u6709\u4EBA\u5728\u5206\u4EAB\u751F\u6D3B\uFF0C\u4F60\u60F3\u8868\u8FBE\u4E00\u4E0B\u611F\u89E9\u6216\u8005\u5171\u9E23\u3002' +
  '\u4E00\u53E5\u8BDD\uFF0C\u81EA\u7136\u77ED\u5C0F\uFF0C\u52A0\u55B5~ \u76F4\u63A5\u8F93\u51FA\u3002',

  'Claw\u732B\u5A18\u5728\u8FD9\u91CC~ \u542C\u5230\u5927\u5BB6\u804A\u5929\u89C9\u5F97\u5F88\u6709\u8DA3\uFF0C' +
  '\u4F60\u60F3\u63D0\u4E00\u4E2A\u95EE\u9898\u6216\u8005\u5206\u4EAB\u4E00\u4E2A\u60F3\u6CD5\u3002' +
  '\u77ED\u77ED\u4E00\u53E5\uFF0C\u52A0\u55B5~ \u4E0D@人, 直接输出。',
];

/**
 * 定时调度器 + AI智能插聊
 *
 * 功能:
 * 1. AI 随机插聊 (独立于 SCHEDULE_GROUPS 运行)
 *    - 间隔: 3~6 分钟
 *    - 只在群里有人在聊天时才插话 (最近3分钟有消息)
 *    - 群冷清时自动静默，不跳出来
 *
 * 2. 定时问候 (需要 SCHEDULE_GROUPS)
 *    - 08:00 早安  12:00 午安
 *    - 21:00 运势  00:00 晚安
 */
export class SchedulerService {
  private onebot: OneBotClient;
  private ai: CodeBuddyClient;
  private greeting: GreetingService;
  private folk: FolkDivinationService;
  private timer: ReturnType<typeof setInterval> | null = null;
  private lastExecutedDates: Map<string, string> = new Map();

  /** 下次可插聊时间 */
  private nextChatterTime = 0;

  /** 正在进行中的插聊，防止并发 */
  private chattering = false;

  /** 已知的群列表 */
  private activeGroups: Set<number> = new Set();

  /**
   * 群活跃记录: groupId => 最后一条消息的时间戳
   * 用于判断"群里是否正在聊天"
   */
  private groupLastActivity: Map<number, number> = new Map();

  constructor(onebot: OneBotClient, ai: CodeBuddyClient) {
    this.onebot = onebot;
    this.ai = ai;
    this.greeting = new GreetingService();
    this.folk = new FolkDivinationService();
  }

  /**
   * 注册一个活跃群号 (供 MessageHandler 调用)
   */
  registerActiveGroup(groupId: number): void {
    this.activeGroups.add(groupId);
    // 同时更新该群的最后活跃时间
    this.groupLastActivity.set(groupId, Date.now());
  }

  start(scheduleGroups: number[]): void {
    const hasScheduleTasks = scheduleGroups && scheduleGroups.length > 0;

    const tasks: ScheduledTask[] = hasScheduleTasks ? [
      { name: 'morning', hour: 8, minute: 0,
        handler: async () => this.broadcast(scheduleGroups, '\u65e9', () =>
          this.greeting.getGreeting('morning')) },
      { name: 'noon', hour: 12, minute: 0,
        handler: async () => this.broadcast(scheduleGroups, '\u5348', () =>
          this.greeting.getGreeting('noon')) },
      { name: 'fortune', hour: 21, minute: 0,
        handler: async () => this.broadcast(scheduleGroups, '\u8fd0', () =>
          '\u{1f4e9} **\u4eca\u65e5\u6c11\u4fd3\u8fd0\u52bf**\n\n' + this.folk.getShortFortune()) },
      { name: 'night', hour: 0, minute: 0,
        handler: async () => this.broadcast(scheduleGroups, '\u665a', () =>
          this.greeting.getGreeting('night')) },
    ] : [];

    this.scheduleNextChatter();

    this.timer = setInterval(() => {
      if (hasScheduleTasks) {
        this.checkScheduledTasks(tasks);
      }
      this.checkRandomChatter();
    }, 1000);

    if (hasScheduleTasks) {
      logger.info(
        `\u{1F553} \u5b9a\u65f6\u8c03\u5ea6\u5df2\u542f\u52a8: 08:00(\u65e0) 12:00(\u5348) 21:00(\u8fd0) 00:00(\u665a)` +
        `\n   \u76ee\u6807\u7fa4: ${scheduleGroups.join(', ')}`
      );
    } else {
      logger.info(
        `\u{1F553} \u5b9a\u65f9\u4efb\u52a1\u672a\u914d\u7f6e(SCHEDULE_GROUPS\u4e3a\u7a7a), ` +
        `\u53ea\u542f\u7528 AI \u63d2\u804a\u529f\u80fd`
      );
    }

    logger.info(
      `\u{1f4ac} AI\u63d2\u804a\u5df2\u542f\u7528:` +
      `\n   \u95f4\u9694: ${CHATTER_MIN_INTERVAL/60}-${CHATTER_MAX_INTERVAL/60}\u5206\u949f` +
      `\n   \u6982\u7387: ${CHATTER_PROBABILITY}% (\u4ec5\u5728\u7fa4\u6d3b\u8dc3\u65f6)` +
      `\n   \u6d3b\u8dc0\u7a97\u53e3: \u6700\u8fd1${ACTIVITY_WINDOW_SEC/60}\u5206\u949f\u6709\u4eba\u804a\u5929`
    );
  }

  stop(): void {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
      logger.info('\u{1F553} \u5B9A\u65F6\u8C03\u5EA6\uDF50\u505C\u6B62');
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
          logger.error({ err, task: task.name }, '\u5B9A\u65F6\u4EFB\u52A1\u6267\u884C\u5931\u8D25');
        });
      }
    }
  }

  // ===== AI 智能随机插聊 =====

  private scheduleNextChatter(): void {
    const interval = CHATTER_MIN_INTERVAL +
      Math.floor(Math.random() * (CHATTER_MAX_INTERVAL - CHATTER_MIN_INTERVAL));
    this.nextChatterTime = Date.now() + interval * 1000;
  }

  /**
   * 检查是否该插聊了
   *
   * 核心逻辑:
   * 1. 时间到了吗?
   * 2. 有活跃的群吗?
   * 3. **群活跃吗?** (最近3分钟有人说话) ← 关键！
   * 4. 概率判定
   */
  private async checkRandomChatter(): Promise<void> {
    if (Date.now() < this.nextChatterTime) return;
    if (this.chattering) return;

    const h = new Date().getHours();
    if (h < 7 || h >= 24) return; // 太早/太晚不打扰

    // 找出当前活跃的群 (最近 N 秒内有人说话的群)
    const activeChatterGroups = this.getActiveChatterGroups();
    if (activeChatterGroups.length === 0) {
      // 没有任何群在活跃聊天 → 不插话，重新安排下次
      this.scheduleNextChatter();
      return;
    }

    // 概率判定
    if (Math.random() * 100 > CHATTER_PROBABILITY) {
      this.scheduleNextChatter();
      return;
    }

    // 标记中
    this.chattering = true;

    try {
      // 随机选一个提示词
      const prompt = CHATTER_PROMPTS[
        Math.floor(Math.random() * CHATTER_PROMPTS.length)
      ];

      // 调用 AI 生成插聊内容
      const msg = await this.ai.chat(prompt, [], {
        isPersonalMode: false,
      });

      if (!msg || !msg.trim()) {
        this.scheduleNextChatter();
        return;
      }

      // 从活跃群中随机选一个发
      const targetGroup = activeChatterGroups[
        Math.floor(Math.random() * activeChatterGroups.length)
      ];

      await this.onebot.sendGroupMsg(targetGroup, msg.trim());
      logger.info(
        `\u{1f4ac} [AI\u63d2\u804a] -> \u7fa4${targetGroup}: ` +
        msg.trim().substring(0, 50).replace(/\n/g, '\\')
      );
    } catch (err) {
      logger.error({ err }, 'AI\u63d2\u804a\u751f\u6210\u5931\u8d25');
    } finally {
      this.chattering = false;
      this.scheduleNextChatter();
    }
  }

  /**
   * 获取当前正在活跃聊天的群列表
   * 判断标准: 最近 ACTIVITY_WINDOW_SEC 秒内有真人消息
   */
  private getActiveChatterGroups(): number[] {
    const now = Date.now();
    const windowMs = ACTIVITY_WINDOW_SEC * 1000;
    const result: number[] = [];

    for (const [groupId, lastActivityTime] of this.groupLastActivity) {
      if (now - lastActivityTime <= windowMs) {
        result.push(groupId);
      }
    }

    return result;
  }

  /**
   * 获取所有已知群 (用于定时广播等)
   */
  private getAvailableGroups(): number[] {
    if (config.scheduleGroups && config.scheduleGroups.length > 0) {
      return config.scheduleGroups;
    }
    return Array.from(this.activeGroups);
  }

  /**
   * 广播消息
   */
  private async broadcast(
    groups: number[],
    type: string,
    getMessage: () => string
  ): Promise<void> {
    const message = getMessage();

    for (const groupId of groups) {
      try {
        await this.onebot.sendGroupMsg(groupId, message);
        logger.info(
          `\u{1f4ac} [\u5b9a\u65f6}${type}] -> ${groupId}: ` +
          message.substring(0, 40).replace(/\n/g, ' ') + '...'
        );
      } catch (err) {
        logger.error({ err, groupId }, `\u5e7f\u64ad${type}\u6d88\u606f\u5931\u8d25`);
      }
    }
  }

  destroy(): void {
    this.stop();
  }
}
