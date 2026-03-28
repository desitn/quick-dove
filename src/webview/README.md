# Welcome Webview Module

This module provides the welcome page and setup wizard functionality for Quick Firmware + extension.

## Features

### Welcome Page
- Displayed on first install of the extension
- Shows key features and keyboard shortcuts
- Provides quick access to setup wizard and settings
- "Don't show again" option to disable

### Setup Wizard
- 4-step configuration wizard for new workspaces
- Guides users through:
  1. Firmware path selection
  2. Build command configuration
  3. Git Bash path (optional, for .sh scripts on Windows)
  4. Configuration summary

### Auto-detection
- Automatically detects firmware projects when opening new workspaces
- Checks for:
  - `quectel_build/release` directory structure
  - Build scripts (build.bat, build.sh, etc.)
- Prompts user to run setup wizard if project structure detected

## Usage

### Manual Commands
- `Quick Firmware +: Show Welcome Page` - Display welcome page
- `Quick Firmware +: Run Setup Wizard` - Run configuration wizard

### Automatic
- Welcome page shows on first install
- Setup wizard prompt shows when opening firmware project workspaces

## Architecture Design

### File Structure

```
src/welcome/
├── README.md           # This documentation
├── welcomeWebview.js   # Main module - WelcomeWebviewManager class
├── welcome.html        # Welcome page HTML template
├── wizard.html         # Setup wizard HTML template
├── wizard.js           # Setup wizard JavaScript logic
└── style.css           # Common styles for both pages
```

### Module Relationships

```
extension.js (Extension Entry)
    │
    ├──► WelcomeWebviewManager (welcomeWebview.js)
    │       │
    │       ├──► Welcome Page (welcome.html + style.css)
    │       │       │
    │       │       └── User clicks "Start Setup Wizard"
    │       │               │
    │       │               ▼
    │       └──► Setup Wizard (wizard.html + wizard.js + style.css)
    │               │
    │               ├── Step 1: Firmware Path Selection
    │               ├── Step 2: Build Commands Configuration
    │               ├── Step 3: Git Bash Path (Optional)
    │               └── Step 4: Configuration Summary
    │
    └──► Auto-detection (shouldShowWorkspaceWizard)
            │
            └── Detects firmware project structure
                    │
                    └──► Prompts to run Setup Wizard
```

### Class Diagram

```
┌─────────────────────────────────────────────────────────────┐
│                    WelcomeWebviewManager                     │
├─────────────────────────────────────────────────────────────┤
│ - context: ExtensionContext                                  │
│ - panel: WebviewPanel | null                                 │
│ - wizardPanel: WebviewPanel | null                           │
├─────────────────────────────────────────────────────────────┤
│ + shouldShowWelcome(): boolean                               │
│ + markWelcomeShown(): void                                   │
│ + setDontShowAgain(): void                                   │
│ + showWelcome(): void                                        │
│ + shouldShowWorkspaceWizard(): boolean                       │
│ + showSetupWizard(): void                                    │
│ + detectFirmwarePaths(): Promise<DetectedPath[]>             │
│ + detectBuildScripts(): Promise<BuildScript[]>               │
│ + saveWizardConfig(config: WizardConfig): Promise<void>      │
│ - loadTemplate(name: string, replacements: object): string   │
│ - getWelcomeHtml(): string                                   │
│ - getWizardHtml(): string                                    │
│ - getLocale(): string                                        │
└─────────────────────────────────────────────────────────────┘
```

### Communication Flow

```
┌─────────────────────────────────────────────────────────────────────────┐
│                        Webview Communication Flow                        │
├─────────────────────────────────────────────────────────────────────────┤
│                                                                          │
│   Webview (Frontend)              Extension Backend (Node.js)           │
│        │                                    │                           │
│        │  1. User Action                    │                           │
│        │     (click button)                 │                           │
│        │                                    │                           │
│        ├─────► postMessage({command}) ─────►│                           │
│        │                                    │                           │
│        │                                    ├─► onDidReceiveMessage      │
│        │                                    │       │                   │
│        │                                    │       ├── openWizard       │
│        │                                    │       ├── openSettings     │
│        │                                    │       ├── selectFirmwarePath│
│        │                                    │       ├── selectScriptFile │
│        │                                    │       ├── saveConfig       │
│        │                                    │       └── ...              │
│        │                                    │                           │
│        │◄──── postMessage({result}) ◄───────┤                           │
│        │                                    │                           │
│        │  2. Update UI                       │                           │
│        │     (show result)                   │                           │
│        │                                    │                           │
└─────────────────────────────────────────────────────────────────────────┘
```

### Resource Loading Flow

```
┌─────────────────────────────────────────────────────────────────────────┐
│                        Resource Loading Process                          │
├─────────────────────────────────────────────────────────────────────────┤
│                                                                          │
│  1. Load HTML Template                                                   │
│     └── loadTemplate('welcome' | 'wizard', replacements)                │
│                                                                          │
│  2. Replace Placeholders                                                 │
│     ├── {{locale}}          → 'en' | 'zh-cn'                            │
│     ├── {{welcome.title}}   → localized string                          │
│     ├── {{style.css}}       → placeholder (step 4)                      │
│     └── {{wizard.js}}       → placeholder (step 4)                      │
│                                                                          │
│  3. Generate Webview URIs                                                │
│     ├── styleUri  = panel.webview.asWebviewUri(style.css)               │
│     └── wizardJsUri = panel.webview.asWebviewUri(wizard.js)             │
│                                                                          │
│  4. Replace Resource Placeholders                                        │
│     ├── href="{{style.css}}"  → href="vscode-resource://..."            │
│     └── src="{{wizard.js}}"   → src="vscode-resource://..."             │
│                                                                          │
│  5. Set Webview HTML                                                     │
│     └── panel.webview.html = finalHtml                                  │
│                                                                          │
└─────────────────────────────────────────────────────────────────────────┘
```

### State Management

#### Global State (Extension Level)
| Key | Type | Description |
|-----|------|-------------|
| `quickFirmwarePlus.welcomeShown` | boolean | Whether welcome page has been shown |
| `quickFirmwarePlus.dontShowWelcome` | boolean | User preference to hide welcome |

#### Workspace Configuration
| Key | Type | Description |
|-----|------|-------------|
| `quickFirmwarePlus.firmwarePath` | string | Path to firmware directory |
| `quickFirmwarePlus.buildCommands` | array | List of build commands |
| `quickFirmwarePlus.lastBuildCommand` | string | Last used build command name |
| `quickFirmwarePlus.buildGitBashPath` | string | Path to Git Bash executable |

### Message Protocol

#### From Webview to Extension
| Command | Parameters | Description |
|---------|------------|-------------|
| `openWizard` | - | Open setup wizard |
| `openSettings` | - | Open VS Code settings |
| `dontShowAgain` | - | Disable welcome page |
| `close` | - | Close current webview |
| `getDetectedPaths` | - | Request auto-detected firmware paths |
| `selectFirmwarePath` | - | Show folder picker dialog |
| `selectScriptFile` | - | Show file picker for build script |
| `selectGitBashPath` | - | Show file picker for Git Bash |
| `saveConfig` | `{firmwarePath, buildCommands, gitBashPath}` | Save wizard configuration |

#### From Extension to Webview
| Command | Parameters | Description |
|---------|------------|-------------|
| `firmwarePathSelected` | `{path}` | Return selected firmware path |
| `detectedPaths` | `{paths}` | Return auto-detected paths list |
| `gitBashPathSelected` | `{path}` | Return selected Git Bash path |
| `scriptFileSelected` | `{name, commandValue}` | Return selected script info |

## Files

### welcomeWebview.js
Main module containing:
- `WelcomeWebviewManager` class
- Welcome page HTML generation
- Wizard HTML generation
- Configuration persistence
- Auto-detection logic

### welcome.html
Template for welcome page with placeholders:
- `{{locale}}` - Language code
- `{{welcome.*}}` - Localized welcome strings
- `{{command.*}}` - Localized command strings
- `{{style.css}}` - CSS resource placeholder

### wizard.html
Template for setup wizard with placeholders:
- `{{locale}}` - Language code
- `{{wizard.*}}` - Localized wizard strings
- `{{style.css}}` - CSS resource placeholder
- `{{wizard.js}}` - JavaScript resource placeholder

### wizard.js
JavaScript logic for wizard page:
- Step navigation (next/prev)
- Command list management
- Message handling
- Form validation

### style.css
Common styles for both pages:
- VS Code theme variables integration
- Button styles
- Form styles
- Step indicator styles
- Command list styles
- Responsive layout

## Integration Points

### With Extension
- Registered commands: `firmwareDownloader.showWelcome`, `firmwareDownloader.showSetupWizard`
- Tree view integration: Settings view shows welcome/wizard entries
- Configuration updates: Saves to VS Code workspace settings

### With firmware-cli
- Writes `firmware-cli.json` configuration file
- Uses `firmware-cli.exe` for device detection and firmware flashing

## Best Practices

1. **Separation of Concerns**: HTML templates, CSS, and JS are in separate files
2. **Localization**: All user-facing strings use the `localize()` function
3. **Resource Security**: Uses `asWebviewUri()` for all external resources
4. **State Persistence**: Uses VS Code's built-in state management
5. **Error Handling**: Graceful fallbacks for missing configurations
