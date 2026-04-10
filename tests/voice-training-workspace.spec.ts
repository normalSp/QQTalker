import fs from 'fs';
import os from 'os';
import path from 'path';
import { afterEach, describe, expect, it } from 'vitest';
import { VoiceTrainingWorkspaceService } from '../src/plugins/voice-broadcast/voice-training-workspace';

const tempDirs: string[] = [];

async function waitForCondition(check: () => boolean, timeoutMs = 2000): Promise<void> {
  const started = Date.now();
  while (!check()) {
    if (Date.now() - started > timeoutMs) {
      throw new Error('waitForCondition timeout');
    }
    await new Promise((resolve) => setTimeout(resolve, 20));
  }
}

function makeTempRepo(): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'qqtalker-training-'));
  tempDirs.push(dir);
  fs.mkdirSync(path.join(dir, 'scripts', 'voice-training'), { recursive: true });
  fs.writeFileSync(
    path.join(dir, 'scripts', 'voice-training', 'sync-training-workspace.mjs'),
    'console.log("synced workspace");\n',
    'utf8'
  );
  return dir;
}

function ensureCharacter(repoRoot: string, characterId: string, options: { usableSegments?: number; totalSegments?: number } = {}) {
  const base = path.join(repoRoot, 'data', 'voice-models', 'training', characterId);
  fs.mkdirSync(path.join(base, 'raw'), { recursive: true });
  fs.mkdirSync(path.join(base, 'cleaned'), { recursive: true });
  fs.mkdirSync(path.join(base, 'segments'), { recursive: true });
  fs.mkdirSync(path.join(base, 'manifests'), { recursive: true });
  fs.mkdirSync(path.join(base, 'train'), { recursive: true });
  fs.writeFileSync(path.join(base, 'raw', 'source.wav'), 'raw');
  fs.writeFileSync(path.join(base, 'cleaned', 'clean.wav'), 'clean');
  fs.writeFileSync(path.join(base, 'segments', 'seg.wav'), 'segment');
  fs.writeFileSync(
    path.join(base, 'manifests', 'public-sources.json'),
    JSON.stringify({
      character: characterId === 'yongchutafi' ? '永雏塔菲' : characterId,
      strategy: '测试策略',
      sources: [{ id: 's1' }, { id: 's2' }],
    }),
    'utf8'
  );
  fs.writeFileSync(
    path.join(base, 'train', 'versions.json'),
    JSON.stringify({ versions: [{ id: 'v1' }] }),
    'utf8'
  );
  fs.writeFileSync(path.join(base, 'manifests', 'summary.md'), '# summary\n', 'utf8');
  fs.writeFileSync(
    path.join(base, 'manifests', 'training-manifest.json'),
    JSON.stringify({
      generatedAt: '2026-04-10T16:00:00.000Z',
      totalSegments: options.totalSegments ?? 12,
      usableSegments: options.usableSegments ?? 5,
    }),
    'utf8'
  );
}

afterEach(() => {
  for (const dir of tempDirs.splice(0, tempDirs.length)) {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

describe('VoiceTrainingWorkspaceService', () => {
  it('summarizes training workspace characters', () => {
    const repoRoot = makeTempRepo();
    ensureCharacter(repoRoot, 'yongchutafi', { totalSegments: 18, usableSegments: 8 });

    const service = new VoiceTrainingWorkspaceService(repoRoot);
    const overview = service.getOverview();

    expect(overview.characters).toHaveLength(1);
    expect(overview.characters[0]).toMatchObject({
      id: 'yongchutafi',
      name: '永雏塔菲',
      sourceCount: 2,
      versionCount: 1,
      totalSegments: 18,
      usableSegments: 8,
      rawFileCount: 1,
      cleanedFileCount: 1,
      segmentFileCount: 1,
      summaryReady: true,
      manifestReady: true,
      versionsReady: true,
    });
    expect(overview.scripts.length).toBeGreaterThan(0);
    expect(overview.recentTasks).toEqual([]);
  });

  it('runs sync script and refreshes overview', async () => {
    const repoRoot = makeTempRepo();
    ensureCharacter(repoRoot, 'dongxuelian', { totalSegments: 4, usableSegments: 2 });

    const service = new VoiceTrainingWorkspaceService(repoRoot);
    const result = await service.syncWorkspace();

    expect(result.output).toContain('synced workspace');
    expect(result.overview.characters[0]?.id).toBe('dongxuelian');
    expect(result.overview.recentTasks[0]?.action).toBe('sync');
    expect(result.overview.recentTasks[0]?.status).toBe('success');
  });

  it('returns character detail and can queue manifest action', async () => {
    const repoRoot = makeTempRepo();
    ensureCharacter(repoRoot, 'yongchutafi', { totalSegments: 9, usableSegments: 4 });
    fs.writeFileSync(
      path.join(repoRoot, 'scripts', 'voice-training', 'build-training-manifest.mjs'),
      'console.log("manifest rebuilt for", process.argv.slice(2).join(" "));\n',
      'utf8'
    );
    fs.writeFileSync(
      path.join(repoRoot, 'scripts', 'voice-training', 'suggest-training-clips.mjs'),
      'console.log("suggest ok");\n',
      'utf8'
    );
    fs.writeFileSync(
      path.join(repoRoot, 'scripts', 'voice-training', 'transcribe-training-clips.mjs'),
      'console.log("transcribe ok");\n',
      'utf8'
    );
    fs.writeFileSync(
      path.join(repoRoot, 'scripts', 'voice-training', 'run-ab-eval.mjs'),
      'console.log("eval ok");\n',
      'utf8'
    );

    const service = new VoiceTrainingWorkspaceService(repoRoot);
    const detail = service.getCharacterDetail('yongchutafi');
    const result = await service.runAction('manifest', 'yongchutafi');
    await waitForCondition(() => result.task.status === 'success');

    expect(detail?.id).toBe('yongchutafi');
    expect(Array.isArray(detail?.sourceItems)).toBe(true);
    expect(result.task.action).toBe('manifest');
    expect(['queued', 'running', 'success']).toContain(result.task.status);
    expect(result.task.status).toBe('success');
    expect(result.task.output).toContain('manifest rebuilt');
  });

  it('queues heavy tasks and exposes running plus queued state', async () => {
    const repoRoot = makeTempRepo();
    ensureCharacter(repoRoot, 'yongchutafi', { totalSegments: 9, usableSegments: 4 });
    fs.writeFileSync(
      path.join(repoRoot, 'scripts', 'voice-training', 'build-training-manifest.mjs'),
      'setTimeout(() => console.log("manifest queued done"), 80);\n',
      'utf8'
    );
    fs.writeFileSync(
      path.join(repoRoot, 'scripts', 'voice-training', 'transcribe-training-clips.mjs'),
      'setTimeout(() => console.log("transcribe queued done"), 80);\n',
      'utf8'
    );

    const service = new VoiceTrainingWorkspaceService(repoRoot);
    const first = await service.runAction('transcribe', 'yongchutafi');
    const second = await service.runAction('manifest', 'yongchutafi');
    const queuedOverview = service.getOverview();

    expect(['queued', 'running']).toContain(first.task.status);
    expect(second.task.status).toBe('queued');
    expect(queuedOverview.taskState.queuedTasks.length).toBeGreaterThanOrEqual(1);

    await waitForCondition(() => second.task.status === 'success', 4000);
    const finishedOverview = service.getOverview();

    expect(finishedOverview.taskState.runningTask).toBeNull();
    expect(finishedOverview.taskState.queuedTasks).toHaveLength(0);
    expect(second.task.output).toContain('manifest queued done');
  });

  it('imports raw assets from local path and persists recent tasks', async () => {
    const repoRoot = makeTempRepo();
    ensureCharacter(repoRoot, 'yongchutafi', { totalSegments: 3, usableSegments: 1 });
    const importSource = path.join(repoRoot, 'sample-source.wav');
    fs.writeFileSync(importSource, 'voice-data');

    const service = new VoiceTrainingWorkspaceService(repoRoot);
    const result = await service.runAction('import-raw', 'yongchutafi', { sourcePath: importSource });
    const detail = service.getCharacterDetail('yongchutafi');
    const taskHistory = JSON.parse(
      fs.readFileSync(path.join(repoRoot, 'data', 'voice-models', 'training', 'task-history.json'), 'utf8')
    );

    expect(result.task.action).toBe('import-raw');
    expect(result.task.status).toBe('success');
    expect(result.task.output).toContain('已导入 1 个原始素材');
    expect(detail?.rawFiles.some((item) => item.includes('sample-source.wav'))).toBe(true);
    expect(taskHistory.tasks[0].action).toBe('import-raw');
  });

  it('uploads raw asset from browser payload and persists recent tasks', async () => {
    const repoRoot = makeTempRepo();
    ensureCharacter(repoRoot, 'yongchutafi', { totalSegments: 3, usableSegments: 1 });

    const service = new VoiceTrainingWorkspaceService(repoRoot);
    const result = await service.runAction('upload-raw', 'yongchutafi', {
      fileName: 'browser-upload.wav',
      fileBase64: Buffer.from('voice-data-from-browser').toString('base64'),
    });
    const detail = service.getCharacterDetail('yongchutafi');
    const taskHistory = JSON.parse(
      fs.readFileSync(path.join(repoRoot, 'data', 'voice-models', 'training', 'task-history.json'), 'utf8')
    );

    expect(result.task.action).toBe('upload-raw');
    expect(result.task.status).toBe('success');
    expect(result.task.output).toContain('已上传原始素材');
    expect(detail?.rawFiles.some((item) => item.includes('browser-upload.wav'))).toBe(true);
    expect(taskHistory.tasks[0].action).toBe('upload-raw');
  });

  it('publishes gpt-sovits training version into model directory and catalog', async () => {
    const repoRoot = makeTempRepo();
    ensureCharacter(repoRoot, 'yongchutafi', { totalSegments: 3, usableSegments: 1 });
    const trainingDir = path.join(repoRoot, 'data', 'voice-models', 'training', 'yongchutafi');
    fs.writeFileSync(path.join(trainingDir, 'segments', 'ref.wav'), 'ref-audio');
    fs.writeFileSync(path.join(trainingDir, 'segments', 'aux-a.wav'), 'aux-audio');
    fs.writeFileSync(
      path.join(trainingDir, 'train', 'versions.json'),
      JSON.stringify({
        character: '永雏塔菲',
        versions: [
          {
            id: 'stable-gpt',
            backend: 'gpt-sovits',
            stage: 'stable',
            notes: '训练完成',
            artifacts: {
              refAudioPath: 'segments/ref.wav',
              auxPaths: ['segments/aux-a.wav'],
            },
          },
        ],
      }),
      'utf8'
    );

    const service = new VoiceTrainingWorkspaceService(repoRoot);
    const result = await service.runAction('publish-model', 'yongchutafi', { versionId: 'stable-gpt' });
    const voiceMeta = JSON.parse(
      fs.readFileSync(path.join(repoRoot, 'data', 'voice-models', 'yongchutafi', 'voice-model.json'), 'utf8')
    );
    const catalog = JSON.parse(
      fs.readFileSync(path.join(repoRoot, 'data', 'voice-models', 'catalog.json'), 'utf8')
    );

    expect(result.task.status).toBe('success');
    expect(result.task.output).toContain('已发布模型 preset-yongchutafi');
    expect(voiceMeta.id).toBe('preset-yongchutafi');
    expect(voiceMeta.refAudioPath).toBe('./reference.wav');
    expect(catalog.models.some((item: any) => item.id === 'preset-yongchutafi')).toBe(true);
  });

  it('publishes rvc training version into model directory and catalog', async () => {
    const repoRoot = makeTempRepo();
    ensureCharacter(repoRoot, 'yongchutafi', { totalSegments: 3, usableSegments: 1 });
    const trainingDir = path.join(repoRoot, 'data', 'voice-models', 'training', 'yongchutafi');
    fs.mkdirSync(path.join(trainingDir, 'train', 'rvc', 'exp-rvc'), { recursive: true });
    fs.writeFileSync(path.join(trainingDir, 'train', 'rvc', 'exp-rvc', 'model.pth'), 'rvc-model');
    fs.writeFileSync(path.join(trainingDir, 'train', 'rvc', 'exp-rvc', 'added.index'), 'rvc-index');
    fs.writeFileSync(
      path.join(trainingDir, 'train', 'versions.json'),
      JSON.stringify({
        character: '永雏塔菲',
        versions: [
          {
            id: 'exp-rvc',
            backend: 'rvc-compat',
            stage: 'experimental',
            artifacts: {
              modelPath: 'train/rvc/exp-rvc/model.pth',
              indexPath: 'train/rvc/exp-rvc/added.index',
            },
          },
        ],
      }),
      'utf8'
    );

    const service = new VoiceTrainingWorkspaceService(repoRoot);
    const result = await service.runAction('publish-model', 'yongchutafi', { versionId: 'exp-rvc' });
    const voiceMeta = JSON.parse(
      fs.readFileSync(path.join(repoRoot, 'data', 'voice-models', 'yongchutafi', 'rvc', 'voice-model.json'), 'utf8')
    );

    expect(result.task.status).toBe('success');
    expect(result.task.output).toContain('preset-yongchutafi-rvc');
    expect(voiceMeta.id).toBe('preset-yongchutafi-rvc');
    expect(voiceMeta.modelPath).toBe('./model.pth');
  });

  it('rolls back published model to previous catalog and voice metadata', async () => {
    const repoRoot = makeTempRepo();
    ensureCharacter(repoRoot, 'yongchutafi', { totalSegments: 3, usableSegments: 1 });
    const trainingDir = path.join(repoRoot, 'data', 'voice-models', 'training', 'yongchutafi');
    const modelDir = path.join(repoRoot, 'data', 'voice-models', 'yongchutafi');
    fs.mkdirSync(modelDir, { recursive: true });
    fs.writeFileSync(path.join(modelDir, 'reference.wav'), 'old-ref');
    fs.writeFileSync(
      path.join(modelDir, 'voice-model.json'),
      JSON.stringify({
        id: 'preset-yongchutafi',
        name: '旧塔菲',
        character: '永雏塔菲',
        backend: 'gpt-sovits',
        refAudioPath: './reference.wav',
        enabled: true,
      }),
      'utf8'
    );
    fs.writeFileSync(
      path.join(repoRoot, 'data', 'voice-models', 'catalog.json'),
      JSON.stringify({
        models: [
          {
            id: 'preset-yongchutafi',
            name: '旧塔菲',
            character: '永雏塔菲',
            backend: 'gpt-sovits',
            refAudioPath: './yongchutafi/reference.wav',
          },
        ],
      }),
      'utf8'
    );
    fs.writeFileSync(path.join(trainingDir, 'segments', 'ref-new.wav'), 'new-ref');
    fs.writeFileSync(
      path.join(trainingDir, 'train', 'versions.json'),
      JSON.stringify({
        versions: [
          {
            id: 'stable-gpt',
            backend: 'gpt-sovits',
            stage: 'stable',
            artifacts: {
              refAudioPath: 'segments/ref-new.wav',
            },
          },
        ],
      }),
      'utf8'
    );

    const service = new VoiceTrainingWorkspaceService(repoRoot);
    const publish = await service.runAction('publish-model', 'yongchutafi', { versionId: 'stable-gpt' });
    const detailAfterPublish = service.getCharacterDetail('yongchutafi');
    const releaseId = detailAfterPublish?.releaseHistory[0]?.releaseId;
    expect(releaseId).toBeTruthy();

    const rollback = await service.runAction('rollback-model', 'yongchutafi', { releaseId });
    const voiceMeta = JSON.parse(
      fs.readFileSync(path.join(modelDir, 'voice-model.json'), 'utf8')
    );
    const catalog = JSON.parse(
      fs.readFileSync(path.join(repoRoot, 'data', 'voice-models', 'catalog.json'), 'utf8')
    );
    const detailAfterRollback = service.getCharacterDetail('yongchutafi');

    expect(publish.task.status).toBe('success');
    expect(rollback.task.status).toBe('success');
    expect(voiceMeta.name).toBe('旧塔菲');
    expect(catalog.models[0].name).toBe('旧塔菲');
    expect(detailAfterRollback?.releaseHistory[0].rolledBackAt).toBeTruthy();
  });

  it('saves browser review edits back to manifest and transcripts', () => {
    const repoRoot = makeTempRepo();
    ensureCharacter(repoRoot, 'yongchutafi', { totalSegments: 3, usableSegments: 1 });
    const trainingDir = path.join(repoRoot, 'data', 'voice-models', 'training', 'yongchutafi');
    fs.writeFileSync(
      path.join(trainingDir, 'manifests', 'training-manifest.json'),
      JSON.stringify({
        entries: [
          {
            id: 'entry-1',
            transcript: '旧文本',
            reviewStatus: 'pending-review',
            usableForTrain: false,
            notes: '旧备注',
          },
        ],
      }),
      'utf8'
    );
    fs.writeFileSync(
      path.join(trainingDir, 'manifests', 'transcripts.generated.json'),
      JSON.stringify({
        segments: [
          {
            id: 'entry-1',
            transcript: '旧文本',
            transcriptClean: '旧文本',
            notes: '旧备注',
          },
        ],
      }),
      'utf8'
    );

    const service = new VoiceTrainingWorkspaceService(repoRoot);
    const detail = service.updateReviewEntry('yongchutafi', 'entry-1', {
      transcript: '新文本',
      reviewStatus: 'approved',
      usableForTrain: true,
      notes: '新备注',
      transcriptionStatus: 'cleaned',
    });
    const manifest = JSON.parse(
      fs.readFileSync(path.join(trainingDir, 'manifests', 'training-manifest.json'), 'utf8')
    );
    const transcripts = JSON.parse(
      fs.readFileSync(path.join(trainingDir, 'manifests', 'transcripts.generated.json'), 'utf8')
    );

    expect(detail?.reviewEntries[0].transcript).toBe('新文本');
    expect(manifest.entries[0].reviewStatus).toBe('approved');
    expect(manifest.entries[0].usableForTrain).toBe(true);
    expect(transcripts.segments[0].transcriptClean).toBe('新文本');
  });

  it('supports chunked browser upload for larger files', () => {
    const repoRoot = makeTempRepo();
    ensureCharacter(repoRoot, 'yongchutafi', { totalSegments: 3, usableSegments: 1 });
    const service = new VoiceTrainingWorkspaceService(repoRoot);
    const base64A = Buffer.from('hello-').toString('base64');
    const base64B = Buffer.from('world').toString('base64');

    const first = service.appendUploadChunk('yongchutafi', 'upload-1', 'chunked.wav', base64A, false);
    const second = service.appendUploadChunk('yongchutafi', 'upload-1', 'chunked.wav', base64B, true);
    const rawPath = path.join(repoRoot, 'data', 'voice-models', 'training', 'yongchutafi', 'raw', 'chunked.wav');

    expect(first.completed).toBe(false);
    expect(second.completed).toBe(true);
    expect(fs.readFileSync(rawPath, 'utf8')).toBe('hello-world');
  });
});
