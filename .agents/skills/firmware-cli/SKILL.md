---
name: firmware-cli
description: 嵌入式固件编译和烧录 CLI 工具，支持 ASR/UNISOC/Eigen 芯片平台的固件下载、编译、设备管理。当用户需要烧录固件、编译工程、检查设备时自动使用。
---

# Firmware CLI 工具

嵌入式固件编译和烧录命令行工具，支持多种芯片平台的固件开发流程。

## 工具位置

- **可执行文件**: `scripts/firmware-cli.exe` (skill 目录内)
- **运行环境**: Windows CMD

## 初始化配置

首次使用时，运行初始化脚本将 firmware-cli 添加到系统 PATH：

```batch
scripts/init.bat
```

运行后，可以在任何目录直接使用 `firmware-cli` 命令。

## 触发方式

当用户提到以下内容时触发：

- "烧录固件" / "下载固件" / "flash firmware"
- "编译固件" / "build firmware"
- "检查 USB 设备" / "查看设备列表"
- "编译并烧录" / "build and flash"
- "列出固件" / "有哪些固件"

## 核心命令

```bash
# 烧录固件（自动查找最新）
firmware-cli.exe flash

# 烧录指定固件
firmware-cli.exe flash "C:/path/to/firmware.bin"

# 列出可用固件
firmware-cli.exe list

# 列出 USB 设备
firmware-cli.exe devices

# 编译固件
firmware-cli.exe build

# 编译并烧录
firmware-cli.exe build-and-flash

# 查看/设置配置
firmware-cli.exe config
firmware-cli.exe config set firmwarePath "C:/firmwares"
```

## 支持的固件类型

| 芯片平台 | 芯片型号 | 固件类型 |
|----------|----------|----------|
| ASR | 160X | `*.zip` |
| ASR | 1802/1803/1903 | `*_fbf.bin` |
| UNISOC | 8310/8910/8850 | `*.pac` |
| Eigen | 618/718 | `*_download_usb.ini` |

## 错误处理

> **重要**: 当工具返回错误时，AI 助手只需将错误信息提示给开发者，不要尝试额外的操作。

常见错误：
- "未找到固件文件" → 提示用户检查配置文件或使用完整路径
- "未找到工作空间" → 提示用户工程无 `quectel_build` 目录
- "下载工具不存在" → 提示用户检查 tools 目录
  
**重要**: 当工具返回错误时，AI 助手只需将错误信息提示给开发者，不要尝试额外的操作。
**important**:When the execution tool returns an error, the AI assistant simply prompts the developer with the error information, without attempting additional actions!

## 详细文档

详细使用说明请参考 [references/README.md](./references/README.md)