import fs from 'fs';
import path from 'path';
import {
  getPluginConfigPath,
} from './plugin-fs';
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

function readMetadata(sourcePath: string): { name?: string; version?: string; repo?: string; desc?: string } {
  const metadataPath = path.join(sourcePath, 'metadata.yaml');
  if (!fs.existsSync(metadataPath)) return {};
  const content = fs.readFileSync(metadataPath, 'utf-8');
  const readField = (field: string): string | undefined => {
    const match = content.match(new RegExp(`^\\s*${field}:\\s*([^\\r\\n]+)`, 'm'));
    return match ? match[1].trim() : undefined;
  };
  return {
    name: readField('name'),
    version: readField('version'),
    repo: readField('repo'),
    desc: readField('desc'),
  };
}

function buildBridgeManifest(sourcePath: string): PluginManifest {
  const metadata = readMetadata(sourcePath);
  const normalizedName = (metadata.name || path.basename(sourcePath)).replace(/[^a-zA-Z0-9._-]+/g, '-').toLowerCase();
  const pluginId = `astrbot-${normalizedName}`;
  return {
    id: pluginId,
    name: `AstrBot Bridge: ${metadata.name || path.basename(sourcePath)}`,
    version: metadata.version || '0.1.0',
    description: metadata.desc || 'Bridge wrapper for an AstrBot plugin package.',
    sourceType: 'adapter',
    runtimeMode: 'bridge',
    permissions: ['adapter.bridge', 'dashboard.page', 'config.read', 'config.write'],
    hooks: ['dashboard', 'config'],
    capabilities: ['bridge', 'dashboard-page'],
    adapter: {
      type: 'astrbot-bridge',
      target: 'astrbot',
    },
    ui: {
      mode: 'hybrid',
      pages: [
        {
          id: 'overview',
          title: '桥接概览',
          routePath: `/plugins/${pluginId}/page/overview`,
          description: '查看 AstrBot 插件桥接状态与接入说明。',
        },
      ],
    },
  };
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
    const manifest = buildBridgeManifest(sourcePath);
    const warnings: string[] = [
      'AstrBot plugins are not executed natively inside QQTalker.',
      'This package will be installed as a bridge target and needs an external AstrBot runtime.',
    ];
    if (fs.existsSync(path.join(sourcePath, 'webui.py'))) {
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
