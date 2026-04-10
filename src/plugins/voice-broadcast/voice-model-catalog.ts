import fs from 'fs';
import path from 'path';
import { BUILTIN_VOICE_PRESETS } from './builtin-presets';
import type { VoiceModelEntry } from './types';

function resolveModelAsset(assetPath: string | undefined, baseDir?: string): string | undefined {
  if (!assetPath) return undefined;
  if (path.isAbsolute(assetPath)) return assetPath;
  return baseDir ? path.resolve(baseDir, assetPath) : path.resolve(assetPath);
}

function normalizeModel(input: Partial<VoiceModelEntry>, baseDir?: string): VoiceModelEntry | null {
  if (!input.id || !input.name || !input.backend) {
    return null;
  }

  const modelPath = resolveModelAsset(input.modelPath, baseDir);
  const refAudioPath = resolveModelAsset(input.refAudioPath, baseDir);
  const auxPaths = Array.isArray(input.auxPaths)
    ? input.auxPaths.map(item => resolveModelAsset(item, baseDir)).filter((item): item is string => Boolean(item))
    : undefined;

  const installed = typeof input.installed === 'boolean'
    ? input.installed
    : (modelPath
      ? fs.existsSync(modelPath)
      : refAudioPath
        ? fs.existsSync(refAudioPath)
        : false);

  return {
    id: input.id,
    name: input.name,
    character: input.character,
    backend: input.backend,
    tags: input.tags || [],
    avatar: input.avatar,
    sampleText: input.sampleText,
    notes: input.notes,
    installed,
    enabled: input.enabled !== false,
    source: input.source || 'catalog',
    modelPath,
    refAudioPath,
    promptText: input.promptText,
    promptLang: input.promptLang,
    auxPaths,
    upstreamPath: input.upstreamPath,
    recommendedBackend: input.recommendedBackend,
    alternateBackends: input.alternateBackends || [],
    qualityTier: input.qualityTier,
    trainingStatus: input.trainingStatus,
    previewHint: input.previewHint,
    experimental: input.experimental === true,
    backendOverrides: input.backendOverrides || {},
    diagnostics: input.diagnostics,
  };
}

function collectVoiceMetaFiles(dir: string, results: string[] = []): string[] {
  if (!fs.existsSync(dir)) return results;
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      collectVoiceMetaFiles(fullPath, results);
      continue;
    }
    if (entry.isFile() && entry.name === 'voice-model.json') {
      results.push(fullPath);
    }
  }
  return results;
}

export class VoiceModelCatalog {
  constructor(private readonly modelDir: string) {}

  listLocalModels(): VoiceModelEntry[] {
    const merged = new Map<string, VoiceModelEntry>();
    for (const model of BUILTIN_VOICE_PRESETS) {
      merged.set(model.id, { ...model });
    }

    for (const model of this.loadCatalogJson()) {
      merged.set(model.id, {
        ...(merged.get(model.id) || {}),
        ...model,
      });
    }

    for (const model of this.loadVoiceMetaFiles()) {
      merged.set(model.id, {
        ...(merged.get(model.id) || {}),
        ...model,
      });
    }

    return Array.from(merged.values()).sort((a, b) => {
      const aInstalled = a.installed ? 0 : 1;
      const bInstalled = b.installed ? 0 : 1;
      if (aInstalled !== bInstalled) return aInstalled - bInstalled;
      return a.name.localeCompare(b.name, 'zh-CN');
    });
  }

  private loadCatalogJson(): VoiceModelEntry[] {
    const catalogPath = path.resolve(this.modelDir, 'catalog.json');
    if (!fs.existsSync(catalogPath)) {
      return [];
    }

    try {
      const raw = JSON.parse(fs.readFileSync(catalogPath, 'utf-8'));
      const rows = Array.isArray(raw)
        ? raw
        : Array.isArray(raw.models)
          ? raw.models
          : [];
      return rows
        .map((item: Partial<VoiceModelEntry>) => normalizeModel(item, this.modelDir))
        .filter((item: VoiceModelEntry | null): item is VoiceModelEntry => Boolean(item));
    } catch {
      return [];
    }
  }

  private loadVoiceMetaFiles(): VoiceModelEntry[] {
    return collectVoiceMetaFiles(this.modelDir)
      .map(filePath => {
        try {
          const raw = JSON.parse(fs.readFileSync(filePath, 'utf-8'));
          const model = normalizeModel({
            ...raw,
          }, path.dirname(filePath));
          return model;
        } catch {
          return null;
        }
      })
      .filter((item: VoiceModelEntry | null): item is VoiceModelEntry => Boolean(item));
  }
}
