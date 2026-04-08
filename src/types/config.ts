import dotenv from 'dotenv';

dotenv.config();

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
  ttsVoice: process.env.TTS_VOICE || 'zh-CN-XiaoyiNeural',
  ttsSpeed: parseInt(process.env.TTS_SPEED || '4', 10),

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

  // 日志
  logLevel: (process.env.LOG_LEVEL || 'info') as 'debug' | 'info' | 'warn' | 'error',
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
