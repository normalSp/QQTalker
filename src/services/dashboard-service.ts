import http from 'http';
import https from 'https';
import fs from 'fs';
import path from 'path';
import { URL } from 'url';
import { logger } from '../logger';
import { config } from '../types/config';
import type { OneBotClient } from './onebot-client';
import type { BlockService } from './block-service';
import type { DashboardRouteProvider, DashboardRouteResult } from '../plugins/plugin-types';

/** SSE 事件类型 */
interface SseEvent {
  type: 'message' | 'ai' | 'tts' | 'stt' | 'error' | 'system' | 'status' | 'config';
  data: Record<string, unknown>;
  timestamp: string;
}

/**
 * Dashboard 可视化控制台服务
 * 提供 HTTP API + SSE 实时推送 + env 配置管理 + 内嵌日志分析
 */
export class DashboardService {
  private server: http.Server | null = null;
  private port: number;

  // SSE 客户端集合
  private sseClients: Set<http.ServerResponse> = new Set();

  // 统计历史（用于图表）
  private statsHistory: Array<{
    time: string;
    totalMessages: number;
    totalAiCalls: number;
    totalTtsCalls: number;
    totalSttCalls: number;
    memoryMB: number;
  }> = [];
  private readonly maxHistoryPoints = 120;

  // 日志事件缓冲
  private logBuffer: SseEvent[] = [];
  private readonly maxLogBuffer = 200;

  // 统计定时器
  private statsTimer: ReturnType<typeof setInterval> | null = null;

  // 图片代理缓存: url -> { buffer, contentType, timestamp }
  private imageCache = new Map<string, { buffer: Buffer; contentType: string; timestamp: number }>();
  private readonly IMAGE_CACHE_MAX = 200;
  private readonly IMAGE_CACHE_TTL = 30 * 60 * 1000; // 30分钟过期

  // 运行时状态（由外部服务注入）
  public status: {
    connected: boolean;
    wsUrl: string;
    connectTime?: string;
    reconnectCount: number;
    lastMessageTime?: string;
    totalMessages: number;
    totalAiCalls: number;
    totalTtsCalls: number;
    totalSttCalls: number;
    startTime: string;
    activeGroups: Set<number>;
    sessionsCount: number;
    lastError?: string;
    sendQueueLength: number;
  };

  // OneBot 客户端引用（用于调用 get_forward_msg 等API）
  private onebotClient: OneBotClient | null = null;

  // 屏蔽服务引用
  private blockService: BlockService | null = null;
  private shutdownHandler: (() => void | Promise<void>) | null = null;
  private customRoutes: DashboardRouteProvider[] = [];
  private astrbotStatusProvider: (() => unknown) | null = null;
  private configUpdateHandler: ((updates: Record<string, string>) => void | Promise<void>) | null = null;

  constructor(port: number = 3180) {
    this.port = port;
    this.status = {
      connected: false,
      wsUrl: config.wsUrl,
      reconnectCount: 0,
      totalMessages: 0,
      totalAiCalls: 0,
      totalTtsCalls: 0,
      totalSttCalls: 0,
      startTime: new Date().toISOString(),
      activeGroups: new Set(),
      sessionsCount: 0,
      sendQueueLength: 0,
    };
  }

  /** 注入 OneBot 客户端 */
  setOneBotClient(client: OneBotClient): void {
    this.onebotClient = client;
  }

  /** 注入屏蔽服务 */
  setBlockService(blockService: BlockService): void {
    this.blockService = blockService;
  }

  setShutdownHandler(handler: (() => void | Promise<void>) | null): void {
    this.shutdownHandler = handler;
  }

  setAstrbotStatusProvider(provider: (() => unknown) | null): void {
    this.astrbotStatusProvider = provider;
  }

  setConfigUpdateHandler(handler: ((updates: Record<string, string>) => void | Promise<void>) | null): void {
    this.configUpdateHandler = handler;
  }

  registerRoutes(routes: DashboardRouteProvider[]): void {
    this.customRoutes.push(...routes);
  }

  /** 更新连接状态 */
  updateConnectionStatus(connected: boolean, reconnectCount?: number): void {
    this.status.connected = connected;
    if (connected) {
      this.status.connectTime = new Date().toISOString();
      this.status.reconnectCount = reconnectCount ?? this.status.reconnectCount;
    }
    this.broadcastSse({
      type: 'status',
      data: { connected, reconnectCount: this.status.reconnectCount },
      timestamp: new Date().toISOString(),
    });
  }

  /** 记录消息 */
  recordMessage(): void {
    this.status.totalMessages++;
    this.status.lastMessageTime = new Date().toISOString();
    this.pushLog('message', `第 ${this.status.totalMessages} 条消息`);
  }

  /** 记录AI调用 */
  recordAiCall(): void {
    this.status.totalAiCalls++;
    this.pushLog('ai', `AI 调用 #${this.status.totalAiCalls}`);
  }

  /** 记录TTS调用 */
  recordTtsCall(): void {
    this.status.totalTtsCalls++;
    this.pushLog('tts', `TTS 语音合成 #${this.status.totalTtsCalls}`);
  }

  /** 记录STT调用 */
  recordSttCall(): void {
    this.status.totalSttCalls++;
    this.pushLog('stt', `STT 语音识别 #${this.status.totalSttCalls}`);
  }

  /** 更新活跃群列表 */
  setActiveGroups(groups: Set<number>): void {
    this.status.activeGroups = groups;
  }

  /** 更新会话数 */
  setSessionsCount(count: number): void {
    this.status.sessionsCount = count;
  }

  /** 更新发送队列长度 */
  setSendQueueLength(len: number): void {
    this.status.sendQueueLength = len;
  }

  /** 记录错误 */
  recordError(error: string): void {
    this.status.lastError = error;
    this.pushLog('error', error);
    logger.warn(`[Dashboard] Error recorded: ${error}`);
  }

  /** 推送系统日志 */
  pushLog(type: string, message: string): void {
    const event: SseEvent = {
      type: type as SseEvent['type'],
      data: { message },
      timestamp: new Date().toISOString(),
    };
    this.logBuffer.unshift(event);
    if (this.logBuffer.length > this.maxLogBuffer) {
      this.logBuffer.pop();
    }
    this.broadcastSse(event);
  }

  /** 广播 SSE 事件给所有客户端 */
  private broadcastSse(event: SseEvent): void {
    const data = `event: ${event.type}\ndata: ${JSON.stringify(event)}\n\n`;
    for (const client of this.sseClients) {
      try {
        client.write(data);
      } catch {
        this.sseClients.delete(client);
      }
    }
  }

  /** 采样统计数据（定时调用） */
  private sampleStats(): void {
    const mem = process.memoryUsage();
    this.statsHistory.push({
      time: new Date().toLocaleTimeString('zh-CN', { hour12: false }),
      totalMessages: this.status.totalMessages,
      totalAiCalls: this.status.totalAiCalls,
      totalTtsCalls: this.status.totalTtsCalls,
      totalSttCalls: this.status.totalSttCalls,
      memoryMB: Math.round(mem.heapUsed / 1024 / 1024),
    });
    if (this.statsHistory.length > this.maxHistoryPoints) {
      this.statsHistory.shift();
    }
  }

  /**
   * 启动 Dashboard HTTP 服务
   */
  start(): Promise<void> {
    return new Promise((resolve, reject) => {
      this.server = http.createServer((req, res) => this.handleRequest(req, res));

      // 统计采样定时器（每5秒）
      this.statsTimer = setInterval(() => this.sampleStats(), 5000);

      this.server.listen(this.port, () => {
        logger.info(`[Dashboard] 控制台已启动: http://localhost:${this.port}`);
        this.pushLog('system', 'Dashboard 控制台已启动');
        resolve();
      });

      this.server.on('error', (err) => {
        reject(err);
      });
    });
  }

  /**
   * 处理请求
   */
  private handleRequest(req: http.IncomingMessage, res: http.ServerResponse): void {
    const httpReq = req;
    const httpRes = res;
    const urlObj = new URL(httpReq.url || '/', `http://localhost:${this.port}`);
    const urlPath = urlObj.pathname;

    // CORS
    httpRes.setHeader('Access-Control-Allow-Origin', '*');
    httpRes.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, OPTIONS');
    httpRes.setHeader('Access-Control-Allow-Headers', 'Content-Type');

    if (httpReq.method === 'OPTIONS') {
      httpRes.writeHead(204);
      httpRes.end();
      return;
    }

    // SSE 流
    if (urlPath === '/api/events') {
      this.handleSse(httpReq, httpRes);
      return;
    }

    // GET API
    if (httpReq.method === 'GET') {
      switch (urlPath) {
        case '/api/status':
          this.handleApi(httpRes, () => this.getStatusData());
          return;
        case '/api/config':
          this.handleApi(httpRes, () => this.getConfigData());
          return;
        case '/api/stats':
          this.handleApi(httpRes, () => this.getStatsData());
          return;
        case '/api/stats/history':
          this.handleApi(httpRes, () => ({ history: this.statsHistory }));
          return;
        case '/api/logs':
          this.handleApi(httpRes, () => ({ logs: this.logBuffer }));
          return;
        case '/api/log-file':
          this.serveLogFile(httpRes);
          return;
        case '/api/chat-logs':
          this.handleApi(httpRes, () => this.getChatLogs(urlObj.searchParams));
          return;
        case '/api/image-proxy':
          this.handleImageProxy(httpReq, httpRes, urlObj.searchParams);
          return;
        case '/api/forward-msg':
          this.handleForwardMsg(httpRes, urlObj.searchParams);
          return;
        // 屏蔽管理 API
        case '/api/block/users':
          this.handleApi(httpRes, () => ({
            users: this.blockService?.getBlockedUsers() || [],
            stats: this.blockService?.getStats() || { blockedUserCount: 0, blockedGroupCount: 0, involvedGroupCount: 0 },
          }));
          return;
        case '/api/block/groups':
          this.handleApi(httpRes, () => ({
            groups: this.blockService?.getBlockedGroups() || [],
            stats: this.blockService?.getStats() || { blockedUserCount: 0, blockedGroupCount: 0, involvedGroupCount: 0 },
          }));
          return;
        case '/log-analyzer':
        case '/log-analyzer.html':
          this.serveLogAnalyzerHtml(httpRes);
          return;
        case '/':
        case '/index.html':
        case '/analyzer':
        case '/analyzer.html':
          this.serveDashboardHtml(httpRes);
          return;
      }

      if (urlPath.startsWith('/dashboard-assets/')) {
        this.serveStaticAsset(httpRes, urlPath, 'dashboard-assets');
        return;
      }

      if (urlPath.startsWith('/log-analyzer-assets/')) {
        this.serveStaticAsset(httpRes, urlPath, 'log-analyzer-assets');
        return;
      }
    }

    // POST API（env 配置修改 + 屏蔽管理）
    if (httpReq.method === 'POST') {
      switch (urlPath) {
        case '/api/config':
          this.handlePostBody(httpReq, (body) => {
            this.updateEnvConfig(body);
            void this.configUpdateHandler?.(body);
            this.handleApi(httpRes, () => ({ success: true, config: this.getConfigData() }));
          });
          return;
        case '/api/config/reload':
          this.handleApi(httpRes, () => {
            return { success: true, message: 'Config reloaded' };
          });
          return;
        case '/api/admin/shutdown':
          if (!this.isLocalRequest(httpReq)) {
            httpRes.writeHead(403, { 'Content-Type': 'application/json; charset=utf-8' });
            httpRes.end(JSON.stringify({ success: false, error: 'Only localhost may request shutdown' }));
            return;
          }
          if (!this.shutdownHandler) {
            httpRes.writeHead(503, { 'Content-Type': 'application/json; charset=utf-8' });
            httpRes.end(JSON.stringify({ success: false, error: 'Shutdown handler unavailable' }));
            return;
          }
          this.handleApi(httpRes, () => {
            this.pushLog('system', '收到本地关闭 QQTalker 请求');
            setTimeout(() => {
              Promise.resolve(this.shutdownHandler?.()).catch(error => {
                logger.error({ error }, '[Dashboard] Failed to execute shutdown handler');
              });
            }, 120);
            return { success: true, message: 'QQTalker is shutting down' };
          });
          return;
        // 屏蔽管理 POST
        case '/api/block/user':
          this.handlePostBody(httpReq, (body) => {
            const userId = parseInt(body.userId, 10);
            const groupId = parseInt(body.groupId, 10);
            const nickname = body.nickname || `用户${userId}`;
            if (!userId || !groupId) {
              httpRes.writeHead(400, { 'Content-Type': 'application/json' });
              httpRes.end(JSON.stringify({ error: 'Missing userId or groupId' }));
              return;
            }
            const entry = this.blockService?.blockUser(userId, groupId, nickname, body.reason || 'Dashboard 手动屏蔽');
            this.handleApi(httpRes, () => ({ success: true, entry }));
          });
          return;
        case '/api/block/user/remove':
          this.handlePostBody(httpReq, (body) => {
            const userId = parseInt(body.userId, 10);
            const groupId = parseInt(body.groupId, 10);
            const removed = this.blockService?.unblockUser(userId, groupId);
            this.handleApi(httpRes, () => ({ success: true, removed }));
          });
          return;
        case '/api/block/group':
          this.handlePostBody(httpReq, (body) => {
            const groupId = parseInt(body.groupId, 10);
            if (!groupId) {
              httpRes.writeHead(400, { 'Content-Type': 'application/json' });
              httpRes.end(JSON.stringify({ error: 'Missing groupId' }));
              return;
            }
            this.blockService?.blockGroup(groupId);
            this.handleApi(httpRes, () => ({ success: true, groupId }));
          });
          return;
        case '/api/block/group/remove':
          this.handlePostBody(httpReq, (body) => {
            const groupId = parseInt(body.groupId, 10);
            const removed = this.blockService?.unblockGroup(groupId);
            this.handleApi(httpRes, () => ({ success: true, removed }));
          });
          return;
      }
    }

    const customRoute = this.customRoutes.find(route => route.method === httpReq.method && route.path === urlPath);
    if (customRoute) {
      this.handleCustomRoute(customRoute, httpReq, httpRes, urlObj);
      return;
    }

    httpRes.writeHead(404);
    httpRes.end(JSON.stringify({ error: 'Not Found' }));
  }

  private async handleCustomRoute(
    route: DashboardRouteProvider,
    req: http.IncomingMessage,
    res: http.ServerResponse,
    url: URL,
  ): Promise<void> {
    try {
      const body = req.method === 'POST' || req.method === 'PUT' || req.method === 'DELETE'
        ? await this.readJsonBody(req)
        : undefined;
      const result = await route.handler({ req, res, url, body });
      if (res.writableEnded) return;
      const response = result as DashboardRouteResult | void;
      res.writeHead(response?.status || 200, {
        'Content-Type': response?.contentType || 'application/json; charset=utf-8',
      });
      if ((response?.contentType || '').startsWith('text/')) {
        res.end(String(response?.data ?? ''));
      } else {
        res.end(JSON.stringify(response?.data ?? { success: true }));
      }
    } catch (err: any) {
      if (res.writableEnded) return;
      res.writeHead(500, { 'Content-Type': 'application/json; charset=utf-8' });
      res.end(JSON.stringify({ error: err.message }));
    }
  }

  private readJsonBody(req: http.IncomingMessage): Promise<Record<string, any>> {
    return new Promise((resolve, reject) => {
      let body = '';
      req.on('data', (chunk) => { body += chunk; });
      req.on('end', () => {
        if (!body.trim()) {
          resolve({});
          return;
        }
        try {
          resolve(JSON.parse(body));
        } catch (error) {
          reject(error);
        }
      });
      req.on('error', reject);
    });
  }

  /**
   * 图片代理：通过服务端中转QQ图片，绕过防盗链
   * GET /api/image-proxy?url=<encodedUrl>
   */
  private handleImageProxy(req: http.IncomingMessage, res: http.ServerResponse, params: URLSearchParams): void {
    const targetUrl = params.get('url');
    if (!targetUrl) {
      res.writeHead(400, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'Missing url parameter' }));
      return;
    }
    const normalizedUrl = targetUrl.replace(/&amp;/g, '&');
    const redirectStatuses = new Set([301, 302, 303, 307, 308]);

    const respondWithBuffer = (buffer: Buffer, contentType: string) => {
      res.writeHead(200, {
        'Content-Type': contentType,
        'Content-Length': buffer.length,
        'Cache-Control': 'public, max-age=1800',
        'Access-Control-Allow-Origin': '*',
      });
      res.end(buffer);
    };

    const isAllowedImageHost = (candidateUrl: string): URL | null => {
      try {
        const parsedUrl = new URL(candidateUrl);
        const allowedHosts = [
          'multimedia.nt.qq.com.cn',
          'multimedia.qq.com',
          'gchat.qpic.cn',
          'c2cpicdw.qpic.cn',
          'qpic.cn',
        ];
        const isAllowed = allowedHosts.some(h => parsedUrl.hostname === h || parsedUrl.hostname.endsWith('.' + h));
        return isAllowed ? parsedUrl : null;
      } catch {
        return null;
      }
    };

    const cached = this.imageCache.get(normalizedUrl);
    if (cached && (Date.now() - cached.timestamp) < this.IMAGE_CACHE_TTL) {
      respondWithBuffer(cached.buffer, cached.contentType);
      return;
    }

    const fetchRemoteImage = (currentUrl: string, redirectDepth = 0): void => {
      const parsedUrl = isAllowedImageHost(currentUrl);
      if (!parsedUrl) {
        res.writeHead(redirectDepth > 0 ? 502 : 403, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: redirectDepth > 0 ? 'Redirected to disallowed domain' : 'Domain not allowed' }));
        return;
      }

      if (redirectDepth > 4) {
        res.writeHead(502, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'Too many image redirects' }));
        return;
      }

      const mod = parsedUrl.protocol === 'https:' ? https : http;
      const proxyReq = mod.request(parsedUrl, {
        method: 'GET',
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/127.0.0.0 Safari/537.36',
          'Accept': 'image/avif,image/webp,image/apng,image/svg+xml,image/*,*/*;q=0.8',
          'Accept-Language': 'zh-CN,zh;q=0.9,en;q=0.8',
          'Cache-Control': 'no-cache',
          'Pragma': 'no-cache',
          'Referer': 'https://im.qq.com/',
          'Origin': 'https://im.qq.com',
        },
        timeout: 15000,
      }, (proxyRes) => {
        const statusCode = proxyRes.statusCode || 0;
        if (redirectStatuses.has(statusCode)) {
          const location = proxyRes.headers.location;
          proxyRes.resume();
          if (!location) {
            res.writeHead(502, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ error: `Redirect without location (${statusCode})` }));
            return;
          }
          const nextUrl = new URL(location, parsedUrl).toString();
          fetchRemoteImage(nextUrl, redirectDepth + 1);
          return;
        }

        if (statusCode < 200 || statusCode >= 300) {
          logger.warn({ statusCode, currentUrl }, '[ImageProxy] Upstream returned non-success status');
          proxyRes.resume();
          res.writeHead(502, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ error: `Upstream returned ${statusCode}` }));
          return;
        }

        const chunks: Buffer[] = [];
        proxyRes.on('data', (chunk) => chunks.push(chunk));
        proxyRes.on('end', () => {
          const imageBuffer = Buffer.concat(chunks);
          const contentType = String(proxyRes.headers['content-type'] || 'image/jpeg');

          if (imageBuffer.length > 0 && imageBuffer.length <= 5 * 1024 * 1024) {
            if (this.imageCache.size >= this.IMAGE_CACHE_MAX) {
              const oldestKey = this.imageCache.keys().next().value;
              if (oldestKey) this.imageCache.delete(oldestKey);
            }
            this.imageCache.set(normalizedUrl, { buffer: imageBuffer, contentType, timestamp: Date.now() });
          }

          respondWithBuffer(imageBuffer, contentType);
        });
      });

      proxyReq.on('error', (err) => {
        logger.warn({ err, currentUrl }, '[ImageProxy] Proxy request failed');
        if (!res.headersSent) {
          res.writeHead(502, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ error: 'Proxy request failed' }));
        }
      });

      proxyReq.on('timeout', () => {
        proxyReq.destroy();
        if (!res.headersSent) {
          res.writeHead(504, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ error: 'Proxy timeout' }));
        }
      });

      proxyReq.end();
    };

    fetchRemoteImage(normalizedUrl);
  }

  /**
   * 获取合并转发消息内容
   * GET /api/forward-msg?id=<forwardId>
   */
  private async handleForwardMsg(res: http.ServerResponse, params: URLSearchParams): Promise<void> {
    const forwardId = params.get('id');
    if (!forwardId) {
      res.writeHead(400, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'Missing id parameter' }));
      return;
    }

    if (!this.onebotClient || !this.onebotClient.isConnected()) {
      res.writeHead(503, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'OneBot not connected' }));
      return;
    }

    try {
      const result = await this.onebotClient.getForwardMsg(forwardId);
      if (!result) {
        res.writeHead(404, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'Forward message not found' }));
        return;
      }

      // 解析转发消息内容（NapCat/Lagrange 等实现的返回格式）
      const messages = this.parseForwardMessages(result);
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ id: forwardId, messages }));
    } catch (err: any) {
      logger.debug(`[Forward] 获取合并转发失败: ${err.message}`);
      res.writeHead(500, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: err.message }));
    }
  }

  /** 解析合并转发消息的内容为数组 */
  private parseForwardMessages(result: any): Array<{ sender: string; content: string; time: number }> {
    const messages: Array<{ sender: string; content: string; time: number }> = [];

    // 兼容多种 OneBot 实现的返回格式
    const msgList = result.messages || result.news || result.content || [];
    if (!Array.isArray(msgList)) return messages;

    for (const item of msgList) {
      const sender = item.sender?.nickname || item.sender?.card || `用户${item.sender?.user_id || '?'}`;
      let content = '';

      // 兼容多种内容格式：content / message / 可能是字符串或数组
      const rawContent = item.content || item.message;

      if (typeof rawContent === 'string') {
        content = rawContent;
      } else if (Array.isArray(rawContent)) {
        // 消息段数组，转换为可读文本
        content = rawContent.map((seg: any) => {
          if (!seg) return '';
          if (typeof seg === 'string') return seg;
          if (seg.type === 'text') return seg.data?.text || '';
          if (seg.type === 'image') return '[图片]';
          if (seg.type === 'face') return '[表情]';
          if (seg.type === 'at') return `@${seg.data?.qq || ''}`;
          if (seg.type === 'record') return '[语音]';
          if (seg.type === 'video') return '[视频]';
          if (seg.type === 'forward') return '[合并转发]';
          if (seg.type === 'json' || seg.type === 'card') return '[卡片/链接]';
          if (seg.type === 'location') return '[位置]';
          return `[${seg.type}]`;
        }).join('');
      } else if (typeof item.content === 'object' && item.content !== null) {
        // 有些实现 content 是对象 { type, data }
        if (item.content.type === 'text') content = item.content.data?.text || '';
        else content = JSON.stringify(item.content).substring(0, 200);
      }

      // 如果所有方式都没拿到内容，尝试从其他字段获取
      if (!content.trim()) {
        // 尝试从 prompt 字段（合并转发的摘要）获取
        if (item.prompt) content = item.prompt;
        // 最后检查 item 本身是否有 text 字段
        else if (typeof item.text === 'string') content = item.text;
      }

      messages.push({
        sender,
        content: content.trim().substring(0, 500) || '[无内容]',
        time: item.time || 0,
      });
    }

    return messages;
  }

  /** 服务日志文件内容（供前端日志分析器使用） */
  private serveLogFile(res: http.ServerResponse): void {
    const searchDirs = [
      path.resolve(process.cwd(), '日志'),
      path.resolve(process.cwd(), 'logs'),
      path.resolve(process.cwd(), 'log'),
    ];

    let logFile: string | null = null;
    let latestMtime = 0;

    for (const dir of searchDirs) {
      if (!fs.existsSync(dir)) continue;
      try {
        const entries = fs.readdirSync(dir);
        for (const f of entries) {
          if (!f.endsWith('.txt') && !f.endsWith('.log')) continue;
          const fp = path.join(dir, f);
          try {
            const stat = fs.statSync(fp);
            if (stat.mtimeMs > latestMtime) {
              latestMtime = stat.mtimeMs;
              logFile = fp;
            }
          } catch { /* skip unreadable files */ }
        }
      } catch { /* skip unreadable dirs */ }
    }

    if (logFile && fs.existsSync(logFile)) {
      try {
        // 读取最后 1MB 日志
        const stat = fs.statSync(logFile);
        const maxSize = 1024 * 1024;
        const start = Math.max(0, stat.size - maxSize);
        const fd = fs.openSync(logFile, 'r');
        const buf = Buffer.alloc(stat.size - start);
        fs.readSync(fd, buf, 0, buf.length, start);
        fs.closeSync(fd);
        const content = buf.toString('utf-8');
        res.writeHead(200, {
          'Content-Type': 'text/plain; charset=utf-8',
          'X-Log-File': path.basename(logFile),
          'X-Log-Mtime': new Date(latestMtime).toISOString(),
        });
        res.end(content);
      } catch (err) {
        res.writeHead(500, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'Failed to read log file' }));
      }
    } else {
      res.writeHead(404, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'No log file found' }));
    }
  }

  /** 从日志文件解析聊天记录 */
  private getChatLogs(params: URLSearchParams) {
    const logFile = this.findLatestLogFile();
    if (!logFile) return { messages: [], users: [], groups: [] };

    try {
      const stat = fs.statSync(logFile);
      const maxSize = 2 * 1024 * 1024; // 2MB
      const start = Math.max(0, stat.size - maxSize);
      const fd = fs.openSync(logFile, 'r');
      const buf = Buffer.alloc(stat.size - start);
      fs.readSync(fd, buf, 0, buf.length, start);
      fs.closeSync(fd);
      const content = buf.toString('utf-8');

      const messages: Array<{
        time: number;
        groupId: string;
        userId: string;
        nickname: string;
        rawMessage: string;
        messageType: 'text' | 'image' | 'voice' | 'reply' | 'mixed' | 'forward';
        content: string;
        imageUrl?: string;
        voiceText?: string;
        replyTo?: string;
        replyId?: string;
        replyContent?: string;
        forwardId?: string;
        messageId?: string;
      }> = [];

      // 昵称缓存：userId -> nickname
      const nicknameMap = new Map<string, string>();
      const userMap = new Map<string, string>();
      const groupSet = new Set<string>();

      // 匹配被动插话: 📨 [被动插话] 群1080352376 昵称: 内容
      const chatRe = /^📨 \[被动插话\] 群(\d+) (.+?): (.+)$/;
      // 匹配被动回复: 📨 [被动回复] -> 群1080352376: 内容
      const botReplyRe = /^📨 \[被动回复\] -> 群(\d+): (.+)$/;
      // 匹配AI插聊: 💬 [AI插聊|...] -> 群1080352376: 内容
      const aiChatRe = /^💬 \[AI插聊[^\]]*\] -> 群(\d+): (.+)$/;
      // 匹配消息事件: 📩 收到消息事件: type=group, group_id=xxx, user_id=xxx, message_id=xxx
      const msgEventRe = /^📩 收到消息事件: type=group, group_id=(\d+), user_id=(\d+)(?:, message_id=(\d+))?$/;
      // 匹配raw_message: raw_message: [CQ:xxx] 或纯文本
      const rawMsgRe = /^   raw_message: (.+)$/;
      // 匹配语音发送: [@语音] 群xxx 语音追加发送成功
      const voiceSendRe = /^\[@语音\] 群(\d+) 语音追加发送成功$/;
      // 匹配STT结果: [STT] 识别结果: xxx
      const sttRe = /^\[STT\] 识别结果: (.+)$/;
      // 匹配更上层的识别摘要日志: 🎤 [语音识别] 昵称: "内容"
      const sttSummaryRe = /^🎤 \[语音识别\] (.+?): "(.+)"$/;

      const lines = content.split('\n');
      let pendingUserId = '';
      let pendingGroupId = '';
      let pendingTime = 0;
      let pendingMessageId = '';

      const normalizeVoiceText = (value: string): string => {
        const text = String(value || '').trim();
        if (!text) return '';
        return text.replace(/^["“”]+|["“”]+$/g, '').trim();
      };

      const findNearbyVoiceTranscript = (
        startIndex: number,
        messageTime: number,
        nickname: string,
      ): string | undefined => {
        let crossedIntoAnotherEvent = false;
        for (let j = startIndex + 1; j < Math.min(startIndex + 80, lines.length); j++) {
          const nextLine = lines[j].trim();
          if (!nextLine.startsWith('{')) continue;
          try {
            const nextObj = JSON.parse(nextLine);
            const nextMsg = String(nextObj.msg || '');
            const nextTime = nextObj.time || 0;

            if (nextMsg.match(msgEventRe)) {
              crossedIntoAnotherEvent = true;
              continue;
            }

            if (messageTime > 0 && nextTime > 0 && nextTime - messageTime > 15000) {
              break;
            }

            if (crossedIntoAnotherEvent && nextMsg.startsWith('   raw_message:')) {
              const rawMatch = nextMsg.match(rawMsgRe);
              const otherRaw = rawMatch ? rawMatch[1] : nextMsg;
              if (otherRaw.includes('[CQ:record,') || otherRaw.includes('[CQ:voice,')) {
                break;
              }
            }

            const sttMatch = nextMsg.match(sttRe);
            if (sttMatch) {
              const sttText = normalizeVoiceText(sttMatch[1]);
              if (sttText) return sttText;
            }

            const sttSummaryMatch = nextMsg.match(sttSummaryRe);
            if (sttSummaryMatch) {
              const sttNickname = String(sttSummaryMatch[1] || '').trim();
              const sttText = normalizeVoiceText(sttSummaryMatch[2]);
              if (sttText && (!nickname || !sttNickname || sttNickname === nickname)) {
                return sttText;
              }
            }
          } catch {
            continue;
          }
        }
        return undefined;
      };

      // 第一遍：收集 昵称->userId 映射（单遍扫描，向前回溯最多20行）
      // 被动插话日志紧跟在 消息事件+raw_message 之后
      for (let i = 0; i < lines.length; i++) {
        const line = lines[i].trim();
        if (!line.startsWith('{')) continue;
        let logObj: any;
        try { logObj = JSON.parse(line); } catch { continue; }
        const msg = String(logObj.msg || '');
        const chatMatch = msg.match(chatRe);
        if (chatMatch) {
          const chatGroupId = chatMatch[1];
          const chatNick = chatMatch[2];
          const chatTime = logObj.time || 0;
          // 向前查找对应的消息事件（同一群组、时间差<500ms、最多回溯20行）
          for (let k = i - 1; k >= Math.max(0, i - 20); k--) {
            const prevLine = lines[k].trim();
            if (!prevLine.startsWith('{')) continue;
            try {
              const prevObj = JSON.parse(prevLine);
              const prevMsg = String(prevObj.msg || '');
              const prevTime = prevObj.time || 0;
              // 消息事件行：时间戳匹配且群组匹配
              if (prevMsg.startsWith('📩 收到消息事件:') && prevMsg.includes('group_id=' + chatGroupId) && Math.abs(prevTime - chatTime) < 500) {
                const prevMatch = prevMsg.match(msgEventRe);
                if (prevMatch) {
                  const uid = prevMatch[2]; // group_id=xxx, user_id=xxx -> group(1), user(2), msgid(3)
                  nicknameMap.set(uid, chatNick);
                  userMap.set(uid, chatNick);
                  break;
                }
              }
            } catch { continue; }
          }
        }
      }

      // 第二遍：逐行解析消息
      for (let i = 0; i < lines.length; i++) {
        const line = lines[i].trim();
        if (!line.startsWith('{')) continue;

        let logObj: any;
        try { logObj = JSON.parse(line); } catch { continue; }

        const msg = String(logObj.msg || '');
        const time = logObj.time || 0;

        // 处理消息事件行
        const msgMatch = msg.match(msgEventRe);
        if (msgMatch) {
          pendingGroupId = msgMatch[1];
          pendingUserId = msgMatch[2];
          pendingMessageId = msgMatch[3] || '';
          pendingTime = time;
          continue;
        }

        // 查找下几行的 raw_message
        if (pendingUserId && msg.startsWith('   raw_message:')) {
          const raw = msg.replace(/^   raw_message: /, '');
          const rawMsgMatch = raw.match(rawMsgRe);
          const rawContent = rawMsgMatch ? rawMsgMatch[1] : raw;

          // 判断消息类型
          let messageType: 'text' | 'image' | 'voice' | 'reply' | 'mixed' | 'forward' = 'text';
          let content = rawContent;
          let imageUrl: string | undefined;
          let replyTo: string | undefined;
          let replyId: string | undefined;
          let replyContent: string | undefined;
          let forwardId: string | undefined;

          // HTML解码
          content = content.replace(/&#91;/g, '[').replace(/&#93;/g, ']');

          // 检测合并转发
          if (content.includes('[CQ:forward,')) {
            const fwdMatch = content.match(/\[CQ:forward,id=([^\]]+)\]/);
            if (fwdMatch) forwardId = fwdMatch[1];
            messageType = 'forward';
            content = '[合并转发消息]';
          } else if (content.includes('[CQ:image,')) {
            // 图片消息
            const urlMatch = content.match(/url=([^\],]+)/);
            const summaryMatch = content.match(/summary=([^\],]+)/);
            if (urlMatch) imageUrl = urlMatch[1];
            const summary = summaryMatch ? summaryMatch[1] : '';
            // 提取回复引用信息（如果有的话）
            const replyMatch = content.match(/\[CQ:reply,id=([^\]]+)\]/);
            if (replyMatch) replyId = replyMatch[1];

            if (content.includes('[CQ:reply,') || content.includes('[CQ:at,')) {
              messageType = 'mixed';
              // 提取回复引用和文字
              const textParts = content.replace(/\[CQ:reply,id=[^\]]*\]/g, '').replace(/\[CQ:at,qq=[^\]]*\]/g, '').replace(/\[CQ:image,[^\]]*\]/g, '').trim();
              content = textParts || '';
              if (replyId) {
                replyTo = 'replied';
              }
            } else {
              messageType = 'image';
              content = summary || '[图片消息]';
            }
          } else if (content.includes('[CQ:record,')) {
            messageType = 'voice';
            content = '[语音消息]';
            const currentNickname = nicknameMap.get(pendingUserId) || '';
            const voiceText = findNearbyVoiceTranscript(i, pendingTime, currentNickname);
            if (voiceText) {
              content = voiceText;
            }
            messages.push({
              time: pendingTime,
              groupId: pendingGroupId,
              userId: pendingUserId,
              nickname: currentNickname,
              rawMessage: rawContent,
              messageType,
              content: content || '[语音消息]',
              voiceText,
              messageId: pendingMessageId,
            });

            groupSet.add(pendingGroupId);
            pendingUserId = '';
            pendingGroupId = '';
            pendingTime = 0;
            pendingMessageId = '';
            continue;
          } else if (content.includes('[CQ:reply,')) {
            messageType = 'reply';
            const replyMatch = content.match(/\[CQ:reply,id=([^\]]+)\]/);
            if (replyMatch) replyId = replyMatch[1];
            replyTo = 'replied';
            // 提取回复的实际文字内容（replyContent 由前端通过 messageId 精确匹配填充）
            const actualContent = content.replace(/\[CQ:reply,id=[^\]]*\]/g, '').replace(/\[CQ:at,qq=[^\]]*\]/g, '').trim();
            content = actualContent || '';
          } else if (content.includes('[CQ:at,')) {
            messageType = 'text';
            content = content.replace(/\[CQ:at,qq=[^\]]*\]/g, '').trim();
          }

          messages.push({
            time: pendingTime,
            groupId: pendingGroupId,
            userId: pendingUserId,
            nickname: nicknameMap.get(pendingUserId) || '',
            rawMessage: rawContent,
            messageType,
            content: content || '[未知消息]',
            imageUrl,
            replyTo,
            replyId,
            forwardId,
            messageId: pendingMessageId,
          });

          groupSet.add(pendingGroupId);
          pendingUserId = '';
          pendingGroupId = '';
          pendingTime = 0;
          pendingMessageId = '';
          continue;
        }

        // 处理被动插话（已有昵称）
        // 跳过已通过 消息事件+raw_message 处理过的消息（避免重复）
        const chatMatch = msg.match(chatRe);
        if (chatMatch) {
          // 检查是否已通过消息事件处理过（时间差<500ms）
          const chatTime = logObj.time || 0;
          // 查找前面是否有同时间戳的 raw_message 行已被处理
          for (let k = i - 1; k >= Math.max(0, i - 5); k--) {
            try {
              const prevObj = JSON.parse(lines[k].trim());
              const prevMsg = String(prevObj.msg || '');
              const prevTime = prevObj.time || 0;
              if (prevMsg.startsWith('   raw_message:') && Math.abs(prevTime - chatTime) < 500) {
                // 已处理过，跳过避免重复
                break;
              }
              if (prevMsg.startsWith('📩 收到消息事件:') && Math.abs(prevTime - chatTime) < 500) {
                // 未找到对应的 raw_message 行，可能是格式不同的消息，仅补全昵称
                const prevM = prevMsg.match(msgEventRe);
                if (prevM) {
                  const uid = prevM[2]; // user_id 捕获组（第2个）
                  if (!nicknameMap.has(uid)) {
                    nicknameMap.set(uid, chatMatch[2]);
                    userMap.set(uid, chatMatch[2]);
                  }
                }
                break;
              }
            } catch { break; }
          }
          continue;
        }

        // 处理机器人回复
        const botMatch = msg.match(botReplyRe);
        if (botMatch) {
          messages.push({
            time,
            groupId: botMatch[1],
            userId: 'bot',
            nickname: 'Claw',
            rawMessage: msg,
            messageType: 'text',
            content: botMatch[2],
          });
          groupSet.add(botMatch[1]);
          continue;
        }

        // 处理AI插聊
        const aiMatch = msg.match(aiChatRe);
        if (aiMatch) {
          messages.push({
            time,
            groupId: aiMatch[1],
            userId: 'bot',
            nickname: 'Claw',
            rawMessage: msg,
            messageType: 'text',
            content: aiMatch[2],
          });
          groupSet.add(aiMatch[1]);
          continue;
        }

        // 处理语音发送（机器人发的语音）
        const voiceMatch = msg.match(voiceSendRe);
        if (voiceMatch) {
          // 查找前几行的TTS内容作为语音文字
          let voiceContent = '[语音消息]';
          for (let j = i - 1; j >= Math.max(0, i - 5); j--) {
            try {
              const prevObj = JSON.parse(lines[j].trim());
              const prevMsg = String(prevObj.msg || '');
              if (prevMsg.startsWith('📨 [被动回复]') || prevMsg.startsWith('💬 [AI')) {
                const replyContent = prevMsg.match(/-> 群\d+: (.+)$/);
                if (replyContent) { voiceContent = replyContent[1]; break; }
              }
            } catch { break; }
          }
          messages.push({
            time,
            groupId: voiceMatch[1],
            userId: 'bot',
            nickname: 'Claw',
            rawMessage: msg,
            messageType: 'voice',
            content: voiceContent,
            voiceText: voiceContent,
          });
          continue;
        }
      }

      // 排序按时间
      messages.sort((a, b) => a.time - b.time);

      return {
        messages: messages.slice(-500), // 返回最近500条
        users: Array.from(userMap.values()),
        groups: Array.from(groupSet),
      };
    } catch (err: any) {
      return { messages: [], users: [], groups: [], error: err.message };
    }
  }

  /** 查找最新的日志文件 */
  private findLatestLogFile(): string | null {
    const searchDirs = [
      path.resolve(process.cwd(), '日志'),
      path.resolve(process.cwd(), 'logs'),
      path.resolve(process.cwd(), 'log'),
    ];

    let logFile: string | null = null;
    let latestMtime = 0;

    for (const dir of searchDirs) {
      if (!fs.existsSync(dir)) continue;
      try {
        const entries = fs.readdirSync(dir);
        for (const f of entries) {
          if (!f.endsWith('.txt') && !f.endsWith('.log')) continue;
          const fp = path.join(dir, f);
          try {
            const stat = fs.statSync(fp);
            if (stat.mtimeMs > latestMtime) {
              latestMtime = stat.mtimeMs;
              logFile = fp;
            }
          } catch { /* skip */ }
        }
      } catch { /* skip */ }
    }

    return logFile;
  }

  /** 获取状态数据 */
  private getStatusData() {
    return {
      ...this.status,
      astrbot: this.astrbotStatusProvider?.() || null,
      activeGroups: Array.from(this.status.activeGroups),
      uptime: this.getUptime(),
      memoryUsage: process.memoryUsage(),
    };
  }

  /** 获取配置数据（只读视图） */
  private getConfigData() {
    return {
      wsUrl: config.wsUrl,
      botQq: config.botQq ? String(config.botQq) : '',
      botNickname: config.botNickname || '',
      atTrigger: config.atTrigger,
      aiModel: config.aiModel,
      aiBaseUrl: config.aiBaseUrl,
      ttsEnabled: config.ttsEnabled,
      ttsProvider: config.ttsProvider,
      ttsServiceUrl: config.ttsServiceUrl,
      ttsBackend: config.ttsBackend,
      ttsModel: config.ttsModel,
      ttsModelDir: config.ttsModelDir,
      ttsVoice: config.ttsVoice,
      ttsSpeed: config.ttsSpeed,
      ttsReplyMode: config.ttsReplyMode,
      ttsStyle: config.ttsStyle,
      ttsSanitizeWhitelist: config.ttsSanitizeWhitelist,
      ttsSanitizeBlacklist: config.ttsSanitizeBlacklist,
      ttsPreviewText: config.ttsPreviewText,
      ttsTimeoutMs: config.ttsTimeoutMs,
      ttsFallbackToBaidu: config.ttsFallbackToBaidu,
      ttsRuntimePolicy: config.ttsRuntimePolicy,
      ttsFallbackChain: config.ttsFallbackChain,
      ttsLongTextPreferredBackend: config.ttsLongTextPreferredBackend,
      ttsLongTextThreshold: config.ttsLongTextThreshold,
      ttsRvcShortTextMaxLength: config.ttsRvcShortTextMaxLength,
      ttsExperimentalRvcEnabled: config.ttsExperimentalRvcEnabled,
      ttsDefaultCharacter: config.ttsDefaultCharacter,
      ttsCharacterModelMap: config.ttsCharacterModelMap,
      ttsGroupVoiceRoleMap: config.ttsGroupVoiceRoleMap,
      sttEnabled: config.sttEnabled,
      sttModel: config.sttModel,
      maxHistory: config.maxHistory,
      scheduleGroups: config.scheduleGroups,
      groupWhitelist: config.groupWhitelist,
      astrbotQq: config.astrbotQq,
      astrbotEnabledComplexTasks: config.astrbotEnabledComplexTasks,
      astrbotComplexTaskKeywords: config.astrbotComplexTaskKeywords,
      astrbotComplexTaskGroupAllowlist: config.astrbotComplexTaskGroupAllowlist,
      astrbotComplexTaskGroupDenylist: config.astrbotComplexTaskGroupDenylist,
      astrbotComplexTaskGroupRouteOverrides: config.astrbotComplexTaskGroupRouteOverrides,
      astrbotComplexTaskMinLength: config.astrbotComplexTaskMinLength,
      astrbotTimeoutMs: config.astrbotTimeoutMs,
      astrbotFallbackToLocal: config.astrbotFallbackToLocal,
      logLevel: config.logLevel,
      selfLearningEnabled: config.selfLearning.enabled,
      selfLearningDataDir: config.selfLearning.dataDir,
      selfLearningTargets: config.selfLearning.targetQqList,
      selfLearningBlacklist: config.selfLearning.targetBlacklist,
      selfLearningMinMessages: config.selfLearning.minMessagesForLearning,
      selfLearningMaxBatch: config.selfLearning.maxMessagesPerBatch,
      selfLearningIntervalHours: config.selfLearning.learningIntervalHours,
      selfLearningEnableMl: config.selfLearning.enableMlAnalysis,
      selfLearningMaxMlSample: config.selfLearning.maxMlSampleSize,
      selfLearningTotalAffectionCap: config.selfLearning.totalAffectionCap,
      selfLearningMaxUserAffection: config.selfLearning.maxUserAffection,
      selfLearningDbType: config.selfLearning.dbType,
      selfLearningDbFile: config.selfLearning.dbFile,
      selfLearningMysqlUrl: config.selfLearning.mysqlUrl,
      selfLearningPostgresUrl: config.selfLearning.postgresUrl,
    };
  }

  /** 获取统计数据 */
  private getStatsData() {
    return {
      messagesPerMinute: this.calculateRate(this.status.totalMessages),
      aiCallsPerMinute: this.calculateRate(this.status.totalAiCalls),
      uptime: this.getUptime(),
      process: {
        pid: process.pid,
        platform: process.platform,
        nodeVersion: process.version,
        memory: Math.round(process.memoryUsage().heapUsed / 1024 / 1024) + 'MB',
        cpuUsage: process.cpuUsage(),
      },
    };
  }

  /** 更新 .env 配置文件 */
  private updateEnvConfig(updates: Record<string, string>): void {
    const envPath = path.resolve(process.cwd(), '.env');

    try {
      let lines: string[] = [];
      if (fs.existsSync(envPath)) {
        lines = fs.readFileSync(envPath, 'utf-8').split(/\r?\n/);
      }

      const existingKeys = new Set<string>();

      for (let i = 0; i < lines.length; i++) {
        const match = lines[i].match(/^([A-Z_]+)\s*=\s*(.*)/);
        if (match && updates[match[1]] !== undefined) {
          lines[i] = `${match[1]}=${updates[match[1]]}`;
          existingKeys.add(match[1]);
        }
      }

      for (const [key, value] of Object.entries(updates)) {
        if (!existingKeys.has(key)) {
          if (lines.length > 0 && lines[lines.length - 1].trim() !== '') {
            lines.push('');
          }
          lines.push(`${key}=${value}`);
        }
      }

      while (lines.length > 0 && lines[lines.length - 1].trim() === '') {
        lines.pop();
      }

      fs.writeFileSync(envPath, lines.join('\n') + '\n', 'utf-8');

      logger.info(`[Dashboard] Config updated: ${Object.keys(updates).join(', ')}`);
      this.pushLog('system', `配置已更新: ${Object.keys(updates).join(', ')} (需重启生效)`);
    } catch (err: any) {
      logger.error({ err }, '[Dashboard] Failed to update .env');
      this.pushLog('error', `配置更新失败: ${err.message}`);
    }
  }

  /** 处理 SSE 连接 */
  private handleSse(req: http.IncomingMessage, res: http.ServerResponse): void {
    res.writeHead(200, {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      Connection: 'keep-alive',
      'X-Accel-Buffering': 'no',
    });

    res.write(`event: connected\ndata: ${JSON.stringify({ timestamp: new Date().toISOString() })}\n\n`);

    this.sseClients.add(res);

    res.write(`event: status\ndata: ${JSON.stringify({
      type: 'status',
      data: { connected: this.status.connected, reconnectCount: this.status.reconnectCount },
      timestamp: new Date().toISOString(),
    })}\n\n`);

    req.on('close', () => {
      this.sseClients.delete(res);
    });
  }

  /** 解析 POST body */
  private handlePostBody(req: http.IncomingMessage, handler: (body: Record<string, string>) => void): void {
    let body = '';
    req.on('data', (chunk) => { body += chunk; });
    req.on('end', () => {
      try {
        handler(JSON.parse(body));
      } catch {
        req.destroy();
      }
    });
  }

  private handleApi(res: http.ServerResponse, handler: () => any): void {
    try {
      const data = handler();
      res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
      res.end(JSON.stringify(data));
    } catch (err: any) {
      res.writeHead(500, { 'Content-Type': 'application/json; charset=utf-8' });
      res.end(JSON.stringify({ error: err.message }));
    }
  }

  private isLocalRequest(req: http.IncomingMessage): boolean {
    const remoteAddress = req.socket.remoteAddress || '';
    return ['127.0.0.1', '::1', '::ffff:127.0.0.1'].includes(remoteAddress);
  }

  private getUptime(): string {
    const diff = Date.now() - new Date(this.status.startTime).getTime();
    const seconds = Math.floor(diff / 1000);
    const minutes = Math.floor(seconds / 60);
    const hours = Math.floor(minutes / 60);
    const days = Math.floor(hours / 24);

    if (days > 0) return `${days}天 ${hours % 24}:${minutes % 60}:${seconds % 60}`;
    if (hours > 0) return `${hours}小时 ${minutes % 60}分${seconds % 60}秒`;
    if (minutes > 0) return `${minutes}分${seconds % 60}秒`;
    return `${seconds}秒`;
  }

  private calculateRate(total: number): number {
    const elapsed = (Date.now() - new Date(this.status.startTime).getTime()) / 60000;
    return elapsed > 0 ? Math.round(total / elapsed) : 0;
  }

  /**
   * 提供 Dashboard HTML 页面（从文件读取，避免模板字符串中的隐藏字符问题）
   */
  private serveDashboardHtml(res: http.ServerResponse): void {
    this.serveHtmlFile(res, 'dashboard-preview.html', '[Dashboard] Failed to read dashboard HTML');
  }

  private serveLogAnalyzerHtml(res: http.ServerResponse): void {
    this.serveHtmlFile(res, 'log-analyzer.html', '[Dashboard] Failed to read log analyzer HTML');
  }

  private serveHtmlFile(res: http.ServerResponse, fileName: string, logLabel: string): void {
    // 按优先级尝试多个路径：项目根目录、exe 同目录、当前工作目录
    const candidates = this.getRootCandidates(fileName);

    let htmlPath: string | null = null;
    for (const p of candidates) {
      try {
        if (fs.existsSync(p)) { htmlPath = p; break; }
      } catch { /* skip */ }
    }

    if (!htmlPath) {
      res.writeHead(500, { 'Content-Type': 'text/plain; charset=utf-8' });
      res.end('Dashboard HTML file not found. Searched:\n' + candidates.join('\n'));
      return;
    }

    fs.readFile(htmlPath, 'utf-8', (err, data) => {
      if (err) {
        logger.error({ err }, logLabel);
        res.writeHead(500, { 'Content-Type': 'text/plain; charset=utf-8' });
        res.end(`Failed to read ${fileName}: ` + err.message);
        return;
      }
      res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
      res.end(data);
    });
  }

  private serveStaticAsset(res: http.ServerResponse, urlPath: string, assetDir: 'dashboard-assets' | 'log-analyzer-assets'): void {
    const relativePath = urlPath.replace(new RegExp(`^/${assetDir}/`), '');
    if (!relativePath || relativePath.includes('..')) {
      res.writeHead(400, { 'Content-Type': 'text/plain; charset=utf-8' });
      res.end('Invalid asset path');
      return;
    }

    const candidates = this.getRootCandidates(assetDir).map(rootPath => path.join(rootPath, relativePath));
    let assetPath: string | null = null;

    for (const candidate of candidates) {
      try {
        if (fs.existsSync(candidate) && fs.statSync(candidate).isFile()) {
          assetPath = candidate;
          break;
        }
      } catch {
        // skip invalid candidate
      }
    }

    if (!assetPath) {
      res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
      res.end('Asset not found');
      return;
    }

    fs.readFile(assetPath, (err, data) => {
      if (err) {
        logger.error({ err, assetPath }, '[Dashboard] Failed to read static asset');
        res.writeHead(500, { 'Content-Type': 'text/plain; charset=utf-8' });
        res.end('Failed to read asset');
        return;
      }

      res.writeHead(200, { 'Content-Type': this.getContentType(assetPath) });
      res.end(data);
    });
  }

  private getRootCandidates(targetPath: string): string[] {
    return [
      path.join(__dirname, '..', '..', targetPath),
      path.join(path.dirname(process.execPath), targetPath),
      path.resolve(process.cwd(), targetPath),
    ];
  }

  private getContentType(filePath: string): string {
    const ext = path.extname(filePath).toLowerCase();
    switch (ext) {
      case '.css':
        return 'text/css; charset=utf-8';
      case '.js':
        return 'text/javascript; charset=utf-8';
      case '.html':
        return 'text/html; charset=utf-8';
      case '.json':
        return 'application/json; charset=utf-8';
      case '.svg':
        return 'image/svg+xml';
      case '.png':
        return 'image/png';
      case '.jpg':
      case '.jpeg':
        return 'image/jpeg';
      case '.webp':
        return 'image/webp';
      default:
        return 'application/octet-stream';
    }
  }

  /**
   * 停止服务
   */
  stop(): void {
    if (this.statsTimer) {
      clearInterval(this.statsTimer);
      this.statsTimer = null;
    }
    for (const client of this.sseClients) {
      try { client.end(); } catch { /* ignore */ }
    }
    this.sseClients.clear();
    if (this.server) {
      this.server.close();
      this.server = null;
      logger.info('[Dashboard] 控制台已停止');
    }
  }
}
