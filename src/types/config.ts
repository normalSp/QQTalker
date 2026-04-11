import dotenv from 'dotenv';

dotenv.config();

function parseCsvEnv(value: string | undefined): string[] {
  if (!value) return [];
  return value
    .split(',')
    .map(item => item.trim())
    .filter(Boolean);
}

function parseMapEnv(value: string | undefined, pairSeparator = ',', kvSeparator = ':'): Record<string, string> {
  if (!value) return {};
  return value
    .split(pairSeparator)
    .map(item => item.trim())
    .filter(Boolean)
    .reduce<Record<string, string>>((acc, item) => {
      const index = item.indexOf(kvSeparator);
      if (index <= 0) return acc;
      const key = item.slice(0, index).trim();
      const mappedValue = item.slice(index + kvSeparator.length).trim();
      if (key && mappedValue) {
        acc[key] = mappedValue;
      }
      return acc;
    }, {});
}

function parseNumberCsvEnv(value: string | undefined): number[] {
  return parseCsvEnv(value)
    .map((item) => Number(item))
    .filter((item) => Number.isFinite(item) && item > 0);
}

export const config = {
  // OneBot WebSocket
  wsUrl: process.env.WS_URL || 'ws://127.0.0.1:8080',
  accessToken: process.env.ACCESS_TOKEN || '',
  
  // AI API (支持任何OpenAI兼容接口)
  aiApiKey: process.env.AI_API_KEY || process.env.CODEBUDDY_API_KEY || '',
  aiBaseUrl: process.env.AI_BASE_URL || process.env.CODEBUDDY_BASE_URL || 'https://api.deepseek.com/v1',
  aiModel: process.env.AI_MODEL || process.env.CODEBUDDY_MODEL || 'deepseek-chat',
  
  // Bot 配置
  botQq: parseInt(process.env.BOT_QQ || '0', 10),
  botNickname: process.env.BOT_NICKNAME || '',
  atTrigger: process.env.AT_TRIGGER !== 'false',
  groupWhitelist: process.env.GROUP_WHITELIST
    ? process.env.GROUP_WHITELIST.split(',').map(Number)
    : [],
  
  // TTS语音配置
  ttsEnabled: process.env.TTS_ENABLED === 'true',
  ttsProvider: process.env.TTS_PROVIDER || 'local-http',
  ttsServiceUrl: process.env.TTS_SERVICE_URL || 'http://127.0.0.1:8765',
  ttsBackend: process.env.TTS_BACKEND || 'gpt-sovits',
  ttsModel: process.env.TTS_MODEL || '',
  ttsModelDir: process.env.TTS_MODEL_DIR || './data/voice-models',
  ttsVoice: process.env.TTS_VOICE || 'zh-CN-XiaoyiNeural',
  ttsSpeed: parseFloat(process.env.TTS_SPEED || '1.0'),
  ttsReplyMode: (process.env.TTS_REPLY_MODE || 'mention-only') as 'mention-only' | 'all-replies',
  ttsStyle: process.env.TTS_STYLE || 'natural',
  ttsSanitizeWhitelist: process.env.TTS_SANITIZE_WHITELIST || '',
  ttsSanitizeBlacklist: process.env.TTS_SANITIZE_BLACKLIST || '',
  ttsPreviewText: process.env.TTS_PREVIEW_TEXT || '你好呀，欢迎使用 QQTalker 的语音播报插件。',
  ttsTimeoutMs: parseInt(process.env.TTS_TIMEOUT_MS || '45000', 10),
  ttsFallbackToBaidu: process.env.TTS_FALLBACK_TO_BAIDU !== 'false',
  ttsRuntimePolicy: process.env.TTS_RUNTIME_POLICY || 'model-default',
  ttsFallbackChain: parseCsvEnv(process.env.TTS_FALLBACK_CHAIN || 'edge-tts,legacy-baidu'),
  ttsLongTextPreferredBackend: process.env.TTS_LONG_TEXT_PREFERRED_BACKEND || 'gpt-sovits',
  ttsLongTextThreshold: parseInt(process.env.TTS_LONG_TEXT_THRESHOLD || '72', 10),
  ttsRvcShortTextMaxLength: parseInt(process.env.TTS_RVC_SHORT_TEXT_MAX_LENGTH || '28', 10),
  ttsExperimentalRvcEnabled: process.env.TTS_EXPERIMENTAL_RVC_ENABLED === 'true',
  ttsDefaultCharacter: process.env.TTS_DEFAULT_CHARACTER || '',
  ttsCharacterModelMap: parseMapEnv(process.env.TTS_CHARACTER_MODEL_MAP),
  ttsGroupVoiceRoleMap: parseMapEnv(process.env.TTS_GROUP_VOICE_ROLE_MAP),

  // STT语音识别配置（语音消息转文字）
  // 默认使用 SiliconFlow 的 SenseVoice（免费，中文效果好）
  // 如用 OpenAI Whisper: STT_BASE_URL=https://api.openai.com/v1  STT_MODEL=whisper-1
  sttEnabled: process.env.STT_ENABLED === 'true',
  sttBaseUrl: process.env.STT_BASE_URL || '',          // 留空默认用 SiliconFlow
  sttApiKey: process.env.STT_API_KEY || '',            // 留空默认复用 AI_API_KEY
  sttModel: process.env.STT_MODEL || 'FunAudioLLM/SenseVoiceSmall',
  
  // 会话配置
  maxHistory: parseInt(process.env.MAX_HISTORY || '100', 10),

  // 定时任务配置 - 定时发送早安/午安/运势/晚安的群号列表（逗号分隔）
  scheduleGroups: process.env.SCHEDULE_GROUPS
    ? process.env.SCHEDULE_GROUPS.split(',').map(Number)
    : [],

  // Astrbot 转发配置 - 目标 Astrbot 机器人QQ号
  astrbotQq: parseInt(process.env.ASTRBOT_QQ || '0', 10),
  astrbotEnabledComplexTasks: process.env.ASTRBOT_ENABLED_COMPLEX_TASKS === 'true',
  astrbotComplexTaskKeywords: parseCsvEnv(
    process.env.ASTRBOT_COMPLEX_TASK_KEYWORDS || '分析,总结,规划,排查,设计,方案,roadmap'
  ),
  astrbotComplexTaskGroupAllowlist: parseNumberCsvEnv(process.env.ASTRBOT_COMPLEX_TASK_GROUP_ALLOWLIST),
  astrbotComplexTaskGroupDenylist: parseNumberCsvEnv(process.env.ASTRBOT_COMPLEX_TASK_GROUP_DENYLIST),
  astrbotComplexTaskGroupRouteOverrides: parseMapEnv(process.env.ASTRBOT_COMPLEX_TASK_GROUP_ROUTE_OVERRIDES),
  astrbotComplexTaskMinLength: parseInt(process.env.ASTRBOT_COMPLEX_TASK_MIN_LENGTH || '48', 10),
  astrbotComplexTaskMessageMaxChars: parseInt(process.env.ASTRBOT_COMPLEX_TASK_MESSAGE_MAX_CHARS || '360', 10),
  astrbotTimeoutMs: parseInt(process.env.ASTRBOT_TIMEOUT_MS || '45000', 10),
  astrbotFallbackToLocal: process.env.ASTRBOT_FALLBACK_TO_LOCAL !== 'false',

  // 日志
  logLevel: (process.env.LOG_LEVEL || 'info') as 'debug' | 'info' | 'warn' | 'error',

  // 插件
  pluginPaths: process.env.PLUGIN_PATHS
    ? process.env.PLUGIN_PATHS.split(',').map(item => item.trim()).filter(Boolean)
    : [],

  selfLearning: {
    enabled: process.env.SELF_LEARNING_ENABLED !== 'false',
    dataDir: process.env.SELF_LEARNING_DATA_DIR || './data/self-learning',
    targetQqList: process.env.SELF_LEARNING_TARGETS
      ? process.env.SELF_LEARNING_TARGETS.split(',').map(item => item.trim()).filter(Boolean)
      : [],
    targetBlacklist: process.env.SELF_LEARNING_BLACKLIST
      ? process.env.SELF_LEARNING_BLACKLIST.split(',').map(item => item.trim()).filter(Boolean)
      : [],
    minMessagesForLearning: parseInt(process.env.SELF_LEARNING_MIN_MESSAGES || '30', 10),
    maxMessagesPerBatch: parseInt(process.env.SELF_LEARNING_MAX_BATCH || '200', 10),
    learningIntervalHours: parseInt(process.env.SELF_LEARNING_INTERVAL_HOURS || '6', 10),
    messageMinLength: parseInt(process.env.SELF_LEARNING_MESSAGE_MIN || '2', 10),
    messageMaxLength: parseInt(process.env.SELF_LEARNING_MESSAGE_MAX || '500', 10),
    defaultMood: process.env.SELF_LEARNING_DEFAULT_MOOD || 'curious',
    enableMlAnalysis: process.env.SELF_LEARNING_ENABLE_ML !== 'false',
    maxMlSampleSize: parseInt(process.env.SELF_LEARNING_MAX_ML_SAMPLE || '120', 10),
    totalAffectionCap: parseInt(process.env.SELF_LEARNING_TOTAL_AFFECTION_CAP || '250', 10),
    maxUserAffection: parseInt(process.env.SELF_LEARNING_MAX_USER_AFFECTION || '100', 10),
    dbType: (process.env.SELF_LEARNING_DB_TYPE || 'sqlite') as 'sqlite' | 'mysql' | 'postgres',
    dbFile: process.env.SELF_LEARNING_DB_FILE || './data/self-learning/self-learning.sqlite',
    mysqlUrl: process.env.SELF_LEARNING_MYSQL_URL || '',
    postgresUrl: process.env.SELF_LEARNING_POSTGRES_URL || '',
  },
} as const;

// 启动时验证必要配置
export function validateConfig(): void {
  if (!config.aiApiKey) {
    console.error('❌ 缺少 AI_API_KEY 环境变量');
    console.error('');
    console.error('请在 .env 文件中配置 AI API Key：');
    console.error('  - DeepSeek: https://platform.deepseek.com/api_keys (推荐)');
    console.error('  - OpenAI:   https://platform.openai.com/api-keys');
    console.error('');
    process.exit(1);
  }
  if (!config.botQq) {
    console.warn('⚠️  未设置 BOT_QQ，将无法正确过滤@消息');
  }
  
  console.log(`   AI API: ${config.aiBaseUrl}`);
  console.log(`   模型:   ${config.aiModel}`);
}
