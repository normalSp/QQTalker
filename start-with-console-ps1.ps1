# PowerShell 启动脚本 - 解决UTF-8乱码问题
# 使用方法: 右键 -> 使用 PowerShell 运行

# 强制设置 UTF-8 编码
[Console]::OutputEncoding = [System.Text.Encoding]::UTF8
$OutputEncoding = [System.Text.Encoding]::UTF8

# 设置 PowerShell 编码
$PSDefaultParameterValues['*:Encoding'] = 'utf8'

# 设置环境变量
$env:NODE_OPTIONS = "--enable-source-maps"
$env:FORCE_UTF8_CONSOLE = "1"
$env:PYTHONIOENCODING = "utf-8"
$env:LC_ALL = "C.UTF-8"

# 设置窗口标题和颜色
$Host.UI.RawUI.WindowTitle = "QQTalker 智能日志分析系统"
$Host.UI.RawUI.ForegroundColor = "Green"
$Host.UI.RawUI.BackgroundColor = "Black"

# 清空屏幕
Clear-Host

Write-Host "========================================" -ForegroundColor Cyan
Write-Host "      QQTalker 智能日志分析系统" -ForegroundColor Cyan
Write-Host "========================================" -ForegroundColor Cyan
Write-Host ""
Write-Host "[INFO] 正在启动 QQTalker 机器人..." -ForegroundColor Green
Write-Host "[INFO] 日志分析器将在3秒后自动打开..." -ForegroundColor Green
Write-Host ""
Write-Host "[HELP] 使用说明：" -ForegroundColor Yellow
Write-Host "  • 日志分析器将在浏览器中打开" -ForegroundColor White
Write-Host "  • 按 Ctrl+C 退出程序" -ForegroundColor White
Write-Host "  • 或关闭此窗口退出" -ForegroundColor White
Write-Host ""
Write-Host "========================================" -ForegroundColor Cyan
Write-Host ""

# 延迟3秒后打开日志分析器
Start-Job -ScriptBlock {
    Start-Sleep -Seconds 3
    Start-Process "log-analyzer.html"
} | Out-Null

# 检查exe文件是否存在
if (-Not (Test-Path "qq-talker.exe")) {
    Write-Host "[ERROR] 找不到 qq-talker.exe 文件！" -ForegroundColor Red
    Write-Host "[ERROR] 请确保此脚本与 qq-talker.exe 在同一目录下" -ForegroundColor Red
    Pause
    exit 1
}

# 启动程序并捕获错误
Write-Host "[START] 启动主程序..." -ForegroundColor Green
Write-Host ""

try {
    & "./qq-talker.exe" 2>&1 | ForEach-Object {
        # 确保输出使用 UTF-8
        Write-Host $_
    }
    
    $exitCode = $LASTEXITCODE
    
    if ($exitCode -ne 0) {
        Write-Host ""
        Write-Host "[ERROR] 程序异常退出，错误码: $exitCode" -ForegroundColor Red
        Write-Host "[INFO] 请查看日志文件获取详细信息" -ForegroundColor Yellow
    }
} catch {
    Write-Host ""
    Write-Host "[ERROR] 程序执行出错: $_" -ForegroundColor Red
}

# 等待程序退出
Write-Host ""
Write-Host "========================================" -ForegroundColor Cyan
Write-Host "      QQTalker 已停止运行" -ForegroundColor Cyan
Write-Host "========================================" -ForegroundColor Cyan
Write-Host ""
Write-Host "[INFO] 按任意键退出..." -ForegroundColor Yellow

# 等待按键
$null = $Host.UI.RawUI.ReadKey("NoEcho,IncludeKeyDown")
