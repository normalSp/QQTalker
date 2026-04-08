/**
 * FFmpeg Installer for QQTalker STT - 使用镜像加速
 * Usage: node install-ffmpeg.js
 */
const https = require('https');
const fs = require('fs');
const path = require('path');
const { execFileSync, spawnSync } = require('child_process');

const toolsDir = path.join(__dirname, 'tools');
const ffmpegExe = path.join(toolsDir, 'ffmpeg.exe');
const tempZip = path.join(process.env.USERPROFILE || __dirname, `.qqtalker-ffmpeg-${Date.now()}.zip`);

console.log('=== QQTalker FFmpeg Installer ===\n');
fs.mkdirSync(toolsDir, { recursive: true });

// Check if already installed
if (fs.existsSync(ffmpegExe)) {
  try {
    const ver = execFileSync(ffmpegExe, ['-version'], { timeout: 5000 });
    console.log(`[OK] Found: ${ffmpegExe}`);
    console.log(ver.toString().split('\n')[0]);
    process.exit(0);
  } catch {}
}
try { execFileSync('where', ['ffmpeg'], { timeout: 3000 }); console.log('[OK] FFmpeg in system PATH'); process.exit(0); }
catch {}

// Try multiple download sources
const sources = [
  { name: 'ghproxy (GitHub mirror)', url: 'https://mirror.ghproxy.com/https://github.com/BtbN/FFmpeg-Builds/releases/download/latest/ffmpeg-master-latest-win64-gpl.zip' },
  { name: 'ghfast (GitHub CDN)', url: 'https://ghfast.top/https://github.com/BtbN/FFmpeg-Builds/releases/download/latest/ffmpeg-master-latest-win64-gpl.zip' },
  { name: 'gyan.dev', url: 'https://www.gyan.dev/ffmpeg/builds/ffmpeg-release-essentials.zip' },
];

function download(url, dest) {
  return new Promise((resolve, reject) => {
    const file = fs.createWriteStream(dest);
    const req = https.get(url, { 
      headers: { 'User-Agent': 'node' },
      timeout: 60000,
    }, (response) => {
      if (response.statusCode >= 300 && response.statusCode < 400 && response.headers.location) {
        // Follow redirect
        const redirUrl = new URL(response.headers.location, url).toString();
        download(redirUrl, dest).then(resolve).catch(reject);
        return;
      }
      if (response.statusCode !== 200) {
        reject(new Error(`HTTP ${response.statusCode}`));
        return;
      }
      const total = parseInt(response.headers['content-length'] || '0', 10);
      let downloaded = 0;
      const startTime = Date.now();
      
      response.on('data', (chunk) => {
        downloaded += chunk.length;
        if (total > 0 && downloaded % (1024 * 512) === 0) {
          const pct = Math.round(downloaded / total * 100);
          const speed = Math.round(downloaded / 1024 / ((Date.now() - startTime) / 1000));
          process.stdout.write(`\r  Downloading... ${Math.round(downloaded / 1024 / 1024)}MB / ${Math.round(total / 1024 / 1024)}MB (${pct}%) [${speed}KB/s]`);
        }
      });
      
      response.pipe(file);
      file.on('finish', () => {
        file.close();
        const duration = ((Date.now() - startTime) / 1000).toFixed(1);
        console.log(`\n  Done! (${Math.round(downloaded / 1024 / 1024)}MB in ${duration}s)`);
        resolve();
      });
      
      response.on('error', (err) => {
        file.destroy();
        reject(err);
      });
    });
    
    req.on('timeout', () => { req.destroy(); reject(new Error('Timeout')); });
    req.on('error', reject);
  });
}

async function tryDownload() {
  for (let i = 0; i < sources.length; i++) {
    const src = sources[i];
    console.log(`[${i + 1}/${sources.length}] Trying ${src.name}...`);
    console.log(`  URL: ${src.url.substring(0, 80)}...`);
    try {
      await download(src.url, tempZip);
      return true;
    } catch (err) {
      console.log(`  Failed: ${String(err).substring(0, 80)}`);
      try { if (fs.existsSync(tempZip)) fs.unlinkSync(tempZip); } catch {}
    }
  }
  return false;
}

function findFFmpegInExtractedDir(dirPath) {
  const binFfmpeg = path.join(dirPath, 'bin', 'ffmpeg.exe');
  if (fs.existsSync(binFfmpeg)) return binFfmpeg;
  // Some builds have different structure
  const direct = path.join(dirPath, 'ffmpeg.exe');
  if (fs.existsSync(direct)) return direct;
  return null;
}

async function main() {
  // Step 1: Download
  const ok = await tryDownload();
  if (!ok) {
    console.log('\n[ERROR] All download sources failed.');
    manualInstructions();
    process.exit(1);
  }

  // Step 2: Extract
  console.log('  Extracting archive...');
  try {
    execFileSync('powershell', [
      '-NoProfile', '-Command',
      `Expand-Archive -Path '${tempZip.replace(/'/g, "''")}' -DestinationPath '${toolsDir}' -Force`
    ], { timeout: 120000, stdio: ['pipe', 'pipe', 'pipe'] });
  } catch (e) {
    console.log(`  Extract error: ${String(e).substring(0, 100)}`);
    // Fallback: use tar or other method
    try {
      // Try using node to extract with built-in methods (limited)
      console.log('  Trying alternative extraction...');
      // PowerShell should work on most Windows systems
    } catch {}
  }

  // Step 3: Find and copy ffmpeg.exe
  let found = false;
  
  // Search recursively
  function searchForFFmpeg(currentDir, depth = 0) {
    if (depth > 3) return null;
    try {
      const entries = fs.readdirSync(currentDir, { withFileTypes: true });
      for (const entry of entries) {
        if (entry.name.toLowerCase() === 'ffmpeg.exe') {
          return path.join(currentDir, entry.name);
        }
        if (entry.isDirectory()) {
          const result = searchForFFmpeg(path.join(currentDir, entry.name), depth + 1);
          if (result) return result;
        }
      }
    } catch {}
    return null;
  }

  const foundPath = searchForFFmpeg(toolsDir);
  if (foundPath && foundPath !== ffmpegExe) {
    fs.copyFileSync(foundPath, ffmpegExe);
    
    // Copy ffprobe too
    const probePath = foundPath.replace(/ffmpeg\.exe$/i, 'ffprobe.exe');
    if (fs.existsSync(probePath)) {
      fs.copyFileSync(probePath, path.join(toolsDir, 'ffprobe.exe'));
    }
    
    // Clean up extracted directory (keep only ffmpeg.exe)
    const parentDir = path.dirname(foundPath);
    if (parentDir !== toolsDir) {
      try {
        // Walk up to find the root extracted dir
        let cleanDir = parentDir;
        while (cleanDir !== toolsDir && path.dirname(cleanDir) !== toolsDir) {
          cleanDir = path.dirname(cleanDir);
        }
        if (cleanDir !== toolsDir && cleanDir !== path.dirname(ffmpegExe)) {
          fs.rmSync(cleanDir, { recursive: true, force: true });
        }
      } catch {}
    }
    found = true;
  }

  // Cleanup zip
  try { fs.unlinkSync(tempZip); } catch {}

  if (found && fs.existsSync(ffmpegExe)) {
    const stat = fs.statSync(ffmpegExe);
    try {
      const ver = execFileSync(ffmpegExe, ['-version'], { timeout: 5000 });
      console.log(`\n[SUCCESS] FFmpeg installed!`);
      console.log(`  Path: ${ffmpegExe}`);
      console.log(`  Size: ${Math.round(stat.size / 1024 / 1024)}MB`);
      console.log(`  ${ver.toString().split('\n')[0]}`);
    } catch {
      console.log(`\n[OK] File exists but could not verify (${stat.size} bytes)`);
    }
  } else {
    console.log('\n[FAIL] Could not find ffmpeg.exe after extraction.');
    
    // List what we got
    console.log('\nContents of tools/:');
    try {
      const items = fs.readdirSync(toolsDir);
      items.forEach(item => console.log(`  ${item}`));
    } catch {}
    
    manualInstructions();
    process.exit(1);
  }
}

function manualInstructions() {
  console.log('\n--- Manual Install Steps ---');
  console.log('Option A (recommended):');
  console.log('  1. Open: https://www.gyan.dev/ffmpeg/builds/');
  console.log('  2. Download: ffmpeg-release-essentials.zip (~80MB)');
  console.log('  3. Extract & copy bin\\ffmpeg.exe -> project\\tools\\ffmpeg.exe');
  console.log('');
  console.log('Option B (system-wide, needs admin):');
  console.log('  winget install Gyan.FFmpeg');
  console.log('  OR: choco install ffmpeg -y');
  console.log('');
  console.log('Without FFmpeg, STT uses built-in AMR converter (limited quality)');
}

main().catch(err => {
  const msg = (err && err.message) ? err.message : String(err);
  console.error(`Fatal: ${msg}`);
  process.exit(1);
});
