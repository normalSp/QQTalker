import fs from 'fs';
import path from 'path';
import { logger } from '../logger';
import { config } from '../types/config';
import { AstrBotBridgeAdapter } from './astrbot-bridge-adapter';
import { AstrBotMemeManagerBridgePlugin } from './astrbot-meme-manager-bridge';
import { PluginAdapterRegistry } from './plugin-adapters';
import { PluginConfigService } from './plugin-config-service';
import { ensureDirectory, getPluginConfigPath, getPluginDataRoot, getPluginRuntimeDir } from './plugin-fs';
import { PluginInstaller } from './plugin-installer';
import { PluginRegistry } from './plugin-registry';
import { PluginUiRegistry } from './plugin-ui-registry';
import type {
  DashboardRouteProvider,
  PluginCommandContext,
  PluginCommandResult,
  PluginConfigSchema,
  PluginContext,
  PluginHealthReport,
  PluginInstallerRequest,
  PluginManifest,
  PluginMessageContext,
  PluginModelRequestContext,
  PluginModelRequestResult,
  PluginModelResponseContext,
  PluginRegistryEntry,
  PluginRuntimeContext,
  PromptHookContext,
  QQTalkerPlugin,
} from './plugin-types';

interface PluginLogEntry {
  level: 'debug' | 'info' | 'warn' | 'error';
  timestamp: string;
  message: string;
  extra?: Record<string, unknown>;
}

interface ManagedPluginRecord {
  plugin: QQTalkerPlugin | null;
  manifest: PluginManifest;
  registryEntry: PluginRegistryEntry;
  runtimeContext?: PluginRuntimeContext;
  sourcePath?: string;
  routes: DashboardRouteProvider[];
  configSchema?: PluginConfigSchema;
  logs: PluginLogEntry[];
  initialized: boolean;
}

function nowIso(): string {
  return new Date().toISOString();
}

function inferPluginSourceType(locator: string): 'local' | 'npm' | 'git' {
  const value = String(locator || '').trim();
  if (!value) return 'local';
  if (/^(https?:\/\/|git@|ssh:\/\/)/i.test(value) || /\.git(?:#.*)?$/i.test(value)) {
    return 'git';
  }
  if (path.isAbsolute(value) || value.startsWith('.') || value.includes('\\') || value.includes('/')) {
    return 'local';
  }
  return 'npm';
}

function buildLegacyManifest(plugin: QQTalkerPlugin, sourceType: PluginManifest['sourceType']): PluginManifest {
  return {
    id: plugin.id,
    name: plugin.name,
    version: plugin.manifest?.version || '0.1.0',
    description: plugin.manifest?.description,
    entry: plugin.manifest?.entry,
    sourceType: sourceType || 'builtin',
    runtimeMode: plugin.manifest?.runtimeMode || 'in-process',
    permissions: plugin.manifest?.permissions || ['message.read'],
    hooks: plugin.manifest?.hooks || ['message', 'command', 'prompt'],
    ui: plugin.manifest?.ui || {
      mode: plugin.getDashboardPages?.()?.length ? 'hybrid' : 'none',
      pages: plugin.getDashboardPages?.(),
    },
    capabilities: plugin.manifest?.capabilities || [],
    engine: plugin.manifest?.engine,
    configSchema: plugin.manifest?.configSchema,
    adapter: plugin.manifest?.adapter,
  };
}

function resolveModuleEntry(sourcePath: string): string {
  const stat = fs.statSync(sourcePath);
  if (stat.isFile()) return sourcePath;
  const pluginManifestPath = path.join(sourcePath, 'qqtalker.plugin.json');
  if (fs.existsSync(pluginManifestPath)) {
    const manifest = JSON.parse(fs.readFileSync(pluginManifestPath, 'utf-8')) as PluginManifest;
    const entry = manifest.entry || 'dist/index.js';
    return path.resolve(sourcePath, entry);
  }
  const packageJsonPath = path.join(sourcePath, 'package.json');
  if (fs.existsSync(packageJsonPath)) {
    const pkg = JSON.parse(fs.readFileSync(packageJsonPath, 'utf-8')) as { main?: string; qqtalkerPlugin?: { entry?: string } };
    const entry = pkg.qqtalkerPlugin?.entry || pkg.main || 'dist/index.js';
    return path.resolve(sourcePath, entry);
  }
  return sourcePath;
}

export class PluginManager {
  private readonly registry = new PluginRegistry();
  private readonly configService = new PluginConfigService();
  private readonly uiRegistry = new PluginUiRegistry();
  private readonly adapters = new PluginAdapterRegistry();
  private readonly installer = new PluginInstaller(this.adapters);
  private readonly records: ManagedPluginRecord[] = [];
  private initialized = false;
  private context: PluginContext | null = null;

  constructor() {
    getPluginDataRoot();
    this.adapters.register(new AstrBotBridgeAdapter());
    this.registry.pruneMissingNonBuiltin();
  }

  register(plugin: QQTalkerPlugin): void {
    if (this.records.some(item => item.manifest.id === plugin.id)) {
      throw new Error(`Plugin already registered: ${plugin.id}`);
    }
    const manifest = {
      ...buildLegacyManifest(plugin, 'builtin'),
      ...plugin.manifest,
      id: plugin.id,
      name: plugin.name,
    };
    const entry = this.registry.ensureBuiltin({
      id: manifest.id,
      name: manifest.name,
      version: manifest.version,
      enabled: true,
      builtin: true,
      description: manifest.description,
      installSource: {
        type: 'builtin',
        locator: `builtin:${manifest.id}`,
        resolvedPath: manifest.entry,
        installedAt: nowIso(),
      },
      manifestPath: manifest.entry,
      configPath: getPluginConfigPath(manifest.id),
      runtime: {
        mode: manifest.runtimeMode || 'in-process',
        status: 'inactive',
        enabled: true,
      },
      createdAt: nowIso(),
      updatedAt: nowIso(),
    });
    this.records.push({
      plugin,
      manifest,
      registryEntry: entry,
      routes: [],
      configSchema: plugin.getConfigSchema?.(),
      logs: [],
      initialized: false,
    });
  }

  async loadExternalPlugins(): Promise<void> {
    for (const pluginPath of config.pluginPaths) {
      await this.loadPluginFromSource({
        source: 'local',
        locator: pluginPath,
        enable: true,
      }, false);
    }

    for (const entry of this.registry.list().filter(item => !item.builtin)) {
      if (!entry.installSource.resolvedPath || this.records.some(item => item.manifest.id === entry.id)) {
        continue;
      }
      await this.loadInstalledEntry(entry);
    }
  }

  async initialize(context: PluginContext): Promise<void> {
    if (this.initialized) return;
    this.context = context;
    for (const record of this.records) {
      if (!record.registryEntry.enabled || !record.plugin) continue;
      await this.initializeRecord(record);
    }
    this.initialized = true;
  }

  getDashboardRoutes(): DashboardRouteProvider[] {
    return this.records
      .filter(record => record.registryEntry.enabled)
      .flatMap(record => record.routes);
  }

  async onMessage(context: PluginMessageContext): Promise<void> {
    for (const record of this.activePluginRecords()) {
      const plugin = record.plugin;
      if (!plugin) continue;
      try {
        await plugin.onMessage?.(context);
        await plugin.onMessageReceived?.(context);
      } catch (error) {
        this.recordPluginError(record, '消息钩子执行失败', error);
      }
    }
  }

  async buildSystemPrefix(context: PromptHookContext): Promise<string | undefined> {
    const sections: string[] = [];
    for (const record of this.activePluginRecords()) {
      const plugin = record.plugin;
      if (!plugin) continue;
      try {
        const result = await plugin.beforeChat?.(context);
        if (!result?.sections?.length) continue;
        sections.push(`[${record.manifest.name}]`);
        sections.push(...result.sections);
      } catch (error) {
        this.recordPluginError(record, 'PromptHook 执行失败', error);
      }
    }
    return sections.length > 0 ? sections.join('\n') : undefined;
  }

  async beforeModelRequest(context: PluginModelRequestContext): Promise<PluginModelRequestResult | undefined> {
    let current: PluginModelRequestResult | undefined;
    for (const record of this.activePluginRecords()) {
      const plugin = record.plugin;
      if (!plugin?.beforeModelRequest) continue;
      try {
        const result = await plugin.beforeModelRequest({
          ...context,
          userMessage: current?.userMessage ?? context.userMessage,
          history: current?.history ?? context.history,
          systemPrefix: current?.systemPrefix ?? context.systemPrefix,
          systemPrompt: current?.systemPrompt ?? context.systemPrompt,
        });
        if (!result) continue;
        current = {
          ...current,
          ...result,
        };
        if (result.handled) return current;
      } catch (error) {
        this.recordPluginError(record, 'beforeModelRequest 执行失败', error);
      }
    }
    return current;
  }

  async afterModelResponse(context: PluginModelResponseContext): Promise<string> {
    let reply = context.reply;
    for (const record of this.activePluginRecords()) {
      const plugin = record.plugin;
      if (!plugin?.afterModelResponse) continue;
      try {
        const result = await plugin.afterModelResponse({
          ...context,
          reply,
        });
        if (result?.reply !== undefined) {
          reply = result.reply;
        }
      } catch (error) {
        this.recordPluginError(record, 'afterModelResponse 执行失败', error);
      }
    }
    return reply;
  }

  async handleCommand(context: PluginCommandContext): Promise<PluginCommandResult | undefined> {
    for (const record of this.activePluginRecords()) {
      const plugin = record.plugin;
      if (!plugin) continue;
      try {
        const result = await plugin.handleCommand?.(context);
        if (result?.handled) return result;
      } catch (error) {
        this.recordPluginError(record, '插件命令执行失败', error);
      }
    }
    return undefined;
  }

  async installPlugin(request: PluginInstallerRequest): Promise<{ success: boolean; plugin?: PluginRegistryEntry; error?: string; warnings?: string[] }> {
    const result = await this.loadPluginFromSource(request, true);
    if (!result.success || !result.record) {
      return { success: false, error: result.error, warnings: result.warnings };
    }
    if (this.context && result.record.plugin && result.record.registryEntry.enabled && !result.record.initialized) {
      await this.initializeRecord(result.record);
    }
    return {
      success: true,
      plugin: result.record.registryEntry,
      warnings: result.warnings,
    };
  }

  async updatePlugin(pluginId: string): Promise<{ success: boolean; error?: string }> {
    const entry = this.registry.get(pluginId);
    if (!entry) return { success: false, error: 'Plugin not found.' };
    if (entry.installSource.type === 'builtin') {
      return { success: false, error: 'Builtin plugins cannot be updated.' };
    }
    const sourceType = entry.installSource.type === 'adapter'
      ? (entry.installSource.upstreamType || inferPluginSourceType(entry.installSource.locator))
      : entry.installSource.type;
    await this.uninstallPlugin(pluginId, false);
    const result = await this.installPlugin({
      source: sourceType as 'local' | 'npm' | 'git',
      locator: entry.installSource.locator,
      ref: entry.installSource.ref,
      enable: entry.enabled,
    });
    return { success: result.success, error: result.error };
  }

  async enablePlugin(pluginId: string): Promise<{ success: boolean; error?: string }> {
    const record = this.records.find(item => item.manifest.id === pluginId);
    const entry = this.registry.setEnabled(pluginId, true);
    if (!entry) return { success: false, error: 'Plugin not found.' };
    if (record) {
      record.registryEntry = entry;
      if (this.context && record.plugin && !record.initialized) {
        await this.initializeRecord(record);
      } else if (record.runtimeContext && record.plugin?.onEnable) {
        await record.plugin.onEnable(record.runtimeContext);
      }
    }
    return { success: true };
  }

  async disablePlugin(pluginId: string): Promise<{ success: boolean; error?: string }> {
    const record = this.records.find(item => item.manifest.id === pluginId);
    const entry = this.registry.setEnabled(pluginId, false);
    if (!entry) return { success: false, error: 'Plugin not found.' };
    if (record) {
      record.registryEntry = entry;
      if (record.runtimeContext && record.plugin?.onDisable) {
        await record.plugin.onDisable(record.runtimeContext);
      }
    }
    return { success: true };
  }

  async uninstallPlugin(pluginId: string, removeFiles = true): Promise<{ success: boolean; error?: string }> {
    const record = this.records.find(item => item.manifest.id === pluginId);
    if (record?.plugin) {
      try {
        await record.plugin.dispose?.();
      } catch (error) {
        this.recordPluginError(record, '插件销毁失败', error);
      }
    }
    const index = this.records.findIndex(item => item.manifest.id === pluginId);
    if (index >= 0) {
      this.records.splice(index, 1);
    }
    const entry = this.registry.get(pluginId);
    this.uiRegistry.unregister(pluginId);
    this.registry.remove(pluginId);
    this.configService.deleteConfig(pluginId);
    if (removeFiles && entry?.installSource.resolvedPath && entry.installSource.type !== 'local' && fs.existsSync(entry.installSource.resolvedPath)) {
      fs.rmSync(entry.installSource.resolvedPath, { recursive: true, force: true });
    }
    return { success: true };
  }

  getPluginConfigSchema(pluginId: string): PluginConfigSchema | undefined {
    return this.records.find(item => item.manifest.id === pluginId)?.configSchema;
  }

  getPluginConfig(pluginId: string): Record<string, unknown> {
    const record = this.records.find(item => item.manifest.id === pluginId);
    const defaults = record?.plugin?.getDefaultConfig?.() || {};
    return this.configService.getConfig(pluginId, defaults);
  }

  async updatePluginConfig(pluginId: string, values: Record<string, unknown>): Promise<Record<string, unknown>> {
    const record = this.records.find(item => item.manifest.id === pluginId);
    const nextConfig = this.configService.setConfig(pluginId, values || {});
    if (record?.runtimeContext && record.plugin?.onConfigChanged) {
      await record.plugin.onConfigChanged(nextConfig, record.runtimeContext);
    }
    return nextConfig;
  }

  listPlugins(): Array<{
    id: string;
    name: string;
    version: string;
    enabled: boolean;
    builtin?: boolean;
    sourceType: string;
    status: string;
    description?: string;
    configurable: boolean;
    dashboardPages: number;
  }> {
    return this.records.map(record => ({
      id: record.manifest.id,
      name: record.manifest.name,
      version: record.manifest.version,
      enabled: record.registryEntry.enabled,
      builtin: record.registryEntry.builtin,
      sourceType: record.registryEntry.installSource.type,
      status: record.registryEntry.runtime.status,
      description: record.manifest.description,
      configurable: Boolean(record.configSchema?.fields?.length),
      dashboardPages: (record.manifest.ui?.pages || []).length,
    }));
  }

  getPluginDetail(pluginId: string): {
    manifest: PluginManifest;
    registry: PluginRegistryEntry;
    configSchema?: PluginConfigSchema;
    config: Record<string, unknown>;
    pages: ReturnType<PluginUiRegistry['get']>;
    health: PluginHealthReport;
  } | undefined {
    const record = this.records.find(item => item.manifest.id === pluginId);
    if (!record) return undefined;
    return {
      manifest: record.manifest,
      registry: record.registryEntry,
      configSchema: record.configSchema,
      config: this.getPluginConfig(pluginId),
      pages: this.uiRegistry.get(pluginId),
      health: {
        status: record.registryEntry.runtime.status,
        checkedAt: nowIso(),
        message: record.registryEntry.runtime.healthMessage,
      },
    };
  }

  getPluginLogs(pluginId: string): PluginLogEntry[] {
    return this.records.find(item => item.manifest.id === pluginId)?.logs.slice(-200) || [];
  }

  getPluginPages(): Array<{ pluginId: string; title: string; routePath: string; description?: string; icon?: string }> {
    return this.uiRegistry.list().flatMap(item =>
      item.pages.map(page => ({
        pluginId: item.pluginId,
        title: page.title,
        routePath: page.routePath,
        description: page.description,
        icon: page.icon,
      }))
    );
  }

  async dispose(): Promise<void> {
    for (const record of this.records) {
      if (!record.plugin) continue;
      try {
        await record.plugin.dispose?.();
      } catch (error) {
        this.recordPluginError(record, '插件销毁失败', error);
      }
    }
  }

  getContext(): PluginContext | null {
    return this.context;
  }

  private activePluginRecords(): ManagedPluginRecord[] {
    return this.records.filter(item => item.registryEntry.enabled && item.plugin);
  }

  private async loadPluginFromSource(
    request: PluginInstallerRequest,
    persistEntry: boolean,
  ): Promise<{ success: boolean; record?: ManagedPluginRecord; error?: string; warnings?: string[] }> {
    const installResult = await this.installer.install(request);
    if (!installResult.success || !installResult.entry || !installResult.manifest) {
      return {
        success: false,
        error: installResult.error || 'Unknown plugin install failure.',
        warnings: installResult.warnings,
      };
    }

    if (this.records.some(item => item.manifest.id === installResult.manifest!.id)) {
      return {
        success: true,
        record: this.records.find(item => item.manifest.id === installResult.manifest!.id),
        warnings: installResult.warnings,
      };
    }

    const resolvedPath = installResult.resolvedPath || installResult.entry.installSource.resolvedPath || '';
    const plugin = installResult.manifest.runtimeMode === 'bridge'
      ? this.createBridgePlugin(resolvedPath, installResult.entry, installResult.manifest)
      : this.requirePluginInstance(resolvedPath, installResult.manifest);
    const entry = persistEntry ? this.registry.upsert(installResult.entry) : installResult.entry;
    const record: ManagedPluginRecord = {
      plugin,
      manifest: installResult.manifest.runtimeMode === 'bridge'
        ? (plugin?.manifest || installResult.manifest)
        : installResult.manifest,
      registryEntry: entry,
      sourcePath: resolvedPath,
      routes: [],
      configSchema: plugin?.getConfigSchema?.(),
      logs: [],
      initialized: false,
    };
    this.records.push(record);
    return {
      success: true,
      record,
      warnings: installResult.warnings,
    };
  }

  private async loadInstalledEntry(entry: PluginRegistryEntry): Promise<void> {
    const resolvedPath = entry.installSource.resolvedPath;
    if (!resolvedPath || !fs.existsSync(resolvedPath)) {
      logger.warn({ pluginId: entry.id, resolvedPath }, '[PluginManager] 已安装插件路径不存在');
      return;
    }

    if (entry.runtime.mode === 'bridge' || entry.adapterType) {
      const adapterManifest: PluginManifest = {
        id: entry.id,
        name: entry.name,
        version: entry.version,
        description: entry.description,
        sourceType: 'adapter',
        runtimeMode: entry.runtime.mode,
        permissions: ['adapter.bridge'],
        ui: { mode: 'hybrid' },
        capabilities: ['bridge'],
        adapter: entry.adapterType ? { type: entry.adapterType } : undefined,
      };
      const bridgePlugin = this.createBridgePlugin(resolvedPath, entry, adapterManifest);
      this.records.push({
        plugin: bridgePlugin,
        manifest: bridgePlugin?.manifest || adapterManifest,
        registryEntry: entry,
        sourcePath: resolvedPath,
        routes: [],
        configSchema: bridgePlugin?.getConfigSchema?.(),
        logs: [],
        initialized: false,
      });
      return;
    }

    try {
      const moduleEntry = resolveModuleEntry(resolvedPath);
      const mod = require(moduleEntry);
      const candidate = mod.default || mod.plugin || mod;
      const manifest = {
        ...buildLegacyManifest(candidate as QQTalkerPlugin, entry.installSource.type),
        ...((candidate?.manifest || {}) as PluginManifest),
        id: entry.id,
        name: entry.name,
        version: entry.version,
      };
      this.records.push({
        plugin: candidate as QQTalkerPlugin,
        manifest,
        registryEntry: entry,
        sourcePath: resolvedPath,
        routes: [],
        configSchema: (candidate as QQTalkerPlugin).getConfigSchema?.(),
        logs: [],
        initialized: false,
      });
    } catch (error) {
      logger.error({ error, pluginId: entry.id }, '[PluginManager] 加载已安装插件失败');
    }
  }

  private requirePluginInstance(sourcePath: string, manifest: PluginManifest): QQTalkerPlugin {
    const resolved = fs.existsSync(sourcePath) ? resolveModuleEntry(sourcePath) : sourcePath;
    const mod = require(resolved);
    const candidate = mod.default || mod.plugin || mod;
    if (!candidate || typeof candidate !== 'object' || !candidate.id) {
      throw new Error(`Invalid plugin module: ${resolved}`);
    }
    if (!candidate.manifest) {
      candidate.manifest = manifest;
    }
    return candidate as QQTalkerPlugin;
  }

  private createBridgePlugin(
    sourcePath: string,
    entry: PluginRegistryEntry,
    manifest: PluginManifest,
  ): QQTalkerPlugin | null {
    if (entry.adapterType === 'astrbot-bridge' && AstrBotMemeManagerBridgePlugin.supports(sourcePath)) {
      return new AstrBotMemeManagerBridgePlugin(sourcePath, entry.id, manifest);
    }
    return null;
  }

  private async initializeRecord(record: ManagedPluginRecord): Promise<void> {
    if (!this.context || !record.plugin || record.initialized || !record.registryEntry.enabled) return;
    const runtimeContext = this.createRuntimeContext(record);
    record.runtimeContext = runtimeContext;
    this.registry.setRuntimeState(record.manifest.id, {
      status: 'starting',
      initializedAt: nowIso(),
    });
    try {
      await record.plugin.initialize?.(runtimeContext);
      await record.plugin.onLoad?.(runtimeContext);
      await record.plugin.onEnable?.(runtimeContext);
      record.configSchema = record.plugin.getConfigSchema?.() || record.configSchema;
      record.routes = record.plugin.getDashboardRoutes?.() || [];
      const pages = record.plugin.getDashboardPages?.() || record.manifest.ui?.pages || [];
      if (pages.length > 0) {
        this.uiRegistry.register(record.manifest.id, record.manifest, pages);
      }
      record.initialized = true;
      const updated = this.registry.setRuntimeState(record.manifest.id, {
        status: 'healthy',
        enabled: true,
        healthMessage: 'Plugin loaded successfully.',
      });
      if (updated) record.registryEntry = updated;
      logger.info(`[PluginManager] 插件已初始化: ${record.manifest.id}`);
    } catch (error) {
      this.recordPluginError(record, '插件初始化失败', error);
      const updated = this.registry.setRuntimeState(record.manifest.id, {
        status: 'error',
        lastError: error instanceof Error ? error.message : String(error),
      });
      if (updated) record.registryEntry = updated;
    }
  }

  private createRuntimeContext(record: ManagedPluginRecord): PluginRuntimeContext {
    const host = {
      messaging: {
        sendGroupText: async (groupId: number, message: string) => {
          await this.context!.onebot.sendGroupMsg(groupId, message);
        },
        sendPrivateText: async (userId: number, message: string) => {
          await this.context!.onebot.sendPrivateMsg(userId, message);
        },
      },
      storage: {
        getPluginDataDir: () => ensureDirectory(path.join(this.context!.dataDir, 'data', 'plugins', record.manifest.id)),
        getPluginRuntimeDir: () => getPluginRuntimeDir(record.manifest.id),
      },
      config: {
        get: async <T = Record<string, unknown>>() => this.getPluginConfig(record.manifest.id) as T,
        set: async (values: Record<string, unknown>) => this.updatePluginConfig(record.manifest.id, values),
        getSchema: () => record.configSchema,
      },
      dashboard: {
        pushLog: (type: string, message: string) => {
          this.context!.dashboard.pushLog(type, `[${record.manifest.id}] ${message}`);
        },
      },
      logger: {
        debug: (message: string, extra?: Record<string, unknown>) => this.pushPluginLog(record, 'debug', message, extra),
        info: (message: string, extra?: Record<string, unknown>) => this.pushPluginLog(record, 'info', message, extra),
        warn: (message: string, extra?: Record<string, unknown>) => this.pushPluginLog(record, 'warn', message, extra),
        error: (message: string, extra?: Record<string, unknown>) => this.pushPluginLog(record, 'error', message, extra),
      },
    };

    return {
      ...this.context!,
      pluginId: record.manifest.id,
      manifest: record.manifest,
      registryEntry: record.registryEntry,
      host,
    };
  }

  private pushPluginLog(
    record: ManagedPluginRecord,
    level: PluginLogEntry['level'],
    message: string,
    extra?: Record<string, unknown>,
  ): void {
    const entry: PluginLogEntry = {
      level,
      timestamp: nowIso(),
      message,
      extra,
    };
    record.logs.push(entry);
    if (record.logs.length > 200) {
      record.logs.shift();
    }
    const payload = { pluginId: record.manifest.id, ...extra };
    if (level === 'debug') logger.debug(payload, `[Plugin:${record.manifest.id}] ${message}`);
    if (level === 'info') logger.info(payload, `[Plugin:${record.manifest.id}] ${message}`);
    if (level === 'warn') logger.warn(payload, `[Plugin:${record.manifest.id}] ${message}`);
    if (level === 'error') logger.error(payload, `[Plugin:${record.manifest.id}] ${message}`);
  }

  private recordPluginError(record: ManagedPluginRecord, message: string, error: unknown): void {
    const err = error instanceof Error ? error : new Error(String(error));
    this.pushPluginLog(record, 'error', `${message}: ${err.message}`);
    logger.error({ error: err, pluginId: record.manifest.id }, `[PluginManager] ${message}`);
  }
}
