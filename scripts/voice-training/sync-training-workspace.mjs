import fs from 'fs';
import path from 'path';

const root = process.cwd();
const trainingRoot = path.resolve(root, 'data', 'voice-models', 'training');
const characters = ['dongxuelian', 'yongchutafi'];
const requiredDirs = ['raw', 'cleaned', 'segments', 'manifests', 'train'];

function ensureDir(dir) {
  fs.mkdirSync(dir, { recursive: true });
}

function readJson(file) {
  if (!fs.existsSync(file)) return null;
  return JSON.parse(fs.readFileSync(file, 'utf-8'));
}

function toBooleanLabel(value) {
  if (value === true) return '是';
  if (value === false) return '否';
  return '待确认';
}

function renderSourceLine(source) {
  const tags = [
    source.platform || 'unknown',
    source.contentType || 'unknown',
    source.priority || 'normal',
  ].join(' / ');
  return [
    `- ${source.title}`,
    `  - 链接: ${source.url}`,
    `  - 标签: ${tags}`,
    `  - 状态: ${source.status || 'todo'}`,
    `  - 适合作主参考音: ${toBooleanLabel(source.usableForRef)}`,
    `  - 适合作辅助参考音: ${toBooleanLabel(source.usableForAux)}`,
    `  - 适合作训练集: ${toBooleanLabel(source.usableForTrain)}`,
    `  - 备注: ${source.notes || '无'}`,
  ].join('\n');
}

function syncCharacter(characterId) {
  const baseDir = path.join(trainingRoot, characterId);
  requiredDirs.forEach((name) => ensureDir(path.join(baseDir, name)));

  const manifestPath = path.join(baseDir, 'manifests', 'public-sources.json');
  const versionsPath = path.join(baseDir, 'train', 'versions.json');
  const summaryPath = path.join(baseDir, 'manifests', 'summary.md');
  const manifest = readJson(manifestPath);
  const versions = readJson(versionsPath);

  if (!manifest) {
    console.warn(`[voice-training] missing manifest: ${manifestPath}`);
    return;
  }

  const sources = Array.isArray(manifest.sources) ? manifest.sources : [];
  const versionRows = Array.isArray(versions?.versions) ? versions.versions : [];
  const lines = [
    `# ${manifest.character || characterId} 训练工作区摘要`,
    '',
    `- 角色ID: \`${characterId}\``,
    `- 官方主页: ${manifest.spaceUrl || '未填写'}`,
    `- 直播间: ${manifest.liveRoomUrl || '未填写'}`,
    `- 数据策略: ${manifest.strategy || '未填写'}`,
    '',
    '## 公开来源候选',
    '',
    ...(sources.length ? sources.map(renderSourceLine) : ['- 暂无来源']),
    '',
    '## 训练版本',
    '',
    ...(versionRows.length
      ? versionRows.map((item) => `- ${item.id}: ${item.stage || 'unknown'} / ${item.backend || 'unknown'} / ${item.notes || '无'}`)
      : ['- 暂无版本记录']),
    '',
    '## 下一步',
    '',
    '- 补充 raw/ 与 cleaned/ 中的真实音频素材',
    '- 根据素材质量更新 usableForRef / usableForAux / usableForTrain',
    '- 训练后回填 versions.json 与试听结论',
    '',
  ];

  fs.writeFileSync(summaryPath, `${lines.join('\n')}\n`, 'utf-8');
  console.log(`[voice-training] synced ${characterId}`);
}

ensureDir(trainingRoot);
characters.forEach(syncCharacter);
