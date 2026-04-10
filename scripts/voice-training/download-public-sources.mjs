import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const SCRIPT_DIR = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(SCRIPT_DIR, '..', '..');
const TRAINING_ROOT = path.join(REPO_ROOT, 'data', 'voice-models', 'training');
const DEFAULT_CHARACTERS = ['dongxuelian', 'yongchutafi'];
const BULK_TYPES = new Set(['official-space', 'live-room']);

function parseArgs(argv) {
  const options = {
    characters: [],
    sourceIds: [],
    allowBulk: false,
    skipExisting: true,
    limit: undefined,
  };
  for (const raw of argv) {
    if (raw.startsWith('--character=')) {
      options.characters.push(raw.slice('--character='.length));
    } else if (raw.startsWith('--source=')) {
      options.sourceIds.push(raw.slice('--source='.length));
    } else if (raw === '--allow-bulk') {
      options.allowBulk = true;
    } else if (raw === '--no-skip-existing') {
      options.skipExisting = false;
    } else if (raw.startsWith('--limit=')) {
      options.limit = Number(raw.slice('--limit='.length));
    }
  }
  return options;
}

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, 'utf8'));
}

function ensureDir(dirPath) {
  fs.mkdirSync(dirPath, { recursive: true });
}

function trySpawn(command, args) {
  return spawnSync(command, args, {
    cwd: REPO_ROOT,
    encoding: 'utf8',
    stdio: 'pipe',
  });
}

function resolveYtDlp() {
  const attempts = [
    { command: 'yt-dlp', baseArgs: [] },
    { command: 'python', baseArgs: ['-m', 'yt_dlp'] },
  ];
  for (const attempt of attempts) {
    const result = trySpawn(attempt.command, [...attempt.baseArgs, '--version']);
    if (result.status === 0) {
      return attempt;
    }
  }
  throw new Error('未找到 yt-dlp。先运行 `python -m pip install yt-dlp`，再执行本脚本。');
}

function getSelectedSources(character, options) {
  const manifestPath = path.join(TRAINING_ROOT, character, 'manifests', 'public-sources.json');
  const manifest = readJson(manifestPath);
  const requestedIds = new Set(options.sourceIds);
  let items = (manifest.sources || []).filter((source) => {
    if (!source || !source.id || !source.url) return false;
    if (requestedIds.size && !requestedIds.has(source.id)) return false;
    if (!options.allowBulk && BULK_TYPES.has(source.contentType)) return false;
    return source.status !== 'done';
  });
  items = items.sort((a, b) => String(a.priority || '').localeCompare(String(b.priority || '')));
  if (typeof options.limit === 'number' && Number.isFinite(options.limit)) {
    items = items.slice(0, Math.max(0, options.limit));
  }
  return { manifest, items };
}

function hasDownloadedMedia(dirPath) {
  if (!fs.existsSync(dirPath)) return false;
  return fs.readdirSync(dirPath).some((entry) => /\.(mp4|mkv|webm|mp3|m4a|wav|flac)$/i.test(entry));
}

function downloadSource(character, source, ytDlp, options) {
  const outputDir = path.join(TRAINING_ROOT, character, 'raw', source.id);
  ensureDir(outputDir);
  fs.writeFileSync(path.join(outputDir, 'source.json'), JSON.stringify(source, null, 2) + '\n', 'utf8');
  if (options.skipExisting && hasDownloadedMedia(outputDir)) {
    console.log(`[skip] ${character}/${source.id} 已存在媒体文件`);
    return;
  }

  const outputPattern = path.join(outputDir, '%(title).80B-%(id)s.%(ext)s');
  const args = [
    ...ytDlp.baseArgs,
    '--continue',
    '--no-playlist',
    '--restrict-filenames',
    '--write-info-json',
    '--write-description',
    '--write-thumbnail',
    '--ignore-errors',
    '-o',
    outputPattern,
    source.url,
  ];
  console.log(`[download] ${character}/${source.id} <- ${source.url}`);
  const result = trySpawn(ytDlp.command, args);
  if (result.status !== 0) {
    throw new Error(`下载失败 ${character}/${source.id}\n${result.stderr || result.stdout}`);
  }
  if (result.stdout.trim()) {
    console.log(result.stdout.trim());
  }
}

function main() {
  const options = parseArgs(process.argv.slice(2));
  const ytDlp = resolveYtDlp();
  const characters = options.characters.length ? options.characters : DEFAULT_CHARACTERS;
  console.log(`[download-options] characters=${characters.join(',') || 'default'} sources=${options.sourceIds.join(',') || 'all'} allowBulk=${String(options.allowBulk)}`);
  for (const character of characters) {
    const { manifest, items } = getSelectedSources(character, options);
    console.log(`\n== ${manifest.character || character} ==`);
    if (!items.length) {
      console.log('没有可下载来源。默认会跳过 space/live-room；需要时请加 `--allow-bulk`。');
      continue;
    }
    for (const source of items) {
      downloadSource(character, source, ytDlp, options);
    }
  }
}

main();
