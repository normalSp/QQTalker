import { describe, expect, it } from 'vitest';
import {
  getTtsTelemetrySnapshot,
  normalizeLegacyBaiduSpeed,
  normalizeTtsStyle,
  normalizeVoiceServiceSpeed,
  optimizeSpokenReplyText,
  planVoiceDelivery,
  resetTtsTelemetryForTests,
  sanitizeTtsText,
  VoiceOutputPolicyResolver,
} from '../src/services/tts-service';
import { config } from '../src/types/config';

describe('tts-service helpers', () => {
  const catalogStub = {
    listLocalModels() {
      return [
        {
          id: 'preset-yongchutafi',
          name: '永雏塔菲',
          character: '永雏塔菲',
          backend: 'gpt-sovits',
          installed: true,
          enabled: true,
          recommendedBackend: 'gpt-sovits',
          alternateBackends: ['rvc-compat', 'edge-tts'],
          experimental: false,
        },
        {
          id: 'preset-yongchutafi-rvc',
          name: '永雏塔菲 RVC',
          character: '永雏塔菲',
          backend: 'rvc-compat',
          installed: true,
          enabled: true,
          recommendedBackend: 'rvc-compat',
          alternateBackends: ['gpt-sovits', 'edge-tts'],
          experimental: true,
        },
        {
          id: 'preset-dongxuelian',
          name: '冬雪莲',
          character: '冬雪莲',
          backend: 'gpt-sovits',
          installed: true,
          enabled: true,
          recommendedBackend: 'gpt-sovits',
          alternateBackends: ['rvc-compat', 'edge-tts'],
          experimental: false,
        },
      ];
    },
  } as any;

  it('supports configurable sanitize whitelist and blacklist', () => {
    const text = '【系统】：保留～但去掉和%';

    expect(
      sanitizeTtsText(text, {
        whitelistChars: '～',
        blacklistChars: '%',
      })
    ).toBe('保留～但去掉和');
  });

  it('sanitizes decorative prefixes, CQ codes, mentions, emoji, and urls', () => {
    const text =
      '【系统消息】：[CQ:at,qq=123456] @小主人 看这里喵~~~ 😸 https://example.com/test?a=1 &amp;';

    expect(sanitizeTtsText(text)).toBe('看这里喵～');
  });

  it('sanitizes ascii speaker prefixes and collapses repeated punctuation', () => {
    const text = 'Claw: Hello!!! 现在开始播报啦～～～～';

    expect(sanitizeTtsText(text)).toBe('Hello! 现在开始播报啦～');
  });

  it('softens spoken cute fillers for at-reply while keeping a cute tail', () => {
    const spoken = optimizeSpokenReplyText('喵，喵，今天先别急喵！我们一点点来喵喵！！', {
      scene: 'at-reply',
      character: '永雏塔菲',
    });

    expect(spoken).toBe('今天先别急！我们一点点来喵～');
  });

  it('maps legacy speed values to natural local-http speed factors', () => {
    expect(normalizeVoiceServiceSpeed(4, 'gpt-sovits')).toBe(1);
    expect(normalizeVoiceServiceSpeed(1, 'gpt-sovits')).toBe(1);
    expect(normalizeVoiceServiceSpeed(1.2, 'edge-tts')).toBe(1.2);
  });

  it('normalizes blank tts style to natural', () => {
    expect(normalizeTtsStyle('')).toBe('natural');
    expect(normalizeTtsStyle('  LiVeLy ')).toBe('lively');
  });

  it('plans slightly faster cadence for short expressive lines', () => {
    const plan = planVoiceDelivery('真的嘛？', 1, { style: 'natural', backend: 'gpt-sovits' });
    expect(plan.cadence).toBe('expressive');
    expect(plan.finalSpeed).toBeCloseTo(1.04, 2);
  });

  it('keeps long comma-heavy lines from becoming too rushed', () => {
    const plan = planVoiceDelivery('今天的安排有点多，我们先把早上的任务处理完，然后再继续下午的联调。', 1, {
      style: 'natural',
      backend: 'gpt-sovits',
    });
    expect(plan.cadence).toBe('balanced');
    expect(plan.finalSpeed).toBeGreaterThan(1);
    expect(plan.finalSpeed).toBeLessThan(1.02);
    expect(plan.sentenceCount).toBe(1);
  });

  it('keeps tafi at-reply cadence cute but not too rushed', () => {
    const plan = planVoiceDelivery('诶，这个想法好像真的可以喵！我们慢慢试，不着急喵～', 1, {
      style: 'natural',
      backend: 'gpt-sovits',
      scene: 'at-reply',
      character: '永雏塔菲',
    });

    expect(plan.cadence).toBe('balanced');
    expect(plan.finalSpeed).toBeLessThanOrEqual(1.02);
  });

  it('keeps baidu fallback speed compatible with old integer config', () => {
    expect(normalizeLegacyBaiduSpeed(1)).toBe(4);
    expect(normalizeLegacyBaiduSpeed(1.25)).toBe(5);
    expect(normalizeLegacyBaiduSpeed(4)).toBe(4);
  });

  it('exposes empty telemetry snapshot defaults', () => {
    resetTtsTelemetryForTests();
    expect(getTtsTelemetrySnapshot()).toMatchObject({
      totalRequests: 0,
      cacheHits: 0,
      localSuccesses: 0,
      fallbackSuccesses: 0,
      failures: 0,
      cacheEntries: 0,
    });
  });

  it('keeps experimental rvc out of default runtime replies', () => {
    const resolver = new VoiceOutputPolicyResolver(catalogStub);
    const policy = resolver.resolve('这句很短。', {
      scene: 'at-reply',
      forceModelId: 'preset-yongchutafi-rvc',
      allowExperimental: false,
    });

    expect(policy.selectedBackend).toBe('gpt-sovits');
    expect(policy.steps[0]?.backend).toBe('gpt-sovits');
  });

  it('forces long text to prefer gpt backend', () => {
    const resolver = new VoiceOutputPolicyResolver(catalogStub);
    const policy = resolver.resolve(
      '这是一段比较长的回复内容，用来验证长句场景下的运行时策略会不会继续选择更稳定的 GPT 链路，而不是把实验型 RVC 直接推到默认输出。为了让这条测试稳定命中长句阈值，我还额外补了一段说明文字，确保它足够长。',
      {
        scene: 'at-reply',
        forceBackend: 'rvc-compat',
        forceModelId: 'preset-yongchutafi-rvc',
        allowExperimental: true,
      }
    );

    expect(policy.longText).toBe(true);
    expect(policy.selectedBackend).toBe('gpt-sovits');
  });

  it('resolves model from default character mapping', () => {
    const resolver = new VoiceOutputPolicyResolver(catalogStub);
    const previousCharacter = config.ttsDefaultCharacter;
    const previousMap = { ...config.ttsCharacterModelMap };
    try {
      (config as any).ttsDefaultCharacter = '永雏塔菲';
      (config as any).ttsCharacterModelMap = { 永雏塔菲: 'preset-yongchutafi' };
      const policy = resolver.resolve('测试一下默认角色路由。', {
        scene: 'at-reply',
        allowExperimental: false,
      });
      expect(policy.character).toBe('永雏塔菲');
      expect(policy.selectedModelId).toBe('preset-yongchutafi');
    } finally {
      (config as any).ttsDefaultCharacter = previousCharacter;
      (config as any).ttsCharacterModelMap = previousMap;
    }
  });

  it('prefers group voice role mapping over default character', () => {
    const resolver = new VoiceOutputPolicyResolver(catalogStub);
    const previousCharacter = config.ttsDefaultCharacter;
    const previousCharacterMap = { ...config.ttsCharacterModelMap };
    const previousGroupMap = { ...config.ttsGroupVoiceRoleMap };
    try {
      (config as any).ttsDefaultCharacter = '永雏塔菲';
      (config as any).ttsCharacterModelMap = {
        永雏塔菲: 'preset-yongchutafi',
        冬雪莲: 'preset-dongxuelian',
      };
      (config as any).ttsGroupVoiceRoleMap = { '123456': '冬雪莲' };
      const policy = resolver.resolve('按群走角色路由。', {
        scene: 'at-reply',
        groupId: 123456,
        allowExperimental: false,
      });
      expect(policy.character).toBe('冬雪莲');
      expect(policy.selectedModelId).toBe('preset-dongxuelian');
    } finally {
      (config as any).ttsDefaultCharacter = previousCharacter;
      (config as any).ttsCharacterModelMap = previousCharacterMap;
      (config as any).ttsGroupVoiceRoleMap = previousGroupMap;
    }
  });
});
