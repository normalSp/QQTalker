import { afterEach, describe, expect, it, vi } from 'vitest';
import fs from 'fs';
import path from 'path';
import { AstrbotRelayService } from '../src/services/astrbot-relay';
import { PersonaService } from '../src/services/persona-service';
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
  astrbotComplexTaskMessageMaxChars: config.astrbotComplexTaskMessageMaxChars,
  astrbotTimeoutMs: config.astrbotTimeoutMs,
  astrbotFallbackToLocal: config.astrbotFallbackToLocal,
};
const tempPersonaFiles: string[] = [];

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
    astrbotComplexTaskMessageMaxChars: originalConfig.astrbotComplexTaskMessageMaxChars,
    astrbotTimeoutMs: originalConfig.astrbotTimeoutMs,
    astrbotFallbackToLocal: originalConfig.astrbotFallbackToLocal,
  });
  for (const file of tempPersonaFiles.splice(0)) {
    try {
      fs.rmSync(file, { force: true });
    } catch {}
  }
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

  it('does not delegate keyword-only casual text without enough complexity signals', () => {
    applyConfigPatch({
      astrbotQq: 223344,
      astrbotEnabledComplexTasks: true,
      astrbotComplexTaskKeywords: ['分析'],
      astrbotComplexTaskMinLength: 100,
    });
    const { relay } = buildRelayService();

    const decision = relay.analyzeComplexTask('分析下今天吃什么');

    expect(decision.shouldDelegate).toBe(false);
    expect(decision.reason).toBe('not-complex');
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
    expect(onebot.sendGroupMsg).toHaveBeenCalledWith(
      123456,
      '[Astrbot] Claw把 AstrBot 的结果整理回来啦喵~\n这是 AstrBot 的复杂任务结果喵~'
    );
    expect(relay.getRuntimeSnapshot().pendingReplyCount).toBe(0);
  });

  it('keeps pending reply target when AstrBot first sends an empty placeholder', async () => {
    applyConfigPatch({
      astrbotQq: 223344,
      astrbotEnabledComplexTasks: true,
      astrbotComplexTaskKeywords: ['规划'],
      astrbotComplexTaskMinLength: 80,
    });
    const { relay, onebot } = buildRelayService();

    await relay.maybeDelegateComplexTask(
      buildGroupMessage(),
      '请帮我规划一下这次训练和发布的步骤',
      '测试用户'
    );

    const emptyHandled = await relay.handleAstrbotReply(223344, '', []);
    expect(emptyHandled).toBe(true);
    expect(relay.getRuntimeSnapshot().pendingReplyCount).toBe(1);
    expect(onebot.sendGroupMsg).not.toHaveBeenCalled();

    const handled = await relay.handleAstrbotReply(223344, '下一条才是真正回复');
    expect(handled).toBe(true);
    expect(relay.getRuntimeSnapshot().pendingReplyCount).toBe(0);
    expect(onebot.sendGroupMsg).toHaveBeenCalledWith(
      123456,
      '[Astrbot] Claw把 AstrBot 的结果整理回来啦喵~\n下一条才是真正回复喵~'
    );
  });

  it('sends a lightweight prompt for complex-task delegation', async () => {
    applyConfigPatch({
      astrbotQq: 223344,
      astrbotEnabledComplexTasks: true,
      astrbotComplexTaskKeywords: ['分析'],
      astrbotComplexTaskMinLength: 80,
    });
    const { relay, onebot } = buildRelayService();

    await relay.maybeDelegateComplexTask(
      buildGroupMessage(),
      '请分析函数y=x³-3ax+77，a为实数，当a=98时，函数的单调区间和极值',
      '测试用户'
    );

    expect(onebot.sendPrivateMsg).toHaveBeenCalledTimes(1);
    const payload = onebot.sendPrivateMsg.mock.calls[0][1];
    expect(payload).toContain('请直接处理下面的问题');
    expect(payload).toContain('请分析函数y=x³-3ax+77');
    expect(payload).not.toContain('你是"Claw"，一只可爱的猫娘QQ机器人喵~');
    expect(payload).not.toContain('【回复示例】');
  });

  it('limits complex-task payload length and trims oversized context', async () => {
    applyConfigPatch({
      astrbotQq: 223344,
      astrbotEnabledComplexTasks: true,
      astrbotComplexTaskKeywords: ['分析'],
      astrbotComplexTaskMinLength: 60,
      astrbotComplexTaskMessageMaxChars: 220,
    });
    const longContext = Array.from({ length: 12 }, (_, index) => ({
      role: 'user',
      content: `[用户${index}]: 这是一段很长很长的上下文内容，主要用于验证 complex-task 转发时不会把 Astrbot 喂崩。`.repeat(3),
    }));
    const { relay, onebot, sessions } = buildRelayService();
    sessions.getHistory.mockReturnValue(longContext);

    await relay.maybeDelegateComplexTask(
      buildGroupMessage(),
      '这个要结合上面刚才的内容，继续分析函数y=x³-3ax+77，a为实数，当a=98时，函数的单调区间和极值，并说明原因',
      '测试用户'
    );

    const payload = onebot.sendPrivateMsg.mock.calls[0][1];
    expect(payload.length).toBeLessThanOrEqual(220);
    expect(payload).toContain('请直接处理下面的问题');
    expect(payload).toContain('函数y=x³-3ax+77');
    expect(payload).not.toContain('用户11');
  });

  it('exposes complex-task thresholds in runtime snapshot', () => {
    applyConfigPatch({
      astrbotQq: 223344,
      astrbotEnabledComplexTasks: true,
      astrbotComplexTaskMinLength: 66,
      astrbotComplexTaskMessageMaxChars: 280,
    });
    const { relay } = buildRelayService();

    const snapshot = relay.getRuntimeSnapshot();

    expect(snapshot.complexTaskEnabled).toBe(true);
    expect(snapshot.complexTaskMinLength).toBe(66);
    expect(snapshot.complexTaskMessageMaxChars).toBe(280);
  });

  it('keeps persona prompt for relay-mode delegation', async () => {
    applyConfigPatch({
      astrbotQq: 223344,
    });
    const { relay, onebot } = buildRelayService();
    const groupMsg = buildGroupMessage();

    await relay.handleCommand(groupMsg, '/Astrbot', '测试用户');

    await relay.autoRelay(
      groupMsg,
      '帮我看看这个怎么回',
      '测试用户'
    );

    expect(onebot.sendPrivateMsg).toHaveBeenCalledTimes(1);
    const payload = onebot.sendPrivateMsg.mock.calls[0][1];
    expect(payload).toContain('你是"Claw"，一只可爱的猫娘QQ机器人喵~');
  });

  it('uses bound group persona prompt for relay-mode delegation', async () => {
    applyConfigPatch({
      astrbotQq: 223344,
    });
    const { relay, onebot } = buildRelayService();
    const personaFile = path.resolve(process.cwd(), 'temp', `persona-relay-test-${Date.now()}-${Math.random().toString(36).slice(2)}.json`);
    tempPersonaFiles.push(personaFile);
    const personaService = new PersonaService(personaFile);
    personaService.createProfile({
      id: 'cool-wolf',
      name: 'Cool Wolf',
      summary: '冷静专业',
      systemPrompt: '你是 Cool Wolf，风格冷静专业。',
      relayPrompt: '你是 Cool Wolf，帮我以冷静专业的口吻转述。',
      ttsCharacter: 'wolf-voice',
    });
    personaService.bindGroup(123456, 'cool-wolf');
    relay.setPersonaService(personaService);

    const groupMsg = buildGroupMessage();
    await relay.handleCommand(groupMsg, '/Astrbot', '测试用户');
    await relay.autoRelay(groupMsg, '帮我看看这个怎么回', '测试用户');

    const payload = onebot.sendPrivateMsg.mock.calls[0][1];
    expect(payload).toContain('你是 Cool Wolf');
    expect(payload).not.toContain('你是"Claw"，一只可爱的猫娘QQ机器人喵~');
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
