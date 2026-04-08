import path from 'path';
import { SqlJsDatabase } from '../../storage/sqljs-database';
import { config } from '../../types/config';

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

const schemaStatements = [
  `CREATE TABLE IF NOT EXISTS captured_messages (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    group_id INTEGER NOT NULL,
    user_id INTEGER NOT NULL,
    nickname TEXT NOT NULL,
    text TEXT NOT NULL,
    raw_message TEXT NOT NULL,
    is_at_bot INTEGER NOT NULL DEFAULT 0,
    created_at INTEGER NOT NULL
  );`,
  `CREATE TABLE IF NOT EXISTS style_patterns (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    group_id INTEGER NOT NULL,
    user_id INTEGER NOT NULL,
    pattern_type TEXT NOT NULL,
    pattern_value TEXT NOT NULL,
    weight REAL NOT NULL,
    evidence_count INTEGER NOT NULL,
    last_seen INTEGER NOT NULL,
    UNIQUE(group_id, user_id, pattern_type, pattern_value)
  );`,
  `CREATE TABLE IF NOT EXISTS slang_terms (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    group_id INTEGER NOT NULL,
    term TEXT NOT NULL,
    meaning TEXT NOT NULL,
    usage_count INTEGER NOT NULL,
    last_seen INTEGER NOT NULL,
    UNIQUE(group_id, term)
  );`,
  `CREATE TABLE IF NOT EXISTS social_edges (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    group_id INTEGER NOT NULL,
    source_user_id INTEGER NOT NULL,
    target_user_id INTEGER NOT NULL,
    relation_type TEXT NOT NULL,
    score REAL NOT NULL,
    interactions INTEGER NOT NULL,
    last_seen INTEGER NOT NULL,
    UNIQUE(group_id, source_user_id, target_user_id, relation_type)
  );`,
  `CREATE TABLE IF NOT EXISTS affection_scores (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    group_id INTEGER NOT NULL,
    user_id INTEGER NOT NULL,
    score REAL NOT NULL,
    last_delta REAL NOT NULL,
    updated_at INTEGER NOT NULL,
    UNIQUE(group_id, user_id)
  );`,
  `CREATE TABLE IF NOT EXISTS mood_states (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    group_id INTEGER NOT NULL,
    mood TEXT NOT NULL,
    intensity REAL NOT NULL,
    reason TEXT NOT NULL,
    updated_at INTEGER NOT NULL,
    UNIQUE(group_id)
  );`,
  `CREATE TABLE IF NOT EXISTS goal_sessions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    group_id INTEGER NOT NULL,
    user_id INTEGER NOT NULL,
    goal_type TEXT NOT NULL,
    status TEXT NOT NULL,
    summary TEXT NOT NULL,
    updated_at INTEGER NOT NULL,
    UNIQUE(group_id, user_id)
  );`,
  `CREATE TABLE IF NOT EXISTS memory_nodes (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    group_id INTEGER NOT NULL,
    user_id INTEGER NOT NULL,
    memory_key TEXT NOT NULL,
    content TEXT NOT NULL,
    importance REAL NOT NULL,
    tags TEXT NOT NULL,
    updated_at INTEGER NOT NULL,
    UNIQUE(group_id, user_id, memory_key)
  );`,
  `CREATE TABLE IF NOT EXISTS persona_reviews (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    group_id INTEGER NOT NULL,
    persona_name TEXT NOT NULL,
    summary TEXT NOT NULL,
    suggested_prompt TEXT NOT NULL,
    status TEXT NOT NULL,
    created_at INTEGER NOT NULL,
    approved_at INTEGER
  );`,
  `CREATE TABLE IF NOT EXISTS persona_snapshots (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    group_id INTEGER NOT NULL,
    persona_name TEXT NOT NULL,
    content TEXT NOT NULL,
    review_id INTEGER,
    is_active INTEGER NOT NULL DEFAULT 0,
    created_at INTEGER NOT NULL
  );`,
];

export class SelfLearningRepository {
  private readonly db: SqlJsDatabase;

  constructor(dbFilePath: string = path.resolve(process.cwd(), config.selfLearning.dbFile)) {
    this.db = new SqlJsDatabase(dbFilePath);
  }

  async initialize(): Promise<void> {
    await this.db.initialize(schemaStatements);
  }

  close(): void {
    this.db.close();
  }

  saveCapturedMessage(record: CapturedMessageRecord): void {
    this.db.run(
      `INSERT INTO captured_messages (group_id, user_id, nickname, text, raw_message, is_at_bot, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [
        record.groupId,
        record.userId,
        record.nickname,
        record.text,
        record.rawMessage,
        record.isAtBot ? 1 : 0,
        record.createdAt,
      ],
    );
  }

  listRecentCapturedMessages(groupId: number, limit = 100): CapturedMessageRecord[] {
    return this.db.query<any>(
      `SELECT id, group_id as groupId, user_id as userId, nickname, text, raw_message as rawMessage, is_at_bot as isAtBot, created_at as createdAt
       FROM captured_messages WHERE group_id = ? ORDER BY created_at DESC LIMIT ?`,
      [groupId, limit],
    ).map(row => ({ ...row, isAtBot: Boolean(row.isAtBot) }));
  }

  getOverview(): Record<string, number> {
    const messages = this.db.get<{ count: number }>('SELECT COUNT(*) as count FROM captured_messages')?.count || 0;
    const groups = this.db.get<{ count: number }>('SELECT COUNT(DISTINCT group_id) as count FROM captured_messages')?.count || 0;
    const patterns = this.db.get<{ count: number }>('SELECT COUNT(*) as count FROM style_patterns')?.count || 0;
    const slang = this.db.get<{ count: number }>('SELECT COUNT(*) as count FROM slang_terms')?.count || 0;
    const memories = this.db.get<{ count: number }>('SELECT COUNT(*) as count FROM memory_nodes')?.count || 0;
    const pendingReviews = this.db.get<{ count: number }>('SELECT COUNT(*) as count FROM persona_reviews WHERE status = ?', ['pending'])?.count || 0;
    return { messages, groups, patterns, slang, memories, pendingReviews };
  }

  upsertStylePattern(record: StylePatternRecord): void {
    const existing = this.db.get<{ weight: number; evidenceCount: number }>(
      `SELECT weight, evidence_count as evidenceCount FROM style_patterns
       WHERE group_id = ? AND user_id = ? AND pattern_type = ? AND pattern_value = ?`,
      [record.groupId, record.userId, record.patternType, record.patternValue],
    );

    if (existing) {
      this.db.run(
        `UPDATE style_patterns
         SET weight = ?, evidence_count = ?, last_seen = ?
         WHERE group_id = ? AND user_id = ? AND pattern_type = ? AND pattern_value = ?`,
        [
          record.weight,
          existing.evidenceCount + record.evidenceCount,
          record.lastSeen,
          record.groupId,
          record.userId,
          record.patternType,
          record.patternValue,
        ],
      );
      return;
    }

    this.db.run(
      `INSERT INTO style_patterns (group_id, user_id, pattern_type, pattern_value, weight, evidence_count, last_seen)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [
        record.groupId,
        record.userId,
        record.patternType,
        record.patternValue,
        record.weight,
        record.evidenceCount,
        record.lastSeen,
      ],
    );
  }

  listStylePatterns(groupId: number, userId?: number, limit = 20): StylePatternRecord[] {
    const sql = userId
      ? `SELECT group_id as groupId, user_id as userId, pattern_type as patternType, pattern_value as patternValue, weight, evidence_count as evidenceCount, last_seen as lastSeen
         FROM style_patterns WHERE group_id = ? AND user_id = ? ORDER BY weight DESC, evidence_count DESC LIMIT ?`
      : `SELECT group_id as groupId, user_id as userId, pattern_type as patternType, pattern_value as patternValue, weight, evidence_count as evidenceCount, last_seen as lastSeen
         FROM style_patterns WHERE group_id = ? ORDER BY weight DESC, evidence_count DESC LIMIT ?`;
    return this.db.query<StylePatternRecord>(sql, userId ? [groupId, userId, limit] : [groupId, limit]);
  }

  upsertSlang(record: SlangRecord): void {
    const existing = this.db.get<{ usageCount: number }>(
      'SELECT usage_count as usageCount FROM slang_terms WHERE group_id = ? AND term = ?',
      [record.groupId, record.term],
    );
    if (existing) {
      this.db.run(
        'UPDATE slang_terms SET meaning = ?, usage_count = ?, last_seen = ? WHERE group_id = ? AND term = ?',
        [record.meaning, existing.usageCount + record.usageCount, record.lastSeen, record.groupId, record.term],
      );
      return;
    }

    this.db.run(
      'INSERT INTO slang_terms (group_id, term, meaning, usage_count, last_seen) VALUES (?, ?, ?, ?, ?)',
      [record.groupId, record.term, record.meaning, record.usageCount, record.lastSeen],
    );
  }

  listSlang(groupId: number, limit = 20): SlangRecord[] {
    return this.db.query<SlangRecord>(
      `SELECT group_id as groupId, term, meaning, usage_count as usageCount, last_seen as lastSeen
       FROM slang_terms WHERE group_id = ? ORDER BY usage_count DESC, last_seen DESC LIMIT ?`,
      [groupId, limit],
    );
  }

  upsertSocialEdge(record: SocialEdgeRecord): void {
    const existing = this.db.get<{ score: number; interactions: number }>(
      `SELECT score, interactions FROM social_edges
       WHERE group_id = ? AND source_user_id = ? AND target_user_id = ? AND relation_type = ?`,
      [record.groupId, record.sourceUserId, record.targetUserId, record.relationType],
    );
    if (existing) {
      this.db.run(
        `UPDATE social_edges SET score = ?, interactions = ?, last_seen = ?
         WHERE group_id = ? AND source_user_id = ? AND target_user_id = ? AND relation_type = ?`,
        [
          existing.score + record.score,
          existing.interactions + record.interactions,
          record.lastSeen,
          record.groupId,
          record.sourceUserId,
          record.targetUserId,
          record.relationType,
        ],
      );
      return;
    }

    this.db.run(
      `INSERT INTO social_edges (group_id, source_user_id, target_user_id, relation_type, score, interactions, last_seen)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [
        record.groupId,
        record.sourceUserId,
        record.targetUserId,
        record.relationType,
        record.score,
        record.interactions,
        record.lastSeen,
      ],
    );
  }

  listSocialEdges(groupId: number, userId?: number, limit = 50): SocialEdgeRecord[] {
    const sql = userId
      ? `SELECT group_id as groupId, source_user_id as sourceUserId, target_user_id as targetUserId, relation_type as relationType, score, interactions, last_seen as lastSeen
         FROM social_edges WHERE group_id = ? AND (source_user_id = ? OR target_user_id = ?)
         ORDER BY score DESC, interactions DESC LIMIT ?`
      : `SELECT group_id as groupId, source_user_id as sourceUserId, target_user_id as targetUserId, relation_type as relationType, score, interactions, last_seen as lastSeen
         FROM social_edges WHERE group_id = ? ORDER BY score DESC, interactions DESC LIMIT ?`;
    return this.db.query<SocialEdgeRecord>(sql, userId ? [groupId, userId, userId, limit] : [groupId, limit]);
  }

  upsertAffection(record: AffectionRecord): void {
    const existing = this.db.get<{ score: number }>(
      'SELECT score FROM affection_scores WHERE group_id = ? AND user_id = ?',
      [record.groupId, record.userId],
    );
    if (existing) {
      this.db.run(
        'UPDATE affection_scores SET score = ?, last_delta = ?, updated_at = ? WHERE group_id = ? AND user_id = ?',
        [record.score, record.lastDelta, record.updatedAt, record.groupId, record.userId],
      );
      return;
    }

    this.db.run(
      'INSERT INTO affection_scores (group_id, user_id, score, last_delta, updated_at) VALUES (?, ?, ?, ?, ?)',
      [record.groupId, record.userId, record.score, record.lastDelta, record.updatedAt],
    );
  }

  listAffection(groupId: number, limit = 20): AffectionRecord[] {
    return this.db.query<AffectionRecord>(
      `SELECT group_id as groupId, user_id as userId, score, last_delta as lastDelta, updated_at as updatedAt
       FROM affection_scores WHERE group_id = ? ORDER BY score DESC LIMIT ?`,
      [groupId, limit],
    );
  }

  getAffection(groupId: number, userId: number): AffectionRecord | undefined {
    return this.db.get<AffectionRecord>(
      `SELECT group_id as groupId, user_id as userId, score, last_delta as lastDelta, updated_at as updatedAt
       FROM affection_scores WHERE group_id = ? AND user_id = ?`,
      [groupId, userId],
    );
  }

  setMood(record: MoodRecord): void {
    const existing = this.db.get<{ mood: string }>('SELECT mood FROM mood_states WHERE group_id = ?', [record.groupId]);
    if (existing) {
      this.db.run(
        'UPDATE mood_states SET mood = ?, intensity = ?, reason = ?, updated_at = ? WHERE group_id = ?',
        [record.mood, record.intensity, record.reason, record.updatedAt, record.groupId],
      );
      return;
    }

    this.db.run(
      'INSERT INTO mood_states (group_id, mood, intensity, reason, updated_at) VALUES (?, ?, ?, ?, ?)',
      [record.groupId, record.mood, record.intensity, record.reason, record.updatedAt],
    );
  }

  getMood(groupId: number): MoodRecord | undefined {
    return this.db.get<MoodRecord>(
      `SELECT group_id as groupId, mood, intensity, reason, updated_at as updatedAt
       FROM mood_states WHERE group_id = ?`,
      [groupId],
    );
  }

  upsertGoal(record: GoalRecord): void {
    const existing = this.db.get<{ goalType: string }>(
      'SELECT goal_type as goalType FROM goal_sessions WHERE group_id = ? AND user_id = ?',
      [record.groupId, record.userId],
    );
    if (existing) {
      this.db.run(
        'UPDATE goal_sessions SET goal_type = ?, status = ?, summary = ?, updated_at = ? WHERE group_id = ? AND user_id = ?',
        [record.goalType, record.status, record.summary, record.updatedAt, record.groupId, record.userId],
      );
      return;
    }

    this.db.run(
      'INSERT INTO goal_sessions (group_id, user_id, goal_type, status, summary, updated_at) VALUES (?, ?, ?, ?, ?, ?)',
      [record.groupId, record.userId, record.goalType, record.status, record.summary, record.updatedAt],
    );
  }

  listGoals(groupId: number, limit = 30): GoalRecord[] {
    return this.db.query<GoalRecord>(
      `SELECT group_id as groupId, user_id as userId, goal_type as goalType, status, summary, updated_at as updatedAt
       FROM goal_sessions WHERE group_id = ? ORDER BY updated_at DESC LIMIT ?`,
      [groupId, limit],
    );
  }

  getGoal(groupId: number, userId: number): GoalRecord | undefined {
    return this.db.get<GoalRecord>(
      `SELECT group_id as groupId, user_id as userId, goal_type as goalType, status, summary, updated_at as updatedAt
       FROM goal_sessions WHERE group_id = ? AND user_id = ?`,
      [groupId, userId],
    );
  }

  upsertMemory(record: MemoryRecord): void {
    const existing = this.db.get<{ id: number }>(
      'SELECT id FROM memory_nodes WHERE group_id = ? AND user_id = ? AND memory_key = ?',
      [record.groupId, record.userId, record.key],
    );
    if (existing) {
      this.db.run(
        'UPDATE memory_nodes SET content = ?, importance = ?, tags = ?, updated_at = ? WHERE id = ?',
        [record.content, record.importance, JSON.stringify(record.tags), record.updatedAt, existing.id],
      );
      return;
    }

    this.db.run(
      'INSERT INTO memory_nodes (group_id, user_id, memory_key, content, importance, tags, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?)',
      [record.groupId, record.userId, record.key, record.content, record.importance, JSON.stringify(record.tags), record.updatedAt],
    );
  }

  searchMemories(groupId: number, userId: number, keywords: string[], limit = 10): MemoryRecord[] {
    const rows = this.db.query<any>(
      `SELECT id, group_id as groupId, user_id as userId, memory_key as key, content, importance, tags, updated_at as updatedAt
       FROM memory_nodes WHERE group_id = ? AND user_id = ? ORDER BY importance DESC, updated_at DESC LIMIT 50`,
      [groupId, userId],
    );

    const lowerKeywords = keywords.map(item => item.toLowerCase());
    return rows
      .map((row) => ({ ...row, tags: JSON.parse(row.tags || '[]') as string[] }))
      .filter((row) => lowerKeywords.length === 0 || lowerKeywords.some((keyword) => {
        return row.content.toLowerCase().includes(keyword) || row.key.toLowerCase().includes(keyword);
      }))
      .slice(0, limit);
  }

  listMemories(groupId: number, userId?: number, limit = 30): MemoryRecord[] {
    const sql = userId
      ? `SELECT id, group_id as groupId, user_id as userId, memory_key as key, content, importance, tags, updated_at as updatedAt
         FROM memory_nodes WHERE group_id = ? AND user_id = ? ORDER BY importance DESC, updated_at DESC LIMIT ?`
      : `SELECT id, group_id as groupId, user_id as userId, memory_key as key, content, importance, tags, updated_at as updatedAt
         FROM memory_nodes WHERE group_id = ? ORDER BY importance DESC, updated_at DESC LIMIT ?`;
    return this.db.query<any>(sql, userId ? [groupId, userId, limit] : [groupId, limit])
      .map((row) => ({ ...row, tags: JSON.parse(row.tags || '[]') as string[] }));
  }

  createPersonaReview(record: PersonaReviewRecord): number {
    this.db.run(
      `INSERT INTO persona_reviews (group_id, persona_name, summary, suggested_prompt, status, created_at, approved_at)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [
        record.groupId,
        record.personaName,
        record.summary,
        record.suggestedPrompt,
        record.status,
        record.createdAt,
        record.approvedAt || null,
      ],
    );
    const row = this.db.get<{ id: number }>('SELECT MAX(id) as id FROM persona_reviews');
    return row?.id || 0;
  }

  listPersonaReviews(groupId?: number, status?: string, limit = 30): PersonaReviewRecord[] {
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
    return this.db.query<PersonaReviewRecord>(
      `SELECT id, group_id as groupId, persona_name as personaName, summary, suggested_prompt as suggestedPrompt, status, created_at as createdAt, approved_at as approvedAt
       FROM persona_reviews ${where.length ? `WHERE ${where.join(' AND ')}` : ''} ORDER BY created_at DESC LIMIT ?`,
      params,
    );
  }

  updatePersonaReviewStatus(reviewId: number, status: 'approved' | 'rejected', approvedAt?: number): void {
    this.db.run(
      'UPDATE persona_reviews SET status = ?, approved_at = ? WHERE id = ?',
      [status, approvedAt || null, reviewId],
    );
  }

  activatePersonaSnapshot(groupId: number, personaName: string, content: string, reviewId?: number): void {
    this.db.run('UPDATE persona_snapshots SET is_active = 0 WHERE group_id = ?', [groupId]);
    this.db.run(
      `INSERT INTO persona_snapshots (group_id, persona_name, content, review_id, is_active, created_at)
       VALUES (?, ?, ?, ?, 1, ?)`,
      [groupId, personaName, content, reviewId || null, Date.now()],
    );
  }

  getActivePersonaSnapshot(groupId: number): { personaName: string; content: string } | undefined {
    return this.db.get<{ personaName: string; content: string }>(
      `SELECT persona_name as personaName, content FROM persona_snapshots
       WHERE group_id = ? AND is_active = 1 ORDER BY created_at DESC LIMIT 1`,
      [groupId],
    );
  }

  getTrackedGroups(): number[] {
    const rows = this.db.query<{ groupId: number }>('SELECT DISTINCT group_id as groupId FROM captured_messages ORDER BY group_id ASC');
    return rows.map(row => row.groupId);
  }
}
