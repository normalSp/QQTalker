import { logger } from '../logger';
import { config } from '../types/config';

// ChatMessage 接口定义
export interface ChatMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

/** 会话模式 */
export type SessionMode = 'personal' | 'group';




interface Session {
  key: string;
  mode: SessionMode;
  groupId: number;
  userId: number;       // personal模式下有效
  messages: ChatMessage[];
  lastActive: number;
  createdAt: number;
}

/**
 * 会话管理器
 * 支持两种会话模式:
 * - group (默认): 群内共享上下文，所有人对话在同一会话中，带昵称标识
 * - personal: 每个用户独立对话（通过命令切换）
 */
export class SessionManager {
  private sessions: Map<string, Session> = new Map();
  private cleanupInterval: ReturnType<typeof setInterval> | null = null;

  // 群级会话模式覆盖：记录哪些群强制使用 personal 模式
  private forcePersonalGroups: Set<number> = new Set();

  /** 默认群模式 */
  readonly defaultMode: SessionMode = 'group';

  constructor() {
    this.cleanupInterval = setInterval(() => this.cleanup(), 5 * 60 * 1000);
  }

  /**
   * 获取 personal 模式的会话key
   */
  private getPersonalKey(groupId: number, userId: number): string {
    return `p:${groupId}:${userId}`;
  }

  /**
   * 获取 group 模式的会话key
   */
  private getGroupKey(groupId: number): string {
    return `g:${groupId}`;
  }

  /**
   * 判断当前群是否处于个人模式（即非群共享模式）
   */
  isPersonalMode(groupId: number): boolean {
    return this.forcePersonalGroups.has(groupId);
  }

  /**
   * 切换群的会话模式
   * @param groupId 群号
   * @param personal true=切换到个人模式, false=切回群模式(默认)
   */
  togglePersonalMode(groupId: number, personal: boolean): void {
    if (personal) {
      this.forcePersonalGroups.add(groupId);
      // 切到个人模式时清理群会话
      const key = this.getGroupKey(groupId);
      this.sessions.delete(key);
      logger.debug(
        '\u7FA4' + groupId + ' \u5207\u6362\u5230\u4E2A\u4EBA\u6A21\u5F0F'
      );
    } else {
      this.forcePersonalGroups.delete(groupId);
      // 切回群模式时清理个人会话（可选，这里保留个人会话）
      logger.debug(
        '\u7FA4' + groupId + ' \u5207\u6362\u5230\u7FA4\u5171\u4EAB\u6A21\u5F0F'
      );
    }
  }

  /**
   * 获取群的实际会话模式
   */
  getEffectiveMode(groupId: number): SessionMode {
    return this.isPersonalMode(groupId) ? 'personal' : this.defaultMode;
  }

  /**
   * 获取或创建会话
   */
  getOrCreateSession(
    groupId: number,
    userId: number,
    mode: SessionMode
  ): Session {
    const key = mode === 'group'
      ? this.getGroupKey(groupId)
      : this.getPersonalKey(groupId, userId);

    let session = this.sessions.get(key);
    if (!session) {
      session = {
        key,
        mode,
        groupId,
        userId: mode === 'personal' ? userId : 0,
        messages: [],
        lastActive: Date.now(),
        createdAt: Date.now(),
      };
      this.sessions.set(key, session);
    }
    
    session.lastActive = Date.now();
    return session;
  }

  /**
   * 添加消息到会话
   */
  addMessage(
    groupId: number,
    userId: number,
    message: ChatMessage,
    mode: SessionMode
  ): void {
    const session = this.getOrCreateSession(groupId, userId, mode);

    // 限制历史消息数量
    const maxMsg = config.maxHistory || 100;
    while (session.messages.length >= maxMsg) {
      session.messages.shift();
    }

    session.messages.push(message);
  }

  /**
   * 获取会话历史
   */
  getHistory(groupId: number, userId: number, mode: SessionMode): ChatMessage[] {
    const key = mode === 'group'
      ? this.getGroupKey(groupId)
      : this.getPersonalKey(groupId, userId);

    const session = this.sessions.get(key);
    return session?.messages || [];
  }

  /**
   * 清理指定模式的会话
   */
  clearSession(groupId: number, userId: number, mode: SessionMode): void {
    if (mode === 'group') {
      this.sessions.delete(this.getGroupKey(groupId));
    } else {
      this.sessions.delete(this.getPersonalKey(groupId, userId));
    }
    logger.debug(
      '\u6E05\u7406\u4F1A\u8BDD: ' +
      (mode === 'group' ? '\u7FA4[' +groupId+']' : groupId + ':' + userId)
    );
  }

  /** 清理群会话（切回个人模式等场景） */
  clearGroupSession(groupId: number): void {
    this.sessions.delete(this.getGroupKey(groupId));
    logger.debug('\u6E05\u7406\u7FA4\u4F1A\u8BDD: ' + groupId);
  }

  /**
   * 定期清理不活跃的会话（30分钟无活动）
   */
  private cleanup(): void {
    const now = Date.now();
    const expireTime = 30 * 60 * 1000; // 30分钟
    
    for (const [key, session] of this.sessions.entries()) {
      if (now - session.lastActive > expireTime) {
        this.sessions.delete(key);
        logger.debug('\u6E05\u7406\u8FC7\u671F\u4F1A\u8BDD: ' + key);
      }
    }
  }

  destroy(): void {
    if (this.cleanupInterval) {
      clearInterval(this.cleanupInterval);
      this.cleanupInterval = null;
    }
  }
}
