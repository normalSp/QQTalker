import https from 'https';
import pino from 'pino';
import { config } from '../types/config';

const logger = pino({ level: config.logLevel });

/**
 * TTS 语音合成服务
 * 使用百度翻译TTS (国内可访问、免费、无需API Key)
 */
export class TTSService {
  private enabled: boolean;

  constructor() {
    this.enabled = config.ttsEnabled;
    if (this.enabled) {
      logger.info('\u{1F514} TTS\u8BED\u97F3\u529F\u80FD\u5DF2\u542F\u7528');
    }
  }

  /**
   * 文本转语音 - 返回音频 Buffer (MP3格式)
   * 使用百度翻译在线TTS接口
   */
  async textToSpeech(text: string): Promise<Buffer | null> {
    if (!this.enabled) return null;

    try {
      const cleanText = this.cleanText(text);
      if (!cleanText || cleanText.length < 1) return null;

      // 百度TTS单次最大约200字符，超长文本分段拼接
      const chunks = this.splitText(cleanText, 150);
      const buffers: Buffer[] = [];

      for (const chunk of chunks) {
        const audioBuffer = await this.fetchBaiduTTS(chunk);
        if (audioBuffer && audioBuffer.length > 256) {
          buffers.push(audioBuffer);
        }
        // 分段间加小延迟避免频率限制
        if (chunks.length > 1 && buffers.length < chunks.length) {
          await this.sleep(300);
        }
      }

      if (buffers.length === 0) throw new Error('no valid audio segments');

      // 合并所有音频段
      const result = Buffer.concat(buffers);
      logger.info(
        '\u{1F3A4} TTS\u8F6C\u6362\u6210\u529F, \u5927\u5C0F: ' +
        Math.round(result.length / 1024) + 'KB, \u6BB5\u6570: ' + buffers.length
      );
      return result;

    } catch (error) {
      logger.warn({ error }, 'TTS\u8F6C\u6362\u5931\u8D25');
      return null;
    }
  }

  /**
   * 调用百度翻译TTS API
   * URL: https://fanyi.baidu.com/gettts?lan=zh&text=xxx&source=web&spd=3
   *
   * 参数说明:
   * lan = zh (中文)
   * text = 要转换的文本
   * source = web
   * spd = 语速 (1-10, 默认3中等)
   */
  private fetchBaiduTTS(text: string): Promise<Buffer> {
    return new Promise((resolve, reject) => {
      const encodedText = encodeURIComponent(text);
      const urlStr =
        '/gettts?lan=zh&text=' +
        encodedText +
        '&source=web&spd=' +
        (config.ttsSpeed || 4);

      const options: https.RequestOptions = {
        hostname: 'fanyi.baidu.com',
        port: 443,
        path: urlStr,
        method: 'GET',
        headers: {
          'User-Agent':
            'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
          'Accept': '*/*',
          'Referer': 'https://fanyi.baidu.com/',
          'Accept-Encoding': 'identity',  // 不要gzip，直接获取mp3
        },
        timeout: 10000,
      };

      const req = https.request(options, (res) => {
        // 处理重定向
        if (
          res.statusCode &&
          res.statusCode >= 300 &&
          res.statusCode < 400 &&
          res.headers.location
        ) {
          https
            .get(res.headers.location, { timeout: 10000 }, (res2) => {
              this.collectAudio(res2, resolve, reject);
            })
            .on('error', reject);
          return;
        }

        this.collectAudio(res, resolve, reject);
      });

      req.on('error', reject);
      req.on('timeout', () => {
        req.destroy();
        reject(new Error('BaiduTTS timeout'));
      });

      req.end();
    });
  }

  /**
   * 收集音频数据
   */
  private collectAudio(
    res: import('http').IncomingMessage,
    resolve: (value: Buffer | PromiseLike<Buffer>) => void,
    reject: (reason?: Error) => void
  ): void {
    const chunks: Buffer[] = [];
    res.on('data', (chunk: Buffer) => chunks.push(chunk));
    res.on('end', () => {
      const buffer = Buffer.concat(chunks);
      if (res.statusCode === 200 && buffer.length > 256) {
        resolve(buffer);
      } else {
        reject(
          new Error(
            'BaiduTTS status=' + res.statusCode + ' size=' + buffer.length
          )
        );
      }
    });
    res.on('error', (e) => reject(e));
  }

  /**
   * 将文本按标点分割成多段（每段不超过maxLength）
   */
  private splitText(text: string, maxLength: number): string[] {
    if (text.length <= maxLength) return [text];

    const result: string[] = [];
    let current = '';

    for (const char of text) {
      current += char;

      // 在句号/问号/感叹号/逗号处切分
      if (
        current.length >= maxLength * 0.8 &&
        /[。！？!？\n]/.test(char)
      ) {
        result.push(current.trim());
        current = '';
      } else if (current.length >= maxLength) {
        result.push(current.trim());
        current = '';
      }
    }

    if (current.trim()) result.push(current.trim());
    return result;
  }

  /**
   * 清理文本
   */
  private cleanText(text: string): string {
    return text
      .replace(/[\uD83C-\uDBFF\uDC00-\uDFFF]/g, '')       // emoji
      .replace(/\([^)]*\)/g, '')
      .replace(/[｡-ﾟ]/g, '')
      .replace(/\[[^\]]*\]/g, '')
      .replace(/\s+/g, ' ')
      .trim();
  }

  private sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  isEnabled(): boolean {
    return this.enabled;
  }
}
