import pino from 'pino';
import { config } from '../types/config';
import { OneBotClient } from './onebot-client';
import { CodeBuddyClient } from './codebuddy-client';
import { GreetingService } from './greeting-service';
import { FolkDivinationService } from './folk-divination';

const logger = pino({ level: config.logLevel });

/** \u5B9A\u65F6\u4EFB\u52A1\u914D\u7F6E */
interface ScheduledTask {
  name: string;
  hour: number;
  minute: number;
  handler: () => Promise<void>;
}

/** \u4E3B\u52A8\u53D1\u8A00\u7684\u95F4\u9694(\u79D2) - \u968F\u673A\u8303\u56F4 */
const CHATTER_MIN_INTERVAL = 60;    // 1\u5206\u949F
const CHATTER_MAX_INTERVAL = 300;   // 5\u5206\u949F

/** \u5230\u65F6\u95F4\u540E\u53D1\u8A00\u6982\u7387(0-100) */
const CHATTER_PROBABILITY = 70;     // 70%

/** AI\u63D0\u793A\u8BCD - \u8BA9AI\u751F\u6210\u81ea\u7136\u7684\u63D2\u804A */
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
  '\u751F\u6210\u4E00\u53E5\u81EA\u7136\u7684\u3001\u77ed\u5C0F\u7684\uFF08\u4E0D\u898130\u4EBA\u4E0D\u63D0\u95EE\uFF09\u8BDD\u8BED\uFF0C\u52A0\u55B5~' +
  '\u76F4\u63A5\u8F93\u51FA\u5185\u5BB9\u3002',

  '\u4F60\u662FClaw\u732B\u5A18~ QQ\u7FA4\u91CC\u5927\u5BB6\u5728\u804A\u5929\uFF0C\u4F60\u7A81\u7136\u60F3\u5230\u4E86\u4EC0\u4E48\u6709\u8DA3\u7684\u4E8B\u3002' +
  '\u8BF4\u4E00\u53E5\u5427\uFF01\u77ED\u5C0F\uFF0C\u81EA\u7136\uFF0C\u4E0D@人不提问\uFF0C\u52A0\u55B5~ \u76F4\u63A5\u8F93\u51FA\u3002',
];

/**
 * \u5B9A\u65F6\u8C03\u5EA6\u5668 + AI\u968F\u673A\u63D2\u804A
 *
 * \u5B9A\u65F6\u4EFB\u52A1:
 * - 08:00 \u65E9\u5B89 (\u52A0\u6CB9)
 * - 12:00 \u5348\u95F2 (\u63D0\u9192\u5403\u996D)
 * - 21:00 \u8FD0\u52BF ( \u6C11\u4FD3 )
 * - 00:00 \u665A\u5B89 ( \u7761\u89C9 )
 *
 * AI\u968F\u673A\u63D2\u804A:
 * - 08:00-23:59 \u671F\u95F4\uFF0C\u6BCF 1-5 \u5206\u949F\u68C0\u67E5\u4E00\u6B21
 * - 70% \u6982\u7387\u89E6\u53D1 AI \u751F\u6210\u63D2\u804A\u5185\u5BB9
 * - AI\u751F\u6210\u7684\u5185\u5BB9\u66F4\u81EA\u7136\u3001\u66F4\u6709\u8DA3
 */
export class SchedulerService {
  private onebot: OneBotClient;
  private ai: CodeBuddyClient;
  private greeting: GreetingService;
  private folk: FolkDivinationService;
  private timer: ReturnType<typeof setInterval> | null = null;
  private lastExecutedDates: Map<string, string> = new Map();

  /** \u4E0B\u6B21\u53EF\u63D2\u804A\u65F6\u95F4 */
  private nextChatterTime = 0;

  /** \u6B63\u5728\u8FDB\u884C\u4E2D\u7684\u63D2\u804A\uFF0C\u9632\u6B62\u5E76\u53D1 */
  private chattering = false;

  constructor(onebot: OneBotClient, ai: CodeBuddyClient) {
    this.onebot = onebot;
    this.ai = ai;
    this.greeting = new GreetingService();
    this.folk = new FolkDivinationService();
  }

  start(targetGroups: number[]): void {
    if (!targetGroups || targetGroups.length === 0) {
      logger.warn('\u6CA1\u6709\u914D\u7F6E\u76EE\u6807\u7FA4\uFF0C\u5B9A\u65F6\u4EFB\u52A1\u4E0D\u4F1A\u542F\u52A8');
      return;
    }

    const tasks: ScheduledTask[] = [
      { name: 'morning', hour: 8, minute: 0,
        handler: async () => this.broadcast(targetGroups, '\u65e9', () =>
          this.greeting.getGreeting('morning')) },
      { name: 'noon', hour: 12, minute: 0,
        handler: async () => this.broadcast(targetGroups, '\u5348', () =>
          this.greeting.getGreeting('noon')) },
      { name: 'fortune', hour: 21, minute: 0,
        handler: async () => this.broadcast(targetGroups, '\u8fd0', () =>
          '\u{1f4e9} **\u4eca\u65e5\u6c11\u4fd3\u8fd0\u52bf**\n\n' + this.folk.getShortFortune()) },
      { name: 'night', hour: 0, minute: 0,
        handler: async () => this.broadcast(targetGroups, '\u665a', () =>
          this.greeting.getGreeting('night')) },
    ];

    this.scheduleNextChatter();

    this.timer = setInterval(() => {
      this.checkScheduledTasks(tasks);
      this.checkRandomChatter(targetGroups);
    }, 1000);

    const chatterInfo =
      `\n   \u{1f4ac} AI\u63d2\u804a: ${CHATTER_MIN_INTERVAL/60}-${CHATTER_MAX_INTERVAL/60}\u5206\u949f/\u6b21, ` +
      `\u6982\u7387${CHATTER_PROBABILITY}%`;

    logger.info(
      '\u{1F553} \u5b9a\u65f6\u8c03\u5ea6\u5df2\u542f\u52a8: 08:00(\u65e9) 12:00(\u5348) 21:00(\u8fd0) 00:00(\u665a)' +
      chatterInfo + ' (AI\u9A71\u52A8)' +
      '\n   \u76ee\u6807\u7fa4: ' + targetGroups.join(', ')
    );
  }

  stop(): void {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
      logger.info('\u{1F553} \u5B9A\u65F6\u8C03\u5EA6\u5DF2\u505C\u6B62');
    }
  }

  // ===== \u5B9A\u65F6\u4EFB\u52A1 =====

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

  // ===== AI \u968F\u673A\u63D2\u804A =====

  private scheduleNextChatter(): void {
    const interval = CHATTER_MIN_INTERVAL +
      Math.floor(Math.random() * (CHATTER_MAX_INTERVAL - CHATTER_MIN_INTERVAL));
    this.nextChatterTime = Date.now() + interval * 1000;
  }

  private async checkRandomChatter(groups: number[]): Promise<void> {
    if (Date.now() < this.nextChatterTime) return;
    if (this.chattering) return;

    const h = new Date().getHours();
    if (h < 8 || h >= 24) return; // \u591C\u6DF1\u4E0D\u6253\u6270

    // \u6982\u7387\u5224\u5B9A
    if (Math.random() * 100 > CHATTER_PROBABILITY) {
      this.scheduleNextChatter();
      return;
    }

    // \u6807\u8BB0\u4E2D
    this.chattering = true;

    try {
      // \u968F\u673A\u9009\u4E00\u4E2A\u63D0\u793A\u8BCD
      const prompt = CHATTER_PROMPTS[
        Math.floor(Math.random() * CHATTER_PROMPTS.length)
      ];

      // \u8C03\u7528 AI \u751F\u6210\u63D2\u804A\u5185\u5BB9
      const msg = await this.ai.chat(prompt, [], {
        isPersonalMode: false,
      });

      if (!msg || !msg.trim()) {
        this.scheduleNextChatter();
        return;
      }

      // \u968F\u673A\u9009\u4E00\u4E2A\u7FA4
      const targetGroup = groups[Math.floor(Math.random() * groups.length)];

      await this.onebot.sendGroupMsg(targetGroup, msg.trim());
      logger.info(
        `\u{1f4ac} [AI\u63d2\u804a] -> ${targetGroup}: ` +
        msg.substring(0, 40).replace(/\n/g, ' ') + '...'
      );
    } catch (err) {
      logger.error({ err }, 'AI\u63d2\u804a\u751f\u6210\u5931\u8d25');
    } finally {
      this.chattering = false;
      // \u5B89\u6392\u4E0B\u4E00\u6B21
      this.scheduleNextChatter();
    }
  }

  /**
   * \u5E7F\u64AD\u6D88\u606F
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
