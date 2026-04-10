import https from 'https';
import { logger } from '../logger';
import { config } from '../types/config';
import { VoiceModelCatalog } from '../plugins/voice-broadcast/voice-model-catalog';
import { VoiceServiceClient } from '../plugins/voice-broadcast/voice-service-client';
import type {
  VoiceModelEntry,
  VoiceRuntimePolicyInfo,
  VoiceTelemetrySnapshot,
} from '../plugins/voice-broadcast/types';

const SHORT_TTS_CACHE_MAX_ENTRIES = 120;
const SHORT_TTS_CACHE_TTL_MS = 15 * 60 * 1000;
const SHORT_TTS_CACHE_MAX_TEXT_LENGTH = 120;

type TtsCacheEntry = {
  key: string;
  audio: Buffer;
  createdAt: number;
  lastAccessAt: number;
};

type TtsLastRequestSnapshot = NonNullable<VoiceTelemetrySnapshot['lastRequest']>;
type RuntimeTtsScene = 'at-reply' | 'passive-reply' | 'broadcast' | 'preview' | 'unknown';

export type TtsRequestContext = {
  scene?: RuntimeTtsScene;
  allowExperimental?: boolean;
  forceBackend?: string;
  forceModelId?: string;
  groupId?: number;
  characterHint?: string;
};

type VoiceOutputStep = {
  backend: string;
  modelId?: string;
  voice?: string;
  reason: string;
  fallback: boolean;
};

type VoiceOutputPolicy = {
  runtimePolicy: string;
  scene: RuntimeTtsScene;
  character?: string;
  selectedBackend: string;
  selectedModelId?: string;
  longText: boolean;
  fallbackChain: string[];
  experimentalRvcEnabled: boolean;
  steps: VoiceOutputStep[];
};

export type VoiceDeliveryPlan = {
  finalSpeed: number;
  normalizedStyle: string;
  cadence: 'tight' | 'balanced' | 'expressive';
  sentenceCount: number;
  textLength: number;
};

export type SpokenReplyOptions = {
  scene?: RuntimeTtsScene;
  character?: string;
};

const LEGACY_BAIDU_BACKEND = 'legacy-baidu';

function uniqueStrings(items: Array<string | undefined | null>): string[] {
  const seen = new Set<string>();
  const result: string[] = [];
  for (const item of items) {
    const value = String(item || '').trim();
    if (!value || seen.has(value)) continue;
    seen.add(value);
    result.push(value);
  }
  return result;
}

export class VoiceOutputPolicyResolver {
  constructor(private readonly catalog: VoiceModelCatalog) {}

  getRuntimeInfo(): VoiceRuntimePolicyInfo {
    return {
      mode: config.ttsRuntimePolicy,
      preferredBackend: config.ttsBackend,
      defaultCharacter: config.ttsDefaultCharacter || undefined,
      longTextPreferredBackend: config.ttsLongTextPreferredBackend || undefined,
      longTextThreshold: config.ttsLongTextThreshold,
      fallbackChain: [...config.ttsFallbackChain],
      experimentalRvcEnabled: config.ttsExperimentalRvcEnabled,
      rvcShortTextMaxLength: config.ttsRvcShortTextMaxLength,
      characterModelMap: { ...config.ttsCharacterModelMap },
      groupVoiceRoleMap: { ...config.ttsGroupVoiceRoleMap },
    };
  }

  resolve(text: string, context: TtsRequestContext = {}): VoiceOutputPolicy {
    const scene = context.scene || 'unknown';
    const character = this.resolveCharacterHint(context);
    const requestedModel = this.findRequestedModel(context, character);
    const longText = text.trim().length >= Math.max(24, config.ttsLongTextThreshold);
    const experimentalRvcEnabled = this.canUseExperimentalRvc(text, context, longText);

    let selectedBackend = String(context.forceBackend || config.ttsBackend || '').trim() || 'edge-tts';
    if (!context.forceBackend && config.ttsRuntimePolicy !== 'config-only') {
      selectedBackend =
        requestedModel?.recommendedBackend ||
        requestedModel?.backend ||
        selectedBackend;
    }
    if (!context.forceBackend && longText && config.ttsLongTextPreferredBackend) {
      selectedBackend = config.ttsLongTextPreferredBackend;
    }
    if (selectedBackend === 'rvc-compat' && !experimentalRvcEnabled) {
      selectedBackend =
        this.firstNonRvcBackend(requestedModel) ||
        config.ttsLongTextPreferredBackend ||
        'gpt-sovits';
    }

    const selectedModel = this.resolveModelForBackend(requestedModel, selectedBackend, {
      allowExperimental: experimentalRvcEnabled,
    });
    const fallbackChain = this.buildFallbackChain(selectedBackend, requestedModel, {
      allowExperimental: experimentalRvcEnabled,
    });
    const steps = uniqueStrings([selectedBackend, ...fallbackChain]).map((backend, index) =>
      this.buildStep(backend, requestedModel, {
        allowExperimental: experimentalRvcEnabled,
        fallback: index > 0,
      })
    );

    return {
      runtimePolicy: context.forceBackend || context.forceModelId ? 'manual-override' : config.ttsRuntimePolicy,
      scene,
      character: character || requestedModel?.character,
      selectedBackend,
      selectedModelId: selectedModel?.id,
      longText,
      fallbackChain,
      experimentalRvcEnabled,
      steps,
    };
  }

  private listModels(): VoiceModelEntry[] {
    return this.catalog.listLocalModels().filter(item => item.enabled !== false);
  }

  private findModel(modelId?: string): VoiceModelEntry | null {
    if (!modelId) return null;
    return this.listModels().find(item => item.id === modelId) || null;
  }

  private findRequestedModel(context: TtsRequestContext, character?: string): VoiceModelEntry | null {
    const directModelId = context.forceModelId || this.resolveConfiguredModelId(character) || config.ttsModel || undefined;
    const directModel = this.findModel(directModelId);
    if (directModel) {
      return directModel;
    }
    if (!character) {
      return null;
    }
    return (
      this.listModels().find(item =>
        item.character === character &&
        item.backend === 'gpt-sovits' &&
        item.installed &&
        !item.experimental
      ) || null
    );
  }

  private resolveConfiguredModelId(character?: string): string | undefined {
    if (character) {
      const mappedModelId = config.ttsCharacterModelMap[character];
      if (mappedModelId) {
        return mappedModelId;
      }
    }
    return config.ttsModel || undefined;
  }

  private resolveCharacterHint(context: TtsRequestContext): string | undefined {
    if (context.characterHint) {
      return context.characterHint;
    }
    if (context.groupId !== undefined) {
      const routedCharacter = config.ttsGroupVoiceRoleMap[String(context.groupId)];
      if (routedCharacter) {
        return routedCharacter;
      }
    }
    return config.ttsDefaultCharacter || undefined;
  }

  private firstNonRvcBackend(model: VoiceModelEntry | null): string | null {
    const candidates = uniqueStrings([
      model?.recommendedBackend,
      model?.backend,
      ...(model?.alternateBackends || []),
      config.ttsLongTextPreferredBackend,
      config.ttsBackend,
      'gpt-sovits',
    ]);
    return candidates.find(item => item !== 'rvc-compat') || null;
  }

  private canUseExperimentalRvc(
    text: string,
    context: TtsRequestContext,
    longText: boolean
  ): boolean {
    if (!context.allowExperimental || !config.ttsExperimentalRvcEnabled || longText) {
      return false;
    }
    return text.trim().length <= Math.max(8, config.ttsRvcShortTextMaxLength);
  }

  private resolveModelForBackend(
    requestedModel: VoiceModelEntry | null,
    backend: string,
    options: { allowExperimental: boolean }
  ): VoiceModelEntry | null {
    if (backend === 'edge-tts' || backend === LEGACY_BAIDU_BACKEND) {
      return null;
    }
    if (
      requestedModel &&
      requestedModel.backend === backend &&
      requestedModel.installed &&
      (options.allowExperimental || !requestedModel.experimental)
    ) {
      return requestedModel;
    }
    const models = this.listModels().filter(item => {
      if (item.backend !== backend || !item.installed) return false;
      if (!options.allowExperimental && item.experimental) return false;
      if (requestedModel?.character && item.character !== requestedModel.character) return false;
      return true;
    });
    return models[0] || null;
  }

  private buildFallbackChain(
    primaryBackend: string,
    requestedModel: VoiceModelEntry | null,
    options: { allowExperimental: boolean }
  ): string[] {
    const chain = uniqueStrings(config.ttsFallbackChain);
    const result: string[] = [];
    for (const backend of chain) {
      if (backend === primaryBackend) continue;
      if (backend === 'rvc-compat' && !options.allowExperimental) continue;
      if (backend !== 'edge-tts' && backend !== LEGACY_BAIDU_BACKEND) {
        const paired = this.resolveModelForBackend(requestedModel, backend, options);
        if (!paired) continue;
      }
      if (backend === LEGACY_BAIDU_BACKEND && !config.ttsFallbackToBaidu) continue;
      result.push(backend);
    }
    if (config.ttsFallbackToBaidu && primaryBackend !== LEGACY_BAIDU_BACKEND && !result.includes(LEGACY_BAIDU_BACKEND)) {
      result.push(LEGACY_BAIDU_BACKEND);
    }
    return result;
  }

  private buildStep(
    backend: string,
    requestedModel: VoiceModelEntry | null,
    options: { allowExperimental: boolean; fallback: boolean }
  ): VoiceOutputStep {
    const resolvedModel = this.resolveModelForBackend(requestedModel, backend, options);
    return {
      backend,
      modelId: resolvedModel?.id,
      voice: backend === 'edge-tts' ? config.ttsVoice : undefined,
      reason: options.fallback ? 'fallback-chain' : 'preferred-runtime-policy',
      fallback: options.fallback,
    };
  }
}

const ttsCache = new Map<string, TtsCacheEntry>();
const ttsTelemetry = {
  totalRequests: 0,
  cacheHits: 0,
  localSuccesses: 0,
  fallbackSuccesses: 0,
  failures: 0,
  fallbackAttempts: 0,
  totalDurationMs: 0,
  totalLocalDurationMs: 0,
  totalFallbackDurationMs: 0,
  completedRequests: 0,
  completedLocalRequests: 0,
  completedFallbackRequests: 0,
  longTextRequests: 0,
  rvcRequests: 0,
  backendUsage: {} as Record<string, number>,
  lastError: '',
  lastRequest: null as TtsLastRequestSnapshot | null,
};

export function normalizeVoiceServiceSpeed(speed: number, backend?: string): number {
  const raw = Number.isFinite(speed) ? speed : 1;
  if (backend && ['gpt-sovits', 'edge-tts', 'rvc-compat'].includes(backend)) {
    if (raw > 2) {
      return clamp(0.5 + raw * 0.125, 0.75, 1.25);
    }
    return clamp(raw, 0.75, 1.25);
  }
  return raw;
}

export function normalizeLegacyBaiduSpeed(speed: number): number {
  const raw = Number.isFinite(speed) ? speed : 1;
  if (raw > 2) {
    return Math.max(1, Math.min(10, Math.round(raw)));
  }
  return Math.max(1, Math.min(10, Math.round(raw * 4)));
}

export function normalizeTtsStyle(style?: string): string {
  const normalized = (style || '').trim().toLowerCase();
  return normalized || 'natural';
}

export function planVoiceDelivery(
  text: string,
  baseSpeed: number,
  options: { style?: string; backend?: string; scene?: RuntimeTtsScene; character?: string } = {}
): VoiceDeliveryPlan {
  const normalizedStyle = normalizeTtsStyle(options.style);
  const trimmed = text.trim();
  const textLength = trimmed.length;
  const strongStops = trimmed.match(/[。！？!?]/g) || [];
  const weakStops = trimmed.match(/[，、；：,]/g) || [];
  const cuteMarkers = trimmed.match(/[喵呀啦诶欸哎嗯啊嘿哈～~]/g) || [];
  const sentenceCount = Math.max(1, strongStops.length || (weakStops.length > 0 ? 1 : 0));
  const avgSentenceLength = textLength / sentenceCount;
  const isTafiAtReply = options.scene === 'at-reply' && options.character === '永雏塔菲';

  let finalSpeed = baseSpeed;
  if (textLength <= 12) {
    finalSpeed += 0.025;
  } else if (textLength <= 28) {
    finalSpeed += 0.02;
  } else if (textLength <= 72) {
    finalSpeed += 0.015;
  } else {
    finalSpeed += 0.01;
  }

  if (/[？！!?]$/.test(trimmed)) {
    finalSpeed += 0.01;
  } else if (/[。]$/.test(trimmed)) {
    finalSpeed += 0.005;
  }

  if (avgSentenceLength > 30) {
    finalSpeed -= 0.02;
  }
  if (weakStops.length >= 3 && textLength > 40) {
    finalSpeed -= 0.01;
  }

  switch (normalizedStyle) {
    case 'lively':
    case 'bright':
    case 'cheerful':
      finalSpeed += 0.015;
      break;
    case 'sweet':
    case 'soft':
    case 'calm':
      finalSpeed -= 0.01;
      break;
    default:
      finalSpeed += 0.005;
      break;
  }

  if (isTafiAtReply) {
    if (cuteMarkers.length > 0) {
      finalSpeed -= 0.015;
    }
    if (sentenceCount > 1) {
      finalSpeed -= 0.01;
    }
    if (textLength >= 24) {
      finalSpeed = Math.min(finalSpeed, 1.01);
    }
    if (textLength >= 40 || weakStops.length >= 2) {
      finalSpeed = Math.min(finalSpeed, 0.99);
    }
    if (/[~～]|[？！!?]/.test(trimmed)) {
      finalSpeed = Math.min(finalSpeed, 1.02);
    }
  }

  const cadence =
    isTafiAtReply && textLength >= 18
      ? 'balanced'
      : /[？！!?]/.test(trimmed) || normalizedStyle === 'lively'
      ? 'expressive'
      : textLength <= 20 && weakStops.length === 0
        ? 'tight'
        : 'balanced';

  return {
    finalSpeed: normalizeVoiceServiceSpeed(finalSpeed, options.backend),
    normalizedStyle,
    cadence,
    sentenceCount,
    textLength,
  };
}

export type TtsSanitizeOptions = {
  whitelistChars?: string;
  blacklistChars?: string;
  softenWaveTails?: boolean;
};

function softenWaveTailsForSpeech(text: string): string {
  return text
    .replace(/[~～]+/g, '～')
    .replace(/～+\s*(?=[。！？!?，,；;：:])/g, '')
    .replace(/([呀啊啦嘛呢喵哇哦诶欸唉哈])～+(?=$)/gu, '$1')
    .replace(/～+(?=$)/g, '')
    .replace(/～+\s*(?=\S)/g, '，')
    .replace(/，(?=[。！？!?])/g, '')
    .replace(/，{2,}/g, '，')
    .replace(/\s+/g, ' ')
    .trim();
}

export function sanitizeTtsText(text: string, options: TtsSanitizeOptions = {}): string {
  const protectedChars = Array.from(new Set(Array.from(options.whitelistChars || '')));
  const protectedMap = new Map<string, string>();

  let sanitized = text;
  protectedChars.forEach((char, index) => {
    const token = `\uE000${index}\uE001`;
    protectedMap.set(token, char);
    sanitized = sanitized.split(char).join(token);
  });

  sanitized = sanitized
    .replace(/\[CQ:[^\]]+\]/gi, ' ')
    .replace(
      /^(?:\s*(?:\[[^\]\n]{1,40}\]|【[^】\n]{1,40}】|<[^>\n]{1,40}>|《[^》\n]{1,40}》|「[^」\n]{1,40}」|『[^』\n]{1,40}』)\s*[:：]\s*)+/gu,
      ''
    )
    .replace(/^(?:\s*[A-Za-z][\w.-]{1,24}\s*[:：]\s*)+/g, '')
    .replace(/(^|\s)@(?:everyone|all|[\w\u3400-\u9FFF.-]{1,32})/gu, '$1')
    .replace(/https?:\/\/\S+/gi, ' ')
    .replace(/www\.\S+/gi, ' ')
    .replace(/&(?:amp|lt|gt|quot|nbsp|#39|#91|#93);/gi, ' ')
    .replace(/[\u{1F000}-\u{1FFFF}]/gu, ' ')
    .replace(/[\u{2600}-\u{27BF}]/gu, ' ')
    .replace(/[\u200B-\u200D\u2060\uFE0E\uFE0F]/g, '')
    .replace(/\([^)]*\)/g, ' ')
    .replace(/[｡-ﾟ]/g, '')
    .replace(/\[[^\]]*\]/g, ' ')
    .replace(/[【】《》「」『』<>]/g, ' ')
    .replace(/[`#*_=`|]+/g, ' ')
    .replace(/[:：]\s*[:：]+/g, ' ')
    .replace(/[~～]{3,}/g, '～')
    .replace(/[!！?？]{3,}/g, (match) => match[0])
    .replace(/[，,]{3,}/g, '，')
    .replace(/[。]{3,}/g, '。')
    .replace(/\s+/g, ' ')
    .trim();

  if (options.blacklistChars) {
    sanitized = Array.from(new Set(Array.from(options.blacklistChars))).reduce((acc, char) => {
      return acc.split(char).join('');
    }, sanitized);
  }

  for (const [token, char] of protectedMap.entries()) {
    sanitized = sanitized.split(token).join(char);
  }

  if (options.softenWaveTails) {
    sanitized = softenWaveTailsForSpeech(sanitized);
  }

  return sanitized.replace(/\s+/g, ' ').trim();
}

function collapseRepeatedSentencePrefix(text: string): string {
  return text
    .replace(/^(?:喵[，、\s~～]*){2,}/u, '喵，')
    .replace(/^(?:([嗯啊呀诶欸哎])[，、\s]*){2,}/u, '$1，');
}

function softenCuteSentenceEnding(text: string, keepCuteEnding: boolean): string {
  let sentence = text.trim();
  if (!sentence) return sentence;

  if (!keepCuteEnding) {
    return sentence
      .replace(/喵(?:[~～]*)([!！?？。；;，、]*)$/u, '$1')
      .replace(/([!！?？]){2,}/g, '$1')
      .trim();
  }

  sentence = sentence
    .replace(/(喵)(?:\1|[~～!！?？]){1,}/gu, '$1～')
    .replace(/([!！?？]){2,}/g, '$1');

  if (/喵(?:[~～!！?？。]*)?$/u.test(sentence)) {
    return sentence.replace(/喵(?:[~～!！?？。]*)?$/u, '喵～').trim();
  }
  return sentence;
}

export function optimizeSpokenReplyText(text: string, options: SpokenReplyOptions = {}): string {
  const singleLine = String(text || '').replace(/\s+/g, ' ').trim();
  if (!singleLine) return '';

  let spoken = singleLine
    .replace(/([~～]){2,}/g, '～')
    .replace(/([!！?？]){2,}/g, '$1')
    .replace(/(喵)\1{1,}/gu, '$1')
    .replace(/(?:\b|^)(?:欸欸|诶诶|嗯嗯|啊啊)(?=[，、\s])/gu, (match) => match.slice(0, 1))
    .trim();

  if (options.scene !== 'at-reply') {
    return spoken;
  }

  const sentenceMatches = spoken.match(/[^。！？!?；;]+[。！？!?；;]?/gu) || [spoken];
  const keepCuteTail = sentenceMatches.length === 1;
  spoken = sentenceMatches
    .map((segment, index) => {
      const trimmed = collapseRepeatedSentencePrefix(segment.trim());
      const shouldKeepCuteEnding = keepCuteTail || index === sentenceMatches.length - 1;
      return softenCuteSentenceEnding(trimmed, shouldKeepCuteEnding);
    })
    .filter(Boolean)
    .join('')
    .replace(/(^|[。！？!?；;])\s*喵[，、]\s*/gu, '$1')
    .replace(/\s+/g, ' ')
    .trim();

  if (options.character === '永雏塔菲' && !/[喵呀啦～~]$/u.test(spoken) && spoken.length <= 26) {
    spoken = `${spoken}喵～`;
  }

  return spoken.trim();
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function previewTextForLog(text: string, maxLength = 120): string {
  const singleLine = text.replace(/\s+/g, ' ').trim();
  if (singleLine.length <= maxLength) {
    return singleLine;
  }
  return `${singleLine.slice(0, maxLength)}...`;
}

function buildShortCacheKey(input: {
  backend?: string;
  modelId?: string;
  sanitizedText: string;
  speed: number;
  style?: string;
}): string {
  return JSON.stringify([
    input.backend || '',
    input.modelId || '',
    input.style || '',
    Number(input.speed.toFixed(3)),
    input.sanitizedText,
  ]);
}

function pruneExpiredCache(now = Date.now()): void {
  for (const [key, entry] of ttsCache.entries()) {
    if (now - entry.createdAt > SHORT_TTS_CACHE_TTL_MS) {
      ttsCache.delete(key);
    }
  }
}

function setShortCache(key: string, audio: Buffer): void {
  const now = Date.now();
  pruneExpiredCache(now);
  ttsCache.set(key, {
    key,
    audio: Buffer.from(audio),
    createdAt: now,
    lastAccessAt: now,
  });

  if (ttsCache.size <= SHORT_TTS_CACHE_MAX_ENTRIES) {
    return;
  }
  const oldest = Array.from(ttsCache.values()).sort((a, b) => a.lastAccessAt - b.lastAccessAt)[0];
  if (oldest) {
    ttsCache.delete(oldest.key);
  }
}

function getShortCache(key: string): Buffer | null {
  const now = Date.now();
  pruneExpiredCache(now);
  const entry = ttsCache.get(key);
  if (!entry) {
    return null;
  }
  entry.lastAccessAt = now;
  return Buffer.from(entry.audio);
}

function recordLastRequest(snapshot: TtsLastRequestSnapshot): void {
  ttsTelemetry.lastRequest = snapshot;
}

function recordCompletedDuration(durationMs: number, source: 'cache' | 'local' | 'fallback'): void {
  ttsTelemetry.totalDurationMs += durationMs;
  ttsTelemetry.completedRequests += 1;
  if (source === 'local') {
    ttsTelemetry.totalLocalDurationMs += durationMs;
    ttsTelemetry.completedLocalRequests += 1;
  }
  if (source === 'fallback') {
    ttsTelemetry.totalFallbackDurationMs += durationMs;
    ttsTelemetry.completedFallbackRequests += 1;
  }
}

function roundMetric(value: number): number {
  return Math.round(value * 100) / 100;
}

function shouldCacheShortText(text: string): boolean {
  return text.length > 0 && text.length <= SHORT_TTS_CACHE_MAX_TEXT_LENGTH;
}

function sanitizeWithConfig(text: string): string {
  return sanitizeTtsText(text, {
    whitelistChars: config.ttsSanitizeWhitelist,
    blacklistChars: config.ttsSanitizeBlacklist,
    softenWaveTails: true,
  });
}

export function getTtsRuntimePolicyInfo(): VoiceRuntimePolicyInfo {
  return new VoiceOutputPolicyResolver(new VoiceModelCatalog(config.ttsModelDir)).getRuntimeInfo();
}

export function getTtsTelemetrySnapshot(): VoiceTelemetrySnapshot {
  const successfulResponses =
    ttsTelemetry.cacheHits + ttsTelemetry.localSuccesses + ttsTelemetry.fallbackSuccesses;
  const totalRequests = Math.max(ttsTelemetry.totalRequests, 1);
  return {
    totalRequests: ttsTelemetry.totalRequests,
    cacheHits: ttsTelemetry.cacheHits,
    localSuccesses: ttsTelemetry.localSuccesses,
    fallbackSuccesses: ttsTelemetry.fallbackSuccesses,
    failures: ttsTelemetry.failures,
    fallbackAttempts: ttsTelemetry.fallbackAttempts,
    cacheEntries: ttsCache.size,
    successRate: roundMetric((successfulResponses / totalRequests) * 100),
    fallbackRate: roundMetric((ttsTelemetry.fallbackSuccesses / totalRequests) * 100),
    averageDurationMs: roundMetric(
      ttsTelemetry.completedRequests > 0
        ? ttsTelemetry.totalDurationMs / ttsTelemetry.completedRequests
        : 0
    ),
    averageLocalDurationMs: roundMetric(
      ttsTelemetry.completedLocalRequests > 0
        ? ttsTelemetry.totalLocalDurationMs / ttsTelemetry.completedLocalRequests
        : 0
    ),
    averageFallbackDurationMs: roundMetric(
      ttsTelemetry.completedFallbackRequests > 0
        ? ttsTelemetry.totalFallbackDurationMs / ttsTelemetry.completedFallbackRequests
        : 0
    ),
    longTextRequests: ttsTelemetry.longTextRequests,
    rvcRequests: ttsTelemetry.rvcRequests,
    backendUsage: { ...ttsTelemetry.backendUsage },
    lastError: ttsTelemetry.lastError || undefined,
    lastRequest: ttsTelemetry.lastRequest || undefined,
  };
}

export function resetTtsTelemetryForTests(): void {
  ttsCache.clear();
  ttsTelemetry.totalRequests = 0;
  ttsTelemetry.cacheHits = 0;
  ttsTelemetry.localSuccesses = 0;
  ttsTelemetry.fallbackSuccesses = 0;
  ttsTelemetry.failures = 0;
  ttsTelemetry.fallbackAttempts = 0;
  ttsTelemetry.totalDurationMs = 0;
  ttsTelemetry.totalLocalDurationMs = 0;
  ttsTelemetry.totalFallbackDurationMs = 0;
  ttsTelemetry.completedRequests = 0;
  ttsTelemetry.completedLocalRequests = 0;
  ttsTelemetry.completedFallbackRequests = 0;
  ttsTelemetry.longTextRequests = 0;
  ttsTelemetry.rvcRequests = 0;
  ttsTelemetry.backendUsage = {};
  ttsTelemetry.lastError = '';
  ttsTelemetry.lastRequest = null;
}

/**
 * TTS 语音合成服务
 * 优先走本机 Python 语音服务，必要时回退到旧百度 TTS。
 */
export class TTSService {
  private enabled: boolean;
  private readonly client: VoiceServiceClient;
  private readonly policyResolver: VoiceOutputPolicyResolver;

  constructor() {
    this.enabled = config.ttsEnabled;
    this.client = new VoiceServiceClient(config.ttsServiceUrl, config.ttsTimeoutMs);
    this.policyResolver = new VoiceOutputPolicyResolver(new VoiceModelCatalog(config.ttsModelDir));
    if (this.enabled) {
      logger.info(
        `🔔 TTS语音功能已启用 provider=${config.ttsProvider} backend=${config.ttsBackend} policy=${config.ttsRuntimePolicy}`
      );
    }
  }

  async textToSpeech(text: string, context: TtsRequestContext = {}): Promise<Buffer | null> {
    if (!this.enabled) return null;

    const startedAt = Date.now();
    ttsTelemetry.totalRequests += 1;

    const cleanText = this.cleanText(text);
    if (!cleanText) return null;

    const outputPolicy = this.policyResolver.resolve(cleanText, context);
    const primaryStep = outputPolicy.steps[0] || {
      backend: config.ttsBackend,
      modelId: config.ttsModel || undefined,
      reason: 'config-default',
      fallback: false,
    };
    ttsTelemetry.backendUsage[primaryStep.backend] = (ttsTelemetry.backendUsage[primaryStep.backend] || 0) + 1;
    if (outputPolicy.longText) {
      ttsTelemetry.longTextRequests += 1;
    }
    if (primaryStep.backend === 'rvc-compat') {
      ttsTelemetry.rvcRequests += 1;
    }
    if (outputPolicy.steps.length > 1) {
      ttsTelemetry.fallbackAttempts += 1;
    }
    const deliveryPlan = planVoiceDelivery(
      cleanText,
      normalizeVoiceServiceSpeed(config.ttsSpeed, primaryStep.backend),
      {
        style: config.ttsStyle,
        backend: primaryStep.backend,
        scene: outputPolicy.scene,
        character: outputPolicy.character,
      }
    );
    const voiceSpeed = deliveryPlan.finalSpeed;
    const cacheKey = buildShortCacheKey({
      backend: primaryStep.backend,
      modelId: primaryStep.modelId,
      sanitizedText: cleanText,
      speed: voiceSpeed,
      style: deliveryPlan.normalizedStyle,
    });

    if (shouldCacheShortText(cleanText)) {
      const cached = getShortCache(cacheKey);
      if (cached) {
        ttsTelemetry.cacheHits += 1;
        recordCompletedDuration(Date.now() - startedAt, 'cache');
        recordLastRequest({
          backend: primaryStep.backend,
          requestedBackend: config.ttsBackend,
          modelId: primaryStep.modelId,
          requestedModelId: config.ttsModel || undefined,
          originalText: previewTextForLog(text),
          sanitizedText: previewTextForLog(cleanText),
          finalSpeed: voiceSpeed,
          source: 'cache',
          durationMs: Date.now() - startedAt,
          fallbackUsed: false,
          cacheHit: true,
          runtimePolicy: outputPolicy.runtimePolicy,
          character: outputPolicy.character,
          fallbackChain: outputPolicy.fallbackChain,
          scene: outputPolicy.scene,
          timestamp: new Date().toISOString(),
        });
        logger.debug(
          {
            backend: primaryStep.backend,
            modelId: primaryStep.modelId,
            sanitizedText: previewTextForLog(cleanText),
            finalSpeed: voiceSpeed,
            cadence: deliveryPlan.cadence,
            style: deliveryPlan.normalizedStyle,
            runtimePolicy: outputPolicy.runtimePolicy,
          },
          '[TTS] cache hit'
        );
        return cached;
      }
    }

    const errors: string[] = [];
    for (const step of outputPolicy.steps) {
      try {
        if (step.backend === LEGACY_BAIDU_BACKEND) {
          const fallbackSpeed = normalizeLegacyBaiduSpeed(voiceSpeed);
          logger.debug(
            {
              backend: LEGACY_BAIDU_BACKEND,
              originalText: previewTextForLog(text),
              sanitizedText: previewTextForLog(cleanText),
              finalSpeed: fallbackSpeed,
              cadence: deliveryPlan.cadence,
              runtimePolicy: outputPolicy.runtimePolicy,
            },
            '[TTS] preparing legacy baidu synthesis'
          );
          const fallback = await this.fetchLegacyBaiduSpeech(cleanText);
          logger.info(`🎤 已回退至旧百度TTS size=${Math.round(fallback.length / 1024)}KB`);
          ttsTelemetry.fallbackSuccesses += 1;
          recordCompletedDuration(Date.now() - startedAt, 'fallback');
          recordLastRequest({
            backend: LEGACY_BAIDU_BACKEND,
            requestedBackend: config.ttsBackend,
            modelId: step.modelId || primaryStep.modelId,
            requestedModelId: config.ttsModel || undefined,
            originalText: previewTextForLog(text),
            sanitizedText: previewTextForLog(cleanText),
            finalSpeed: fallbackSpeed,
            source: LEGACY_BAIDU_BACKEND,
            durationMs: Date.now() - startedAt,
            fallbackUsed: true,
            cacheHit: false,
            runtimePolicy: outputPolicy.runtimePolicy,
            character: outputPolicy.character,
            fallbackChain: outputPolicy.fallbackChain,
            scene: outputPolicy.scene,
            timestamp: new Date().toISOString(),
          });
          return fallback;
        }

        if (config.ttsProvider !== 'local-http') {
          continue;
        }

        logger.debug(
          {
            backend: step.backend,
            modelId: step.modelId,
            originalText: previewTextForLog(text),
            sanitizedText: previewTextForLog(cleanText),
            finalSpeed: voiceSpeed,
            cadence: deliveryPlan.cadence,
            style: deliveryPlan.normalizedStyle,
            fallback: step.fallback,
            runtimePolicy: outputPolicy.runtimePolicy,
          },
          '[TTS] preparing voice synthesis'
        );
        const result = await this.client.synthesize({
          text: cleanText,
          backend: step.backend,
          modelId: step.modelId,
          voice: step.voice || config.ttsVoice,
          speed: voiceSpeed,
          style: deliveryPlan.normalizedStyle,
        });

        const buffer = Buffer.from(result.audioBase64, 'base64');
        if (buffer.length <= 512) {
          throw new Error('voice service returned empty audio');
        }
        logger.info(
          `🎤 语音服务合成成功 backend=${result.backend} model=${result.modelName || result.modelId || 'default'} size=${Math.round(buffer.length / 1024)}KB`
        );
        if (step.fallback) {
          ttsTelemetry.fallbackSuccesses += 1;
        } else {
          ttsTelemetry.localSuccesses += 1;
        }
        recordCompletedDuration(Date.now() - startedAt, step.fallback ? 'fallback' : 'local');
        recordLastRequest({
          backend: step.backend,
          requestedBackend: config.ttsBackend,
          modelId: step.modelId,
          requestedModelId: config.ttsModel || undefined,
          originalText: previewTextForLog(text),
          sanitizedText: previewTextForLog(cleanText),
          finalSpeed: voiceSpeed,
          source: step.fallback ? 'fallback-http' : 'local-http',
          durationMs: Date.now() - startedAt,
          fallbackUsed: step.fallback,
          cacheHit: false,
          runtimePolicy: outputPolicy.runtimePolicy,
          character: outputPolicy.character,
          fallbackChain: outputPolicy.fallbackChain,
          scene: outputPolicy.scene,
          timestamp: new Date().toISOString(),
        });
        if (shouldCacheShortText(cleanText)) {
          setShortCache(cacheKey, buffer);
        }
        return buffer;
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        errors.push(`${step.backend}: ${message}`);
        logger.warn({ error, backend: step.backend, modelId: step.modelId }, '[TTS] synthesis attempt failed');
      }
    }

    ttsTelemetry.failures += 1;
    ttsTelemetry.lastError = errors.join(' | ') || 'TTS转换失败';
    recordLastRequest({
      backend: primaryStep.backend,
      requestedBackend: config.ttsBackend,
      modelId: primaryStep.modelId,
      requestedModelId: config.ttsModel || undefined,
      originalText: previewTextForLog(text),
      sanitizedText: previewTextForLog(cleanText),
      finalSpeed: primaryStep.backend === LEGACY_BAIDU_BACKEND
        ? normalizeLegacyBaiduSpeed(voiceSpeed)
        : voiceSpeed,
      source: 'failed',
      durationMs: Date.now() - startedAt,
      fallbackUsed: outputPolicy.steps.length > 1,
      cacheHit: false,
      runtimePolicy: outputPolicy.runtimePolicy,
      character: outputPolicy.character,
      fallbackChain: outputPolicy.fallbackChain,
      scene: outputPolicy.scene,
      timestamp: new Date().toISOString(),
    });
    logger.warn({ errors }, 'TTS转换失败');
    return null;
  }

  isEnabled(): boolean {
    return this.enabled;
  }

  private async fetchLegacyBaiduSpeech(cleanText: string): Promise<Buffer> {
    const chunks = this.splitText(cleanText, 150);
    const buffers: Buffer[] = [];

    for (const chunk of chunks) {
      const audioBuffer = await this.fetchBaiduTTS(chunk);
      if (audioBuffer && audioBuffer.length > 256) {
        buffers.push(audioBuffer);
      }
      if (chunks.length > 1 && buffers.length < chunks.length) {
        await this.sleep(300);
      }
    }

    if (buffers.length === 0) {
      throw new Error('no valid audio segments');
    }

    return Buffer.concat(buffers);
  }

  private fetchBaiduTTS(text: string): Promise<Buffer> {
    return new Promise((resolve, reject) => {
      const encodedText = encodeURIComponent(text);
      const urlStr =
        '/gettts?lan=zh&text=' +
        encodedText +
        '&source=web&spd=' +
        normalizeLegacyBaiduSpeed(config.ttsSpeed);

      const options: https.RequestOptions = {
        hostname: 'fanyi.baidu.com',
        port: 443,
        path: urlStr,
        method: 'GET',
        headers: {
          'User-Agent':
            'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
          'Accept': '*/*',
          'Referer': 'https://fanyi.baidu.com/',
          'Accept-Encoding': 'identity',
        },
        timeout: 10000,
      };

      const req = https.request(options, (res) => {
        if (
          res.statusCode &&
          res.statusCode >= 300 &&
          res.statusCode < 400 &&
          res.headers.location
        ) {
          https
            .get(res.headers.location, { timeout: 10000 }, (res2) => {
              this.collectAudio(res2, resolve, reject);
            })
            .on('error', reject);
          return;
        }

        this.collectAudio(res, resolve, reject);
      });

      req.on('error', reject);
      req.on('timeout', () => {
        req.destroy();
        reject(new Error('BaiduTTS timeout'));
      });

      req.end();
    });
  }

  private collectAudio(
    res: import('http').IncomingMessage,
    resolve: (value: Buffer | PromiseLike<Buffer>) => void,
    reject: (reason?: Error) => void
  ): void {
    const chunks: Buffer[] = [];
    res.on('data', (chunk: Buffer) => chunks.push(chunk));
    res.on('end', () => {
      const buffer = Buffer.concat(chunks);
      if (res.statusCode === 200 && buffer.length > 256) {
        resolve(buffer);
      } else {
        reject(new Error(`BaiduTTS status=${res.statusCode} size=${buffer.length}`));
      }
    });
    res.on('error', (e) => reject(e));
  }

  private splitText(text: string, maxLength: number): string[] {
    if (text.length <= maxLength) return [text];

    const result: string[] = [];
    let current = '';

    for (const char of text) {
      current += char;
      if (current.length >= maxLength * 0.8 && /[。！？!？\n]/.test(char)) {
        result.push(current.trim());
        current = '';
      } else if (current.length >= maxLength) {
        result.push(current.trim());
        current = '';
      }
    }

    if (current.trim()) result.push(current.trim());
    return result;
  }

  private cleanText(text: string): string {
    return sanitizeWithConfig(text);
  }

  private sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}
