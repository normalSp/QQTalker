import fs from 'fs';
import path from 'path';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { PluginConfigService } from '../src/plugins/plugin-config-service';
import { PluginManager } from '../src/plugins/plugin-manager';
import { PluginRegistry } from '../src/plugins/plugin-registry';

function uniqueId(prefix: string): string {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

const suiteRoot = path.resolve(process.cwd(), 'temp', uniqueId('plugin-platform-suite'));
const pluginDataRoot = path.join(suiteRoot, 'data', 'plugins');
const suiteTempRoot = path.join(suiteRoot, 'temp');
const previousPluginDataRoot = process.env.QQTALKER_PLUGIN_DATA_ROOT;

function cleanDir(dirPath: string): void {
  fs.rmSync(dirPath, { recursive: true, force: true, maxRetries: 5, retryDelay: 50 });
}

describe('plugin platform services', () => {
  beforeAll(() => {
    process.env.QQTALKER_PLUGIN_DATA_ROOT = pluginDataRoot;
  });

  afterAll(() => {
    if (previousPluginDataRoot === undefined) {
      delete process.env.QQTALKER_PLUGIN_DATA_ROOT;
    } else {
      process.env.QQTALKER_PLUGIN_DATA_ROOT = previousPluginDataRoot;
    }
    cleanDir(suiteRoot);
  });

  beforeEach(() => {
    cleanDir(pluginDataRoot);
    cleanDir(suiteTempRoot);
    fs.mkdirSync(pluginDataRoot, { recursive: true });
    fs.mkdirSync(suiteTempRoot, { recursive: true });
  });

  it('reads and writes plugin-scoped config', () => {
    const service = new PluginConfigService();
    const pluginId = uniqueId('config-plugin');

    const initial = service.getConfig(pluginId, { enabled: true, greeting: 'hi' });
    expect(initial).toEqual({ enabled: true, greeting: 'hi' });

    service.mergeConfig(pluginId, { greeting: 'hello', retries: 2 });
    const saved = service.getConfig(pluginId);
    expect(saved).toMatchObject({ greeting: 'hello', retries: 2 });
  });

  it('persists plugin registry entries and status transitions', () => {
    const registry = new PluginRegistry();
    const pluginId = uniqueId('registry-plugin');

    registry.upsert({
      id: pluginId,
      name: 'Registry Plugin',
      version: '1.0.0',
      enabled: true,
      installSource: {
        type: 'local',
        locator: './temp/plugin.js',
      },
      runtime: {
        mode: 'in-process',
        status: 'inactive',
        enabled: true,
      },
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    });

    expect(registry.get(pluginId)?.enabled).toBe(true);
    registry.setEnabled(pluginId, false);
    expect(registry.get(pluginId)?.runtime.status).toBe('disabled');
  });

  it('installs a local plugin and exposes schema/config metadata', async () => {
    const manager = new PluginManager();
    const pluginId = uniqueId('temp-plugin');
    const tempDir = path.join(suiteTempRoot, pluginId);
    const pluginFile = path.join(tempDir, 'index.js');
    fs.mkdirSync(tempDir, { recursive: true });
    fs.writeFileSync(pluginFile, `
module.exports = {
  id: '${pluginId}',
  name: 'Temp Plugin',
  manifest: {
    version: '1.2.3',
    description: 'Temp local plugin',
    permissions: ['config.read', 'dashboard.route'],
    hooks: ['command'],
    ui: { mode: 'schema' }
  },
  getConfigSchema() {
    return {
      title: 'Temp Plugin Settings',
      fields: [
        { key: 'greeting', type: 'string', title: 'Greeting', defaultValue: 'hello' }
      ]
    };
  },
  getDefaultConfig() {
    return { greeting: 'hello' };
  },
  getDashboardRoutes() {
    return [
      { method: 'GET', path: '/api/temp-plugin/ping', handler: () => ({ data: { ok: true } }) }
    ];
  }
};
`, 'utf-8');

    const installResult = await manager.installPlugin({
      source: 'local',
      locator: pluginFile,
      enable: true,
    });
    expect(installResult.success).toBe(true);

    await manager.initialize({
      onebot: {
        sendGroupMsg: async () => ({}) as any,
        sendPrivateMsg: async () => ({}) as any,
      } as any,
      aiClient: {} as any,
      sessions: {} as any,
      dashboard: { pushLog() {} } as any,
      personas: {} as any,
      dataDir: process.cwd(),
    });

    expect(manager.listPlugins().some(item => item.id === pluginId)).toBe(true);
    expect(manager.getPluginConfigSchema(pluginId)?.fields).toHaveLength(1);
    expect(manager.getPluginConfig(pluginId)).toMatchObject({ greeting: 'hello' });

    const updated = await manager.updatePluginConfig(pluginId, { greeting: 'welcome' });
    expect(updated).toMatchObject({ greeting: 'welcome' });
    expect(manager.getDashboardRoutes().some(route => route.path === '/api/temp-plugin/ping')).toBe(true);
  });

  it('bridges a local astrbot meme manager package into a usable plugin sample', async () => {
    const manager = new PluginManager();
    const pluginId = uniqueId('astrbot-meme');
    const repoDir = path.join(suiteTempRoot, pluginId);
    const memesDir = path.join(repoDir, 'memes', 'happy');
    fs.mkdirSync(memesDir, { recursive: true });
    fs.writeFileSync(path.join(repoDir, 'metadata.yaml'), [
      'name: meme_manager',
      'desc: AstrBot meme manager sample',
      'version: v3.20',
      'repo: https://github.com/anka-afk/astrbot_plugin_meme_manager',
      '',
    ].join('\n'), 'utf-8');
    fs.writeFileSync(path.join(repoDir, '_conf_schema.json'), JSON.stringify({
      max_emotions_per_message: { type: 'int', default: 2, description: 'max count' },
      emotions_probability: { type: 'int', default: 100, description: 'probability' },
      enable_alternative_markup: { type: 'bool', default: true, description: 'alt markup' },
      enable_loose_emotion_matching: { type: 'bool', default: true, description: 'loose matching' },
      strict_max_emotions_per_message: { type: 'bool', default: true, description: 'strict' },
      remove_invalid_alternative_markup: { type: 'bool', default: true, description: 'cleanup' },
      enable_repeated_emotion_detection: { type: 'bool', default: true, description: 'dedupe' },
      prompt: {
        type: 'object',
        items: {
          prompt_head: { type: 'string', default: '当前可用：\n', description: 'head' },
          prompt_tail_1: { type: 'string', default: '\n最多', description: 'tail1' },
          prompt_tail_2: { type: 'string', default: '个', description: 'tail2' },
        },
      },
    }, null, 2), 'utf-8');
    fs.writeFileSync(path.join(repoDir, 'config.py'), [
      'DEFAULT_CATEGORY_DESCRIPTIONS = {',
      '  "happy": "开心时使用",',
      '  "sad": "难过时使用",',
      '}',
      '',
    ].join('\n'), 'utf-8');
    fs.writeFileSync(path.join(memesDir, 'sample.png'), 'fake-image', 'utf-8');

    const installResult = await manager.installPlugin({
      source: 'local',
      locator: repoDir,
      enable: true,
    });
    expect(installResult.success).toBe(true);

    await manager.initialize({
      onebot: {
        sendGroupMsg: async () => ({}) as any,
        sendPrivateMsg: async () => ({}) as any,
      } as any,
      aiClient: {} as any,
      sessions: {} as any,
      dashboard: {
        pushLog() {},
        getBaseUrl() { return 'http://127.0.0.1:3180'; },
      } as any,
      personas: {} as any,
      dataDir: process.cwd(),
    });

    const bridge = manager.listPlugins().find(item => item.sourceType === 'adapter');
    expect(bridge).toBeTruthy();
    const detail = manager.getPluginDetail(bridge!.id);
    expect(detail?.configSchema?.fields.length).toBeGreaterThan(0);
    expect(detail?.manifest.adapter?.target).toBe('meme_manager');
    const prefix = await manager.buildSystemPrefix({
      groupId: 1,
      userId: 2,
      nickname: 'tester',
      basePersonaId: '',
      rawText: 'hi',
      userMessage: 'hi',
      history: [],
      mode: 'group',
    });
    expect(prefix).toContain('happy - 开心时使用');

    const reply = await manager.afterModelResponse({
      groupId: 1,
      userId: 2,
      nickname: 'tester',
      mode: 'group',
      rawText: 'hi',
      userMessage: 'hi',
      history: [],
      basePersonaId: '',
      systemPrefix: '',
      systemPrompt: '',
      reply: '今天真不错 &&happy&&',
    });
    expect(reply).toContain('[CQ:image,file=http://127.0.0.1:3180/api/plugins/');
    const categoriesRoute = manager.getDashboardRoutes().find(route => route.path.includes('/meme-manager/categories') && route.method === 'GET');
    expect(categoriesRoute).toBeTruthy();
    const categoriesResponse = await categoriesRoute!.handler({
      req: {} as any,
      res: {} as any,
      url: new URL('http://127.0.0.1:3180' + categoriesRoute!.path),
      body: {},
    });
    expect((categoriesResponse as any).data.items[0].category).toBe('happy');

    const updateRoute = manager.getDashboardRoutes().find(route => route.path.includes('/meme-manager/categories') && route.method === 'POST');
    expect(updateRoute).toBeTruthy();
    await updateRoute!.handler({
      req: {} as any,
      res: {} as any,
      url: new URL('http://127.0.0.1:3180' + updateRoute!.path),
      body: { category: 'happy', description: '高兴时发送' },
    });
    const updatedPrefix = await manager.buildSystemPrefix({
      groupId: 1,
      userId: 2,
      nickname: 'tester',
      basePersonaId: '',
      rawText: 'hi',
      userMessage: 'hi',
      history: [],
      mode: 'group',
    });
    expect(updatedPrefix).toContain('happy - 高兴时发送');

    const uploadRoute = manager.getDashboardRoutes().find(route => route.path.includes('/meme-manager/files') && route.method === 'POST');
    expect(uploadRoute).toBeTruthy();
    await uploadRoute!.handler({
      req: {} as any,
      res: {} as any,
      url: new URL('http://127.0.0.1:3180' + uploadRoute!.path),
      body: {
        category: 'happy',
        files: [{ name: 'extra.png', contentBase64: Buffer.from('filedata').toString('base64') }],
      },
    });
    const categoriesAfterUpload = await categoriesRoute!.handler({
      req: {} as any,
      res: {} as any,
      url: new URL('http://127.0.0.1:3180' + categoriesRoute!.path),
      body: {},
    });
    expect((categoriesAfterUpload as any).data.items[0].count).toBeGreaterThan(1);

    const fileDeleteRoute = manager.getDashboardRoutes().find(route => route.path.includes('/meme-manager/files') && route.method === 'DELETE');
    expect(fileDeleteRoute).toBeTruthy();
    await fileDeleteRoute!.handler({
      req: {} as any,
      res: {} as any,
      url: new URL('http://127.0.0.1:3180' + fileDeleteRoute!.path),
      body: { category: 'happy', file: 'extra.png' },
    });

    const renameRoute = manager.getDashboardRoutes().find(route => route.path.includes('/meme-manager/files') && route.method === 'PUT');
    expect(renameRoute).toBeTruthy();
    await uploadRoute!.handler({
      req: {} as any,
      res: {} as any,
      url: new URL('http://127.0.0.1:3180' + uploadRoute!.path),
      body: {
        category: 'happy',
        files: [{ name: 'rename-me.png', contentBase64: Buffer.from('rename').toString('base64') }],
      },
    });
    await renameRoute!.handler({
      req: {} as any,
      res: {} as any,
      url: new URL('http://127.0.0.1:3180' + renameRoute!.path),
      body: { category: 'happy', file: 'rename-me.png', nextName: 'renamed.png' },
    });

    const orderRoute = manager.getDashboardRoutes().find(route => route.path.includes('/meme-manager/categories/order') && route.method === 'PUT');
    expect(orderRoute).toBeTruthy();
    await updateRoute!.handler({
      req: {} as any,
      res: {} as any,
      url: new URL('http://127.0.0.1:3180' + updateRoute!.path),
      body: { category: 'zzz', description: '排序测试分类' },
    });
    await orderRoute!.handler({
      req: {} as any,
      res: {} as any,
      url: new URL('http://127.0.0.1:3180' + orderRoute!.path),
      body: { categories: ['zzz', 'happy', 'sad'] },
    });
    const categoriesAfterReorder = await categoriesRoute!.handler({
      req: {} as any,
      res: {} as any,
      url: new URL('http://127.0.0.1:3180' + categoriesRoute!.path),
      body: {},
    });
    expect((categoriesAfterReorder as any).data.items[0].category).toBe('zzz');

    const categoryDeleteRoute = manager.getDashboardRoutes().find(route => route.path.includes('/meme-manager/categories') && route.method === 'DELETE');
    expect(categoryDeleteRoute).toBeTruthy();
    await updateRoute!.handler({
      req: {} as any,
      res: {} as any,
      url: new URL('http://127.0.0.1:3180' + updateRoute!.path),
      body: { category: 'temp-cat', description: '临时分类' },
    });
    await categoryDeleteRoute!.handler({
      req: {} as any,
      res: {} as any,
      url: new URL('http://127.0.0.1:3180' + categoryDeleteRoute!.path),
      body: { category: 'temp-cat' },
    });

    const batchFileDeleteRoute = manager.getDashboardRoutes().find(route => route.path.includes('/meme-manager/files/batch') && route.method === 'DELETE');
    expect(batchFileDeleteRoute).toBeTruthy();
    await batchFileDeleteRoute!.handler({
      req: {} as any,
      res: {} as any,
      url: new URL('http://127.0.0.1:3180' + batchFileDeleteRoute!.path),
      body: { items: [{ category: 'happy', file: 'renamed.png' }] },
    });

    const batchCategoryDeleteRoute = manager.getDashboardRoutes().find(route => route.path.includes('/meme-manager/categories/batch') && route.method === 'DELETE');
    expect(batchCategoryDeleteRoute).toBeTruthy();
    await batchCategoryDeleteRoute!.handler({
      req: {} as any,
      res: {} as any,
      url: new URL('http://127.0.0.1:3180' + batchCategoryDeleteRoute!.path),
      body: { categories: ['zzz'] },
    });

    const restoreRoute = manager.getDashboardRoutes().find(route => route.path.includes('/meme-manager/restore-defaults') && route.method === 'POST');
    expect(restoreRoute).toBeTruthy();
    await restoreRoute!.handler({
      req: {} as any,
      res: {} as any,
      url: new URL('http://127.0.0.1:3180' + restoreRoute!.path),
      body: { categories: ['happy'] },
    });
    const restoredPrefix = await manager.buildSystemPrefix({
      groupId: 1,
      userId: 2,
      nickname: 'tester',
      basePersonaId: '',
      rawText: 'hi',
      userMessage: 'hi',
      history: [],
      mode: 'group',
    });
    expect(restoredPrefix).toContain('happy - 开心时使用');
  });

  it('updates adapter plugins using their original upstream source', async () => {
    const manager = new PluginManager();
    const repoDir = path.join(suiteTempRoot, uniqueId('adapter-update'));
    const memesDir = path.join(repoDir, 'memes', 'happy');
    fs.mkdirSync(memesDir, { recursive: true });
    fs.writeFileSync(path.join(repoDir, 'metadata.yaml'), [
      'name: meme_manager',
      'desc: AstrBot meme manager sample',
      'version: v3.20',
      '',
    ].join('\n'), 'utf-8');
    fs.writeFileSync(path.join(repoDir, '_conf_schema.json'), JSON.stringify({
      max_emotions_per_message: { type: 'int', default: 2, description: 'max count' },
    }, null, 2), 'utf-8');
    fs.writeFileSync(path.join(repoDir, 'config.py'), 'DEFAULT_CATEGORY_DESCRIPTIONS = {\n  "happy": "开心时使用",\n}\n', 'utf-8');
    fs.writeFileSync(path.join(memesDir, 'sample.png'), 'fake-image', 'utf-8');

    const installResult = await manager.installPlugin({
      source: 'local',
      locator: repoDir,
      enable: true,
    });
    expect(installResult.success).toBe(true);
    const pluginId = installResult.plugin!.id;

    const updated = await manager.updatePlugin(pluginId);
    expect(updated.success).toBe(true);
    expect(manager.listPlugins().some(item => item.id === pluginId)).toBe(true);
  });
});
