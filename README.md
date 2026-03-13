# Quick Firmware +


⚡协助固件编译和下载的插件⚡


## 功能特性

- ⚡ **功能一** - 适配多个RTOS平台项目的工作空间编译的快速下载；
- ⚡ **功能二** - 底部状态栏 `下载`图标点击快速下载 `构建`图标点击快速编译工程；
- ⚡ **功能三** - 支持容器视图查看当前空间固件列表、设备列表和可配置信息；

> 💡 **注意**：串口调试功能已独立为单独的插件，可通过组合包方式使用



目前支持芯片平台(RTOS):

- 🧩`ASR`     160X | 1802S | 1803S | 1903S 

- 🧩`UNISOC`  8310 | 8910 | 8850*

- 🧩`EIGEN`   618* | 718*

不同平台镜像文件类型差异见下表：

| 🧩平台     |   🟧芯片型号    |  🟦镜像类型 |  🟩底层工具 | 
|------------|-----------------|-------------|-------------|
|  ASR       | 160X            | `*.zip`     | aboot       | 
|  ASR       | 1803 1903 1802  | `._fbf.bin` | FBF         | 
| UNISOC     | 8310 8910 8850  | `*.pac`     | Research    | 
| Eigen      | 618 718         | `*.binpkg`  | FlashtoolCLI| 

（🧩*表示未作充分验证，插件适配OS环境WIN 语言中文 如有需要可以适配更多平台）


## 快速开始

### 插件安装

1. 打开 VS Code；
   
2. 按 `Ctrl+Shift+X` (Windows) 打开`扩展`视图；
   
3. 拖动此插件文件拖到`扩展`视图中或点击`扩展`右侧`...`更多菜单 > 从VSIX安装... ：选择安装此插件；
   

![安装视图](images/install.png)



### 基本使用

#### 一、协助下载

1. VS Code 底部状态栏右侧点击`下载`执行生成固件进行下载;

    ![下载视图1](images/re-download.png)

    tips：默认自动选择工作空间下`quetecl_build\release`目录下的固件，也可在侧边栏容器视图手动指定外部查找路径下的固件;
    若不能自动AT触发模组进下载模式的，请外部手动进入下载模式；外部指定路径可手动再次清除回复默认路径；
    

2. `[Quick Firmware +]`容器视图查看固件镜像文件/文件夹，外部查找手动指定固件目录；
   
   视图中选择固件文件点击触发下载任务；视图中选择固件文件夹点击复制文件夹路径；
   
   ![下载视图2](images/download.png)
   
   tips：下载日志查看，在VSCODE `输出` 窗口选择过滤`[Quick Firmware +]`即可查看底层工具实时运行日志；

#### 二、侧边栏视图

1. VS Code 侧边栏中点击`Quick Firmware +`闪电图标，即可进入容器视图；

2. 可查看固件列表信息、设备列表信息已经打开的COM调试工具和插件可配置项信息；
   
#### 三、设备管理

1. VS Code `[Quick Firmware +]`容器视图 设备列表可查看当前连接的USB设备；

2. 设备列表会自动刷新显示已连接的硬件设备；

   ![设备列表](images/devices.png)

#### 四、协助编译

1. VS Code 底部状态栏右侧点击`编译`执行工作空间的 build*OPTfile.bat文件进行编译；

2. build*.sh git bash 脚本编译文件需要手动配置bash安装路径，详见配置项：Quick Firmware Plus: Build Git Bash Path；


## 🤖 AI工具集成

本插件提供了专门的CLI工具，支持AI助手（如CLINE）直接调用，实现自动化的固件编译和烧录。

### CLI工具功能

- ✅ **自动查找固件** - 智能查找工作空间和配置文件中的固件
- ✅ **多种烧录方式** - 支持自动查找、手动指定、配置文件
- ✅ **固件编译** - 自动查找并执行构建脚本
- ✅ **设备管理** - 列出已连接的USB设备
- ✅ **AI集成** - CLINE等AI工具可通过自然语言直接调用

### 快速开始

#### 方式1: 使用独立exe文件（推荐）

无需安装Node.js，直接使用 `tools/firmware_cli/firmware-cli.exe`：

```bash
# 查看帮助
tools/firmware_cli/firmware-cli.exe help

# 列出可用固件
tools/firmware_cli/firmware-cli.exe list

# 烧录固件（自动查找）
tools/firmware_cli/firmware-cli.exe flash

# 烧录指定固件
tools/firmware_cli/firmware-cli.exe flash "C:/path/to/firmware.bin"

# 编译固件
tools/firmware_cli/firmware-cli.exe build

# 编译并烧录
tools/firmware_cli/firmware-cli.exe build-and-flash

# 列出USB设备
tools/firmware_cli/firmware-cli.exe devices
```

**提示**: 也可以将 `tools/firmware_cli/` 目录添加到系统PATH中，然后直接使用 `firmware-cli.exe` 命令。

#### 方式2: 使用Node.js

需要先安装依赖：

```bash
cd cli
npm install
```

然后使用Node.js运行：

```bash
# 查看帮助
node cli/index.js help

# 列出可用固件
node cli/index.js list

# 烧录固件（自动查找）
node cli/index.js flash

# 烧录指定固件
node cli/index.js flash "C:/path/to/firmware.bin"

# 编译固件
node cli/index.js build

# 编译并烧录
node cli/index.js build-and-flash

# 列出USB设备
node cli/index.js devices
```

### CLINE集成示例

CLINE等AI工具可以直接通过自然语言调用此CLI工具：

**示例1：自动烧录**
```
用户: 帮我烧录最新的固件
CLINE: 正在查找固件... [执行list命令] 找到最新固件... 开始烧录... [执行flash命令] 烧录完成！
```

**示例2：编译+烧录**
```
用户: 编译然后烧录固件
CLINE: 先编译... [执行build命令] 编译完成！再烧录... [执行flash命令] 全部完成！
```

**示例3：指定固件**
```
用户: 烧录这个固件 C:/project/firmware/my_firmware.bin
CLINE: 好的，开始烧录指定固件... [执行flash命令] 烧录完成！
```

### 配置文件

在项目根目录创建 `.firmware-cli.json` 文件：

```json
{
  "firmwarePath": "C:/project/quectel_build/release/EC200ACN_DA",
  "buildCommand": "build.bat new EC200ACN_DA EC200ACNDAR01A01M16",
  "buildGitBashPath": "C:/Program Files/Git/bin/bash.exe"
}
```

### 详细文档

- 📖 [CLI工具使用文档](cli/README.md) - 详细的CLI工具使用说明
- 🤖 [AI工具集成文档](firmware-cli-skill.md) - CLINE等AI助手的完整技能文档

## 联系方式

遇到问题请联系：

email: <a href="destin.zhang@quectel.com">destin.zhang@quectel.com </a>

