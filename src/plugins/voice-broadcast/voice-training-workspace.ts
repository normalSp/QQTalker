import fs from 'fs';
import path from 'path';
import { execFile } from 'child_process';
import type { VoiceModelEntry } from './types';

export type VoiceTrainingCharacterSummary = {
  id: string;
  name: string;
  strategy?: string;
  sourceCount: number;
  versionCount: number;
  totalSegments: number;
  usableSegments: number;
  rawFileCount: number;
  cleanedFileCount: number;
  segmentFileCount: number;
  summaryReady: boolean;
  manifestReady: boolean;
  versionsReady: boolean;
  lastGeneratedAt?: string;
};

export type VoiceTrainingScriptMeta = {
  id: string;
  label: string;
  command: string;
  description: string;
};

export type VoiceTrainingOverview = {
  repoRoot: string;
  trainingRoot: string;
  characters: VoiceTrainingCharacterSummary[];
  scripts: VoiceTrainingScriptMeta[];
  recentTasks: VoiceTrainingTaskRecord[];
  taskState: VoiceTrainingTaskState;
};

export type VoiceTrainingTaskAction =
  | 'sync'
  | 'clips-suggest'
  | 'transcribe'
  | 'manifest'
  | 'eval'
  | 'import-raw'
  | 'upload-raw'
  | 'publish-model'
  | 'rollback-model';

export type VoiceTrainingTaskRecord = {
  id: string;
  action: VoiceTrainingTaskAction;
  characterId?: string;
  status: 'queued' | 'running' | 'success' | 'failed';
  command: string;
  queuedAt: string;
  startedAt?: string;
  finishedAt?: string;
  output?: string;
  error?: string;
  meta?: Record<string, unknown>;
};

export type VoiceTrainingTaskState = {
  runningTask: VoiceTrainingTaskRecord | null;
  queuedTasks: VoiceTrainingTaskRecord[];
};

export type VoiceTrainingReleaseRecord = {
  releaseId: string;
  versionId: string;
  backend: string;
  modelId: string;
  targetDir: string;
  publishedAt: string;
  backupDir?: string;
  previousCatalogEntry?: VoiceModelEntry | null;
  previousActiveVersionId?: string;
  rolledBackAt?: string;
};

export type VoiceTrainingCharacterDetail = VoiceTrainingCharacterSummary & {
  spaceUrl?: string;
  liveRoomUrl?: string;
  sourceItems: Array<Record<string, unknown>>;
  versionItems: Array<Record<string, unknown>>;
  manifestEntries: Array<Record<string, unknown>>;
  reviewEntries: Array<Record<string, unknown>>;
  rawFiles: string[];
  releaseHistory: VoiceTrainingReleaseRecord[];
};

type PublicSourceManifest = {
  character?: string;
  strategy?: string;
  sources?: Array<unknown>;
};

type TrainingVersionEntry = {
  id?: string;
  stage?: string;
  backend?: string;
  datasetTag?: string;
  notes?: string;
  publish?: Partial<VoiceModelEntry> & {
    slot?: string;
    targetSubdir?: string;
    active?: boolean;
    releaseId?: string;
    publishedAt?: string;
  };
  artifacts?: {
    modelPath?: string;
    refAudioPath?: string;
    auxPaths?: string[];
    indexPath?: string;
  };
};

type VersionsManifest = {
  versions?: Array<TrainingVersionEntry>;
};

type TrainingManifest = {
  generatedAt?: string;
  totalSegments?: number;
  usableSegments?: number;
};

const TRAINING_SCRIPT_META: VoiceTrainingScriptMeta[] = [
  {
    id: 'voice-training-sync',
    label: '同步训练工作区摘要',
    command: 'npm run voice:training:sync',
    description: '检查角色目录结构，并更新 manifests/summary.md 摘要。',
  },
  {
    id: 'voice-clips-suggest',
    label: '建议切片候选',
    command: 'npm run voice:clips:suggest -- --character=<id>',
    description: '基于 silencedetect 生成 5~9 秒候选语音切片。',
  },
  {
    id: 'voice-transcribe',
    label: '批量转写切片',
    command: 'npm run voice:transcribe -- --character=<id>',
    description: '调用当前 STT 配置给训练切片生成 transcript 草稿。',
  },
  {
    id: 'voice-manifest',
    label: '生成训练清单',
    command: 'npm run voice:manifest -- --character=<id>',
    description: '把转写草稿整理为 training-manifest 与 dataset.tsv。',
  },
  {
    id: 'voice-eval',
    label: '运行试听评测',
    command: 'npm run voice:eval',
    description: '对已接入的语音模型生成试听评测结果与报告。',
  },
];

function readJsonIfExists<T>(filePath: string): T | null {
  if (!fs.existsSync(filePath)) return null;
  return JSON.parse(fs.readFileSync(filePath, 'utf8')) as T;
}

function countFilesRecursive(dirPath: string): number {
  if (!fs.existsSync(dirPath)) return 0;
  let count = 0;
  const entries = fs.readdirSync(dirPath, { withFileTypes: true });
  for (const entry of entries) {
    const fullPath = path.join(dirPath, entry.name);
    if (entry.isDirectory()) {
      count += countFilesRecursive(fullPath);
    } else {
      count += 1;
    }
  }
  return count;
}

function isWorkspaceCharacterDir(trainingRoot: string, entryName: string): boolean {
  if (entryName === 'eval-results') return false;
  const candidate = path.join(trainingRoot, entryName);
  return fs.existsSync(path.join(candidate, 'manifests')) || fs.existsSync(path.join(candidate, 'train'));
}

export class VoiceTrainingWorkspaceService {
  readonly repoRoot: string;
  readonly trainingRoot: string;
  readonly syncScriptPath: string;
  readonly tasksFilePath: string;
  readonly releasesRoot: string;
  readonly uploadChunksRoot: string;
  private readonly scriptPaths: Record<Exclude<VoiceTrainingTaskAction, 'sync'>, string>;
  private readonly recentTasks: VoiceTrainingTaskRecord[];
  private readonly taskQueue: VoiceTrainingTaskRecord[] = [];
  private runningTask: VoiceTrainingTaskRecord | null = null;

  constructor(repoRoot: string, trainingRoot?: string) {
    this.repoRoot = repoRoot;
    this.trainingRoot = trainingRoot || path.join(repoRoot, 'data', 'voice-models', 'training');
    this.syncScriptPath = path.join(repoRoot, 'scripts', 'voice-training', 'sync-training-workspace.mjs');
    this.tasksFilePath = path.join(this.trainingRoot, 'task-history.json');
    this.releasesRoot = path.join(this.trainingRoot, '.releases');
    this.uploadChunksRoot = path.join(this.trainingRoot, '.uploads');
    this.scriptPaths = {
      'clips-suggest': path.join(repoRoot, 'scripts', 'voice-training', 'suggest-training-clips.mjs'),
      transcribe: path.join(repoRoot, 'scripts', 'voice-training', 'transcribe-training-clips.mjs'),
      manifest: path.join(repoRoot, 'scripts', 'voice-training', 'build-training-manifest.mjs'),
      eval: path.join(repoRoot, 'scripts', 'voice-training', 'run-ab-eval.mjs'),
      'import-raw': '',
      'upload-raw': '',
      'publish-model': '',
      'rollback-model': '',
    };
    this.recentTasks = this.loadTaskHistory();
  }

  getOverview(): VoiceTrainingOverview {
    return {
      repoRoot: this.repoRoot,
      trainingRoot: this.trainingRoot,
      characters: this.listCharacters(),
      scripts: [...TRAINING_SCRIPT_META],
      recentTasks: this.recentTasks.slice(0, 8),
      taskState: this.getTaskState(),
    };
  }

  getTaskState(): VoiceTrainingTaskState {
    return {
      runningTask: this.runningTask ? { ...this.runningTask } : null,
      queuedTasks: this.taskQueue.map((task) => ({ ...task })),
    };
  }

  getCharacterDetail(characterId: string): VoiceTrainingCharacterDetail | null {
    const summary = this.buildCharacterSummary(characterId);
    const baseDir = path.join(this.trainingRoot, characterId);
    if (!fs.existsSync(baseDir)) return null;

    const publicSources = readJsonIfExists<PublicSourceManifest>(path.join(baseDir, 'manifests', 'public-sources.json'));
    const versions = readJsonIfExists<VersionsManifest>(path.join(baseDir, 'train', 'versions.json'));
    const trainingManifest = readJsonIfExists<{ entries?: Array<Record<string, unknown>> }>(
      path.join(baseDir, 'manifests', 'training-manifest.json')
    );

    return {
      ...summary,
      spaceUrl: typeof (publicSources as any)?.spaceUrl === 'string' ? (publicSources as any).spaceUrl : undefined,
      liveRoomUrl: typeof (publicSources as any)?.liveRoomUrl === 'string' ? (publicSources as any).liveRoomUrl : undefined,
      sourceItems: Array.isArray(publicSources?.sources) ? publicSources.sources.slice(0, 20) as Array<Record<string, unknown>> : [],
      versionItems: Array.isArray(versions?.versions) ? versions.versions.slice(0, 20) as Array<Record<string, unknown>> : [],
      manifestEntries: Array.isArray(trainingManifest?.entries)
        ? trainingManifest.entries.slice(0, 20)
        : [],
      reviewEntries: Array.isArray(trainingManifest?.entries)
        ? trainingManifest.entries.slice(0, 30)
        : [],
      rawFiles: this.listRelativeFiles(path.join(baseDir, 'raw')).slice(0, 40),
      releaseHistory: this.loadReleaseHistory(characterId).slice(0, 12),
    };
  }

  updateReviewEntry(
    characterId: string,
    entryId: string,
    updates: {
      transcript?: string;
      reviewStatus?: string;
      usableForTrain?: boolean;
      notes?: string;
      reviewer?: string;
      transcriptionStatus?: string;
    }
  ): VoiceTrainingCharacterDetail | null {
    const baseDir = path.join(this.trainingRoot, characterId);
    const manifestPath = path.join(baseDir, 'manifests', 'training-manifest.json');
    const transcriptsPath = path.join(baseDir, 'manifests', 'transcripts.generated.json');
    const manifest = readJsonIfExists<{ entries?: Array<Record<string, unknown>> }>(manifestPath) || { entries: [] };
    const transcripts = readJsonIfExists<{ segments?: Array<Record<string, unknown>> }>(transcriptsPath) || { segments: [] };
    const nextTranscript = typeof updates.transcript === 'string' ? updates.transcript.trim() : undefined;

    manifest.entries = Array.isArray(manifest.entries) ? manifest.entries : [];
    let found = false;
    manifest.entries = manifest.entries.map((entry) => {
      if (entry.id !== entryId) return entry;
      found = true;
      return {
        ...entry,
        ...(nextTranscript !== undefined ? { transcript: nextTranscript } : {}),
        ...(updates.reviewStatus !== undefined ? { reviewStatus: updates.reviewStatus } : {}),
        ...(updates.usableForTrain !== undefined ? { usableForTrain: updates.usableForTrain } : {}),
        ...(updates.notes !== undefined ? { notes: updates.notes } : {}),
        ...(updates.reviewer !== undefined ? { reviewer: updates.reviewer } : {}),
        ...(updates.transcriptionStatus !== undefined ? { transcriptionStatus: updates.transcriptionStatus } : {}),
      };
    });
    if (!found) {
      throw new Error(`未找到训练条目: ${entryId}`);
    }
    fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, 2) + '\n', 'utf8');

    transcripts.segments = Array.isArray(transcripts.segments) ? transcripts.segments : [];
    transcripts.segments = transcripts.segments.map((entry) => {
      if (entry.id !== entryId) return entry;
      return {
        ...entry,
        ...(nextTranscript !== undefined ? { transcript: nextTranscript, transcriptClean: nextTranscript } : {}),
        ...(updates.notes !== undefined ? { notes: updates.notes } : {}),
        ...(updates.transcriptionStatus !== undefined ? { transcriptionStatus: updates.transcriptionStatus } : {}),
      };
    });
    fs.writeFileSync(transcriptsPath, JSON.stringify(transcripts, null, 2) + '\n', 'utf8');
    return this.getCharacterDetail(characterId);
  }

  appendUploadChunk(
    characterId: string,
    uploadId: string,
    fileName: string,
    fileBase64Chunk: string,
    finalize = false
  ): { detail: VoiceTrainingCharacterDetail | null; output: string; completed: boolean } {
    if (!characterId || !uploadId || !fileName || !fileBase64Chunk) {
      throw new Error('分片上传缺少必要参数');
    }
    const uploadDir = path.join(this.uploadChunksRoot, characterId, uploadId);
    fs.mkdirSync(uploadDir, { recursive: true });
    const chunkPath = path.join(uploadDir, 'upload.bin');
    fs.appendFileSync(chunkPath, Buffer.from(fileBase64Chunk, 'base64'));
    if (!finalize) {
      return {
        detail: this.getCharacterDetail(characterId),
        output: `分片已接收: ${fileName}`,
        completed: false,
      };
    }
    const rawDir = path.join(this.trainingRoot, characterId, 'raw');
    fs.mkdirSync(rawDir, { recursive: true });
    const safeName = path.basename(fileName);
    const ext = path.extname(safeName).toLowerCase();
    const finalPath = path.join(rawDir, safeName);
    const targetPath = fs.existsSync(finalPath)
      ? path.join(rawDir, `${path.basename(safeName, ext)}-${Date.now()}${ext}`)
      : finalPath;
    fs.copyFileSync(chunkPath, targetPath);
    fs.rmSync(uploadDir, { recursive: true, force: true });
    const task: VoiceTrainingTaskRecord = {
      id: `upload-raw-${Date.now()}`,
      action: 'upload-raw',
      characterId,
      status: 'success',
      command: `upload-raw-chunk ${characterId} <= ${safeName}`,
      queuedAt: new Date().toISOString(),
      startedAt: new Date().toISOString(),
      finishedAt: new Date().toISOString(),
      output: `已分片上传原始素材到 ${path.relative(this.repoRoot, targetPath)}`,
    };
    this.recordTask(task);
    return {
      detail: this.getCharacterDetail(characterId),
      output: task.output || '',
      completed: true,
    };
  }

  async syncWorkspace(): Promise<{ output: string; overview: VoiceTrainingOverview }> {
    const task = await this.runTaskImmediately('sync');
    const output = task.output || '';

    return {
      output,
      overview: this.getOverview(),
    };
  }

  async runAction(
    action: VoiceTrainingTaskAction,
    characterId?: string,
    options: Record<string, unknown> = {}
  ): Promise<{ task: VoiceTrainingTaskRecord; overview: VoiceTrainingOverview; detail?: VoiceTrainingCharacterDetail | null }> {
    const task = this.shouldQueueAction(action)
      ? this.enqueueTask(action, characterId, options)
      : await this.runTaskImmediately(action, characterId, options);
    return {
      task,
      overview: this.getOverview(),
      detail: characterId ? this.getCharacterDetail(characterId) : null,
    };
  }

  private listCharacters(): VoiceTrainingCharacterSummary[] {
    if (!fs.existsSync(this.trainingRoot)) return [];
    return fs.readdirSync(this.trainingRoot, { withFileTypes: true })
      .filter((entry) => entry.isDirectory() && isWorkspaceCharacterDir(this.trainingRoot, entry.name))
      .map((entry) => this.buildCharacterSummary(entry.name))
      .sort((a, b) => a.name.localeCompare(b.name, 'zh-CN'));
  }

  private buildCharacterSummary(characterId: string): VoiceTrainingCharacterSummary {
    const baseDir = path.join(this.trainingRoot, characterId);
    if (!fs.existsSync(baseDir)) {
      return {
        id: characterId,
        name: characterId,
        sourceCount: 0,
        versionCount: 0,
        totalSegments: 0,
        usableSegments: 0,
        rawFileCount: 0,
        cleanedFileCount: 0,
        segmentFileCount: 0,
        summaryReady: false,
        manifestReady: false,
        versionsReady: false,
      };
    }
    const publicSources = readJsonIfExists<PublicSourceManifest>(path.join(baseDir, 'manifests', 'public-sources.json'));
    const versions = readJsonIfExists<VersionsManifest>(path.join(baseDir, 'train', 'versions.json'));
    const trainingManifest = readJsonIfExists<TrainingManifest>(path.join(baseDir, 'manifests', 'training-manifest.json'));

    return {
      id: characterId,
      name: publicSources?.character || characterId,
      strategy: publicSources?.strategy,
      sourceCount: Array.isArray(publicSources?.sources) ? publicSources!.sources!.length : 0,
      versionCount: Array.isArray(versions?.versions) ? versions!.versions!.length : 0,
      totalSegments: Number(trainingManifest?.totalSegments || 0),
      usableSegments: Number(trainingManifest?.usableSegments || 0),
      rawFileCount: countFilesRecursive(path.join(baseDir, 'raw')),
      cleanedFileCount: countFilesRecursive(path.join(baseDir, 'cleaned')),
      segmentFileCount: countFilesRecursive(path.join(baseDir, 'segments')),
      summaryReady: fs.existsSync(path.join(baseDir, 'manifests', 'summary.md')),
      manifestReady: fs.existsSync(path.join(baseDir, 'manifests', 'training-manifest.json')),
      versionsReady: fs.existsSync(path.join(baseDir, 'train', 'versions.json')),
      lastGeneratedAt: trainingManifest?.generatedAt,
    };
  }

  private shouldQueueAction(action: VoiceTrainingTaskAction): boolean {
    return action === 'clips-suggest' || action === 'transcribe' || action === 'manifest' || action === 'eval';
  }

  private createTask(
    action: VoiceTrainingTaskAction,
    characterId?: string,
    options: Record<string, unknown> = {}
  ): VoiceTrainingTaskRecord {
    const { command } = this.resolveTaskCommand(action, characterId, options);
    return {
      id: `${action}-${Date.now()}`,
      action,
      characterId,
      status: 'queued',
      command,
      queuedAt: new Date().toISOString(),
      meta: Object.keys(options).length ? options : undefined,
    };
  }

  private enqueueTask(
    action: VoiceTrainingTaskAction,
    characterId?: string,
    options: Record<string, unknown> = {}
  ): VoiceTrainingTaskRecord {
    const task = this.createTask(action, characterId, options);
    this.taskQueue.push(task);
    this.recordTask(task);
    void this.processTaskQueue();
    return task;
  }

  private async runTaskImmediately(
    action: VoiceTrainingTaskAction,
    characterId?: string,
    options: Record<string, unknown> = {}
  ): Promise<VoiceTrainingTaskRecord> {
    if (this.runningTask) {
      throw new Error(`已有训练任务正在执行: ${this.runningTask.action}`);
    }
    const task = this.createTask(action, characterId, options);
    task.status = 'running';
    task.startedAt = new Date().toISOString();
    this.runningTask = task;
    this.recordTask(task);

    try {
      const output = await this.executeTask(task);
      task.status = 'success';
      task.output = output;
      task.finishedAt = new Date().toISOString();
      this.persistTaskHistory();
      return task;
    } catch (error) {
      task.status = 'failed';
      task.error = error instanceof Error ? error.message : String(error);
      task.finishedAt = new Date().toISOString();
      this.persistTaskHistory();
      throw error;
    } finally {
      this.runningTask = null;
    }
  }

  private async processTaskQueue(): Promise<void> {
    if (this.runningTask || this.taskQueue.length === 0) {
      return;
    }
    const task = this.taskQueue.shift();
    if (!task) return;
    this.runningTask = task;
    task.status = 'running';
    task.startedAt = new Date().toISOString();
    this.persistTaskHistory();
    try {
      const output = await this.executeTask(task);
      task.status = 'success';
      task.output = output;
      task.finishedAt = new Date().toISOString();
    } catch (error) {
      task.status = 'failed';
      task.error = error instanceof Error ? error.message : String(error);
      task.finishedAt = new Date().toISOString();
    } finally {
      this.runningTask = null;
      this.persistTaskHistory();
      if (this.taskQueue.length > 0) {
        void this.processTaskQueue();
      }
    }
  }

  private async executeTask(task: VoiceTrainingTaskRecord): Promise<string> {
    const options = task.meta || {};
    const action = task.action;
    const characterId = task.characterId;
    const { scriptPath, args } = this.resolveTaskCommand(action, characterId, options);
    if (action === 'import-raw') {
      return this.importRawAssets(characterId || '', options);
    }
    if (action === 'upload-raw') {
      return this.uploadRawAsset(characterId || '', options);
    }
    if (action === 'publish-model') {
      return this.publishModel(characterId || '', options);
    }
    if (action === 'rollback-model') {
      return this.rollbackPublishedModel(characterId || '', options);
    }
    return await new Promise<string>((resolve, reject) => {
      execFile(process.execPath, [scriptPath, ...args], { cwd: this.repoRoot }, (error, stdout, stderr) => {
        const combined = [stdout, stderr].filter(Boolean).join('\n').trim();
        if (error) {
          reject(new Error(combined || error.message));
          return;
        }
        resolve(combined);
      });
    });
  }

  private resolveTaskCommand(action: VoiceTrainingTaskAction, characterId?: string, options: Record<string, unknown> = {}): {
    scriptPath: string;
    args: string[];
    command: string;
  } {
    if (action === 'sync') {
      return {
        scriptPath: this.syncScriptPath,
        args: [],
        command: `node ${path.relative(this.repoRoot, this.syncScriptPath).replace(/\\/g, '/')}`,
      };
    }
    if (action === 'import-raw') {
      const sourcePath = String(options.sourcePath || '').trim();
      if (!characterId) {
        throw new Error('任务 import-raw 需要 characterId');
      }
      if (!sourcePath) {
        throw new Error('任务 import-raw 需要 sourcePath');
      }
      return {
        scriptPath: '',
        args: [],
        command: `import-raw ${characterId} <= ${sourcePath}`,
      };
    }
    if (action === 'upload-raw') {
      const fileName = String(options.fileName || '').trim();
      if (!characterId) {
        throw new Error('任务 upload-raw 需要 characterId');
      }
      if (!fileName || !String(options.fileBase64 || '').trim()) {
        throw new Error('任务 upload-raw 需要 fileName 与 fileBase64');
      }
      return {
        scriptPath: '',
        args: [],
        command: `upload-raw ${characterId} <= ${fileName}`,
      };
    }
    if (action === 'publish-model') {
      const versionId = String(options.versionId || '').trim();
      if (!characterId) {
        throw new Error('任务 publish-model 需要 characterId');
      }
      if (!versionId) {
        throw new Error('任务 publish-model 需要 versionId');
      }
      return {
        scriptPath: '',
        args: [],
        command: `publish-model ${characterId}#${versionId}`,
      };
    }
    if (action === 'rollback-model') {
      const releaseId = String(options.releaseId || '').trim();
      if (!characterId) {
        throw new Error('任务 rollback-model 需要 characterId');
      }
      if (!releaseId) {
        throw new Error('任务 rollback-model 需要 releaseId');
      }
      return {
        scriptPath: '',
        args: [],
        command: `rollback-model ${characterId}#${releaseId}`,
      };
    }

    const scriptPath = this.scriptPaths[action];
    if (!scriptPath) {
      throw new Error(`未知训练任务: ${action}`);
    }
    const args =
      action === 'eval'
        ? []
        : characterId
          ? [`--character=${characterId}`]
          : [];
    if (action !== 'eval' && !characterId) {
      throw new Error(`任务 ${action} 需要 characterId`);
    }
    return {
      scriptPath,
      args,
      command: `node ${path.relative(this.repoRoot, scriptPath).replace(/\\/g, '/')} ${args.join(' ')}`.trim(),
    };
  }

  private importRawAssets(characterId: string, options: Record<string, unknown>): string {
    const sourcePath = path.resolve(this.repoRoot, String(options.sourcePath || ''));
    if (!fs.existsSync(sourcePath)) {
      throw new Error(`导入源不存在: ${sourcePath}`);
    }
    const rawDir = path.join(this.trainingRoot, characterId, 'raw');
    fs.mkdirSync(rawDir, { recursive: true });
    const imported: string[] = [];
    const mediaExtensions = new Set(['.wav', '.mp3', '.m4a', '.flac', '.aac', '.ogg', '.mp4', '.mkv', '.webm']);

    const importFile = (filePath: string) => {
      const ext = path.extname(filePath).toLowerCase();
      if (!mediaExtensions.has(ext)) return;
      const targetBase = path.basename(filePath);
      let targetPath = path.join(rawDir, targetBase);
      if (fs.existsSync(targetPath)) {
        const uniqueName = `${path.basename(targetBase, ext)}-${Date.now()}${ext}`;
        targetPath = path.join(rawDir, uniqueName);
      }
      fs.copyFileSync(filePath, targetPath);
      imported.push(path.basename(targetPath));
    };

    const walkDir = (dirPath: string) => {
      const entries = fs.readdirSync(dirPath, { withFileTypes: true });
      for (const entry of entries) {
        const fullPath = path.join(dirPath, entry.name);
        if (entry.isDirectory()) {
          walkDir(fullPath);
        } else {
          importFile(fullPath);
        }
      }
    };

    const stat = fs.statSync(sourcePath);
    if (stat.isDirectory()) {
      walkDir(sourcePath);
    } else {
      importFile(sourcePath);
    }
    if (!imported.length) {
      throw new Error('未找到可导入的音频或视频文件');
    }
    return `已导入 ${imported.length} 个原始素材到 ${path.relative(this.repoRoot, rawDir)}: ${imported.join(', ')}`;
  }

  private uploadRawAsset(characterId: string, options: Record<string, unknown>): string {
    const fileName = path.basename(String(options.fileName || '').trim());
    const fileBase64 = String(options.fileBase64 || '').trim();
    if (!fileName || !fileBase64) {
      throw new Error('上传素材缺少 fileName 或 fileBase64');
    }
    const ext = path.extname(fileName).toLowerCase();
    const mediaExtensions = new Set(['.wav', '.mp3', '.m4a', '.flac', '.aac', '.ogg', '.mp4', '.mkv', '.webm']);
    if (!mediaExtensions.has(ext)) {
      throw new Error(`不支持的素材格式: ${ext || 'unknown'}`);
    }
    const buffer = Buffer.from(fileBase64, 'base64');
    if (!buffer.length) {
      throw new Error('上传素材为空');
    }
    const maxBytes = 25 * 1024 * 1024;
    if (buffer.length > maxBytes) {
      throw new Error(`上传素材过大，当前限制 ${(maxBytes / 1024 / 1024).toFixed(0)}MB`);
    }
    const rawDir = path.join(this.trainingRoot, characterId, 'raw');
    fs.mkdirSync(rawDir, { recursive: true });
    let targetPath = path.join(rawDir, fileName);
    if (fs.existsSync(targetPath)) {
      const uniqueName = `${path.basename(fileName, ext)}-${Date.now()}${ext}`;
      targetPath = path.join(rawDir, uniqueName);
    }
    fs.writeFileSync(targetPath, buffer);
    return `已上传原始素材到 ${path.relative(this.repoRoot, targetPath)}`;
  }

  private publishModel(characterId: string, options: Record<string, unknown>): string {
    const versionId = String(options.versionId || '').trim();
    if (!versionId) {
      throw new Error('发布模型缺少 versionId');
    }
    const characterDir = path.join(this.trainingRoot, characterId);
    const versions = readJsonIfExists<VersionsManifest>(path.join(characterDir, 'train', 'versions.json'));
    const version = (versions?.versions || []).find((item) => item && item.id === versionId);
    if (!version) {
      throw new Error(`未找到训练版本: ${versionId}`);
    }
    const publicSources = readJsonIfExists<PublicSourceManifest>(path.join(characterDir, 'manifests', 'public-sources.json'));
    const characterName = publicSources?.character || characterId;
    const backend = String(version.publish?.backend || version.backend || '').trim();
    if (!backend) {
      throw new Error(`训练版本 ${versionId} 缺少 backend`);
    }

    const modelRoot = path.join(this.repoRoot, 'data', 'voice-models');
    const published =
      backend === 'rvc-compat'
        ? this.publishRvcModel(modelRoot, characterId, characterName, versionId, version)
        : this.publishGptModel(modelRoot, characterId, characterName, versionId, version);
    const previousCatalogEntry = this.getCatalogEntry(modelRoot, published.catalogEntry.id);
    this.upsertCatalogEntry(modelRoot, published.catalogEntry);
    const releaseId = `${versionId}-${Date.now()}`;
    const publishedAt = new Date().toISOString();
    const previousActiveVersionId = this.getActivePublishedVersionId(characterDir);
    this.writeVersionPublishBackfill(characterDir, versionId, published.catalogEntry, {
      releaseId,
      publishedAt,
    });
    this.appendReleaseHistory(characterId, {
      releaseId,
      versionId,
      backend,
      modelId: published.catalogEntry.id,
      targetDir: path.relative(this.repoRoot, published.targetDir).replace(/\\/g, '/'),
      publishedAt,
      backupDir: published.backupDir
        ? path.relative(this.repoRoot, published.backupDir).replace(/\\/g, '/')
        : undefined,
      previousCatalogEntry,
      previousActiveVersionId,
    });
    return `已发布模型 ${published.catalogEntry.id} 到 ${path.relative(this.repoRoot, published.targetDir)}`;
  }

  private rollbackPublishedModel(characterId: string, options: Record<string, unknown>): string {
    const releaseId = String(options.releaseId || '').trim();
    if (!releaseId) {
      throw new Error('回滚模型缺少 releaseId');
    }
    const releases = this.loadReleaseHistory(characterId);
    const release = releases.find((item) => item.releaseId === releaseId);
    if (!release) {
      throw new Error(`未找到发布记录: ${releaseId}`);
    }
    if (release.rolledBackAt) {
      throw new Error(`发布记录 ${releaseId} 已回滚`);
    }

    const modelRoot = path.join(this.repoRoot, 'data', 'voice-models');
    const targetDir = path.resolve(this.repoRoot, release.targetDir);
    fs.rmSync(targetDir, { recursive: true, force: true });
    if (release.backupDir) {
      const backupDir = path.resolve(this.repoRoot, release.backupDir);
      if (fs.existsSync(backupDir)) {
        fs.mkdirSync(path.dirname(targetDir), { recursive: true });
        fs.cpSync(backupDir, targetDir, { recursive: true });
      }
    }

    if (release.previousCatalogEntry) {
      this.upsertCatalogEntry(modelRoot, release.previousCatalogEntry);
    } else {
      this.removeCatalogEntry(modelRoot, release.modelId);
    }

    this.markReleaseRolledBack(characterId, releaseId);
    this.writeVersionRollbackBackfill(
      path.join(this.trainingRoot, characterId),
      release.versionId,
      release.previousActiveVersionId
    );
    return `已回滚发布记录 ${releaseId}，恢复模型 ${release.modelId}`;
  }

  private publishGptModel(
    modelRoot: string,
    characterId: string,
    characterName: string,
    versionId: string,
    version: TrainingVersionEntry
  ): { targetDir: string; catalogEntry: VoiceModelEntry; backupDir?: string } {
    const publishMeta = version.publish || {};
    const artifacts = version.artifacts || {};
    const targetDir = publishMeta.targetSubdir
      ? path.join(modelRoot, characterId, publishMeta.targetSubdir)
      : path.join(modelRoot, characterId);
    const backupDir = this.snapshotTargetDir(targetDir, characterId, versionId);
    fs.mkdirSync(targetDir, { recursive: true });

    const refSource = this.resolveTrainingAssetPath(characterId, artifacts.refAudioPath);
    if (!refSource) {
      throw new Error(`训练版本 ${versionId} 缺少 refAudioPath，无法发布 GPT-SoVITS 模型`);
    }
    const copiedRef = this.copyWithName(refSource, path.join(targetDir, `reference${path.extname(refSource) || '.wav'}`));
    const auxSources = Array.isArray(artifacts.auxPaths)
      ? artifacts.auxPaths
          .map((item) => this.resolveTrainingAssetPath(characterId, item))
          .filter((item): item is string => Boolean(item))
      : [];
    const copiedAux = auxSources.map((source, index) =>
      this.copyWithName(source, path.join(targetDir, `aux-${index + 1}${path.extname(source) || '.wav'}`))
    );
    const existing = readJsonIfExists<Partial<VoiceModelEntry>>(path.join(modelRoot, characterId, 'voice-model.json')) || {};
    const modelId = String(
      publishMeta.id ||
        (versionId === 'stable-gpt' ? `preset-${characterId}` : `preset-${characterId}-${this.slugify(versionId)}`)
    );
    const entry: VoiceModelEntry = {
      id: modelId,
      name: String(publishMeta.name || (versionId === 'stable-gpt' ? characterName : `${characterName} ${versionId}`)),
      character: String(publishMeta.character || characterName),
      backend: 'gpt-sovits',
      recommendedBackend: String(publishMeta.recommendedBackend || 'gpt-sovits'),
      alternateBackends: Array.isArray(publishMeta.alternateBackends) ? publishMeta.alternateBackends : (existing.alternateBackends || ['edge-tts']),
      qualityTier: String(publishMeta.qualityTier || existing.qualityTier || 'trained'),
      trainingStatus: String(publishMeta.trainingStatus || version.stage || 'trained'),
      previewHint: String(publishMeta.previewHint || existing.previewHint || `训练版本 ${versionId} 已入库，可继续试听。`),
      tags: Array.isArray(publishMeta.tags) ? publishMeta.tags : (existing.tags || ['训练入库']),
      sampleText: String(publishMeta.sampleText || existing.sampleText || `${characterName} 的训练版本已经更新完成。`),
      promptText: String(publishMeta.promptText || existing.promptText || `${characterName} 的训练版本已经更新完成。`),
      promptLang: String(publishMeta.promptLang || existing.promptLang || 'zh'),
      notes: String(publishMeta.notes || version.notes || existing.notes || ''),
      enabled: publishMeta.enabled !== false,
      installed: true,
      source: 'catalog',
      refAudioPath: this.toRelativePath(targetDir, copiedRef),
      auxPaths: copiedAux.map((item) => this.toRelativePath(targetDir, item)),
      backendOverrides: publishMeta.backendOverrides || existing.backendOverrides,
      experimental: publishMeta.experimental === true,
    };
    this.writeVoiceModelMeta(targetDir, entry);
    return { targetDir, catalogEntry: this.toCatalogRelativeEntry(modelRoot, targetDir, entry), backupDir };
  }

  private publishRvcModel(
    modelRoot: string,
    characterId: string,
    characterName: string,
    versionId: string,
    version: TrainingVersionEntry
  ): { targetDir: string; catalogEntry: VoiceModelEntry; backupDir?: string } {
    const publishMeta = version.publish || {};
    const artifacts = version.artifacts || {};
    const slot = String(publishMeta.slot || (versionId === 'exp-rvc' ? '' : this.slugify(versionId))).trim();
    const targetDir = slot
      ? path.join(modelRoot, characterId, 'rvc', slot)
      : path.join(modelRoot, characterId, 'rvc');
    const backupDir = this.snapshotTargetDir(targetDir, characterId, versionId);
    fs.mkdirSync(targetDir, { recursive: true });
    const modelSource = this.resolveTrainingAssetPath(characterId, artifacts.modelPath);
    if (!modelSource) {
      throw new Error(`训练版本 ${versionId} 缺少 modelPath，无法发布 RVC 模型`);
    }
    const indexSource = this.resolveTrainingAssetPath(characterId, artifacts.indexPath);
    const copiedModel = this.copyWithName(modelSource, path.join(targetDir, `model${path.extname(modelSource) || '.pth'}`));
    const copiedIndex = indexSource
      ? this.copyWithName(indexSource, path.join(targetDir, `feature${path.extname(indexSource) || '.index'}`))
      : undefined;
    const modelId = String(
      publishMeta.id ||
        (slot ? `preset-${characterId}-rvc-${slot}` : `preset-${characterId}-rvc`)
    );
    const entry: VoiceModelEntry = {
      id: modelId,
      name: String(publishMeta.name || (slot ? `${characterName} RVC ${slot}` : `${characterName} RVC 实验版`)),
      character: String(publishMeta.character || characterName),
      backend: 'rvc-compat',
      recommendedBackend: String(publishMeta.recommendedBackend || 'rvc-compat'),
      alternateBackends: Array.isArray(publishMeta.alternateBackends) ? publishMeta.alternateBackends : ['gpt-sovits', 'edge-tts'],
      qualityTier: String(publishMeta.qualityTier || 'experimental'),
      trainingStatus: String(publishMeta.trainingStatus || version.stage || 'trained'),
      previewHint: String(publishMeta.previewHint || `训练版本 ${versionId} 已导入，可参与 RVC 试听对比。`),
      tags: Array.isArray(publishMeta.tags) ? publishMeta.tags : ['RVC', '训练入库'],
      sampleText: String(publishMeta.sampleText || `${characterName} 的 RVC 训练版本已经准备完成。`),
      notes: String(publishMeta.notes || version.notes || ''),
      enabled: publishMeta.enabled !== false,
      installed: true,
      source: 'catalog',
      modelPath: this.toRelativePath(targetDir, copiedModel),
      auxPaths: copiedIndex ? [this.toRelativePath(targetDir, copiedIndex)] : undefined,
      experimental: publishMeta.experimental !== false,
    };
    this.writeVoiceModelMeta(targetDir, entry);
    this.writeRvcImportMetadata(modelRoot, characterId, slot || 'default', copiedModel, copiedIndex);
    return { targetDir, catalogEntry: this.toCatalogRelativeEntry(modelRoot, targetDir, entry), backupDir };
  }

  private resolveTrainingAssetPath(characterId: string, assetPath?: string): string | null {
    if (!assetPath) return null;
    const normalized = String(assetPath).trim();
    if (!normalized) return null;
    const baseDir = path.join(this.trainingRoot, characterId);
    const resolved = path.isAbsolute(normalized) ? normalized : path.resolve(baseDir, normalized);
    if (!fs.existsSync(resolved)) {
      throw new Error(`找不到训练产物: ${resolved}`);
    }
    return resolved;
  }

  private copyWithName(sourcePath: string, targetPath: string): string {
    fs.mkdirSync(path.dirname(targetPath), { recursive: true });
    fs.copyFileSync(sourcePath, targetPath);
    return targetPath;
  }

  private toRelativePath(baseDir: string, absolutePath: string): string {
    const rel = path.relative(baseDir, absolutePath).replace(/\\/g, '/');
    return rel.startsWith('.') ? rel : `./${rel}`;
  }

  private slugify(input: string): string {
    return input
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '') || 'version';
  }

  private writeVoiceModelMeta(targetDir: string, entry: VoiceModelEntry): void {
    fs.writeFileSync(path.join(targetDir, 'voice-model.json'), JSON.stringify(entry, null, 2) + '\n', 'utf8');
  }

  private toCatalogRelativeEntry(modelRoot: string, targetDir: string, entry: VoiceModelEntry): VoiceModelEntry {
    const clone: VoiceModelEntry = { ...entry };
    if (clone.refAudioPath) {
      clone.refAudioPath = this.toRelativePath(modelRoot, path.resolve(targetDir, clone.refAudioPath));
    }
    if (clone.modelPath) {
      clone.modelPath = this.toRelativePath(modelRoot, path.resolve(targetDir, clone.modelPath));
    }
    if (Array.isArray(clone.auxPaths)) {
      clone.auxPaths = clone.auxPaths.map((item) => this.toRelativePath(modelRoot, path.resolve(targetDir, item)));
    }
    return clone;
  }

  private snapshotTargetDir(targetDir: string, characterId: string, versionId: string): string | undefined {
    if (!fs.existsSync(targetDir)) return undefined;
    const entries = fs.readdirSync(targetDir);
    if (!entries.length) return undefined;
    const backupDir = path.join(
      this.releasesRoot,
      characterId,
      `${versionId}-${Date.now()}`,
      'target-backup'
    );
    fs.mkdirSync(path.dirname(backupDir), { recursive: true });
    fs.cpSync(targetDir, backupDir, { recursive: true });
    return backupDir;
  }

  private getCatalogEntry(modelRoot: string, modelId: string): VoiceModelEntry | null {
    const catalogPath = path.join(modelRoot, 'catalog.json');
    const payload = readJsonIfExists<{ models?: VoiceModelEntry[] }>(catalogPath);
    const models = Array.isArray(payload?.models) ? payload!.models : [];
    return models.find((item) => item.id === modelId) || null;
  }

  private upsertCatalogEntry(modelRoot: string, entry: VoiceModelEntry): void {
    const catalogPath = path.join(modelRoot, 'catalog.json');
    const payload = readJsonIfExists<{ models?: VoiceModelEntry[] }>(catalogPath) || { models: [] };
    const models = Array.isArray(payload.models) ? payload.models.slice() : [];
    const nextModels = models.filter((item) => item.id !== entry.id);
    nextModels.push(entry);
    nextModels.sort((a, b) => a.id.localeCompare(b.id, 'en'));
    fs.writeFileSync(catalogPath, JSON.stringify({ models: nextModels }, null, 2) + '\n', 'utf8');
  }

  private removeCatalogEntry(modelRoot: string, modelId: string): void {
    const catalogPath = path.join(modelRoot, 'catalog.json');
    const payload = readJsonIfExists<{ models?: VoiceModelEntry[] }>(catalogPath) || { models: [] };
    const models = Array.isArray(payload.models) ? payload.models.filter((item) => item.id !== modelId) : [];
    fs.writeFileSync(catalogPath, JSON.stringify({ models }, null, 2) + '\n', 'utf8');
  }

  private writeVersionPublishBackfill(
    characterDir: string,
    versionId: string,
    entry: VoiceModelEntry,
    meta: { releaseId: string; publishedAt: string }
  ): void {
    const versionsPath = path.join(characterDir, 'train', 'versions.json');
    const payload = readJsonIfExists<VersionsManifest>(versionsPath) || { versions: [] };
    payload.versions = Array.isArray(payload.versions) ? payload.versions : [];
    payload.versions = payload.versions.map((item) => {
      if (!item) return item;
      if (item.id !== versionId) {
        return {
          ...item,
          publish: item.publish
            ? {
                ...item.publish,
                active: false,
              }
            : item.publish,
        };
      }
      return {
        ...item,
        publish: {
          ...(item.publish || {}),
          id: entry.id,
          name: entry.name,
          backend: entry.backend,
          trainingStatus: entry.trainingStatus,
          qualityTier: entry.qualityTier,
          sampleText: entry.sampleText,
          promptText: entry.promptText,
          promptLang: entry.promptLang,
          notes: entry.notes,
          previewHint: entry.previewHint,
          tags: entry.tags,
          alternateBackends: entry.alternateBackends,
          recommendedBackend: entry.recommendedBackend,
          releaseId: meta.releaseId,
          publishedAt: meta.publishedAt,
          active: true,
        },
      };
    });
    fs.writeFileSync(versionsPath, JSON.stringify(payload, null, 2) + '\n', 'utf8');
  }

  private writeVersionRollbackBackfill(characterDir: string, versionId: string, previousActiveVersionId?: string): void {
    const versionsPath = path.join(characterDir, 'train', 'versions.json');
    const payload = readJsonIfExists<VersionsManifest>(versionsPath) || { versions: [] };
    payload.versions = Array.isArray(payload.versions) ? payload.versions : [];
    payload.versions = payload.versions.map((item) => {
      if (!item || !item.publish) return item;
      if (item.id === versionId) {
        return {
          ...item,
          publish: {
            ...item.publish,
            active: false,
          },
        };
      }
      if (previousActiveVersionId && item.id === previousActiveVersionId) {
        return {
          ...item,
          publish: {
            ...item.publish,
            active: true,
          },
        };
      }
      return item;
    });
    fs.writeFileSync(versionsPath, JSON.stringify(payload, null, 2) + '\n', 'utf8');
  }

  private writeRvcImportMetadata(
    modelRoot: string,
    characterId: string,
    slot: string,
    modelPath: string,
    indexPath?: string
  ): void {
    const rvcRootDir = path.join(modelRoot, characterId, 'rvc');
    const slotMetadata = {
      character: characterId,
      slot,
      importedAt: new Date().toISOString(),
      model: modelPath,
      index: indexPath || null,
    };
    fs.writeFileSync(
      path.join(path.dirname(modelPath), 'imported-artifacts.json'),
      JSON.stringify(slotMetadata, null, 2) + '\n',
      'utf8'
    );
    const metadataPath = path.join(rvcRootDir, 'imported-artifacts.json');
    const history = readJsonIfExists<{ character?: string; updatedAt?: string | null; activeSlot?: string; versions?: Array<any> }>(
      metadataPath
    ) || { character: characterId, updatedAt: null, versions: [] };
    history.character = characterId;
    history.updatedAt = slotMetadata.importedAt;
    history.activeSlot = slot;
    history.versions = Array.isArray(history.versions) ? history.versions.filter((item) => item.slot !== slot) : [];
    history.versions.push(slotMetadata);
    history.versions.sort((a, b) => String(a.slot || '').localeCompare(String(b.slot || '')));
    fs.writeFileSync(metadataPath, JSON.stringify(history, null, 2) + '\n', 'utf8');
  }

  private getActivePublishedVersionId(characterDir: string): string | undefined {
    const payload = readJsonIfExists<VersionsManifest>(path.join(characterDir, 'train', 'versions.json'));
    const versions = Array.isArray(payload?.versions) ? payload!.versions : [];
    return versions.find((item) => item?.publish && (item.publish as any).active)?.id;
  }

  private getReleaseHistoryPath(characterId: string): string {
    return path.join(this.trainingRoot, characterId, 'train', 'publish-history.json');
  }

  private loadReleaseHistory(characterId: string): VoiceTrainingReleaseRecord[] {
    const payload = readJsonIfExists<{ releases?: VoiceTrainingReleaseRecord[] }>(this.getReleaseHistoryPath(characterId));
    const releases = Array.isArray(payload?.releases) ? payload!.releases : [];
    return releases.slice().sort((a, b) => String(b.publishedAt).localeCompare(String(a.publishedAt)));
  }

  private saveReleaseHistory(characterId: string, releases: VoiceTrainingReleaseRecord[]): void {
    const filePath = this.getReleaseHistoryPath(characterId);
    fs.mkdirSync(path.dirname(filePath), { recursive: true });
    fs.writeFileSync(filePath, JSON.stringify({ releases }, null, 2) + '\n', 'utf8');
  }

  private appendReleaseHistory(characterId: string, release: VoiceTrainingReleaseRecord): void {
    const releases = this.loadReleaseHistory(characterId);
    releases.unshift(release);
    this.saveReleaseHistory(characterId, releases.slice(0, 20));
  }

  private markReleaseRolledBack(characterId: string, releaseId: string): void {
    const releases = this.loadReleaseHistory(characterId).map((item) =>
      item.releaseId === releaseId
        ? {
            ...item,
            rolledBackAt: new Date().toISOString(),
          }
        : item
    );
    this.saveReleaseHistory(characterId, releases);
  }

  private listRelativeFiles(dirPath: string): string[] {
    if (!fs.existsSync(dirPath)) return [];
    const results: string[] = [];
    const walk = (currentDir: string, prefix = '') => {
      const entries = fs.readdirSync(currentDir, { withFileTypes: true });
      for (const entry of entries) {
        const nextPrefix = prefix ? `${prefix}/${entry.name}` : entry.name;
        const fullPath = path.join(currentDir, entry.name);
        if (entry.isDirectory()) {
          walk(fullPath, nextPrefix);
        } else {
          results.push(nextPrefix);
        }
      }
    };
    walk(dirPath);
    return results;
  }

  private loadTaskHistory(): VoiceTrainingTaskRecord[] {
    const payload = readJsonIfExists<{ tasks?: VoiceTrainingTaskRecord[] }>(this.tasksFilePath);
    if (!Array.isArray(payload?.tasks)) return [];
    return payload.tasks.slice(0, 8).map((task) => {
      if (task.status === 'queued' || task.status === 'running') {
        return {
          ...task,
          status: 'failed',
          finishedAt: task.finishedAt || new Date().toISOString(),
          error: task.error || '任务在上次进程退出前中断',
        };
      }
      return task;
    });
  }

  private persistTaskHistory(): void {
    fs.mkdirSync(path.dirname(this.tasksFilePath), { recursive: true });
    fs.writeFileSync(this.tasksFilePath, JSON.stringify({ tasks: this.recentTasks.slice(0, 8) }, null, 2) + '\n', 'utf8');
  }

  private recordTask(task: VoiceTrainingTaskRecord): void {
    this.recentTasks.unshift(task);
    this.recentTasks.splice(8);
    this.persistTaskHistory();
  }
}
