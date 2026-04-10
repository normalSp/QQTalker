import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const SCRIPT_DIR = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(SCRIPT_DIR, '..', '..');
const TRAINING_ROOT = path.join(REPO_ROOT, 'data', 'voice-models', 'training');
const DEFAULT_CHARACTERS = ['dongxuelian', 'yongchutafi'];
const MEDIA_EXTENSIONS = ['.wav', '.flac', '.mp3', '.m4a', '.aac', '.mp4', '.mkv', '.webm'];

function parseArgs(argv) {
  const options = {
    characters: [],
    clipIds: [],
    overwrite: false,
  };
  for (const raw of argv) {
    if (raw.startsWith('--character=')) {
      options.characters.push(raw.slice('--character='.length));
    } else if (raw.startsWith('--clip=')) {
      options.clipIds.push(raw.slice('--clip='.length));
    } else if (raw === '--overwrite') {
      options.overwrite = true;
    }
  }
  return options;
}

function ensureDir(dirPath) {
  fs.mkdirSync(dirPath, { recursive: true });
}

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, 'utf8'));
}

function resolveFfmpeg() {
  const result = spawnSync('ffmpeg', ['-version'], {
    cwd: REPO_ROOT,
    encoding: 'utf8',
    stdio: 'pipe',
  });
  if (result.status !== 0) {
    throw new Error('未找到 ffmpeg，请先安装 ffmpeg 并确保命令可用。');
  }
  return 'ffmpeg';
}

function parseTime(value) {
  if (typeof value === 'number') return value;
  if (!value) return 0;
  if (/^\d+(\.\d+)?$/.test(String(value))) return Number(value);
  const parts = String(value).split(':').map(Number);
  let seconds = 0;
  while (parts.length) {
    seconds = seconds * 60 + Number(parts.shift() || 0);
  }
  return seconds;
}

function findInputFile(characterRoot, clip) {
  if (clip.input) {
    if (path.isAbsolute(clip.input)) return clip.input;
    return path.join(characterRoot, 'raw', clip.sourceId || '', clip.input);
  }
  const scanDir = path.join(characterRoot, 'raw', clip.sourceId || '');
  if (!fs.existsSync(scanDir)) {
    throw new Error(`找不到来源目录: ${scanDir}`);
  }
  const match = fs.readdirSync(scanDir)
    .find((entry) => MEDIA_EXTENSIONS.includes(path.extname(entry).toLowerCase()));
  if (!match) {
    throw new Error(`来源目录里没有可切片媒体文件: ${scanDir}`);
  }
  return path.join(scanDir, match);
}

function exportClip(ffmpeg, character, manifest, clip, options) {
  const characterRoot = path.join(TRAINING_ROOT, character);
  const inputFile = findInputFile(characterRoot, clip);
  const targetDir = clip.targetDir || manifest.defaults?.targetDir || 'segments';
  const sampleRate = Number(clip.sampleRate || manifest.defaults?.sampleRate || 32000);
  const channels = Number(clip.channels || manifest.defaults?.channels || 1);
  const start = parseTime(clip.start);
  const end = clip.end !== undefined ? parseTime(clip.end) : undefined;
  const duration = end !== undefined ? Math.max(0, end - start) : undefined;
  const ext = clip.outputExt || manifest.defaults?.outputExt || 'wav';
  const outputDir = path.join(characterRoot, targetDir);
  const outputPath = path.join(outputDir, `${clip.id}.${ext}`);
  ensureDir(outputDir);
  if (!options.overwrite && fs.existsSync(outputPath)) {
    console.log(`[skip] ${character}/${clip.id} 已存在`);
    return {
      id: clip.id,
      inputFile,
      outputPath,
      transcript: clip.transcript || '',
      notes: clip.notes || '',
    };
  }

  const args = ['-y', '-ss', String(start), '-i', inputFile];
  if (duration !== undefined) {
    args.push('-t', String(duration));
  }
  const filters = [];
  if (clip.normalizeLoudness !== false) {
    filters.push('loudnorm=I=-18:TP=-1.5:LRA=7');
  }
  if (clip.filters) {
    filters.push(String(clip.filters));
  }
  if (filters.length) {
    args.push('-af', filters.join(','));
  }
  args.push('-ac', String(channels), '-ar', String(sampleRate), '-vn', outputPath);
  const result = spawnSync(ffmpeg, args, {
    cwd: REPO_ROOT,
    encoding: 'utf8',
    stdio: 'pipe',
  });
  if (result.status !== 0) {
    throw new Error(`切片失败 ${character}/${clip.id}\n${result.stderr || result.stdout}`);
  }
  console.log(`[clip] ${character}/${clip.id} -> ${path.relative(REPO_ROOT, outputPath)}`);
  return {
    id: clip.id,
    inputFile,
    outputPath,
    transcript: clip.transcript || '',
    notes: clip.notes || '',
  };
}

function main() {
  const ffmpeg = resolveFfmpeg();
  const options = parseArgs(process.argv.slice(2));
  const requestedIds = new Set(options.clipIds);
  const characters = options.characters.length ? options.characters : DEFAULT_CHARACTERS;
  for (const character of characters) {
    const manifestPath = path.join(TRAINING_ROOT, character, 'manifests', 'clips.json');
    const manifest = readJson(manifestPath);
    const clips = (manifest.clips || []).filter((clip) => {
      if (!clip?.id) return false;
      if (clip.enabled === false) return false;
      if (requestedIds.size && !requestedIds.has(clip.id)) return false;
      return true;
    });
    console.log(`\n== ${manifest.character || character} ==`);
    if (!clips.length) {
      console.log('没有启用的切片任务，请先编辑 manifests/clips.json。');
      continue;
    }
    const outputs = clips.map((clip) => exportClip(ffmpeg, character, manifest, clip, options));
    const generatedPath = path.join(TRAINING_ROOT, character, 'manifests', 'segments.generated.json');
    fs.writeFileSync(generatedPath, JSON.stringify({
      character: manifest.character || character,
      generatedAt: new Date().toISOString(),
      segments: outputs,
    }, null, 2) + '\n', 'utf8');
  }
}

main();
