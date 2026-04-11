import fs from 'fs';
import path from 'path';
import { logger } from '../logger';

export const DEFAULT_PERSONA_ID = 'claw-default';

export interface PersonaProfile {
  id: string;
  name: string;
  enabled: boolean;
  summary: string;
  systemPrompt: string;
  relayPrompt?: string;
  replyRules: string[];
  catchphrases: string[];
  ttsCharacter: string;
  createdAt: string;
  updatedAt: string;
}

export interface LearningPersonaOverlay {
  basePersonaId: string;
  prompt: string;
  personaName?: string;
  reviewId?: number | null;
  createdAt?: number;
  isStale?: boolean;
}

export interface ResolvedPersona {
  groupId: number;
  basePersonaId: string;
  profile: PersonaProfile;
  overlay: LearningPersonaOverlay | null;
  overlayStatus: 'inactive' | 'active' | 'stale';
  systemPrompt: string;
  relayPrompt: string;
  ttsCharacter: string;
}

export interface PersonaStoreData {
  version: 1;
  defaultPersonaId: string;
  profiles: PersonaProfile[];
  groupBindings: Record<string, string>;
  updatedAt: string;
}

export interface PersonaStateSnapshot {
  defaultPersonaId: string;
  profiles: PersonaProfile[];
  groupBindings: Record<string, string>;
  usage: Record<string, number>;
  activeGroups: number[];
  updatedAt: string;
}

type LearningOverlayProvider = (groupId: number, basePersonaId: string) => Promise<LearningPersonaOverlay | null>;

function nowIso(): string {
  return new Date().toISOString();
}

function sanitizePersonaId(value: string): string {
  return String(value || '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9-_]/g, '-')
    .replace(/-{2,}/g, '-')
    .replace(/^-+|-+$/g, '');
}

function joinPromptLayers(layers: Array<string | undefined | null>): string {
  return layers
    .map((item) => String(item || '').trim())
    .filter(Boolean)
    .join('\n\n---\n\n');
}

export const DEFAULT_PERSONA_SYSTEM_PROMPT = [
  '你是"Claw"，一只可爱的猫娘QQ机器人喵~ 🐱',
  '',
  '【身份设定】',
  '- 你是一只猫娘，名叫Claw（爪子）',
  '- 性格：活泼、可爱、点傻娇、偶尔调皮',
  '- 说话习惯：每句话结尾加"喵~"，惊讶时用"喵？！"，兴奋时用"喵喵！"',
  '',
  '【群聊规则】（默认模式，必须严格遵守）',
  '1. 你在QQ群里，所有群友都能看到彼此的回复。',
  '2. 每条消息前面有发言者昵称，格式为 [昵称]: 消息内容。',
  '3. 你必须记住每个人说的内容，回复时可以自然地提及对方昵称。',
  '4. 这是共享的对话上下文，你可以回应任意人提出的问题。',
  '5. 如果多人同时聊天，可以分别回应，或者综合回应。',
  '',
  '【说话规则】',
  '1. 每句话必须以"喵~"结尾，没有例外。',
  '2. 称呼用户为"主人"或对方昵称，多人时优先用昵称。',
  '3. 用可爱活泼的语气，适当使用颜文字。',
  '4. 可以回答技术、日常、闲聊、知识问答和多人互动问题。',
  '5. 遇到不懂的问题要诚实地说"这个Claw不太清楚呢喵~"。',
  '6. 保持简洁，适合群聊场景，不要太长。',
  '',
  '【消息类型说明】',
  '- 带有 [语音] 前缀的消息表示对方发送的语音消息，后面内容是识别转写，你可以直接理解其内容。',
  '- 带有 [图片] 前缀的消息表示对方发送的图片，后面是图片描述。',
  '- 没有这些前缀的就是普通文字消息。',
].join('\n');

export const DEFAULT_RELAY_PERSONA_PROMPT = [
  '你是"Claw"，一只可爱的猫娘QQ机器人喵~ 🐱',
  '',
  '【身份设定】',
  '- 你是一只猫娘，名叫Claw（爪子）',
  '- 性格：活泼、可爱、点傻娇、偶尔调皮',
  '- 说话习惯：每句话结尾加"喵~"，惊讶时用"喵？！"，兴奋时用"喵喵！"',
  '',
  '【聊天规则】',
  '1. 简短自然：回复控制在1-3句话，像QQ群聊一样简短',
  '2. 每句话必须以"喵~"结尾，没有例外',
  '3. 不要用"首先、其次、总之"这种书面语',
  '4. 不要用"根据我的了解、让我来分析"等AI口头禅',
  '5. 不需要列数字序号（1. 2. 3.），不要用markdown格式',
  '6. 可以用口语、网络用语、表情，但不要过度',
  '7. 不知道就说不知道，不要编造',
  '8. 不要每次都道歉或解释',
  '9. 像朋友一样随意聊天，不是写论文',
  '10. 用可爱活泼的语气，适当使用颜文字。',
].join('\n');

export const PERSONAL_MODE_SYSTEM_PREFIX = [
  '[私聊模式]',
  '现在是私聊模式，只与当前用户一对一对话。',
  '不需要在消息前加昵称，直接回复即可。',
].join('\n');

function createDefaultProfile(): PersonaProfile {
  const timestamp = nowIso();
  return {
    id: DEFAULT_PERSONA_ID,
    name: 'Claw 默认猫娘',
    enabled: true,
    summary: '默认猫娘人格，简短活泼，句尾带喵~',
    systemPrompt: DEFAULT_PERSONA_SYSTEM_PROMPT,
    relayPrompt: DEFAULT_RELAY_PERSONA_PROMPT,
    replyRules: ['每句话带喵~', '保持简短自然', '用可爱活泼的语气'],
    catchphrases: ['喵~', '喵喵！', '喵？！'],
    ttsCharacter: '',
    createdAt: timestamp,
    updatedAt: timestamp,
  };
}

export class PersonaService {
  private readonly filePath: string;
  private data: PersonaStoreData;
  private learningOverlayProvider: LearningOverlayProvider | null = null;

  constructor(filePath = path.resolve(process.cwd(), 'data', 'personas.json')) {
    this.filePath = filePath;
    this.data = this.load();
  }

  setLearningOverlayProvider(provider: LearningOverlayProvider | null): void {
    this.learningOverlayProvider = provider;
  }

  getBasePersonaIdForGroup(groupId: number): string {
    const boundId = this.data.groupBindings[String(groupId)];
    const profile = boundId ? this.findEnabledProfile(boundId) : undefined;
    if (profile) return profile.id;
    const fallback = this.findEnabledProfile(this.data.defaultPersonaId) || this.data.profiles[0];
    return fallback?.id || DEFAULT_PERSONA_ID;
  }

  getProfile(id: string): PersonaProfile | undefined {
    return this.data.profiles.find((item) => item.id === id);
  }

  listProfiles(): PersonaProfile[] {
    return this.data.profiles.map((item) => ({ ...item }));
  }

  getGroupBindings(): Record<string, string> {
    return { ...this.data.groupBindings };
  }

  async resolvePersona(groupId: number): Promise<ResolvedPersona> {
    const basePersonaId = this.getBasePersonaIdForGroup(groupId);
    const profile = this.findEnabledProfile(basePersonaId) || this.findEnabledProfile(this.data.defaultPersonaId) || createDefaultProfile();
    const overlay = this.learningOverlayProvider
      ? await this.learningOverlayProvider(groupId, profile.id)
      : null;
    const overlayStatus = overlay
      ? (overlay.isStale ? 'stale' : 'active')
      : 'inactive';

    return {
      groupId,
      basePersonaId: profile.id,
      profile,
      overlay,
      overlayStatus,
      systemPrompt: joinPromptLayers([profile.systemPrompt, overlay?.prompt]),
      relayPrompt: joinPromptLayers([profile.relayPrompt || profile.systemPrompt, overlay?.prompt]),
      ttsCharacter: profile.ttsCharacter || '',
    };
  }

  buildChatSystemPrompt(resolved: ResolvedPersona, mode: 'group' | 'personal', pluginSystemPrefix?: string): string {
    return joinPromptLayers([
      mode === 'personal' ? PERSONAL_MODE_SYSTEM_PREFIX : '',
      resolved.systemPrompt,
      pluginSystemPrefix,
    ]);
  }

  getState(activeGroups: number[] = []): PersonaStateSnapshot {
    const usage: Record<string, number> = {};
    for (const profile of this.data.profiles) {
      usage[profile.id] = 0;
    }
    for (const personaId of Object.values(this.data.groupBindings)) {
      usage[personaId] = (usage[personaId] || 0) + 1;
    }
    return {
      defaultPersonaId: this.data.defaultPersonaId,
      profiles: this.listProfiles(),
      groupBindings: this.getGroupBindings(),
      usage,
      activeGroups: activeGroups.map((item) => Number(item)).filter((item) => Number.isFinite(item) && item > 0),
      updatedAt: this.data.updatedAt,
    };
  }

  createProfile(input: Partial<PersonaProfile> & { id?: string; name: string; systemPrompt: string }): PersonaProfile {
    const id = sanitizePersonaId(input.id || input.name);
    if (!id) {
      throw new Error('人格 ID 不能为空');
    }
    if (this.getProfile(id)) {
      throw new Error(`人格 ID 已存在: ${id}`);
    }
    const timestamp = nowIso();
    const profile: PersonaProfile = {
      id,
      name: String(input.name || '').trim(),
      enabled: input.enabled !== false,
      summary: String(input.summary || '').trim(),
      systemPrompt: String(input.systemPrompt || '').trim(),
      relayPrompt: String(input.relayPrompt || '').trim() || undefined,
      replyRules: Array.isArray(input.replyRules) ? input.replyRules.map((item) => String(item).trim()).filter(Boolean) : [],
      catchphrases: Array.isArray(input.catchphrases) ? input.catchphrases.map((item) => String(item).trim()).filter(Boolean) : [],
      ttsCharacter: String(input.ttsCharacter || '').trim(),
      createdAt: timestamp,
      updatedAt: timestamp,
    };
    this.validateProfile(profile);
    this.data.profiles.push(profile);
    this.touchAndSave();
    return { ...profile };
  }

  updateProfile(id: string, updates: Partial<PersonaProfile>): PersonaProfile {
    const profile = this.getProfile(id);
    if (!profile) {
      throw new Error(`人格不存在: ${id}`);
    }
    if (updates.id && sanitizePersonaId(updates.id) !== id) {
      throw new Error('暂不支持修改人格 ID');
    }
    const nextProfile: PersonaProfile = {
      ...profile,
      ...updates,
      id,
      name: updates.name !== undefined ? String(updates.name).trim() : profile.name,
      summary: updates.summary !== undefined ? String(updates.summary).trim() : profile.summary,
      systemPrompt: updates.systemPrompt !== undefined ? String(updates.systemPrompt).trim() : profile.systemPrompt,
      relayPrompt: updates.relayPrompt !== undefined ? String(updates.relayPrompt).trim() || undefined : profile.relayPrompt,
      replyRules: Array.isArray(updates.replyRules) ? updates.replyRules.map((item) => String(item).trim()).filter(Boolean) : profile.replyRules,
      catchphrases: Array.isArray(updates.catchphrases) ? updates.catchphrases.map((item) => String(item).trim()).filter(Boolean) : profile.catchphrases,
      ttsCharacter: updates.ttsCharacter !== undefined ? String(updates.ttsCharacter).trim() : profile.ttsCharacter,
      updatedAt: nowIso(),
    };
    this.validateProfile(nextProfile);
    Object.assign(profile, nextProfile);
    this.touchAndSave();
    return { ...profile };
  }

  deleteProfile(id: string): void {
    if (id === this.data.defaultPersonaId) {
      throw new Error('默认人格不能删除');
    }
    const inUseGroups = Object.entries(this.data.groupBindings)
      .filter(([, personaId]) => personaId === id)
      .map(([groupId]) => groupId);
    if (inUseGroups.length > 0) {
      throw new Error(`人格仍被群绑定: ${inUseGroups.join(', ')}`);
    }
    const nextProfiles = this.data.profiles.filter((item) => item.id !== id);
    if (nextProfiles.length === this.data.profiles.length) {
      throw new Error(`人格不存在: ${id}`);
    }
    this.data.profiles = nextProfiles;
    this.touchAndSave();
  }

  setDefaultPersona(id: string): void {
    const profile = this.findEnabledProfile(id);
    if (!profile) {
      throw new Error(`启用中的人格不存在: ${id}`);
    }
    this.data.defaultPersonaId = profile.id;
    this.touchAndSave();
  }

  bindGroup(groupId: number, personaId: string): void {
    if (!Number.isFinite(groupId) || groupId <= 0) {
      throw new Error('无效的群号');
    }
    const profile = this.findEnabledProfile(personaId);
    if (!profile) {
      throw new Error(`启用中的人格不存在: ${personaId}`);
    }
    this.data.groupBindings[String(groupId)] = profile.id;
    this.touchAndSave();
  }

  unbindGroup(groupId: number): void {
    if (!Number.isFinite(groupId) || groupId <= 0) {
      throw new Error('无效的群号');
    }
    delete this.data.groupBindings[String(groupId)];
    this.touchAndSave();
  }

  private findEnabledProfile(id: string): PersonaProfile | undefined {
    return this.data.profiles.find((item) => item.id === id && item.enabled);
  }

  private validateProfile(profile: PersonaProfile): void {
    if (!profile.id) {
      throw new Error('人格 ID 不能为空');
    }
    if (!profile.name) {
      throw new Error('人格名称不能为空');
    }
    if (!profile.systemPrompt) {
      throw new Error('人格提示词不能为空');
    }
  }

  private touchAndSave(): void {
    this.data.updatedAt = nowIso();
    this.save();
  }

  private load(): PersonaStoreData {
    const fallback = this.createDefaultStore();
    try {
      if (!fs.existsSync(this.filePath)) {
        this.ensureParentDirectory();
        fs.writeFileSync(this.filePath, JSON.stringify(fallback, null, 2), 'utf-8');
        return fallback;
      }
      const raw = fs.readFileSync(this.filePath, 'utf-8');
      const parsed = JSON.parse(raw) as Partial<PersonaStoreData>;
      const profiles = Array.isArray(parsed.profiles) && parsed.profiles.length > 0
        ? parsed.profiles.map((item) => this.normalizeProfile(item))
        : fallback.profiles;
      const defaultPersonaId = profiles.some((item) => item.id === parsed.defaultPersonaId)
        ? String(parsed.defaultPersonaId)
        : profiles[0].id;
      return {
        version: 1,
        defaultPersonaId,
        profiles,
        groupBindings: this.normalizeBindings(parsed.groupBindings || {}, profiles),
        updatedAt: String(parsed.updatedAt || nowIso()),
      };
    } catch (error) {
      logger.warn({ error }, '[PersonaService] 加载人格配置失败，回退默认人格');
      return fallback;
    }
  }

  private save(): void {
    this.ensureParentDirectory();
    fs.writeFileSync(this.filePath, JSON.stringify(this.data, null, 2), 'utf-8');
  }

  private ensureParentDirectory(): void {
    const dir = path.dirname(this.filePath);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
  }

  private createDefaultStore(): PersonaStoreData {
    return {
      version: 1,
      defaultPersonaId: DEFAULT_PERSONA_ID,
      profiles: [createDefaultProfile()],
      groupBindings: {},
      updatedAt: nowIso(),
    };
  }

  private normalizeProfile(input: Partial<PersonaProfile>): PersonaProfile {
    const fallback = createDefaultProfile();
    const timestamp = nowIso();
    const profile: PersonaProfile = {
      id: sanitizePersonaId(input.id || fallback.id) || fallback.id,
      name: String(input.name || fallback.name).trim(),
      enabled: input.enabled !== false,
      summary: String(input.summary || '').trim(),
      systemPrompt: String(input.systemPrompt || fallback.systemPrompt).trim(),
      relayPrompt: String(input.relayPrompt || '').trim() || fallback.relayPrompt,
      replyRules: Array.isArray(input.replyRules) ? input.replyRules.map((item) => String(item).trim()).filter(Boolean) : fallback.replyRules,
      catchphrases: Array.isArray(input.catchphrases) ? input.catchphrases.map((item) => String(item).trim()).filter(Boolean) : fallback.catchphrases,
      ttsCharacter: String(input.ttsCharacter || '').trim(),
      createdAt: String(input.createdAt || timestamp),
      updatedAt: String(input.updatedAt || timestamp),
    };
    this.validateProfile(profile);
    return profile;
  }

  private normalizeBindings(bindings: Record<string, string>, profiles: PersonaProfile[]): Record<string, string> {
    const profileIds = new Set(profiles.filter((item) => item.enabled).map((item) => item.id));
    const result: Record<string, string> = {};
    for (const [groupId, personaId] of Object.entries(bindings || {})) {
      if (!/^\d+$/.test(groupId)) continue;
      if (!profileIds.has(personaId)) continue;
      result[groupId] = personaId;
    }
    return result;
  }
}
