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
- **Hermes Remote** - 通过右键菜单和快捷键将文件和选区作为 `@` 引用发送到 Hermes 终端（支持 SSH 远端）

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
| `port list --usb` | 列出 USB 设备 |
| `port list` | 列出串口 |
| `config` | 查看配置 |
| `port monitor` | 监控串口 |
| `port at` 查询类 | ATI、AT+CGMI 等查询命令 |

> 详细文档见 [dove/skill/dove-action/SKILL.md](dove/skill/dove-action/SKILL.md) 和 [dove/skill/dove-query/SKILL.md](dove/skill/dove-query/SKILL.md)

## Hermes Remote 集成

将编辑器和在终端中运行的 Hermes 风格 CLI 连接起来。通过右键菜单将文件和选区以 `@` 引用形式直接发送到 Hermes 终端——包括通过 SSH 连接到远端主机。专为"在**远端服务器**上运行 Hermes、在本地编辑代码"的开发者设计，本地→远端路径转换自动处理。

### 快速上手

1. **打开终端并启动 Hermes**：在 VS Code 集成终端中运行你的 Hermes CLI（例如 `hermes -p <用户名>`）。
2. **插件自动识别终端**：
   - **本地终端**：运行 `hermes` 命令后，插件检测到命令回显，自动识别（等 2-3 秒）。
   - **SSH 远端终端**：终端名含 `ssh` 即被自动识别（SSH 面板默认就是 `ssh: xxx`），聚焦哪个就发哪个。
3. **发送文件**：在资源管理器或编辑器标签页右键文件 → **添加到 Hermes**。
4. **发送选区**：选中代码后右键 → **发送选区到 Hermes**，或使用快捷键 `Ctrl+Shift+,`。
5. **回车确认**：引用会输入到 Hermes 终端的输入框（不按回车），检查无误后按回车发送给 Hermes。

### 命令

所有命令都可以通过命令面板（`Ctrl+Shift+P`）使用：

| 命令 | 说明 |
|------|------|
| **添加到 Hermes** | 发送文件作为 `@` 引用 |
| **发送选区到 Hermes** | 发送带行号的选中代码 |
| **添加工作区到 Hermes** | 将整个工作区根目录作为引用发送 |
| **设为 Hermes 终端** | 手动指定终端 |
| **选择 Hermes 终端** | 在多个 Hermes 终端之间选择 |

### 键盘快捷键

| 操作 | Windows/Linux | Mac |
|------|------|------|
| 添加当前文件到上下文 | `Ctrl+Shift+.` | `Cmd+Shift+.` |
| 发送选区到上下文 | `Ctrl+Shift+,` | `Cmd+Shift+,` |

### 发送格式

默认发送 **"前缀 + 工作区根 + @相对路径"** 两段式引用：

```
windows F:\vscode-extension\claude-vscode-context-plus  @README.md
windows F:\vscode-extension\claude-vscode-context-plus  @src\main.py:10-20
```

### 配置项

| 设置项 | 类型 | 默认值 | 说明 |
|---|---|---|---|
| `hermesRemote.terminalNamePatterns` | `string[]` | `[]` | 额外的终端名称匹配模式，匹配到的终端会被识别为 Hermes 终端 |
| `hermesRemote.remoteMappings` | `{ local, remote }[]` | `[]` | 将本地文件夹路径映射为远端路径，供 SSH 终端中运行的 Hermes 使用 |
| `hermesRemote.useAbsolutePaths` | `boolean` | `false` | 发送本地绝对路径（`@F:\proj\src\main.py`）而非相对路径 |
| `hermesRemote.workspaceRoot` | `string` | `""` | Hermes 视角下的工作区根路径，留空默认使用当前工作区 |
| `hermesRemote.pathStyle` | `"windows" \| "posix"` | `"windows"` | 发送给 Hermes 的路径分隔符风格 |
| `hermesRemote.pathPrefix` | `string` | `"windows"` | 引用前缀（主机标识），如 `windows` |

### SSH / 远端终端

Hermes 通过 SSH 运行在远端主机时，`@` 引用必须能被该主机上的 Hermes 解析，有三种方案：

- **方案 A（绝对路径）**：远端主机可以直接读取本地绝对路径时，设置 `hermesRemote.useAbsolutePaths: true`。
- **方案 B（路径映射）**：Hermes 相对于远端根目录解析路径时，配置 `hermesRemote.remoteMappings` 将本地文件夹映射到远端根目录。
- **方案 C（默认）**：发送 "前缀 + 工作区根 + @相对路径" 两段式引用，无需配置。

将 SSH 终端设为发送目标：终端名称包含 `hermes` 或 `ssh` 的终端会被自动识别（聚焦哪个就发哪个），也可在命令面板中执行 **"设为 Hermes 终端"** 手动锁定目标。

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