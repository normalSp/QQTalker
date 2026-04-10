import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const SCRIPT_DIR = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(SCRIPT_DIR, '..', '..');
const TRAINING_ROOT = path.join(REPO_ROOT, 'data', 'voice-models', 'training');
const MODEL_ROOT = path.join(REPO_ROOT, 'data', 'voice-models');
const DEFAULT_TARGETS = [
  { label: 'dongxuelian-gpt', modelId: 'preset-dongxuelian', backend: 'gpt-sovits' },
  { label: 'dongxuelian-rvc', modelId: 'preset-dongxuelian-rvc', backend: 'rvc-compat' },
  { label: 'yongchutafi-gpt', modelId: 'preset-yongchutafi', backend: 'gpt-sovits' },
  { label: 'yongchutafi-rvc', modelId: 'preset-yongchutafi-rvc', backend: 'rvc-compat' },
];
const TARGET_PROFILES = {
  default: DEFAULT_TARGETS,
  'tafi-rvc': [
    { label: 'yongchutafi-gpt', modelId: 'preset-yongchutafi', backend: 'gpt-sovits' },
    { label: 'yongchutafi-rvc-v1', modelId: 'preset-yongchutafi-rvc', backend: 'rvc-compat' },
    { label: 'yongchutafi-rvc-v2', modelId: 'preset-yongchutafi-rvc-v2', backend: 'rvc-compat' },
  ],
};

function parseArgs(argv) {
  const options = {
    baseUrl: 'http://127.0.0.1:8765',
    targets: [],
    profile: 'default',
  };
  for (const raw of argv) {
    if (raw.startsWith('--base-url=')) {
      options.baseUrl = raw.slice('--base-url='.length);
    } else if (raw.startsWith('--target=')) {
      const value = raw.slice('--target='.length);
      const [label, modelId, backend] = value.split(',');
      if (label && modelId && backend) {
        options.targets.push({ label, modelId, backend });
      }
    } else if (raw.startsWith('--profile=')) {
      options.profile = raw.slice('--profile='.length) || 'default';
    }
  }
  return options;
}

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, 'utf8'));
}

function readJsonIfExists(filePath, fallbackValue) {
  if (!fs.existsSync(filePath)) return fallbackValue;
  return readJson(filePath);
}

function loadCatalogModels() {
  const catalogPath = path.join(MODEL_ROOT, 'catalog.json');
  const raw = readJsonIfExists(catalogPath, { models: [] });
  return Array.isArray(raw)
    ? raw
    : Array.isArray(raw.models)
      ? raw.models
      : [];
}

function resolveTargets(options) {
  const catalogModels = new Map(loadCatalogModels().map(item => [item.id, item]));
  const requestedTargets = options.targets.length
    ? options.targets
    : (TARGET_PROFILES[options.profile] || TARGET_PROFILES.default);
  return requestedTargets.filter(target => {
    const model = catalogModels.get(target.modelId);
    if (!model) return true;
    return model.installed !== false;
  });
}

function loadEvalCases() {
  const merged = [];
  const files = [
    path.join(TRAINING_ROOT, 'eval-sentences.json'),
    path.join(TRAINING_ROOT, 'eval-chat-samples.json'),
  ];
  for (const filePath of files) {
    const raw = readJsonIfExists(filePath, { cases: [] });
    for (const item of raw.cases || []) {
      if (!item || !item.id || !item.text) continue;
      merged.push(item);
    }
  }
  return { cases: merged };
}

function buildSummary(results) {
  const summary = {};
  for (const item of results) {
    const label = item.target.label;
    if (!summary[label]) {
      summary[label] = {
        total: 0,
        ok: 0,
        failed: 0,
        averageDurationMs: 0,
      };
    }
    summary[label].total += 1;
    if (item.error) {
      summary[label].failed += 1;
    } else {
      summary[label].ok += 1;
      summary[label].averageDurationMs += Number(item.durationMs || 0);
    }
  }
  for (const item of Object.values(summary)) {
    item.averageDurationMs = item.ok ? Math.round(item.averageDurationMs / item.ok) : 0;
  }
  return summary;
}

function buildScorecardTemplate(report, summary) {
  const lines = [
    '# Voice Subjective Scorecard',
    '',
    `- generatedAt: ${report.generatedAt}`,
    `- profile: ${report.profile}`,
    '',
    '## Targets',
    '',
    ...report.targets.map(target => `- ${target.label}: ${target.backend} / ${target.modelId}`),
    '',
    '## Summary',
    '',
    ...Object.entries(summary).map(([label, item]) =>
      `- ${label}: ok ${item.ok}/${item.total}, failed ${item.failed}, avg ${item.averageDurationMs}ms`
    ),
    '',
    '## Subjective Rubric',
    '',
    '- 清晰度: 1-5',
    '- 贴脸度: 1-5',
    '- 长句稳定性: 1-5',
    '- 机械感: 1-5 (分数越高越轻微)',
    '- 延迟体感: 1-5',
    '',
    '## Notes Template',
    '',
    ...report.targets.map(target => `### ${target.label}\n- 优点:\n- 问题:\n- 是否适合默认链路:`),
    '',
  ];
  return lines.join('\n');
}

function mimeToExt(mimeType) {
  if (mimeType === 'audio/wav' || mimeType === 'audio/x-wav') return 'wav';
  if (mimeType === 'audio/mpeg') return 'mp3';
  if (mimeType === 'audio/flac') return 'flac';
  return 'bin';
}

async function preview(baseUrl, target, text) {
  const res = await fetch(`${baseUrl.replace(/\/$/, '')}/preview`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      text,
      modelId: target.modelId,
      backend: target.backend,
      preview: true,
      speed: 1,
    }),
  });
  const data = await res.json().catch(() => null);
  if (!res.ok || !data?.success) {
    throw new Error(data?.detail || data?.error || `${target.label} 试听失败`);
  }
  return data;
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  const evalCases = loadEvalCases();
  const targets = resolveTargets(options);
  if (!targets.length) {
    throw new Error(`没有可评测的目标，请检查 profile=${options.profile} 或显式传入 --target`);
  }
  const stamp = new Date().toISOString().replace(/[:.]/g, '-');
  const outDir = path.join(TRAINING_ROOT, 'eval-results', stamp);
  fs.mkdirSync(outDir, { recursive: true });
  const report = {
    generatedAt: new Date().toISOString(),
    baseUrl: options.baseUrl,
    profile: options.profile,
    targets,
    results: [],
  };

  for (const entry of evalCases.cases || []) {
    for (const target of targets) {
      try {
        const result = await preview(options.baseUrl, target, entry.text);
        const ext = mimeToExt(result.mimeType || 'audio/wav');
        const fileName = `${entry.id}__${target.label}.${ext}`;
        fs.writeFileSync(path.join(outDir, fileName), Buffer.from(result.audioBase64, 'base64'));
        report.results.push({
          caseId: entry.id,
          text: entry.text,
          tags: entry.tags || [],
          target,
          output: fileName,
          warnings: result.warnings || [],
          durationMs: result.durationMs,
        });
        console.log(`[ok] ${entry.id} -> ${target.label}`);
      } catch (error) {
        report.results.push({
          caseId: entry.id,
          text: entry.text,
          tags: entry.tags || [],
          target,
          error: error instanceof Error ? error.message : String(error),
        });
        console.log(`[fail] ${entry.id} -> ${target.label}`);
      }
    }
  }

  const summary = buildSummary(report.results);
  fs.writeFileSync(path.join(outDir, 'report.json'), JSON.stringify(report, null, 2) + '\n', 'utf8');
  fs.writeFileSync(path.join(outDir, 'summary.json'), JSON.stringify(summary, null, 2) + '\n', 'utf8');
  const lines = [
    '# Voice A/B Eval',
    '',
    `- generatedAt: ${report.generatedAt}`,
    `- baseUrl: ${report.baseUrl}`,
    `- profile: ${report.profile}`,
    '',
  ];
  for (const item of report.results) {
    lines.push(`## ${item.caseId} / ${item.target.label}`);
    lines.push('');
    lines.push(`- text: ${item.text}`);
    if (item.output) lines.push(`- output: ${item.output}`);
    if (item.durationMs !== undefined) lines.push(`- durationMs: ${item.durationMs}`);
    if (item.warnings?.length) lines.push(`- warnings: ${item.warnings.join(', ')}`);
    if (item.error) lines.push(`- error: ${item.error}`);
    lines.push('');
  }
  fs.writeFileSync(path.join(outDir, 'report.md'), lines.join('\n'), 'utf8');
  fs.writeFileSync(path.join(outDir, 'subjective-scorecard.template.md'), buildScorecardTemplate(report, summary), 'utf8');
  console.log(`评测结果已写入 ${outDir}`);
}

main();
