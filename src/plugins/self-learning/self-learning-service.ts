import { config } from '../../types/config';
import type { PluginCommandContext, PromptHookContext, PromptHookResult } from '../plugin-types';
import {
  runAdvancedLearningAnalysis,
  type AdvancedLearningReport,
  type GoalSceneScore,
} from './advanced-analysis';
import {
  type AffectionRecord,
  type AnalysisSnapshotRecord,
  type CapturedMessageRecord,
  type GoalRecord,
  type MemoryRecord,
  type SelfLearningExportBundle,
  type SelfLearningImportMode,
  type MoodRecord,
  type PersonaReviewRecord,
  type PersonaSnapshotRecord,
  type SelfLearningStore,
  type SlangRecord,
  type SocialEdgeRecord,
  type StylePatternRecord,
} from './self-learning-store';

const positiveWords = ['喜欢', '谢谢', '厉害', '可爱', '开心', '支持', '棒', '爱你', '赞', '哈哈', '恭喜'];
const negativeWords = ['讨厌', '烦', '滚', '无语', '生气', '难过', '焦虑', '破防', '崩溃'];

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

function topKeywords(text: string, limit = 8): string[] {
  return Array.from(new Set(
    (text.toLowerCase().match(/[\u4e00-\u9fa5]{2,4}|[a-z0-9]{2,}/g) || [])
      .map(item => item.trim())
      .filter(item => item.length >= 2),
  )).slice(0, limit);
}

function maybeExtractMemory(text: string): Array<{ key: string; content: string; tags: string[]; importance: number }> {
  const rules: Array<{ regex: RegExp; prefix: string; importance: number }> = [
    { regex: /我喜欢(.+)/, prefix: 'like', importance: 0.95 },
    { regex: /我最爱(.+)/, prefix: 'favorite', importance: 1 },
    { regex: /我是(.+)/, prefix: 'identity', importance: 0.92 },
    { regex: /我在(.+)/, prefix: 'location', importance: 0.7 },
    { regex: /我想去(.+)/, prefix: 'plan', importance: 0.8 },
    { regex: /我不喜欢(.+)/, prefix: 'dislike', importance: 0.9 },
    { regex: /我最近在(.+)/, prefix: 'recent', importance: 0.82 },
    { regex: /我打算(.+)/, prefix: 'intention', importance: 0.84 },
  ];
  const result: Array<{ key: string; content: string; tags: string[]; importance: number }> = [];
  for (const rule of rules) {
    const match = text.match(rule.regex);
    if (!match?.[1]) continue;
    const subject = match[1].trim().slice(0, 50);
    result.push({
      key: `${rule.prefix}:${subject}`,
      content: match[0].trim(),
      tags: topKeywords(subject, 5),
      importance: rule.importance,
    });
  }
  return result;
}

function inferRealtimeGoal(text: string): { goalType: string; summary: string } | null {
  const rules: Array<{ goalType: string; summary: string; keywords: string[] }> = [
    { goalType: 'comfort', summary: '需要安抚和陪伴', keywords: ['难过', '伤心', 'emo', '安慰'] },
    { goalType: 'advice_seek', summary: '在请求建议或解法', keywords: ['怎么办', '建议', '求助', '帮我'] },
    { goalType: 'debate', summary: '在表达强观点或争辩', keywords: ['不对', '杠', '反对', '争论'] },
    { goalType: 'celebration', summary: '在分享喜讯或庆祝', keywords: ['恭喜', '发财', '中奖了', '爽'] },
    { goalType: 'casual_chat', summary: '在进行轻松闲聊', keywords: ['在吗', '聊天', '唠嗑', '无聊'] },
    { goalType: 'planning', summary: '在讨论未来计划', keywords: ['安排', '计划', '明天', '下周'] },
  ];
  for (const rule of rules) {
    if (rule.keywords.some(keyword => text.includes(keyword))) {
      return { goalType: rule.goalType, summary: rule.summary };
    }
  }
  return null;
}

export class SelfLearningService {
  private autoLearningEnabled = true;
  private lastLearningAt = 0;

  constructor(private readonly store: SelfLearningStore) {}

  async initialize(): Promise<void> {
    await this.store.initialize();
    this.autoLearningEnabled = true;
  }

  async captureMessage(record: CapturedMessageRecord): Promise<void> {
    if (!this.shouldCapture(record)) return;

    await this.store.saveCapturedMessage(record);
    await this.updateRealtimeSignals(record);

    if (this.autoLearningEnabled) {
      const enoughTime = Date.now() - this.lastLearningAt >= config.selfLearning.learningIntervalHours * 60 * 60 * 1000;
      if (enoughTime) {
        await this.runLearningCycle();
      }
    }
  }

  async buildPromptContext(context: PromptHookContext): Promise<PromptHookResult | undefined> {
    const [mood, affection, goal, styles, slang, social, snapshot, memories, advanced] = await Promise.all([
      this.store.getMood(context.groupId),
      this.store.getAffection(context.groupId, context.userId),
      this.store.getGoal(context.groupId, context.userId),
      this.store.listStylePatterns(context.groupId, context.userId, 8),
      this.store.listSlang(context.groupId, 8),
      this.store.listSocialEdges(context.groupId, context.userId, 8),
      this.store.getActivePersonaSnapshot(context.groupId),
      this.store.searchMemories(context.groupId, context.userId, topKeywords(context.rawText), 6),
      this.getAdvancedSummary(context.groupId),
    ]);

    const sections: string[] = [];
    if (snapshot?.content) {
      sections.push('当前已批准的人格增强建议如下，请以此增强回复但保持 QQTalker 既有人设。');
      sections.push(snapshot.content);
    }
    if (advanced?.summary) {
      sections.push(`高级学习摘要: ${advanced.summary}`);
    }
    if (advanced?.moodTrend) {
      sections.push(`群体情绪趋势: ${advanced.moodTrend.primaryMood}，稳定度 ${(advanced.moodTrend.stability * 100).toFixed(0)}%，活跃能量 ${(advanced.moodTrend.energy * 100).toFixed(0)}%。`);
    }
    if (advanced?.sceneScores?.length) {
      sections.push(`当前高频对话场景: ${advanced.sceneScores.slice(0, 5).map((item: GoalSceneScore) => `${item.scene}(${(item.confidence * 100).toFixed(0)}%)`).join('，')}`);
    }
    if (mood) {
      sections.push(`当前群聊心情: ${mood.mood} (强度 ${mood.intensity.toFixed(2)}，原因: ${mood.reason})`);
    }
    if (affection) {
      sections.push(`你对当前用户的好感度: ${affection.score.toFixed(1)}/100，上次波动 ${affection.lastDelta >= 0 ? '+' : ''}${affection.lastDelta.toFixed(1)}`);
    }
    if (goal) {
      sections.push(`当前用户对话目标: ${goal.goalType}，建议: ${goal.summary}`);
    }
    if (styles.length > 0) {
      sections.push(`学习到的用户风格特征: ${styles.map(item => `${item.patternType}:${item.patternValue}`).join(' | ')}`);
    }
    if (slang.length > 0) {
      sections.push(`本群黑话/常用梗: ${slang.map(item => `${item.term}=${item.meaning}`).join('；')}`);
    }
    if (social.length > 0) {
      sections.push(`用户社交关系线索: ${social.map(item => `${item.relationType}(强度${item.score.toFixed(1)})`).join('，')}`);
    }
    if (memories.length > 0) {
      sections.push(`长期记忆: ${memories.map(item => item.content).join('；')}`);
    }

    if (sections.length === 0) return undefined;
    return { pluginId: 'self-learning', sections };
  }

  async handleCommand(context: PluginCommandContext): Promise<{ handled: boolean; reply?: string }> {
    const text = context.normalizedText;
    if (!text.startsWith('/')) return { handled: false };

    const protectedCommands = ['/learning_status', '/start_learning', '/stop_learning', '/force_learning', '/affection_status', '/set_mood', '/scene_status'];
    if (!context.isAdmin && protectedCommands.some(cmd => text.startsWith(cmd))) {
      return { handled: true, reply: '这个命令需要群管理员权限喵~' };
    }

    if (text === '/learning_status') {
      const [overview, mood, advanced] = await Promise.all([
        this.store.getOverview(),
        this.store.getMood(context.groupId),
        this.getAdvancedSummary(context.groupId),
      ]);
      return {
        handled: true,
        reply: `学习状态：消息 ${overview.messages} 条，风格 ${overview.patterns} 条，黑话 ${overview.slang} 条，记忆 ${overview.memories} 条，学习运行 ${overview.runs} 次，待审查人格 ${overview.pendingReviews} 条，当前情绪 ${mood?.mood || config.selfLearning.defaultMood}，主要场景 ${(advanced?.sceneScores?.[0]?.scene) || 'casual_chat'}。`,
      };
    }

    if (text === '/start_learning') {
      this.autoLearningEnabled = true;
      return { handled: true, reply: '自主学习已开启，会持续进行实时学习与批量分析喵~' };
    }

    if (text === '/stop_learning') {
      this.autoLearningEnabled = false;
      return { handled: true, reply: '自主学习已暂停，不再自动触发高级学习周期喵~' };
    }

    if (text === '/force_learning') {
      const report = await this.runLearningCycleForGroup(context.groupId);
      return {
        handled: true,
        reply: `已强制执行一次高级学习：${report.summary}。人格审查建议已生成，可在控制台审批喵~`,
      };
    }

    if (text === '/affection_status') {
      const rank = await this.store.listAffection(context.groupId, 10);
      if (rank.length === 0) {
        return { handled: true, reply: '当前群还没有积累到足够的好感度数据喵~' };
      }
      return { handled: true, reply: `好感度排行：${rank.map((item, index) => `${index + 1}. ${item.userId}(${item.score.toFixed(1)})`).join('；')}` };
    }

    if (text === '/scene_status') {
      const summary = await this.getAdvancedSummary(context.groupId);
      const sceneText = summary?.sceneScores?.slice(0, 5).map(item => `${item.scene}:${(item.confidence * 100).toFixed(0)}%`).join('；') || '暂无足够数据';
      return { handled: true, reply: `当前群对话场景分布：${sceneText}` };
    }

    if (text.startsWith('/set_mood')) {
      const mood = context.rawText.replace('/set_mood', '').trim() || config.selfLearning.defaultMood;
      await this.store.setMood({
        groupId: context.groupId,
        mood,
        intensity: 0.8,
        reason: '管理员手动设置',
        updatedAt: Date.now(),
      });
      return { handled: true, reply: `已将当前群情绪设置为 ${mood} 喵~` };
    }

    return { handled: false };
  }

  async runLearningCycle(): Promise<void> {
    const groups = await this.store.getTrackedGroups();
    for (const groupId of groups) {
      await this.runLearningCycleForGroup(groupId);
    }
    this.lastLearningAt = Date.now();
  }

  async runLearningCycleForGroup(groupId: number): Promise<AdvancedLearningReport> {
    const recentMessages = await this.store.listRecentCapturedMessages(groupId, config.selfLearning.maxMessagesPerBatch);
    const messages = recentMessages.slice(0, config.selfLearning.maxMlSampleSize);
    const memories = await this.store.listMemories(groupId, undefined, 80);
    const report = runAdvancedLearningAnalysis(messages, memories);
    if (!config.selfLearning.enableMlAnalysis) {
      report.clusters = [];
    }
    const now = Date.now();

    await Promise.all([
      this.store.saveAnalysisSnapshot({ groupId, analysisType: 'advanced-summary', payload: report, updatedAt: now }),
      this.store.saveAnalysisSnapshot({ groupId, analysisType: 'ml-clusters', payload: report.clusters, updatedAt: now }),
      this.store.saveAnalysisSnapshot({ groupId, analysisType: 'scene-map', payload: report.sceneScores, updatedAt: now }),
      this.store.saveAnalysisSnapshot({ groupId, analysisType: 'memory-graph', payload: report.memoryGraph, updatedAt: now }),
      this.store.saveAnalysisSnapshot({ groupId, analysisType: 'social-map', payload: report.socialInsights, updatedAt: now }),
      this.store.saveLearningRun({ groupId, summary: report.summary, status: 'completed', createdAt: now }),
    ]);

    await this.applyAdvancedReport(groupId, report, now);
    await this.generatePersonaReview(groupId, report);
    this.lastLearningAt = now;
    return report;
  }

  async generatePersonaReview(groupId: number, report?: AdvancedLearningReport): Promise<PersonaReviewRecord> {
    const actualReport = report || await this.getAdvancedSummary(groupId);
    if (!actualReport) {
      throw new Error('No advanced report available for persona review');
    }
    const currentMood = await this.store.getMood(groupId);
    const reviewSummary = `${actualReport.summary}，主情绪 ${currentMood?.mood || actualReport.moodTrend.primaryMood}，主题簇 ${actualReport.clusters.slice(0, 2).map(item => item.label).join(' / ') || '分散'}`;
    const personaName = `group-${groupId}`;
    const id = await this.store.createPersonaReview({
      groupId,
      personaName,
      summary: reviewSummary,
      suggestedPrompt: actualReport.personaPrompt,
      status: 'pending',
      createdAt: Date.now(),
      approvedAt: null,
    });
    return {
      id,
      groupId,
      personaName,
      summary: reviewSummary,
      suggestedPrompt: actualReport.personaPrompt,
      status: 'pending',
      createdAt: Date.now(),
      approvedAt: null,
    };
  }

  async approvePersonaReview(reviewId: number): Promise<void> {
    const review = (await this.store.listPersonaReviews(undefined, undefined, 100)).find(item => item.id === reviewId);
    if (!review) {
      throw new Error('Review not found');
    }
    await this.store.updatePersonaReviewStatus(reviewId, 'approved', Date.now());
    await this.store.activatePersonaSnapshot(review.groupId, review.personaName, review.suggestedPrompt, reviewId);
  }

  async rejectPersonaReview(reviewId: number): Promise<void> {
    await this.store.updatePersonaReviewStatus(reviewId, 'rejected');
  }

  async getOverview(): Promise<Record<string, number>> {
    return this.store.getOverview();
  }

  async listStyles(groupId: number, userId?: number): Promise<StylePatternRecord[]> {
    const items = await this.store.listStylePatterns(groupId, userId, 30);
    return this.attachNicknamesToStyles(groupId, items);
  }

  async listSlang(groupId: number): Promise<SlangRecord[]> {
    return this.store.listSlang(groupId, 30);
  }

  async listSocial(groupId: number, userId?: number): Promise<SocialEdgeRecord[]> {
    const items = await this.store.listSocialEdges(groupId, userId, 60);
    return this.attachNicknamesToSocial(groupId, items);
  }

  async listAffection(groupId: number): Promise<AffectionRecord[]> {
    const items = await this.store.listAffection(groupId, 30);
    return this.attachNicknamesToAffection(groupId, items);
  }

  async getMood(groupId: number): Promise<MoodRecord | undefined> {
    return this.store.getMood(groupId);
  }

  async listGoals(groupId: number): Promise<GoalRecord[]> {
    return this.store.listGoals(groupId, 40);
  }

  async listMemories(groupId: number, userId?: number): Promise<MemoryRecord[]> {
    return this.store.listMemories(groupId, userId, 60);
  }

  async listPersonaReviews(groupId?: number): Promise<PersonaReviewRecord[]> {
    return this.store.listPersonaReviews(groupId, undefined, 50);
  }

  async getAdvancedSummary(groupId: number): Promise<AdvancedLearningReport | undefined> {
    return (await this.store.getAnalysisSnapshot<AdvancedLearningReport>(groupId, 'advanced-summary'))?.payload;
  }

  async getClusters(groupId: number): Promise<AdvancedLearningReport['clusters']> {
    return (await this.store.getAnalysisSnapshot<AdvancedLearningReport['clusters']>(groupId, 'ml-clusters'))?.payload || [];
  }

  async getSceneMap(groupId: number): Promise<AdvancedLearningReport['sceneScores']> {
    return (await this.store.getAnalysisSnapshot<AdvancedLearningReport['sceneScores']>(groupId, 'scene-map'))?.payload || [];
  }

  async getMemoryGraph(groupId: number): Promise<AdvancedLearningReport['memoryGraph']> {
    return (await this.store.getAnalysisSnapshot<AdvancedLearningReport['memoryGraph']>(groupId, 'memory-graph'))?.payload || { nodes: [], edges: [] };
  }

  async getLearningRuns(groupId: number): Promise<Array<{ id?: number; groupId: number; summary: string; status: string; createdAt: number }>> {
    return this.store.listLearningRuns(groupId, 20);
  }

  getRuntimeState(): { autoLearningEnabled: boolean; lastLearningAt: number; nextLearningAt: number } {
    return {
      autoLearningEnabled: this.autoLearningEnabled,
      lastLearningAt: this.lastLearningAt,
      nextLearningAt: this.lastLearningAt + (config.selfLearning.learningIntervalHours * 60 * 60 * 1000),
    };
  }

  async getTrackedGroups(): Promise<number[]> {
    return this.store.getTrackedGroups();
  }

  setAutoLearningEnabled(enabled: boolean): { autoLearningEnabled: boolean; lastLearningAt: number; nextLearningAt: number } {
    this.autoLearningEnabled = enabled;
    return this.getRuntimeState();
  }

  getStrategySettings(): {
    runtime: { autoLearningEnabled: boolean; lastLearningAt: number; nextLearningAt: number };
    settings: Record<string, number | boolean>;
  } {
    return {
      runtime: this.getRuntimeState(),
      settings: {
        learningIntervalHours: config.selfLearning.learningIntervalHours,
        minMessagesForLearning: config.selfLearning.minMessagesForLearning,
        maxMessagesPerBatch: config.selfLearning.maxMessagesPerBatch,
        enableMlAnalysis: config.selfLearning.enableMlAnalysis,
        maxMlSampleSize: config.selfLearning.maxMlSampleSize,
        totalAffectionCap: config.selfLearning.totalAffectionCap,
        maxUserAffection: config.selfLearning.maxUserAffection,
      },
    };
  }

  async exportLearningData(groupId?: number): Promise<SelfLearningExportBundle> {
    return this.store.exportData(groupId);
  }

  async importLearningData(bundle: SelfLearningExportBundle, mode: SelfLearningImportMode = 'merge'): Promise<{
    importedGroups: number[];
    mode: SelfLearningImportMode;
    counts: Record<string, number>;
  }> {
    if (!bundle || bundle.source !== 'qqtalker-self-learning' || bundle.version !== 1) {
      throw new Error('不支持的学习数据格式');
    }
    return this.store.importData(bundle, mode);
  }

  async clearLearningData(groupId: number): Promise<Record<string, number>> {
    if (!Number.isFinite(groupId) || groupId <= 0) {
      throw new Error('无效的群号');
    }
    return this.store.clearGroupData(groupId);
  }

  async rebuildAnalysisSnapshots(groupId: number): Promise<{
    report: AdvancedLearningReport;
    snapshots: AnalysisSnapshotRecord[];
    runs: Array<{ id?: number; groupId: number; summary: string; status: string; createdAt: number }>;
    personaReviews: PersonaReviewRecord[];
    personaSnapshots: PersonaSnapshotRecord[];
  }> {
    if (!Number.isFinite(groupId) || groupId <= 0) {
      throw new Error('无效的群号');
    }
    const report = await this.runLearningCycleForGroup(groupId);
    const [snapshots, runs, personaReviews, personaSnapshots] = await Promise.all([
      this.store.listAnalysisSnapshots(groupId),
      this.store.listLearningRuns(groupId, 20),
      this.store.listPersonaReviews(groupId, undefined, 20),
      this.store.listPersonaSnapshots(groupId),
    ]);
    return { report, snapshots, runs, personaReviews, personaSnapshots };
  }

  private shouldCapture(record: CapturedMessageRecord): boolean {
    const text = record.text.trim();
    if (!text) return false;
    if (text.length < config.selfLearning.messageMinLength || text.length > config.selfLearning.messageMaxLength) return false;
    if (config.selfLearning.targetBlacklist.includes(String(record.userId)) || config.selfLearning.targetBlacklist.includes(`group_${record.groupId}`)) {
      return false;
    }
    if (config.selfLearning.targetQqList.length === 0) return true;
    return config.selfLearning.targetQqList.includes(String(record.userId)) || config.selfLearning.targetQqList.includes(`group_${record.groupId}`);
  }

  private async updateRealtimeSignals(record: CapturedMessageRecord): Promise<void> {
    const punctuation = record.text.match(/[!?~。！？，、]{1,3}$/)?.[0];
    if (punctuation) {
      await this.store.upsertStylePattern({
        groupId: record.groupId,
        userId: record.userId,
        patternType: 'ending',
        patternValue: punctuation,
        weight: punctuation.length,
        evidenceCount: 1,
        lastSeen: record.createdAt,
      });
    }

    for (const filler of ['哈哈', '呜呜', '喵', '捏', '诶嘿', '草', '乐', '啊这', '嘿嘿']) {
      if (!record.text.includes(filler)) continue;
      await this.store.upsertStylePattern({
        groupId: record.groupId,
        userId: record.userId,
        patternType: 'filler',
        patternValue: filler,
        weight: 1.2,
        evidenceCount: 1,
        lastSeen: record.createdAt,
      });
    }

    for (const phrase of topKeywords(record.text, 4)) {
      await this.store.upsertStylePattern({
        groupId: record.groupId,
        userId: record.userId,
        patternType: 'phrase',
        patternValue: phrase,
        weight: 0.8,
        evidenceCount: 1,
        lastSeen: record.createdAt,
      });
    }

    for (const term of topKeywords(record.text, 6)) {
      if (positiveWords.includes(term) || negativeWords.includes(term)) continue;
      await this.store.upsertSlang({
        groupId: record.groupId,
        term,
        meaning: `群内高频表达，常与“${record.text.slice(0, 20)}”同场出现`,
        usageCount: 1,
        lastSeen: record.createdAt,
      });
    }

    const mentions = Array.from(record.rawMessage.matchAll(/\[CQ:at,qq=(\d+)\]/g)).map(item => Number(item[1])).filter(item => item > 0 && item !== record.userId);
    for (const targetUserId of mentions) {
      await this.store.upsertSocialEdge({
        groupId: record.groupId,
        sourceUserId: record.userId,
        targetUserId,
        relationType: record.text.includes('喜欢') ? 'lover' : record.text.includes('谢谢') ? 'supportive' : 'frequent_interaction',
        score: record.text.includes('喜欢') ? 1.8 : 1,
        interactions: 1,
        lastSeen: record.createdAt,
      });
    }

    const current = await this.store.getAffection(record.groupId, record.userId);
    const positive = positiveWords.filter(word => record.text.includes(word)).length;
    const negative = negativeWords.filter(word => record.text.includes(word)).length;
    const delta = (positive * 3) - (negative * 4) + (record.isAtBot ? 1.5 : 0.4);
    const nextScore = clamp((current?.score || 35) + delta, 0, config.selfLearning.maxUserAffection);
    await this.store.upsertAffection({
      groupId: record.groupId,
      userId: record.userId,
      score: nextScore,
      lastDelta: delta,
      updatedAt: record.createdAt,
    });

    const goal = inferRealtimeGoal(record.text);
    if (goal) {
      await this.store.upsertGoal({
        groupId: record.groupId,
        userId: record.userId,
        goalType: goal.goalType,
        status: 'active',
        summary: goal.summary,
        updatedAt: record.createdAt,
      });
    }

    for (const memory of maybeExtractMemory(record.text)) {
      await this.store.upsertMemory({
        groupId: record.groupId,
        userId: record.userId,
        key: memory.key,
        content: memory.content,
        importance: memory.importance,
        tags: memory.tags,
        updatedAt: record.createdAt,
      });
    }

    const sentiment = positive - negative;
    await this.store.setMood({
      groupId: record.groupId,
      mood: sentiment >= 1 ? 'happy' : sentiment <= -1 ? 'anxious' : config.selfLearning.defaultMood,
      intensity: clamp(Math.abs(sentiment) / 3, 0.2, 1),
      reason: sentiment === 0 ? '群内最近消息较平稳' : `最近消息情绪分值 ${sentiment}`,
      updatedAt: record.createdAt,
    });
  }

  private async applyAdvancedReport(groupId: number, report: AdvancedLearningReport, updatedAt: number): Promise<void> {
    for (const style of report.styleInsights) {
      for (const ending of style.topEndings) {
        await this.store.upsertStylePattern({
          groupId,
          userId: style.userId,
          patternType: 'advanced-ending',
          patternValue: ending,
          weight: style.avgLength / 10,
          evidenceCount: 2,
          lastSeen: updatedAt,
        });
      }
      for (const filler of style.topFillers) {
        await this.store.upsertStylePattern({
          groupId,
          userId: style.userId,
          patternType: 'advanced-filler',
          patternValue: filler,
          weight: 1.5,
          evidenceCount: 2,
          lastSeen: updatedAt,
        });
      }
    }

    for (const slang of report.slangInsights.slice(0, 12)) {
      await this.store.upsertSlang({
        groupId,
        term: slang.term,
        meaning: slang.meaning,
        usageCount: Math.round(slang.score),
        lastSeen: updatedAt,
      });
    }

    for (const social of report.socialInsights.slice(0, 24)) {
      await this.store.upsertSocialEdge({
        groupId,
        sourceUserId: social.sourceUserId,
        targetUserId: social.targetUserId,
        relationType: social.relationType,
        score: social.score,
        interactions: social.evidence.length,
        lastSeen: updatedAt,
      });
    }

    const userActivity = new Map<number, number>();
    for (const style of report.styleInsights) {
      userActivity.set(style.userId, style.avgLength);
    }
    const totalWeight = Array.from(userActivity.values()).reduce((sum, value) => sum + value, 0) || 1;
    for (const [userId, activityWeight] of userActivity) {
      const current = await this.store.getAffection(groupId, userId);
      const targetScore = clamp((activityWeight / totalWeight) * config.selfLearning.totalAffectionCap, 0, config.selfLearning.maxUserAffection);
      const nextScore = clamp(((current?.score || 35) * 0.9) + targetScore * 0.1, 0, config.selfLearning.maxUserAffection);
      await this.store.upsertAffection({
        groupId,
        userId,
        score: nextScore,
        lastDelta: nextScore - (current?.score || 35),
        updatedAt,
      });
    }

    await this.store.setMood({
      groupId,
      mood: report.moodTrend.primaryMood,
      intensity: report.moodTrend.energy,
      reason: report.moodTrend.reason,
      updatedAt,
    });

    for (const scene of report.sceneScores.slice(0, 10)) {
      for (const userId of report.styleInsights.slice(0, 5).map(item => item.userId)) {
        await this.store.upsertGoal({
          groupId,
          userId,
          goalType: scene.scene,
          status: 'inferred',
          summary: `高频场景 ${scene.scene}，置信度 ${(scene.confidence * 100).toFixed(0)}%`,
          updatedAt,
        });
      }
    }
  }

  private async getNicknameMap(groupId: number, userIds: number[]): Promise<Map<number, string>> {
    const uniqueIds = Array.from(new Set(userIds.filter((item) => Number.isFinite(item) && item > 0)));
    if (uniqueIds.length === 0) return new Map();

    const messages = await this.store.listCapturedMessages(groupId);
    const nicknameMap = new Map<number, string>();

    for (let i = messages.length - 1; i >= 0; i -= 1) {
      const item = messages[i];
      if (!uniqueIds.includes(item.userId)) continue;
      if (!item.nickname || nicknameMap.has(item.userId)) continue;
      nicknameMap.set(item.userId, item.nickname);
      if (nicknameMap.size >= uniqueIds.length) break;
    }

    return nicknameMap;
  }

  private async attachNicknamesToStyles(groupId: number, items: StylePatternRecord[]): Promise<StylePatternRecord[]> {
    const nicknameMap = await this.getNicknameMap(groupId, items.map((item) => item.userId));
    return items.map((item) => ({
      ...item,
      nickname: nicknameMap.get(item.userId) || item.nickname,
    }));
  }

  private async attachNicknamesToSocial(groupId: number, items: SocialEdgeRecord[]): Promise<SocialEdgeRecord[]> {
    const nicknameMap = await this.getNicknameMap(groupId, items.flatMap((item) => [item.sourceUserId, item.targetUserId]));
    return items.map((item) => ({
      ...item,
      sourceNickname: nicknameMap.get(item.sourceUserId) || item.sourceNickname,
      targetNickname: nicknameMap.get(item.targetUserId) || item.targetNickname,
    }));
  }

  private async attachNicknamesToAffection(groupId: number, items: AffectionRecord[]): Promise<AffectionRecord[]> {
    const nicknameMap = await this.getNicknameMap(groupId, items.map((item) => item.userId));
    return items.map((item) => ({
      ...item,
      nickname: nicknameMap.get(item.userId) || item.nickname,
    }));
  }
}
