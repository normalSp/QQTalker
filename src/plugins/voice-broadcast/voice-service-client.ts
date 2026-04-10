import http from 'http';
import https from 'https';
import { URL } from 'url';
import { logger } from '../../logger';
import type {
  VoiceBackendInfo,
  VoiceModelEntry,
  VoiceServiceStatus,
  VoiceSynthesisRequest,
  VoiceSynthesisResult,
} from './types';

export class VoiceServiceClient {
  constructor(
    private readonly baseUrl: string,
    private readonly timeoutMs: number,
  ) {}

  async health(): Promise<VoiceServiceStatus> {
    return this.requestJson<VoiceServiceStatus>('GET', '/health');
  }

  async listBackends(): Promise<VoiceBackendInfo[]> {
    const data = await this.requestJson<{ backends?: VoiceBackendInfo[] }>('GET', '/backends');
    return data.backends || [];
  }

  async listModels(): Promise<VoiceModelEntry[]> {
    const data = await this.requestJson<{ models?: VoiceModelEntry[] }>('GET', '/models');
    return data.models || [];
  }

  async rescanModels(): Promise<VoiceModelEntry[]> {
    const data = await this.requestJson<{ models?: VoiceModelEntry[] }>('POST', '/models/rescan', {});
    return data.models || [];
  }

  async synthesize(payload: VoiceSynthesisRequest, route: '/synthesize' | '/preview' = '/synthesize'): Promise<VoiceSynthesisResult> {
    return this.requestJson<VoiceSynthesisResult>('POST', route, payload);
  }

  private requestJson<T>(method: string, route: string, body?: unknown): Promise<T> {
    return new Promise<T>((resolve, reject) => {
      const url = new URL(route, this.baseUrl.endsWith('/') ? this.baseUrl : `${this.baseUrl}/`);
      const isHttps = url.protocol === 'https:';
      const payload = body === undefined ? undefined : JSON.stringify(body);
      const requestFn = isHttps ? https.request : http.request;

      const req = requestFn({
        protocol: url.protocol,
        hostname: url.hostname,
        port: url.port ? Number(url.port) : (isHttps ? 443 : 80),
        path: `${url.pathname}${url.search}`,
        method,
        headers: {
          'Content-Type': 'application/json',
          ...(payload ? { 'Content-Length': Buffer.byteLength(payload) } : {}),
        },
        timeout: this.timeoutMs,
      }, (res) => {
        const chunks: Buffer[] = [];
        res.on('data', (chunk: Buffer) => chunks.push(chunk));
        res.on('end', () => {
          const raw = Buffer.concat(chunks).toString('utf-8');
          if (res.statusCode && res.statusCode >= 400) {
            reject(new Error(`Voice service ${route} failed: ${res.statusCode} ${raw}`));
            return;
          }

          try {
            resolve(JSON.parse(raw || '{}') as T);
          } catch (error) {
            reject(error);
          }
        });
      });

      req.on('error', reject);
      req.on('timeout', () => {
        req.destroy();
        reject(new Error(`Voice service request timeout: ${route}`));
      });

      if (payload) {
        req.write(payload);
      }
      req.end();
    }).catch((error: unknown) => {
      logger.debug({ error, route }, '[VoiceServiceClient] request failed');
      throw error;
    });
  }
}
