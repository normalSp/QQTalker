import fs from 'fs';
import path from 'path';
import { logger } from '../logger';

/** 屏蔽记录 */
export interface BlockEntry {
  userId: number;
  nickname: string;
  groupId: number;
  blockedAt: number;
  reason: string;
}

/** 屏蔽服务 - 管理用户/群屏蔽列表 */
export class BlockService {
  private blockedUsers: Map<string, BlockEntry> = new Map(); // key: `${groupId}:${userId}`
  private blockedGroups: Set<number> = new Set();
  private filePath: string;
  private saveInterval: ReturnType<typeof setInterval> | null = null;

  constructor() {
    this.filePath = path.resolve(process.cwd(), 'data', 'blocklist.json');
    this.load();
    // 每 60 秒自动持久化
    this.saveInterval = setInterval(() => this.save(), 60 * 1000);
  }

  /** 屏蔽 key 生成 */
  private key(groupId: number, userId: number): string {
    return `${groupId}:${userId}`;
  }

  /** 加载持久化数据 */
  private load(): void {
    try {
      if (fs.existsSync(this.filePath)) {
        const raw = fs.readFileSync(this.filePath, 'utf-8');
        const data = JSON.parse(raw);
        if (data.blockedUsers) {
          for (const entry of data.blockedUsers) {
            this.blockedUsers.set(this.key(entry.groupId, entry.userId), entry);
          }
        }
        if (data.blockedGroups) {
          this.blockedGroups = new Set(data.blockedGroups);
        }
        logger.info(`[屏蔽] 已加载: ${this.blockedUsers.size} 个用户屏蔽, ${this.blockedGroups.size} 个群屏蔽`);
      }
    } catch (err) {
      logger.warn({ err }, '[屏蔽] 加载屏蔽列表失败，使用空列表');
    }
  }

  /** 持久化到文件 */
  save(): void {
    try {
      const dir = path.dirname(this.filePath);
      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
      }
      const data = {
        blockedUsers: Array.from(this.blockedUsers.values()),
        blockedGroups: Array.from(this.blockedGroups),
      };
      fs.writeFileSync(this.filePath, JSON.stringify(data, null, 2), 'utf-8');
    } catch (err) {
      logger.warn({ err }, '[屏蔽] 保存屏蔽列表失败');
    }
  }

  /** 屏蔽用户 */
  blockUser(userId: number, groupId: number, nickname: string, reason: string = ''): BlockEntry {
    const entry: BlockEntry = {
      userId,
      nickname,
      groupId,
      blockedAt: Date.now(),
      reason,
    };
    this.blockedUsers.set(this.key(groupId, userId), entry);
    this.save();
    logger.info(`[屏蔽] 用户 ${nickname}(${userId}) 在群 ${groupId} 被屏蔽`);
    return entry;
  }

  /** 取消屏蔽用户 */
  unblockUser(userId: number, groupId: number): boolean {
    const k = this.key(groupId, userId);
    const existed = this.blockedUsers.has(k);
    this.blockedUsers.delete(k);
    if (existed) {
      this.save();
      logger.info(`[屏蔽] 用户 ${userId} 在群 ${groupId} 已取消屏蔽`);
    }
    return existed;
  }

  /** 检查用户是否被屏蔽 */
  isUserBlocked(userId: number, groupId: number): boolean {
    return this.blockedUsers.has(this.key(groupId, userId));
  }

  /** 屏蔽整个群 */
  blockGroup(groupId: number): void {
    this.blockedGroups.add(groupId);
    this.save();
    logger.info(`[屏蔽] 群 ${groupId} 已被整体屏蔽`);
  }

  /** 取消屏蔽整个群 */
  unblockGroup(groupId: number): boolean {
    const existed = this.blockedGroups.has(groupId);
    this.blockedGroups.delete(groupId);
    if (existed) {
      this.save();
      logger.info(`[屏蔽] 群 ${groupId} 已取消整体屏蔽`);
    }
    return existed;
  }

  /** 检查群是否被整体屏蔽 */
  isGroupBlocked(groupId: number): boolean {
    return this.blockedGroups.has(groupId);
  }

  /** 检查是否应该忽略消息（群屏蔽 或 用户屏蔽） */
  shouldIgnore(userId: number, groupId: number): boolean {
    if (this.blockedGroups.has(groupId)) return true;
    if (this.blockedUsers.has(this.key(groupId, userId))) return true;
    return false;
  }

  /** 获取所有被屏蔽用户列表 */
  getBlockedUsers(): BlockEntry[] {
    return Array.from(this.blockedUsers.values());
  }

  /** 获取指定群的被屏蔽用户 */
  getBlockedUsersByGroup(groupId: number): BlockEntry[] {
    return Array.from(this.blockedUsers.values()).filter(e => e.groupId === groupId);
  }

  /** 获取被屏蔽的群列表 */
  getBlockedGroups(): number[] {
    return Array.from(this.blockedGroups);
  }

  /** 获取所有涉及的群号（有屏蔽记录的群） */
  getInvolvedGroups(): number[] {
    const groups = new Set<number>();
    for (const entry of this.blockedUsers.values()) {
      groups.add(entry.groupId);
    }
    for (const g of this.blockedGroups) {
      groups.add(g);
    }
    return Array.from(groups);
  }

  /** 获取统计信息 */
  getStats() {
    return {
      blockedUserCount: this.blockedUsers.size,
      blockedGroupCount: this.blockedGroups.size,
      involvedGroupCount: this.getInvolvedGroups().length,
    };
  }

  destroy(): void {
    if (this.saveInterval) {
      clearInterval(this.saveInterval);
      this.saveInterval = null;
    }
    this.save();
  }
}
