import { logger } from './logger';
import { validateConfig, config } from './types/config';
import { OneBotClient } from './services/onebot-client';
import { CodeBuddyClient } from './services/codebuddy-client';
import { SessionManager } from './services/session-manager';
import { MessageHandler } from './handlers/message-handler';
import { SchedulerService } from './services/scheduler-service';
import { DashboardService } from './services/dashboard-service';
import { BlockService } from './services/block-service';
import { WelcomeService } from './services/welcome-service';
import { setupConsoleAndAnalyzer, setupGlobalShortcuts } from './start-with-console';
import { PluginManager } from './plugins/plugin-manager';
import { SelfLearningPlugin } from './plugins/self-learning/self-learning-plugin';




/**
 * QQTalker - QQ聊天机器人主程序
 */
async function main(): Promise<void> {
  // 设置控制台和日志分析器
  setupConsoleAndAnalyzer();
  setupGlobalShortcuts();
  logger.info('🤖 QQTalker 启动中...');
  
  // 验证配置（内部会打印AI信息）
  validateConfig();
  
  logger.info(`   OneBot: ${config.wsUrl}`);
  logger.info(`   @触发: ${config.atTrigger ? '开启' : '关闭'}`);

  // 初始化服务
  const onebotClient = new OneBotClient();
  const codebuddyClient = new CodeBuddyClient();
  const sessionManager = new SessionManager();
  const blockService = new BlockService();
  const dashboard = new DashboardService();
  const pluginManager = new PluginManager();
  dashboard.setOneBotClient(onebotClient);
  dashboard.setBlockService(blockService);

  // 创建消息处理器
  const handler = new MessageHandler(
    onebotClient,
    codebuddyClient,
    sessionManager
  );

  // 将 dashboard 注入 handler 用于统计埋点
  handler.setDashboard(dashboard);
  handler.setBlockService(blockService);
  handler.setPluginManager(pluginManager);

  if (config.selfLearning.enabled) {
    pluginManager.register(new SelfLearningPlugin());
  }
  await pluginManager.loadExternalPlugins();
  await pluginManager.initialize({
    onebot: onebotClient,
    aiClient: codebuddyClient,
    sessions: sessionManager,
    dashboard,
    dataDir: process.cwd(),
  });
  dashboard.registerRoutes(pluginManager.getDashboardRoutes());

  // 注册消息监听
  onebotClient.onMessage(msg => {
    dashboard.recordMessage();
    handler.handle(msg).catch(error => {
      logger.error({ error }, '消息处理异常');
      dashboard.recordError(error instanceof Error ? error.message : String(error));
    });
  });

  // 注册通知事件监听（群成员入群欢迎等）
  const welcomeService = new WelcomeService(onebotClient);
  onebotClient.onNotice(async (notice) => {
    if (notice.notice_type === 'group_increase') {
      try {
        await welcomeService.handleGroupIncrease({
          group_id: notice.group_id,
          user_id: notice.user_id,
          sub_type: notice.sub_type,
          operator_id: notice.operator_id,
        });
      } catch (error) {
        logger.warn({ error }, '处理入群通知失败');
      }
    }
  });

  // 连接OneBot
  try {
    await onebotClient.connect();
    
    // 更新 dashboard 连接状态
    dashboard.updateConnectionStatus(true, onebotClient.getReconnectCount?.() ?? 0);
    
    logger.info('✅ QQTalker 启动成功！正在监听消息...');

    // 始终启动调度器 (AI插聊不依赖 SCHEDULE_GROUPS)
    const scheduler = new SchedulerService(onebotClient, codebuddyClient, sessionManager);
    
    // 把 scheduler 传给 handler，让 handler 收集活跃群号
    handler.setScheduler(scheduler);
    
    // 将 dashboard 注入 scheduler 用于活跃群统计
    scheduler.setDashboard(dashboard);
    
    scheduler.start(config.scheduleGroups);

    // 启动 Dashboard 控制台
    await dashboard.start();
  } catch (error) {
    logger.error({ error }, '❌ 连接失败');
    process.exit(1);
  }

  // 优雅关闭
  process.on('SIGINT', () => void shutdown(onebotClient, sessionManager, dashboard, blockService, pluginManager));
  process.on('SIGTERM', () => void shutdown(onebotClient, sessionManager, dashboard, blockService, pluginManager));
}

async function shutdown(
  onebot: OneBotClient,
  sessions: SessionManager,
  dashboard?: DashboardService,
  blockService?: BlockService,
  pluginManager?: PluginManager,
): Promise<void> {
  logger.info('🛑 正在关闭...');
  dashboard?.stop();
  blockService?.destroy();
  await pluginManager?.dispose();
  onebot.disconnect();
  sessions.destroy();
  process.exit(0);
}

main().catch(error => {
  logger.error({ error }, '启动失败');
  process.exit(1);
});
