import fs from 'fs';
import path from 'path';
import {
  getPluginConfigPath,
} from './plugin-fs';
import { buildAstrBotBridgeManifest, hasAstrBotWebUi } from './astrbot-bridge-support';
import type {
  PluginBridgeInstance,
  PluginInstallerRequest,
  PluginInstallerResult,
  PluginManifest,
  PluginPackageInspection,
  PluginRegistryEntry,
  PluginRuntimeContext,
  PluginPackageAdapter,
} from './plugin-types';

function nowIso(): string {
  return new Date().toISOString();
}

function buildRegistryEntry(manifest: PluginManifest, request: PluginInstallerRequest, sourcePath: string): PluginRegistryEntry {
  const timestamp = nowIso();
  return {
    id: manifest.id,
    name: manifest.name,
    version: manifest.version,
    enabled: request.enable !== false,
    description: manifest.description,
    installSource: {
      type: 'adapter',
      upstreamType: request.source,
      locator: request.locator,
      ref: request.ref,
      resolvedPath: sourcePath,
      installedAt: timestamp,
    },
    manifestPath: sourcePath,
    adapterType: 'astrbot-bridge',
    configPath: getPluginConfigPath(manifest.id),
    runtime: {
      mode: 'bridge',
      status: request.enable === false ? 'disabled' : 'degraded',
      enabled: request.enable !== false,
      initializedAt: timestamp,
      healthMessage: 'AstrBot bridge installed. Awaiting external runtime hookup.',
    },
    createdAt: timestamp,
    updatedAt: timestamp,
  };
}

export class AstrBotBridgeAdapter implements PluginPackageAdapter {
  readonly id = 'astrbot-bridge';

  async canHandle(sourcePath: string): Promise<boolean> {
    const required = ['metadata.yaml', 'config.py'];
    return required.every(fileName => fs.existsSync(path.join(sourcePath, fileName)));
  }

  async inspect(sourcePath: string): Promise<PluginPackageInspection> {
    const manifest = buildAstrBotBridgeManifest(sourcePath);
    const warnings: string[] = [
      'AstrBot plugins are not executed natively inside QQTalker.',
      'This package will be installed as a bridge target and needs an external AstrBot runtime.',
    ];
    if (hasAstrBotWebUi(sourcePath)) {
      warnings.push('Detected AstrBot WebUI entry. Consider exposing it through a reverse proxy later.');
    }
    return {
      type: 'adapter',
      manifest,
      adapterType: this.id,
      manifestPath: sourcePath,
      warnings,
    };
  }

  async install(sourcePath: string, request: PluginInstallerRequest): Promise<PluginInstallerResult> {
    const inspection = await this.inspect(sourcePath);
    if (!inspection.manifest) {
      return { success: false, error: 'Unable to inspect AstrBot plugin package.' };
    }
    return {
      success: true,
      manifest: inspection.manifest,
      entry: buildRegistryEntry(inspection.manifest, request, sourcePath),
      resolvedPath: sourcePath,
      warnings: inspection.warnings,
    };
  }

  async createBridge(context: PluginRuntimeContext): Promise<PluginBridgeInstance | null> {
    return {
      getHealthReport() {
        return {
          status: 'degraded',
          checkedAt: nowIso(),
          message: `Bridge placeholder for ${context.manifest.name}. External AstrBot runtime is not attached yet.`,
        };
      },
    };
  }
}
