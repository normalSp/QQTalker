import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const SCRIPT_DIR = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(SCRIPT_DIR, '..', '..');
const TRAINING_ROOT = path.join(REPO_ROOT, 'data', 'voice-models', 'training');
const DEFAULT_CHARACTERS = ['dongxuelian', 'yongchutafi'];

function parseArgs(argv) {
  const options = {
    characters: [],
    sourceIds: [],
    minDuration: 5,
    maxDuration: 9,
    maxPerSource: 4,
  };
  for (const raw of argv) {
    if (raw.startsWith('--character=')) options.characters.push(raw.slice('--character='.length));
    else if (raw.startsWith('--source=')) options.sourceIds.push(raw.slice('--source='.length));
    else if (raw.startsWith('--min-duration=')) options.minDuration = Number(raw.slice('--min-duration='.length));
    else if (raw.startsWith('--max-duration=')) options.maxDuration = Number(raw.slice('--max-duration='.length));
    else if (raw.startsWith('--max-per-source=')) options.maxPerSource = Number(raw.slice('--max-per-source='.length));
  }
  return options;
}

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, 'utf8'));
}

function pickMediaFile(rawDir) {
  if (!fs.existsSync(rawDir)) return null;
  const candidates = fs.readdirSync(rawDir)
    .filter((entry) => /\.(mp4|mkv|webm|wav|m4a|mp3|flac)$/i.test(entry))
    .sort();
  return candidates.length ? path.join(rawDir, candidates[0]) : null;
}

function analyzeSilences(inputFile) {
  const result = spawnSync('ffmpeg', [
    '-hide_banner',
    '-i', inputFile,
    '-af', 'silencedetect=noise=-34dB:d=0.35',
    '-f', 'null',
    'NUL',
  ], {
    cwd: REPO_ROOT,
    encoding: 'utf8',
    stdio: 'pipe',
  });
  if (result.status !== 0) {
    throw new Error(`silencedetect failed for ${inputFile}\n${result.stderr}`);
  }
  return result.stderr || '';
}

function parseDuration(logText) {
  const match = logText.match(/Duration:\s+(\d+):(\d+):(\d+\.\d+)/);
  if (!match) return 0;
  return Number(match[1]) * 3600 + Number(match[2]) * 60 + Number(match[3]);
}

function parseSilences(logText) {
  const events = [];
  const regex = /silence_(start|end):\s*([0-9.]+)/g;
  let match;
  while ((match = regex.exec(logText))) {
    events.push({ type: match[1], time: Number(match[2]) });
  }
  return events;
}

function buildSpeechRanges(duration, silences) {
  const ranges = [];
  let cursor = 0;
  for (let i = 0; i < silences.length; i += 1) {
    const event = silences[i];
    if (event.type !== 'start') continue;
    const silenceStart = event.time;
    if (silenceStart > cursor) {
      ranges.push({ start: cursor, end: silenceStart });
    }
    const next = silences[i + 1];
    if (next && next.type === 'end') {
      cursor = next.time;
      i += 1;
    }
  }
  if (cursor < duration) {
    ranges.push({ start: cursor, end: duration });
  }
  return ranges;
}

function formatTime(seconds) {
  const totalMs = Math.max(0, Math.round(seconds * 1000));
  const hrs = Math.floor(totalMs / 3600000);
  const mins = Math.floor((totalMs % 3600000) / 60000);
  const secs = Math.floor((totalMs % 60000) / 1000);
  const ms = totalMs % 1000;
  return `${String(hrs).padStart(2, '0')}:${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}.${String(ms).padStart(3, '0')}`;
}

function chooseCandidateClips(ranges, options) {
  return ranges
    .map((range) => ({ ...range, duration: range.end - range.start }))
    .filter((range) => range.duration >= options.minDuration)
    .sort((a, b) => b.duration - a.duration)
    .slice(0, options.maxPerSource)
    .map((range, index) => {
      const clipDuration = Math.min(options.maxDuration, range.duration);
      const offset = Math.max(0, (range.duration - clipDuration) / 2);
      return {
        index,
        start: range.start + offset,
        end: range.start + offset + clipDuration,
        sourceRange: range,
      };
    })
    .sort((a, b) => a.start - b.start);
}

function main() {
  const options = parseArgs(process.argv.slice(2));
  const characters = options.characters.length ? options.characters : DEFAULT_CHARACTERS;
  const requestedSources = new Set(options.sourceIds);

  for (const character of characters) {
    const characterRoot = path.join(TRAINING_ROOT, character);
    const manifestPath = path.join(characterRoot, 'manifests', 'public-sources.json');
    const clipsPath = path.join(characterRoot, 'manifests', 'clips.json');
    const manifest = readJson(manifestPath);
    const clipsManifest = readJson(clipsPath);
    const existingById = new Map((clipsManifest.clips || []).map((clip) => [clip.id, clip]));
    const preservedClips = requestedSources.size
      ? (clipsManifest.clips || []).filter((clip) => !requestedSources.has(clip.sourceId))
      : [];
    const generated = [];

    for (const source of manifest.sources || []) {
      if (requestedSources.size && !requestedSources.has(source.id)) continue;
      const inputFile = pickMediaFile(path.join(characterRoot, 'raw', source.id));
      if (!inputFile) continue;
      const logText = analyzeSilences(inputFile);
      const duration = parseDuration(logText);
      const silences = parseSilences(logText);
      const ranges = buildSpeechRanges(duration, silences);
      const candidates = chooseCandidateClips(ranges, options);
      for (const candidate of candidates) {
        const id = `${source.id}-auto-${String(candidate.index + 1).padStart(2, '0')}`;
        const previous = existingById.get(id) || {};
        generated.push({
          id,
          enabled: previous.enabled ?? true,
          sourceId: source.id,
          input: path.basename(inputFile),
          start: formatTime(candidate.start),
          end: formatTime(candidate.end),
          normalizeLoudness: true,
          transcript: previous.transcript || '',
          reviewStatus: previous.reviewStatus,
          usableForTrain: previous.usableForTrain,
          notes: previous.notes || `auto-picked from speech span ${formatTime(candidate.sourceRange.start)} - ${formatTime(candidate.sourceRange.end)}`,
        });
      }
    }

    clipsManifest.clips = [...preservedClips, ...generated];
    fs.writeFileSync(clipsPath, JSON.stringify(clipsManifest, null, 2) + '\n', 'utf8');
    console.log(`${character}: wrote ${generated.length} clip suggestions to ${clipsPath}`);
  }
}

main();
