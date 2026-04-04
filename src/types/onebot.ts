import { config } from './config';

/**
 * OneBot v11 消息类型定义
 */
export interface OneBotMessage {
  post_type: 'message' | 'notice' | 'request' | 'meta_event';
  message_type: 'group' | 'private';
  sub_type?: string;
  message_id: number;
  group_id?: number;
  user_id: number;
  raw_message: string;
  message: MessageSegment[];
  self_id: number;
  time: number;
}

export interface MessageSegment {
  type: 'text' | 'at' | 'image' | 'reply' | 'face' | string;
  data?: Record<string, string>;
}

export interface GroupMessage extends OneBotMessage {
  post_type: 'message';
  message_type: 'group';
  group_id: number;
  anonymous?: any;
  sender: {
    user_id: number;
    nickname: string;
    card: string;
    role: 'owner' | 'admin' | 'member';
  };
}

/**
 * API 响应类型
 */
export interface SendGroupMsgResponse {
  status: boolean;
  retcode: number;
  data: {
    message_id: number;
  };
}

export interface ApiResponse<T = any> {
  status: boolean;
  retcode: number;
  data: T;
  echo?: number;
}

/**
 * 判断消息是否@了机器人
 * 支持两种格式：
 * 1. CQ at 码: {"type":"at","data":{"qq":"1802647053"}}
 * 2. 纯文本 @: "@昵称" 或 "@QQ号"
 */
export function isAtBot(msg: OneBotMessage): boolean {
  if (msg.message_type !== 'group') return false;

  // 方式1: CQ at 码
  const hasCqAt = msg.message.some(
    seg => seg.type === 'at' && seg.data?.qq === String(config.botQq)
  );
  if (hasCqAt) return true;

  // 方式2: 纯文本 @（QQ号 或 昵称）
  const rawText = msg.raw_message.toLowerCase();
  const botNick = (config.botNickname || '').toLowerCase();
  return rawText.includes(`@${config.botQq}`) ||
         (botNick.length > 0 && rawText.includes(`@${botNick}`));
}

/**
 * 提取纯文本内容（去掉@部分）
 */
export function extractTextContent(msg: OneBotMessage): string {
  return msg.message
    .filter(seg => seg.type === 'text')
    .map(seg => seg.data?.text || '')
    .join(' ')
    .trim();
}

/**
 * 格式化发送消息（CQ码）
 */
export function formatAtText(qq: number, text: string): string {
  return `[CQ:at,qq=${qq}] ${text}`;
}

/**
 * 格式化语音消息（CQ码，base64编码）
 */
export function formatRecord(audioBase64: string): string {
  return `[CQ:record,file=base64://${audioBase64}]`;
}
