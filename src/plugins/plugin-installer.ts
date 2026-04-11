import fs from 'fs';
import path from 'path';
import { execFileSync } from 'child_process';
import { logger } from '../logger';
import {
  getPluginConfigPath,
  getPluginPackageDir,
  sanitizePluginId,
} from './plugin-fs';
import { PluginAdapterRegistry, resolveManifestPath } from './plugin-adapters';
import type {
  PluginInstallerRequest,
  PluginInstallerResult,
  PluginManifest,
  PluginRegistryEntry,
} from './plugin-types';

interface PackageJsonWithPlugin {
  name?: string;
  version?: string;
  description?: string;
  main?: string;
  qqtalkerPlugin?: Partial<PluginManifest>;
}

function nowIso(): string {
  return new Date().toISOString();
}

function readJson<T>(filePath: string): T | null {
  try {
    return JSON.parse(fs.readFileSync(filePath, 'utf-8')) as T;
  } catch {
    return null;
  }
}

function loadLegacyModuleManifest(sourcePath: string): PluginManifest | null {
  try {
    const mod = require(sourcePath);
    const candidate = mod.default || mod.plugin || mod;
    if (!candidate || typeof candidate !== 'object' || !candidate.id) {
      return null;
    }
    const manifest = candidate.manifest as Partial<PluginManifest> | undefined;
    return {
      id: String(candidate.id),
      name: String(candidate.name || candidate.id),
      version: String(manifest?.version || '0.1.0'),
      description: manifest?.description,
      entry: sourcePath,
      sourceType: 'local',
      runtimeMode: manifest?.runtimeMode || 'in-process',
      permissions: manifest?.permissions || ['message.read'],
      hooks: manifest?.hooks || ['message', 'command', 'prompt'],
      capabilities: manifest?.capabilities || [],
      ui: manifest?.ui || { mode: 'none' },
    };
  } catch {
    return null;
  }
}

function readNativeManifest(sourcePath: string): { manifest: PluginManifest; manifestPath: string } | null {
  const stat = fs.existsSync(sourcePath) ? fs.statSync(sourcePath) : null;
  if (!stat) return null;

  if (stat.isFile() && sourcePath.endsWith('.js')) {
    const manifest = loadLegacyModuleManifest(sourcePath);
    if (!manifest) return null;
    return {
      manifest: manifest,
      manifestPath: sourcePath,
    };
  }

  const manifestPath = resolveManifestPath(sourcePath);
  if (!manifestPath) return null;

  if (path.basename(manifestPath) === 'qqtalker.plugin.json') {
    const manifest = readJson<PluginManifest>(manifestPath);
    if (!manifest?.id || !manifest?.name) return null;
    return {
      manifest: {
        runtimeMode: 'in-process',
        sourceType: 'local',
        permissions: [],
        hooks: [],
        capabilities: [],
        ui: { mode: 'none' },
        ...manifest,
      },
      manifestPath,
    };
  }

  const pkg = readJson<PackageJsonWithPlugin>(manifestPath);
  if (!pkg) return null;
  const pluginBlock = pkg.qqtalkerPlugin || {};
  const inferredId = pluginBlock.id || pkg.name;
  if (!inferredId) return null;
  const manifest: PluginManifest = {
    id: inferredId,
    name: pluginBlock.name || pkg.name || inferredId,
    version: pluginBlock.version || pkg.version || '0.1.0',
    description: pluginBlock.description || pkg.description,
    entry: pluginBlock.entry || pkg.main || 'dist/index.js',
    sourceType: pluginBlock.sourceType || 'local',
    runtimeMode: pluginBlock.runtimeMode || 'in-process',
    engine: pluginBlock.engine,
    permissions: pluginBlock.permissions || [],
    hooks: pluginBlock.hooks || [],
    configSchema: pluginBlock.configSchema,
    ui: pluginBlock.ui || { mode: 'none' },
    capabilities: pluginBlock.capabilities || [],
    adapter: pluginBlock.adapter,
  };
  return {
    manifest,
    manifestPath,
  };
}

function buildRegistryEntry(
  manifest: PluginManifest,
  request: PluginInstallerRequest,
  manifestPath: string,
  resolvedPath: string,
): PluginRegistryEntry {
  const timestamp = nowIso();
  return {
    id: manifest.id,
    name: manifest.name,
    version: manifest.version,
    enabled: request.enable !== false,
    description: manifest.description,
    installSource: {
      type: request.source,
      locator: request.locator,
      ref: request.ref,
      resolvedPath,
      packageName: manifest.id,
      resolvedVersion: manifest.version,
      installedAt: timestamp,
    },
    manifestPath,
    configPath: getPluginConfigPath(manifest.id),
    runtime: {
      mode: manifest.runtimeMode || 'in-process',
      status: request.enable === false ? 'disabled' : 'inactive',
      enabled: request.enable !== false,
    },
    createdAt: timestamp,
    updatedAt: timestamp,
  };
}

function ensureWorkspacePackage(workspaceDir: string): void {
  fs.mkdirSync(workspaceDir, { recursive: true });
  const packageJsonPath = path.join(workspaceDir, 'package.json');
  if (!fs.existsSync(packageJsonPath)) {
    fs.writeFileSync(packageJsonPath, JSON.stringify({
      name: `qqtalker-plugin-workspace-${path.basename(workspaceDir)}`,
      private: true,
    }, null, 2) + '\n', 'utf-8');
  }
}

export class PluginInstaller {
  constructor(private readonly adapters: PluginAdapterRegistry) {}

  async inspectSource(sourcePath: string): Promise<PluginInstallerResult> {
    const native = readNativeManifest(sourcePath);
    if (native) {
      return {
        success: true,
        manifest: native.manifest,
        resolvedPath: sourcePath,
      };
    }
    return this.adapters.install(sourcePath, {
      source: 'local',
      locator: sourcePath,
      enable: true,
    });
  }

  async install(request: PluginInstallerRequest): Promise<PluginInstallerResult> {
    try {
      const stagedPath = this.prepareSource(request);
      const native = readNativeManifest(stagedPath);
      if (native) {
        const entry = buildRegistryEntry(native.manifest, request, native.manifestPath, stagedPath);
        return {
          success: true,
          entry,
          manifest: native.manifest,
          resolvedPath: stagedPath,
        };
      }

      const adapted = await this.adapters.install(stagedPath, request);
      if (adapted.success) return adapted;

      return {
        success: false,
        error: adapted.error || 'Unable to recognize plugin package format.',
      };
    } catch (error: any) {
      logger.error({ error, request }, '[PluginInstaller] install failed');
      return {
        success: false,
        error: error?.message || String(error),
      };
    }
  }

  private prepareSource(request: PluginInstallerRequest): string {
    if (request.source === 'local') {
      const resolved = path.isAbsolute(request.locator)
        ? request.locator
        : path.resolve(process.cwd(), request.locator);
      if (!fs.existsSync(resolved)) {
        throw new Error(`Plugin source not found: ${resolved}`);
      }
      return resolved;
    }

    if (request.source === 'npm') {
      const workspaceDir = getPluginPackageDir(sanitizePluginId(request.locator));
      ensureWorkspacePackage(workspaceDir);
      execFileSync('npm', ['install', '--no-save', '--no-package-lock', request.locator], {
        cwd: workspaceDir,
        stdio: 'pipe',
      });
      const packageName = request.locator.startsWith('@')
        ? request.locator.split('@').slice(1).join('@').split('/').slice(0, 2).join('/')
        : request.locator.split('@')[0];
      const resolvedPath = path.join(workspaceDir, 'node_modules', packageName);
      if (!fs.existsSync(resolvedPath)) {
        throw new Error(`Installed npm package was not found: ${resolvedPath}`);
      }
      return resolvedPath;
    }

    if (request.source === 'git') {
      const targetDir = path.join(getPluginPackageDir(sanitizePluginId(request.locator)), 'source');
      if (fs.existsSync(targetDir)) {
        fs.rmSync(targetDir, { recursive: true, force: true });
      }
      const args = ['clone', '--depth', '1'];
      if (request.ref) {
        args.push('--branch', request.ref);
      }
      args.push(request.locator, targetDir);
      execFileSync('git', args, {
        cwd: process.cwd(),
        stdio: 'pipe',
      });
      return targetDir;
    }

    throw new Error(`Unsupported plugin source: ${request.source}`);
  }
}
