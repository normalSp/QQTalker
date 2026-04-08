# PowerShell启动脚本 - 确保显示控制台窗口并启动日志分析器
# 使用说明：双击运行此脚本，或通过快捷方式调用此脚本

Write-Host "========================================" -ForegroundColor Cyan
Write-Host "      QQTalker 智能日志分析系统" -ForegroundColor Green
Write-Host "========================================" -ForegroundColor Cyan
Write-Host ""
Write-Host "🤖 正在启动 QQTalker 机器人..." -ForegroundColor Yellow
Write-Host "📊 日志分析器将在3秒后自动打开..." -ForegroundColor Yellow
Write-Host ""
Write-Host "📖 使用说明：" -ForegroundColor Cyan
Write-Host "   • 日志分析器将在浏览器中打开" -ForegroundColor Gray
Write-Host "   • 按 Ctrl+C 退出程序" -ForegroundColor Gray
Write-Host "   • 或关闭此窗口退出" -ForegroundColor Gray
Write-Host ""
Write-Host "========================================" -ForegroundColor Cyan
Write-Host ""

# 获取当前目录
$scriptPath = Split-Path -Parent $MyInvocation.MyCommand.Definition
$exePath = Join-Path $scriptPath "qq-talker.exe"
$htmlPath = Join-Path $scriptPath "log-analyzer.html"

# 检查exe文件是否存在
if (-Not (Test-Path $exePath)) {
    Write-Host "❌ 错误：找不到 qq-talker.exe 文件" -ForegroundColor Red
    Write-Host "   请确保此脚本与 qq-talker.exe 在同一目录下" -ForegroundColor Red
    Read-Host "按回车键退出..."
    exit 1
}

# 检查HTML文件是否存在
if (-Not (Test-Path $htmlPath)) {
    Write-Host "⚠️ 警告：找不到 log-analyzer.html 文件" -ForegroundColor Yellow
    Write-Host "   日志分析器可能无法自动打开" -ForegroundColor Yellow
    Write-Host ""
}

# 启动后台任务：3秒后打开日志分析器
$job = Start-Job -ScriptBlock {
    param($htmlFile)
    Start-Sleep -Seconds 3
    if (Test-Path $htmlFile) {
        Write-Host "✅ 正在打开日志分析器..." -ForegroundColor Green
        Start-Process $htmlFile
    }
} -ArgumentList $htmlPath

# 启动主程序
Write-Host "🚀 启动主程序..." -ForegroundColor Green
Write-Host ""
try {
    # 使用Start-Process启动exe，确保显示控制台
    # -NoNewWindow 参数确保在同一控制台窗口中运行
    # -Wait 参数等待程序退出
    Start-Process -FilePath $exePath -NoNewWindow -Wait
    
    Write-Host ""
    Write-Host "========================================" -ForegroundColor Cyan
    Write-Host "      QQTalker 已停止运行" -ForegroundColor Yellow
    Write-Host "========================================" -ForegroundColor Cyan
} catch {
    Write-Host "❌ 启动失败: $_" -ForegroundColor Red
    Read-Host "按回车键退出..."
    exit 1
} finally {
    # 清理后台任务
    if ($job) {
        Remove-Job -Job $job -Force
    }
}

Read-Host "按回车键关闭窗口..."