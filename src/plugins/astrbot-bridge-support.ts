import fs from 'fs';
import path from 'path';
import type { PluginConfigField, PluginConfigSchema, PluginManifest } from './plugin-types';

export type FlatConfig = Record<string, unknown>;

export interface AstrBotMetadata {
  name?: string;
  version?: string;
  repo?: string;
  desc?: string;
}

export interface AstrBotRawSchemaField {
  description?: string;
  type?: string;
  default?: unknown;
  hint?: string;
  options?: string[];
  items?: Record<string, AstrBotRawSchemaField>;
}

export function readAstrBotJson<T>(filePath: string, fallback: T): T {
  try {
    if (!fs.existsSync(filePath)) return fallback;
    return JSON.parse(fs.readFileSync(filePath, 'utf-8')) as T;
  } catch {
    return fallback;
  }
}

export function readAstrBotMetadata(sourcePath: string): AstrBotMetadata {
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

export function readAstrBotMetadataName(sourcePath: string): string {
  return readAstrBotMetadata(sourcePath).name || path.basename(sourcePath);
}

export function hasAstrBotWebUi(sourcePath: string): boolean {
  return fs.existsSync(path.join(sourcePath, 'webui.py'));
}

export function readAstrBotSchema(sourcePath: string): Record<string, AstrBotRawSchemaField> {
  return readAstrBotJson<Record<string, AstrBotRawSchemaField>>(path.join(sourcePath, '_conf_schema.json'), {});
}

export function flattenAstrBotSchemaFields(schema: Record<string, AstrBotRawSchemaField>, prefix = ''): PluginConfigField[] {
  const fields: PluginConfigField[] = [];
  for (const [key, field] of Object.entries(schema || {})) {
    const fieldKey = prefix ? `${prefix}.${key}` : key;
    const type = field.type || 'string';
    if (type === 'object' && field.items) {
      fields.push(...flattenAstrBotSchemaFields(field.items, fieldKey));
      continue;
    }
    fields.push({
      key: fieldKey,
      title: field.description || fieldKey,
      description: field.hint,
      type:
        type === 'bool' ? 'boolean' :
        type === 'int' ? 'number' :
        type === 'list' ? 'array' :
        type === 'object' ? 'map' :
        type === 'string' && /secret|key|token|password/i.test(fieldKey) ? 'secret' :
        type === 'string' && /prompt|rule|description|content/i.test(fieldKey) ? 'textarea' :
        (type as PluginConfigField['type']),
      defaultValue: field.default as any,
      enumOptions: field.options?.map((option) => ({ label: option, value: option })),
      secret: /secret|token|password/i.test(fieldKey),
      multiline: /prompt|rule|description|content/i.test(fieldKey),
    });
  }
  return fields;
}

export function buildAstrBotDefaultConfig(
  schema: Record<string, AstrBotRawSchemaField>,
  prefix = '',
  target: FlatConfig = {},
): FlatConfig {
  for (const [key, field] of Object.entries(schema || {})) {
    const fieldKey = prefix ? `${prefix}.${key}` : key;
    const type = field.type || 'string';
    if (type === 'object' && field.items) {
      buildAstrBotDefaultConfig(field.items, fieldKey, target);
      continue;
    }
    if (field.default !== undefined) {
      target[fieldKey] = field.default;
    }
  }
  return target;
}

export function buildAstrBotConfigSchema(sourcePath: string, title: string, description: string): PluginConfigSchema {
  const schemaSource = readAstrBotSchema(sourcePath);
  return {
    title,
    description,
    fields: flattenAstrBotSchemaFields(schemaSource),
  };
}

export function parseAstrBotStringMap(configSource: string, variableName: string): Record<string, string> {
  const match = configSource.match(new RegExp(`${variableName}\\s*=\\s*\\{([\\s\\S]*?)\\n\\}`, 'm'));
  if (!match) return {};
  const body = match[1];
  const descriptions: Record<string, string> = {};
  const regex = /"([^"]+)"\s*:\s*"([^"]*)"/g;
  let result: RegExpExecArray | null;
  while ((result = regex.exec(body)) !== null) {
    descriptions[result[1]] = result[2];
  }
  return descriptions;
}

export function buildAstrBotBridgeManifest(sourcePath: string): PluginManifest {
  const metadata = readAstrBotMetadata(sourcePath);
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
      target: metadata.name || 'astrbot',
      fallbackPageId: 'overview',
      nativeEquivalent: false,
    },
    ui: {
      mode: 'hybrid',
      pages: [
        {
          id: 'overview',
          title: '桥接概览',
          routePath: `/plugins/${pluginId}/page/overview`,
          description: '查看 AstrBot 插件桥接状态与接入说明。',
          renderMode: 'bridge-fallback',
          bridgeEndpoint: `/api/plugins/${pluginId}/astrbot-bridge/overview`,
        },
      ],
    },
  };
}
