import { createDatabaseAdapter } from '../../storage/create-database-adapter';
import type { DatabaseAdapter } from '../../storage/database-adapter';

export interface CapturedMessageRecord {
  id?: number;
  groupId: number;
  userId: number;
  nickname: string;
  text: string;
  rawMessage: string;
  isAtBot: boolean;
  createdAt: number;
}

export interface StylePatternRecord {
  groupId: number;
  userId: number;
  patternType: string;
  patternValue: string;
  weight: number;
  evidenceCount: number;
  lastSeen: number;
}

export interface SlangRecord {
  groupId: number;
  term: string;
  meaning: string;
  usageCount: number;
  lastSeen: number;
}

export interface SocialEdgeRecord {
  groupId: number;
  sourceUserId: number;
  targetUserId: number;
  relationType: string;
  score: number;
  interactions: number;
  lastSeen: number;
}

export interface AffectionRecord {
  groupId: number;
  userId: number;
  score: number;
  lastDelta: number;
  updatedAt: number;
}

export interface MoodRecord {
  groupId: number;
  mood: string;
  intensity: number;
  reason: string;
  updatedAt: number;
}

export interface GoalRecord {
  groupId: number;
  userId: number;
  goalType: string;
  status: string;
  summary: string;
  updatedAt: number;
}

export interface MemoryRecord {
  id?: number;
  groupId: number;
  userId: number;
  key: string;
  content: string;
  importance: number;
  tags: string[];
  updatedAt: number;
}

export interface PersonaReviewRecord {
  id?: number;
  groupId: number;
  personaName: string;
  summary: string;
  suggestedPrompt: string;
  status: 'pending' | 'approved' | 'rejected';
  createdAt: number;
  approvedAt?: number | null;
}

export interface LearningRunRecord {
  id?: number;
  groupId: number;
  summary: string;
  status: string;
  createdAt: number;
}

export interface AnalysisSnapshotRecord<T = unknown> {
  id?: number;
  groupId: number;
  analysisType: string;
  payload: T;
  updatedAt: number;
}

export interface PersonaSnapshotRecord {
  id?: number;
  groupId: number;
  personaName: string;
  content: string;
  reviewId?: number | null;
  isActive: boolean;
  createdAt: number;
}

export interface SelfLearningExportBundle {
  version: 1;
  source: 'qqtalker-self-learning';
  exportedAt: number;
  scope: {
    groupId?: number;
    groups: number[];
  };
  counts: Record<string, number>;
  data: {
    capturedMessages: CapturedMessageRecord[];
    stylePatterns: StylePatternRecord[];
    slangTerms: SlangRecord[];
    socialEdges: SocialEdgeRecord[];
    affectionScores: AffectionRecord[];
    moodStates: MoodRecord[];
    goalSessions: GoalRecord[];
    memoryNodes: MemoryRecord[];
    personaReviews: PersonaReviewRecord[];
    personaSnapshots: PersonaSnapshotRecord[];
    analysisSnapshots: AnalysisSnapshotRecord[];
    learningRuns: LearningRunRecord[];
  };
}

export type SelfLearningImportMode = 'merge' | 'replace';

function getSchemaStatements(dialect: DatabaseAdapter['dialect']): string[] {
  const idColumn = dialect === 'postgres'
    ? 'SERIAL PRIMARY KEY'
    : dialect === 'mysql'
      ? 'INT AUTO_INCREMENT PRIMARY KEY'
      : 'INTEGER PRIMARY KEY AUTOINCREMENT';
  const integer = dialect === 'postgres' ? 'BIGINT' : 'INTEGER';
  const text = dialect === 'postgres' ? 'TEXT' : 'TEXT';
  const boolDefault = dialect === 'postgres' ? 'INTEGER DEFAULT 0' : 'INTEGER DEFAULT 0';

  return [
    `CREATE TABLE IF NOT EXISTS captured_messages (
      id ${idColumn},
      group_id ${integer} NOT NULL,
      user_id ${integer} NOT NULL,
      nickname ${text} NOT NULL,
      text ${text} NOT NULL,
      raw_message ${text} NOT NULL,
      is_at_bot ${boolDefault},
      created_at ${integer} NOT NULL
    )`,
    `CREATE TABLE IF NOT EXISTS style_patterns (
      id ${idColumn},
      group_id ${integer} NOT NULL,
      user_id ${integer} NOT NULL,
      pattern_type ${text} NOT NULL,
      pattern_value ${text} NOT NULL,
      weight DOUBLE PRECISION NOT NULL,
      evidence_count ${integer} NOT NULL,
      last_seen ${integer} NOT NULL,
      UNIQUE(group_id, user_id, pattern_type, pattern_value)
    )`,
    `CREATE TABLE IF NOT EXISTS slang_terms (
      id ${idColumn},
      group_id ${integer} NOT NULL,
      term ${text} NOT NULL,
      meaning ${text} NOT NULL,
      usage_count ${integer} NOT NULL,
      last_seen ${integer} NOT NULL,
      UNIQUE(group_id, term)
    )`,
    `CREATE TABLE IF NOT EXISTS social_edges (
      id ${idColumn},
      group_id ${integer} NOT NULL,
      source_user_id ${integer} NOT NULL,
      target_user_id ${integer} NOT NULL,
      relation_type ${text} NOT NULL,
      score DOUBLE PRECISION NOT NULL,
      interactions ${integer} NOT NULL,
      last_seen ${integer} NOT NULL,
      UNIQUE(group_id, source_user_id, target_user_id, relation_type)
    )`,
    `CREATE TABLE IF NOT EXISTS affection_scores (
      id ${idColumn},
      group_id ${integer} NOT NULL,
      user_id ${integer} NOT NULL,
      score DOUBLE PRECISION NOT NULL,
      last_delta DOUBLE PRECISION NOT NULL,
      updated_at ${integer} NOT NULL,
      UNIQUE(group_id, user_id)
    )`,
    `CREATE TABLE IF NOT EXISTS mood_states (
      id ${idColumn},
      group_id ${integer} NOT NULL,
      mood ${text} NOT NULL,
      intensity DOUBLE PRECISION NOT NULL,
      reason ${text} NOT NULL,
      updated_at ${integer} NOT NULL,
      UNIQUE(group_id)
    )`,
    `CREATE TABLE IF NOT EXISTS goal_sessions (
      id ${idColumn},
      group_id ${integer} NOT NULL,
      user_id ${integer} NOT NULL,
      goal_type ${text} NOT NULL,
      status ${text} NOT NULL,
      summary ${text} NOT NULL,
      updated_at ${integer} NOT NULL,
      UNIQUE(group_id, user_id)
    )`,
    `CREATE TABLE IF NOT EXISTS memory_nodes (
      id ${idColumn},
      group_id ${integer} NOT NULL,
      user_id ${integer} NOT NULL,
      memory_key ${text} NOT NULL,
      content ${text} NOT NULL,
      importance DOUBLE PRECISION NOT NULL,
      tags ${text} NOT NULL,
      updated_at ${integer} NOT NULL,
      UNIQUE(group_id, user_id, memory_key)
    )`,
    `CREATE TABLE IF NOT EXISTS persona_reviews (
      id ${idColumn},
      group_id ${integer} NOT NULL,
      persona_name ${text} NOT NULL,
      summary ${text} NOT NULL,
      suggested_prompt ${text} NOT NULL,
      status ${text} NOT NULL,
      created_at ${integer} NOT NULL,
      approved_at ${integer}
    )`,
    `CREATE TABLE IF NOT EXISTS persona_snapshots (
      id ${idColumn},
      group_id ${integer} NOT NULL,
      persona_name ${text} NOT NULL,
      content ${text} NOT NULL,
      review_id ${integer},
      is_active INTEGER DEFAULT 0,
      created_at ${integer} NOT NULL
    )`,
    `CREATE TABLE IF NOT EXISTS analysis_snapshots (
      id ${idColumn},
      group_id ${integer} NOT NULL,
      analysis_type ${text} NOT NULL,
      payload ${text} NOT NULL,
      updated_at ${integer} NOT NULL,
      UNIQUE(group_id, analysis_type)
    )`,
    `CREATE TABLE IF NOT EXISTS learning_runs (
      id ${idColumn},
      group_id ${integer} NOT NULL,
      summary ${text} NOT NULL,
      status ${text} NOT NULL,
      created_at ${integer} NOT NULL
    )`,
  ];
}

export class SelfLearningStore {
  private readonly adapter: DatabaseAdapter;

  constructor(adapter: DatabaseAdapter = createDatabaseAdapter()) {
    this.adapter = adapter;
  }

  async initialize(): Promise<void> {
    await this.adapter.initialize(getSchemaStatements(this.adapter.dialect));
  }

  async close(): Promise<void> {
    await this.adapter.close();
  }

  async saveCapturedMessage(record: CapturedMessageRecord): Promise<void> {
    await this.adapter.run(
      `INSERT INTO captured_messages (group_id, user_id, nickname, text, raw_message, is_at_bot, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [record.groupId, record.userId, record.nickname, record.text, record.rawMessage, record.isAtBot ? 1 : 0, record.createdAt],
    );
  }

  async listRecentCapturedMessages(groupId: number, limit = 100): Promise<CapturedMessageRecord[]> {
    const rows = await this.adapter.query<any>(
      `SELECT id, group_id as groupId, user_id as userId, nickname, text, raw_message as rawMessage, is_at_bot as isAtBot, created_at as createdAt
       FROM captured_messages WHERE group_id = ? ORDER BY created_at DESC LIMIT ?`,
      [groupId, limit],
    );
    return rows.map(row => ({ ...row, isAtBot: Boolean(row.isAtBot) }));
  }

  async listCapturedMessages(groupId?: number): Promise<CapturedMessageRecord[]> {
    const rows = await this.adapter.query<any>(
      groupId
        ? `SELECT id, group_id as groupId, user_id as userId, nickname, text, raw_message as rawMessage, is_at_bot as isAtBot, created_at as createdAt
           FROM captured_messages WHERE group_id = ? ORDER BY created_at ASC`
        : `SELECT id, group_id as groupId, user_id as userId, nickname, text, raw_message as rawMessage, is_at_bot as isAtBot, created_at as createdAt
           FROM captured_messages ORDER BY group_id ASC, created_at ASC`,
      groupId ? [groupId] : [],
    );
    return rows.map(row => ({ ...row, isAtBot: Boolean(row.isAtBot) }));
  }

  async getOverview(): Promise<Record<string, number>> {
    const messages = (await this.adapter.get<{ count: number }>('SELECT COUNT(*) as count FROM captured_messages'))?.count || 0;
    const groups = (await this.adapter.get<{ count: number }>('SELECT COUNT(DISTINCT group_id) as count FROM captured_messages'))?.count || 0;
    const patterns = (await this.adapter.get<{ count: number }>('SELECT COUNT(*) as count FROM style_patterns'))?.count || 0;
    const slang = (await this.adapter.get<{ count: number }>('SELECT COUNT(*) as count FROM slang_terms'))?.count || 0;
    const memories = (await this.adapter.get<{ count: number }>('SELECT COUNT(*) as count FROM memory_nodes'))?.count || 0;
    const pendingReviews = (await this.adapter.get<{ count: number }>('SELECT COUNT(*) as count FROM persona_reviews WHERE status = ?', ['pending']))?.count || 0;
    const runs = (await this.adapter.get<{ count: number }>('SELECT COUNT(*) as count FROM learning_runs'))?.count || 0;
    return { messages, groups, patterns, slang, memories, pendingReviews, runs };
  }

  async upsertStylePattern(record: StylePatternRecord): Promise<void> {
    const existing = await this.adapter.get<{ evidenceCount: number }>(
      `SELECT evidence_count as evidenceCount FROM style_patterns
       WHERE group_id = ? AND user_id = ? AND pattern_type = ? AND pattern_value = ?`,
      [record.groupId, record.userId, record.patternType, record.patternValue],
    );
    if (existing) {
      await this.adapter.run(
        `UPDATE style_patterns SET weight = ?, evidence_count = ?, last_seen = ?
         WHERE group_id = ? AND user_id = ? AND pattern_type = ? AND pattern_value = ?`,
        [record.weight, existing.evidenceCount + record.evidenceCount, record.lastSeen, record.groupId, record.userId, record.patternType, record.patternValue],
      );
      return;
    }
    await this.adapter.run(
      `INSERT INTO style_patterns (group_id, user_id, pattern_type, pattern_value, weight, evidence_count, last_seen)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [record.groupId, record.userId, record.patternType, record.patternValue, record.weight, record.evidenceCount, record.lastSeen],
    );
  }

  async listStylePatterns(groupId: number, userId?: number, limit = 20): Promise<StylePatternRecord[]> {
    return this.adapter.query<StylePatternRecord>(
      userId
        ? `SELECT group_id as groupId, user_id as userId, pattern_type as patternType, pattern_value as patternValue, weight, evidence_count as evidenceCount, last_seen as lastSeen
           FROM style_patterns WHERE group_id = ? AND user_id = ? ORDER BY weight DESC, evidence_count DESC LIMIT ?`
        : `SELECT group_id as groupId, user_id as userId, pattern_type as patternType, pattern_value as patternValue, weight, evidence_count as evidenceCount, last_seen as lastSeen
           FROM style_patterns WHERE group_id = ? ORDER BY weight DESC, evidence_count DESC LIMIT ?`,
      userId ? [groupId, userId, limit] : [groupId, limit],
    );
  }

  async upsertSlang(record: SlangRecord): Promise<void> {
    const existing = await this.adapter.get<{ usageCount: number }>('SELECT usage_count as usageCount FROM slang_terms WHERE group_id = ? AND term = ?', [record.groupId, record.term]);
    if (existing) {
      await this.adapter.run('UPDATE slang_terms SET meaning = ?, usage_count = ?, last_seen = ? WHERE group_id = ? AND term = ?', [
        record.meaning,
        existing.usageCount + record.usageCount,
        record.lastSeen,
        record.groupId,
        record.term,
      ]);
      return;
    }
    await this.adapter.run('INSERT INTO slang_terms (group_id, term, meaning, usage_count, last_seen) VALUES (?, ?, ?, ?, ?)', [
      record.groupId,
      record.term,
      record.meaning,
      record.usageCount,
      record.lastSeen,
    ]);
  }

  async listSlang(groupId: number, limit = 20): Promise<SlangRecord[]> {
    return this.adapter.query<SlangRecord>(
      `SELECT group_id as groupId, term, meaning, usage_count as usageCount, last_seen as lastSeen
       FROM slang_terms WHERE group_id = ? ORDER BY usage_count DESC, last_seen DESC LIMIT ?`,
      [groupId, limit],
    );
  }

  async upsertSocialEdge(record: SocialEdgeRecord): Promise<void> {
    const existing = await this.adapter.get<{ score: number; interactions: number }>(
      `SELECT score, interactions FROM social_edges
       WHERE group_id = ? AND source_user_id = ? AND target_user_id = ? AND relation_type = ?`,
      [record.groupId, record.sourceUserId, record.targetUserId, record.relationType],
    );
    if (existing) {
      await this.adapter.run(
        `UPDATE social_edges SET score = ?, interactions = ?, last_seen = ?
         WHERE group_id = ? AND source_user_id = ? AND target_user_id = ? AND relation_type = ?`,
        [existing.score + record.score, existing.interactions + record.interactions, record.lastSeen, record.groupId, record.sourceUserId, record.targetUserId, record.relationType],
      );
      return;
    }
    await this.adapter.run(
      `INSERT INTO social_edges (group_id, source_user_id, target_user_id, relation_type, score, interactions, last_seen)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [record.groupId, record.sourceUserId, record.targetUserId, record.relationType, record.score, record.interactions, record.lastSeen],
    );
  }

  async listSocialEdges(groupId: number, userId?: number, limit = 50): Promise<SocialEdgeRecord[]> {
    return this.adapter.query<SocialEdgeRecord>(
      userId
        ? `SELECT group_id as groupId, source_user_id as sourceUserId, target_user_id as targetUserId, relation_type as relationType, score, interactions, last_seen as lastSeen
           FROM social_edges WHERE group_id = ? AND (source_user_id = ? OR target_user_id = ?)
           ORDER BY score DESC, interactions DESC LIMIT ?`
        : `SELECT group_id as groupId, source_user_id as sourceUserId, target_user_id as targetUserId, relation_type as relationType, score, interactions, last_seen as lastSeen
           FROM social_edges WHERE group_id = ? ORDER BY score DESC, interactions DESC LIMIT ?`,
      userId ? [groupId, userId, userId, limit] : [groupId, limit],
    );
  }

  async upsertAffection(record: AffectionRecord): Promise<void> {
    const existing = await this.adapter.get<{ score: number }>('SELECT score FROM affection_scores WHERE group_id = ? AND user_id = ?', [record.groupId, record.userId]);
    if (existing) {
      await this.adapter.run('UPDATE affection_scores SET score = ?, last_delta = ?, updated_at = ? WHERE group_id = ? AND user_id = ?', [
        record.score,
        record.lastDelta,
        record.updatedAt,
        record.groupId,
        record.userId,
      ]);
      return;
    }
    await this.adapter.run('INSERT INTO affection_scores (group_id, user_id, score, last_delta, updated_at) VALUES (?, ?, ?, ?, ?)', [
      record.groupId,
      record.userId,
      record.score,
      record.lastDelta,
      record.updatedAt,
    ]);
  }

  async listAffection(groupId: number, limit = 20): Promise<AffectionRecord[]> {
    return this.adapter.query<AffectionRecord>(
      `SELECT group_id as groupId, user_id as userId, score, last_delta as lastDelta, updated_at as updatedAt
       FROM affection_scores WHERE group_id = ? ORDER BY score DESC LIMIT ?`,
      [groupId, limit],
    );
  }

  async getAffection(groupId: number, userId: number): Promise<AffectionRecord | undefined> {
    return this.adapter.get<AffectionRecord>(
      `SELECT group_id as groupId, user_id as userId, score, last_delta as lastDelta, updated_at as updatedAt
       FROM affection_scores WHERE group_id = ? AND user_id = ?`,
      [groupId, userId],
    );
  }

  async setMood(record: MoodRecord): Promise<void> {
    const existing = await this.adapter.get<{ mood: string }>('SELECT mood FROM mood_states WHERE group_id = ?', [record.groupId]);
    if (existing) {
      await this.adapter.run('UPDATE mood_states SET mood = ?, intensity = ?, reason = ?, updated_at = ? WHERE group_id = ?', [
        record.mood,
        record.intensity,
        record.reason,
        record.updatedAt,
        record.groupId,
      ]);
      return;
    }
    await this.adapter.run('INSERT INTO mood_states (group_id, mood, intensity, reason, updated_at) VALUES (?, ?, ?, ?, ?)', [
      record.groupId,
      record.mood,
      record.intensity,
      record.reason,
      record.updatedAt,
    ]);
  }

  async getMood(groupId: number): Promise<MoodRecord | undefined> {
    return this.adapter.get<MoodRecord>(
      `SELECT group_id as groupId, mood, intensity, reason, updated_at as updatedAt FROM mood_states WHERE group_id = ?`,
      [groupId],
    );
  }

  async upsertGoal(record: GoalRecord): Promise<void> {
    const existing = await this.adapter.get<{ goalType: string }>('SELECT goal_type as goalType FROM goal_sessions WHERE group_id = ? AND user_id = ?', [record.groupId, record.userId]);
    if (existing) {
      await this.adapter.run('UPDATE goal_sessions SET goal_type = ?, status = ?, summary = ?, updated_at = ? WHERE group_id = ? AND user_id = ?', [
        record.goalType,
        record.status,
        record.summary,
        record.updatedAt,
        record.groupId,
        record.userId,
      ]);
      return;
    }
    await this.adapter.run('INSERT INTO goal_sessions (group_id, user_id, goal_type, status, summary, updated_at) VALUES (?, ?, ?, ?, ?, ?)', [
      record.groupId,
      record.userId,
      record.goalType,
      record.status,
      record.summary,
      record.updatedAt,
    ]);
  }

  async listGoals(groupId: number, limit = 30): Promise<GoalRecord[]> {
    return this.adapter.query<GoalRecord>(
      `SELECT group_id as groupId, user_id as userId, goal_type as goalType, status, summary, updated_at as updatedAt
       FROM goal_sessions WHERE group_id = ? ORDER BY updated_at DESC LIMIT ?`,
      [groupId, limit],
    );
  }

  async getGoal(groupId: number, userId: number): Promise<GoalRecord | undefined> {
    return this.adapter.get<GoalRecord>(
      `SELECT group_id as groupId, user_id as userId, goal_type as goalType, status, summary, updated_at as updatedAt
       FROM goal_sessions WHERE group_id = ? AND user_id = ?`,
      [groupId, userId],
    );
  }

  async upsertMemory(record: MemoryRecord): Promise<void> {
    const existing = await this.adapter.get<{ id: number }>('SELECT id FROM memory_nodes WHERE group_id = ? AND user_id = ? AND memory_key = ?', [record.groupId, record.userId, record.key]);
    if (existing) {
      await this.adapter.run('UPDATE memory_nodes SET content = ?, importance = ?, tags = ?, updated_at = ? WHERE id = ?', [
        record.content,
        record.importance,
        JSON.stringify(record.tags),
        record.updatedAt,
        existing.id,
      ]);
      return;
    }
    await this.adapter.run('INSERT INTO memory_nodes (group_id, user_id, memory_key, content, importance, tags, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?)', [
      record.groupId,
      record.userId,
      record.key,
      record.content,
      record.importance,
      JSON.stringify(record.tags),
      record.updatedAt,
    ]);
  }

  async searchMemories(groupId: number, userId: number, keywords: string[], limit = 10): Promise<MemoryRecord[]> {
    const rows = await this.adapter.query<any>(
      `SELECT id, group_id as groupId, user_id as userId, memory_key as key, content, importance, tags, updated_at as updatedAt
       FROM memory_nodes WHERE group_id = ? AND user_id = ? ORDER BY importance DESC, updated_at DESC LIMIT 50`,
      [groupId, userId],
    );
    const lowerKeywords = keywords.map(item => item.toLowerCase());
    return rows
      .map(row => ({ ...row, tags: JSON.parse(row.tags || '[]') as string[] }))
      .filter(row => lowerKeywords.length === 0 || lowerKeywords.some(keyword => row.content.toLowerCase().includes(keyword) || row.key.toLowerCase().includes(keyword)))
      .slice(0, limit);
  }

  async listMemories(groupId: number, userId?: number, limit = 30): Promise<MemoryRecord[]> {
    const rows = await this.adapter.query<any>(
      userId
        ? `SELECT id, group_id as groupId, user_id as userId, memory_key as key, content, importance, tags, updated_at as updatedAt
           FROM memory_nodes WHERE group_id = ? AND user_id = ? ORDER BY importance DESC, updated_at DESC LIMIT ?`
        : `SELECT id, group_id as groupId, user_id as userId, memory_key as key, content, importance, tags, updated_at as updatedAt
           FROM memory_nodes WHERE group_id = ? ORDER BY importance DESC, updated_at DESC LIMIT ?`,
      userId ? [groupId, userId, limit] : [groupId, limit],
    );
    return rows.map(row => ({ ...row, tags: JSON.parse(row.tags || '[]') as string[] }));
  }

  async createPersonaReview(record: PersonaReviewRecord): Promise<number> {
    await this.adapter.run(
      `INSERT INTO persona_reviews (group_id, persona_name, summary, suggested_prompt, status, created_at, approved_at)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [record.groupId, record.personaName, record.summary, record.suggestedPrompt, record.status, record.createdAt, record.approvedAt || null],
    );
    return (await this.adapter.get<{ id: number }>('SELECT MAX(id) as id FROM persona_reviews'))?.id || 0;
  }

  async listPersonaReviews(groupId?: number, status?: string, limit = 30): Promise<PersonaReviewRecord[]> {
    const where: string[] = [];
    const params: Array<number | string> = [];
    if (groupId) {
      where.push('group_id = ?');
      params.push(groupId);
    }
    if (status) {
      where.push('status = ?');
      params.push(status);
    }
    params.push(limit);
    return this.adapter.query<PersonaReviewRecord>(
      `SELECT id, group_id as groupId, persona_name as personaName, summary, suggested_prompt as suggestedPrompt, status, created_at as createdAt, approved_at as approvedAt
       FROM persona_reviews ${where.length ? `WHERE ${where.join(' AND ')}` : ''} ORDER BY created_at DESC LIMIT ?`,
      params,
    );
  }

  async updatePersonaReviewStatus(reviewId: number, status: 'approved' | 'rejected', approvedAt?: number): Promise<void> {
    await this.adapter.run('UPDATE persona_reviews SET status = ?, approved_at = ? WHERE id = ?', [status, approvedAt || null, reviewId]);
  }

  async activatePersonaSnapshot(groupId: number, personaName: string, content: string, reviewId?: number): Promise<void> {
    await this.adapter.run('UPDATE persona_snapshots SET is_active = 0 WHERE group_id = ?', [groupId]);
    await this.adapter.run(
      `INSERT INTO persona_snapshots (group_id, persona_name, content, review_id, is_active, created_at)
       VALUES (?, ?, ?, ?, 1, ?)`,
      [groupId, personaName, content, reviewId || null, Date.now()],
    );
  }

  async getActivePersonaSnapshot(groupId: number): Promise<{ personaName: string; content: string } | undefined> {
    return this.adapter.get<{ personaName: string; content: string }>(
      `SELECT persona_name as personaName, content FROM persona_snapshots
       WHERE group_id = ? AND is_active = 1 ORDER BY created_at DESC LIMIT 1`,
      [groupId],
    );
  }

  async saveAnalysisSnapshot<T>(record: AnalysisSnapshotRecord<T>): Promise<void> {
    const existing = await this.adapter.get<{ id: number }>('SELECT id FROM analysis_snapshots WHERE group_id = ? AND analysis_type = ?', [record.groupId, record.analysisType]);
    if (existing) {
      await this.adapter.run('UPDATE analysis_snapshots SET payload = ?, updated_at = ? WHERE id = ?', [
        JSON.stringify(record.payload),
        record.updatedAt,
        existing.id,
      ]);
      return;
    }
    await this.adapter.run('INSERT INTO analysis_snapshots (group_id, analysis_type, payload, updated_at) VALUES (?, ?, ?, ?)', [
      record.groupId,
      record.analysisType,
      JSON.stringify(record.payload),
      record.updatedAt,
    ]);
  }

  async getAnalysisSnapshot<T>(groupId: number, analysisType: string): Promise<AnalysisSnapshotRecord<T> | undefined> {
    const row = await this.adapter.get<any>(
      `SELECT id, group_id as groupId, analysis_type as analysisType, payload, updated_at as updatedAt
       FROM analysis_snapshots WHERE group_id = ? AND analysis_type = ?`,
      [groupId, analysisType],
    );
    if (!row) return undefined;
    return { ...row, payload: JSON.parse(row.payload || '{}') as T };
  }

  async saveLearningRun(record: LearningRunRecord): Promise<number> {
    await this.adapter.run('INSERT INTO learning_runs (group_id, summary, status, created_at) VALUES (?, ?, ?, ?)', [
      record.groupId,
      record.summary,
      record.status,
      record.createdAt,
    ]);
    return (await this.adapter.get<{ id: number }>('SELECT MAX(id) as id FROM learning_runs'))?.id || 0;
  }

  async listLearningRuns(groupId: number, limit = 20): Promise<LearningRunRecord[]> {
    return this.adapter.query<LearningRunRecord>(
      `SELECT id, group_id as groupId, summary, status, created_at as createdAt
       FROM learning_runs WHERE group_id = ? ORDER BY created_at DESC LIMIT ?`,
      [groupId, limit],
    );
  }

  async getTrackedGroups(): Promise<number[]> {
    const rows = await this.adapter.query<{ groupId: number }>('SELECT DISTINCT group_id as groupId FROM captured_messages ORDER BY group_id ASC');
    return rows.map(row => row.groupId);
  }

  async listPersonaSnapshots(groupId?: number): Promise<PersonaSnapshotRecord[]> {
    return this.adapter.query<PersonaSnapshotRecord>(
      groupId
        ? `SELECT id, group_id as groupId, persona_name as personaName, content, review_id as reviewId, is_active as isActive, created_at as createdAt
           FROM persona_snapshots WHERE group_id = ? ORDER BY created_at DESC`
        : `SELECT id, group_id as groupId, persona_name as personaName, content, review_id as reviewId, is_active as isActive, created_at as createdAt
           FROM persona_snapshots ORDER BY group_id ASC, created_at DESC`,
      groupId ? [groupId] : [],
    ).then(rows => rows.map(row => ({ ...row, isActive: Boolean((row as any).isActive) })));
  }

  async listAnalysisSnapshots(groupId?: number): Promise<Array<AnalysisSnapshotRecord>> {
    const rows = await this.adapter.query<any>(
      groupId
        ? `SELECT id, group_id as groupId, analysis_type as analysisType, payload, updated_at as updatedAt
           FROM analysis_snapshots WHERE group_id = ? ORDER BY updated_at DESC`
        : `SELECT id, group_id as groupId, analysis_type as analysisType, payload, updated_at as updatedAt
           FROM analysis_snapshots ORDER BY group_id ASC, updated_at DESC`,
      groupId ? [groupId] : [],
    );
    return rows.map(row => ({ ...row, payload: JSON.parse(row.payload || '{}') }));
  }

  async listAllLearningRuns(groupId?: number): Promise<LearningRunRecord[]> {
    return this.adapter.query<LearningRunRecord>(
      groupId
        ? `SELECT id, group_id as groupId, summary, status, created_at as createdAt
           FROM learning_runs WHERE group_id = ? ORDER BY created_at DESC`
        : `SELECT id, group_id as groupId, summary, status, created_at as createdAt
           FROM learning_runs ORDER BY group_id ASC, created_at DESC`,
      groupId ? [groupId] : [],
    );
  }

  async clearGroupData(groupId: number): Promise<Record<string, number>> {
    const tables = [
      ['capturedMessages', 'captured_messages'],
      ['stylePatterns', 'style_patterns'],
      ['slangTerms', 'slang_terms'],
      ['socialEdges', 'social_edges'],
      ['affectionScores', 'affection_scores'],
      ['moodStates', 'mood_states'],
      ['goalSessions', 'goal_sessions'],
      ['memoryNodes', 'memory_nodes'],
      ['personaReviews', 'persona_reviews'],
      ['personaSnapshots', 'persona_snapshots'],
      ['analysisSnapshots', 'analysis_snapshots'],
      ['learningRuns', 'learning_runs'],
    ] as const;
    const counts: Record<string, number> = {};
    for (const [key, table] of tables) {
      counts[key] = (await this.adapter.get<{ count: number }>(`SELECT COUNT(*) as count FROM ${table} WHERE group_id = ?`, [groupId]))?.count || 0;
      await this.adapter.run(`DELETE FROM ${table} WHERE group_id = ?`, [groupId]);
    }
    return counts;
  }

  async exportData(groupId?: number): Promise<SelfLearningExportBundle> {
    const [
      capturedMessages,
      stylePatterns,
      slangTerms,
      socialEdges,
      affectionScores,
      moodStates,
      goalSessions,
      memoryNodes,
      personaReviews,
      personaSnapshots,
      analysisSnapshots,
      learningRuns,
    ] = await Promise.all([
      this.listCapturedMessages(groupId),
      this.adapter.query<StylePatternRecord>(
        groupId
          ? `SELECT group_id as groupId, user_id as userId, pattern_type as patternType, pattern_value as patternValue, weight, evidence_count as evidenceCount, last_seen as lastSeen
             FROM style_patterns WHERE group_id = ? ORDER BY user_id ASC, weight DESC`
          : `SELECT group_id as groupId, user_id as userId, pattern_type as patternType, pattern_value as patternValue, weight, evidence_count as evidenceCount, last_seen as lastSeen
             FROM style_patterns ORDER BY group_id ASC, user_id ASC, weight DESC`,
        groupId ? [groupId] : [],
      ),
      this.adapter.query<SlangRecord>(
        groupId
          ? `SELECT group_id as groupId, term, meaning, usage_count as usageCount, last_seen as lastSeen
             FROM slang_terms WHERE group_id = ? ORDER BY usage_count DESC, last_seen DESC`
          : `SELECT group_id as groupId, term, meaning, usage_count as usageCount, last_seen as lastSeen
             FROM slang_terms ORDER BY group_id ASC, usage_count DESC, last_seen DESC`,
        groupId ? [groupId] : [],
      ),
      this.adapter.query<SocialEdgeRecord>(
        groupId
          ? `SELECT group_id as groupId, source_user_id as sourceUserId, target_user_id as targetUserId, relation_type as relationType, score, interactions, last_seen as lastSeen
             FROM social_edges WHERE group_id = ? ORDER BY score DESC, interactions DESC`
          : `SELECT group_id as groupId, source_user_id as sourceUserId, target_user_id as targetUserId, relation_type as relationType, score, interactions, last_seen as lastSeen
             FROM social_edges ORDER BY group_id ASC, score DESC, interactions DESC`,
        groupId ? [groupId] : [],
      ),
      this.adapter.query<AffectionRecord>(
        groupId
          ? `SELECT group_id as groupId, user_id as userId, score, last_delta as lastDelta, updated_at as updatedAt
             FROM affection_scores WHERE group_id = ? ORDER BY score DESC`
          : `SELECT group_id as groupId, user_id as userId, score, last_delta as lastDelta, updated_at as updatedAt
             FROM affection_scores ORDER BY group_id ASC, score DESC`,
        groupId ? [groupId] : [],
      ),
      this.adapter.query<MoodRecord>(
        groupId
          ? `SELECT group_id as groupId, mood, intensity, reason, updated_at as updatedAt
             FROM mood_states WHERE group_id = ? ORDER BY updated_at DESC`
          : `SELECT group_id as groupId, mood, intensity, reason, updated_at as updatedAt
             FROM mood_states ORDER BY group_id ASC, updated_at DESC`,
        groupId ? [groupId] : [],
      ),
      this.adapter.query<GoalRecord>(
        groupId
          ? `SELECT group_id as groupId, user_id as userId, goal_type as goalType, status, summary, updated_at as updatedAt
             FROM goal_sessions WHERE group_id = ? ORDER BY updated_at DESC`
          : `SELECT group_id as groupId, user_id as userId, goal_type as goalType, status, summary, updated_at as updatedAt
             FROM goal_sessions ORDER BY group_id ASC, updated_at DESC`,
        groupId ? [groupId] : [],
      ),
      this.adapter.query<any>(
        groupId
          ? `SELECT id, group_id as groupId, user_id as userId, memory_key as key, content, importance, tags, updated_at as updatedAt
             FROM memory_nodes WHERE group_id = ? ORDER BY importance DESC, updated_at DESC`
          : `SELECT id, group_id as groupId, user_id as userId, memory_key as key, content, importance, tags, updated_at as updatedAt
             FROM memory_nodes ORDER BY group_id ASC, importance DESC, updated_at DESC`,
        groupId ? [groupId] : [],
      ).then(rows => rows.map(row => ({ ...row, tags: JSON.parse(row.tags || '[]') as string[] }))),
      this.listPersonaReviews(groupId, undefined, 1000000),
      this.listPersonaSnapshots(groupId),
      this.listAnalysisSnapshots(groupId),
      this.listAllLearningRuns(groupId),
    ]);

    const groups = Array.from(new Set(
      [
        ...capturedMessages.map(item => item.groupId),
        ...stylePatterns.map(item => item.groupId),
        ...slangTerms.map(item => item.groupId),
        ...socialEdges.map(item => item.groupId),
        ...affectionScores.map(item => item.groupId),
        ...moodStates.map(item => item.groupId),
        ...goalSessions.map(item => item.groupId),
        ...memoryNodes.map(item => item.groupId),
        ...personaReviews.map(item => item.groupId),
        ...personaSnapshots.map(item => item.groupId),
        ...analysisSnapshots.map(item => item.groupId),
        ...learningRuns.map(item => item.groupId),
      ].filter(value => Number.isFinite(value)),
    )).sort((a, b) => a - b);

    const counts = {
      capturedMessages: capturedMessages.length,
      stylePatterns: stylePatterns.length,
      slangTerms: slangTerms.length,
      socialEdges: socialEdges.length,
      affectionScores: affectionScores.length,
      moodStates: moodStates.length,
      goalSessions: goalSessions.length,
      memoryNodes: memoryNodes.length,
      personaReviews: personaReviews.length,
      personaSnapshots: personaSnapshots.length,
      analysisSnapshots: analysisSnapshots.length,
      learningRuns: learningRuns.length,
    };

    return {
      version: 1,
      source: 'qqtalker-self-learning',
      exportedAt: Date.now(),
      scope: {
        ...(groupId ? { groupId } : {}),
        groups,
      },
      counts,
      data: {
        capturedMessages,
        stylePatterns,
        slangTerms,
        socialEdges,
        affectionScores,
        moodStates,
        goalSessions,
        memoryNodes,
        personaReviews,
        personaSnapshots,
        analysisSnapshots,
        learningRuns,
      },
    };
  }

  async importData(bundle: SelfLearningExportBundle, mode: SelfLearningImportMode = 'merge'): Promise<{
    importedGroups: number[];
    mode: SelfLearningImportMode;
    counts: Record<string, number>;
  }> {
    const data = bundle?.data;
    if (!data) {
      throw new Error('导入数据格式不正确');
    }

    const importedGroups = Array.from(new Set(
      [
        ...(bundle.scope?.groups || []),
        ...(data.capturedMessages || []).map(item => item.groupId),
        ...(data.stylePatterns || []).map(item => item.groupId),
        ...(data.slangTerms || []).map(item => item.groupId),
        ...(data.socialEdges || []).map(item => item.groupId),
        ...(data.affectionScores || []).map(item => item.groupId),
        ...(data.moodStates || []).map(item => item.groupId),
        ...(data.goalSessions || []).map(item => item.groupId),
        ...(data.memoryNodes || []).map(item => item.groupId),
        ...(data.personaReviews || []).map(item => item.groupId),
        ...(data.personaSnapshots || []).map(item => item.groupId),
        ...(data.analysisSnapshots || []).map(item => item.groupId),
        ...(data.learningRuns || []).map(item => item.groupId),
      ].filter(value => Number.isFinite(value)),
    )).sort((a, b) => a - b);

    if (mode === 'replace') {
      for (const groupId of importedGroups) {
        await this.clearGroupData(groupId);
      }
    }

    for (const record of data.capturedMessages || []) {
      await this.saveCapturedMessage(record);
    }
    for (const record of data.stylePatterns || []) {
      await this.upsertStylePattern(record);
    }
    for (const record of data.slangTerms || []) {
      await this.upsertSlang(record);
    }
    for (const record of data.socialEdges || []) {
      await this.upsertSocialEdge(record);
    }
    for (const record of data.affectionScores || []) {
      await this.upsertAffection(record);
    }
    for (const record of data.moodStates || []) {
      await this.setMood(record);
    }
    for (const record of data.goalSessions || []) {
      await this.upsertGoal(record);
    }
    for (const record of data.memoryNodes || []) {
      await this.upsertMemory(record);
    }
    for (const record of data.personaReviews || []) {
      await this.adapter.run(
        `INSERT INTO persona_reviews (group_id, persona_name, summary, suggested_prompt, status, created_at, approved_at)
         VALUES (?, ?, ?, ?, ?, ?, ?)`,
        [record.groupId, record.personaName, record.summary, record.suggestedPrompt, record.status, record.createdAt, record.approvedAt || null],
      );
    }
    for (const record of data.personaSnapshots || []) {
      if (record.isActive) {
        await this.activatePersonaSnapshot(record.groupId, record.personaName, record.content, record.reviewId || undefined);
      } else {
        await this.adapter.run(
          `INSERT INTO persona_snapshots (group_id, persona_name, content, review_id, is_active, created_at)
           VALUES (?, ?, ?, ?, 0, ?)`,
          [record.groupId, record.personaName, record.content, record.reviewId || null, record.createdAt],
        );
      }
    }
    for (const record of data.analysisSnapshots || []) {
      await this.saveAnalysisSnapshot(record);
    }
    for (const record of data.learningRuns || []) {
      await this.saveLearningRun(record);
    }

    return {
      importedGroups,
      mode,
      counts: {
        capturedMessages: (data.capturedMessages || []).length,
        stylePatterns: (data.stylePatterns || []).length,
        slangTerms: (data.slangTerms || []).length,
        socialEdges: (data.socialEdges || []).length,
        affectionScores: (data.affectionScores || []).length,
        moodStates: (data.moodStates || []).length,
        goalSessions: (data.goalSessions || []).length,
        memoryNodes: (data.memoryNodes || []).length,
        personaReviews: (data.personaReviews || []).length,
        personaSnapshots: (data.personaSnapshots || []).length,
        analysisSnapshots: (data.analysisSnapshots || []).length,
        learningRuns: (data.learningRuns || []).length,
      },
    };
  }
}
