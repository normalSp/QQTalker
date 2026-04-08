import { logger } from '../logger';
import type { OneBotClient } from './onebot-client';

/**
 * 群成员入群欢迎服务
 * 
 * 当有新成员加入群时，自动发送个性化欢迎消息
 */
export class WelcomeService {
  private onebot: OneBotClient;
  
  /** 欢迎语模板库 */
  private readonly templates: string[] = [
    '欢迎 {nickname} 加入本群喵~ ✨ 希望你在这里玩得开心！',
    '哇！{nickname} 来了喵~ 🎉 快来跟大家打个招呼吧~',
    '哟~ {nickname} 加群啦！Claw 代表全体群友欢迎你喵~ 💕',
    '新人 {nickname} 报到！请多指教喵~ 🐾',
    '{nickname} 终于来了！等你好久了喵~ ✨',
    '欢迎欢迎~ {nickname} 是第{count}位加入的小伙伴喵！🎊',
    '呜哇~ 有新朋友 {nickname} 了！快来聊天喵~ (๑•̀ㅂ•́)و✧',
    ' detecting new lifeform... {nickname} detected! 欢迎加入本群喵~ 🤖',
  ];

  constructor(onebot: OneBotClient) {
    this.onebot = onebot;
  }

  /**
   * 发送欢迎消息
   * 
   * @param groupId 群号
   * @param userId 新成员QQ号
   * @param nickname 新成员昵称
   * @param memberCount 当前群成员总数（可选，用于显示"第N位"）
   */
  async sendWelcome(
    groupId: number,
    userId: number,
    nickname: string,
    memberCount?: number
  ): Promise<void> {
    try {
      // 随机选择一个模板
      const template = this.templates[Math.floor(Math.random() * this.templates.length)];
      
      // 填充模板变量
      let message = template
        .replace(/{nickname}/g, nickname || `用户${userId}`)
        .replace(/{count}/g, String(memberCount || '?'));

      await this.onebot.sendGroupMsg(groupId, message);
      
      logger.info(`[Welcome] 欢迎 ${nickname}(${userId}) 加入群${groupId}`);
    } catch (error) {
      logger.warn({ error }, `[Welcome] 发送欢迎消息失败: 群${groupId}`);
    }
  }

  /**
   * 处理群成员增加通知
   * 
   * @param noticeData OneBot notice 事件数据
   */
  async handleGroupIncrease(noticeData: {
    group_id: number;
    user_id: number;
    sub_type?: 'invite' | 'add';
    operator_id?: number;
  }): Promise<void> {
    const { group_id, user_id, sub_type } = noticeData;

    // 获取新成员信息（尝试从事件中获取昵称）
    const nickname = (noticeData as any).nickname || `用户${user_id}`;

    // 邀请入群的语气更热情
    if (sub_type === 'invite') {
      logger.debug(`[Welcome] ${nickname} 被邀请加入群${group_id}`);
    }

    // 发送欢迎消息
    await this.sendWelcome(group_id, user_id, nickname);
  }
}
