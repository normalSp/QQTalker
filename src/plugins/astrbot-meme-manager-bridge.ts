import fs from 'fs';
import path from 'path';
import type http from 'http';
import {
  FlatConfig,
  buildAstrBotConfigSchema,
  buildAstrBotDefaultConfig,
  parseAstrBotStringMap,
  readAstrBotMetadataName,
  readAstrBotSchema,
} from './astrbot-bridge-support';
import {
  DashboardRouteProvider,
  PluginConfigSchema,
  PluginContext,
  PluginDashboardPage,
  PluginManifest,
  PluginModelResponseContext,
  PluginModelResponseResult,
  PromptHookContext,
  PromptHookResult,
  QQTalkerPlugin,
} from './plugin-types';

interface CategoryIndex {
  descriptions: Record<string, string>;
  files: Record<string, string[]>;
}

interface BridgeFileItem {
  name: string;
  url: string;
}

interface BridgeCategoryItem {
  category: string;
  description: string;
  count: number;
  previewFile?: string;
  files: BridgeFileItem[];
}

function ensureDir(dirPath: string): string {
  fs.mkdirSync(dirPath, { recursive: true });
  return dirPath;
}

function copyDirectoryIfMissing(sourceDir: string, targetDir: string): void {
  if (!fs.existsSync(sourceDir)) return;
  ensureDir(targetDir);
  for (const entry of fs.readdirSync(sourceDir, { withFileTypes: true })) {
    const sourcePath = path.join(sourceDir, entry.name);
    const targetPath = path.join(targetDir, entry.name);
    if (entry.isDirectory()) {
      copyDirectoryIfMissing(sourcePath, targetPath);
      continue;
    }
    if (!fs.existsSync(targetPath)) {
      fs.copyFileSync(sourcePath, targetPath);
    }
  }
}

function readJson<T>(filePath: string, fallback: T): T {
  try {
    if (!fs.existsSync(filePath)) return fallback;
    return JSON.parse(fs.readFileSync(filePath, 'utf-8')) as T;
  } catch {
    return fallback;
  }
}

function writeJson(filePath: string, data: unknown): void {
  ensureDir(path.dirname(filePath));
  fs.writeFileSync(filePath, JSON.stringify(data, null, 2) + '\n', 'utf-8');
}

function getFlatValue(config: FlatConfig, key: string, fallback?: unknown): unknown {
  return config[key] !== undefined ? config[key] : fallback;
}

function randomPick<T>(items: T[]): T | undefined {
  if (!items.length) return undefined;
  return items[Math.floor(Math.random() * items.length)];
}

function sanitizeCategoryName(category: string): string {
  return String(category || '')
    .trim()
    .replace(/[\\/:*?"<>|]/g, '-')
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '');
}

function sanitizeFileName(fileName: string): string {
  const base = path.basename(String(fileName || '').trim());
  return base.replace(/[^\w.\-\u4e00-\u9fa5]/g, '_');
}

export class AstrBotMemeManagerBridgePlugin implements QQTalkerPlugin {
  readonly id: string;
  readonly name: string;
  readonly manifest: PluginManifest;

  private readonly sourcePath: string;
  private readonly configSchema: PluginConfigSchema;
  private readonly defaultConfig: FlatConfig;
  private readonly defaultDescriptions: Record<string, string>;
  private context: PluginContext | null = null;
  private runtimeDir = '';
  private memesDir = '';
  private metadataPath = '';
  private categoriesPath = '';
  private orderPath = '';

  constructor(sourcePath: string, pluginId: string, manifestOverride?: PluginManifest) {
    this.sourcePath = sourcePath;
    this.id = pluginId;
    this.name = manifestOverride?.name || 'AstrBot Meme Manager Bridge';

    this.configSchema = buildAstrBotConfigSchema(
      sourcePath,
      'AstrBot Meme Manager Bridge',
      '桥接自 astrbot_plugin_meme_manager 的配置项。',
    );
    this.defaultConfig = buildAstrBotDefaultConfig(readAstrBotSchema(sourcePath));
    this.defaultDescriptions = parseAstrBotStringMap(
      fs.existsSync(path.join(sourcePath, 'config.py'))
        ? fs.readFileSync(path.join(sourcePath, 'config.py'), 'utf-8')
        : '',
      'DEFAULT_CATEGORY_DESCRIPTIONS',
    );
    const baseManifest: PluginManifest = {
      id: pluginId,
      name: manifestOverride?.name || `AstrBot Bridge: ${readAstrBotMetadataName(sourcePath)}`,
      version: manifestOverride?.version || '0.1.0',
      description: manifestOverride?.description || 'QQTalker bridge sample for astrbot_plugin_meme_manager',
      sourceType: 'adapter',
      runtimeMode: 'bridge',
      permissions: ['dashboard.route', 'dashboard.page', 'config.read', 'config.write'],
      hooks: ['prompt', 'after-model-response', 'dashboard', 'config'],
      capabilities: ['bridge', 'meme-manager', 'dashboard-page'],
      ui: {
        mode: 'hybrid',
        pages: this.getDashboardPages(),
      },
      adapter: {
        type: 'astrbot-bridge',
        target: 'meme_manager',
        fallbackPageId: 'meme-library',
        nativeEquivalent: true,
      },
    };
    this.manifest = {
      ...baseManifest,
      ...manifestOverride,
      ui: {
        mode: manifestOverride?.ui?.mode || baseManifest.ui!.mode,
        entry: manifestOverride?.ui?.entry || baseManifest.ui?.entry,
        pages: manifestOverride?.ui?.pages || baseManifest.ui?.pages,
      },
      adapter: {
        type: manifestOverride?.adapter?.type || baseManifest.adapter!.type,
        target: 'meme_manager',
        fallbackPageId: manifestOverride?.adapter?.fallbackPageId || baseManifest.adapter!.fallbackPageId,
        nativeEquivalent: manifestOverride?.adapter?.nativeEquivalent ?? baseManifest.adapter!.nativeEquivalent,
      },
    };
  }

  static supports(sourcePath: string): boolean {
    return fs.existsSync(path.join(sourcePath, '_conf_schema.json'))
      && fs.existsSync(path.join(sourcePath, 'metadata.yaml'))
      && readAstrBotMetadataName(sourcePath) === 'meme_manager';
  }

  initialize(context: PluginContext): void {
    this.context = context;
    this.runtimeDir = ensureDir(path.join(context.dataDir, 'data', 'plugins', 'runtime', this.id, 'meme-manager'));
    this.memesDir = ensureDir(path.join(this.runtimeDir, 'memes'));
    this.metadataPath = path.join(this.runtimeDir, 'memes_data.json');
    this.categoriesPath = path.join(this.runtimeDir, 'categories.json');
    this.orderPath = path.join(this.runtimeDir, 'category-order.json');

    if (!fs.existsSync(this.categoriesPath)) {
      writeJson(this.categoriesPath, this.defaultDescriptions);
    }
    if (!fs.existsSync(this.orderPath)) {
      writeJson(this.orderPath, Object.keys(this.defaultDescriptions));
    }
    copyDirectoryIfMissing(path.join(this.sourcePath, 'memes'), this.memesDir);
    this.syncMetadataIndex();
  }

  getConfigSchema(): PluginConfigSchema {
    return this.configSchema;
  }

  getDefaultConfig(): Record<string, unknown> {
    return { ...this.defaultConfig };
  }

  getDashboardPages(): PluginDashboardPage[] {
    return [
      {
        id: 'meme-library',
        title: '表情桥接资源',
        routePath: `/plugins/${this.id}/page/meme-library`,
        description: '查看桥接后的表情分类、资源数量与访问入口。',
        renderMode: 'native-equivalent',
        bridgeEndpoint: `/api/plugins/${this.id}/meme-manager/overview`,
      },
    ];
  }

  beforeChat(_context: PromptHookContext): PromptHookResult | void {
    const bridgeConfig = this.readConfig();
    const categories = this.readCategoryIndex();
    const categoryLines = Object.entries(categories.descriptions)
      .map(([key, description]) => `${key} - ${description}`)
      .join('\n');
    const promptHead = String(getFlatValue(bridgeConfig, 'prompt.prompt_head', this.defaultConfig['prompt.prompt_head']) || '');
    const promptTail1 = String(getFlatValue(bridgeConfig, 'prompt.prompt_tail_1', this.defaultConfig['prompt.prompt_tail_1']) || '');
    const promptTail2 = String(getFlatValue(bridgeConfig, 'prompt.prompt_tail_2', this.defaultConfig['prompt.prompt_tail_2']) || '');
    const maxCount = Number(getFlatValue(bridgeConfig, 'max_emotions_per_message', this.defaultConfig['max_emotions_per_message']) || 2);
    return {
      pluginId: this.id,
      sections: [
        `${promptHead}${categoryLines}`,
        `${promptTail1}${maxCount}${promptTail2}`,
      ],
    };
  }

  afterModelResponse(context: PluginModelResponseContext): PluginModelResponseResult | void {
    const bridgeConfig = this.readConfig();
    const probability = Number(getFlatValue(bridgeConfig, 'emotions_probability', this.defaultConfig['emotions_probability']) || 50);
    if (Math.random() * 100 > probability) {
      return {
        reply: this.stripMarkup(context.reply, bridgeConfig),
      };
    }

    const tags = this.extractTags(context.reply, bridgeConfig);
    if (!tags.length) return;

    const index = this.readCategoryIndex();
    const strictLimit = Boolean(getFlatValue(bridgeConfig, 'strict_max_emotions_per_message', this.defaultConfig['strict_max_emotions_per_message']));
    const maxCount = Number(getFlatValue(bridgeConfig, 'max_emotions_per_message', this.defaultConfig['max_emotions_per_message']) || 2);
    const tagLimit = strictLimit ? Math.max(0, maxCount) : tags.length;
    const selectedTags = tags.slice(0, tagLimit);
    let reply = context.reply;
    let replacementCount = 0;

    for (const tag of selectedTags) {
      const matchedCategory = this.matchCategory(tag.name, index, bridgeConfig);
      if (!matchedCategory) {
        reply = reply.replace(tag.raw, this.shouldRemoveInvalidMarkup(bridgeConfig) ? '' : tag.raw);
        continue;
      }
      const files = index.files[matchedCategory] || [];
      const selectedFile = randomPick(files);
      if (!selectedFile) {
        reply = reply.replace(tag.raw, this.shouldRemoveInvalidMarkup(bridgeConfig) ? '' : tag.raw);
        continue;
      }
      const imageUrl = `${this.context?.dashboard.getBaseUrl() || 'http://127.0.0.1:3180'}/api/plugins/${encodeURIComponent(this.id)}/meme-manager/file?category=${encodeURIComponent(matchedCategory)}&file=${encodeURIComponent(selectedFile)}`;
      reply = reply.replace(tag.raw, `[CQ:image,file=${imageUrl}]`);
      replacementCount++;
    }

    if (replacementCount === 0) {
      return {
        reply: this.stripMarkup(context.reply, bridgeConfig),
      };
    }
    return {
      reply: this.stripMarkup(reply, bridgeConfig, true),
    };
  }

  getDashboardRoutes(): DashboardRouteProvider[] {
    return [
      {
        method: 'GET',
        path: `/api/plugins/${this.id}/meme-manager/overview`,
        handler: async () => ({
          data: {
            success: true,
            pluginId: this.id,
            sourcePath: this.sourcePath,
            runtimeDir: this.runtimeDir,
            metadata: readJson<Record<string, unknown>>(this.metadataPath, {}),
            categoryOrder: this.readCategoryOrder(),
            categories: this.listCategories(),
          },
        }),
      },
      {
        method: 'GET',
        path: `/api/plugins/${this.id}/meme-manager/categories`,
        handler: async () => ({
          data: {
            success: true,
            items: this.listCategories().map((item) => this.serializeCategory(item)),
          },
        }),
      },
      {
        method: 'POST',
        path: `/api/plugins/${this.id}/meme-manager/categories`,
        handler: async ({ body }) => {
          const category = String(body?.category || '').trim();
          const description = String(body?.description || '').trim();
          if (!category) {
            return { status: 400, data: { success: false, error: 'Missing category.' } };
          }
          const normalizedCategory = sanitizeCategoryName(category);
          if (!normalizedCategory) {
            return { status: 400, data: { success: false, error: 'Invalid category name.' } };
          }
          ensureDir(path.join(this.memesDir, normalizedCategory));
          const descriptions = readJson<Record<string, string>>(this.categoriesPath, {});
          descriptions[normalizedCategory] = description;
          writeJson(this.categoriesPath, descriptions);
          this.ensureCategoryOrder([normalizedCategory]);
          this.syncMetadataIndex();
          return { data: { success: true, items: this.listCategories() } };
        },
      },
      {
        method: 'PUT',
        path: `/api/plugins/${this.id}/meme-manager/categories/order`,
        handler: async ({ body }) => {
          const categories = Array.isArray(body?.categories)
            ? body.categories.map((item: unknown) => sanitizeCategoryName(String(item || ''))).filter(Boolean)
            : [];
          this.writeCategoryOrder(categories);
          this.syncMetadataIndex();
          return {
            data: {
              success: true,
              items: this.listCategories(),
            },
          };
        },
      },
      {
        method: 'DELETE',
        path: `/api/plugins/${this.id}/meme-manager/categories`,
        handler: async ({ body }) => {
          const category = sanitizeCategoryName(String(body?.category || '').trim());
          if (!category) {
            return { status: 400, data: { success: false, error: 'Missing category.' } };
          }
          const categoryDir = path.join(this.memesDir, category);
          if (fs.existsSync(categoryDir)) {
            fs.rmSync(categoryDir, { recursive: true, force: true });
          }
          const descriptions = readJson<Record<string, string>>(this.categoriesPath, {});
          delete descriptions[category];
          writeJson(this.categoriesPath, descriptions);
          this.removeFromCategoryOrder([category]);
          this.syncMetadataIndex();
          return {
            data: {
              success: true,
              items: this.listCategories(),
            },
          };
        },
      },
      {
        method: 'DELETE',
        path: `/api/plugins/${this.id}/meme-manager/categories/batch`,
        handler: async ({ body }) => {
          const categories = Array.isArray(body?.categories)
            ? body.categories.map((item: unknown) => sanitizeCategoryName(String(item || ''))).filter(Boolean)
            : [];
          if (!categories.length) {
            return { status: 400, data: { success: false, error: 'Missing categories.' } };
          }
          const descriptions = readJson<Record<string, string>>(this.categoriesPath, {});
          for (const category of categories) {
            const categoryDir = path.join(this.memesDir, category);
            if (fs.existsSync(categoryDir)) {
              fs.rmSync(categoryDir, { recursive: true, force: true });
            }
            delete descriptions[category];
          }
          writeJson(this.categoriesPath, descriptions);
          this.removeFromCategoryOrder(categories);
          this.syncMetadataIndex();
          return {
            data: {
              success: true,
              items: this.listCategories(),
            },
          };
        },
      },
      {
        method: 'POST',
        path: `/api/plugins/${this.id}/meme-manager/files`,
        handler: async ({ body }) => {
          const category = sanitizeCategoryName(String(body?.category || '').trim());
          const files = Array.isArray(body?.files) ? body.files : [];
          if (!category) {
            return { status: 400, data: { success: false, error: 'Missing category.' } };
          }
          if (!files.length) {
            return { status: 400, data: { success: false, error: 'Missing files.' } };
          }
          const categoryDir = ensureDir(path.join(this.memesDir, category));
          const saved: string[] = [];
          for (const file of files) {
            const fileName = sanitizeFileName(String(file?.name || 'upload.bin'));
            const contentBase64 = String(file?.contentBase64 || '').trim();
            if (!contentBase64) continue;
            const targetPath = this.allocateFilePath(categoryDir, fileName);
            fs.writeFileSync(targetPath, Buffer.from(contentBase64, 'base64'));
            saved.push(path.basename(targetPath));
          }
          this.syncMetadataIndex();
          return {
            data: {
              success: true,
              saved,
              items: this.listCategories(),
            },
          };
        },
      },
      {
        method: 'PUT',
        path: `/api/plugins/${this.id}/meme-manager/files`,
        handler: async ({ body }) => {
          const category = sanitizeCategoryName(String(body?.category || '').trim());
          const fileName = sanitizeFileName(String(body?.file || '').trim());
          const nextName = sanitizeFileName(String(body?.nextName || '').trim());
          if (!category || !fileName || !nextName) {
            return { status: 400, data: { success: false, error: 'Missing category, file or next name.' } };
          }
          if (!/\.(png|jpg|jpeg|gif|webp)$/i.test(nextName)) {
            return { status: 400, data: { success: false, error: 'Unsupported file type.' } };
          }
          const categoryDir = path.join(this.memesDir, category);
          const fromPath = path.join(categoryDir, fileName);
          if (!fs.existsSync(fromPath)) {
            return { status: 404, data: { success: false, error: 'File not found.' } };
          }
          const targetPath = this.allocateFilePath(categoryDir, nextName, fileName);
          fs.renameSync(fromPath, targetPath);
          this.syncMetadataIndex();
          return {
            data: {
              success: true,
              file: path.basename(targetPath),
              items: this.listCategories(),
            },
          };
        },
      },
      {
        method: 'DELETE',
        path: `/api/plugins/${this.id}/meme-manager/files`,
        handler: async ({ body }) => {
          const category = sanitizeCategoryName(String(body?.category || '').trim());
          const fileName = sanitizeFileName(String(body?.file || '').trim());
          if (!category || !fileName) {
            return { status: 400, data: { success: false, error: 'Missing category or file.' } };
          }
          const filePath = path.join(this.memesDir, category, fileName);
          if (fs.existsSync(filePath)) {
            fs.rmSync(filePath, { force: true });
          }
          this.syncMetadataIndex();
          return {
            data: {
              success: true,
              items: this.listCategories(),
            },
          };
        },
      },
      {
        method: 'DELETE',
        path: `/api/plugins/${this.id}/meme-manager/files/batch`,
        handler: async ({ body }) => {
          const items = Array.isArray(body?.items) ? body.items : [];
          if (!items.length) {
            return { status: 400, data: { success: false, error: 'Missing file items.' } };
          }
          for (const item of items) {
            const category = sanitizeCategoryName(String(item?.category || '').trim());
            const fileName = sanitizeFileName(String(item?.file || '').trim());
            if (!category || !fileName) continue;
            const filePath = path.join(this.memesDir, category, fileName);
            if (fs.existsSync(filePath)) {
              fs.rmSync(filePath, { force: true });
            }
          }
          this.syncMetadataIndex();
          return {
            data: {
              success: true,
              items: this.listCategories(),
            },
          };
        },
      },
      {
        method: 'POST',
        path: `/api/plugins/${this.id}/meme-manager/restore-defaults`,
        handler: async ({ body }) => {
          const categories = Array.isArray(body?.categories)
            ? body.categories.map((item: unknown) => sanitizeCategoryName(String(item || ''))).filter(Boolean)
            : [];
          if (categories.length > 0) {
            for (const category of categories) {
              copyDirectoryIfMissing(path.join(this.sourcePath, 'memes', category), path.join(this.memesDir, category));
            }
          } else {
            copyDirectoryIfMissing(path.join(this.sourcePath, 'memes'), this.memesDir);
          }
          const current = readJson<Record<string, string>>(this.categoriesPath, {});
          const restoredDescriptions = categories.length > 0
            ? categories.reduce<Record<string, string>>((acc, category) => {
                if (this.defaultDescriptions[category]) acc[category] = this.defaultDescriptions[category];
                return acc;
              }, {})
            : this.defaultDescriptions;
          const nextDescriptions = { ...current };
          for (const [category, description] of Object.entries(restoredDescriptions)) {
            nextDescriptions[category] = description;
          }
          writeJson(this.categoriesPath, nextDescriptions);
          this.syncMetadataIndex();
          return {
            data: {
              success: true,
              items: this.listCategories(),
            },
          };
        },
      },
      {
        method: 'GET',
        path: `/api/plugins/${this.id}/meme-manager/file`,
        handler: async ({ url, res }) => {
          const category = String(url.searchParams.get('category') || '').trim();
          const fileName = String(url.searchParams.get('file') || '').trim();
          if (!category || !fileName) {
            this.respondText(res, 400, 'Missing category or file.');
            return;
          }
          const safeCategory = path.basename(category);
          const safeFile = path.basename(fileName);
          const filePath = path.join(this.memesDir, safeCategory, safeFile);
          if (!fs.existsSync(filePath)) {
            this.respondText(res, 404, 'File not found.');
            return;
          }
          const stream = fs.createReadStream(filePath);
          res.writeHead(200, {
            'Content-Type': this.resolveMimeType(filePath),
            'Cache-Control': 'public, max-age=300',
          });
          await new Promise<void>((resolve, reject) => {
            stream.on('end', () => resolve());
            stream.on('error', reject);
            stream.pipe(res);
          });
        },
      },
    ];
  }

  private readConfig(): FlatConfig {
    if (!this.context) return { ...this.defaultConfig };
    const configPath = path.join(this.context.dataDir, 'data', 'plugins', 'config', `${this.id}.json`);
    return {
      ...this.defaultConfig,
      ...readJson<FlatConfig>(configPath, {}),
    };
  }

  private readCategoryIndex(): CategoryIndex {
    const descriptions = readJson<Record<string, string>>(this.categoriesPath, this.defaultDescriptions);
    const files: Record<string, string[]> = {};
    if (fs.existsSync(this.memesDir)) {
      for (const category of fs.readdirSync(this.memesDir, { withFileTypes: true })) {
        if (!category.isDirectory()) continue;
        const categoryDir = path.join(this.memesDir, category.name);
        files[category.name] = fs.readdirSync(categoryDir).filter((fileName) => /\.(png|jpg|jpeg|gif|webp)$/i.test(fileName));
      }
    }
    return { descriptions, files };
  }

  private listCategories(): BridgeCategoryItem[] {
    const index = this.readCategoryIndex();
    const names = this.sortCategories(Array.from(new Set([
      ...Object.keys(index.descriptions),
      ...Object.keys(index.files),
    ])));
    return names.map((category) => ({
      category,
      description: index.descriptions[category] || '',
      count: (index.files[category] || []).length,
      previewFile: (index.files[category] || [])[0],
      files: this.listCategoryFiles(category),
    }));
  }

  private listCategoryFiles(category: string): BridgeFileItem[] {
    const categoryDir = path.join(this.memesDir, category);
    if (!fs.existsSync(categoryDir)) return [];
    return fs.readdirSync(categoryDir)
      .filter((fileName) => /\.(png|jpg|jpeg|gif|webp)$/i.test(fileName))
      .sort((a, b) => a.localeCompare(b, 'zh-CN'))
      .map((fileName) => ({
        name: fileName,
        url: `/api/plugins/${this.id}/meme-manager/file?category=${encodeURIComponent(category)}&file=${encodeURIComponent(fileName)}`,
      }));
  }

  private syncMetadataIndex(): void {
    this.writeCategoryOrder(this.listCategories().map((item) => item.category));
    const items = this.listCategories().reduce<Record<string, string>>((acc, item) => {
      acc[item.category] = item.description;
      return acc;
    }, {});
    writeJson(this.metadataPath, items);
  }

  private extractTags(reply: string, bridgeConfig: FlatConfig): Array<{ raw: string; name: string }> {
    const patterns = [/\&\&([a-zA-Z0-9_-]+)\&\&/g];
    if (Boolean(getFlatValue(bridgeConfig, 'enable_alternative_markup', this.defaultConfig['enable_alternative_markup']))) {
      patterns.push(/:([a-zA-Z0-9_-]+):/g);
    }
    const matches: Array<{ raw: string; name: string }> = [];
    for (const regex of patterns) {
      let result: RegExpExecArray | null;
      while ((result = regex.exec(reply)) !== null) {
        matches.push({ raw: result[0], name: result[1] });
      }
    }
    if (Boolean(getFlatValue(bridgeConfig, 'enable_repeated_emotion_detection', this.defaultConfig['enable_repeated_emotion_detection']))) {
      const seen = new Set<string>();
      return matches.filter((item) => {
        const key = item.name.toLowerCase();
        if (seen.has(key)) return false;
        seen.add(key);
        return true;
      });
    }
    return matches;
  }

  private matchCategory(tag: string, index: CategoryIndex, bridgeConfig: FlatConfig): string | undefined {
    const normalized = tag.toLowerCase();
    const categoryNames = Object.keys(index.files).length ? Object.keys(index.files) : Object.keys(index.descriptions);
    const exact = categoryNames.find((item) => item.toLowerCase() === normalized);
    if (exact) return exact;
    const loose = Boolean(getFlatValue(bridgeConfig, 'enable_loose_emotion_matching', this.defaultConfig['enable_loose_emotion_matching']));
    if (!loose) return undefined;
    return categoryNames.find((item) => item.toLowerCase().includes(normalized) || normalized.includes(item.toLowerCase()));
  }

  private shouldRemoveInvalidMarkup(bridgeConfig: FlatConfig): boolean {
    return Boolean(getFlatValue(bridgeConfig, 'remove_invalid_alternative_markup', this.defaultConfig['remove_invalid_alternative_markup']));
  }

  private stripMarkup(reply: string, bridgeConfig: FlatConfig, keepImages = false): string {
    let next = reply;
    if (!keepImages) {
      next = next.replace(/\[CQ:image,[^\]]+\]/g, '');
    }
    next = next.replace(/\&\&([a-zA-Z0-9_-]+)\&\&/g, '');
    if (Boolean(getFlatValue(bridgeConfig, 'enable_alternative_markup', this.defaultConfig['enable_alternative_markup']))) {
      next = next.replace(/:([a-zA-Z0-9_-]+):/g, '');
    }
    return next.replace(/\n{3,}/g, '\n\n').trim();
  }

  private respondText(res: http.ServerResponse, status: number, message: string): void {
    res.writeHead(status, { 'Content-Type': 'text/plain; charset=utf-8' });
    res.end(message);
  }

  private resolveMimeType(filePath: string): string {
    const ext = path.extname(filePath).toLowerCase();
    if (ext === '.png') return 'image/png';
    if (ext === '.jpg' || ext === '.jpeg') return 'image/jpeg';
    if (ext === '.gif') return 'image/gif';
    if (ext === '.webp') return 'image/webp';
    return 'application/octet-stream';
  }

  private allocateFilePath(categoryDir: string, fileName: string, currentName?: string): string {
    const parsed = path.parse(fileName);
    let targetPath = path.join(categoryDir, `${parsed.name}${parsed.ext}`);
    let counter = 1;
    while (fs.existsSync(targetPath) && path.basename(targetPath) !== currentName) {
      targetPath = path.join(categoryDir, `${parsed.name}-${counter}${parsed.ext}`);
      counter += 1;
    }
    return targetPath;
  }

  private serializeCategory(item: BridgeCategoryItem): BridgeCategoryItem & { previewUrl: string } {
    return {
      ...item,
      previewUrl: item.previewFile
        ? `/api/plugins/${this.id}/meme-manager/file?category=${encodeURIComponent(item.category)}&file=${encodeURIComponent(item.previewFile)}`
        : '',
    };
  }

  private readCategoryOrder(): string[] {
    return readJson<string[]>(this.orderPath, []).map((item) => sanitizeCategoryName(item)).filter(Boolean);
  }

  private writeCategoryOrder(categories: string[]): void {
    const validCategories = new Set(this.listActualCategoryNames());
    const ordered = categories
      .map((item) => sanitizeCategoryName(item))
      .filter((item) => item && validCategories.has(item));
    const missing = this.listActualCategoryNames().filter((item) => !ordered.includes(item));
    writeJson(this.orderPath, [...ordered, ...missing]);
  }

  private ensureCategoryOrder(categories: string[]): void {
    const current = this.readCategoryOrder();
    for (const category of categories) {
      if (category && !current.includes(category)) current.push(category);
    }
    this.writeCategoryOrder(current);
  }

  private removeFromCategoryOrder(categories: string[]): void {
    const removed = new Set(categories);
    this.writeCategoryOrder(this.readCategoryOrder().filter((item) => !removed.has(item)));
  }

  private sortCategories(categories: string[]): string[] {
    const order = this.readCategoryOrder();
    const orderMap = new Map(order.map((item, index) => [item, index]));
    return [...categories].sort((a, b) => {
      const aIndex = orderMap.has(a) ? orderMap.get(a)! : Number.MAX_SAFE_INTEGER;
      const bIndex = orderMap.has(b) ? orderMap.get(b)! : Number.MAX_SAFE_INTEGER;
      if (aIndex !== bIndex) return aIndex - bIndex;
      return a.localeCompare(b, 'zh-CN');
    });
  }

  private listActualCategoryNames(): string[] {
    const index = this.readCategoryIndex();
    return Array.from(new Set([
      ...Object.keys(index.descriptions),
      ...Object.keys(index.files),
    ]));
  }
}
