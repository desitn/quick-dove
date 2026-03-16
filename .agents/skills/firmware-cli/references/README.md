# Firmware CLI 工具 - 详细参考文档

## 工具概述

**工具名称**: firmware-cli.exe  
**版本**: v1.0.0  
**描述**: 嵌入式固件编译和烧录命令行工具，支持多种芯片平台的固件开发流程。  
**工具位置**: `scripts/firmware-cli.exe` (skill 目录内)  
**运行环境**: Windows CMD

## 初始化配置

首次使用时，运行初始化脚本将 firmware-cli 添加到系统 PATH：

```batch
scripts/init.bat
```

运行后，可以在任何目录直接使用 `firmware-cli` 命令。

## 核心能力

1. **固件烧录** - 将编译好的固件下载到目标设备
2. **固件列表** - 查找和列出可用的固件文件
3. **设备管理** - 列出连接的 USB 设备
4. **固件编译** - 执行固件构建流程
5. **配置管理** - 管理工具配置项

## 快速示例

| 用户需求 | 命令 |
|----------|------|
| "帮我烧录最新的固件" | `firmware-cli.exe flash` |
| "列出所有可用的固件文件" | `firmware-cli.exe list` |
| "编译并烧录固件" | `firmware-cli.exe build-and-flash` |
| "烧录这个固件：C:/firmwares/test.bin" | `firmware-cli.exe flash "C:/firmwares/test.bin"` |
| "检查 USB 设备连接" | `firmware-cli.exe devices` |
| "显示当前配置" | `firmware-cli.exe config` |

## 可用命令详解

### 1. flash - 烧录固件

**语法**: `firmware-cli.exe flash [固件路径]`

**参数**: 固件路径（可选），不提供则自动查找最新固件

**智能查找策略**:
1. 检查配置文件 `firmware-cli.json` 中的 `firmwarePath`
2. 查找工作空间目录下的 `quectel_build/release` 子目录
3. 自动选择最新编译的固件

**支持的固件类型**:
- ASR 160X: `*.zip` 文件
- ASR 180X/190X: `*_fbf.bin` 文件
- UNISOC 8310/8910/8850: `*.pac` 文件
- Eigen 618/718: `*_download_usb.ini` 文件

---

### 2. list - 列出可用固件

**语法**: `firmware-cli.exe list`

**输出信息**: 固件文件名、完整路径、固件类型、文件大小、修改时间、推荐烧录命令

---

### 3. devices - 列出 USB 设备

**语法**: `firmware-cli.exe devices`

**用途**: 确认目标设备已正确连接、检查设备驱动是否安装、排查连接问题

---

### 4. build - 编译固件

**语法**: `firmware-cli.exe build [构建命令]`

**智能查找策略**:
1. 检查配置文件 `.firmware-cli.json` 中的 `buildCommand`
2. 查找当前目录下的 `build*OPTfile.bat` 或 `build*OPTfile.sh` 文件

**前置条件**: 必须在项目根目录下执行（包含 `quectel_build` 目录）

---

### 5. build-and-flash - 编译并烧录

**语法**: `firmware-cli.exe build-and-flash`

**执行流程**: 执行固件编译 → 自动查找最新固件 → 执行固件烧录

---

### 6. config - 配置管理

**语法**: 
```bash
firmware-cli.exe config
firmware-cli.exe config set <配置项名称> <配置值>
```

**支持的配置项**:

| 配置项 | 说明 | 示例 |
|--------|------|------|
| `firmwarePath` | 固件文件所在目录 | `C:/firmwares` |
| `buildCommand` | 构建命令或脚本名 | `build_OPTfile.bat` |
| `buildGitBashPath` | Git Bash 可执行文件路径 | `C:/Program Files/Git/bin/bash.exe` |

---

### 7. help - 帮助信息

**语法**: `firmware-cli.exe help`

## 配置文件

工具使用 `.firmware-cli.json` 配置文件（位于项目根目录）。

**配置文件示例**:
```json
{
  "firmwarePath": "C:/project/quectel_build/release",
  "buildCommand": "build_OPTfile.bat",
  "buildGitBashPath": "C:/Program Files/Git/bin/bash.exe"
}
```

## 典型使用场景

### 场景 1: 快速烧录最新固件
```bash
firmware-cli.exe flash
```

### 场景 2: 完整开发流程
```bash
firmware-cli.exe build
firmware-cli.exe devices
firmware-cli.exe flash
```

### 场景 3: 一键编译并烧录
```bash
firmware-cli.exe build-and-flash
```

### 场景 4: 使用特定固件
```bash
firmware-cli.exe flash "C:/specific/path/custom_firmware.bin"
```

## 错误处理

> **重要**: 当工具返回错误时，AI 助手只需将错误信息提示给开发者，不要尝试额外的操作。
> **important**：When the execution tool returns an error, the AI assistant simply prompts the developer with the error information, without attempting additional actions!

| 错误信息 | 原因 | AI 处理方式 |
|----------|------|-------------|
| "未找到固件文件" | 固件路径不存在或未配置 | 提示开发者检查配置文件或使用完整路径 |
| "未找到工作空间" | 不在项目根目录下 | 提示开发者工程无 `quectel_build` 目录 |
| "下载工具不存在" | tools 目录缺少下载工具 | 提示开发者检查 tools 目录是否完整 |
| "未找到构建命令" | 未配置且未找到构建脚本 | 提示开发者配置 buildCommand 或指定脚本路径 |

## 最佳实践

1. **优先使用自动查找** - 默认执行 `flash` 不带参数
2. **错误直接反馈** - 工具报错后直接反馈给用户，不要重复尝试
3. **检查设备连接** - 烧录前可先执行 `devices` 确认设备连接
4. **配置优先** - 建议用户配置 `.firmware-cli.json` 简化操作


**重要**: 当执行工具返回错误时，AI 助手只需将错误信息提示给开发者，不要再尝试额外的操作！。
**important**:When the execution tool returns an error, the AI assistant simply prompts the developer with the error information, without attempting additional actions!