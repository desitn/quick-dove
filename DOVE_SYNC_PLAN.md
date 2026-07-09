# Dove Submodule Sync Plan

This document describes how to synchronize the main VSCode extension repository with changes from the `dove` git submodule.

## Project Paths

| Component | Path | Description |
|-----------|------|-------------|
| Main Repo | `F:\vscode-extension\quick-dove` | VSCode extension root |
| Dove Submodule | `F:\vscode-extension\quick-dove\dove` | CLI tool (dove.exe) |
| Dove Executable | `F:\vscode-extension\quick-dove\dove\dove.exe` | Bundled CLI |
| Main Config | `<workspace>/dove.json` | Shared configuration file |
| Memory Record | `.claude/projects/.../memory/dove-submodule-sync-point.md` | Sync point record |

## Sync Trigger Points

When the dove submodule modifies the following, the main repo MUST sync:

### 1. Type Definitions (`dove/src/types/index.ts`)

| Type | Main Repo Files to Update |
|------|---------------------------|
| `PortTag` enum | `src/config/configManager.js:36`, `src/localization.js`, `src/webview/settings/settings.html`, `src/webview/settings/settings.css` |
| `ComPortConfig` interface | `extension.js:50-55`, `src/config/configManager.js`, `src/webview/settings/settings.js` |
| `CLIConfig` interface | `extension.js` (`writeFirmwareCliConfig`), `src/config/configManager.js` |
| `BuildCommandItem` | `extension.js`, `src/webview/webviewManager.js` |

### 2. CLI Commands (`dove/src/index.ts`)

| Command Change | Main Repo Impact |
|----------------|------------------|
| `build` args changes | `extension.js` build task args |
| `flash` args changes | `extension.js` download command args |
| `port list` output format | `extension.js` DeviceTreeDataProvider |
| `port monitor` defaults | Settings UI hints |
| `port at` defaults | Settings UI hints |

### 3. Config File Structure (`dove.json`)

| Config Field | Main Repo Handler |
|--------------|-------------------|
| `comPorts[].tag` | `src/config/configManager.js`, settings UI |
| `buildCommands[]` | `extension.js`, settings UI |
| `firmwarePath` | `extension.js`, settings UI |
| `theme` | Settings UI |

## Sync Procedure

### Step 1: Check Dove Changes

```bash
cd dove
git status
git diff HEAD -- src/types/index.ts src/index.ts
git log --oneline -5
```

### Step 2: Identify Changed Types

1. Compare `PortTag` type definition
2. Compare `ComPortConfig` interface
3. Check CLI command argument changes
4. Check default values in help text

### Step 3: Update Main Repo Files

Follow the mapping table above to update corresponding files:

```
PortTag change →
  1. configManager.js COM_PORT_TAGS constant
  2. localization.js (en + zh-cn strings)
  3. settings.html tag dropdown options
  4. settings.css tag badge styles
  5. settings.js render/edit functions

ComPortConfig change →
  1. extension.js writeFirmwareCliConfig()
  2. configManager.js addComPort/updateComPort
  3. webviewManager.js message handlers
  4. settings.js UI logic
```

### Step 4: Verify Sync

Test commands after sync:

```bash
# In workspace with dove.json configured
dove.exe port list --json          # Check output format matches
dove.exe port monitor --tag UART_DBG   # Test tag-based selection
dove.exe port at -c "ATI" --tag UART_AT # Test AT command
dove.exe build --list              # Check build commands list
```

### Step 5: Update Memory Record

Update `.claude/projects/.../memory/dove-submodule-sync-point.md`:

1. Record the dove commit hash
2. Document what changed
3. List which main repo files were updated
4. Note any breaking changes

## Automatic Sync Detection

### File Watcher Approach

The main repo already watches `dove.json` for config changes. To detect dove submodule updates:

1. Check `dove/src/types/index.ts` for type changes
2. Compare with main repo's `COM_PORT_TAGS` and handlers
3. Alert if mismatch detected

### Manual Check Script

```bash
# Run this to check sync status
cd F:/vscode-extension/quick-dove

# Check dove PortTag
grep "PortTag" dove/src/types/index.ts

# Check main repo PortTag
grep "COM_PORT_TAGS" src/config/configManager.js

# Compare
```

## Breaking Change Handling

### PortTag Type Changed

**Example**: `PortTag` from `'AT'|'DBG'` to `'UART_AT'|'UART_DBG'`

**Migration Steps**:
1. Update `COM_PORT_TAGS` constant
2. Add migration in `configManager.initialize()` to convert old tags
3. Update all UI components
4. Update localization strings
5. Test with existing `dove.json` configs

### Config Structure Changed

**Example**: `tags: string[]` to `tag: string`

**Migration Steps**:
1. Add backward compatibility in `_readConfig()`
2. Convert old format on first read
3. Write new format on save
4. No user action needed (auto-migration)

## Current Sync State

| Dove Version | Main Repo Version | Status |
|--------------|-------------------|--------|
| Current (uncommitted) | Current | ✅ Synced |

**Last Sync Date**: 2026-04-24

**Core Principle**: dove CLI is primary. Config stored in `.dove/dove.json` only.

**Config Structure**:
```json
{
  "firmwarePath": "",
  "buildCommands": [],
  "buildGitBashPath": "",
  "comPorts": [],
  "theme": { "color": "blue" },
  "extension": {
    "language": "auto",
    "themeMode": "auto"
  }
}
```

**Synced Changes**:
- **Config Path**: Unified `.dove/dove.json`
- **extension field**: Plugin settings in `extension: {}` (dove CLI ignores this)
- **handlePortList**: Fixed `--usb` JSON output
- **showSerialList**: Added `returnResult` option
- **LogViewer**: Supports `.jsonl` format

## Related Files

- [Memory: dove-submodule-sync-point.md](.claude/projects/F--vscode-extension-quick-dove/memory/dove-submodule-sync-point.md)
- [Dove CLAUDE.md](dove/CLAUDE.md)
- [Dove Types](dove/src/types/index.ts)
- [Dove CLI Entry](dove/src/index.ts)