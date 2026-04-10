# Quick Dove

⚡协助固件编译和下载的插件⚡

## 功能特性

- ⚡ **功能一** - 适配多个RTOS平台项目的工作空间编译的快速下载；
- ⚡ **功能二** - 底部状态栏 `下载`图标点击快速下载 `构建`图标点击快速编译工程；
- ⚡ **功能三** - 支持容器视图查看当前空间固件列表、设备列表和可配置信息；

## 下载架构

**架构说明：**

| 层级 | 组件 | 职责 |
|------|------|------|
| UI层 | VS Code Extension | 用户界面交互、状态栏显示、容器视图管理 |
| 逻辑层 | dove.exe | 固件识别、设备管理、进度监控、命令调度 |
| 执行层 | 平台烧录工具 | 实际执行固件烧录操作 |

**核心特性：**
- ✅ 自动识别固件类型并选择对应烧录工具
- ✅ 自动检测设备并切换下载模式
- ✅ 实时进度追踪（支持JSON格式输出）
- ✅ 统一的CLI接口，可独立使用
- ✅ 支持多平台（ASR、UNISOC、EIGEN、ESP等）

> 💡 **注意**：串口调试功能已独立为单独的插件，可通过组合包方式使用


目前支持芯片平台(RTOS):

- 🧩`ASR`     160X | 1802S | 1803S | 1903S 

- 🧩`UNISOC`  8310 | 8910 | 8850*

- 🧩`EIGEN`   618* | 718*

不同平台镜像文件类型差异见下表：

| 🧩平台     |   🟧芯片型号    |  🟦镜像类型 |  🟩烧录工具 | 
|------------|-----------------|-------------|-------------|
|  ASR       | 160X            | `*.zip`     | adownload.exe | 
|  ASR       | 1803 1903 1802  | `._fbf.bin` | FBFDownloader.exe | 
| UNISOC     | 8310 8910 8850  | `*.pac`     | ResearchDownload | 
| Eigen      | 618 718         | `*.binpkg`  | FlashtoolCLI | 

> 💡 **说明**：所有平台的烧录操作均由 `dove.exe` 统一调度，自动选择对应烧录工具

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

2. `[Quick Dove]`容器视图查看固件镜像文件/文件夹，外部查找手动指定固件目录；
   
   视图中选择固件文件点击触发下载任务；视图中选择固件文件夹点击复制文件夹路径；
   
   ![下载视图2](images/download.png)
   
   tips：下载日志查看，在VSCODE `输出` 窗口选择过滤`[Quick Dove]`即可查看底层工具实时运行日志；

#### 二、侧边栏视图

1. VS Code 侧边栏中点击`Quick Dove`闪电图标，即可进入容器视图；

2. 可查看固件列表信息、设备列表信息已经打开的COM调试工具和插件可配置项信息；
   
#### 三、设备管理

1. VS Code `[Quick Dove]`容器视图 设备列表可查看当前连接的USB设备；

2. 设备列表会自动刷新显示已连接的硬件设备；

   ![设备列表](images/devices.png)

#### 四、协助编译

1. VS Code 底部状态栏右侧点击`编译`执行工作空间的 build*OPTfile.bat文件进行编译；

2. build*.sh git bash 脚本编译文件需要手动配置bash安装路径，详见插件设置；

#### 五、AI Agent Skill集成

插件设置里可为常用的AI Agent导入插件的编译烧录Skill和workflow，AI自动`写-编-烧-测`链路打通;

**配置文件：**

在项目根目录创建 `dove.json` 配置文件：

```json
{
  "firmwarePath": "C:\\path\\to\\firmware",
  "buildCommand": "build_release.bat",
  "buildGitBashPath": "C:\\Program Files\\Git\\bin\\bash.exe",
  "defaultComPort": "COM9"
}
```

## 联系方式

遇到问题请联系：

email: <a href="destin.zhang@quectel.com">destin.zhang@quectel.com </a>

