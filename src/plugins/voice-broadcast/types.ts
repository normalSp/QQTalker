export type VoiceBackendId =
  | 'gpt-sovits'
  | 'rvc-compat'
  | 'edge-tts'
  | 'legacy-baidu';

export interface VoiceBackendInfo {
  id: VoiceBackendId | string;
  name: string;
  description: string;
  supportsModels: boolean;
  supportsPreview: boolean;
  supportsStyle?: boolean;
  requiresGpu?: boolean;
  available?: boolean;
  availabilityReason?: string;
  setupHint?: string;
  upstream?: string;
}

export interface VoiceAudioDiagnostic {
  path: string;
  label?: string;
  exists?: boolean;
  format?: string;
  durationSec?: number;
  sampleRate?: number;
  channels?: number;
  silenceRatio?: number;
  lowBandRatio?: number;
  peak?: number;
  warnings?: string[];
  score?: number;
}

export interface VoiceModelDiagnostics {
  summary?: string[];
  risk?: 'low' | 'medium' | 'high' | string;
  recommendedTextMinLength?: number;
  refAudio?: VoiceAudioDiagnostic;
  auxAudios?: VoiceAudioDiagnostic[];
}

export interface VoiceBackendOverride {
  preferredAuxCount?: number;
  recommendedTextMinLength?: number;
  promptText?: string;
  previewText?: string;
  topK?: number;
  topP?: number;
  temperature?: number;
  repetitionPenalty?: number;
  fragmentInterval?: number;
  notes?: string;
}

export interface VoiceModelEntry {
  id: string;
  name: string;
  character?: string;
  backend: VoiceBackendId | string;
  tags?: string[];
  avatar?: string;
  sampleText?: string;
  notes?: string;
  installed?: boolean;
  enabled?: boolean;
  source?: 'builtin' | 'catalog' | 'service';
  modelPath?: string;
  refAudioPath?: string;
  promptText?: string;
  promptLang?: string;
  auxPaths?: string[];
  upstreamPath?: string;
  recommendedBackend?: VoiceBackendId | string;
  alternateBackends?: Array<VoiceBackendId | string>;
  qualityTier?: string;
  trainingStatus?: string;
  previewHint?: string;
  experimental?: boolean;
  backendOverrides?: Record<string, VoiceBackendOverride>;
  diagnostics?: VoiceModelDiagnostics;
}

export interface VoiceSynthesisRequest {
  text: string;
  backend?: string;
  modelId?: string;
  voice?: string;
  speed?: number;
  style?: string;
  preview?: boolean;
}

export interface VoiceRuntimePolicyInfo {
  mode: string;
  preferredBackend?: string;
  defaultCharacter?: string;
  longTextPreferredBackend?: string;
  longTextThreshold?: number;
  fallbackChain: string[];
  experimentalRvcEnabled?: boolean;
  rvcShortTextMaxLength?: number;
  characterModelMap?: Record<string, string>;
  groupVoiceRoleMap?: Record<string, string>;
}

export interface VoiceSynthesisResult {
  success: boolean;
  backend: string;
  modelId?: string;
  modelName?: string;
  mimeType: string;
  audioBase64: string;
  durationMs?: number;
  warnings?: string[];
}

export interface VoiceTelemetrySnapshot {
  totalRequests: number;
  cacheHits: number;
  localSuccesses: number;
  fallbackSuccesses: number;
  failures: number;
  fallbackAttempts?: number;
  cacheEntries: number;
  successRate: number;
  fallbackRate: number;
  averageDurationMs: number;
  averageLocalDurationMs: number;
  averageFallbackDurationMs: number;
  longTextRequests?: number;
  rvcRequests?: number;
  backendUsage?: Record<string, number>;
  lastError?: string;
  lastRequest?: {
    backend?: string;
    requestedBackend?: string;
    modelId?: string;
    requestedModelId?: string;
    originalText?: string;
    sanitizedText?: string;
    finalSpeed?: number;
    source: 'cache' | 'local-http' | 'fallback-http' | 'legacy-baidu' | 'failed';
    durationMs?: number;
    fallbackUsed?: boolean;
    cacheHit?: boolean;
    runtimePolicy?: string;
    character?: string;
    fallbackChain?: string[];
    scene?: string;
    timestamp: string;
  };
}

export interface VoiceServiceStatus {
  ok: boolean;
  service: string;
  defaultBackend?: string;
  modelDir?: string;
  version?: string;
  error?: string;
  backends?: {
    gptSovitsUpstream?: string;
    rvcUpstream?: string;
    rvcAvailable?: boolean;
    rvcAvailabilityReason?: string;
  };
}
