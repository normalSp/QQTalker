import { afterEach, describe, expect, it, vi } from 'vitest';
import { AstrbotRelayService } from '../src/services/astrbot-relay';
import { config } from '../src/types/config';

type ConfigPatch = Partial<typeof config>;

const originalConfig = {
  astrbotQq: config.astrbotQq,
  astrbotEnabledComplexTasks: config.astrbotEnabledComplexTasks,
  astrbotComplexTaskKeywords: [...config.astrbotComplexTaskKeywords],
  astrbotComplexTaskGroupAllowlist: [...config.astrbotComplexTaskGroupAllowlist],
  astrbotComplexTaskGroupDenylist: [...config.astrbotComplexTaskGroupDenylist],
  astrbotComplexTaskGroupRouteOverrides: { ...config.astrbotComplexTaskGroupRouteOverrides },
  astrbotComplexTaskMinLength: config.astrbotComplexTaskMinLength,
  astrbotTimeoutMs: config.astrbotTimeoutMs,
  astrbotFallbackToLocal: config.astrbotFallbackToLocal,
};

function applyConfigPatch(patch: ConfigPatch): void {
  Object.assign(config as any, patch);
}

function buildRelayService() {
  const onebot = {
    sendPrivateMsg: vi.fn().mockResolvedValue({}),
    sendGroupMsg: vi.fn().mockResolvedValue({}),
  } as any;
  const sessions = {
    getHistory: vi.fn().mockReturnValue([]),
  } as any;
  return {
    relay: new AstrbotRelayService(onebot, sessions),
    onebot,
    sessions,
  };
}

function buildGroupMessage(overrides: Record<string, unknown> = {}) {
  return {
    group_id: 123456,
    user_id: 10001,
    message_id: 1,
    message: [],
    ...overrides,
  } as any;
}

afterEach(() => {
  applyConfigPatch({
    astrbotQq: originalConfig.astrbotQq,
    astrbotEnabledComplexTasks: originalConfig.astrbotEnabledComplexTasks,
    astrbotComplexTaskKeywords: [...originalConfig.astrbotComplexTaskKeywords],
    astrbotComplexTaskGroupAllowlist: [...originalConfig.astrbotComplexTaskGroupAllowlist],
    astrbotComplexTaskGroupDenylist: [...originalConfig.astrbotComplexTaskGroupDenylist],
    astrbotComplexTaskGroupRouteOverrides: { ...originalConfig.astrbotComplexTaskGroupRouteOverrides },
    astrbotComplexTaskMinLength: originalConfig.astrbotComplexTaskMinLength,
    astrbotTimeoutMs: originalConfig.astrbotTimeoutMs,
    astrbotFallbackToLocal: originalConfig.astrbotFallbackToLocal,
  });
});

describe('AstrbotRelayService complex delegation', () => {
  it('delegates complex tasks when keyword matches', () => {
    applyConfigPatch({
      astrbotQq: 223344,
      astrbotEnabledComplexTasks: true,
      astrbotComplexTaskKeywords: ['分析', '规划'],
      astrbotComplexTaskMinLength: 100,
    });
    const { relay } = buildRelayService();

    const decision = relay.analyzeComplexTask('帮我分析一下这次联调失败原因，并给一个修复方案');

    expect(decision.shouldDelegate).toBe(true);
    expect(decision.reason).toBe('complex-keyword');
    expect(decision.matchedKeywords).toContain('分析');
  });

  it('does not delegate short normal chat when complex delegation disabled', () => {
    applyConfigPatch({
      astrbotQq: 223344,
      astrbotEnabledComplexTasks: false,
    });
    const { relay } = buildRelayService();

    const decision = relay.analyzeComplexTask('今天吃什么呀');

    expect(decision.shouldDelegate).toBe(false);
    expect(decision.reason).toBe('disabled');
  });

  it('respects group allowlist for automatic complex delegation', () => {
    applyConfigPatch({
      astrbotQq: 223344,
      astrbotEnabledComplexTasks: true,
      astrbotComplexTaskKeywords: ['分析'],
      astrbotComplexTaskGroupAllowlist: [999999],
    } as any);
    const { relay } = buildRelayService();

    const decision = relay.analyzeComplexTask('请帮我分析一下这个问题', 123456);

    expect(decision.shouldDelegate).toBe(false);
    expect(decision.reason).toBe('group-not-allowed');
  });

  it('gives denylist higher priority than allowlist for automatic complex delegation', () => {
    applyConfigPatch({
      astrbotQq: 223344,
      astrbotEnabledComplexTasks: true,
      astrbotComplexTaskKeywords: ['分析'],
      astrbotComplexTaskGroupAllowlist: [123456],
      astrbotComplexTaskGroupDenylist: [123456],
    } as any);
    const { relay } = buildRelayService();

    const decision = relay.analyzeComplexTask('请帮我分析一下这个问题', 123456);

    expect(decision.shouldDelegate).toBe(false);
    expect(decision.reason).toBe('group-denied');
  });

  it('supports per-group route override to keep processing local', () => {
    applyConfigPatch({
      astrbotQq: 223344,
      astrbotEnabledComplexTasks: true,
      astrbotComplexTaskKeywords: ['分析'],
      astrbotComplexTaskGroupRouteOverrides: {
        '123456': 'local-only',
      },
    } as any);
    const { relay } = buildRelayService();

    const decision = relay.analyzeComplexTask('请帮我分析一下这个问题', 123456);

    expect(decision.shouldDelegate).toBe(false);
    expect(decision.reason).toBe('group-local-only');
  });

  it('supports per-group route override to force delegation', () => {
    applyConfigPatch({
      astrbotQq: 223344,
      astrbotEnabledComplexTasks: true,
      astrbotComplexTaskKeywords: [],
      astrbotComplexTaskMinLength: 999,
      astrbotComplexTaskGroupRouteOverrides: {
        '123456': 'force-delegate',
      },
    } as any);
    const { relay } = buildRelayService();

    const decision = relay.analyzeComplexTask('今天吃什么呀', 123456);

    expect(decision.shouldDelegate).toBe(true);
    expect(decision.reason).toBe('group-force-delegate');
  });

  it('supports runtime config hot reload without recreating relay service', () => {
    applyConfigPatch({
      astrbotQq: 223344,
      astrbotEnabledComplexTasks: false,
      astrbotComplexTaskKeywords: ['分析'],
    } as any);
    const { relay } = buildRelayService();

    expect(relay.analyzeComplexTask('请帮我分析这个问题').reason).toBe('disabled');

    relay.applyRuntimeConfig({
      enabledComplexTasks: true,
      complexTaskKeywords: ['分析'],
      complexTaskGroupRouteOverrides: { '123456': 'force-delegate' },
      timeoutMs: 12345,
    });

    const decision = relay.analyzeComplexTask('今天吃什么呀', 123456);
    expect(decision.shouldDelegate).toBe(true);
    expect(decision.reason).toBe('group-force-delegate');
    expect(relay.getRuntimeSnapshot().configured).toBe(true);
  });

  it('queues pending reply and forwards AstrBot response back to delegated group', async () => {
    applyConfigPatch({
      astrbotQq: 223344,
      astrbotEnabledComplexTasks: true,
      astrbotComplexTaskKeywords: ['规划'],
      astrbotComplexTaskMinLength: 80,
    });
    const { relay, onebot } = buildRelayService();

    const result = await relay.maybeDelegateComplexTask(
      buildGroupMessage(),
      '请帮我规划一下这次训练和发布的步骤',
      '测试用户'
    );

    expect(result.delegated).toBe(true);
    expect(onebot.sendPrivateMsg).toHaveBeenCalledTimes(1);
    expect(relay.getRuntimeSnapshot().pendingReplyCount).toBe(1);

    const handled = await relay.handleAstrbotReply(223344, '这是 AstrBot 的复杂任务结果');

    expect(handled).toBe(true);
    expect(onebot.sendGroupMsg).toHaveBeenCalledWith(123456, '[Astrbot] 这是 AstrBot 的复杂任务结果');
    expect(relay.getRuntimeSnapshot().pendingReplyCount).toBe(0);
  });

  it('falls back to local processing when AstrBot relay fails', async () => {
    applyConfigPatch({
      astrbotQq: 223344,
      astrbotEnabledComplexTasks: true,
      astrbotComplexTaskKeywords: ['排查'],
      astrbotFallbackToLocal: true,
    });
    const { relay, onebot } = buildRelayService();
    onebot.sendPrivateMsg.mockRejectedValueOnce(new Error('network down'));

    const result = await relay.maybeDelegateComplexTask(
      buildGroupMessage(),
      '帮我排查这次错误的根因并列出修复路径',
      '测试用户'
    );

    expect(result.delegated).toBe(false);
    expect(result.fallbackToLocal).toBe(true);
    expect(result.errorMessage).toContain('network down');
    expect(relay.getRuntimeSnapshot().fallbackToLocalCount).toBe(1);
  });

  it('exposes decision counts and recent events in runtime snapshot', async () => {
    applyConfigPatch({
      astrbotQq: 223344,
      astrbotEnabledComplexTasks: true,
      astrbotComplexTaskKeywords: ['规划'],
      astrbotComplexTaskMinLength: 100,
    });
    const { relay } = buildRelayService();

    await relay.maybeDelegateComplexTask(
      buildGroupMessage(),
      '今天要不要一起玩呀',
      '测试用户'
    );

    const snapshot = relay.getRuntimeSnapshot();
    expect(snapshot.decisionCounts['too-short']).toBe(1);
    expect(snapshot.lastEvent).toMatchObject({
      status: 'skipped',
      reason: 'too-short',
      groupId: 123456,
    });
    expect(snapshot.recentEvents[0]).toMatchObject({
      status: 'skipped',
      reason: 'too-short',
      groupId: 123456,
    });
  });
});
