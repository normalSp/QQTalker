import fs from 'fs';
import {
  getPluginConfigPath,
  readJsonFile,
  writeJsonFile,
} from './plugin-fs';

export class PluginConfigService {
  getConfigPath(pluginId: string): string {
    return getPluginConfigPath(pluginId);
  }

  getConfig<T = Record<string, unknown>>(pluginId: string, defaults?: Record<string, unknown>): T {
    const filePath = this.getConfigPath(pluginId);
    const current = readJsonFile<Record<string, unknown>>(filePath, {});
    return {
      ...(defaults || {}),
      ...current,
    } as T;
  }

  setConfig(pluginId: string, values: Record<string, unknown>): Record<string, unknown> {
    const filePath = this.getConfigPath(pluginId);
    writeJsonFile(filePath, values || {});
    return this.getConfig(pluginId);
  }

  mergeConfig(pluginId: string, values: Record<string, unknown>): Record<string, unknown> {
    const next = {
      ...this.getConfig(pluginId),
      ...(values || {}),
    };
    return this.setConfig(pluginId, next);
  }

  deleteConfig(pluginId: string): void {
    const filePath = this.getConfigPath(pluginId);
    if (fs.existsSync(filePath)) {
      fs.unlinkSync(filePath);
    }
  }
}
