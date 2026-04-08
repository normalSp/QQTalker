import https from 'https';
import http from 'http';
import { logger } from '../logger';
import { config } from '../types/config';

/**
 * AI 图片识别/描述服务 (Vision)
 * 
 * 使用 OpenAI 兼容的 /chat/completions 接口的 vision 能力
 * 支持传入图片 URL 或 base64 数据，让 AI 描述图片内容
 */
export class VisionService {
  private apiKey: string;
  private baseUrl: string;
  private model: string;
  private enabled: boolean;

  constructor() {
    this.apiKey = config.aiApiKey;
    this.baseUrl = config.aiBaseUrl.replace(/\/+$/, '');
    this.model = config.aiModel;
    // 检查模型是否支持 vision（通常 gpt-4o, gpt-4-vision, gpt-4o-mini 等支持）
    // DeepSeek 等纯文本模型不支持，需要单独配置或自动检测
    const visionModels = ['gpt-4o', 'gpt-4o-mini', 'gpt-4-turbo', 'gpt-4v', 'claude-3', 'gemini'];
    this.enabled = visionModels.some(vm => this.model.toLowerCase().includes(vm));
    
    // 图片识别功能已禁用（需要 OpenAI vision 模型支持）
    logger.info(`[Vision] 图片识别功能已禁用（当前未配置 vision 模型）`);
  }

  isEnabled(): boolean {
    // 图片识别需要 OpenAI vision 模型（如 gpt-4o），当前未配置，直接禁用
    return false;
  }

  /**
   * 识别/描述一张图片
   * 
   * @param imageUrl 图片的 HTTP URL 或 base64 数据（data:image/... 格式）
   * @param userPrompt 用户提示词（如"描述这张图片"、"图中有什么"等）
   * @returns AI 对图片的描述文字
   */
  async describeImage(
    imageUrl: string,
    userPrompt: string = '请用中文简要描述这张图片的内容，1-2句话即可。'
  ): Promise<string | null> {
    if (!this.apiKey) {
      logger.warn('[Vision] 未配置 API Key');
      return null;
    }

    try {
      // 构造图片内容（OpenAI vision 格式）
      let imageContent: any;

      if (imageUrl.startsWith('data:') || imageUrl.startsWith('http')) {
        imageContent = {
          type: 'image_url',
          image_url: {
            url: imageUrl,
            detail: 'low', // low detail 更快更省 token
          },
        };
      } else {
        // 尝试作为 URL 处理
        imageContent = {
          type: 'image_url',
          image_url: {
            url: imageUrl,
            detail: 'low',
          },
        };
      }

      const body = JSON.stringify({
        model: this.model,
        messages: [
          {
            role: 'user',
            content: [
              imageContent,
              {
                type: 'text',
                text: userPrompt,
              },
            ],
          },
        ],
        max_tokens: 500,
      });

      const result = await this.callChatApi(body);
      
      if (result && result.trim()) {
        logger.info(`[Vision] 识别完成: "${result.substring(0, 60)}"`);
        return result;
      }
      
      return null;
    } catch (error) {
      const errMsg = error instanceof Error ? error.message : String(error);
      logger.warn(`[Vision] 图片识别失败: ${errMsg}`);
      
      // 如果是模型不支持的错误，给出明确提示
      if (errMsg.includes('vision') || errMsg.includes('image') || errMsg.includes('modality')) {
        logger.warn('[Vision] 当前模型可能不支持图片输入，建议使用 gpt-4o 等支持 vision 的模型');
      }
      
      return null;
    }
  }

  /**
   * 带上下文的图片识别（用于群聊场景）
   * 
   * @param imageUrl 图片URL
   * @param contextText 群聊上下文文字（有人在讨论什么）
   * @returns 结合上下文的图片描述
   */
  async describeImageWithContext(
    imageUrl: string,
    contextText?: string
  ): Promise<string | null> {
    let prompt = '你是QQ群里的猫娘Claw喵~ 请用1-2句话描述这张图，口语化一点，加喵~';
    
    if (contextText) {
      prompt += `\n\n大家在聊: ${contextText}\n\n如果这张图跟聊天相关，就结合着说一下~`;
    }

    return this.describeImage(imageUrl, prompt);
  }

  /**
   * 将本地文件路径转为 base64 data URI
   */
  static fileToDataUri(filePath: string, mimeType: string = 'image/jpeg'): string | null {
    try {
      const fs = require('fs');
      const buffer = fs.readFileSync(filePath);
      const base64 = buffer.toString('base64');
      return `data:${mimeType};base64,${base64}`;
    } catch (e) {
      logger.warn(`[Vision] 文件读取失败: ${filePath}`);
      return null;
    }
  }

  /**
   * 从 CQ 码提取图片 URL
   * 支持: [CQ:image,file=xxx], [CQ:image,url=xxx]
   */
  static extractImageUrl(cqCode: string): string | null {
    // 匹配 url=
    const urlMatch = cqCode.match(/url=([^\s,\]]+)/);
    if (urlMatch) return decodeURIComponent(urlMatch[1]);
    
    // 匹配 file= (可能是 http(s) URL 或本地路径)
    const fileMatch = cqCode.match(/file=([^\s,\]]+)/);
    if (fileMatch) {
      const file = decodeURIComponent(fileMatch[1]);
      if (file.startsWith('http://') || file.startsWith('https://')) {
        return file;
      }
      // 本地文件尝试转 base64
      return VisionService.fileToDataUri(file);
    }
    
    return null;
  }

  /**
   * 调用 OpenAI 兼容的 chat completions API
   */
  private callChatApi(body: string): Promise<string | null> {
    return new Promise((resolve, reject) => {
      const urlObj = new URL(this.baseUrl);
      const apiPath = urlObj.pathname === '/' || !urlObj.pathname 
        ? '/v1/chat/completions' 
        : urlObj.pathname.replace(/\/+$/, '') + '/chat/completions';

      const isHttps = urlObj.protocol === 'https:';
      const mod = isHttps ? https : http;

      const options: https.RequestOptions = {
        hostname: urlObj.hostname,
        port: urlObj.port || (isHttps ? 443 : 80),
        path: apiPath,
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${this.apiKey}`,
          'Content-Type': 'application/json',
          'Content-Length': Buffer.byteLength(body),
        },
        timeout: 30000,
      };

      const req = mod.request(options, (res) => {
        const chunks: Buffer[] = [];
        res.on('data', chunk => chunks.push(chunk));
        res.on('end', () => {
          const data = Buffer.concat(chunks).toString('utf-8');
          
          if (res.statusCode !== 200) {
            reject(new Error(`Vision API error ${res.statusCode}: ${data.substring(0, 200)}`));
            return;
          }

          try {
            const json = JSON.parse(data);
            const text = json.choices?.[0]?.message?.content || '';
            resolve(text.trim());
          } catch {
            resolve(data.trim());
          }
        });
      });

      req.on('error', (e) => {
        reject(new Error(`Vision network error: ${e.message}`));
      });
      req.on('timeout', () => { req.destroy(); reject(new Error('Vision API timeout')); });
      req.write(body);
      req.end();
    });
  }
}
