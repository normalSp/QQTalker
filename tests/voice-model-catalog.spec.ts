import fs from 'fs';
import path from 'path';
import { afterEach, describe, expect, it } from 'vitest';
import { VoiceModelCatalog } from '../src/plugins/voice-broadcast/voice-model-catalog';

const tempDirs: string[] = [];

function createTempDir(): string {
  const dir = path.resolve(process.cwd(), 'temp', `voice-models-${Date.now()}-${Math.random().toString(36).slice(2)}`);
  fs.mkdirSync(dir, { recursive: true });
  tempDirs.push(dir);
  return dir;
}

afterEach(() => {
  for (const dir of tempDirs.splice(0)) {
    try {
      fs.rmSync(dir, { recursive: true, force: true });
    } catch {}
  }
});

describe('VoiceModelCatalog', () => {
  it('includes builtin presets when no local catalog exists', () => {
    const dir = createTempDir();
    const catalog = new VoiceModelCatalog(dir);
    const models = catalog.listLocalModels();

    expect(models.some(item => item.id === 'preset-dongxuelian')).toBe(true);
    expect(models.some(item => item.id === 'preset-yongchutafi')).toBe(true);
    expect(models.some(item => item.backend === 'edge-tts' && item.installed)).toBe(true);
  });

  it('merges catalog.json and nested voice-model.json entries', () => {
    const dir = createTempDir();
    fs.writeFileSync(path.join(dir, 'catalog.json'), JSON.stringify({
      models: [
        {
          id: 'preset-dongxuelian',
          name: '冬雪莲本地增强版',
          backend: 'gpt-sovits',
          tags: ['本地覆盖'],
          recommendedBackend: 'gpt-sovits',
          alternateBackends: ['rvc-compat', 'edge-tts'],
          qualityTier: 'stable',
          trainingStatus: 'needs-more-clean-data',
          previewHint: '建议使用完整句试听',
          backendOverrides: {
            'gpt-sovits': {
              preferredAuxCount: 1,
              recommendedTextMinLength: 8,
            },
          },
        },
      ],
    }, null, 2));

    const nestedDir = path.join(dir, 'custom-role');
    fs.mkdirSync(nestedDir, { recursive: true });
    const modelFile = path.join(nestedDir, 'model.ckpt');
    fs.writeFileSync(modelFile, 'mock');
    fs.writeFileSync(path.join(nestedDir, 'voice-model.json'), JSON.stringify({
      id: 'custom-role',
      name: '自定义角色',
      backend: 'gpt-sovits',
      modelPath: './model.ckpt',
      tags: ['测试'],
    }, null, 2));

    const catalog = new VoiceModelCatalog(dir);
    const models = catalog.listLocalModels();
    const overridden = models.find(item => item.id === 'preset-dongxuelian');
    const custom = models.find(item => item.id === 'custom-role');

    expect(overridden?.name).toBe('冬雪莲本地增强版');
    expect(overridden?.recommendedBackend).toBe('gpt-sovits');
    expect(overridden?.alternateBackends).toEqual(['rvc-compat', 'edge-tts']);
    expect(overridden?.backendOverrides?.['gpt-sovits']?.preferredAuxCount).toBe(1);
    expect(custom?.installed).toBe(true);
    expect(custom?.modelPath).toBe(path.resolve(modelFile));
  });
});
