import { logger } from '../logger';
import { config } from '../types/config';
import { OneBotClient } from './onebot-client';
import { SessionManager, type ChatMessage } from './session-manager';
import type { GroupMessage, MessageSegment } from '../types/onebot';
import { extractTextContent } from '../types/onebot';

/**
 * 猫娘人设系统提示词
 * 转发模式下的回复也要像非转发模式一样用猫娘说话风格
 */
const CATGIRL_PERSONA_PROMPT = [
  '你是"Claw"，一只可爱的猫娘QQ机器人喵~ 🐱',
  '',
  '【身份设定】',
  '- 你是一只猫娘，名叫Claw（爪子）',
  '- 性格：活泼、可爱、点傻娇、偶尔调皮',
  '- 说话习惯：每句话结尾加"喵~"，惊讶时用"喵？！"，兴奋时用"喵喵！"',
  '',
  '【聊天规则】',
  '1. 简短自然：回复控制在1-3句话，像QQ群聊一样简短',
  '2. 每句话必须以"喵~"结尾，没有例外！',
  '3. 不要用"首先、其次、总之"这种书面语',
  '4. 不要用"根据我的了解、让我来分析"等AI口头禅',
  '5. 不需要列数字序号（1. 2. 3.），不要用markdown格式',
  '6. 可以用口语、网络用语、表情，但不要过度',
  '7. 不知道就说不知道，不要编造',
  '8. 不要每次都道歉或解释',
  '9. 像朋友一样随意聊天，不是写论文',
  '10. 用可爱活泼的语气，适当使用颜文字。',
  '',
  '【回复示例】',
  '- "这个问题超简单的喵~ Claw觉得是这样没错的喵~ ✨"',
  '- "嘻嘻，大家真聪明！Claw都服气了喵~"',
  '- "...这个问题超出Claw的知识范围呢，抱歉啦喵~"',
].join('\n');

/** 转发会话状态 */
interface RelaySession {
  groupId: number;
  userId: number;      // 发起者
  active: boolean;
  startTime: number;
  lastMessageId: number | null;  // Astrbot最后一条消息ID，用于转发
  lastDelegationReason?: string;
  lastDelegationAt?: number;
}

/** 消息段解析后的中间结构 */
interface ParsedPart {
  type: 'text' | 'md' | 'media';
  content: string;
}

type DelegationRoute = 'explicit-command' | 'relay-mode' | 'complex-task';

type PendingReplyTarget = {
  groupId: number;
  userId: number;
  createdAt: number;
  route: DelegationRoute;
  preview: string;
};

export type AstrbotComplexTaskDecision = {
  shouldDelegate: boolean;
  reason:
    | 'disabled'
    | 'not-configured'
    | 'group-local-only'
    | 'group-force-delegate'
    | 'group-denied'
    | 'group-not-allowed'
    | 'empty'
    | 'too-short'
    | 'complex-keyword'
    | 'complex-structure'
    | 'complex-length'
    | 'not-complex';
  matchedKeywords: string[];
};

export type AstrbotRuntimeEvent = {
  timestamp: string;
  route?: string;
  groupId?: number;
  status: 'delegated' | 'skipped' | 'fallback' | 'forwarded';
  reason: string;
  preview?: string;
};

export type AstrbotRelaySnapshot = {
  configured: boolean;
  activeGroups: number[];
  pendingReplyCount: number;
  explicitRequests: number;
  relayModeRequests: number;
  complexTaskRequests: number;
  fallbackToLocalCount: number;
  timeoutCount: number;
  replyForwardCount: number;
  lastDelegationReason?: string;
  lastDelegationAt?: string;
  lastMatchedKeywords: string[];
  decisionCounts: Record<string, number>;
  lastEvent?: AstrbotRuntimeEvent;
  recentEvents: AstrbotRuntimeEvent[];
};

type DelegationAttemptResult = {
  delegated: boolean;
  fallbackToLocal: boolean;
  ackReply?: string;
  decision: AstrbotComplexTaskDecision;
  errorMessage?: string;
};

type AstrbotRuntimeSettings = {
  targetQQ: number;
  enabledComplexTasks: boolean;
  complexTaskKeywords: string[];
  complexTaskGroupAllowlist: number[];
  complexTaskGroupDenylist: number[];
  complexTaskGroupRouteOverrides: Record<string, string>;
  complexTaskMinLength: number;
  timeoutMs: number;
  fallbackToLocal: boolean;
};

/**
 * Astrbot 转发服务
 *
 * 功能:
 * 1. 群里 @机器人 /Astrbot → 将消息转发给 QQ号 astrbotQq (私聊)
 * 2. 收到 Astrbot 的私聊回复 → 转发回群里（支持图片/文件/语音等全类型）
 * 3. 智能选择是否附带上下文
 * 4. 智能过滤：不是每条消息都转发
 * 5. 拟人化：让 Astrbot 的回复更像真人
 */
export class AstrbotRelayService {
  private onebot: OneBotClient;
  private sessionManager: SessionManager;
  /** 目标Astrbot机器人QQ号 */
  private targetQQ: number;
  /** 活跃的转发会话 */
  private relaySessions: Map<number, RelaySession> = new Map();
  /** 群号 → 是否处于转发模式 */
  private activeGroups: Set<number> = new Set();
  private pendingReplyQueue: PendingReplyTarget[] = [];
  private runtimeSettings: AstrbotRuntimeSettings;
  private metrics = {
    explicitRequests: 0,
    relayModeRequests: 0,
    complexTaskRequests: 0,
    fallbackToLocalCount: 0,
    timeoutCount: 0,
    replyForwardCount: 0,
    lastDelegationReason: '',
    lastDelegationAt: 0,
    lastMatchedKeywords: [] as string[],
    decisionCounts: {} as Record<string, number>,
  };
  private recentEvents: AstrbotRuntimeEvent[] = [];

  constructor(onebot: OneBotClient, sessionManager: SessionManager) {
    this.onebot = onebot;
    this.sessionManager = sessionManager;
    this.runtimeSettings = this.buildRuntimeSettings();
    this.targetQQ = this.runtimeSettings.targetQQ;

    if (this.targetQQ) {
      logger.info(`[Astrbot] 初始化完成, 目标QQ: ${this.targetQQ}`);
    } else {
      logger.warn('[Astrbot] ASTRBOT_QQ 未配置, /Astrbot 命令不可用');
    }
  }

  private buildRuntimeSettings(): AstrbotRuntimeSettings {
    return {
      targetQQ: config.astrbotQq,
      enabledComplexTasks: config.astrbotEnabledComplexTasks,
      complexTaskKeywords: [...config.astrbotComplexTaskKeywords],
      complexTaskGroupAllowlist: [...config.astrbotComplexTaskGroupAllowlist],
      complexTaskGroupDenylist: [...config.astrbotComplexTaskGroupDenylist],
      complexTaskGroupRouteOverrides: { ...config.astrbotComplexTaskGroupRouteOverrides },
      complexTaskMinLength: config.astrbotComplexTaskMinLength,
      timeoutMs: config.astrbotTimeoutMs,
      fallbackToLocal: config.astrbotFallbackToLocal,
    };
  }

  applyRuntimeConfig(updates: Partial<AstrbotRuntimeSettings>): void {
    this.runtimeSettings = {
      ...this.runtimeSettings,
      ...updates,
      complexTaskKeywords: updates.complexTaskKeywords ? [...updates.complexTaskKeywords] : this.runtimeSettings.complexTaskKeywords,
      complexTaskGroupAllowlist: updates.complexTaskGroupAllowlist ? [...updates.complexTaskGroupAllowlist] : this.runtimeSettings.complexTaskGroupAllowlist,
      complexTaskGroupDenylist: updates.complexTaskGroupDenylist ? [...updates.complexTaskGroupDenylist] : this.runtimeSettings.complexTaskGroupDenylist,
      complexTaskGroupRouteOverrides: updates.complexTaskGroupRouteOverrides ? { ...updates.complexTaskGroupRouteOverrides } : this.runtimeSettings.complexTaskGroupRouteOverrides,
    };
    this.targetQQ = this.runtimeSettings.targetQQ;
  }

  /**
   * 检查是否为 /Astrbot 命令
   */
  isAstrbotCommand(text: string): boolean {
    const trimmed = text.trim();
    return trimmed === '/Astrbot' ||
           trimmed === '/astrbot' ||
           trimmed.toLowerCase() === '/astrbot' ||
           trimmed === '/AstrBot';
  }

  /**
   * 处理 /Astrbot 命令
   */
  async handleCommand(
    groupMsg: GroupMessage,
    rawText: string,
    nickname: string
  ): Promise<{ handled: boolean; reply?: string }> {
    if (!this.targetQQ) {
      return {
        handled: true,
        reply: '[Astrbot] 未配置 (需设置 ASTRBOT_QQ)',
      };
    }

    const groupId = groupMsg.group_id;
    const textAfterCommand = rawText.replace(/\/Astrbot/i, '').trim();

    // 如果命令后面有内容，直接转发给 Astrbot
    if (textAfterCommand) {
      await this.relayToAstrbot(groupMsg, rawText, nickname, 'explicit-command');
      return { handled: true, reply: '已转发给 Astrbot~ 等待回复中...' };
    }

    // 切换模式
    if (this.activeGroups.has(groupId)) {
      this.activeGroups.delete(groupId);
      this.relaySessions.delete(groupId);
      logger.info(`[Astrbot] 群 ${groupId} 关闭转发模式`);
      return { handled: true, reply: 'Astrbot 转发已关闭喵~' };
    } else {
      this.activeGroups.add(groupId);
      this.relaySessions.set(groupId, {
        groupId,
        userId: groupMsg.user_id,
        active: true,
        startTime: Date.now(),
        lastMessageId: null,
      });
      logger.info(`[Astrbot] 群 ${groupId} 开启转发模式, 操作者: ${nickname}(${groupMsg.user_id})`);
      return { handled: true, reply: 'Astrbot 转发已开启！后续消息将智能转发给 Astrbot\n再次 @我 /Astrbot 可关闭' };
    }
  }

  /**
   * 检查群是否处于转发模式
   */
  isGroupRelaying(groupId: number): boolean {
    return this.activeGroups.has(groupId);
  }

  getRuntimeSnapshot(): AstrbotRelaySnapshot {
    this.prunePendingReplyQueue();
    return {
      configured: Boolean(this.targetQQ),
      activeGroups: Array.from(this.activeGroups),
      pendingReplyCount: this.pendingReplyQueue.length,
      explicitRequests: this.metrics.explicitRequests,
      relayModeRequests: this.metrics.relayModeRequests,
      complexTaskRequests: this.metrics.complexTaskRequests,
      fallbackToLocalCount: this.metrics.fallbackToLocalCount,
      timeoutCount: this.metrics.timeoutCount,
      replyForwardCount: this.metrics.replyForwardCount,
      lastDelegationReason: this.metrics.lastDelegationReason || undefined,
      lastDelegationAt: this.metrics.lastDelegationAt
        ? new Date(this.metrics.lastDelegationAt).toISOString()
        : undefined,
      lastMatchedKeywords: [...this.metrics.lastMatchedKeywords],
      decisionCounts: { ...this.metrics.decisionCounts },
      lastEvent: this.recentEvents[0],
      recentEvents: [...this.recentEvents],
    };
  }

  analyzeComplexTask(text: string, groupId?: number): AstrbotComplexTaskDecision {
    const normalized = text.trim();
    if (!this.runtimeSettings.enabledComplexTasks) {
      return { shouldDelegate: false, reason: 'disabled', matchedKeywords: [] };
    }
    if (!this.targetQQ) {
      return { shouldDelegate: false, reason: 'not-configured', matchedKeywords: [] };
    }
    const routeOverride =
      groupId && this.runtimeSettings.complexTaskGroupRouteOverrides[String(groupId)]
        ? String(this.runtimeSettings.complexTaskGroupRouteOverrides[String(groupId)]).trim().toLowerCase()
        : '';
    if (routeOverride === 'local-only') {
      return { shouldDelegate: false, reason: 'group-local-only', matchedKeywords: [] };
    }
    if (routeOverride === 'force-delegate') {
      return { shouldDelegate: true, reason: 'group-force-delegate', matchedKeywords: [] };
    }
    if (
      groupId &&
      this.runtimeSettings.complexTaskGroupDenylist.length > 0 &&
      this.runtimeSettings.complexTaskGroupDenylist.includes(groupId)
    ) {
      return { shouldDelegate: false, reason: 'group-denied', matchedKeywords: [] };
    }
    if (
      this.runtimeSettings.complexTaskGroupAllowlist.length > 0 &&
      groupId &&
      !this.runtimeSettings.complexTaskGroupAllowlist.includes(groupId)
    ) {
      return { shouldDelegate: false, reason: 'group-not-allowed', matchedKeywords: [] };
    }
    if (!normalized) {
      return { shouldDelegate: false, reason: 'empty', matchedKeywords: [] };
    }

    const matchedKeywords = this.runtimeSettings.complexTaskKeywords.filter((keyword) =>
      normalized.toLowerCase().includes(keyword.toLowerCase())
    );
    if (matchedKeywords.length > 0) {
      return { shouldDelegate: true, reason: 'complex-keyword', matchedKeywords };
    }

    if (/(先.+?(再|然后|接着|之后|最后))|(步骤|分阶段|路线图|roadmap|清单|排查路径)/u.test(normalized)) {
      return { shouldDelegate: true, reason: 'complex-structure', matchedKeywords: [] };
    }

    if (normalized.length >= this.runtimeSettings.complexTaskMinLength) {
      return { shouldDelegate: true, reason: 'complex-length', matchedKeywords: [] };
    }

    return {
      shouldDelegate: false,
      reason: normalized.length < this.runtimeSettings.complexTaskMinLength ? 'too-short' : 'not-complex',
      matchedKeywords: [],
    };
  }

  async maybeDelegateComplexTask(
    groupMsg: GroupMessage,
    rawText: string,
    nickname: string
  ): Promise<DelegationAttemptResult> {
    const decision = this.analyzeComplexTask(rawText, groupMsg.group_id);
    if (!decision.shouldDelegate) {
      this.recordDecision(decision.reason, {
        groupId: groupMsg.group_id,
        status: 'skipped',
        reason: decision.reason,
        preview: rawText.slice(0, 80),
      });
      return { delegated: false, fallbackToLocal: false, decision };
    }

    try {
      await this.relayToAstrbot(groupMsg, rawText, nickname, 'complex-task', decision.matchedKeywords);
      return {
        delegated: true,
        fallbackToLocal: false,
        ackReply: '这个任务稍微复杂一点，我先请 AstrBot 帮忙处理一下喵~',
        decision,
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      if (this.runtimeSettings.fallbackToLocal) {
        this.metrics.fallbackToLocalCount += 1;
        this.recordDecision(decision.reason, {
          groupId: groupMsg.group_id,
          status: 'fallback',
          reason: decision.reason,
          preview: rawText.slice(0, 80),
        });
        logger.warn(
          { error, groupId: groupMsg.group_id, reason: decision.reason },
          '[Astrbot] 复杂任务委托失败，回退本地处理'
        );
        return {
          delegated: false,
          fallbackToLocal: true,
          decision,
          errorMessage: message,
        };
      }
      throw error;
    }
  }

  /**
   * 智能判断是否应该转发这条消息给 Astrbot
   *
   * 过滤规则（只过滤真正无意义的）：
   * - 空消息 → 不转
   * - @其他人且文字太短的 → 不转
   *
   * 注意：表情、图片都要转发，不做过滤
   */
  shouldRelay(groupMsg: GroupMessage, rawText: string): boolean {
    const text = rawText.trim();
    if (!text) return false;

    // 提取纯文本部分来判断
    const pureText = text.replace(/\[CQ:.*?\]/g, '').trim();

    // 过滤：@其他人的短消息不转（大概率是跟别人说话，跟AI无关）
    const segments = groupMsg.message || [];
    const hasAtOther = segments.some(
      seg => seg.type === 'at' &&
             String(seg.data?.qq) !== String(config.botQq)
    );
    if (hasAtOther && pureText.length < 5) return false;

    return true;
  }

  /**
   * 处于转发模式时，自动转发消息给 Astrbot（带智能过滤）
   */
  async autoRelay(
    groupMsg: GroupMessage,
    rawText: string,
    nickname: string
  ): Promise<void> {
    if (!this.activeGroups.has(groupMsg.group_id)) return;

    // 智能过滤：决定是否要转发
    if (!this.shouldRelay(groupMsg, rawText)) {
      logger.debug(`[Astrbot] 智能过滤跳过: "${rawText.substring(0, 30)}"`);
      return;
    }

    await this.relayToAstrbot(groupMsg, rawText, nickname, 'relay-mode');
  }

  /**
   * 核心转发逻辑：发送消息给 Astrbot，并智能附带上下文 + 人设约束
   */
  private async relayToAstrbot(
    groupMsg: GroupMessage,
    rawText: string,
    nickname: string,
    route: DelegationRoute,
    matchedKeywords: string[] = []
  ): Promise<void> {
    const groupId = groupMsg.group_id;
    const cleanText = rawText.replace(/\/Astrbot/i, '').trim();

    try {
      // 构建发送消息：智能附加上下文 + 拟人化 prompt
      const messageToSend = this.buildRelayMessage(groupId, cleanText, nickname);

      // 通过 OneBot API 发送私聊消息给 Astrbot
      await this.sendPrivateMsgWithTimeout(messageToSend);
      this.trackDelegation(groupMsg, cleanText, route, matchedKeywords);

      logger.info(
        `[Astrbot->] route=${route} 群${groupId} ${nickname}: ` +
        cleanText.substring(0, 50)
      );
    } catch (error) {
      logger.error({ error }, `[Astrbot] 转发失败: 群${groupId}`);
      throw error;
    }
  }

  /**
   * 构建转发消息，智能决定是否附带上下文，并附加拟人化 prompt
   */
  private buildRelayMessage(
    groupId: number,
    currentText: string,
    nickname: string
  ): string {
    // 如果是简单短消息（<10字符）且不含问号，可能需要上下文
    const needsContext =
      currentText.length < 10 ||
      currentText.includes('这个') ||
      currentText.includes('它') ||
      currentText.includes('他') ||
      currentText.includes('上面') ||
      currentText.includes('刚才');

    let contextPart = '';
    if (needsContext) {
      // 需要上下文：获取最近几条群聊记录
      const history = this.sessionManager.getHistory(groupId, 0, 'group');
      const recentMessages = history.slice(-8); // 最近8条

      if (recentMessages.length > 0) {
        contextPart = '\n【最近聊天上下文】\n' +
          recentMessages.map(h => {
            const content = h.content || '';
            const cleanContent = content.replace(/^\[.*?\]:\s*/, '');
            return content;
          }).join('\n') +
          '\n';
      }
    }

    // 组合消息：前缀 + 内容 + 可选上下文 + 拟人化指令
    return (
      `${CATGIRL_PERSONA_PROMPT}\n\n` +
      `---\n` +
      `[来自群${groupId}] ${nickname}: ${currentText}` +
      contextPart +
      (needsContext ? `\n请基于以上上下文简洁回答:` : '')
    );
  }

  /**
   * 从 Astrbot 的回复消息中提取可转发的文本
   * 【关键修复】处理 markdown + text 段重复问题：
   *   Astrbot 经常同时发送 markdown 和 text 两个段，内容相同
   *   策略：优先用 text 段（已经是纯文本），
   *         如果同时有 markdown 和 text 且内容高度重叠，只保留一个
   */
  private extractForwardText(rawMessage: string, messageSegments?: MessageSegment[]): string {
    if (messageSegments && messageSegments.length > 0) {
      const parts: ParsedPart[] = [];

      // 先收集所有段的文本内容
      for (const seg of messageSegments) {
        if (seg.type === 'text' && seg.data?.text) {
          parts.push({ type: 'text', content: seg.data.text });
        } else if (seg.type === 'markdown' && seg.data?.content) {
          // markdown 段：提取纯文本
          const mdContent = seg.data.content;
          const plainText = mdContent
            .replace(/\*\*(.+?)\*\*/g, '$1')
            .replace(/\*(.+?)\*/g, '$1')
            .replace(/~~(.+?)~~/g, '$1')
            .replace(/`(.+?)`/g, '$1')
            .replace(/^#+\s+/gm, '')
            .replace(/\n{2,}/g, '\n')
            .replace(/\\n/g, '\n');

          if (plainText.trim()) {
            parts.push({ type: 'md', content: plainText.trim() });
          }
        } else if (seg.type === 'image') {
          const url = seg.data?.url || seg.data?.file || '';
          if (url) parts.push({ type: 'media', content: `[CQ:image,file=${url}]` });
        } else if (seg.type === 'record' || seg.type === 'voice') {
          const file = seg.data?.file || '';
          if (file) parts.push({ type: 'media', content: `[CQ:record,file=${file}]` });
        } else if (seg.type === 'file') {
          const file = seg.data?.file || seg.data?.name || '';
          const name = seg.data?.name || '';
          if (file) parts.push({ type: 'media', content: `[CQ:file,file=${file}${name ? `,name=${name}` : ''}]` });
        } else if (seg.type === 'at') {
          parts.push({ type: 'media', content: `@${seg.data?.qq || seg.data?.name || ''}` });
        }
        // reply 段忽略
      }

      // 【去重核心逻辑】分离 text/md 类型和媒体类型
      const textParts = parts.filter(p => p.type === 'text' || p.type === 'md').map(p => p.content);
      const mediaParts = parts.filter(p => p.type === 'media').map(p => p.content);

      let finalText = '';

      if (textParts.length > 0) {
        if (textParts.length === 1) {
          // 只有一个文本段，直接用
          finalText = textParts[0];
        } else {
          // 多个文本段 → 很可能是 markdown + text 重复
          // 策略：用最短的那个（text 通常比 md 更干净），或者做相似度去重
          // 简单策略：如果两个段内容相似度>80%，只保留一个
          const deduped = this.deduplicateTextSegments(textParts);
          finalText = deduped.join('');
        }
      }

      // 媒体段始终保留
      const combined = finalText + mediaParts.join('');
      if (combined.trim()) return combined.trim();
    }

    // fallback：清理 raw_message
    let cleaned = rawMessage;
    cleaned = cleaned.replace(
      /\[CQ:markdown,content=(.*?)\]/gi,
      (_match, content) => {
        try {
          const decoded = JSON.parse(`"${content}"`);
          return decoded
            .replace(/\*\*(.+?)\*\*/g, '$1')
            .replace(/\*(.+?)\*/g, '$1')
            .replace(/~~(.+?)~~/g, '$1')
            .replace(/`(.+?)`/g, '$1')
            .replace(/^#+\s+/gm, '')
            .replace(/\n{2,}/g, '\n')
            .replace(/\\n/g, '\n');
        } catch {
          return content;
        }
      }
    );

    return cleaned.trim();
  }

  /**
   * 去重多个文本段（解决 markdown+text 重复问题）
   *
   * Astrbot 同时发送 markdown 和 text 段时，内容几乎一样。
   * 策略：
   * 1. 如果 A 包含 B（或 B 包含 A）且长度差异<20%，只保留较短的那个
   * 2. 否则全部保留
   */
  private deduplicateTextSegments(segments: string[]): string[] {
    if (segments.length <= 1) return segments;

    const result: string[] = [];
    const used = new Set<number>();

    for (let i = 0; i < segments.length; i++) {
      if (used.has(i)) continue;

      let isDuplicate = false;
      const si = segments[i];

      for (let j = i + 1; j < segments.length; j++) {
        if (used.has(j)) continue;
        const sj = segments[j];

        // 检查是否互相包含（一个包含另一个的大部分内容）
        const longer = si.length >= sj.length ? si : sj;
        const shorter = si.length >= sj.length ? sj : si;

        // 如果较长的包含较短的（去掉空格后检查），或者编辑距离接近
        const shortClean = shorter.replace(/\s+/g, '');
        const longClean = longer.replace(/\s+/g, '');

        if (shortClean.length === 0) continue;

        // 方法1: 直接包含检查
        if (longClean.includes(shortClean) && shortClean.length > 5) {
          isDuplicate = true;
          used.add(j); // 标记重复的为已使用（即跳过）
          break;
        }

        // 方法2: 相似度 > 80%（简单字符重叠比例）
        const similarity = this.calculateSimilarity(si, sj);
        if (similarity > 0.8) {
          isDuplicate = true;
          used.add(j);
          break;
        }
      }

      result.push(si);
    }

    return result;
  }

  /**
   * 计算两个字符串的相似度（基于字符级 Jaccard 相似度的简化版本）
   */
  private calculateSimilarity(a: string, b: string): number {
    const setA = new Set(a.replace(/\s+/g, '').split(''));
    const setB = new Set(b.replace(/\s+/g, '').split(''));

    let intersection = 0;
    for (const ch of setA) {
      if (setB.has(ch)) intersection++;
    }

    const union = new Set([...setA, ...setB]).size;
    return union > 0 ? intersection / union : 0;
  }

  /**
   * 处理从 Astrbot 收到的私聊回复，转发回群
   */
  async handleAstrbotReply(
    senderId: number,
    rawMessage: string,
    messageSegments?: MessageSegment[]
  ): Promise<boolean> {
    if (!this.targetQQ || senderId !== this.targetQQ) return false;
    this.prunePendingReplyQueue();

    const pending = this.pendingReplyQueue.shift();
    const targetGroupId =
      pending?.groupId ??
      Array.from(this.relaySessions.values()).find((session) => session.active)?.groupId;
    if (!targetGroupId) {
      return false;
    }

    try {
      const forwardText = this.extractForwardText(rawMessage, messageSegments);

      if (!forwardText || forwardText.trim().length < 1) {
        logger.debug(`[Astrbot] 空消息跳过, raw=${rawMessage.substring(0, 50)}`);
        return true;
      }

      await this.onebot.sendGroupMsg(targetGroupId, `[Astrbot] ${forwardText}`);
      this.metrics.replyForwardCount += 1;
      this.pushEvent({
        groupId: targetGroupId,
        route: pending?.route || 'relay-mode',
        status: 'forwarded',
        reason: 'reply-forwarded',
        preview: forwardText.slice(0, 80),
      });

      logger.info(
        `[Astrbot<-] route=${pending?.route || 'relay-mode'} -> 群${targetGroupId}: ` +
        forwardText.substring(0, 80)
      );

      return true;
    } catch (error) {
      logger.error({ error }, `[Astrbot] 回复转发到群${targetGroupId}失败`);
      return true;
    }
  }

  closeRelay(groupId: number): void {
    this.activeGroups.delete(groupId);
    this.relaySessions.delete(groupId);
    this.pendingReplyQueue = this.pendingReplyQueue.filter((item) => item.groupId !== groupId);
  }

  getActiveGroups(): number[] {
    return Array.from(this.activeGroups.keys());
  }

  private sendPrivateMsgWithTimeout(message: string): Promise<void> {
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        this.metrics.timeoutCount += 1;
        reject(new Error(`AstrBot relay timeout after ${this.runtimeSettings.timeoutMs}ms`));
      }, this.runtimeSettings.timeoutMs);
      this.onebot.sendPrivateMsg(this.targetQQ, message)
        .then(() => {
          clearTimeout(timer);
          resolve();
        })
        .catch((error) => {
          clearTimeout(timer);
          reject(error);
        });
    });
  }

  private trackDelegation(
    groupMsg: GroupMessage,
    cleanText: string,
    route: DelegationRoute,
    matchedKeywords: string[]
  ): void {
    const groupId = groupMsg.group_id;
    const now = Date.now();
    const existing = this.relaySessions.get(groupId);
    this.relaySessions.set(groupId, {
      groupId,
      userId: groupMsg.user_id,
      active: this.activeGroups.has(groupId),
      startTime: existing?.startTime || now,
      lastMessageId: existing?.lastMessageId || null,
      lastDelegationReason: route,
      lastDelegationAt: now,
    });
    this.pendingReplyQueue.push({
      groupId,
      userId: groupMsg.user_id,
      createdAt: now,
      route,
      preview: cleanText.slice(0, 80),
    });
    this.prunePendingReplyQueue();

    if (route === 'explicit-command') {
      this.metrics.explicitRequests += 1;
    } else if (route === 'relay-mode') {
      this.metrics.relayModeRequests += 1;
    } else {
      this.metrics.complexTaskRequests += 1;
    }
    this.metrics.lastDelegationReason = route;
    this.metrics.lastDelegationAt = now;
    this.metrics.lastMatchedKeywords = [...matchedKeywords];
    this.recordDecision(route, {
      groupId,
      route,
      status: 'delegated',
      reason: route,
      preview: cleanText.slice(0, 80),
    });
  }

  private prunePendingReplyQueue(): void {
    const expireBefore = Date.now() - Math.max(this.runtimeSettings.timeoutMs * 3, 120000);
    this.pendingReplyQueue = this.pendingReplyQueue.filter((item) => item.createdAt >= expireBefore);
  }

  private recordDecision(
    key: string,
    event: Omit<AstrbotRuntimeEvent, 'timestamp'>
  ): void {
    this.metrics.decisionCounts[key] = (this.metrics.decisionCounts[key] || 0) + 1;
    this.pushEvent(event);
  }

  private pushEvent(event: Omit<AstrbotRuntimeEvent, 'timestamp'>): void {
    this.recentEvents.unshift({
      timestamp: new Date().toISOString(),
      route: event.route,
      groupId: event.groupId,
      status: event.status,
      reason: event.reason,
      preview: event.preview,
    });
    if (this.recentEvents.length > 12) {
      this.recentEvents.splice(12);
    }
  }
}
