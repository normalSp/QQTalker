import pino from 'pino';
import { validateConfig, config } from './types/config';
import { OneBotClient } from './services/onebot-client';
import { CodeBuddyClient } from './services/codebuddy-client';
import { SessionManager } from './services/session-manager';
import { MessageHandler } from './handlers/message-handler';
import { SchedulerService } from './services/scheduler-service';

const logger = pino({ level: config.logLevel });

/**
 * QQTalker - QQ聊天机器人主程序
 */
async function main(): Promise<void> {
  logger.info('🤖 QQTalker 启动中...');
  
  // 验证配置（内部会打印AI信息）
  validateConfig();
  
  logger.info(`   OneBot: ${config.wsUrl}`);
  logger.info(`   @触发: ${config.atTrigger ? '开启' : '关闭'}`);

  // \u521D\u59CB\u5316\u670d\u52a1
  const onebotClient = new OneBotClient();
  const codebuddyClient = new CodeBuddyClient();
  const sessionManager = new SessionManager();

  // \u521b\u5efa\u6d88\u606f\u5904\u7406\u5668
  const handler = new MessageHandler(
    onebotClient,
    codebuddyClient,
    sessionManager
  );

  // \u6ce8\u518c\u6d88\u606f\u76d1\u542c
  onebotClient.onMessage(msg => {
    handler.handle(msg).catch(error => {
      logger.error({ error }, '\u6d88\u606f\u5904\u7406\u5f02\u5e38');
    });
  });

  // \u8fde\u63a5OneBot
  try {
    await onebotClient.connect();
    logger.info('\u2705 QQTalker \u542f\u52a8\u6210\u529f\uff01\u6b63\u5728\u76d1\u542c\u6d88\u606f...');

    // \u542f\u52a8\u5b9a\u65f6\u4efb\u52a1
    if (config.scheduleGroups.length > 0) {
      const scheduler = new SchedulerService(onebotClient, codebuddyClient);
      scheduler.start(config.scheduleGroups);
    } else {
      logger.info(
        '\u{1f553} \u5b9a\u65f6\u4efb\u52a1\u672a\u542f\u52a8: ' +
        '\u5728 .env \u4e2d\u8bbe\u7f6e SCHEDULE_GROUPS=7xxxx,8xxxx \u53ef\u542f\u7528'
      );
    }
  } catch (error) {
    logger.error({ error }, '\u274c \u8fde\u63a5\u5931\u8d25');
    process.exit(1);
  }

  // \u4f18\u96c5\u5173\u95ed
  process.on('SIGINT', () => shutdown(onebotClient, sessionManager));
  process.on('SIGTERM', () => shutdown(onebotClient, sessionManager));
}

function shutdown(
  onebot: OneBotClient,
  sessions: SessionManager
): void {
  logger.info('\ud83d\ude1f \u6b63\u5728\u5173\u95ed...');
  onebot.disconnect();
  sessions.destroy();
  process.exit(0);
}

main().catch(error => {
  logger.error({ error }, '启动失败');
  process.exit(1);
});
