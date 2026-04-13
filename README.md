# Quick Dove

协助嵌入式固件编译下载的 VS Code 扩展工具。

## 功能特性

- **快速下载** - 状态栏点击下载图标一键烧录固件
- **快速编译** - 状态栏点击编译图标一键编译工程
- **侧边栏视图** - 查看固件列表、设备列表、配置信息
- **日志查看器** - 在 VS Code 中查看和分析日志文件
- **搜索工具** - 集成 Everything 搜索，快速定位文件
- **多语言支持** - 中文/英文界面，自动检测系统语言
- **AI Skill 集成** - 支持 AI Agent 自动化编译烧录流程

## 架构说明

| 层级 | 组件 | 职责 |
|------|------|------|
| UI 层 | Extension | VS Code 界面交互、状态栏、侧边栏视图 |
| 逻辑层 | dove.exe | 固件识别、设备管理、编译调度、烧录执行 |
| 执行层 | 平台工具 | 各芯片平台的实际烧录操作 |

**核心特性：**
- 自动识别固件类型并选择对应烧录工具
- 自动检测设备并切换下载模式
- 实时进度追踪（支持 JSON 格式输出）
- 统一的 CLI 接口，可独立使用
- 支持多平台（ASR、UNISOC、EIGEN、ESP 等）

> **注意**：`dove` 是独立的 CLI 工具子模块，详细文档见 [dove/README.md](dove/README.md)

## 支持的芯片平台

| 平台 | 芯片型号 | 固件类型 | 烧录工具 |
|------|----------|----------|----------|
| ASR | 160X | `*.zip` | adownload.exe |
| ASR | 1802/1803/1903 | `*_fbf.bin` | FBFDownloader.exe |
| UNISOC | 8310/8910/8850 | `*.pac` | ResearchDownload |
| Eigen | 618/718 | `*_download_usb.ini` | FlashtoolCLI |
| ESP | - | `*.bin` | esptool |

> **说明**：所有平台烧录操作均由 `dove.exe` 统一调度，自动选择对应工具

## 快速开始

### 插件安装

1. 打开 VS Code
2. 按 `Ctrl+Shift+X` 打开扩展视图
3. 从 VSIX 安装：拖动 `.vsix` 文件到扩展视图，或点击 `...` > 从 VSIX 安装...

![安装视图](images/install.png)

### 基本使用

#### 固件下载

1. 底部状态栏点击 **下载** 图标执行烧录
2. 侧边栏 **Quick Dove** 视图查看固件列表，点击文件触发下载
3. 可在设置中配置外部固件路径

![下载视图](images/download.png)

#### 工程编译

1. 底部状态栏点击 **编译** 图标执行编译
2. 支持多个编译命令，可在侧边栏设置中配置和选择

#### 设备管理

侧边栏 **设备列表** 视图显示已连接的 USB 设备，自动刷新。

![设备列表](images/devices.png)

#### 日志查看

1. 右键点击 `.txt` 或 `.log` 文件 > **Open Log Viewer**
2. 或在 **Extension Tools** 视图点击日志图标

#### 搜索工具

在 **Extension Tools** 视图点击搜索图标，快速搜索文件（需安装 Everything）。

#### C++ 宏定义

1. 编辑器中选中宏定义文本
2. 按 `Ctrl+D` 或右键菜单 > **Toggle C++ Define**
3. 快速切换宏定义值

## AI Skill 集成

插件提供两个 AI Skill，可在设置中导入到 AI Agent：

### dove-action（高风险操作）

用于烧录、编译、复位操作，**执行前必须确认**。

| 命令 | 说明 |
|------|------|
| `flash` | 烧录固件 |
| `build` | 编译工程 |
| `build-and-flash` | 编译并烧录 |
| `at -c "AT+CFUN=1,1"` | 设备复位 |

### dove-query（低风险操作）

用于查询和监控操作，**可直接执行无需确认**。

| 命令 | 说明 |
|------|------|
| `flash --list` | 列出可用固件 |
| `devices` | 列出 USB 设备 |
| `serial` | 列出串口 |
| `config` | 查看配置 |
| `monitor` | 监控串口 |
| `at` 查询类 | ATI、AT+CGMI 等查询命令 |

> 详细文档见 [dove/skill/dove-action/SKILL.md](dove/skill/dove-action/SKILL.md) 和 [dove/skill/dove-query/SKILL.md](dove/skill/dove-query/SKILL.md)

## 配置文件

在项目根目录创建 `dove.json`：

```json
{
  "firmwarePath": "C:\\path\\to\\firmware",
  "buildCommands": ["build_release.bat", "build_debug.bat"],
  "buildGitBashPath": "C:\\Program Files\\Git\\bin\\bash.exe",
  "defaultComPort": "COM9"
}
```

| 字段 | 说明 |
|------|------|
| `firmwarePath` | 固件目录路径，默认自动检测 |
| `buildCommands` | 编译命令列表，支持多个 |
| `buildGitBashPath` | Git Bash 路径（用于 `.sh` 脚本） |
| `defaultComPort` | 默认串口 |

## 联系方式

问题反馈：destin.zhang@quectel.com