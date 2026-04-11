import { describe, expect, it } from 'vitest';
import { PluginManager } from '../src/plugins/plugin-manager';

describe('PluginManager', () => {
  it('aggregates prompt hooks and commands', async () => {
    const manager = new PluginManager();
    manager.register({
      id: 'test-plugin',
      name: 'TestPlugin',
      beforeChat() {
        return {
          pluginId: 'test-plugin',
          sections: ['来自测试插件的 Prompt 注入'],
        };
      },
      handleCommand(context) {
        if (context.normalizedText !== '/hello_plugin') {
          return { handled: false };
        }
        return { handled: true, reply: 'hello from plugin' };
      },
      getDashboardRoutes() {
        return [{ method: 'GET', path: '/api/test-plugin/ping', handler: () => ({ data: { ok: true } }) }];
      },
    });

    await manager.initialize({
      onebot: {} as any,
      aiClient: {} as any,
      sessions: {} as any,
      dashboard: {} as any,
      personas: {} as any,
      dataDir: process.cwd(),
    });

    const prefix = await manager.buildSystemPrefix({
      groupId: 1,
      userId: 2,
      nickname: 'tester',
      rawText: 'hello',
      userMessage: 'hello',
      history: [],
      mode: 'group',
    });
    expect(prefix).toContain('来自测试插件的 Prompt 注入');

    const command = await manager.handleCommand({
      groupId: 1,
      userId: 2,
      nickname: 'tester',
      rawText: '/hello_plugin',
      normalizedText: '/hello_plugin',
      isAdmin: true,
    });
    expect(command?.reply).toBe('hello from plugin');

    expect(manager.getDashboardRoutes()).toHaveLength(1);
  });
});
