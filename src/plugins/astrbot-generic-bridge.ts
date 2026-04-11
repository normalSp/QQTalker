import fs from 'fs';
import path from 'path';
import {
  buildAstrBotConfigSchema,
  buildAstrBotDefaultConfig,
  hasAstrBotWebUi,
  readAstrBotMetadata,
  readAstrBotSchema,
} from './astrbot-bridge-support';
import type {
  DashboardRouteProvider,
  PluginConfigSchema,
  PluginContext,
  PluginDashboardPage,
  PluginManifest,
  QQTalkerPlugin,
} from './plugin-types';

export class AstrBotGenericBridgePlugin implements QQTalkerPlugin {
  readonly id: string;
  readonly name: string;
  readonly manifest: PluginManifest;

  private readonly sourcePath: string;
  private readonly configSchema: PluginConfigSchema;
  private readonly defaultConfig: Record<string, unknown>;
  private context: PluginContext | null = null;

  constructor(sourcePath: string, pluginId: string, manifestOverride: PluginManifest) {
    this.sourcePath = sourcePath;
    this.id = pluginId;
    this.name = manifestOverride.name;
    this.configSchema = buildAstrBotConfigSchema(
      sourcePath,
      'AstrBot Bridge Settings',
      '桥接自 AstrBot 插件的配置项。',
    );
    this.defaultConfig = buildAstrBotDefaultConfig(readAstrBotSchema(sourcePath));
    this.manifest = {
      ...manifestOverride,
      ui: {
        mode: manifestOverride.ui?.mode || 'hybrid',
        entry: manifestOverride.ui?.entry,
        pages: manifestOverride.ui?.pages || this.getDashboardPages(),
      },
      adapter: {
        type: manifestOverride.adapter?.type || 'astrbot-bridge',
        target: manifestOverride.adapter?.target || readAstrBotMetadata(sourcePath).name || 'astrbot',
        fallbackPageId: manifestOverride.adapter?.fallbackPageId || 'overview',
        nativeEquivalent: Boolean(manifestOverride.adapter?.nativeEquivalent),
      },
    };
  }

  initialize(context: PluginContext): void {
    this.context = context;
  }

  getConfigSchema(): PluginConfigSchema {
    return this.configSchema;
  }

  getDefaultConfig(): Record<string, unknown> {
    return { ...this.defaultConfig };
  }

  getDashboardPages(): PluginDashboardPage[] {
    return this.manifest.ui?.pages || [
      {
        id: 'overview',
        title: '桥接概览',
        routePath: `/plugins/${this.id}/page/overview`,
        description: '查看 AstrBot 插件桥接状态、元数据与配置接入情况。',
        renderMode: 'bridge-fallback',
        bridgeEndpoint: `/api/plugins/${this.id}/astrbot-bridge/overview`,
      },
    ];
  }

  getDashboardRoutes(): DashboardRouteProvider[] {
    return [
      {
        method: 'GET',
        path: `/api/plugins/${this.id}/astrbot-bridge/overview`,
        handler: async () => {
          const metadata = readAstrBotMetadata(this.sourcePath);
          return {
            data: {
              success: true,
              pluginId: this.id,
              sourcePath: this.sourcePath,
              metadata,
              adapterTarget: this.manifest.adapter?.target || 'astrbot',
              hasWebUi: hasAstrBotWebUi(this.sourcePath),
              hasConfigSchema: this.configSchema.fields.length > 0,
              configFieldCount: this.configSchema.fields.length,
              files: this.listPackageFiles(),
              pages: this.getDashboardPages(),
              runtimeMessage: this.context
                ? '当前以 QQTalker 原生桥接模式运行。'
                : '桥接尚未初始化。',
            },
          };
        },
      },
    ];
  }

  private listPackageFiles(): string[] {
    return fs.readdirSync(this.sourcePath)
      .sort((a, b) => a.localeCompare(b, 'zh-CN'))
      .map((entry) => {
        const entryPath = path.join(this.sourcePath, entry);
        return fs.statSync(entryPath).isDirectory() ? `${entry}/` : entry;
      });
  }
}
