import fs from 'fs';
import path from 'path';
import type {
  PluginInstallerRequest,
  PluginInstallerResult,
  PluginPackageAdapter,
  PluginPackageInspection,
  PluginRegistryEntry,
} from './plugin-types';

export class PluginAdapterRegistry {
  private readonly adapters: PluginPackageAdapter[] = [];

  register(adapter: PluginPackageAdapter): void {
    if (this.adapters.some(item => item.id === adapter.id)) return;
    this.adapters.push(adapter);
  }

  list(): PluginPackageAdapter[] {
    return [...this.adapters];
  }

  async match(sourcePath: string): Promise<PluginPackageAdapter | undefined> {
    for (const adapter of this.adapters) {
      if (await adapter.canHandle(sourcePath)) {
        return adapter;
      }
    }
    return undefined;
  }

  async inspect(sourcePath: string): Promise<PluginPackageInspection> {
    const adapter = await this.match(sourcePath);
    if (!adapter) {
      return { type: 'unknown', warnings: ['No compatible adapter matched this package.'] };
    }
    return adapter.inspect(sourcePath);
  }

  async install(sourcePath: string, request: PluginInstallerRequest): Promise<PluginInstallerResult> {
    const adapter = await this.match(sourcePath);
    if (!adapter || !adapter.install) {
      return { success: false, error: 'No installable adapter matched this package.' };
    }
    return adapter.install(sourcePath, request);
  }
}

export function resolveManifestPath(baseDir: string): string | null {
  const candidates = [
    path.join(baseDir, 'qqtalker.plugin.json'),
    path.join(baseDir, 'package.json'),
  ];
  for (const filePath of candidates) {
    if (fs.existsSync(filePath)) return filePath;
  }
  return null;
}

export function makeAdapterEntry(base: PluginRegistryEntry, adapterType: string): PluginRegistryEntry {
  return {
    ...base,
    adapterType,
    installSource: {
      ...base.installSource,
      type: 'adapter',
    },
  };
}
