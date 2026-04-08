import { logger } from '../../logger';
import type {
  DashboardRouteProvider,
  PluginContext,
  PluginMessageContext,
  QQTalkerPlugin,
} from '../plugin-types';
import { SelfLearningStore } from './self-learning-store';
import { SelfLearningService } from './self-learning-service';

function parseNumber(value: string | null): number | undefined {
  if (!value) return undefined;
  const parsed = parseInt(value, 10);
  return Number.isFinite(parsed) ? parsed : undefined;
}

function parseBoolean(value: unknown): boolean | undefined {
  if (typeof value === 'boolean') return value;
  if (typeof value === 'string') {
    if (value === 'true') return true;
    if (value === 'false') return false;
  }
  return undefined;
}

async function parseBody(req: NodeJS.ReadableStream): Promise<Record<string, any>> {
  let content = '';
  for await (const chunk of req) {
    content += chunk;
  }
  if (!content) return {};
  try {
    return JSON.parse(content);
  } catch {
    return {};
  }
}

export class SelfLearningPlugin implements QQTalkerPlugin {
  readonly id = 'self-learning';
  readonly name = 'SelfLearning';

  private readonly store = new SelfLearningStore();
  private readonly service = new SelfLearningService(this.store);
  private timer: ReturnType<typeof setInterval> | null = null;

  async initialize(_context: PluginContext): Promise<void> {
    await this.service.initialize();
    this.timer = setInterval(() => {
      this.service.runLearningCycle().catch((error) => {
        logger.error({ error }, '[SelfLearningPlugin] 自动学习周期失败');
      });
    }, 60 * 60 * 1000);
  }

  async dispose(): Promise<void> {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
    await this.store.close();
  }

  async onMessage(context: PluginMessageContext): Promise<void> {
    if (!context.groupId) return;
    await this.service.captureMessage({
      groupId: context.groupId,
      userId: context.userId,
      nickname: context.nickname,
      text: context.finalText,
      rawMessage: context.message.raw_message || context.finalText,
      isAtBot: context.isAtBot,
      createdAt: context.timestamp,
    });
  }

  beforeChat = this.service.buildPromptContext.bind(this.service);

  handleCommand = this.service.handleCommand.bind(this.service);

  getDashboardRoutes(): DashboardRouteProvider[] {
    return [
      {
        method: 'GET',
        path: '/api/self-learning/strategy',
        handler: async () => ({
          data: await this.service.getStrategySettings(),
        }),
      },
      {
        method: 'GET',
        path: '/api/self-learning/overview',
        handler: async () => ({
          data: {
            overview: await this.service.getOverview(),
            runtime: this.service.getRuntimeState(),
            groups: await this.service.getTrackedGroups(),
          },
        }),
      },
      {
        method: 'GET',
        path: '/api/self-learning/styles',
        handler: async ({ url }) => ({
          data: {
            items: await this.service.listStyles(
              parseNumber(url.searchParams.get('groupId')) || 0,
              parseNumber(url.searchParams.get('userId')),
            ),
          },
        }),
      },
      {
        method: 'GET',
        path: '/api/self-learning/slang',
        handler: async ({ url }) => ({
          data: {
            items: await this.service.listSlang(parseNumber(url.searchParams.get('groupId')) || 0),
          },
        }),
      },
      {
        method: 'GET',
        path: '/api/self-learning/social',
        handler: async ({ url }) => ({
          data: {
            items: await this.service.listSocial(
              parseNumber(url.searchParams.get('groupId')) || 0,
              parseNumber(url.searchParams.get('userId')),
            ),
          },
        }),
      },
      {
        method: 'GET',
        path: '/api/self-learning/affection',
        handler: async ({ url }) => ({
          data: {
            items: await this.service.listAffection(parseNumber(url.searchParams.get('groupId')) || 0),
          },
        }),
      },
      {
        method: 'GET',
        path: '/api/self-learning/mood',
        handler: async ({ url }) => ({
          data: {
            item: await this.service.getMood(parseNumber(url.searchParams.get('groupId')) || 0),
          },
        }),
      },
      {
        method: 'GET',
        path: '/api/self-learning/goals',
        handler: async ({ url }) => ({
          data: {
            items: await this.service.listGoals(parseNumber(url.searchParams.get('groupId')) || 0),
          },
        }),
      },
      {
        method: 'GET',
        path: '/api/self-learning/memories',
        handler: async ({ url }) => ({
          data: {
            items: await this.service.listMemories(
              parseNumber(url.searchParams.get('groupId')) || 0,
              parseNumber(url.searchParams.get('userId')),
            ),
          },
        }),
      },
      {
        method: 'GET',
        path: '/api/self-learning/persona-reviews',
        handler: async ({ url }) => ({
          data: {
            items: await this.service.listPersonaReviews(parseNumber(url.searchParams.get('groupId'))),
          },
        }),
      },
      {
        method: 'GET',
        path: '/api/self-learning/advanced-summary',
        handler: async ({ url }) => ({
          data: {
            item: await this.service.getAdvancedSummary(parseNumber(url.searchParams.get('groupId')) || 0),
          },
        }),
      },
      {
        method: 'GET',
        path: '/api/self-learning/ml-clusters',
        handler: async ({ url }) => ({
          data: {
            items: await this.service.getClusters(parseNumber(url.searchParams.get('groupId')) || 0),
          },
        }),
      },
      {
        method: 'GET',
        path: '/api/self-learning/scene-map',
        handler: async ({ url }) => ({
          data: {
            items: await this.service.getSceneMap(parseNumber(url.searchParams.get('groupId')) || 0),
          },
        }),
      },
      {
        method: 'GET',
        path: '/api/self-learning/memory-graph',
        handler: async ({ url }) => ({
          data: {
            item: await this.service.getMemoryGraph(parseNumber(url.searchParams.get('groupId')) || 0),
          },
        }),
      },
      {
        method: 'GET',
        path: '/api/self-learning/learning-runs',
        handler: async ({ url }) => ({
          data: {
            items: await this.service.getLearningRuns(parseNumber(url.searchParams.get('groupId')) || 0),
          },
        }),
      },
      {
        method: 'GET',
        path: '/api/self-learning/export',
        handler: async ({ url }) => ({
          data: await this.service.exportLearningData(parseNumber(url.searchParams.get('groupId'))),
        }),
      },
      {
        method: 'POST',
        path: '/api/self-learning/learning/run',
        handler: async ({ req, url }) => {
          const body = await parseBody(req);
          const groupId = parseNumber(url.searchParams.get('groupId')) || parseNumber(String(body.groupId || ''));
          if (groupId) {
            const report = await this.service.runLearningCycleForGroup(groupId);
            return {
              data: {
                success: true,
                groupId,
                summary: report.summary,
                runtime: this.service.getRuntimeState(),
              },
            };
          }
          await this.service.runLearningCycle();
          return {
            data: {
              success: true,
              runtime: this.service.getRuntimeState(),
            },
          };
        },
      },
      {
        method: 'POST',
        path: '/api/self-learning/import',
        handler: async ({ req }) => {
          const body = await parseBody(req);
          const bundle = body.bundle || body;
          const mode = body.mode === 'replace' ? 'replace' : 'merge';
          const result = await this.service.importLearningData(bundle, mode);
          return { data: { success: true, result } };
        },
      },
      {
        method: 'POST',
        path: '/api/self-learning/group/clear',
        handler: async ({ req, url }) => {
          const body = await parseBody(req);
          const groupId = parseNumber(url.searchParams.get('groupId')) || parseNumber(String(body.groupId || ''));
          if (!groupId) {
            return { status: 400, data: { error: 'Missing groupId' } };
          }
          const counts = await this.service.clearLearningData(groupId);
          return { data: { success: true, groupId, counts } };
        },
      },
      {
        method: 'POST',
        path: '/api/self-learning/analysis/rebuild',
        handler: async ({ req, url }) => {
          const body = await parseBody(req);
          const groupId = parseNumber(url.searchParams.get('groupId')) || parseNumber(String(body.groupId || ''));
          if (!groupId) {
            return { status: 400, data: { error: 'Missing groupId' } };
          }
          const result = await this.service.rebuildAnalysisSnapshots(groupId);
          return {
            data: {
              success: true,
              groupId,
              summary: result.report.summary,
              runtime: this.service.getRuntimeState(),
              snapshotCount: result.snapshots.length,
            },
          };
        },
      },
      {
        method: 'POST',
        path: '/api/self-learning/strategy/runtime',
        handler: async ({ req }) => {
          const body = await parseBody(req);
          const enabled = parseBoolean(body.autoLearningEnabled);
          if (enabled === undefined) {
            return { status: 400, data: { error: 'Missing autoLearningEnabled' } };
          }
          return {
            data: {
              success: true,
              runtime: this.service.setAutoLearningEnabled(enabled),
            },
          };
        },
      },
      {
        method: 'POST',
        path: '/api/self-learning/persona-review/approve',
        handler: async ({ req }) => {
          const body = await parseBody(req);
          await this.service.approvePersonaReview(parseInt(String(body.reviewId || '0'), 10));
          return { data: { success: true } };
        },
      },
      {
        method: 'POST',
        path: '/api/self-learning/persona-review/reject',
        handler: async ({ req }) => {
          const body = await parseBody(req);
          await this.service.rejectPersonaReview(parseInt(String(body.reviewId || '0'), 10));
          return { data: { success: true } };
        },
      },
    ];
  }
}
