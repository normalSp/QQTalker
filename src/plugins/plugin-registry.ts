import fs from 'fs';
import {
  getPluginLockPath,
  getPluginRegistryPath,
  readJsonFile,
  writeJsonFile,
} from './plugin-fs';
import type {
  PluginInstallSource,
  PluginRegistryEntry,
  PluginRuntimeState,
} from './plugin-types';

interface PluginLockData {
  updatedAt: string;
  plugins: Array<{
    id: string;
    version: string;
    source: PluginInstallSource;
    runtime: PluginRuntimeState;
  }>;
}

function nowIso(): string {
  return new Date().toISOString();
}

export class PluginRegistry {
  list(): PluginRegistryEntry[] {
    return readJsonFile<PluginRegistryEntry[]>(getPluginRegistryPath(), []);
  }

  get(pluginId: string): PluginRegistryEntry | undefined {
    return this.list().find(item => item.id === pluginId);
  }

  has(pluginId: string): boolean {
    return Boolean(this.get(pluginId));
  }

  upsert(entry: PluginRegistryEntry): PluginRegistryEntry {
    const items = this.list();
    const index = items.findIndex(item => item.id === entry.id);
    const normalized = {
      ...entry,
      updatedAt: nowIso(),
    };
    if (index >= 0) {
      items[index] = normalized;
    } else {
      items.push(normalized);
    }
    this.save(items);
    return normalized;
  }

  remove(pluginId: string): void {
    const items = this.list().filter(item => item.id !== pluginId);
    this.save(items);
  }

  setEnabled(pluginId: string, enabled: boolean): PluginRegistryEntry | undefined {
    const entry = this.get(pluginId);
    if (!entry) return undefined;
    return this.upsert({
      ...entry,
      enabled,
      runtime: {
        ...entry.runtime,
        enabled,
        status: enabled ? entry.runtime.status : 'disabled',
      },
    });
  }

  setRuntimeState(pluginId: string, nextRuntime: Partial<PluginRuntimeState>): PluginRegistryEntry | undefined {
    const entry = this.get(pluginId);
    if (!entry) return undefined;
    return this.upsert({
      ...entry,
      runtime: {
        ...entry.runtime,
        ...nextRuntime,
      },
    });
  }

  private save(items: PluginRegistryEntry[]): void {
    writeJsonFile(getPluginRegistryPath(), items);
    const lockData: PluginLockData = {
      updatedAt: nowIso(),
      plugins: items.map(item => ({
        id: item.id,
        version: item.version,
        source: item.installSource,
        runtime: item.runtime,
      })),
    };
    writeJsonFile(getPluginLockPath(), lockData);
  }

  ensureBuiltin(entry: PluginRegistryEntry): PluginRegistryEntry {
    const existing = this.get(entry.id);
    if (existing) {
      return this.upsert({
        ...existing,
        name: entry.name,
        description: entry.description,
        version: entry.version,
        builtin: true,
        installSource: entry.installSource,
        manifestPath: entry.manifestPath || existing.manifestPath,
        configPath: entry.configPath || existing.configPath,
      });
    }
    return this.upsert(entry);
  }

  pruneMissingNonBuiltin(): void {
    const items = this.list();
    const next = items.filter(item => item.builtin || !item.manifestPath || fs.existsSync(item.manifestPath));
    if (next.length !== items.length) {
      this.save(next);
    }
  }
}
