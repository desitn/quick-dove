# Webview Module

This module provides all webview-based user interfaces for Quick Dove extension.

## Directory Structure

```
src/webview/
├── README.md              # This documentation
├── webviewManager.js      # Main module - WebviewManager class
├── style.css              # Common styles (theme variables, buttons, forms)
├── assets/                # Shared assets
│   ├── fontawesome/       # FontAwesome CSS
│   └── webfonts/          # FontAwesome webfonts
│
├── welcome/               # Welcome page module
│   ├── welcome.html       # Welcome page HTML template
│   └── welcome.css        # Welcome page specific styles
│
├── settings/              # Settings page module
│   ├── settings.html      # Settings page HTML template
│   ├── settings.css       # Settings page specific styles
│   └── settings.js        # Settings page JavaScript logic
│
├── searchPanel/           # Search panel module
│   ├── searchPanel.html   # Search panel HTML template
│   ├── searchPanel.css    # Search panel specific styles
│   └── searchPanel.js     # Search panel JavaScript logic
│
└── logViewer/             # Log viewer module
    ├── logViewer.html     # Log viewer HTML template
    ├── logViewer.css      # Log viewer specific styles
    ├── logViewer.js       # Log viewer JavaScript logic
    ├── logViewerManager.js # Log viewer backend manager
    ├── logAnalyzer.js     # Log analysis logic
    ├── keywordHighlighter.js # Keyword highlighting
    └── markbookManager.js # Bookmark management
```

## Module Architecture

### WebviewManager (webviewManager.js)

The central manager class that handles all webview panels:

```javascript
class WebviewManager {
    // Panel instances
    panel           // Welcome page panel
    settingsPanel   // Settings page panel
    searchPanel     // Search panel
    searchManager   // Search backend manager
    
    // Public methods
    showWelcome()           // Display welcome page
    showSettings()          // Display settings page
    showSearch()            // Display search panel
    searchWithText(text)    // Search with predefined text
    
    // Internal methods
    getWelcomeHtml()        // Generate welcome page HTML
    getSettingsHtml()       // Generate settings page HTML
    getSearchHtml()         // Generate search panel HTML
    loadTemplate(name, replacements)  // Load and process HTML templates
    getLocale()             // Get current language setting
    getEffectiveTheme(theme) // Resolve theme (auto → dark/light)
}
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
│        │     (click/button/input)           │                           │
│        │                                    │                           │
│        ├─────► postMessage({command}) ─────►│                           │
│        │                                    │                           │
│        │                                    ├─► onDidReceiveMessage      │
│        │                                    │       │                   │
│        │                                    │       ├── process command  │
│        │                                    │       ├── call handlers    │
│        │                                    │       └── ...              │
│        │                                    │                           │
│        │◄──── postMessage({result}) ◄───────┤                           │
│        │                                    │                           │
│        │  2. Update UI                       │                           │
│        │     (display result)                │                           │
│        │                                    │                           │
└─────────────────────────────────────────────────────────────────────────┘
```

## Adding a New Webview Module

Follow this step-by-step guide to add a new webview module:

### Step 1: Create Module Directory

```bash
# Create new module directory under src/webview/
mkdir src/webview/yourModule/
```

### Step 2: Create Required Files

Each webview module should contain:

| File | Purpose |
|------|---------|
| `yourModule.html` | HTML template with `{{placeholder}}` syntax |
| `yourModule.css` | Module-specific styles |
| `yourModule.js` | Frontend JavaScript logic (optional if JS is embedded in HTML) |

### Step 3: HTML Template Structure

```html
<!DOCTYPE html>
<html lang="{{locale}}">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>{{yourModule.title}}</title>
    
    <!-- Common styles (required) -->
    <link rel="stylesheet" href="{{style.css}}">
    
    <!-- FontAwesome icons (optional) -->
    <link rel="stylesheet" href="{{fontawesome.css}}">
    
    <!-- Module-specific styles (required) -->
    <link rel="stylesheet" href="{{yourModule.css}}">
</head>
<body>
    <!-- Your content here -->
    
    <!-- JavaScript (if external file) -->
    <script src="{{yourModule.js}}"></script>
    
    <!-- Or embedded JavaScript -->
    <script>
        const vscode = acquireVsCodeApi();
        // Your frontend logic here
    </script>
</body>
</html>
```

### Step 4: CSS Style Guidelines

Use CSS variables for theme support:

```css
/* Use variables from style.css */
:root[data-theme="dark"] {
    /* Variables are already defined in style.css */
}

:root[data-theme="light"] {
    /* Variables are already defined in style.css */
}

/* Your module-specific styles */
.your-module-container {
    background: var(--bg-primary);
    color: var(--text-primary);
    border: 1px solid var(--border-color);
}

/* Use accent color for highlights */
.your-module-highlight {
    color: var(--accent-color);
}
```

### Step 5: JavaScript Frontend Pattern

```javascript
(function() {
    // Acquire VS Code API
    const vscode = acquireVsCodeApi();
    
    // State variables
    let yourState = {};
    
    // Initialize
    function init() {
        setupEventListeners();
        requestInitialData();
    }
    
    // Setup event listeners
    function setupEventListeners() {
        document.getElementById('yourButton')
            .addEventListener('click', handleButtonClick);
        
        // Listen for messages from extension
        window.addEventListener('message', handleMessage);
    }
    
    // Request initial data from extension
    function requestInitialData() {
        vscode.postMessage({ command: 'getYourData' });
    }
    
    // Handle messages from extension
    function handleMessage(event) {
        const message = event.data;
        switch (message.command) {
            case 'yourData':
                // Process received data
                yourState = message.data;
                renderUI();
                break;
        }
    }
    
    // Send message to extension
    function sendToExtension(command, data) {
        vscode.postMessage({
            command: command,
            ...data
        });
    }
    
    // Initialize when DOM is ready
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }
})();
```

### Step 6: Integrate with WebviewManager

Add to `webviewManager.js`:

```javascript
// 1. Add panel property
class WebviewManager {
    constructor(context) {
        this.yourModulePanel = null;  // Add this
    }
    
    // 2. Add show method
    showYourModule() {
        if (this.yourModulePanel) {
            this.yourModulePanel.reveal();
            return;
        }
        
        this.yourModulePanel = vscode.window.createWebviewPanel(
            'quickFirmwarePlusYourModule',
            localize('yourModule.title'),
            vscode.ViewColumn.One,
            {
                enableScripts: true,
                retainContextWhenHidden: true,
                localResourceRoots: [
                    vscode.Uri.file(path.join(this.context.extensionPath, 'src', 'webview'))
                ]
            }
        );
        
        this.yourModulePanel.webview.html = this.getYourModuleHtml();
        
        // Handle messages from webview
        this.yourModulePanel.webview.onDidReceiveMessage(
            message => {
                switch (message.command) {
                    case 'getYourData':
                        // Send data to webview
                        this.yourModulePanel.webview.postMessage({
                            command: 'yourData',
                            data: yourBackendData
                        });
                        return;
                    // Add more message handlers
                }
            },
            undefined,
            this.context.subscriptions
        );
        
        this.yourModulePanel.onDidDispose(
            () => {
                this.yourModulePanel = null;
            },
            null,
            this.context.subscriptions
        );
    }
    
    // 3. Add HTML generation method
    getYourModuleHtml() {
        const locale = this.getLocale();
        const styleUri = this.yourModulePanel.webview.asWebviewUri(
            vscode.Uri.file(path.join(this.context.extensionPath, 'src', 'webview', 'style.css'))
        );
        const yourModuleCssUri = this.yourModulePanel.webview.asWebviewUri(
            vscode.Uri.file(path.join(this.context.extensionPath, 'src', 'webview', 'yourModule', 'yourModule.css'))
        );
        const fontAwesomeUri = this.yourModulePanel.webview.asWebviewUri(
            vscode.Uri.file(path.join(this.context.extensionPath, 'src', 'webview', 'assets', 'fontawesome', 'all.min.css'))
        );
        const yourModuleJsUri = this.yourModulePanel.webview.asWebviewUri(
            vscode.Uri.file(path.join(this.context.extensionPath, 'src', 'webview', 'yourModule', 'yourModule.js'))
        );
        
        // Get effective theme
        const currentConfig = configManager.getConfig();
        const themeConfig = currentConfig.theme || 'auto';
        const effectiveTheme = this.getEffectiveTheme(themeConfig);
        
        // Load template (use module path: 'yourModule/yourModule')
        let html = this.loadTemplate('yourModule/yourModule', {
            'locale': locale,
            'yourModule.title': localize('yourModule.title'),
            // Add more placeholders
        });
        
        // Replace CSS/JS placeholders with webview URIs
        html = html.replace('href="{{style.css}}"', `href="${styleUri}"`);
        html = html.replace('href="{{yourModule.css}}"', `href="${yourModuleCssUri}"`);
        html = html.replace('href="{{fontawesome.css}}"', `href="${fontAwesomeUri}"`);
        html = html.replace('src="{{yourModule.js}}"', `src="${yourModuleJsUri}"`);
        
        // Apply effective theme
        html = html.replace(`<html lang="${locale}">`, `<html lang="${locale}" data-theme="${effectiveTheme}">`);
        
        return html;
    }
}
```

### Step 7: Add Localization Strings

Add to localization files (`package.nls.json`, `package.nls.zh-cn.json`):

```json
// package.nls.json
{
    "yourModule.title": "Your Module",
    "yourModule.description": "Description of your module"
}

// package.nls.zh-cn.json
{
    "yourModule.title": "你的模块",
    "yourModule.description": "模块描述"
}
```

### Step 8: Register Command (optional)

Add to `package.json`:

```json
{
    "contributes": {
        "commands": [
            {
                "command": "firmwareDownloader.showYourModule",
                "title": "%yourModule.title%",
                "category": "Quick Dove"
            }
        ]
    }
}
```

Add to `extension.js`:

```javascript
const { WebviewManager } = require('./src/webview/webviewManager');

// Register command
context.subscriptions.push(
    vscode.commands.registerCommand('firmwareDownloader.showYourModule', () => {
        webviewManager.showYourModule();
    })
);
```

## Message Protocol Reference

### Common Message Patterns

| Command | Parameters | Description |
|---------|------------|-------------|
| `getConfig` | - | Request configuration data |
| `getEffectiveTheme` | - | Request current theme |
| `themeChanged` | `{theme}` | Theme update notification |

### Settings Page Commands

| Command | Parameters | Description |
|---------|------------|-------------|
| `browseFirmwarePath` | - | Show folder picker |
| `browseGitBashPath` | - | Show file picker for Git Bash |
| `selectScriptFile` | - | Show script file picker |
| `saveConfig` | `{config}` | Save configuration |
| `resetConfig` | - | Reset to defaults |
| `openConfigFile` | - | Open config file in editor |

### Search Panel Commands

| Command | Parameters | Description |
|---------|------------|-------------|
| `search` | `{keyword, scope, maxResults}` | Perform search |
| `openFile` | `{filePath}` | Open file in editor |
| `revealInExplorer` | `{filePath}` | Reveal in file explorer |
| `addToFavorites` | `{filePath, fileName}` | Add to favorites |
| `copyPath` | `{filePath}` | Copy path to clipboard |

## Theme Support

### CSS Variables (defined in style.css)

```css
/* Background colors */
--bg-primary      /* Main background */
--bg-secondary    /* Secondary background */
--bg-tertiary     /* Tertiary background */

/* Text colors */
--text-primary    /* Primary text */
--text-secondary  /* Secondary text */
--text-muted      /* Muted/disabled text */

/* Accent colors */
--accent-color    /* Primary accent (links, buttons) */

/* Border colors */
--border-color    /* Standard border */

/* Input colors */
--input-bg        /* Input background */
--input-border    /* Input border */
--input-focus-border /* Focused input border */
```

### Applying Theme

The theme is applied via HTML attribute:

```html
<html lang="en" data-theme="dark">
```

CSS automatically responds:

```css
:root[data-theme="dark"] { /* dark mode styles */ }
:root[data-theme="light"] { /* light mode styles */ }
```

## Best Practices

1. **Modular Structure**: Each webview feature should be in its own directory
2. **Localization**: All user-facing strings use `localize()` function
3. **Resource Security**: Use `asWebviewUri()` for all external resources
4. **Theme Support**: Use CSS variables, apply `data-theme` attribute
5. **Error Handling**: Handle all message commands gracefully
6. **State Management**: Use VS Code's state API for persistence
7. **Template Pattern**: Use `{{placeholder}}` for all dynamic content
8. **Separation**: Keep HTML, CSS, and JS in separate files

## Testing

To test a new webview module:

1. Open VS Code with extension loaded
2. Execute command: `Quick Dove: Show [Your Module]`
3. Verify:
   - Page renders correctly
   - Theme switching works (dark/light/auto)
   - All buttons/inputs respond
   - Messages are sent/received correctly
   - Localization strings display correctly