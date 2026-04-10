import { config } from '../../types/config';
import { getTtsRuntimePolicyInfo, getTtsTelemetrySnapshot } from '../../services/tts-service';
import type {
  DashboardRouteProvider,
  PluginContext,
  QQTalkerPlugin,
} from '../plugin-types';
import { VoiceModelCatalog } from './voice-model-catalog';
import { VoiceServiceClient } from './voice-service-client';
import { VoiceTrainingWorkspaceService } from './voice-training-workspace';
import type { VoiceModelEntry, VoiceSynthesisRequest } from './types';

function mergeModels(localModels: VoiceModelEntry[], remoteModels: VoiceModelEntry[]): VoiceModelEntry[] {
  const merged = new Map<string, VoiceModelEntry>();

  for (const item of localModels) {
    merged.set(item.id, { ...item });
  }

  for (const item of remoteModels) {
    const previous = merged.get(item.id);
    merged.set(item.id, {
      ...previous,
      ...item,
      source: item.source || previous?.source || 'service',
      installed: item.installed ?? previous?.installed,
    });
  }

  return Array.from(merged.values()).sort((a, b) => {
    const aInstalled = a.installed ? 0 : 1;
    const bInstalled = b.installed ? 0 : 1;
    if (aInstalled !== bInstalled) return aInstalled - bInstalled;
    return a.name.localeCompare(b.name, 'zh-CN');
  });
}

export class VoiceBroadcastPlugin implements QQTalkerPlugin {
  id = 'voice-broadcast';
  name = 'VoiceBroadcast';

  private context: PluginContext | null = null;
  private readonly catalog = new VoiceModelCatalog(config.ttsModelDir);
  private readonly client = new VoiceServiceClient(config.ttsServiceUrl, config.ttsTimeoutMs);
  private trainingWorkspace: VoiceTrainingWorkspaceService | null = null;

  initialize(context: PluginContext): void {
    this.context = context;
    this.trainingWorkspace = new VoiceTrainingWorkspaceService(context.dataDir);
  }

  getDashboardRoutes(): DashboardRouteProvider[] {
    return [
      {
        method: 'GET',
        path: '/api/voice-training/overview',
        handler: async () => {
          const overview = this.trainingWorkspace?.getOverview();
          return {
            data: {
              success: true,
              overview,
            },
          };
        },
      },
      {
        method: 'GET',
        path: '/api/voice-training/detail',
        handler: async (ctx) => {
          const characterId = String(ctx.url.searchParams.get('character') || '').trim();
          if (!this.trainingWorkspace) {
            return {
              status: 503,
              data: {
                success: false,
                error: '语音训练工作区未初始化',
              },
            };
          }
          if (!characterId) {
            return {
              status: 400,
              data: {
                success: false,
                error: '缺少 character 参数',
              },
            };
          }
          const detail = this.trainingWorkspace.getCharacterDetail(characterId);
          if (!detail) {
            return {
              status: 404,
              data: {
                success: false,
                error: `未找到角色训练目录: ${characterId}`,
              },
            };
          }
          return {
            data: {
              success: true,
              detail,
            },
          };
        },
      },
      {
        method: 'GET',
        path: '/api/voice-training/task-state',
        handler: async (ctx) => {
          const characterId = String(ctx.url.searchParams.get('character') || '').trim();
          return {
            data: {
              success: true,
              overview: this.trainingWorkspace?.getOverview() || null,
              detail: characterId ? this.trainingWorkspace?.getCharacterDetail(characterId) || null : null,
            },
          };
        },
      },
      {
        method: 'POST',
        path: '/api/voice-training/review',
        handler: async (ctx) => {
          if (!this.trainingWorkspace) {
            return { status: 503, data: { success: false, error: '语音训练工作区未初始化' } };
          }
          try {
            const characterId = String(ctx.body?.characterId || '').trim();
            const entryId = String(ctx.body?.entryId || '').trim();
            const detail = this.trainingWorkspace.updateReviewEntry(characterId, entryId, {
              transcript: ctx.body?.transcript,
              reviewStatus: ctx.body?.reviewStatus,
              usableForTrain: typeof ctx.body?.usableForTrain === 'boolean' ? ctx.body.usableForTrain : undefined,
              notes: ctx.body?.notes,
              reviewer: ctx.body?.reviewer,
              transcriptionStatus: ctx.body?.transcriptionStatus,
            });
            return { data: { success: true, detail, overview: this.trainingWorkspace.getOverview() } };
          } catch (error: any) {
            return { status: 500, data: { success: false, error: error.message || String(error) } };
          }
        },
      },
      {
        method: 'POST',
        path: '/api/voice-training/upload-chunk',
        handler: async (ctx) => {
          if (!this.trainingWorkspace) {
            return { status: 503, data: { success: false, error: '语音训练工作区未初始化' } };
          }
          try {
            const characterId = String(ctx.body?.characterId || '').trim();
            const uploadId = String(ctx.body?.uploadId || '').trim();
            const fileName = String(ctx.body?.fileName || '').trim();
            const fileBase64Chunk = String(ctx.body?.fileBase64Chunk || '').trim();
            const finalize = Boolean(ctx.body?.finalize);
            const result = this.trainingWorkspace.appendUploadChunk(
              characterId,
              uploadId,
              fileName,
              fileBase64Chunk,
              finalize
            );
            return {
              data: {
                success: true,
                completed: result.completed,
                output: result.output,
                detail: result.detail,
                overview: this.trainingWorkspace.getOverview(),
              },
            };
          } catch (error: any) {
            return { status: 500, data: { success: false, error: error.message || String(error) } };
          }
        },
      },
      {
        method: 'POST',
        path: '/api/voice-training/sync',
        handler: async () => {
          if (!this.trainingWorkspace) {
            return {
              status: 503,
              data: {
                success: false,
                error: '语音训练工作区未初始化',
              },
            };
          }

          const result = await this.trainingWorkspace.syncWorkspace();
          this.context?.dashboard.pushLog(
            'system',
            `[VoiceTraining] workspace synced (${result.overview.characters.length} characters)`
          );
          return {
            data: {
              success: true,
              output: result.output,
              overview: result.overview,
            },
          };
        },
      },
      {
        method: 'POST',
        path: '/api/voice-training/run',
        handler: async (ctx) => {
          if (!this.trainingWorkspace) {
            return {
              status: 503,
              data: {
                success: false,
                error: '语音训练工作区未初始化',
              },
            };
          }
          const action = String(ctx.body?.action || '').trim();
          const characterId = String(ctx.body?.characterId || '').trim() || undefined;
          if (!action) {
            return {
              status: 400,
              data: {
                success: false,
                error: '缺少 action 参数',
              },
            };
          }
          try {
            const result = await this.trainingWorkspace.runAction(
              action as any,
              characterId,
              {
                sourcePath: ctx.body?.sourcePath,
                fileName: ctx.body?.fileName,
                fileBase64: ctx.body?.fileBase64,
                versionId: ctx.body?.versionId,
                releaseId: ctx.body?.releaseId,
              }
            );
            this.context?.dashboard.pushLog(
              'system',
              `[VoiceTraining] action=${action}${characterId ? ` character=${characterId}` : ''} status=${result.task.status}`
            );
            return {
              data: {
                success: true,
                ...result,
              },
            };
          } catch (error: any) {
            return {
              status: 500,
              data: {
                success: false,
                error: error.message || String(error),
              },
            };
          }
        },
      },
      {
        method: 'GET',
        path: '/api/voice/status',
        handler: async () => {
          try {
            const status = await this.client.health();
            return {
              data: {
                success: true,
                status,
                defaults: this.getDefaults(),
                telemetry: getTtsTelemetrySnapshot(),
              },
            };
          } catch (error: any) {
            return {
              data: {
                success: false,
                status: {
                  ok: false,
                  service: 'python-voice-service',
                  error: error.message,
                  defaultBackend: config.ttsBackend,
                  modelDir: config.ttsModelDir,
                },
                defaults: this.getDefaults(),
                telemetry: getTtsTelemetrySnapshot(),
              },
            };
          }
        },
      },
      {
        method: 'GET',
        path: '/api/voice/backends',
        handler: async () => {
          try {
            const backends = await this.client.listBackends();
            return { data: { success: true, backends } };
          } catch (error: any) {
            return {
              data: {
                success: false,
                backends: [
                  {
                    id: 'gpt-sovits',
                    name: 'GPT-SoVITS',
                    description: '推荐的中文角色播报后端，需本地模型或上游服务。',
                    supportsModels: true,
                    supportsPreview: true,
                    supportsStyle: true,
                    requiresGpu: true,
                    available: false,
                    availabilityReason: '未连接到 voice-service 或 GPT-SoVITS 上游未启动',
                    setupHint: '确认 8765 voice-service 在线，并检查 VOICE_GPTSOVITS_UPSTREAM。',
                  },
                  {
                    id: 'rvc-compat',
                    name: 'RVC Compatible',
                    description: '实验型角色声线贴合后端，适合已有 RVC 资产时做 A/B 对比。',
                    supportsModels: true,
                    supportsPreview: true,
                    supportsStyle: false,
                    requiresGpu: true,
                    available: false,
                    availabilityReason: '未配置 VOICE_RVC_UPSTREAM',
                    setupHint: '导入 model.pth 后，还需要单独启动 RVC 兼容推理服务。',
                  },
                  {
                    id: 'edge-tts',
                    name: 'Edge TTS',
                    description: '更自然的保底中文播报后端，无需角色模型。',
                    supportsModels: false,
                    supportsPreview: true,
                    supportsStyle: false,
                    requiresGpu: false,
                    available: true,
                    setupHint: '无需额外服务，可直接试听。',
                  },
                ],
                error: error.message,
              },
            };
          }
        },
      },
      {
        method: 'GET',
        path: '/api/voice/models',
        handler: async () => {
          const localModels = this.catalog.listLocalModels();
          try {
            const remoteModels = await this.client.listModels();
            return {
              data: {
                success: true,
                models: mergeModels(localModels, remoteModels),
                defaults: this.getDefaults(),
              },
            };
          } catch (error: any) {
            return {
              data: {
                success: false,
                models: localModels,
                defaults: this.getDefaults(),
                error: error.message,
              },
            };
          }
        },
      },
      {
        method: 'POST',
        path: '/api/voice/models/rescan',
        handler: async () => {
          const localModels = this.catalog.listLocalModels();
          try {
            const remoteModels = await this.client.rescanModels();
            return {
              data: {
                success: true,
                models: mergeModels(localModels, remoteModels),
              },
            };
          } catch (error: any) {
            return {
              data: {
                success: false,
                models: localModels,
                error: error.message,
              },
            };
          }
        },
      },
      {
        method: 'POST',
        path: '/api/voice/preview',
        handler: async (ctx) => {
          const payload = this.normalizeRequest(ctx.body || {});
          if (!payload.text) {
            return {
              status: 400,
              data: {
                success: false,
                error: '试听文本不能为空',
              },
            };
          }

          const result = await this.client.synthesize(payload, '/preview');
          this.context?.dashboard.pushLog(
            'tts',
            `[VoicePreview] backend=${result.backend} model=${result.modelName || result.modelId || 'default'}`
          );
          return { data: result };
        },
      },
    ];
  }

  private getDefaults() {
    return {
      enabled: config.ttsEnabled,
      provider: config.ttsProvider,
      backend: config.ttsBackend,
      modelId: config.ttsModel,
      modelDir: config.ttsModelDir,
      serviceUrl: config.ttsServiceUrl,
      voice: config.ttsVoice,
      speed: config.ttsSpeed,
      style: config.ttsStyle,
      sanitizeWhitelist: config.ttsSanitizeWhitelist,
      sanitizeBlacklist: config.ttsSanitizeBlacklist,
      previewText: config.ttsPreviewText,
      fallbackToBaidu: config.ttsFallbackToBaidu,
      runtimePolicy: getTtsRuntimePolicyInfo(),
    };
  }

  private normalizeRequest(body: Record<string, unknown>): VoiceSynthesisRequest {
    return {
      text: String(body.text || '').trim(),
      backend: String(body.backend || config.ttsBackend || '').trim() || undefined,
      modelId: String(body.modelId || config.ttsModel || '').trim() || undefined,
      voice: String(body.voice || config.ttsVoice || '').trim() || undefined,
      speed: body.speed !== undefined ? Number(body.speed) : config.ttsSpeed,
      style: String(body.style || config.ttsStyle || '').trim() || undefined,
      preview: true,
    };
  }
}
