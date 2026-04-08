@echo off
:: QQTalker 启动器 - 自动处理 UTF-8 编码问题
:: 使用方法: 直接双击运行此脚本

setlocal EnableDelayedExpansion

:: 强制设置 UTF-8 编码
chcp 65001 >nul

:: 设置环境变量确保 UTF-8 支持
set NODE_OPTIONS=--enable-source-maps
set FORCE_UTF8_CONSOLE=1
set PYTHONIOENCODING=utf-8

:: 检测是否存在 qq-talker.exe
if exist "qq-talker.exe" (
    set EXE_PATH=qq-talker.exe
) else if exist "dist-pkg\qq-talker.exe" (
    set EXE_PATH=dist-pkg\qq-talker.exe
) else if exist "..\qq-talker.exe" (
    set EXE_PATH=..\qq-talker.exe
) else (
    echo [ERROR] 找不到 qq-talker.exe 文件！
    echo.
    echo [INFO] 请确保：
    echo   1. 已经执行 npm run build:exe 编译了可执行文件
    echo   2. 或者使用 node src/index.ts 直接运行
    echo.
    pause
    exit /b 1
)

:: 设置窗口
title QQTalker 智能日志分析系统
color 0a

:: 显示启动信息
echo ========================================
echo       QQTalker 智能日志分析系统
echo ========================================
echo.
echo [编码设置] UTF-8 模式已激活
echo [启动路径] !EXE_PATH!
echo.

:: 启动控制台（延迟3秒）
echo [控制台] 3秒后自动启动...
start /min cmd /c "timeout /t 3 >nul && start http://localhost:3180"

:: 启动主程序
echo [主程序] 正在启动 QQTalker...
echo.
echo ========================================
echo.

"!EXE_PATH!" 2>&1

:: 检查退出码
set EXIT_CODE=!errorlevel!

if !EXIT_CODE! neq 0 (
    echo.
    echo ========================================
    echo [WARNING] 程序退出，错误码: !EXIT_CODE!
    echo ========================================
    echo.
    echo 可能的原因：
    echo   • 配置文件 config.yaml 有误
    echo   • OneBot 服务未连接
    echo   • 端口被占用
    echo   • 网络连接问题
    echo.
    echo 请查看日志文件获取详细信息
    echo 日志位置: 日志\app-*.txt
    echo.
) else (
    echo.
    echo ========================================
    echo [INFO] QQTalker 已正常停止
    echo ========================================
    echo.
)

echo 按任意键退出...
pause >nul
endlocal
