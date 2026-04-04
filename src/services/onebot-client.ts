import WebSocket from 'ws';
import pino from 'pino';
import { config } from '../types/config';
import type {
  OneBotMessage,
  ApiResponse,
  SendGroupMsgResponse,
} from '../types/onebot';

const logger = pino({ level: config.logLevel });

type MessageHandler = (msg: OneBotMessage) => void;

/**
 * OneBot WebSocket 客户端
 * 负责连接OneBot实现并收发消息
 */
export class OneBotClient {
  private ws: WebSocket | null = null;
  private handlers: MessageHandler[] = [];
  private reconnectAttempts = 0;
  private maxReconnectAttempts = 50; // 增加重连次数
  private heartbeatInterval: ReturnType<typeof setInterval> | null = null;
  /** 主消息处理器（绑定在ws上） */
  private boundMainHandler: ((data: WebSocket.Data) => void) | null = null;

  /**
   * 连接WebSocket - 支持多种路径格式
   */
  connect(): Promise<void> {
    return new Promise((resolve, reject) => {
      let baseUrl = config.wsUrl.trim();
      
      // 移除末尾斜杠
      if (baseUrl.endsWith('/')) {
        baseUrl = baseUrl.slice(0, -1);
      }

      // 尝试多个可能的路径（NapCat常用）
      const pathsToTry = ['', '/', '/onebot', '/api', '/ws'];
      let currentPathIndex = 0;

      const tryConnect = () => {
        if (currentPathIndex >= pathsToTry.length) {
          reject(new Error(`所有路径都尝试失败，请确认 NapCat 已开启正向 WebSocket 服务`));
          return;
        }

        const path = pathsToTry[currentPathIndex];
        const url = config.accessToken && path === ''
          ? `${baseUrl}/?access_token=${config.accessToken}`
          : `${baseUrl}${path}${config.accessToken ? `?access_token=${config.accessToken}` : ''}`;

        logger.info(`🔗 正在连接 OneBot (${currentPathIndex + 1}/${pathsToTry.length}): ${url}`);

        try {
          this.ws = new WebSocket(url);
        } catch (e) {
          currentPathIndex++;
          setTimeout(tryConnect, 500);
          return;
        }

        const connectionTimeout = setTimeout(() => {
          logger.warn(`  → ${url || '/'} 超时，尝试下一个...`);
          this.ws?.removeAllListeners();
          this.ws?.close();
          currentPathIndex++;
          setTimeout(tryConnect, 500);
        }, 5000);

        this.ws.on('open', () => {
          clearTimeout(connectionTimeout);
          logger.info(`✅ OneBot WebSocket 已连接: ${url}`);
          this.reconnectAttempts = 0;
          
          // 发送握手/鉴权（部分OneBot实现需要）
          this.sendHandshake();
          
          this.startHeartbeat();
          resolve();
        });

        this.ws.on('message', (data: WebSocket.Data) => {
          try {
            const raw = data.toString();
            const json = JSON.parse(raw);
            
            // 日志：打印所有消息类型
            if (json.post_type === 'message') {
              logger.info(`📩 收到消息事件: type=${json.message_type}, group_id=${json.group_id}, user_id=${json.user_id}`);
              logger.debug(`   message内容: ${JSON.stringify(json.message).substring(0, 200)}`);
              logger.debug(`   raw_message: ${(json.raw_message || '').substring(0, 100)}`);
              this.emit(json as OneBotMessage);
            } else {
              // 其他事件（心跳等）只debug级别
              logger.debug(`收到事件: ${json.post_type}/${json.meta_event_type || json.sub_type || ''}`);
            }
          } catch (e) {
            logger.debug(`收到非JSON数据: ${data.toString().substring(0, 50)}`);
          }
        });

        // 保存主消息处理器引用（用于API调用后恢复）
        const currentWs = this.ws;
        const mainListeners = currentWs.listeners('message');
        this.boundMainHandler = mainListeners[mainListeners.length - 1] as (data: WebSocket.Data) => void;

        this.ws.on('close', (code, reason) => {
          clearTimeout(connectionTimeout);
          const reasonStr = reason?.toString() || '无原因';
          logger.warn(`WebSocket 断开: code=${code}, reason=${reasonStr}, url=${url}`);
          this.stopHeartbeat();
          
          // 只有当前路径失败才尝试下一个，已连接成功后的断开走重连逻辑
          if (!this.reconnectAttempts && currentPathIndex < pathsToTry.length - 1) {
            currentPathIndex++;
            logger.info(`尝试下一个路径...`);
            setTimeout(tryConnect, 500);
          } else {
            this.handleReconnect();
          }
        });

        this.ws.on('error', (error: Error) => {
          clearTimeout(connectionTimeout);
          logger.warn(`  → ${url} 连接错误: ${error.message}`);
          
          if (this.reconnectAttempts === 0 && currentPathIndex < pathsToTry.length - 1) {
            currentPathIndex++;
            setTimeout(tryConnect, 500);
          } else {
            reject(error);
          }
        });
      };

      tryConnect();
    });
  }

  /**
   * 发送握手消息（部分实现需要）
   */
  private sendHandshake(): void {
    // 某些OneBot实现需要在连接后发送特定格式
    // 这里保持兼容性
  }

  /**
   * 注册消息处理器
   */
  onMessage(handler: MessageHandler): void {
    this.handlers.push(handler);
  }

  /**
   * 发送群消息
   */
  async sendGroupMsg(groupId: number, message: string): Promise<SendGroupMsgResponse> {
    return this.callApi<SendGroupMsgResponse>('send_group_msg', {
      group_id: groupId,
      message,
    });
  }

  /**
   * 发送群语音消息
   */
  async sendGroupRecord(groupId: number, recordCq: string): Promise<SendGroupMsgResponse> {
    return this.callApi<SendGroupMsgResponse>('send_group_msg', {
      group_id: groupId,
      message: recordCq,
    });
  }

  /**
   * 调用OneBot API (使用OneBot v11 API格式)
   */
  private callApi<T>(action: string, params: any): Promise<T> {
    return new Promise((resolve, reject) => {
      if (!this.ws || this.ws.readyState !== WebSocket.OPEN) {
        reject(new Error('WebSocket未连接'));
        return;
      }

      const id = Date.now() + Math.random();
      
      // OneBot v11 WebSocket API 格式
      const payload = JSON.stringify({
        action: action,
        params: params,
        echo: id,
      });

      logger.debug(`发送API请求: ${action}`);

      // 监听响应
      const handler = (data: WebSocket.Data) => {
        try {
          const res: any = JSON.parse(data.toString());
          // API响应包含echo字段
          if (res.echo === id) {
            this.ws?.off('message', handler); // 只移除API监听器，不删除主消息处理器
            
            if (res.retcode === 0 || res.status === 'ok') {
              resolve(res.data ?? res);
            } else {
              reject(new Error(`API错误 [${action}]: retcode=${res.retcode}, msg=${res.msg || res.message || JSON.stringify(res)}`));
            }
          }
        } catch {}
      };

      // 临时添加监听
      this.ws.on('message', handler);
      
      // 超时处理
      setTimeout(() => {
        this.ws?.off('message', handler);
        reject(new Error(`API调用超时: ${action}`));
      }, 15000); // 延长超时到15秒

      this.ws.send(payload);
    });
  }

  /**
   * 重新绑定消息处理handler
   * 如果主消息监听器被意外移除，恢复它
   */
  private rebindMessageHandler(): void {
    if (this.ws && this.boundMainHandler && this.ws.listeners('message').length === 0) {
      this.ws.on('message', this.boundMainHandler);
      logger.debug('已恢复主消息处理器');
    }
  }

  /**
   * 分发消息到所有处理器
   */
  private emit(msg: OneBotMessage): void {
    for (const handler of this.handlers) {
      try {
        handler(msg);
      } catch (e) {
        logger.error({ error: e }, '消息处理器异常');
      }
    }
  }

  /**
   * 心跳保活
   */
  private startHeartbeat(): void {
    this.heartbeatInterval = setInterval(() => {
      if (this.ws?.readyState === WebSocket.OPEN) {
        try {
          this.ws.ping();
        } catch (e) {
          // 忽略ping错误
        }
      }
    }, 25000); // 25秒一次心跳
  }

  private stopHeartbeat(): void {
    if (this.heartbeatInterval) {
      clearInterval(this.heartbeatInterval);
      this.heartbeatInterval = null;
    }
  }

  /**
   * 自动重连
   */
  private handleReconnect(): void {
    if (this.reconnectAttempts >= this.maxReconnectAttempts) {
      logger.error('达到最大重连次数，停止重连');
      process.exit(1);
    }

    this.reconnectAttempts++;
    const delay = Math.min(2000 * Math.pow(1.5, this.reconnectAttempts), 60000);
    
    logger.info(`${Math.round(delay / 1000)}s 后尝试第 ${this.reconnectAttempts} 次重连...`);
    
    setTimeout(() => {
      // 重连时只尝试已知成功的配置
      this.connectForReconnect().catch(() => {});
    }, delay);
  }

  /**
   * 重连时直接连接（不再遍历路径）
   */
  private connectForReconnect(): Promise<void> {
    return new Promise((resolve, reject) => {
      const url = config.accessToken
        ? `${config.wsUrl}?access_token=${config.accessToken}`
        : config.wsUrl;

      logger.info(`🔗 重连中: ${url}`);

      this.ws = new WebSocket(url);

      this.ws.on('open', () => {
        logger.info('✅ 重连成功！');
        this.reconnectAttempts = 0;
        this.startHeartbeat();
        resolve();
      });

      this.ws.on('message', (data: WebSocket.Data) => {
        try {
          const raw = data.toString();
          const json = JSON.parse(raw);
          
          if (json.post_type === 'message') {
            logger.info(`📩 收到消息事件: type=${json.message_type}, group_id=${json.group_id}, user_id=${json.user_id}`);
            this.emit(json as OneBotMessage);
          } else {
            logger.debug(`收到事件: ${json.post_type}/${json.meta_event_type || json.sub_type || ''}`);
          }
        } catch (e) {
          logger.debug(`收到非JSON数据: ${data.toString().substring(0, 50)}`);
        }
      });

      // 保存主消息处理器引用
      const reconnectWs = this.ws;
      const reconnListeners = reconnectWs.listeners('message');
      this.boundMainHandler = reconnListeners[reconnListeners.length - 1] as (data: WebSocket.Data) => void;

      this.ws.on('close', (code, reason) => {
        logger.warn({ code, reason }, '重连断开，继续重试...');
        this.stopHeartbeat();
        this.handleReconnect();
      });

      this.ws.on('error', (error) => {
        logger.error({ error }, '重连出错');
        this.handleReconnect();
      });
    });
  }

  /**
   * 关闭连接
   */
  disconnect(): void {
    this.stopHeartbeat();
    if (this.ws) {
      try {
        this.ws.close(1000, '正常关闭');
      } catch {}
      this.ws = null;
    }
  }
}
