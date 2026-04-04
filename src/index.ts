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

  // 初始化服务
  const onebotClient = new OneBotClient();
  const codebuddyClient = new CodeBuddyClient();
  const sessionManager = new SessionManager();

  // 创建消息处理器
  const handler = new MessageHandler(
    onebotClient,
    codebuddyClient,
    sessionManager
  );

  // 注册消息监听
  onebotClient.onMessage(msg => {
    handler.handle(msg).catch(error => {
      logger.error({ error }, '消息处理异常');
    });
  });

  // 连接OneBot
  try {
    await onebotClient.connect();
    logger.info('✅ QQTalker 启动成功！正在监听消息...');

    // 始终启动调度器 (AI插聊不依赖 SCHEDULE_GROUPS)
    const scheduler = new SchedulerService(onebotClient, codebuddyClient);
    
    // 把 scheduler 传给 handler，让 handler 收集活跃群号
    handler.setScheduler(scheduler);
    
    scheduler.start(config.scheduleGroups);
  } catch (error) {
    logger.error({ error }, '❌ 连接失败');
    process.exit(1);
  }

  // 优雅关闭
  process.on('SIGINT', () => shutdown(onebotClient, sessionManager));
  process.on('SIGTERM', () => shutdown(onebotClient, sessionManager));
}

function shutdown(
  onebot: OneBotClient,
  sessions: SessionManager
): void {
  logger.info('🛑 正在关闭...');
  onebot.disconnect();
  sessions.destroy();
  process.exit(0);
}

main().catch(error => {
  logger.error({ error }, '启动失败');
  process.exit(1);
});
