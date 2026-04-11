import fs from 'fs';
import path from 'path';

function resolvePluginDataRoot(): string {
  const overrideRoot = String(process.env.QQTALKER_PLUGIN_DATA_ROOT || '').trim();
  if (overrideRoot) {
    return path.resolve(overrideRoot);
  }
  return path.resolve(process.cwd(), 'data/plugins');
}

export function ensureDirectory(dirPath: string): string {
  fs.mkdirSync(dirPath, { recursive: true });
  return dirPath;
}

export function getPluginDataRoot(): string {
  return ensureDirectory(resolvePluginDataRoot());
}

export function getPluginRegistryPath(): string {
  return path.join(getPluginDataRoot(), 'registry.json');
}

export function getPluginLockPath(): string {
  return path.join(getPluginDataRoot(), 'lock.json');
}

export function getPluginPackagesRoot(): string {
  return ensureDirectory(path.join(getPluginDataRoot(), 'packages'));
}

export function getPluginRuntimeRoot(): string {
  return ensureDirectory(path.join(getPluginDataRoot(), 'runtime'));
}

export function getPluginConfigRoot(): string {
  return ensureDirectory(path.join(getPluginDataRoot(), 'config'));
}

export function getPluginPackageDir(pluginId: string): string {
  return ensureDirectory(path.join(getPluginPackagesRoot(), sanitizePluginId(pluginId)));
}

export function getPluginRuntimeDir(pluginId: string): string {
  return ensureDirectory(path.join(getPluginRuntimeRoot(), sanitizePluginId(pluginId)));
}

export function getPluginConfigPath(pluginId: string): string {
  return path.join(getPluginConfigRoot(), `${sanitizePluginId(pluginId)}.json`);
}

export function sanitizePluginId(pluginId: string): string {
  return String(pluginId || 'unknown')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9._-]+/g, '-')
    .replace(/^-+|-+$/g, '') || 'plugin';
}

export function readJsonFile<T>(filePath: string, fallback: T): T {
  try {
    if (!fs.existsSync(filePath)) return fallback;
    return JSON.parse(fs.readFileSync(filePath, 'utf-8')) as T;
  } catch {
    return fallback;
  }
}

export function writeJsonFile(filePath: string, value: unknown): void {
  ensureDirectory(path.dirname(filePath));
  fs.writeFileSync(filePath, JSON.stringify(value, null, 2) + '\n', 'utf-8');
}
