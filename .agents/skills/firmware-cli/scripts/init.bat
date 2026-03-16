@echo off
setlocal enabledelayedexpansion

echo ========================================
echo   Firmware CLI 工具 - 环境初始化
echo ========================================
echo.

REM 获取脚本所在目录
set SCRIPT_DIR=%~dp0

REM 检查 firmware-cli.exe 是否存在
if not exist "%SCRIPT_DIR%firmware-cli.exe" (
    echo [错误] 找不到 firmware-cli.exe
    echo 路径：%SCRIPT_DIR%firmware-cli.exe
    pause
    exit /b 1
)

echo [检查] firmware-cli.exe 存在：%SCRIPT_DIR%firmware-cli.exe
echo.

REM 检查是否已添加到 PATH
echo "%PATH%" | find /i "%SCRIPT_DIR%" >nul 2>nul
if %errorlevel% equ 0 (
    echo [提示] firmware-cli 已在当前会话的 PATH 中
) else (
    echo [提示] 当前会话 PATH 中未包含 firmware-cli
)

REM 读取当前用户 PATH
for /f "tokens=2*" %%a in ('reg query "HKCU\Environment" /v PATH 2^>nul') do set CURRPATH=%%b

REM 检查是否已在用户 PATH 中
echo "%CURRPATH%" | find /i "%SCRIPT_DIR%" >nul 2>nul
if %errorlevel% equ 0 (
    echo.
    echo [成功] firmware-cli 已添加到用户 PATH 环境变量
    echo 路径：%SCRIPT_DIR%
    echo.
    echo 现在可以在任何命令行窗口使用 firmware-cli 命令
    goto :SHOW_HELP
)

REM 添加到用户 PATH
echo.
echo [操作] 正在将 firmware-cli 添加到用户 PATH...
setx PATH "%CURRPATH%;%SCRIPT_DIR%" >nul 2>&1

if %errorlevel% equ 0 (
    echo [成功] 已将 %SCRIPT_DIR% 添加到用户 PATH
    echo.
    echo 注意：新环境变量将在新打开的命令行窗口中生效
    echo 当前窗口已临时添加 PATH，可直接使用
    REM 刷新当前会话的 PATH
    set "PATH=%SCRIPT_DIR%;%PATH%"
) else (
    echo [警告] setx 执行失败，可能需要管理员权限
    echo 请尝试手动将以下路径添加到系统 PATH:
    echo %SCRIPT_DIR%
)

:SHOW_HELP
echo.
echo ========================================
echo   firmware-cli 使用帮助
echo ========================================
echo.
echo 可用命令:
echo   firmware-cli flash            - 烧录固件 (自动查找)
echo   firmware-cli flash ^<path^>    - 烧录指定固件
echo   firmware-cli list             - 列出可用固件
echo   firmware-cli devices          - 列出 USB 设备
echo   firmware-cli build            - 编译固件
echo   firmware-cli build-and-flash  - 编译并烧录
echo   firmware-cli config           - 查看配置
echo   firmware-cli help             - 显示帮助
echo.
echo 示例:
echo   firmware-cli flash
echo   firmware-cli flash "C:\firmware\test.zip"
echo.
echo ========================================

pause