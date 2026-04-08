/**
 * 共享 Logger 配置
 *
 * 解决 Windows PowerShell 终端中文乱码问题:
 * - pino 默认使用 'utf-8' 编码输出
 * - Windows 终端代码页通常是 GBK (936)
 * - 方案: 启动时强制切换控制台代码页为 UTF-8 (65001)
 *         使用 pino-pretty 作为流式处理器直接写入 stdout
 *         同时写入日志文件（UTF-8 编码）
 */
import pino, { type Logger } from 'pino';
import Pretty from 'pino-pretty';
import { createWriteStream, mkdirSync } from 'fs';
import { dirname, join } from 'path';
import { config } from './types/config';

// Windows 下强制切换控制台代码页为 UTF-8
// 对于 pkg 打包的 exe，需要额外处理
if (process.platform === 'win32') {
  try {
    // 方法1: 使用 execSync 执行 chcp
    const { execSync } = require('child_process');
    execSync('chcp 65001 > nul', { stdio: 'ignore' });
  } catch {
    // 忽略失败
  }
  
  // 方法2: 设置环境变量，影响子进程
  process.env.NODE_OPTIONS = (process.env.NODE_OPTIONS || '') + ' --enable-source-maps';
  
  // 方法3: 直接设置 Node.js 的 stdout/stderr 编码
  if (process.stdout && process.stdout.isTTY) {
    try {
      process.stdout.setDefaultEncoding('utf8');
    } catch (e) { /* ignore */ }
  }
  if (process.stderr && process.stderr.isTTY) {
    try {
      process.stderr.setDefaultEncoding('utf8');
    } catch (e) { /* ignore */ }
  }
}

// 日志文件路径
const logFilePath = join(__dirname, '..', '日志', '1.txt');

// 确保日志目录存在
try {
  mkdirSync(dirname(logFilePath), { recursive: true });
} catch {
  // 忽略，目录可能已存在
}

// 文件写入流（UTF-8）
const fileStream = createWriteStream(logFilePath, { encoding: 'utf8', flags: 'a' });

// pino multi-stream: 同时输出到控制台（pretty）和文件（JSON）
const prettyStream = Pretty({
  colorize: true,
  translateTime: 'SYS:yyyy-mm-dd HH:MM:ss',
  ignore: 'pid,hostname',
});

export const logger: Logger = pino(
  {
    level: config.logLevel,
  },
  pino.multistream([
    { level: config.logLevel, stream: prettyStream },   // 控制台：彩色 pretty 格式
    { level: config.logLevel, stream: fileStream },      // 文件：JSON 格式（UTF-8）
  ])
);

// 优雅关闭日志文件流
process.on('exit', () => {
  fileStream.end();
});
