import pino from 'pino';

const logger = pino({ level: 'info' });

/**
 * 占卜结果接口
 */
export interface DivinationResult {
  type: string;        // 占卜类型
  title: string;       // 标题
  result: string;      // 结果描述
  score: number;       // 运势评分 1-100
  advice: string;      // 建议
  lucky: string;       // 幸运物/幸运色等
}

/**
 * 术数占卜服务
 * 包含：抽签、运势、塔罗牌风格、梅花易数等
 */
export class DivinationService {

  // ======== 抽签（观音灵签/寺庙求签） ========
  private static readonly LOTS = [
    { sign: '上上签', poem: '仙机点破是和非，好遇春风得所依', meaning: '大吉大利之兆！所求之事必有成喵~', advice: '大胆去做，时机正好', lucky: '🍀 幸运方位：东方', score: 95 },
    { sign: '上吉签', poem: '云开月出光辉现，万里前程任君行', meaning: '前途光明，万事顺遂喵~', advice: '保持信心继续前进', lucky: '✨ 幸运颜色：金色', score: 88 },
    { sign: '中上签', poem: '舟行千里顺风帆，不劳用力到彼岸', meaning: '运势平稳上升，稍加努力即可成功喵~', advice: '稳扎稳打不要急躁', lucky: '🌸 幸运花：樱花', score: 78 },
    { sign: '中平签', poem: '行至水穷处，坐看云起时', meaning: '平平淡淡才是真，当前宜静不宜动喵~', advice: '耐心等待时机成熟', lucky: '🍵 幸运饮品：茶', score: 65 },
    { sign: '中下签', poem: '路逢险处难回避，事到头来不自由', meaning: '近期有些小波折，要多加小心喵~', advice: '低调行事，避免冒险', lucky: '🛡️ 幸运护身符：平安符', score: 45 },
    { sign: '下下签', poem: '雨中行路泥泞滑，且待天晴再出发', meaning: '运势暂时低迷...不过别灰心！否极泰来喵~', advice: '暂时收敛，养精蓄锐', lucky: '🌂 幸运道具：雨伞（心态）', score: 25 },
  ];

  // ======== 塔罗牌风格 ========
  private static readonly TAROT_CARDS = [
    { name: '🌞 The Sun 太阳', upright: '光明、成功、活力满满', meaning: '超级好运降临！今天做什么都顺利喵！✨' },
    { name: '🌙 The Moon 月亮', upright: '直觉、潜意识、神秘', meaning: '跟着感觉走就对了喵~ 灵感会很准的 (｡•̀ᴗ-)✧' },
    { name: '⭐ The Star 星星', upright: '希望、灵感、平静', meaning: '充满希望的时期到了喵~ 梦想会实现的！' },
    { name: '🎀 The Lovers 恋人', upright: '爱情、选择、和谐', meaning: '人际关系超好的日子喵~ 也许会有桃花呢 ♡' },
    { name: '⚡ The Lightning 雷霆', upright: '突变、启示、觉醒', meaning: '可能会有意外惊喜喵？！保持开放的心态喵！' },
    { name: '🔮 The Magician 魔术师', upright: '创造力、技术、能力', meaning: '能力值MAX的日子！什么都能搞定喵~ (๑•̀ㅂ•)و✧' },
    { name: '👑 The Empress 女皇', upright: '丰饶、美丽、自然', meaning: '温柔而强大的能量包围着你喵~ 今天很迷人呢' },
    { name: '🎭 The Fool 愚者', upright: '新开始、冒险、纯真', meaning: '新的开始！勇敢迈出去吧主人喵~ Claw支持你！' },
    { name: '🗝️ The Hierophant 教皇', upright: '传统、智慧、指引', meaning: '向有经验的人请教会有收获喵~ 学习的好日子' },
    { name: '🌀 Wheel of Fortune 命运之轮', upright: '转折、命运、周期', meaning: '命运在转动喵！时来运转的好机会要抓住哦~ 🍀' },
    { name: '⚖️ Justice 正义', upright: '公正、真相、平衡', meaning: '公平正义会得到伸张喵~ 做正确的事就好' },
    { name: '🏰 The Tower 高塔', upright: '剧变、崩坏、觉醒', meaning: '可能会有大的变化喵...但变化之后会是新生！加油喵！' },
    { name: '🌱 The Hermit 隐士', upright: '内省、独处、智慧', meaning: '适合一个人静静思考的日子喵~ 内心的答案最重要' },
    { name: '💪 Strength 力量', upright: '勇气、耐心、内在力量', meaning: '你比想象中更强大喵！相信自己喵~！' },
    { name: '🌳 The World 世界', upright: '完成、整合、成就', meaning: '一个阶段的圆满结束喵~ 太棒了主人！🎉' },
    { name: '😈 The Devil 恶魔', upright: '诱惑、执念、束缚', meaning: '小心诱惑喵...要控制住自己哦 (*/ω＼*)' },
    { name: '💀 Death 死神', upright: '结束、转变、重生', meaning: '旧的结束意味着新的开始喵~ 不用害怕改变' },
    { name: '🎐 Temperance 节制', upright: '平衡、适度、耐心', meaning: '保持平衡很重要喵~ 不要太激进也不要太保守' },
    { name: '🚫 The Hanged Man 倒吊人', upright: '牺牲、新视角、等待', meaning: '换个角度看问题吧喵~ 也许会发现新大陆' },
    { name: '🛑 The Emperor 皇帝', upright: '权威、结构、控制', meaning: '掌控全局的能力增强了喵~ 适合做重要决定' },
  ];

  // ======== 今日运势 ========
  private static readonly FORTUNE_AREAS = ['综合运势', '爱情运势', '学业事业', '财富运势', '健康运势'];
  private static readonly FORTUNE_LEVELS = [
    { level: '大吉', stars: '★★★★★', desc: '运势爆棚喵！' },
    { level: '吉', stars: '★★★★☆', desc: '很不错的一天喵~' },
    { level: '中吉', stars: '★★★☆☆', desc: '平平顺顺喵' },
    { level: '小凶', stars: '★★☆☆☆', desc: '有点小波折喵...' },
    { level: '凶', stars: '★☆☆☆☆', desc: '要注意了喵！小心为上' },
  ];
  
  private static readonly LUCKY_ITEMS = {
    color: ['红色', '橙色', '黄色', '绿色', '蓝色', '紫色', '白色', '粉色', '黑色'],
    number: [3, 6, 7, 8, 9, 12, 18, 21, 27, 36, 42, 48, 52, 66, 77, 88, 99],
    direction: ['东', '南', '西', '北', '东南', '东北', '西南', '西北'],
    food: ['蛋糕', '奶茶', '草莓', '巧克力', '寿司', '拉面', '布丁', '冰淇淋'],
    item: ['四叶草', '水晶', '猫咪玩偶', '星星发卡', '幸运硬币'],
  };

  /**
   * 解析占卜命令
   * 支持格式：
   * - "抽签" / "求签"
   * - "占卜" / "算命"
   * - "运势"
   * - "塔罗"
   * - "今日运势"
   */
  parseCommand(text: string): { type: string } | null {
    const cmd = text.toLowerCase().trim();
    
    if (/抽签|求签|观音签|灵签/.test(cmd)) return { type: 'lottery' };
    if (/塔罗|tarot|塔罗牌/.test(cmd)) return { type: 'tarot' };
    if (/今日?运势|今日?运气/.test(cmd)) return { type: 'fortune' };
    if (/占卜|算命|测算|卜卦/.test(cmd)) return { type: 'general' };
    
    return null;
  }

  /**
   * 执行占卜
   */
  divine(type?: string): DivinationResult {
    const divType = type || this.randomPick(['lottery', 'tarot', 'fortune']);
    
    switch (divType) {
      case 'lottery': return this.drawLot();
      case 'tarot': return this.drawTarot();
      case 'fortune': return this.dailyFortune();
      case 'general': return this.generalDivination();
      default: return this.drawLot();
    }
  }

  /**
   * 抽签（观音灵签）
   */
  private drawLot(): DivinationResult {
    // 加权随机：好签概率更高（让用户开心嘛喵~）
    const weights = [15, 20, 25, 20, 15, 5]; // 上上签到下下签的概率
    const idx = this.weightedRandom(weights);
    const lot = DivinationService.LOTS[idx];
    
    return {
      type: '🎋 灵签',
      title: `【${lot.sign}】`,
      result: `${lot.poem}\n\n${lot.meaning}`,
      score: lot.score,
      advice: `💡 ${lot.advice}`,
      lucky: lot.lucky,
    };
  }

  /**
   * 塔罗牌占卜
   */
  private drawTarot(): DivinationResult {
    const card = DivinationService.TAROT_CARDS[
      Math.floor(Math.random() * DivinationService.TAROT_CARDS.length)
    ];
    
    // 随机正位/逆位
    const isUpright = Math.random() > 0.2; // 80%概率正位
    
    return {
      type: ' 🔮 塔罗',
      title: isUpright ? `${card.name} （正位）` : `${card.name} （逆位）`,
      result: isUpright 
        ? card.meaning 
        : `逆位的${card.name.split(' ')[1]}...表示需要反着理解喵~ 可能有一些阻碍需要注意 (*/ω＼*)`,
      score: isUpright ? 60 + Math.floor(Math.random() * 35) : 30 + Math.floor(Math.random() * 30),
      advice: `💡 ${card.upright}`,
      lucky: `🎴 牌意：${card.upright}`,
    };
  }

  /**
   * 今日综合运势
   */
  private dailyFortune(): DivinationResult {
    const areas = [];
    let totalScore = 0;
    
    for (const area of DivinationService.FORTUNE_AREAS) {
      const levelIdx = Math.min(
        DivinationService.FORTUNE_LEVELS.length - 1,
        Math.max(0, Math.floor(this.gaussianRandom() * 2.5))
      );
      const level = DivinationService.FORTUNE_LEVELS[levelIdx];
      totalScore += (levelIdx + 1) * 20;
      areas.push(`  ${area}：${level.stars} ${level.level} - ${level.desc}`);
    }

    // 随机幸运物品
    const colors = this.shuffle([...DivinationService.LUCKY_ITEMS.color]).slice(0, 2);
    const num = DivinationService.LUCKY_ITEMS.number[Math.floor(Math.random() * DivinationService.LUCKY_ITEMS.number.length)];
    const dir = DivinationService.LUCKY_ITEMS.direction[Math.floor(Math.random() * DivinationService.LUCKY_ITEMS.direction.length)];
    const food = DivinationService.LUCKY_ITEMS.food[Math.floor(Math.random() * DivinationService.LUCKY_ITEMS.food.length)];

    return {
      type: ' ✨ 今日运势',
      title: `📅 ${new Date().toLocaleDateString('zh-CN')}`,
      result: areas.join('\n'),
      score: Math.round(totalScore / 5),
      advice: '',
      lucky: `🎨 幸运颜色：${colors.join('、')}\n🔢 幸运数字：${num}\n🧭 幸运方位：${dir}\n🍰 推荐食物：${food}`,
    };
  }

  /**
   * 综合占卜（混合多种方式）
   */
  private generalDivination(): DivinationResult {
    const methods = [
      () => this.drawLot(),
      () => this.drawTarot(),
      () => this.dailyFortune(),
    ];
    return methods[Math.floor(Math.random() * methods.length)]();
  }

  /**
   * 格式化占卜结果为回复文本
   */
  formatResult(r: DivinationResult): string {
    let text = `${r.type} 占卜结果喵~ 🐱\n`;
    text += `${r.title}\n`;
    text += `─────────────────\n`;
    text += `${r.result}\n`;
    if (r.advice) text += `\n${r.advice}\n`;
    text += `\n${r.lucky}\n`;
    text += `─────────────────\n`;
    text += `📊 运势指数：${r.score}/100\n`;
    
    // 根据分数给个总结
    if (r.score >= 80) text += `🎉 超级大吉！主人今天运气爆棚喵！！(๑•̀ㅂ•)و✧`;
    else if (r.score >= 60) text += `😊 运气不错呢喵~ 继续保持 ✨`;
    else if (r.score >= 40) text += `😐 平平淡淡的一天喵...稳住就好`;
    else text += `💪 低谷之后就是反弹！主人加油喵！Claw相信你！`;

    text += `\n（本占卜仅供娱乐参考喵~ 嘿嘿）`;
    return text;
  }

  // ========== 工具方法 ==========

  /** 加权随机 */
  private weightedRandom(weights: number[]): number {
    const sum = weights.reduce((a, b) => a + b, 0);
    let rand = Math.random() * sum;
    for (let i = 0; i < weights.length; i++) {
      rand -= weights[i];
      if (rand <= 0) return i;
    }
    return weights.length - 1;
  }

  /** 高斯分布随机（近似），均值0.5，偏向中间 */
  private gaussianRandom(): number {
    const u = 1 - Math.random();
    const v = Math.random();
    const z = Math.sqrt(-2.0 * Math.log(u)) * Math.cos(2.0 * Math.PI * v);
    // 映射到 0~1 范围，均值约0.5
    return Math.max(0, Math.min(1, z * 0.3 + 0.5));
  }

  /** 随机选取数组元素 */
  private randomPick<T>(arr: T[]): T {
    return arr[Math.floor(Math.random() * arr.length)];
  }

  /** 数组乱序（Fisher-Yates） */
  private shuffle<T>(arr: T[]): T[] {
    for (let i = arr.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [arr[i], arr[j]] = [arr[j], arr[i]];
    }
    return arr;
  }
}
