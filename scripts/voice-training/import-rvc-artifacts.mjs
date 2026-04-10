import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const SCRIPT_DIR = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(SCRIPT_DIR, '..', '..');
const MODEL_ROOT = path.join(REPO_ROOT, 'data', 'voice-models');

function parseArgs(argv) {
  const options = {};
  for (const raw of argv) {
    const [key, value] = raw.split('=');
    if (key.startsWith('--')) {
      options[key.slice(2)] = value;
    }
  }
  return options;
}

function copyIfPresent(sourcePath, targetPath) {
  if (!sourcePath) return null;
  if (!fs.existsSync(sourcePath)) {
    throw new Error(`找不到文件: ${sourcePath}`);
  }
  fs.mkdirSync(path.dirname(targetPath), { recursive: true });
  fs.copyFileSync(sourcePath, targetPath);
  return targetPath;
}

function readJsonIfPresent(filePath, fallbackValue) {
  if (!fs.existsSync(filePath)) return fallbackValue;
  try {
    return JSON.parse(fs.readFileSync(filePath, 'utf8'));
  } catch {
    return fallbackValue;
  }
}

function main() {
  const options = parseArgs(process.argv.slice(2));
  const character = options.character;
  const model = options.model;
  if (!character || !model) {
    throw new Error('用法: node scripts/voice-training/import-rvc-artifacts.mjs --character=dongxuelian --model=D:\\path\\model.pth [--index=D:\\path\\added.index] [--slot=v2]');
  }
  const slot = String(options.slot || options.version || options.variant || '').trim();
  const rvcRootDir = path.join(MODEL_ROOT, character, 'rvc');
  const rvcDir = slot ? path.join(rvcRootDir, slot) : rvcRootDir;
  const copiedModel = copyIfPresent(model, path.join(rvcDir, 'model.pth'));
  const copiedIndex = copyIfPresent(options.index, path.join(rvcDir, 'feature.index'));

  const slotMetadata = {
    character,
    slot: slot || 'default',
    importedAt: new Date().toISOString(),
    model: copiedModel,
    index: copiedIndex,
  };
  fs.writeFileSync(path.join(rvcDir, 'imported-artifacts.json'), JSON.stringify(slotMetadata, null, 2) + '\n', 'utf8');

  const metadataPath = path.join(rvcRootDir, 'imported-artifacts.json');
  const history = readJsonIfPresent(metadataPath, {
    character,
    updatedAt: null,
    versions: [],
  });
  history.character = character;
  history.updatedAt = slotMetadata.importedAt;
  history.activeSlot = slot || 'default';
  history.versions = Array.isArray(history.versions) ? history.versions.filter(item => item.slot !== history.activeSlot) : [];
  history.versions.push(slotMetadata);
  history.versions.sort((a, b) => String(a.slot || '').localeCompare(String(b.slot || '')));
  fs.writeFileSync(metadataPath, JSON.stringify(history, null, 2) + '\n', 'utf8');
  console.log(`已导入 RVC 产物到 ${rvcDir}${slot ? ` (slot=${slot})` : ''}`);
}

main();
