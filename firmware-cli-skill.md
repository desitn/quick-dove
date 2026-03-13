# Firmware CLI Tool - AI Skill Document

## 工具概述

**工具名称**: firmware-cli.exe  
**版本**: v1.0.0  
**描述**: 嵌入式固件编译和烧录命令行工具，支持多种芯片平台的固件开发流程。  
**工具位置**: `tools/firmware_cli/firmware-cli.exe` ，找不到firmware-cli.exe直接报错提示，不需额外操作；
**运行**：要求在 windows CMD 执行: firmware-cli.exe <cmd> <arg> 
**用途**: 帮助开发者和AI助手执行固件编译、烧录、设备管理等操作。
**注意1**: AI工具助手（你）执行固件编译、烧录、设备管理等操作，工具返回报错再次读SKILL然后可重试，如果失败再次同样问题，不要再进行额外操作!!
**注意2**: AI工具助手（你）不要去尝试和检查其他工作目录去尝试别的下载方法除非其他SKILL提供；

## 核心能力

此工具可以执行以下主要任务：

1. **固件烧录** - 将编译好的固件下载到目标设备
2. **固件列表** - 查找和列出可用的固件文件
3. **设备管理** - 列出连接的USB设备
4. **固件编译** - 执行固件构建流程
5. **配置管理** - 管理工具配置项

## 快速示例

用户输入可以转换为相应的命令：

1. **"帮我烧录最新的固件"**
   → `firmware-cli.exe flash`

2. **"列出所有可用的固件文件"**
   → `firmware-cli.exe list`

3. **"编译并烧录固件"**
   → `firmware-cli.exe build-and-flash`

4. **"烧录这个固件: C:/firmwares/test.bin"**
   → `firmware-cli.exe flash "C:/firmwares/test.bin"`

5. **"检查USB设备连接"**
   → `firmware-cli.exe devices`

6. **"显示当前配置"**
   → `firmware-cli.exe config`


## 可用命令

### 1. flash - 烧录固件

**功能**: 将固件下载到目标设备  
**语法**:
```bash
firmware-cli.exe flash [固件路径]
```

**参数**:
- `固件路径` (可选): 指定固件文件的完整路径。如果不提供，工具会自动查找最新的固件文件。

**智能查找策略**:
1. 检查配置文件 `firmware-cli.json` 中的 `firmwarePath`
2. 查找工作空间目录下的 `quectel_build/release` 子目录
3. 自动选择最新编译的固件

**使用示例**:
```bash
# 自动查找并烧录最新固件
firmware-cli.exe flash

# 烧录指定固件
firmware-cli.exe flash "C:/project/firmware/sample_fbf.bin"
```

**支持的固件类型**:
- ASR 160X: `*.zip` 文件
- ASR 180X/190X: `*_fbf.bin` 文件
- UNISOC 8310/8910/8850: `*.pac` 文件
- Eigen 618/718: `*_download_usb.ini` 文件
---

### 2. list - 列出可用固件

**功能**: 扫描并列出所有可用的固件文件  
**语法**:
```bash
firmware-cli.exe list
```

**输出信息**:
- 固件文件名
- 完整路径
- 固件类型
- 文件大小
- 修改时间
- 推荐烧录命令

**使用示例**:
```bash
firmware-cli.exe list
```

**输出示例**:
```
找到 2 个固件:
1. ASR1802_SG_test_fbf.bin
   路径: C:/project/quectel_build/release/ASR1802/ASR1802_SG_test_fbf.bin
   类型: ASR FBF
   大小: 12.5 MB
   时间: 2024/1/15 14:30:25

2. ASR1802_release_fbf.bin
   路径: C:/project/quectel_build/release/ASR1802/ASR1802_release_fbf.bin
   类型: ASR FBF
   大小: 11.8 MB
   时间: 2024/1/14 09:15:00

最新固件: ASR1802_SG_test_fbf.bin
烧录命令: firmware-cli.exe flash "C:/project/quectel_build/release/ASR1802/ASR1802_SG_test_fbf.bin"
```

---

### 3. devices - 列出USB设备

**功能**: 列出当前连接的USB设备（仅Windows）  
**语法**:
```bash
firmware-cli.exe devices
```

**用途**:
- 确认目标设备已正确连接
- 检查设备驱动是否安装
- 排查连接问题

**使用示例**:
```bash
firmware-cli.exe devices
```

**输出示例**:
```
找到 2 个设备:
1. Quectel EC200U (COM3)
2. USB Serial Port (COM4)
```

---

### 4. build - 编译固件

**功能**: 执行固件编译流程  
**语法**:
```bash
firmware-cli.exe build [构建命令]
```

**参数**:
- `构建命令` (可选): 指定构建脚本名称。如果不提供，工具会自动查找。

**智能查找策略**:
1. 检查配置文件 `.firmware-cli.json` 中的 `buildCommand`
2. 查找当前目录下的 `build*OPTfile.bat` 或 `build*OPTfile.sh` 文件

**使用示例**:
```bash
# 自动查找构建脚本
firmware-cli.exe build

# 指定构建脚本
firmware-cli.exe build "build_OPTfile.bat"

# 使用Git Bash执行Shell脚本（需要配置buildGitBashPath）
firmware-cli.exe build "build_OPTfile.sh"
```

**前置条件**:
- 必须在项目根目录下执行（包含 `quectel_build` 目录）
- 对于Shell脚本，需要配置Git Bash路径

---

### 5. build-and-flash - 编译并烧录

**功能**: 一次性执行编译和烧录操作  
**语法**:
```bash
firmware-cli.exe build-and-flash
```

**执行流程**:
1. 执行固件编译
2. 自动查找最新编译的固件
3. 执行固件烧录

**使用示例**:
```bash
firmware-cli.exe build-and-flash
```

---

### 6. config - 配置管理

**功能**: 查看和设置工具配置  
**语法**:
```bash
# 查看当前配置
firmware-cli.exe config

# 设置配置项
firmware-cli.exe config set <配置项名称> <配置值>
```

### 7. help - 帮助

**功能**: 查看工具使用方法
**语法**:
```bash
# 查看当前配置
firmware-cli.exe help
```

**支持的配置项**:

| 配置项 | 说明 | 示例 |
|--------|------|------|
| `firmwarePath` | 固件文件所在目录 | `C:/firmwares` |
| `buildCommand` | 构建命令或脚本名 | `build_OPTfile.bat` |
| `buildGitBashPath` | Git Bash可执行文件路径 | `C:/Program Files/Git/bin/bash.exe` |

**使用示例**:
```bash
# 查看当前配置
firmware-cli.exe config

# 设置固件路径
firmware-cli.exe config set firmwarePath "C:/project/firmwares"

# 设置构建命令
firmware-cli.exe config set buildCommand "build_OPTfile.bat"

# 设置Git Bash路径
firmware-cli.exe config set buildGitBashPath "C:/Program Files/Git/bin/bash.exe"
```

---

### 7. help - 帮助信息

**功能**: 显示工具使用帮助  
**语法**:
```bash
firmware-cli.exe help
```

---

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

**配置说明**:
- `firmwarePath`: 指定固件文件的默认搜索路径
- `buildCommand`: 指定默认的构建命令
- `buildGitBashPath`: 指定Git Bash的路径（用于执行Shell脚本）

---

## 典型使用场景

### 场景1: 快速烧录最新固件
```bash
# 列出可用固件
firmware-cli.exe list

# 烧录最新固件
firmware-cli.exe flash
```

### 场景2: 完整开发流程
```bash
# 1. 编译固件
firmware-cli.exe build

# 2. 检查USB设备连接
firmware-cli.exe devices

# 3. 烧录固件
firmware-cli.exe flash
```

### 场景3: 一键编译并烧录
```bash
firmware-cli.exe build-and-flash
```

### 场景4: 使用特定固件
```bash
firmware-cli.exe flash "C:/specific/path/custom_firmware.bin"
```

---

## 错误处理

工具会返回清晰的错误信息，常见错误包括：

| 错误信息 | 原因 | 解决方法 |
|----------|------|----------|
| "未找到固件文件" | 固件路径不存在或未配置 | 只需提示开发者：检查配置文件或使用完整路径 |
| "未找到工作空间" | 不在项目根目录下 | 只需提示开发者：工程无 `quectel_build` 的目录，请指定下载固件路径 |
| "下载工具不存在" | tools目录缺少下载工具 | 只需提示开发者：检查tools目录是否完整 |
| "未找到构建命令" | 未配置且未找到构建脚本 | 只需提示开发者：配置buildCommand或指定脚本路径 |

！注意：解决方法包含--"只需提示开发者"，意味着AI工具（当前的你）不需要再多做其他的操作，因为大多是是无意义的 提示开发者（用户）就行了！
---

## AI助手集成指南

AI助手可以通过以下方式使用此工具：

### 自然语言示例

用户输入可以转换为相应的命令：

1. **"帮我烧录最新的固件"**
   → `firmware-cli.exe flash`

2. **"列出所有可用的固件文件"**
   → `firmware-cli.exe list`

3. **"编译并烧录固件"**
   → `firmware-cli.exe build-and-flash`

4. **"烧录这个固件: C:/firmwares/test.bin"**
   → `firmware-cli.exe flash "C:/firmwares/test.bin"`

5. **"检查USB设备连接"**
   → `firmware-cli.exe devices`

6. **"显示当前配置"**
   → `firmware-cli.exe config`

