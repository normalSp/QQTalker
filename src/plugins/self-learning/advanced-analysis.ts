import type { CapturedMessageRecord, MemoryRecord } from './self-learning-store';

export interface StyleInsight {
  userId: number;
  nickname: string;
  dominantTone: string;
  avgLength: number;
  topEndings: string[];
  topFillers: string[];
  signaturePhrases: string[];
}

export interface SlangInsight {
  term: string;
  score: number;
  users: number[];
  meaning: string;
}

export interface SocialInsight {
  sourceUserId: number;
  targetUserId: number;
  relationType: string;
  score: number;
  evidence: string[];
}

export interface MoodTrend {
  primaryMood: string;
  stability: number;
  energy: number;
  positivity: number;
  reason: string;
}

export interface GoalSceneScore {
  scene: string;
  category: string;
  confidence: number;
  matches: number;
  sampleMessages: string[];
}

export interface ClusterInsight {
  id: number;
  label: string;
  keywords: string[];
  messageCount: number;
  users: number[];
  sampleMessages: string[];
  avgSentiment: number;
}

export interface MemoryGraphNode {
  key: string;
  userId: number;
  label: string;
  importance: number;
  tags: string[];
}

export interface MemoryGraphEdge {
  source: string;
  target: string;
  weight: number;
  reason: string;
}

export interface AdvancedLearningReport {
  summary: string;
  styleInsights: StyleInsight[];
  slangInsights: SlangInsight[];
  socialInsights: SocialInsight[];
  moodTrend: MoodTrend;
  sceneScores: GoalSceneScore[];
  clusters: ClusterInsight[];
  memoryGraph: {
    nodes: MemoryGraphNode[];
    edges: MemoryGraphEdge[];
  };
  personaPrompt: string;
}

const stopWords = new Set([
  '今天', '你们', '我们', '就是', '然后', '但是', '因为', '所以', '已经', '一下', '这个', '那个', '真的',
  '什么', '怎么', '可以', '还是', '不是', '一个', '没有', '自己', '感觉', '有点', '一下子', '而且',
]);

const positiveWords = ['喜欢', '开心', '谢谢', '厉害', '可爱', '支持', '棒', '哈哈', '爱你', '恭喜', '牛'];
const negativeWords = ['讨厌', '烦', '滚', '无语', '生气', '焦虑', '难过', '破防', '崩溃', '不想'];

const fillerTokens = ['哈哈', '呜呜', '喵', '捏', '诶嘿', '草', '乐', '啊这', '嘿嘿', '欸', '额'];

const relationRules: Array<{ type: string; keywords: string[]; weight: number }> = [
  { type: 'frequent_interaction', keywords: ['@', '一起', '又来', '回复'], weight: 1.2 },
  { type: 'reply_dialogue', keywords: ['回复', '说的对', '你刚才', '回你'], weight: 1.4 },
  { type: 'topic_discussion', keywords: ['觉得', '话题', '讨论', '一起聊'], weight: 1.1 },
  { type: 'question_answer', keywords: ['请问', '怎么', '回答', '告诉我'], weight: 1.1 },
  { type: 'agreement', keywords: ['同意', '确实', '说得对', '赞成'], weight: 1.2 },
  { type: 'debate', keywords: ['不对', '反对', '杠', '争论'], weight: 1.3 },
  { type: 'friend', keywords: ['朋友', '兄弟', '姐妹', '闺蜜'], weight: 1.5 },
  { type: 'colleague', keywords: ['同事', '项目', '开会', '工作'], weight: 1.2 },
  { type: 'classmate', keywords: ['同学', '考试', '作业', '上课'], weight: 1.3 },
  { type: 'teacher_student', keywords: ['老师', '学生', '讲题'], weight: 1.4 },
  { type: 'family_parent_child', keywords: ['妈妈', '爸爸', '儿子', '女儿'], weight: 1.8 },
  { type: 'family_sibling', keywords: ['哥哥', '姐姐', '弟弟', '妹妹'], weight: 1.6 },
  { type: 'family_relative', keywords: ['亲戚', '表哥', '表姐', '姨妈'], weight: 1.4 },
  { type: 'lover', keywords: ['喜欢你', '爱你', '对象', '恋人'], weight: 2.1 },
  { type: 'married', keywords: ['老公', '老婆', '结婚'], weight: 2.2 },
  { type: 'ambiguous', keywords: ['暧昧', '贴贴', '想你', '宝贝'], weight: 1.9 },
  { type: 'improper', keywords: ['偷情', '地下', '别告诉', '见不得光'], weight: 2.3 },
  { type: 'hostile', keywords: ['讨厌', '滚', '拉黑', '有仇'], weight: 1.8 },
  { type: 'competitor', keywords: ['对手', '竞争', '抢', '比拼'], weight: 1.4 },
  { type: 'admiration', keywords: ['崇拜', '膜拜', '佩服', '仰慕'], weight: 1.5 },
  { type: 'idol_fan', keywords: ['粉丝', '偶像', '追星', '打call'], weight: 1.6 },
  { type: 'supportive', keywords: ['加油', '抱抱', '安慰', '支持你'], weight: 1.4 },
];

const scenes: Array<{ scene: string; category: string; keywords: string[] }> = [
  { scene: 'comfort', category: 'emotion', keywords: ['难过', '伤心', 'emo', '安慰'] },
  { scene: 'venting', category: 'emotion', keywords: ['吐槽', '烦死', '崩溃', '破防'] },
  { scene: 'celebration', category: 'emotion', keywords: ['恭喜', '发财', '中奖了', '爽'] },
  { scene: 'apology', category: 'emotion', keywords: ['抱歉', '对不起', '不好意思', '冒犯'] },
  { scene: 'gratitude', category: 'emotion', keywords: ['谢谢', '感谢', '辛苦了', '多亏'] },
  { scene: 'encouragement', category: 'emotion', keywords: ['加油', '稳住', '你可以', '冲'] },
  { scene: 'flirting', category: 'relationship', keywords: ['贴贴', '宝贝', '想你', '亲亲'] },
  { scene: 'confession', category: 'relationship', keywords: ['喜欢你', '表白', '心动', '恋爱'] },
  { scene: 'relationship_talk', category: 'relationship', keywords: ['对象', '分手', '恋人', '约会'] },
  { scene: 'friendship_talk', category: 'relationship', keywords: ['朋友', '闺蜜', '兄弟', '姐妹'] },
  { scene: 'family_talk', category: 'relationship', keywords: ['家里', '爸妈', '家人', '亲戚'] },
  { scene: 'gossip', category: 'social', keywords: ['听说', '八卦', '真的假的', '吃瓜'] },
  { scene: 'teasing', category: 'social', keywords: ['笑死', '乐子', '草', '整活'] },
  { scene: 'sarcasm', category: 'social', keywords: ['呵呵', '好一个', '真棒呢', '阴阳'] },
  { scene: 'debate', category: 'social', keywords: ['不对', '反对', '辩论', '杠'] },
  { scene: 'question_answer', category: 'info', keywords: ['请问', '怎么', '为什么', '是什么'] },
  { scene: 'help_request', category: 'info', keywords: ['帮我', '求助', '救命', '怎么办'] },
  { scene: 'advice_seek', category: 'info', keywords: ['建议', '方案', '应该', '咋办'] },
  { scene: 'decision_making', category: 'info', keywords: ['选哪个', '决定', '纠结', '要不要'] },
  { scene: 'technical_support', category: 'info', keywords: ['报错', '代码', '接口', 'bug'] },
  { scene: 'planning', category: 'organization', keywords: ['计划', '安排', '明天', '下周'] },
  { scene: 'coordination', category: 'organization', keywords: ['一起', '集合', '几点', '到哪'] },
  { scene: 'event_invite', category: 'organization', keywords: ['来吗', '一起去', '约', '参加'] },
  { scene: 'daily_checkin', category: 'daily', keywords: ['早安', '晚安', '吃了吗', '在吗'] },
  { scene: 'morning_greeting', category: 'daily', keywords: ['早安', '早上好', '起床'] },
  { scene: 'night_chat', category: 'daily', keywords: ['晚安', '熬夜', '睡不着'] },
  { scene: 'food_talk', category: 'daily', keywords: ['奶茶', '吃饭', '火锅', '外卖'] },
  { scene: 'travel_talk', category: 'daily', keywords: ['出门', '旅游', '机票', '酒店'] },
  { scene: 'shopping_talk', category: 'daily', keywords: ['下单', '拼单', '买了', '购物'] },
  { scene: 'health_concern', category: 'daily', keywords: ['生病', '发烧', '难受', '医院'] },
  { scene: 'study_discussion', category: 'study', keywords: ['作业', '考试', '复习', '题目'] },
  { scene: 'work_discussion', category: 'work', keywords: ['需求', '项目', '上线', '会议'] },
  { scene: 'game_discussion', category: 'entertainment', keywords: ['开黑', '游戏', '上分', '抽卡'] },
  { scene: 'entertainment_sharing', category: 'entertainment', keywords: ['电影', '番剧', '综艺', '直播'] },
  { scene: 'meme_talk', category: 'entertainment', keywords: ['表情包', '梗', '乐子', '名场面'] },
  { scene: 'fandom_talk', category: 'entertainment', keywords: ['偶像', '粉丝', '打call', '追星'] },
  { scene: 'reflective_talk', category: 'reflection', keywords: ['想了想', '感觉自己', '反思', '成长'] },
  { scene: 'support_discussion', category: 'reflection', keywords: ['理解你', '陪着你', '我在', '别怕'] },
];

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

function tokenize(text: string): string[] {
  const rawTokens = (text.toLowerCase().match(/[\u4e00-\u9fa5]{2,8}|[a-z0-9]{2,}/g) || [])
    .map(token => token.trim())
    .filter(token => token.length >= 2 && !stopWords.has(token));
  const tokens: string[] = [];
  for (const token of rawTokens) {
    tokens.push(token);
    if (/^[\u4e00-\u9fa5]+$/.test(token) && token.length > 2) {
      for (let i = 0; i <= token.length - 2; i += 1) {
        const bigram = token.slice(i, i + 2);
        if (!stopWords.has(bigram)) tokens.push(bigram);
      }
    }
  }
  return tokens;
}

function sentimentScore(text: string): number {
  const positive = positiveWords.filter(word => text.includes(word)).length;
  const negative = negativeWords.filter(word => text.includes(word)).length;
  return positive - negative;
}

function endingTokens(text: string): string[] {
  const match = text.match(/[!?~。！？，、]+$/);
  return match ? [match[0]] : [];
}

function dominantTone(avgSentiment: number): string {
  if (avgSentiment >= 1.2) return '热情积极';
  if (avgSentiment >= 0.3) return '轻松友好';
  if (avgSentiment <= -1.2) return '强烈负面';
  if (avgSentiment <= -0.3) return '谨慎消极';
  return '平稳自然';
}

function topEntries(map: Map<string, number>, limit: number): string[] {
  return Array.from(map.entries()).sort((a, b) => b[1] - a[1]).slice(0, limit).map(item => item[0]);
}

function vectorize(tokens: string[], vocabulary: string[]): number[] {
  const counts = new Map<string, number>();
  for (const token of tokens) {
    counts.set(token, (counts.get(token) || 0) + 1);
  }
  return vocabulary.map(term => counts.get(term) || 0);
}

function cosineSimilarity(a: number[], b: number[]): number {
  let dot = 0;
  let normA = 0;
  let normB = 0;
  for (let i = 0; i < a.length; i += 1) {
    dot += a[i] * b[i];
    normA += a[i] * a[i];
    normB += b[i] * b[i];
  }
  if (normA === 0 || normB === 0) return 0;
  return dot / (Math.sqrt(normA) * Math.sqrt(normB));
}

function averageVector(vectors: number[][]): number[] {
  if (vectors.length === 0) return [];
  const dimension = vectors[0].length;
  const result = new Array<number>(dimension).fill(0);
  for (const vector of vectors) {
    for (let i = 0; i < dimension; i += 1) {
      result[i] += vector[i];
    }
  }
  return result.map(value => value / vectors.length);
}

function buildClusters(messages: CapturedMessageRecord[]): ClusterInsight[] {
  const eligible = messages.filter(item => item.text.trim().length >= 4).slice(-Math.min(messages.length, 120));
  if (eligible.length < 4) return [];

  const termCount = new Map<string, number>();
  const tokenized = eligible.map(item => tokenize(item.text));
  for (const tokens of tokenized) {
    for (const token of new Set(tokens)) {
      termCount.set(token, (termCount.get(token) || 0) + 1);
    }
  }

  const vocabulary = topEntries(termCount, 18);
  if (vocabulary.length < 3) return [];

  const vectors = tokenized.map(tokens => vectorize(tokens, vocabulary));
  const k = Math.min(4, Math.max(2, Math.floor(Math.sqrt(eligible.length / 2))));
  let centroids = vectors.slice(0, k);
  const assignments = new Array<number>(vectors.length).fill(0);

  for (let iteration = 0; iteration < 6; iteration += 1) {
    for (let i = 0; i < vectors.length; i += 1) {
      let bestIndex = 0;
      let bestScore = -Infinity;
      for (let c = 0; c < centroids.length; c += 1) {
        const score = cosineSimilarity(vectors[i], centroids[c]);
        if (score > bestScore) {
          bestScore = score;
          bestIndex = c;
        }
      }
      assignments[i] = bestIndex;
    }

    centroids = centroids.map((_, index) => {
      const clusterVectors = vectors.filter((__, vectorIndex) => assignments[vectorIndex] === index);
      return clusterVectors.length > 0 ? averageVector(clusterVectors) : centroids[index];
    });
  }

  return centroids.map((centroid, index) => {
    const clusterMessages = eligible.filter((_, msgIndex) => assignments[msgIndex] === index);
    const keywordPairs = vocabulary.map((term, termIndex) => ({ term, weight: centroid[termIndex] || 0 }))
      .sort((a, b) => b.weight - a.weight)
      .filter(item => item.weight > 0)
      .slice(0, 4);

    const avgSent = clusterMessages.reduce((sum, item) => sum + sentimentScore(item.text), 0) / Math.max(clusterMessages.length, 1);
    return {
      id: index + 1,
      label: keywordPairs.map(item => item.term).join(' / ') || `群聊簇 ${index + 1}`,
      keywords: keywordPairs.map(item => item.term),
      messageCount: clusterMessages.length,
      users: Array.from(new Set(clusterMessages.map(item => item.userId))),
      sampleMessages: clusterMessages.slice(0, 3).map(item => item.text.slice(0, 60)),
      avgSentiment: avgSent,
    };
  }).filter(item => item.messageCount > 0);
}

export function runAdvancedLearningAnalysis(
  messages: CapturedMessageRecord[],
  memories: MemoryRecord[],
): AdvancedLearningReport {
  const byUser = new Map<number, CapturedMessageRecord[]>();
  const termFrequency = new Map<string, { count: number; users: Set<number>; samples: string[] }>();
  const socialMap = new Map<string, SocialInsight>();

  for (const message of messages) {
    const list = byUser.get(message.userId) || [];
    list.push(message);
    byUser.set(message.userId, list);

    const tokens = tokenize(message.text);
    for (const token of tokens) {
      const entry = termFrequency.get(token) || { count: 0, users: new Set<number>(), samples: [] };
      entry.count += 1;
      entry.users.add(message.userId);
      if (entry.samples.length < 2) entry.samples.push(message.text.slice(0, 60));
      termFrequency.set(token, entry);
    }

    const mentions = Array.from(message.rawMessage.matchAll(/\[CQ:at,qq=(\d+)\]/g)).map(item => Number(item[1]));
    for (const targetUserId of mentions) {
      if (!targetUserId || targetUserId === message.userId) continue;
      let matchedRule = relationRules[0];
      for (const rule of relationRules) {
        if (rule.keywords.some(keyword => message.text.includes(keyword))) {
          matchedRule = rule;
          break;
        }
      }
      const key = `${message.userId}:${targetUserId}:${matchedRule.type}`;
      const existing = socialMap.get(key);
      if (existing) {
        existing.score += matchedRule.weight;
        if (existing.evidence.length < 3) existing.evidence.push(message.text.slice(0, 50));
      } else {
        socialMap.set(key, {
          sourceUserId: message.userId,
          targetUserId,
          relationType: matchedRule.type,
          score: matchedRule.weight,
          evidence: [message.text.slice(0, 50)],
        });
      }
    }
  }

  const styleInsights: StyleInsight[] = Array.from(byUser.entries()).map(([userId, userMessages]) => {
    const fillerMap = new Map<string, number>();
    const endingMap = new Map<string, number>();
    const phraseMap = new Map<string, number>();
    let totalLength = 0;
    let totalSentiment = 0;

    for (const message of userMessages) {
      totalLength += message.text.length;
      totalSentiment += sentimentScore(message.text);
      for (const filler of fillerTokens.filter(token => message.text.includes(token))) {
        fillerMap.set(filler, (fillerMap.get(filler) || 0) + 1);
      }
      for (const ending of endingTokens(message.text)) {
        endingMap.set(ending, (endingMap.get(ending) || 0) + 1);
      }
      for (const token of tokenize(message.text).slice(0, 5)) {
        phraseMap.set(token, (phraseMap.get(token) || 0) + 1);
      }
    }

    const nickname = userMessages[0]?.nickname || String(userId);
    return {
      userId,
      nickname,
      dominantTone: dominantTone(totalSentiment / Math.max(userMessages.length, 1)),
      avgLength: Math.round(totalLength / Math.max(userMessages.length, 1)),
      topEndings: topEntries(endingMap, 3),
      topFillers: topEntries(fillerMap, 4),
      signaturePhrases: topEntries(phraseMap, 5),
    };
  }).sort((a, b) => b.avgLength - a.avgLength);

  const slangInsights: SlangInsight[] = Array.from(termFrequency.entries())
    .filter(([, value]) => value.count >= 3 && value.users.size >= 2)
    .map(([term, value]) => ({
      term,
      score: value.count * (1 + value.users.size / 5),
      users: Array.from(value.users),
      meaning: `群内多人反复使用，常见上下文：${value.samples.join(' / ')}`,
    }))
    .sort((a, b) => b.score - a.score)
    .slice(0, 15);

  const sceneScores: GoalSceneScore[] = scenes.map((scene) => {
    const matched = messages.filter(item => scene.keywords.some(keyword => item.text.includes(keyword)));
    return {
      scene: scene.scene,
      category: scene.category,
      confidence: clamp(matched.length / Math.max(messages.length * 0.12, 1), 0, 1),
      matches: matched.length,
      sampleMessages: matched.slice(0, 3).map(item => item.text.slice(0, 60)),
    };
  }).filter(item => item.matches > 0).sort((a, b) => b.confidence - a.confidence).slice(0, 12);

  const positivity = messages.reduce((sum, item) => sum + sentimentScore(item.text), 0) / Math.max(messages.length, 1);
  const energy = messages.reduce((sum, item) => sum + (item.text.match(/[!?！～~]/g)?.length || 0), 0) / Math.max(messages.length, 1);
  const recentWindow = messages.slice(-20).map(item => sentimentScore(item.text));
  const stability = recentWindow.length <= 1
    ? 1
    : clamp(1 - (Math.max(...recentWindow) - Math.min(...recentWindow)) / 8, 0, 1);
  const primaryMood = positivity >= 1 ? 'happy'
    : positivity >= 0.2 ? 'curious'
      : positivity <= -1 ? 'anxious'
        : positivity <= -0.2 ? 'grumpy'
          : 'calm';
  const moodTrend: MoodTrend = {
    primaryMood,
    stability,
    energy: clamp(energy / 3, 0, 1),
    positivity,
    reason: `近 ${messages.length} 条消息平均情绪分 ${positivity.toFixed(2)}，波动稳定度 ${(stability * 100).toFixed(0)}%`,
  };

  const memoryNodes: MemoryGraphNode[] = memories.map(item => ({
    key: item.key,
    userId: item.userId,
    label: item.content,
    importance: item.importance,
    tags: item.tags,
  }));
  const memoryEdges: MemoryGraphEdge[] = [];
  for (let i = 0; i < memoryNodes.length; i += 1) {
    for (let j = i + 1; j < memoryNodes.length; j += 1) {
      const sharedTags = memoryNodes[i].tags.filter(tag => memoryNodes[j].tags.includes(tag));
      if (sharedTags.length === 0) continue;
      memoryEdges.push({
        source: memoryNodes[i].key,
        target: memoryNodes[j].key,
        weight: clamp(sharedTags.length / 3, 0.2, 1),
        reason: `共享标签: ${sharedTags.join(', ')}`,
      });
    }
  }

  const clusters = buildClusters(messages);
  const topStyles = styleInsights.slice(0, 4);
  const topScenes = sceneScores.slice(0, 4).map(item => item.scene);
  const topSlang = slangInsights.slice(0, 6).map(item => `${item.term}=${item.meaning}`);
  const personaPrompt = [
    '请在默认角色基础上叠加以下高级学习结果：',
    topStyles.length > 0
      ? `1. 关键用户风格：${topStyles.map(item => `${item.nickname}[${item.dominantTone}] ${item.topFillers.join('/') || '无明显语气词'}`).join('；')}`
      : '1. 保持自然群聊风格。',
    topSlang.length > 0
      ? `2. 群组黑话：${topSlang.join('；')}`
      : '2. 暂无强黑话信号。',
    topScenes.length > 0
      ? `3. 当前主要对话场景：${topScenes.join('、')}`
      : '3. 当前以日常闲聊为主。',
    `4. 群氛围情绪：${moodTrend.primaryMood}，积极度 ${moodTrend.positivity.toFixed(2)}，能量 ${moodTrend.energy.toFixed(2)}。`,
    clusters.length > 0
      ? `5. 最近话题簇：${clusters.slice(0, 3).map(item => item.label).join('；')}`
      : '5. 近期话题较分散。',
  ].join('\n');

  const summary = [
    `分析 ${messages.length} 条消息，识别 ${styleInsights.length} 个用户风格画像`,
    `${slangInsights.length} 个群组黑话候选`,
    `${Array.from(socialMap.values()).length} 条高价值社交边`,
    `主情绪 ${moodTrend.primaryMood}`,
    `主要场景 ${sceneScores.slice(0, 3).map(item => item.scene).join('/') || 'casual_chat'}`,
  ].join('，');

  return {
    summary,
    styleInsights,
    slangInsights,
    socialInsights: Array.from(socialMap.values()).sort((a, b) => b.score - a.score).slice(0, 40),
    moodTrend,
    sceneScores,
    clusters,
    memoryGraph: {
      nodes: memoryNodes,
      edges: memoryEdges.slice(0, 80),
    },
    personaPrompt,
  };
}
