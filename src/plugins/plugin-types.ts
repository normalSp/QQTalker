import type http from 'http';
import type { URL } from 'url';
import type { GroupMessage, OneBotMessage } from '../types/onebot';
import type { ChatMessage, SessionMode, SessionManager } from '../services/session-manager';
import type { CodeBuddyClient } from '../services/codebuddy-client';
import type { OneBotClient } from '../services/onebot-client';
import type { DashboardService } from '../services/dashboard-service';

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
  method: 'GET' | 'POST' | 'PUT' | 'DELETE';
  path: string;
  handler: (ctx: DashboardRouteContext) => Promise<DashboardRouteResult | void> | DashboardRouteResult | void;
}

export interface PluginContext {
  onebot: OneBotClient;
  aiClient: CodeBuddyClient;
  sessions: SessionManager;
  dashboard: DashboardService;
  dataDir: string;
}

export interface QQTalkerPlugin {
  id: string;
  name: string;
  initialize?(context: PluginContext): Promise<void> | void;
  dispose?(): Promise<void> | void;
  onMessage?(context: PluginMessageContext): Promise<void> | void;
  beforeChat?(context: PromptHookContext): Promise<PromptHookResult | void> | PromptHookResult | void;
  handleCommand?(context: PluginCommandContext): Promise<PluginCommandResult | void> | PluginCommandResult | void;
  getDashboardRoutes?(): DashboardRouteProvider[];
}
