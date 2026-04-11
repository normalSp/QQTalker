import type { PluginDashboardPage, PluginManifest } from './plugin-types';

export interface PluginUiRegistration {
  pluginId: string;
  manifest: PluginManifest;
  pages: PluginDashboardPage[];
}

export class PluginUiRegistry {
  private readonly registrations = new Map<string, PluginUiRegistration>();

  register(pluginId: string, manifest: PluginManifest, pages: PluginDashboardPage[]): void {
    this.registrations.set(pluginId, {
      pluginId,
      manifest,
      pages: pages.slice(),
    });
  }

  unregister(pluginId: string): void {
    this.registrations.delete(pluginId);
  }

  get(pluginId: string): PluginUiRegistration | undefined {
    return this.registrations.get(pluginId);
  }

  list(): PluginUiRegistration[] {
    return Array.from(this.registrations.values())
      .sort((a, b) => a.manifest.name.localeCompare(b.manifest.name, 'zh-CN'));
  }
}
