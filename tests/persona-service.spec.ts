import fs from 'fs';
import path from 'path';
import { afterEach, describe, expect, it } from 'vitest';
import { PersonaService } from '../src/services/persona-service';

const tempFiles: string[] = [];

function createService() {
  const filePath = path.resolve(process.cwd(), 'temp', `persona-service-${Date.now()}-${Math.random().toString(36).slice(2)}.json`);
  tempFiles.push(filePath);
  return new PersonaService(filePath);
}

afterEach(() => {
  for (const file of tempFiles.splice(0)) {
    try {
      fs.rmSync(file, { force: true });
    } catch {}
  }
});

describe('PersonaService', () => {
  it('creates default persona file and resolves default persona', async () => {
    const service = createService();

    const state = service.getState();
    const resolved = await service.resolvePersona(1001);

    expect(state.defaultPersonaId).toBe('claw-default');
    expect(state.profiles.length).toBe(1);
    expect(resolved.basePersonaId).toBe('claw-default');
    expect(resolved.systemPrompt).toContain('Claw');
  });

  it('binds groups and merges learning overlay into resolved prompt', async () => {
    const service = createService();
    service.createProfile({
      id: 'cool-wolf',
      name: 'Cool Wolf',
      summary: '冷静专业',
      systemPrompt: '你是 Cool Wolf。',
      relayPrompt: '你是 Cool Wolf，负责转述。',
      ttsCharacter: 'wolf-voice',
    });
    service.bindGroup(2002, 'cool-wolf');
    service.setLearningOverlayProvider(async () => ({
      basePersonaId: 'cool-wolf',
      prompt: '请叠加本群常用黑话和轻微吐槽感。',
      personaName: 'cool-wolf-overlay',
    }));

    const resolved = await service.resolvePersona(2002);

    expect(resolved.basePersonaId).toBe('cool-wolf');
    expect(resolved.systemPrompt).toContain('你是 Cool Wolf。');
    expect(resolved.systemPrompt).toContain('请叠加本群常用黑话');
    expect(resolved.relayPrompt).toContain('负责转述');
    expect(resolved.ttsCharacter).toBe('wolf-voice');
    expect(resolved.overlayStatus).toBe('active');
  });
});
