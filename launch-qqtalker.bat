@echo off
setlocal
chcp 65001 >nul
title QQTalker Full Stack Launcher

set "ROOT=%~dp0"
set "STACK_PS1=%ROOT%start-voice-stack.ps1"

if not exist "%STACK_PS1%" (
    echo [ERROR] 找不到 start-voice-stack.ps1
    echo [INFO] 当前目录: %ROOT%
    pause
    exit /b 1
)

echo ========================================
echo        QQTalker Full Stack Launcher
echo ========================================
echo.
echo [INFO] 正在拉起 GPT-SoVITS、voice-service 和 QQTalker...
echo [INFO] 完成后控制台地址: http://127.0.0.1:3180
echo.

powershell -NoProfile -ExecutionPolicy Bypass -File "%STACK_PS1%"
set "EXIT_CODE=%ERRORLEVEL%"

if not "%EXIT_CODE%"=="0" (
    echo.
    echo [ERROR] 启动失败，退出码: %EXIT_CODE%
    pause
    exit /b %EXIT_CODE%
)

echo.
echo [INFO] 所有服务已触发启动。
echo [INFO] 如需停止 QQTalker，可运行 stop-qqtalker.ps1
pause
endlocal
