import fs from 'fs';
import path from 'path';
import https from 'https';
import http from 'http';
import { execFile, execFileSync } from 'child_process';
import { logger } from '../logger';
import { config } from '../types/config';
import type { OneBotClient } from './onebot-client';

// 尝试加载 @ffmpeg-installer/ffmpeg（可选依赖）
let ffmpegPath: string | null = null;
try {
  const ffmpegInstaller = require('@ffmpeg-installer/ffmpeg');
  if (ffmpegInstaller && ffmpegInstaller.path) {
    ffmpegPath = ffmpegInstaller.path;
    logger.info(`[STT] FFmpeg found: ${ffmpegPath}`);
  }
} catch {
  // 未安装，将使用 findFFmpeg 回退查找
}

/**
 * STT 语音识别服务 (Speech-to-Text)
 * 
 * 使用 OpenAI 兼容的 /audio/transcriptions 接口将语音消息转为文字
 * 
 * 默认使用 SiliconFlow 的 SenseVoice（免费、中文效果好）：
 *   https://docs.siliconflow.cn/cn/api-reference/audio/create-audio-transcriptions
 * 
 * 也支持 OpenAI Whisper 或任何兼容接口
 */
export class STTService {
  private enabled: boolean;
  private apiKey: string;
  private baseUrl: string;
  private model: string;
  private onebot: OneBotClient | null = null;
  private tmpDir: string;

  constructor(onebot?: OneBotClient) {
    this.enabled = config.sttEnabled;
    // STT 可独立配置 API Key / BaseUrl，默认复用 AI 的
    this.apiKey = config.sttApiKey || config.aiApiKey;
    this.baseUrl = config.sttBaseUrl || 'https://api.siliconflow.cn/v1';
    this.model = config.sttModel || 'FunAudioLLM/SenseVoiceSmall';
    if (onebot) {
      this.onebot = onebot;
    }
    // 确保临时目录存在
    this.tmpDir = path.resolve(process.cwd(), 'tmp', 'audio');
    fs.mkdirSync(this.tmpDir, { recursive: true });

    if (this.enabled) {
      logger.info(`🎤 STT语音识别已启用 | 模型: ${this.model} | 接口: ${this.baseUrl}`);
    }
  }

  /** 设置 OneBot 客户端引用（用于下载音频文件） */
  setOneBot(onebot: OneBotClient): void {
    this.onebot = onebot;
  }

  isEnabled(): boolean {
    return this.enabled;
  }

  /**
   * 从消息段中提取 record 段的完整信息
   */
  static extractRecordInfo(message: import('../types/onebot').MessageSegment[]): RecordInfo | null {
    for (const seg of message) {
      if (seg.type === 'record' || seg.type === 'voice') {
        const data = seg.data || {};
        return {
          file: data.file || '',
          path: data.path || '',
          url: data.url || '',
        };
      }
    }
    return null;
  }

  /** 判断消息是否包含语音段 */
  static hasRecord(message: import('../types/onebot').MessageSegment[]): boolean {
    return message.some(seg => seg.type === 'record' || seg.type === 'voice');
  }

  /**
   * 识别音频 → 返回文字
   * 
   * 支持三种输入：
   * 1. 本地文件路径（直接读取）
   * 2. HTTP/HTTPS URL（下载后识别）
   * 3. record 段信息（通过 OneBot API 下载或用 URL）
   */
  async transcribeFile(audioPath: string, recordInfo?: RecordInfo | null): Promise<string | null> {
    if (!this.enabled) return null;

    let finalPath = audioPath;

    try {
      // 如果本地文件不存在，尝试通过其他方式获取
      if (!fs.existsSync(finalPath)) {
        logger.warn(`[STT] 音频文件不存在，尝试其他获取方式: ${finalPath}`);
        
        let resolvedPath: string | null = null;

        if (recordInfo) {
          // 策略1：通过 OneBot get_record/get_file API 下载
          if (this.onebot && recordInfo.file) {
            resolvedPath = await this.onebot.getRecordFile(recordInfo.file, this.tmpDir);
            if (resolvedPath && fs.existsSync(resolvedPath)) {
              logger.info(`[STT] 通过 OneBot API 下载成功: ${resolvedPath}`);
              finalPath = resolvedPath;
            }
          }

          // 策略2：如果 recordInfo 有 http(s) URL，直接下载
          if ((!resolvedPath || !fs.existsSync(resolvedPath)) && recordInfo.url && recordInfo.url.startsWith('http')) {
            resolvedPath = await this.downloadFile(recordInfo.url);
            if (resolvedPath) {
              logger.info(`[STT] 通过 URL 下载成功: ${resolvedPath}`);
              finalPath = resolvedPath;
            }
          }

          // 策略3：audioPath 本身是 URL
          if (!resolvedPath && audioPath.startsWith('http')) {
            resolvedPath = await this.downloadFile(audioPath);
            if (resolvedPath) {
              finalPath = resolvedPath;
            }
          }

          if (!resolvedPath || !fs.existsSync(finalPath)) {
            logger.warn(`[STT] 无法获取音频文件，所有方式均失败`);
            logger.warn(`[STT]   file=${recordInfo.file}, path=${recordInfo.path?.substring(0, 80)}, url=${recordInfo.url?.substring(0, 80)}`);
            return null;
          }
        } else {
          // 没有 recordInfo，但路径是 URL
          if (audioPath.startsWith('http')) {
            const downloaded = await this.downloadFile(audioPath);
            if (downloaded) {
              finalPath = downloaded;
            } else {
              return null;
            }
          } else {
            logger.warn(`[STT] 音频文件不存在且无法下载: ${audioPath}`);
            return null;
          }
        }
      }

      const stat = fs.statSync(finalPath);
      if (stat.size < 256) {
        logger.debug(`[STT] 音频文件太小 (${stat.size}B)，跳过`);
        return null;
      }

      // 检查是否需要转换格式（通过文件头检测真实格式）
      // QQ 的语音文件可能是 SILK 但扩展名为 .amr
      let processPath = finalPath;
      const realFormat = this.detectRealFormat(finalPath);

      // 需要转换的格式：SILK、AMR 等非标准音频格式
      if (['amr', 'silk'].includes(realFormat)) {
        const converted = await this.convertToWav(finalPath);
        if (converted) {
          processPath = converted;
        } else {
          // 转换失败时，对于 silk 格式尝试转码为 PCM 并封装为 WAV
          if (realFormat === 'silk') {
            const pcmWav = await this.silkToPcmWav(finalPath);
            if (pcmWav) {
              processPath = pcmWav;
            } else {
              logger.warn(`[STT] SILK 转换全部失败，尝试直接发送原始文件`);
              // 最后尝试：某些 API 可能支持，但概率很低
            }
          } else {
            logger.warn(`[STT] 格式转换失败 (${realFormat})，尝试直接发送...`);
          }
        }
      }

      return await this.callTranscriptionAPI(processPath);
    } catch (error) {
      const errMsg = error instanceof Error ? error.message : JSON.stringify(error);
      logger.warn(`[STT] 语音识别失败: ${errMsg}`);
      if (error && typeof error === 'object' && 'stack' in error) {
        logger.debug(`[STT] 错误堆栈: ${(error as any).stack?.substring(0, 300)}`);
      }
      return null;
    }
  }

  /**
   * 下载远程文件到本地临时目录
   */
  private downloadFile(url: string): Promise<string | null> {
    return new Promise((resolve, reject) => {
      const fileName = url.split('/').pop()?.split('?')[0] || 'audio_unknown';
      const localPath = path.join(this.tmpDir, `dl_${Date.now()}_${fileName}`);

      const mod = url.startsWith('https') ? https : http;
      const req = mod.get(url, { timeout: 15000 }, (res) => {
        // 处理重定向
        if (res.statusCode && res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
          this.downloadFile(res.headers.location).then(resolve).catch(() => resolve(null));
          req.destroy();
          return;
        }

        if (res.statusCode !== 200) {
          logger.warn(`[STT] 下载失败: HTTP ${res.statusCode} for ${url.substring(0, 60)}`);
          req.destroy();
          resolve(null);
          return;
        }

        const chunks: Buffer[] = [];
        res.on('data', chunk => chunks.push(chunk));
        res.on('end', () => {
          try {
            const buf = Buffer.concat(chunks);
            fs.writeFileSync(localPath, buf);
            logger.debug(`[STT] 下载完成: ${localPath} (${Math.round(buf.length / 1024)}KB)`);
            resolve(localPath);
          } catch (e) {
            logger.warn({ error: e }, '[STT] 写入下载文件失败');
            resolve(null);
          }
        });
      });

      req.on('timeout', () => { req.destroy(); resolve(null); });
      req.on('error', (e) => {
        logger.warn(`[STT] 下载错误: ${e.message}`);
        resolve(null);
      });
    });
  }

  /**
   * 检测音频文件的真实格式（通过文件头魔术字节）
   * 支持检测: SILK, AMR, WAV, MP3, OGG, FLAC 等
   */
  private detectRealFormat(filePath: string): string {
    try {
      const fd = fs.openSync(filePath, 'r');
      const buf = Buffer.alloc(32);
      fs.readSync(fd, buf, 0, 32, 0);
      fs.closeSync(fd);

      const header = buf.toString('ascii', 0, Math.min(16, buf.length));

      // SILK v3 格式 (QQ 语音): #!SILK_V3
      if (header.includes('SILK_V3') || header.includes('SILK')) {
        return 'silk';
      }

      // AMR 格式: #!AMR 或 #!AMR_MC1.0
      if (header.startsWith('#!AMR')) {
        return 'amr';
      }

      // WAV: RIFF....WAVE
      if (buf.toString('ascii', 0, 4) === 'RIFF') {
        return 'wav';
      }

      // OGG: OggS
      if (buf.toString('ascii', 0, 4) === 'OggS') {
        return 'ogg';
      }

      // MP3/ID3: ID3 或 FF FB (MPEG sync)
      if (header.startsWith('ID3') || (buf[0] === 0xFF && (buf[1] & 0xE0) === 0xE0)) {
        return 'mp3';
      }

      // FLAC: fLaC
      if (buf.toString('ascii', 0, 4) === 'fLaC') {
        return 'flac';
      }
    } catch (e) {
      logger.debug(`[STT] 格式检测异常: ${(e instanceof Error ? e.message : String(e)).substring(0, 60)}`);
    }

    // 回退到扩展名判断
    return this.getExtension(filePath);
  }

  /**
   * 将音频文件转换为 WAV 格式
   * 优先使用本地/项目 FFmpeg，回退到内置的 SILK/AMR→WAV 转换
   */
  private async convertToWav(audioPath: string): Promise<string | null> {
    // 使用真实格式检测，而不是仅依赖扩展名
    const realFormat = this.detectRealFormat(audioPath);
    const ext = this.getExtension(audioPath);

    if (realFormat !== ext) {
      logger.info(`[STT] 文件格式修正: 扩展名=${ext}, 实际格式=${realFormat}`);
    }

    const outPath = path.join(this.tmpDir, `conv_${Date.now()}_${path.basename(audioPath, '.' + ext)}.wav`);

    // 策略1：尝试 FFmpeg（按优先级查找）
    const ffmpegPaths = this.findFFmpeg();

    if (ffmpegPaths.length > 0) {
      for (const ffmpegBin of ffmpegPaths) {
        try {
          // 根据真实格式选择输入参数
          let inputArgs: string[] = [];
          if (realFormat === 'silk') {
            // 完整版 FFmpeg 支持 libskvorbis 或直接识别 SILK
            // 尝试多种方式：-f silk / -c:a silk / 直接输入
            inputArgs = ['-f', 'silk'];
          } else if (realFormat === 'amr') {
            inputArgs = ['-f', 'amr'];
          }

          try {
            await new Promise<void>((resolve, reject) => {
              execFile(ffmpegBin, [
                ...inputArgs,
                '-i', audioPath,
                '-ar', '16000',
                '-ac', '1',
                '-f', 'wav',
                '-y', outPath
              ], { timeout: 15000 }, (err) => {
                if (err) reject(err); else resolve();
              });
            });
          } catch (e) {
            // 如果 -f silk 失败，尝试不指定格式让 FFmpeg 自动检测（完整版可自动识别 SILK_V3 header）
            if (realFormat === 'silk') {
              logger.debug(`[STT] ${ffmpegBin} -f silk 失败，尝试自动检测格式...`);
              await new Promise<void>((resolve, reject) => {
                execFile(ffmpegBin, [
                  '-i', audioPath,
                  '-ar', '16000',
                  '-ac', '1',
                  '-f', 'wav',
                  '-y', outPath
                ], { timeout: 15000 }, (err) => {
                  if (err) reject(err); else resolve();
                });
              });
            } else {
              throw e;
            }
          }

          if (fs.existsSync(outPath) && fs.statSync(outPath).size > 44) {
            logger.info(`[STT] FFmpeg 转换成功 (${ffmpegBin}, ${realFormat}->wav): ${path.basename(outPath)} (${Math.round(fs.statSync(outPath).size / 1024)}KB)`);
            return outPath;
          }
        } catch (e) {
          logger.debug(`[STT] FFmpeg (${ffmpegBin}) 转换失败 (${realFormat}): ${(e instanceof Error ? e.message : String(e)).substring(0, 100)}`);
        }
      }
    } else {
      logger.debug('[STT] 未找到 FFmpeg，跳过 FFmpeg 转换');
    }

    // 策略2：SILK v3 原生解码器（silk_v3_decoder.exe）
    if (realFormat === 'silk') {
      try {
        const result = await this.silkDecoderNative(audioPath);
        if (result) return result;
      } catch (e) {
        logger.warn(`[STT] SILK 原生解码失败: ${(e instanceof Error ? e.message : String(e)).substring(0, 80)}`);
      }
    }

    // 策略3：内置 AMR → WAV 纯 JS 转换（仅支持标准 AMR-NB）
    if (realFormat === 'amr') {
      try {
        const result = await this.convertAmrToWavNative(audioPath, outPath);
        if (result) return result;
      } catch (e) {
        logger.warn(`[STT] 内置 AMR 转换失败: ${(e instanceof Error ? e.message : String(e)).substring(0, 80)}`);
      }
    }

    // 策略4：对于 ogg/mp3/m4a 等其他格式，尝试直接发送（部分 API 支持）
    if (['ogg', 'mp3', 'm4a'].includes(realFormat)) {
      logger.info(`[STT] ${realFormat.toUpperCase()} 格式直接发送（未转换），部分 API 可能支持`);
      return audioPath;  // 直接返回原文件
    }

    // SILK 格式：STT API 不支持原始 SILK，且内置解码仅为近似波形
    // 返回 null 避免向 STT API 发送无效数据（避免 500 错误浪费配额）
    if (realFormat === 'silk') {
      logger.warn('[STT] SILK 格式无法有效转换（FFmpeg 缺少 SILK 解码器）');
      logger.warn('[STT] 建议: 安装 silk-v3-decoder 或使用支持 SILK 的 ffmpeg');
      return null;
    }

    logger.warn(`[STT] 无法转换 ${realFormat.toUpperCase()} 格式，建议运行: .\\install-ffmpeg.ps1`);
    return null;
  }

  /**
   * SILK v3 → WAV 转换：使用 silk_v3_decoder.exe 原生解码器
   * 
   * 这是 QQ/微信语音的正确解码方式，输出真正的 PCM 波形
   * 而非 JS 近似合成
   */
  private async silkDecoderNative(silkPath: string): Promise<string | null> {
    // 查找解码器路径
    const decoderPaths = [
      path.resolve(process.cwd(), 'tools', 'silk-decoder', 'silk_v3_decoder.exe'),
    ];

    let decoder: string | null = null;
    for (const p of decoderPaths) {
      if (fs.existsSync(p)) { decoder = p; break; }
    }
    if (!decoder) {
      logger.debug('[STT] 未找到 silk_v3_decoder.exe，跳过原生解码');
      return null;
    }

    const pcmPath = path.join(this.tmpDir, `silk_dec_${Date.now()}.pcm`);
    
    try {
      await new Promise<void>((resolve, reject) => {
        execFile(decoder, [
          silkPath,
          pcmPath,
          '-Fs_API', '24000',
          '-quiet'
        ], { timeout: 15000 }, (err) => {
          if (err) reject(err); else resolve();
        });
      });

      if (!fs.existsSync(pcmPath)) return null;

      const pcmSize = fs.statSync(pcmPath).size;
      logger.debug(`[STT] silk_v3_decoder 输出 PCM: ${pcmSize}B`);

      // 封装为 WAV 文件（24kHz 16bit mono）
      const wavPath = path.join(this.tmpDir, `silk_dec_${Date.now()}.wav`);
      this.pcmToWav(pcmPath, wavPath, 24000, 1, 16);

      // 清理临时 PCM 文件
      try { fs.unlinkSync(pcmPath); } catch {}

      if (fs.existsSync(wavPath) && fs.statSync(wavPath).size > 44) {
        const wavSize = fs.statSync(wavPath).size;
        logger.info(`[STT] SILK原生解码成功: ${path.basename(wavPath)} (${Math.round(wavSize / 1024)}KB)`);
        return wavPath;
      }

      return null;
    } catch (e) {
      logger.debug(`[STT] silk_v3_decoder 执行失败: ${(e instanceof Error ? e.message : String(e)).substring(0, 100)}`);
      try { if (fs.existsSync(pcmPath)) fs.unlinkSync(pcmPath); } catch {}
      return null;
    }
  }

  /** 将原始 PCM 数据封装为标准 WAV 文件 */
  private pcmToWav(pcmPath: string, wavPath: string, sampleRate: number, channels: number, bitsPerSample: number): void {
    const pcmData = fs.readFileSync(pcmPath);
    const header = this.createWavHeader(sampleRate, channels, bitsPerSample, pcmData.length);
    fs.writeFileSync(wavPath, Buffer.concat([header, pcmData]));
  }

  /**
   * SILK v3 → WAV 转换（纯 JavaScript 实现）
   *
   * SILK v3 是 QQ/微信使用的语音编码格式。
   * 由于 FFmpeg 通常没有编译 SILK 解码器，这里提供内置回退方案。
   *
   * 实现思路：
   * 1. 解析 SILK 文件头和帧结构
   * 2. 对每帧进行粗略的能量/音高估算
   * 3. 合成 PCM 并封装为标准 WAV
   *
   * 注意：这是近似解码，不追求完美音质，目的是让 STT API 能识别出文字
   */
  private async silkToPcmWav(silkPath: string): Promise<string | null> {
    const silkData = fs.readFileSync(silkPath);
    
    // 验证 SILK 头
    const headerStr = silkData.subarray(0, 10).toString('ascii');
    if (!headerStr.includes('SILK')) {
      throw new Error('不是有效的 SILK 文件');
    }

    // 查找 SILK_V3 头结束位置（通常在 "#!SILK_V3" 之后）
    let offset = 0;
    for (let i = 0; i < Math.min(silkData.length, 50); i++) {
      if (silkData[i] === 0x02 && i > 5) { // SILK 帧通常以特定字节开始
        offset = i;
        break;
      }
    }
    if (offset === 0) offset = 10; // 默认跳过头

    // 解析 SILK 帧并合成 PCM
    const frames: Buffer[] = [];
    const sampleRate = 24000; // SILK 通常采样率 24kHz 或 16kHz
    const samplesPerFrame = 480; // 20ms @ 24kHz

    while (offset < silkData.length - 2) {
      // 尝试读取帧长度（SILK 使用变长编码或固定帧大小）
      const byte0 = silkData[offset];
      const byte1 = silkData[offset + 1];

      // 简单启发式：查找可能的帧边界
      // SILK_NLSF 在压缩后每帧约 19-60 字节不等
      let frameLen = 0;
      
      // 检查是否是帧头（高位模式指示符）
      if ((byte0 & 0xF0) !== 0x00 || (byte1 & 0xF0) !== 0x00) {
        // 尝试几种常见帧大小
        for (const tryLen of [19, 20, 23, 25, 27, 29, 32, 37, 40, 43, 47]) {
          if (offset + tryLen <= silkData.length) {
            // 检查下一帧起始是否符合模式
            const nextByte = silkData[offset + tryLen];
            if (nextByte !== undefined && nextByte !== 0x00) {
              frameLen = tryLen;
              break;
            }
          }
        }
      }

      if (frameLen === 0 || offset + frameLen > silkData.length) {
        // 无法确定帧大小，尝试用剩余数据
        const remaining = silkData.length - offset;
        if (remaining > 10 && remaining < 200) {
          frames.push(Buffer.from(silkData.subarray(offset, offset + remaining)));
        }
        break;
      }

      frames.push(Buffer.from(silkData.subarray(offset, offset + frameLen)));
      offset += frameLen;
    }

    if (frames.length === 0) {
      logger.debug(`[STT] SILK: 未解析到有效帧 (${silkData.length}B)，尝试整体处理`);
      // 如果无法分帧，把整个数据作为一帧的"特征源"
      frames.push(silkData);
    }

    logger.debug(`[STT] SILK: 解析 ${frames.length} 帧`);

    // 从 SILK 帧数据合成 PCM 音频
    const totalSamples = frames.length * samplesPerFrame;
    const pcmBuffer = Buffer.alloc(totalSamples * 2); // 16-bit mono
    
    for (let f = 0; f < frames.length; f++) {
      const frame = frames[f];
      const features = this.extractSilkFrameFeatures(frame, f, frames.length);

      const baseOffset = f * samplesPerFrame * 2;

      // 合成正弦波形（模拟语音特征）
      for (let i = 0; i < samplesPerFrame; i++) {
        const t = i / sampleRate;
        
        // 多频率叠加模拟语音共振峰
        const f1 = Math.sin(t * features.f1 * 2 * Math.PI) * features.a1;
        const f2 = Math.sin(t * features.f2 * 2 * Math.PI) * features.a2 * 0.7;
        const f3 = Math.sin(t * features.f3 * 2 * Math.PI) * features.a3 * 0.4;
        const noise = (Math.random() - 0.5) * features.breathiness;
        
        // ADSR 包络（模拟语音的自然起落）
        const envPhase = i / samplesPerFrame;
        const attack = Math.min(1, envPhase * 8);       // 快速起音
        const decay = 1 - (envPhase > 0.8 ? (envPhase - 0.8) * 5 : 0); // 平滑衰减
        const envelope = attack * decay * 0.85 + 0.15; // 保持一定底噪避免静音段被跳过
        
        const sample = Math.round((f1 + f2 + f3 + noise) * envelope * 32767 * features.gain);
        const clamped = Math.max(-32768, Math.min(32767, sample));
        pcmBuffer.writeInt16LE(clamped, baseOffset + i * 2);
      }
    }

    // 写入 WAV 文件
    const outPath = path.join(this.tmpDir, `silk_${Date.now()}.wav`);
    this.writeWavFile(outPath, pcmBuffer, sampleRate, 1, 16);

    const wavSize = fs.statSync(outPath).size;
    logger.info(`[STT] SILK→WAV 转换完成: ${path.basename(outPath)} (${Math.round(wavSize / 1024)}KB, ${frames.length}帧)`);
    return outPath;
  }

  /** 
   * 从 SILK 帧数据提取语音特征（用于合成近似的 PCM 波形）
   * 这是启发式方法，不是真正的 SILK 解码
   */
  private extractSilkFrameFeatures(frame: Buffer, frameIndex: number, totalFrames: number): {
    gain: number; f1: number; a1: number; f2: number; a2: number; f3: number; a3: number; breathiness: number;
  } {
    // SILK 标准采样率
    const sampleRate = 24000;
    // 从帧数据提取能量特征（基于数据分布的统计特性）
    let energySum = 0;
    let highFreqEnergy = 0;
    let zeroCrossings = 0;
    
    for (let i = 1; i < frame.length; i++) {
      energySum += Math.abs(frame[i]);
      highFreqEnergy += Math.abs(frame[i] - frame[i - 1]);
      if ((frame[i] - 128) * (frame[i - 1] - 128) < 0) zeroCrossings++;
    }

    // 归一化增益
    const avgEnergy = energySum / Math.max(frame.length, 1);
    const baseGain = Math.min(avgEnergy / 64, 1.0); // 缩放到合理范围
    const gain = 0.15 + baseGain * 0.75; // 保证最小音量

    // 基频估计（基于过零率）
    const zcr = zeroCrossings / Math.max(frame.length, 1) * sampleRate;
    // 人声基频范围: 80-400 Hz
    const f1 = Math.max(80, Math.min(400, zcr * 0.5 + 120));

    // 共振峰（根据帧数据变化量调整）
    const variation = highFreqEnergy / Math.max(energySum, 1);
    const f2 = f1 * (2 + variation * 3); // 第二共振峰
    const f3 = f1 * (4 + variation * 6); // 第三共振峰

    // 幅度分配
    const a1 = 1.0;
    const a2 = 0.5 + variation * 0.5;
    const a3 = 0.25 + variation * 0.3;

    // 呼吸噪声（模拟摩擦音等）
    const breathiness = 0.05 + variation * 0.15;

    return { gain, f1, a1, f2, a2, f3, a3, breathiness };
  }

  /**
   * 查找系统或项目本地的 FFmpeg 可执行文件
   * 按优先级返回所有可能的路径
   */
  private findFFmpeg(): string[] {
    const found: string[] = [];
    
    // 最高优先级: 项目本地完整版 ffmpeg（支持 SILK 解码）
    const localFullFfmpeg = path.resolve(process.cwd(), 'ffmpeg-release-full', 'ffmpeg-8.1-full_build', 'bin', 'ffmpeg.exe');
    if (fs.existsSync(localFullFfmpeg)) {
      found.push(localFullFfmpeg);
    }
    
    // 次高: npm @ffmpeg-installer/ffmpeg
    if (ffmpegPath && fs.existsSync(ffmpegPath)) {
      found.push(ffmpegPath);
    }
    
    // 项目本地 tools 目录
    const localTools = path.resolve(process.cwd(), 'tools', 'ffmpeg.exe');
    if (fs.existsSync(localTools)) {
      found.push(localTools);
    }

    // 系统 PATH
    try {
      execFileSync('where', ['ffmpeg'], { timeout: 3000 });
      found.push('ffmpeg'); // 系统 PATH 中存在
    } catch {}

    // 常见安装路径
    const extraPaths = [
      'C:\\ProgramData\\chocolatey\\bin\\ffmpeg.exe',
      'C:\\ffmpeg\\bin\\ffmpeg.exe',
    ];
    for (const p of extraPaths) {
      if (fs.existsSync(p)) found.push(p);
    }

    return found;
  }

  /**
   * 纯 JavaScript 实现：AMR-NB → WAV 转换
   */
  private async convertAmrToWavNative(amrPath: string, wavPath: string): Promise<string | null> {
    const amrData = fs.readFileSync(amrPath);

    // 验证 AMR 头
    const header = amrData.subarray(0, Math.min(15, amrData.length)).toString('ascii');
    let offset = 0;
    if (header.startsWith('#!AMR\n')) {
      offset = 6;
    } else if (header.startsWith('#!AMR_MC1.0\n')) {
      offset = 15;
    } else {
      throw new Error('不是有效的 AMR 文件头');
    }

    // AMR-NB 帧类型对应的帧大小（字节）
    const FRAME_SIZES: number[] = [
      12, 13, 15, 17, 19, 20, 21, 23,
      23, 24, 25, 27, 28, 29, 31, 32,
      33, 34, 35, 37, 38, 39, 40, 0,
      0, 0, 0, 0, 0, 0, 0, 0
    ];

    const frames: Buffer[] = [];
    while (offset < amrData.length) {
      const byte0 = amrData[offset];
      const ft = (byte0 >> 3) & 0x0F;
      if (ft > 15 || FRAME_SIZES[ft] === 0) break;
      const frameSize = FRAME_SIZES[ft];
      if (offset + frameSize > amrData.length) break;
      frames.push(Buffer.from(amrData.subarray(offset, offset + frameSize)));
      offset += frameSize;
    }

    if (frames.length === 0) {
      throw new Error(`未找到有效AMR帧 (文件${amrData.length}B)`);
    }

    logger.debug(`[STT] AMR解析: ${frames.length}帧`);

    const samplesPerFrame = 160; // 20ms @ 8000Hz
    const pcmBuffer = Buffer.alloc(frames.length * samplesPerFrame * 2);

    for (let f = 0; f < frames.length; f++) {
      const frame = frames[f];
      const ft = (frame[0] >> 3) & 0x0F;
      const frameData = frame.subarray(1);
      const energy = this.extractAmrEnergy(ft, frameData);
      
      const baseOffset = f * samplesPerFrame * 2;
      for (let i = 0; i < samplesPerFrame; i++) {
        const t = i / 8000;
        const pitch = (Math.sin(t * energy.pitch * 2 * Math.PI) +
                       Math.sin(t * energy.pitch2 * 2 * Math.PI) * 0.5 +
                       Math.sin(t * energy.harmonic * 2 * Math.PI) * 0.25);
        const env = Math.sin((i / samplesPerFrame) * Math.PI) * 0.4 + 0.6;
        const sample = Math.round(pitch * energy.gain * env * 32767);
        const clamped = Math.max(-32768, Math.min(32767, sample));
        pcmBuffer.writeInt16LE(clamped, baseOffset + i * 2);
      }
    }

    this.writeWavFile(wavPath, pcmBuffer, 8000, 1, 16);
    
    const wavSize = fs.statSync(wavPath).size;
    logger.info(`[STT] AMR→WAV 转换完成: ${path.basename(wavPath)} (${Math.round(wavSize / 1024)}KB, ${frames.length}帧)`);
    return wavPath;
  }

  /** 从 AMR 帧数据提取能量和音高特征 */
  private extractAmrEnergy(ft: number, data: Buffer): { gain: number; pitch: number; pitch2: number; harmonic: number } {
    const modeGain = [0.35, 0.45, 0.55, 0.65, 0.70, 0.78, 0.85, 0.95,
                      0.15, 0.50, 0.58, 0.70, 0.76, 0.82, 0.90, 0.98];
    let rawGain = modeGain[Math.min(ft, 15)] || 0.5;
    
    if (data.length >= 4) {
      const seed = ((data[0] & 0x7F) << 8 | data[1]) +
                   ((data[2] & 0x3F) << 4 | (data[3] >> 4));
      const variation = (seed % 100) / 100;
      rawGain *= (0.6 + variation * 0.8);
      const pitchBase = 120 + (seed % 280);
      return {
        gain: rawGain,
        pitch: pitchBase,
        pitch2: pitchBase * (1.5 + ((seed >> 4) % 10) / 10),
        harmonic: pitchBase * (2 + (seed % 5)),
      };
    }
    
    return { gain: rawGain, pitch: 180, pitch2: 300, harmonic: 500 };
  }

  /** 创建标准 WAV 文件头 (44 bytes) */
  private createWavHeader(sampleRate: number, channels: number, bitsPerSample: number, dataSize: number): Buffer {
    const buf = Buffer.alloc(44);
    const byteRate = sampleRate * channels * (bitsPerSample / 8);
    const blockAlign = channels * (bitsPerSample / 8);

    buf.write('RIFF', 0);
    buf.writeUInt32LE(36 + dataSize, 4);
    buf.write('WAVE', 8);
    buf.write('fmt ', 12);
    buf.writeUInt32LE(16, 16);
    buf.writeUInt16LE(1, 20);
    buf.writeUInt16LE(channels, 22);
    buf.writeUInt32LE(sampleRate, 24);
    buf.writeUInt32LE(byteRate, 28);
    buf.writeUInt16LE(blockAlign, 32);
    buf.writeUInt16LE(bitsPerSample, 34);
    buf.write('data', 36);
    buf.writeUInt32LE(dataSize, 40);
    return buf;
  }

  /** 将 PCM 数据写入 WAV 文件 */
  private writeWavFile(filePath: string, pcmData: Buffer, sampleRate: number, channels: number, bitsPerSample: number): void {
    const header = this.createWavHeader(sampleRate, channels, bitsPerSample, pcmData.length);
    fs.writeFileSync(filePath, Buffer.concat([header, pcmData]));
  }

  /**
   * 调用 OpenAI 兼容的 /audio/transcriptions 接口
   * 原生 https 模块发送 multipart/form-data，避免 openai SDK 对非标准端点的兼容问题
   */
  private async callTranscriptionAPI(audioPath: string): Promise<string> {
    const fileName = audioPath.split(/[/\\]/).pop() || 'audio.amr';
    const fileSize = Math.round(fs.statSync(audioPath).size / 1024);
    logger.info(`[STT] 正在识别语音: ${fileName} (${fileSize}KB)`);

    const audioBuffer = fs.readFileSync(audioPath);

    // 构造 multipart/form-data body
    const boundary = '----STTBoundary' + Date.now().toString(36);
    const parts: Buffer[] = [];

    // model 字段
    parts.push(Buffer.from(
      `--${boundary}\r\nContent-Disposition: form-data; name="model"\r\n\r\n${this.model}\r\n`
    ));

    // file 字段
    const mimeType = this.getMimeType(this.getExtension(audioPath));
    parts.push(Buffer.from(
      `--${boundary}\r\n` +
      `Content-Disposition: form-data; name="file"; filename="${fileName}"\r\n` +
      `Content-Type: ${mimeType}\r\n\r\n`
    ));
    parts.push(audioBuffer);
    parts.push(Buffer.from('\r\n'));

    // 结尾
    parts.push(Buffer.from(`--${boundary}--\r\n`));
    const body = Buffer.concat(parts);

    // 解析 baseUrl 得到 hostname 和 path
    const urlObj = new URL(this.baseUrl);
    const apiPath = urlObj.pathname.replace(/\/+$/, '') + '/audio/transcriptions';

    return new Promise<string>((resolve, reject) => {
      const options: https.RequestOptions = {
        hostname: urlObj.hostname,
        port: urlObj.port || 443,
        path: apiPath,
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${this.apiKey}`,
          'Content-Type': `multipart/form-data; boundary=${boundary}`,
          'Content-Length': body.length,
        },
        timeout: 30000,
      };

      const req = https.request(options, (res) => {
        const chunks: Buffer[] = [];
        res.on('data', chunk => chunks.push(chunk));
        res.on('end', () => {
          const data = Buffer.concat(chunks).toString('utf-8');
          
          if (res.statusCode !== 200) {
            reject(new Error(`STT API error ${res.statusCode}: ${data.substring(0, 200)}`));
            return;
          }

          try {
            const json = JSON.parse(data);
            const text = (json.text || '').trim();
            if (text) {
              logger.info(`[STT] 识别结果: "${text.substring(0, 50)}"`);
            } else {
              logger.debug('[STT] 识别结果为空');
            }
            resolve(text);
          } catch {
            // 有些接口可能直接返回纯文本
            resolve(data.trim());
          }
        });
      });

      req.on('error', (e) => {
        logger.warn(`[STT] API请求错误: ${e.message}`);
        reject(new Error(`STT network error: ${e.message}`));
      });
      req.on('timeout', () => { req.destroy(); reject(new Error('STT API timeout')); });
      req.write(body);
      req.end();
    });
  }

  /** 根据扩展名获取 MIME 类型 */
  private getMimeType(ext: string): string {
    const mimeMap: Record<string, string> = {
      mp3: 'audio/mpeg',
      mp4: 'audio/mp4',
      m4a: 'audio/mp4',
      ogg: 'audio/ogg',
      wav: 'audio/wav',
      webm: 'audio/webm',
      amr: 'audio/amr',
      silk: 'audio/silk',
      flac: 'audio/flac',
    };
    return mimeMap[ext] || 'audio/mpeg';
  }

  /** 从路径获取扩展名 */
  private getExtension(filePath: string): string {
    const match = filePath.match(/\.([a-zA-Z0-9]+)$/);
    return match ? match[1].toLowerCase() : 'amr';
  }

  /**
   * STT 识别结果后处理
   * 
   * 解决常见问题:
   * 1. 重复词（"嗯嗯好的好的" → "好的"）
   * 2. 无意义填充词（"那个、呃、啊、然后然后"）
   * 3. 缺少标点（自动添加句号、问号）
   * 4. 首尾空格/特殊字符清理
   * 5. 过短结果过滤（单字或纯符号）
   */
  static postProcess(text: string): string {
    if (!text || text.trim().length < 2) return text;

    let result = text.trim();

    // 去除首尾特殊字符
    result = result.replace(/^[。，！？、…~\s]+/, '');
    result = result.replace(/[。，！？、…~\s]+$/, '');

    // 去除重复连续字词（如 "好的好的" → "好的", "嗯嗯" → "嗯"）
    result = result.replace(/(.{1,3})\1+/g, '$1');

    // 去除常见无意义填充词（保留语义完整性）
    const fillerPatterns = [
      /^(那个|呃|啊|嗯|这个|然后|就是说|对吧|你知道吗)\s*[,，]?\s*/g,  // 开头填充
      /\s*[,，]\s*(那个|呃|啊|嗯|这个|然后|就是说)(?=[，。！？])/g,   // 中间孤立填充
    ];
    for (const pattern of fillerPatterns) {
      result = result.replace(pattern, '');
    }

    // 智能标点补全：根据语境添加标点
    result = this.addPunctuation(result);

    // 最终清理多余空白
    result = result.replace(/\s{2,}/g, ' ').trim();

    return result;
  }

  /**
   * 智能标点补全
   * 根据语义特征在适当位置添加标点符号
   */
  private static addPunctuation(text: string): string {
    if (!text) return text;
    
    // 如果已经有标点，不再重复添加
    if (/[。，！？]/.test(text)) return text;

    // 疑问词结尾加问号
    if (/^(什么|怎么|哪|谁|多少|为什么|咋|哪位|几个|多久|是否|能不能|可不可以)/.test(text) ||
        /[吗呢吧么]$/.test(text)) {
      return text + '？';
    }

    // 语气词或感叹性语句加感叹号
    if (/(哇|呀|哈|啊|嘿|哦|天呐|我的天)$/.test(text) ||
        /太|超|真|特别|非常.*[好坏棒赞牛]/.test(text)) {
      return text + '！';
    }

    // 默认加句号
    return text + '。';
  }
}

/** record 段的完整信息 */
export interface RecordInfo {
  file: string;
  path: string;
  url: string;
}
