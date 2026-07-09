---
name: dove-submodule-sync-point
description: dove CLI 配置主导，插件跟随 CLI 的 CLIConfig 接口定义
type: project
---

## dove CLI 配置主导原则

### 配置文件路径

**统一路径**: `.dove/dove.json`

dove CLI `findConfigPath()` 优先级:
1. FIRMWARE_CLI_CONFIG 环境变量
2. `.dove/dove.json` (工作空间)

**不支持** legacy 根目录 `dove.json`。

### CLIConfig 接口定义 (dove/src/types/index.ts)

```typescript
interface CLIConfig {
  firmwarePath?: string;
  buildCommands?: BuildCommandItem[];
  buildGitBashPath?: string;
  comPorts?: ComPortConfig[];
  workspacePath?: string;
  theme?: ThemeConfig;
}

interface ThemeConfig {
  color?: 'cyan' | 'blue' | 'green' | 'magenta' | 'yellow' | 'red' | 'white';
}

interface BuildCommandItem {
  name: string;
  command: string;
  description?: string;
  isActive?: boolean;
}

interface ComPortConfig {
  port: string;
  tag: PortTag;  // 'UART_AT' | 'UART_DBG' | 'USB_AT' | 'USB_DIAG' | 'Invalid'
  description?: string;
}
```

### 插件跟随规则

插件 configManager.js DEFAULT_CLI_CONFIG 必须包含所有 CLIConfig 字段:
- firmwarePath
- buildCommands
- buildGitBashPath
- comPorts
- workspacePath
- theme

**插件独有字段**: `extension: { language, themeMode }` - dove CLI 忽略此字段。

### 同步触发点

当 dove CLI 修改以下内容时，插件需同步:
1. CLIConfig 接口新增字段 → 更新 DEFAULT_CLI_CONFIG
2. PortTag 类型变化 → 更新 COM_PORT_TAGS
3. BuildCommandItem 结构变化 → 更新编译命令处理逻辑
4. ThemeConfig 可选值变化 → 更新主题选择 UI

### 当前状态 (2026-04-24)

- 配置路径: `.dove/dove.json` (统一)
- dove.exe: 已重新编译
- 插件 DEFAULT_CLI_CONFIG: 已同步 CLIConfig 接口

### 验证命令

```bash
# dove CLI
dove.exe config
dove.exe build --list

# 检查配置文件
cat .dove/dove.json
```