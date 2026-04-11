import type http from 'http';
import type { URL } from 'url';
import type { GroupMessage, OneBotMessage } from '../types/onebot';
import type { ChatMessage, SessionMode, SessionManager } from '../services/session-manager';
import type { CodeBuddyClient } from '../services/codebuddy-client';
import type { OneBotClient } from '../services/onebot-client';
import type { DashboardService } from '../services/dashboard-service';
import type { PersonaService } from '../services/persona-service';

export type DashboardHttpMethod = 'GET' | 'POST' | 'PUT' | 'DELETE';
export type PluginSourceType = 'builtin' | 'local' | 'npm' | 'git' | 'adapter';
export type PluginRuntimeMode = 'in-process' | 'bridge' | 'process';
export type PluginRuntimeStatus = 'inactive' | 'starting' | 'healthy' | 'degraded' | 'disabled' | 'error';
export type PluginUiMode = 'none' | 'schema' | 'bundle' | 'hybrid';
export type PluginPermission =
  | 'message.read'
  | 'message.send'
  | 'storage.plugin'
  | 'dashboard.route'
  | 'dashboard.page'
  | 'config.read'
  | 'config.write'
  | 'session.read'
  | 'session.write'
  | 'persona.read'
  | 'persona.write'
  | 'shell.exec'
  | 'adapter.bridge';
export type PluginHookType =
  | 'message'
  | 'command'
  | 'prompt'
  | 'before-model-request'
  | 'after-model-response'
  | 'config'
  | 'dashboard';
export type PluginConfigFieldType =
  | 'string'
  | 'number'
  | 'boolean'
  | 'enum'
  | 'array'
  | 'secret'
  | 'textarea'
  | 'map';

export interface PluginMessageContext {
  message: OneBotMessage;
  groupMessage?: GroupMessage;
  groupId?: number;
  userId: number;
  nickname: string;
  rawText: string;
  finalText: string;
  isAtBot: boolean;
  mode?: SessionMode;
  timestamp: number;
}

export interface PromptHookContext {
  groupId: number;
  userId: number;
  nickname: string;
  basePersonaId: string;
  rawText: string;
  userMessage: string;
  history: ChatMessage[];
  mode: SessionMode;
}

export interface PromptHookResult {
  pluginId: string;
  sections: string[];
}

export interface PluginCommandContext {
  groupId: number;
  userId: number;
  nickname: string;
  rawText: string;
  normalizedText: string;
  isAdmin: boolean;
}

export interface PluginCommandResult {
  handled: boolean;
  reply?: string;
}

export interface PluginModelRequestContext {
  groupId: number;
  userId: number;
  nickname: string;
  mode: SessionMode;
  rawText: string;
  userMessage: string;
  history: ChatMessage[];
  basePersonaId: string;
  systemPrefix?: string;
  systemPrompt?: string;
}

export interface PluginModelResponseContext extends PluginModelRequestContext {
  reply: string;
}

export interface PluginModelRequestResult {
  handled?: boolean;
  reply?: string;
  userMessage?: string;
  history?: ChatMessage[];
  systemPrefix?: string;
  systemPrompt?: string;
}

export interface PluginModelResponseResult {
  reply?: string;
}

export interface DashboardRouteContext {
  req: http.IncomingMessage;
  res: http.ServerResponse;
  url: URL;
  body?: Record<string, any>;
}

export interface DashboardRouteResult {
  status?: number;
  data?: unknown;
  contentType?: string;
}

export interface DashboardRouteProvider {
  method: DashboardHttpMethod;
  path: string;
  handler: (ctx: DashboardRouteContext) => Promise<DashboardRouteResult | void> | DashboardRouteResult | void;
}

export interface PluginDashboardPage {
  id: string;
  title: string;
  routePath: string;
  icon?: string;
  description?: string;
}

export interface PluginUiManifest {
  mode: PluginUiMode;
  entry?: string;
  pages?: PluginDashboardPage[];
}

export interface PluginConfigField {
  key: string;
  type: PluginConfigFieldType;
  title: string;
  description?: string;
  required?: boolean;
  secret?: boolean;
  multiline?: boolean;
  placeholder?: string;
  defaultValue?: string | number | boolean | string[] | Record<string, string>;
  enumOptions?: Array<{ label: string; value: string }>;
  itemPlaceholder?: string;
}

export interface PluginConfigSchema {
  version?: number;
  title?: string;
  description?: string;
  fields: PluginConfigField[];
}

export interface PluginInstallSource {
  type: PluginSourceType;
  upstreamType?: 'local' | 'npm' | 'git';
  locator: string;
  ref?: string;
  resolvedPath?: string;
  resolvedVersion?: string;
  packageName?: string;
  installedAt?: string;
}

export interface PluginManifest {
  id: string;
  name: string;
  version: string;
  entry?: string;
  description?: string;
  sourceType?: PluginSourceType;
  runtimeMode?: PluginRuntimeMode;
  engine?: {
    qqtalker?: string;
  };
  permissions?: PluginPermission[];
  hooks?: PluginHookType[];
  configSchema?: string;
  ui?: PluginUiManifest;
  capabilities?: string[];
  adapter?: {
    type: string;
    target?: string;
  };
}

export interface PluginRuntimeState {
  mode: PluginRuntimeMode;
  status: PluginRuntimeStatus;
  enabled: boolean;
  initializedAt?: string;
  lastError?: string;
  healthMessage?: string;
}

export interface PluginHealthReport {
  status: PluginRuntimeStatus;
  message?: string;
  checkedAt: string;
  details?: Record<string, unknown>;
}

export interface PluginRegistryEntry {
  id: string;
  version: string;
  name: string;
  enabled: boolean;
  builtin?: boolean;
  description?: string;
  installSource: PluginInstallSource;
  manifestPath?: string;
  runtime: PluginRuntimeState;
  adapterType?: string;
  configPath?: string;
  createdAt: string;
  updatedAt: string;
}

export interface PluginInstallerRequest {
  source: 'local' | 'npm' | 'git';
  locator: string;
  ref?: string;
  enable?: boolean;
}

export interface PluginInstallerResult {
  success: boolean;
  entry?: PluginRegistryEntry;
  manifest?: PluginManifest;
  resolvedPath?: string;
  warnings?: string[];
  error?: string;
}

export interface PluginDashboardApi {
  pushLog(type: string, message: string): void;
}

export interface PluginLoggerApi {
  debug(message: string, extra?: Record<string, unknown>): void;
  info(message: string, extra?: Record<string, unknown>): void;
  warn(message: string, extra?: Record<string, unknown>): void;
  error(message: string, extra?: Record<string, unknown>): void;
}

export interface PluginMessagingApi {
  sendGroupText(groupId: number, message: string): Promise<void>;
  sendPrivateText(userId: number, message: string): Promise<void>;
}

export interface PluginStorageApi {
  getPluginDataDir(): string;
  getPluginRuntimeDir(): string;
}

export interface PluginConfigApi {
  get<T = Record<string, unknown>>(): Promise<T>;
  set(values: Record<string, unknown>): Promise<Record<string, unknown>>;
  getSchema(): PluginConfigSchema | undefined;
}

export interface PluginHostApi {
  messaging: PluginMessagingApi;
  storage: PluginStorageApi;
  config: PluginConfigApi;
  dashboard: PluginDashboardApi;
  logger: PluginLoggerApi;
}

export interface PluginContext {
  onebot: OneBotClient;
  aiClient: CodeBuddyClient;
  sessions: SessionManager;
  dashboard: DashboardService;
  personas: PersonaService;
  dataDir: string;
  pluginId?: string;
  manifest?: PluginManifest;
  registryEntry?: PluginRegistryEntry;
  host?: PluginHostApi;
}

export interface PluginRuntimeContext extends PluginContext {
  pluginId: string;
  manifest: PluginManifest;
  registryEntry: PluginRegistryEntry;
  host: PluginHostApi;
}

export interface PluginPackageInspection {
  type: 'native' | 'adapter' | 'unknown';
  manifest?: PluginManifest;
  adapterType?: string;
  manifestPath?: string;
  warnings?: string[];
}

export interface PluginBridgeInstance {
  getHealthReport?(): Promise<PluginHealthReport> | PluginHealthReport;
  dispose?(): Promise<void> | void;
}

export interface PluginPackageAdapter {
  readonly id: string;
  canHandle(sourcePath: string): Promise<boolean> | boolean;
  inspect(sourcePath: string): Promise<PluginPackageInspection>;
  install?(sourcePath: string, request: PluginInstallerRequest): Promise<PluginInstallerResult>;
  createBridge?(context: PluginRuntimeContext): Promise<PluginBridgeInstance | null> | PluginBridgeInstance | null;
}

export interface QQTalkerPlugin {
  id: string;
  name: string;
  manifest?: PluginManifest;
  initialize?(context: PluginContext): Promise<void> | void;
  onLoad?(context: PluginRuntimeContext): Promise<void> | void;
  onEnable?(context: PluginRuntimeContext): Promise<void> | void;
  onDisable?(context: PluginRuntimeContext): Promise<void> | void;
  onConfigChanged?(nextConfig: Record<string, unknown>, context: PluginRuntimeContext): Promise<void> | void;
  dispose?(): Promise<void> | void;
  onMessage?(context: PluginMessageContext): Promise<void> | void;
  onMessageReceived?(context: PluginMessageContext): Promise<void> | void;
  beforeChat?(context: PromptHookContext): Promise<PromptHookResult | void> | PromptHookResult | void;
  beforeModelRequest?(context: PluginModelRequestContext): Promise<PluginModelRequestResult | void> | PluginModelRequestResult | void;
  afterModelResponse?(context: PluginModelResponseContext): Promise<PluginModelResponseResult | void> | PluginModelResponseResult | void;
  handleCommand?(context: PluginCommandContext): Promise<PluginCommandResult | void> | PluginCommandResult | void;
  getDashboardRoutes?(): DashboardRouteProvider[];
  getDashboardPages?(): PluginDashboardPage[];
  getConfigSchema?(): PluginConfigSchema | undefined;
  getDefaultConfig?(): Record<string, unknown>;
}
