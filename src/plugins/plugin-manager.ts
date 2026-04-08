import fs from 'fs';
import path from 'path';
import { logger } from '../logger';
import { config } from '../types/config';
import type {
  DashboardRouteProvider,
  PluginCommandContext,
  PluginCommandResult,
  PluginContext,
  PluginMessageContext,
  PromptHookContext,
  QQTalkerPlugin,
} from './plugin-types';

export class PluginManager {
  private readonly plugins: QQTalkerPlugin[] = [];
  private readonly routes: DashboardRouteProvider[] = [];
  private initialized = false;
  private context: PluginContext | null = null;

  register(plugin: QQTalkerPlugin): void {
    if (this.plugins.some(item => item.id === plugin.id)) {
      throw new Error(`Plugin already registered: ${plugin.id}`);
    }
    this.plugins.push(plugin);
  }

  async loadExternalPlugins(): Promise<void> {
    for (const pluginPath of config.pluginPaths) {
      const resolvedPath = path.isAbsolute(pluginPath)
        ? pluginPath
        : path.resolve(process.cwd(), pluginPath);
      if (!fs.existsSync(resolvedPath)) {
        logger.warn(`[PluginManager] 插件文件不存在: ${resolvedPath}`);
        continue;
      }

      try {
        const mod = require(resolvedPath);
        const candidate = mod.default || mod.plugin || mod;
        if (!candidate || typeof candidate !== 'object' || !candidate.id) {
          logger.warn(`[PluginManager] 跳过无效插件模块: ${resolvedPath}`);
          continue;
        }
        this.register(candidate as QQTalkerPlugin);
        logger.info(`[PluginManager] 已加载外部插件: ${candidate.id}`);
      } catch (error) {
        logger.error({ error, pluginPath: resolvedPath }, '[PluginManager] 加载外部插件失败');
      }
    }
  }

  async initialize(context: PluginContext): Promise<void> {
    if (this.initialized) return;
    this.context = context;

    for (const plugin of this.plugins) {
      await plugin.initialize?.(context);
      this.routes.push(...(plugin.getDashboardRoutes?.() || []));
      logger.info(`[PluginManager] 插件已初始化: ${plugin.id}`);
    }

    this.initialized = true;
  }

  getDashboardRoutes(): DashboardRouteProvider[] {
    return [...this.routes];
  }

  async onMessage(context: PluginMessageContext): Promise<void> {
    for (const plugin of this.plugins) {
      try {
        await plugin.onMessage?.(context);
      } catch (error) {
        logger.error({ error, pluginId: plugin.id }, '[PluginManager] 消息钩子执行失败');
      }
    }
  }

  async buildSystemPrefix(context: PromptHookContext): Promise<string | undefined> {
    const sections: string[] = [];
    for (const plugin of this.plugins) {
      try {
        const result = await plugin.beforeChat?.(context);
        if (!result?.sections?.length) continue;
        sections.push(`[${plugin.name}]`);
        sections.push(...result.sections);
      } catch (error) {
        logger.error({ error, pluginId: plugin.id }, '[PluginManager] PromptHook 执行失败');
      }
    }
    return sections.length > 0 ? sections.join('\n') : undefined;
  }

  async handleCommand(context: PluginCommandContext): Promise<PluginCommandResult | undefined> {
    for (const plugin of this.plugins) {
      try {
        const result = await plugin.handleCommand?.(context);
        if (result?.handled) return result;
      } catch (error) {
        logger.error({ error, pluginId: plugin.id }, '[PluginManager] 插件命令执行失败');
      }
    }
    return undefined;
  }

  async dispose(): Promise<void> {
    for (const plugin of this.plugins) {
      try {
        await plugin.dispose?.();
      } catch (error) {
        logger.error({ error, pluginId: plugin.id }, '[PluginManager] 插件销毁失败');
      }
    }
  }

  listPlugins(): Array<{ id: string; name: string }> {
    return this.plugins.map(plugin => ({ id: plugin.id, name: plugin.name }));
  }

  getContext(): PluginContext | null {
    return this.context;
  }
}
