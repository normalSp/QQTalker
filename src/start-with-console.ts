import { exec } from 'child_process';
import { platform } from 'os';
import * as readline from 'readline';

/**
 * Dashboard 控制台管理器
 * 自动在浏览器中打开 Dashboard 控制台
 */
class LogAnalyzerManager {
  private static instance: LogAnalyzerManager;
  
  static getInstance(): LogAnalyzerManager {
    if (!LogAnalyzerManager.instance) {
      LogAnalyzerManager.instance = new LogAnalyzerManager();
    }
    return LogAnalyzerManager.instance;
  }

  /**
   * 打开 Dashboard 控制台
   */
  async startLogAnalyzer() {
    console.log('正在启动 Dashboard 控制台...');

    try {
      const url = 'http://localhost:3180/';

      // 根据平台选择打开方式
      if (platform() === 'win32') {
        // Windows: 使用start命令在新窗口中打开
        exec(`start "" "${url}"`);
      } else if (platform() === 'darwin') {
        // macOS: 使用open命令
        exec(`open "${url}"`);
      } else {
        // Linux: 使用xdg-open
        exec(`xdg-open "${url}"`);
      }

      console.log('Dashboard 控制台已启动: ' + url);
    } catch (error) {
      console.warn('启动 Dashboard 控制台失败:', error instanceof Error ? error.message : String(error));
      console.log('提示：请手动访问 http://localhost:3180/');
    }
  }
}

/**
 * 检查当前是否在Node.js环境中运行
 */
function isRunningInNode() {
  return typeof process !== 'undefined' && 
         process.versions != null && 
         process.versions.node != null;
}

/**
 * 启动时显示控制台并打开日志分析器
 */
export function setupConsoleAndAnalyzer() {
  // 只在Windows上且是exe运行时执行
  if (platform() === 'win32' && !process.env['PKG_INVOKED']) {
    console.log('========================================');
    console.log('       QQTalker Dashboard Console');
    console.log('========================================');
    console.log('');
    console.log('QQTalker 机器人正在运行...');
    console.log('Dashboard 控制台: http://localhost:3180/');
    console.log('');
    console.log('使用说明：');
    console.log('   浏览器访问 Dashboard 控制台查看状态');
    console.log('   按 Ctrl+C 退出程序');
    console.log('');
    console.log('========================================');
    console.log('');
  }
  
  // 延迟启动日志分析器，确保日志文件已生成
  setTimeout(() => {
    LogAnalyzerManager.getInstance().startLogAnalyzer().catch(console.error);
  }, 3000);
}

// 创建全局快捷键监听
export function setupGlobalShortcuts() {
  if (!isRunningInNode()) return;
  
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout
  });
  
  console.log('');
  console.log('可用命令：');
  console.log('   l 或 dashboard - 打开 Dashboard 控制台');
  console.log('   c 或 clear     - 清空控制台');
  console.log('   q 或 quit      - 退出程序');
  console.log('');
  
  rl.on('line', (input) => {
    const command = input.trim().toLowerCase();
    
    switch (command) {
      case 'l':
      case 'dashboard':
        LogAnalyzerManager.getInstance().startLogAnalyzer();
        break;
      case 'c':
      case 'clear':
        console.clear();
        console.log('========================================');
        console.log('      QQTalker 智能日志分析系统');
        console.log('========================================');
        break;
      case 'q':
      case 'quit':
      case 'exit':
        console.log('👋 正在退出...');
        process.exit(0);
        break;
      default:
        if (command) {
          console.log(`❓ 未知命令: ${command}`);
          console.log('🔧 可用命令: l/c/q');
        }
    }
  });
}