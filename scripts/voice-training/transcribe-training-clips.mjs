import fs from 'node:fs';
import path from 'node:path';
import https from 'node:https';
import dotenv from 'dotenv';
import { fileURLToPath } from 'node:url';

const SCRIPT_DIR = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(SCRIPT_DIR, '..', '..');
const TRAINING_ROOT = path.join(REPO_ROOT, 'data', 'voice-models', 'training');
const DEFAULT_CHARACTERS = ['dongxuelian', 'yongchutafi'];

dotenv.config({ path: path.join(REPO_ROOT, '.env') });

function parseArgs(argv) {
  const options = {
    characters: [],
    overwrite: false,
  };
  for (const raw of argv) {
    if (raw.startsWith('--character=')) {
      options.characters.push(raw.slice('--character='.length));
    } else if (raw === '--overwrite') {
      options.overwrite = true;
    }
  }
  return options;
}

function getConfig() {
  const apiKey = process.env.STT_API_KEY || process.env.AI_API_KEY || process.env.CODEBUDDY_API_KEY || '';
  const baseUrl = process.env.STT_BASE_URL || 'https://api.siliconflow.cn/v1';
  const model = process.env.STT_MODEL || 'FunAudioLLM/SenseVoiceSmall';
  const enabled = process.env.STT_ENABLED === 'true';
  if (!enabled) {
    throw new Error('STT is disabled in .env; set STT_ENABLED=true first.');
  }
  if (!apiKey) {
    throw new Error('Missing STT API key; set STT_API_KEY or AI_API_KEY in .env.');
  }
  return { apiKey, baseUrl, model };
}

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, 'utf8'));
}

function postProcess(text) {
  if (!text || text.trim().length < 2) return text || '';
  let result = text.trim();
  result = result.replace(/\p{Extended_Pictographic}/gu, '');
  result = result.replace(/[♪♫♬♩🎼]/gu, '');
  result = result.replace(/[“”]/g, '"');
  result = result.replace(/^[。，！？、…~\s]+/, '');
  result = result.replace(/[。，！？、…~\s]+$/, '');
  result = result.replace(/\s+/g, ' ');
  result = result.replace(/(.{1,3})\1+/g, '$1');
  result = result.replace(/^(那个|呃|啊|嗯|这个|然后|就是说|对吧|你知道吗)\s*[,，]?\s*/g, '');
  result = result.replace(/\s*[,，]\s*(那个|呃|啊|嗯|这个|然后|就是说)(?=[，。！？])/g, '');
  if (!/[。，！？]/.test(result)) {
    if (/^(什么|怎么|哪|谁|多少|为什么|咋|哪位|几个|多久|是否|能不能|可不可以)/.test(result) || /[吗呢吧么]$/.test(result)) {
      result += '？';
    } else if (/[啊呀哇啦]$/.test(result)) {
      result += '！';
    } else {
      result += '。';
    }
  }
  return result.replace(/\s{2,}/g, ' ').trim();
}

function detectMime(filePath) {
  const ext = path.extname(filePath).toLowerCase();
  if (ext === '.wav') return 'audio/wav';
  if (ext === '.mp3') return 'audio/mpeg';
  if (ext === '.m4a' || ext === '.mp4') return 'audio/mp4';
  if (ext === '.flac') return 'audio/flac';
  return 'application/octet-stream';
}

function callTranscriptionAPI(audioPath, cfg) {
  const fileName = path.basename(audioPath);
  const audioBuffer = fs.readFileSync(audioPath);
  const boundary = '----STTBoundary' + Date.now().toString(36);
  const parts = [];
  parts.push(Buffer.from(`--${boundary}\r\nContent-Disposition: form-data; name="model"\r\n\r\n${cfg.model}\r\n`));
  parts.push(Buffer.from(
    `--${boundary}\r\n` +
    `Content-Disposition: form-data; name="file"; filename="${fileName}"\r\n` +
    `Content-Type: ${detectMime(audioPath)}\r\n\r\n`
  ));
  parts.push(audioBuffer);
  parts.push(Buffer.from('\r\n'));
  parts.push(Buffer.from(`--${boundary}--\r\n`));
  const body = Buffer.concat(parts);
  const urlObj = new URL(cfg.baseUrl);
  const apiPath = urlObj.pathname.replace(/\/+$/, '') + '/audio/transcriptions';

  return new Promise((resolve, reject) => {
    const req = https.request({
      hostname: urlObj.hostname,
      port: urlObj.port || 443,
      path: apiPath,
      method: 'POST',
      headers: {
        Authorization: `Bearer ${cfg.apiKey}`,
        'Content-Type': `multipart/form-data; boundary=${boundary}`,
        'Content-Length': body.length,
      },
      timeout: 60000,
    }, (res) => {
      const chunks = [];
      res.on('data', (chunk) => chunks.push(chunk));
      res.on('end', () => {
        const raw = Buffer.concat(chunks).toString('utf8');
        if (res.statusCode !== 200) {
          reject(new Error(`STT API error ${res.statusCode}: ${raw.slice(0, 300)}`));
          return;
        }
        try {
          const parsed = JSON.parse(raw);
          resolve(String(parsed.text || '').trim());
        } catch {
          resolve(raw.trim());
        }
      });
    });
    req.on('error', reject);
    req.on('timeout', () => {
      req.destroy(new Error('STT API timeout'));
    });
    req.write(body);
    req.end();
  });
}

async function main() {
  const cfg = getConfig();
  const options = parseArgs(process.argv.slice(2));
  const characters = options.characters.length ? options.characters : DEFAULT_CHARACTERS;

  for (const character of characters) {
    const manifestPath = path.join(TRAINING_ROOT, character, 'manifests', 'segments.generated.json');
    const outputPath = path.join(TRAINING_ROOT, character, 'manifests', 'transcripts.generated.json');
    const manifest = readJson(manifestPath);
    const previous = fs.existsSync(outputPath) ? readJson(outputPath) : { segments: [] };
    const previousById = new Map((previous.segments || []).map((item) => [item.id, item]));
    const results = [];

    for (const segment of manifest.segments || []) {
      const prior = previousById.get(segment.id);
      if (prior && prior.transcriptClean && !options.overwrite) {
        results.push(prior);
        continue;
      }
      const transcriptRaw = await callTranscriptionAPI(segment.outputPath, cfg);
      const transcriptClean = postProcess(transcriptRaw);
      const next = {
        ...segment,
        transcript: transcriptClean,
        transcriptRaw,
        transcriptClean,
        transcriptionStatus: transcriptClean ? 'draft' : 'empty',
        transcribedAt: new Date().toISOString(),
      };
      results.push(next);
      console.log(`[transcribed] ${character}/${segment.id}: ${transcriptClean}`);
    }

    fs.writeFileSync(outputPath, JSON.stringify({
      character,
      generatedAt: new Date().toISOString(),
      model: cfg.model,
      segments: results,
    }, null, 2) + '\n', 'utf8');
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});
