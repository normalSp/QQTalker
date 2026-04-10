import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const SCRIPT_DIR = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(SCRIPT_DIR, '..', '..');
const TRAINING_ROOT = path.join(REPO_ROOT, 'data', 'voice-models', 'training');
const DEFAULT_CHARACTERS = ['dongxuelian', 'yongchutafi'];

function parseArgs(argv) {
  const options = { characters: [] };
  for (const raw of argv) {
    if (raw.startsWith('--character=')) {
      options.characters.push(raw.slice('--character='.length));
    }
  }
  return options;
}

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, 'utf8'));
}

function ensureDir(filePath) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
}

function getDurationSec(filePath) {
  try {
    const raw = execFileSync('ffprobe', [
      '-v', 'error',
      '-show_entries', 'format=duration',
      '-of', 'default=noprint_wrappers=1:nokey=1',
      filePath,
    ], { encoding: 'utf8' }).trim();
    const value = Number(raw);
    return Number.isFinite(value) ? Number(value.toFixed(3)) : null;
  } catch {
    return null;
  }
}

function buildSourceId(segmentId) {
  const parts = segmentId.split('-');
  return parts.length > 2 ? parts.slice(0, -2).join('-') : segmentId;
}

function buildFormalEntry(character, segment, clipMeta) {
  const durationSec = getDurationSec(segment.outputPath);
  const transcript = clipMeta?.transcript || segment.transcriptClean || segment.transcript || '';
  const notes = clipMeta?.notes || segment.notes || '';
  return {
    id: segment.id,
    character,
    sourceId: clipMeta?.sourceId || buildSourceId(segment.id),
    outputPath: segment.outputPath,
    transcript,
    transcriptRaw: segment.transcriptRaw || '',
    transcriptionStatus: segment.transcriptionStatus || (transcript ? 'draft' : 'empty'),
    durationSec,
    notes,
    reviewer: '',
    reviewStatus: clipMeta?.reviewStatus || (transcript ? 'pending-review' : 'needs-transcript'),
    usableForTrain: typeof clipMeta?.usableForTrain === 'boolean' ? clipMeta.usableForTrain : Boolean(transcript),
  };
}

function writeTsv(filePath, entries) {
  const rows = [
    ['id', 'audio', 'speaker', 'lang', 'text'],
    ...entries.filter((item) => item.transcript && item.usableForTrain).map((item) => [
      item.id,
      path.relative(path.dirname(filePath), item.outputPath).replace(/\\/g, '/'),
      item.character,
      'zh',
      item.transcript.replace(/\s+/g, ' ').trim(),
    ]),
  ];
  const content = rows.map((row) => row.map((cell) => String(cell).replace(/\t/g, ' ')).join('\t')).join('\n') + '\n';
  ensureDir(filePath);
  fs.writeFileSync(filePath, content, 'utf8');
}

function writeMarkdown(filePath, characterLabel, entries) {
  const lines = [
    `# ${characterLabel} 训练清单`,
    '',
    '| ID | 时长(s) | 转写状态 | 复核状态 | 文本 | 备注 |',
    '| --- | ---: | --- | --- | --- | --- |',
    ...entries.map((item) => {
      const duration = item.durationSec == null ? '-' : item.durationSec.toFixed(3);
      const text = (item.transcript || '').replace(/\|/g, '\\|');
      const notes = (item.notes || '').replace(/\|/g, '\\|');
      return `| ${item.id} | ${duration} | ${item.transcriptionStatus} | ${item.reviewStatus} | ${text} | ${notes} |`;
    }),
    '',
  ];
  ensureDir(filePath);
  fs.writeFileSync(filePath, lines.join('\n'), 'utf8');
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  const characters = options.characters.length ? options.characters : DEFAULT_CHARACTERS;
  for (const character of characters) {
    const transcriptPath = path.join(TRAINING_ROOT, character, 'manifests', 'transcripts.generated.json');
    const clipsPath = path.join(TRAINING_ROOT, character, 'manifests', 'clips.json');
    const manifest = readJson(transcriptPath);
    const clipsManifest = fs.existsSync(clipsPath) ? readJson(clipsPath) : { clips: [] };
    const clipMetaById = new Map((clipsManifest.clips || []).map((clip) => [clip.id, clip]));
    const entries = (manifest.segments || []).map((segment) => buildFormalEntry(character, segment, clipMetaById.get(segment.id)));
    const jsonPath = path.join(TRAINING_ROOT, character, 'manifests', 'training-manifest.json');
    const mdPath = path.join(TRAINING_ROOT, character, 'manifests', 'training-manifest.md');
    const tsvPath = path.join(TRAINING_ROOT, character, 'train', 'dataset.tsv');
    ensureDir(jsonPath);
    fs.writeFileSync(jsonPath, JSON.stringify({
      character,
      generatedAt: new Date().toISOString(),
      totalSegments: entries.length,
      usableSegments: entries.filter((item) => item.usableForTrain).length,
      entries,
    }, null, 2) + '\n', 'utf8');
    writeMarkdown(mdPath, manifest.character || character, entries);
    writeTsv(tsvPath, entries);
    console.log(`[manifest] ${character}: ${entries.length} segments, ${entries.filter((item) => item.usableForTrain).length} usable`);
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});
