/**
 * @description: Welcome Webview Manager
 *               Handles the display of welcome page and setup wizard
 * @author: destin.zhang@quectel.com
 */

const vscode = require('vscode');
const path = require('path');
const fs = require('fs');
const { localize } = require('../localization');
const { configManager } = require('../config/configManager');
const SearchManager = require('../search/searchManager');

/**
 * Webview Manager Class
 * Handles all webview panels including welcome, settings, and search
 */
class WebviewManager {
    constructor(context) {
        this.context = context;
        this.panel = null;
        this.settingsPanel = null;
        this.searchPanel = null;
        this.searchManager = null;
    }

    /**
     * Check if welcome page should be shown
     */
    shouldShowWelcome() {
        const hasShownWelcome = this.context.globalState.get('quickFirmwarePlus.welcomeShown', false);
        const dontShowAgain = this.context.globalState.get('quickFirmwarePlus.dontShowWelcome', false);
        return !hasShownWelcome && !dontShowAgain;
    }

    /**
     * Mark welcome as shown
     */
    markWelcomeShown() {
        this.context.globalState.update('quickFirmwarePlus.welcomeShown', true);
    }

    /**
     * Set don't show welcome again
     */
    setDontShowAgain() {
        this.context.globalState.update('quickFirmwarePlus.dontShowWelcome', true);
    }

    /**
     * Show welcome page
     */
    showWelcome() {
        if (this.panel) {
            this.panel.reveal();
            return;
        }

        this.panel = vscode.window.createWebviewPanel(
            'quickFirmwarePlusWelcome',
            localize('welcome.title'),
            vscode.ViewColumn.One,
            {
                enableScripts: true,
                retainContextWhenHidden: true,
                localResourceRoots: [
                    vscode.Uri.file(path.join(this.context.extensionPath, 'src', 'webview'))
                ]
            }
        );

        this.panel.webview.html = this.getWelcomeHtml();

        // Handle messages from webview
        this.panel.webview.onDidReceiveMessage(
            message => {
                switch (message.command) {
                    case 'openSettings':
                        this.showSettings();
                        return;
                    case 'dontShowAgain':
                        this.setDontShowAgain();
                        if (this.panel) {
                            this.panel.dispose();
                        }
                        return;
                    case 'close':
                        if (this.panel) {
                            this.panel.dispose();
                        }
                        return;
                }
            },
            undefined,
            this.context.subscriptions
        );

        this.panel.onDidDispose(
            () => {
                this.panel = null;
                this.markWelcomeShown();
            },
            null,
            this.context.subscriptions
        );

        this.markWelcomeShown();
    }

    /**
     * Load HTML template from file and replace placeholders
     */
    loadTemplate(templateName, replacements) {
        const templatePath = path.join(this.context.extensionPath, 'src', 'webview', `${templateName}.html`);
        let html = fs.readFileSync(templatePath, 'utf8');
        
        // Replace all placeholders
        for (const [key, value] of Object.entries(replacements)) {
            const regex = new RegExp(`{{${key}}}`, 'g');
            html = html.replace(regex, value);
        }
        
        return html;
    }

    /**
     * Get welcome page HTML
     */
    getWelcomeHtml() {
        const locale = this.getLocale();
        const styleUri = this.panel.webview.asWebviewUri(
            vscode.Uri.file(path.join(this.context.extensionPath, 'src', 'webview', 'style.css'))
        );
        const welcomeCssUri = this.panel.webview.asWebviewUri(
            vscode.Uri.file(path.join(this.context.extensionPath, 'src', 'webview', 'welcome', 'welcome.css'))
        );
        const fontAwesomeUri = this.panel.webview.asWebviewUri(
            vscode.Uri.file(path.join(this.context.extensionPath, 'src', 'webview', 'assets', 'fontawesome', 'all.min.css'))
        );
        
        // Get effective theme
        const currentConfig = configManager.getConfig();
        const themeConfig = currentConfig.theme || 'auto';
        const effectiveTheme = this.getEffectiveTheme(themeConfig);
        
        let html = this.loadTemplate('welcome/welcome', {
            'locale': locale,
            'welcome.title': localize('welcome.title'),
            'welcome.header': localize('welcome.header'),
            'welcome.subtitle': localize('welcome.subtitle'),
            'welcome.feature.download': localize('welcome.feature.download'),
            'welcome.feature.download.desc': localize('welcome.feature.download.desc'),
            'welcome.feature.build': localize('welcome.feature.build'),
            'welcome.feature.build.desc': localize('welcome.feature.build.desc'),
            'welcome.feature.device': localize('welcome.feature.device'),
            'welcome.feature.device.desc': localize('welcome.feature.device.desc'),
            'welcome.feature.extensionTools': localize('welcome.feature.extensionTools'),
            'welcome.feature.extensionTools.desc': localize('welcome.feature.extensionTools.desc'),
            'welcome.startWizard': localize('welcome.startWizard'),
            'welcome.openSettings': localize('welcome.openSettings'),
            'welcome.close': localize('welcome.close'),
            'welcome.footer': localize('welcome.footer'),
            'welcome.dontShowAgain': localize('welcome.dontShowAgain')
        });
        
        // Replace CSS placeholders with webview URIs
        html = html.replace('href="{{style.css}}"', `href="${styleUri}"`);
        html = html.replace('href="{{welcome.css}}"', `href="${welcomeCssUri}"`);
        html = html.replace('href="{{fontawesome.css}}"', `href="${fontAwesomeUri}"`);
        
        // Apply effective theme to HTML
        // Note: {{locale}} was already replaced by loadTemplate(), so use actual locale value
        const accentColor = currentConfig.accentColor || 'blue';
        html = html.replace(`<html lang="${locale}">`, `<html lang="${locale}" data-theme="${effectiveTheme}" data-accent="${accentColor}">`);
        
        return html;
    }

    /**
     * Get current locale
     */
    getLocale() {
        const config = vscode.workspace.getConfiguration('quickFirmwarePlus');
        const language = config.get('language', 'auto');
        if (language === 'auto') {
            return vscode.env.language.toLowerCase();
        }
        return language.toLowerCase();
    }

    /**
     * Get effective theme for webview
     * @param {string} theme - Theme setting (dark/light/auto)
     * @returns {string} Effective theme to use
     */
    getEffectiveTheme(theme) {
        if (theme === 'auto') {
            // Follow VS Code theme
            const colorTheme = vscode.workspace.getConfiguration('workbench').get('colorTheme', '');
            const isDarkTheme = !colorTheme.toLowerCase().includes('light');
            return isDarkTheme ? 'dark' : 'light';
        }
        return theme;
    }

    /**
     * Show settings page
     */
    showSettings() {
        if (this.settingsPanel) {
            this.settingsPanel.reveal();
            return;
        }

        this.settingsPanel = vscode.window.createWebviewPanel(
            'quickFirmwarePlusSettings',
            localize('settings.title'),
            vscode.ViewColumn.One,
            {
                enableScripts: true,
                retainContextWhenHidden: true,
                localResourceRoots: [
                    vscode.Uri.file(path.join(this.context.extensionPath, 'src', 'webview'))
                ]
            }
        );

        this.settingsPanel.webview.html = this.getSettingsHtml();
        
        // Listen for VS Code theme changes
        vscode.workspace.onDidChangeConfiguration(e => {
            if (e.affectsConfiguration('workbench.colorTheme')) {
                const config = configManager.getConfig();
                if (config.theme === 'auto') {
                    this.settingsPanel.webview.postMessage({
                        command: 'themeChanged',
                        theme: this.getEffectiveTheme('auto')
                    });
                }
            }
        });

        // Handle messages from webview
        this.settingsPanel.webview.onDidReceiveMessage(
            async message => {
                switch (message.command) {
                    case 'getConfig':
                        // Send current configuration to webview
                        const config = configManager.getConfig();
                        const themeConfig = config.theme || 'auto';
                        const effectiveTheme = this.getEffectiveTheme(themeConfig);
                        this.settingsPanel.webview.postMessage({
                            command: 'configData',
                            config: config,
                            configFilePath: configManager.getConfigPath(),
                            effectiveTheme: effectiveTheme,
                            localizedStrings: {
                                runEnvSetup: localize('settings.runEnvSetup'),
                                uninstall: localize('settings.uninstall'),
                                installing: localize('settings.installing'),
                                uninstalling: localize('settings.uninstalling'),
                                checkingStatus: localize('settings.checkingStatus'),
                                checkStatus: localize('settings.checkStatus'),
                                install: localize('settings.install')
                            }
                        });
                        // Also check initial installation status
                        this.checkEnvStatus();
                        this.checkSkillStatus('claude-code');
                        this.checkSkillStatus('cline');
                        return;
                    case 'getEffectiveTheme':
                        // Send effective theme for auto mode
                        const currentThemeConfig = configManager.getConfig().theme || 'auto';
                        const currentEffectiveTheme = this.getEffectiveTheme(currentThemeConfig);
                        this.settingsPanel.webview.postMessage({
                            command: 'effectiveTheme',
                            theme: currentEffectiveTheme
                        });
                        return;
                    case 'browseFirmwarePath':
                        const folderUri = await vscode.window.showOpenDialog({
                            canSelectFiles: false,
                            canSelectFolders: true,
                            canSelectMany: false,
                            openLabel: localize('selectFirmwareDir')
                        });
                        if (folderUri && folderUri.length > 0) {
                            this.settingsPanel.webview.postMessage({
                                command: 'firmwarePathSelected',
                                path: folderUri[0].fsPath
                            });
                        }
                        return;
                    case 'browseGitBashPath':
                        const fileUri = await vscode.window.showOpenDialog({
                            canSelectFiles: true,
                            canSelectFolders: false,
                            canSelectMany: false,
                            openLabel: localize('selectGitBash'),
                            filters: {
                                'Executable': ['exe']
                            }
                        });
                        if (fileUri && fileUri.length > 0) {
                            this.settingsPanel.webview.postMessage({
                                command: 'gitBashPathSelected',
                                path: fileUri[0].fsPath
                            });
                        }
                        return;
                    case 'saveConfig':
                        // Save configuration
                        const updates = {
                            firmwarePath: message.config.firmwarePath,
                            buildCommands: message.config.buildCommands,
                            lastBuildCommand: message.config.lastBuildCommand,
                            buildGitBashPath: message.config.buildGitBashPath,
                            defaultComPort: message.config.defaultComPort,
                            language: message.config.language,
                            theme: message.config.theme,
                            accentColor: message.config.accentColor
                        };

                        const success = configManager.setMultiple(updates);
                        if (success) {
                            // Apply theme if changed
                            if (updates.theme) {
                                const effectiveTheme = this.getEffectiveTheme(updates.theme);
                                this.settingsPanel.webview.postMessage({
                                    command: 'themeChanged',
                                    theme: effectiveTheme
                                });
                            }
                            // Apply accent color if changed
                            if (updates.accentColor) {
                                this.settingsPanel.webview.postMessage({
                                    command: 'accentColorChanged',
                                    accentColor: updates.accentColor
                                });
                            }
                            this.settingsPanel.webview.postMessage({
                                command: 'configSaved',
                                message: localize('settings.saved')
                            });
                            // Trigger refresh
                            vscode.commands.executeCommand('firmwareDownloader.refresh');
                        } else {
                            this.settingsPanel.webview.postMessage({
                                command: 'configError',
                                message: localize('settings.saveFailed') + ': '
                            });
                        }
                        return;
                    case 'resetConfig':
                        // Reset to defaults
                        const resetSuccess = configManager.reset();
                        if (resetSuccess) {
                            this.settingsPanel.webview.postMessage({
                                command: 'configData',
                                config: configManager.getConfig(),
                                configFilePath: configManager.getConfigPath()
                            });
                            this.settingsPanel.webview.postMessage({
                                command: 'configSaved',
                                message: localize('settings.resetSuccess')
                            });
                            vscode.commands.executeCommand('firmwareDownloader.refresh');
                        } else {
                            this.settingsPanel.webview.postMessage({
                                command: 'configError',
                                message: localize('settings.resetFailed')
                            });
                        }
                        return;
                    case 'openConfigFile':
                        // Open dove.json in editor
                        const configPath = configManager.getConfigPath();
                        if (configPath && fs.existsSync(configPath)) {
                            const doc = await vscode.workspace.openTextDocument(configPath);
                            await vscode.window.showTextDocument(doc);
                        } else {
                            vscode.window.showErrorMessage(localize('settings.configFileNotFound'));
                        }
                        return;
                    case 'runEnvSetup':
                        // Run environment setup script
                        await this.runEnvSetup();
                        return;
                    case 'uninstallEnv':
                        // Uninstall dove from PATH
                        await this.uninstallEnv();
                        return;
                    case 'checkEnvStatus':
                        // Check environment installation status
                        await this.checkEnvStatus();
                        return;
                    case 'installSkill':
                        // Install skill to specified agent
                        await this.installSkill(message.agent);
                        return;
                    case 'uninstallSkill':
                        // Uninstall skill from specified agent
                        await this.uninstallSkill(message.agent);
                        return;
                    case 'checkSkillStatus':
                        // Check skill installation status for specified agent
                        await this.checkSkillStatus(message.agent);
                        return;
                    case 'selectScriptFile':
                        // Select script file for build command
                        const workspaceFolders = vscode.workspace.workspaceFolders;
                        const workspacePath = workspaceFolders && workspaceFolders.length > 0 ?
                            workspaceFolders[0].uri.fsPath : '';
                        const scriptUri = await vscode.window.showOpenDialog({
                            canSelectFiles: true,
                            canSelectFolders: false,
                            canSelectMany: false,
                            openLabel: localize('selectScriptFile'),
                            defaultUri: workspacePath ? vscode.Uri.file(workspacePath) : undefined,
                            filters: {
                                'Scripts': ['bat', 'sh', 'py', 'cmd', 'ps1'],
                                'All Files': ['*']
                            }
                        });
                        if (scriptUri && scriptUri.length > 0) {
                            const selectedPath = scriptUri[0].fsPath;
                            const scriptName = path.basename(selectedPath, path.extname(selectedPath));
                            const scriptCommand = path.basename(selectedPath);
                            
                            // Check for duplicate names using configManager
                            const existingCommands = configManager.getBuildCommands();
                            let finalName = scriptName;
                            let counter = 1;
                            while (existingCommands.some(cmd => cmd.name === finalName)) {
                                finalName = `${scriptName}_${counter}`;
                                counter++;
                            }
                            
                            this.settingsPanel.webview.postMessage({
                                command: 'scriptFileSelected',
                                name: finalName,
                                commandValue: scriptCommand
                            });
                        }
                        return;
                }
            },
            undefined,
            this.context.subscriptions
        );

        this.settingsPanel.onDidDispose(
            () => {
                this.settingsPanel = null;
            },
            null,
            this.context.subscriptions
        );
    }

    /**
     * Show search page
     */
    showSearch() {
        if (this.searchPanel) {
            this.searchPanel.reveal();
            return;
        }

        this.searchPanel = vscode.window.createWebviewPanel(
            'quickFirmwarePlusSearch',
            localize('search.title'),
            vscode.ViewColumn.One,
            {
                enableScripts: true,
                retainContextWhenHidden: true,
                localResourceRoots: [
                    vscode.Uri.file(path.join(this.context.extensionPath, 'src', 'webview'))
                ]
            }
        );

        this.searchPanel.webview.html = this.getSearchHtml();

        // Create search manager
        this.searchManager = new SearchManager(this.searchPanel.webview, configManager);
        this.searchManager.initialize();

        this.searchPanel.onDidDispose(
            () => {
                this.searchPanel = null;
                this.searchManager = null;
            },
            null,
            this.context.subscriptions
        );
    }

    /**
     * Get search page HTML
     */
    getSearchHtml() {
        const locale = this.getLocale();
        const styleUri = this.searchPanel.webview.asWebviewUri(
            vscode.Uri.file(path.join(this.context.extensionPath, 'src', 'webview', 'style.css'))
        );
        const searchPanelCssUri = this.searchPanel.webview.asWebviewUri(
            vscode.Uri.file(path.join(this.context.extensionPath, 'src', 'webview', 'searchPanel', 'searchPanel.css'))
        );
        const fontAwesomeUri = this.searchPanel.webview.asWebviewUri(
            vscode.Uri.file(path.join(this.context.extensionPath, 'src', 'webview', 'assets', 'fontawesome', 'all.min.css'))
        );
        const searchJsUri = this.searchPanel.webview.asWebviewUri(
            vscode.Uri.file(path.join(this.context.extensionPath, 'src', 'webview', 'searchPanel', 'searchPanel.js'))
        );
        
        // Get effective theme
        const currentConfig = configManager.getConfig();
        const themeConfig = currentConfig.theme || 'auto';
        const effectiveTheme = this.getEffectiveTheme(themeConfig);

        let html = this.loadTemplate('searchPanel/searchPanel', {
            'locale': locale,
            'search.title': localize('search.title'),
            'search.placeholder': localize('search.placeholder'),
            'search.emptyTitle': localize('search.emptyTitle'),
            'search.emptyDescription': localize('search.emptyDescription'),
            'search.scopeLabel': localize('search.scopeLabel'),
            'search.scopeGlobal': localize('search.scopeGlobal'),
            'search.scopeWorkspace': localize('search.scopeWorkspace'),
            'search.maxResultsLabel': localize('search.maxResultsLabel'),
            'search.revealInExplorer': localize('search.revealInExplorer'),
            'search.addToFavorites': localize('search.addToFavorites'),
            'search.copyPath': localize('search.copyPath'),
            'search.noResults': localize('search.noResults'),
            'search.resultsFound': localize('search.resultsFound'),
            'search.error': localize('search.error')
        });

        // Replace CSS and JS placeholders with webview URIs
        html = html.replace('href="{{style.css}}"', `href="${styleUri}"`);
        html = html.replace('href="{{searchPanel.css}}"', `href="${searchPanelCssUri}"`);
        html = html.replace('href="{{fontawesome.css}}"', `href="${fontAwesomeUri}"`);
        html = html.replace('src="{{search.js}}"', `src="${searchJsUri}"`);
        
        // Apply effective theme to HTML
        // Note: {{locale}} was already replaced by loadTemplate(), so use actual locale value
        const accentColor = currentConfig.accentColor || 'blue';
        html = html.replace(`<html lang="${locale}">`, `<html lang="${locale}" data-theme="${effectiveTheme}" data-accent="${accentColor}">`);
        
        return html;
    }

    /**
     * Search with text (for command palette)
     */
    async searchWithText(text) {
        this.showSearch();
        // Wait for webview to be ready
        setTimeout(() => {
            if (this.searchPanel) {
                this.searchPanel.webview.postMessage({
                    command: 'triggerSearch',
                    text: text
                });
            }
        }, 500);
    }

    /**
     * Run environment setup script
     */
    async runEnvSetup() {
        const extensionPath = this.context.extensionPath;
        const packageJson = require(path.join(extensionPath, 'package.json'));
        const extensionVersion = packageJson.version;
        const extensionName = packageJson.name;

        // Get extension info for versioned path tracking
        const versionedDirName = `${extensionName}-${extensionVersion}`;

        // Check for old versions first
        const oldVersions = await this.findOldEnvVersions(extensionName, extensionVersion);

        if (oldVersions.length > 0) {
            // Uninstall old versions before installing new one
            for (const oldVersion of oldVersions) {
                await this.uninstallEnvVersion(oldVersion.path);
            }
        }

        const initScript = path.join(extensionPath, 'dove', 'env', 'init.ps1');

        if (!fs.existsSync(initScript)) {
            this.settingsPanel.webview.postMessage({
                command: 'envSetupResult',
                success: false,
                message: localize('settings.envSetupFailed') + ': Environment setup script not found'
            });
            return;
        }

        try {
            // Run PowerShell script
            const { exec } = require('child_process');
            const command = `powershell -ExecutionPolicy Bypass -File "${initScript}"`;

            exec(command, { cwd: path.join(extensionPath, 'dove', 'env') }, (error, stdout, stderr) => {
                if (error) {
                    this.settingsPanel.webview.postMessage({
                        command: 'envSetupResult',
                        success: false,
                        message: localize('settings.envSetupFailed') + ': ' + error.message
                    });
                    return;
                }

                // Store installed version info in global state
                this.context.globalState.update('quickFirmwarePlus.envInstalledVersion', {
                    version: extensionVersion,
                    extensionName: extensionName,
                    path: path.join(extensionPath, 'dove'),
                    installedAt: new Date().toISOString()
                });

                // Note: VSCode terminal environment is auto-configured by extension
                // via environmentVariableCollection API - no terminal restart needed
                const vscodeNote = '\n\n(' + localize('settings.vscodeTerminalNote') + ')';
                this.settingsPanel.webview.postMessage({
                    command: 'envSetupResult',
                    success: true,
                    message: localize('settings.envSetupSuccess') + (oldVersions.length > 0 ? ' (' + localize('settings.oldVersionFound') + ')' : '') + vscodeNote
                });
            });
        } catch (error) {
            this.settingsPanel.webview.postMessage({
                command: 'envSetupResult',
                success: false,
                message: localize('settings.envSetupFailed') + ': ' + error.message
            });
        }
    }

    /**
     * Find old environment versions installed
     * Uses same cleaning logic as fix_path.ps1
     */
    async findOldEnvVersions(currentExtensionName, currentVersion) {
        const oldVersions = [];
        const userHome = process.env.USERPROFILE || process.env.HOME;

        // Use PowerShell to get User PATH from registry (like fix_path.ps1)
        const { exec } = require('child_process');
        const command = `powershell -Command "[Environment]::GetEnvironmentVariable('PATH', 'User')"`;

        try {
            const userPath = await new Promise((resolve) => {
                exec(command, (error, stdout) => {
                    if (error) {
                        // Fallback to process PATH
                        resolve(process.env.PATH || '');
                    } else {
                        resolve(stdout.trim());
                    }
                });
            });

            // Clean PATH entries (remove quotes, empty entries)
            const cleanedPaths = this.cleanPathString(userPath);

            for (const pathPart of cleanedPaths) {
                // Check if this is a dove path from our extension
                if (pathPart.includes('dove') && pathPart.includes('quick-dove')) {
                    // Extract version info from path if possible
                    const versionMatch = pathPart.match(/quick-dove-(\d+\.\d+\.\d+)/);
                    if (versionMatch) {
                        const foundVersion = versionMatch[1];
                        if (foundVersion !== currentVersion) {
                            oldVersions.push({
                                version: foundVersion,
                                path: pathPart
                            });
                        }
                    }
                }
            }
        } catch (error) {
            // Fallback to process PATH with cleaning
            const currentPath = process.env.PATH || '';
            const cleanedPaths = this.cleanPathString(currentPath);

            for (const pathPart of cleanedPaths) {
                if (pathPart.includes('dove') && pathPart.includes('quick-dove')) {
                    const versionMatch = pathPart.match(/quick-dove-(\d+\.\d+\.\d+)/);
                    if (versionMatch) {
                        const foundVersion = versionMatch[1];
                        if (foundVersion !== currentVersion) {
                            oldVersions.push({
                                version: foundVersion,
                                path: pathPart
                            });
                        }
                    }
                }
            }
        }

        // Also check global state for previous installations
        const installedInfo = this.context.globalState.get('quickFirmwarePlus.envInstalledVersion');
        if (installedInfo && installedInfo.version !== currentVersion) {
            if (!oldVersions.find(v => v.version === installedInfo.version)) {
                oldVersions.push({
                    version: installedInfo.version,
                    path: installedInfo.path
                });
            }
        }

        return oldVersions;
    }

    /**
     * Uninstall a specific environment version from PATH
     * Uses same cleaning logic as fix_path.ps1
     */
    async uninstallEnvVersion(firmwareCliPath) {
        try {
            // Use PowerShell to remove from PATH with proper cleaning
            const { exec } = require('child_process');
            // Only escape single quotes for PowerShell
            const escapedPath = firmwareCliPath.replace(/'/g, "''");
            // PowerShell's -ne is case-insensitive by default
            const command = `powershell -Command "$currPath = [Environment]::GetEnvironmentVariable('PATH', 'User'); $removePath = '${escapedPath}'; $cleanedParts = @($currPath -split ';' | ForEach-Object { $p = $_.Trim().Trim('"'); if (-not [string]::IsNullOrWhiteSpace($p) -and $p -ne $removePath) { $p } }); $newPath = $cleanedParts -join ';'; [Environment]::SetEnvironmentVariable('PATH', $newPath, 'User')"`;

            return new Promise((resolve) => {
                exec(command, (error) => {
                    if (error) {
                        console.error('Failed to uninstall old version:', error);
                    }
                    resolve();
                });
            });
        } catch (error) {
            console.error('Failed to uninstall old version:', error);
        }
    }

    /**
     * Uninstall dove from system PATH
     * Uses same cleaning logic as fix_path.ps1 to properly match and remove paths
     */
    async uninstallEnv() {
        const extensionPath = this.context.extensionPath;
        const firmwareCliDir = path.join(extensionPath, 'dove');

        try {
            // Run PowerShell to clean PATH and remove entry
            const { exec } = require('child_process');
            // Only escape single quotes for PowerShell
            const escapedPath = firmwareCliDir.replace(/'/g, "''");
            // PowerShell's -ne is case-insensitive by default, so no need for .ToLower()
            const command = `powershell -Command "$currPath = [Environment]::GetEnvironmentVariable('PATH', 'User'); $removePath = '${escapedPath}'; $cleanedParts = @($currPath -split ';' | ForEach-Object { $p = $_.Trim().Trim('"'); if (-not [string]::IsNullOrWhiteSpace($p) -and $p -ne $removePath) { $p } }); $newPath = $cleanedParts -join ';'; [Environment]::SetEnvironmentVariable('PATH', $newPath, 'User'); Write-Output 'Done'"`;

            exec(command, (error, stdout, stderr) => {
                if (error) {
                    this.settingsPanel.webview.postMessage({
                        command: 'envUninstallResult',
                        success: false,
                        message: localize('settings.uninstallFailed') + ': ' + error.message
                    });
                    return;
                }

                // Clear global state
                this.context.globalState.update('quickFirmwarePlus.envInstalledVersion', undefined);

                this.settingsPanel.webview.postMessage({
                    command: 'envUninstallResult',
                    success: true,
                    message: localize('settings.uninstallSuccess')
                });
            });
        } catch (error) {
            this.settingsPanel.webview.postMessage({
                command: 'envUninstallResult',
                success: false,
                message: localize('settings.uninstallFailed') + ': ' + error.message
            });
        }
    }

    /**
     * Clean PATH string by removing quotes and empty entries
     * Similar to fix_path.ps1 logic
     * @param {string} pathString - PATH string to clean
     * @returns {string[]} - Array of cleaned paths
     */
    cleanPathString(pathString) {
        if (!pathString) return [];
        return pathString.split(';')
            .map(p => p.trim().replace(/^"|"$/g, '')) // Remove quotes from both ends
            .filter(p => p.length > 0); // Remove empty entries
    }

    /**
     * Normalize path for comparison (handle case sensitivity and slashes)
     * @param {string} path - Path to normalize
     * @returns {string} - Normalized path
     */
    normalizePath(path) {
        if (!path) return '';
        return path.trim().replace(/^"|"$/g, '').toLowerCase().replace(/\\/g, '/');
    }

    /**
     * Check environment installation status
     */
    async checkEnvStatus() {
        const extensionPath = this.context.extensionPath;
        const packageJson = require(path.join(extensionPath, 'package.json'));
        const extensionVersion = packageJson.version;
        const extensionName = packageJson.name;
        const firmwareCliDir = path.join(extensionPath, 'dove');

        // Use PowerShell to get User PATH from registry (like fix_path.ps1)
        // This ensures we get the actual stored PATH, not the process PATH
        const { exec } = require('child_process');
        const command = `powershell -Command "[Environment]::GetEnvironmentVariable('PATH', 'User')"`;

        try {
            const userPath = await new Promise((resolve) => {
                exec(command, (error, stdout) => {
                    if (error) {
                        // Fallback to process PATH if PowerShell fails
                        resolve(process.env.PATH || '');
                    } else {
                        resolve(stdout.trim());
                    }
                });
            });

            // Clean and normalize paths for comparison (like fix_path.ps1)
            const cleanedPaths = this.cleanPathString(userPath);
            const normalizedFirmwareCliDir = this.normalizePath(firmwareCliDir);
            const isInPath = cleanedPaths.some(p => this.normalizePath(p) === normalizedFirmwareCliDir);

            // Check for old versions
            const oldVersions = await this.findOldEnvVersions(extensionName, extensionVersion);

            // Get stored installation info
            const installedInfo = this.context.globalState.get('quickFirmwarePlus.envInstalledVersion');

            this.settingsPanel.webview.postMessage({
                command: 'envStatusResult',
                installed: isInPath,
                path: firmwareCliDir,
                version: extensionVersion,
                extensionName: `${extensionName} v${extensionVersion}`,
                hasOldVersion: oldVersions.length > 0,
                oldVersions: oldVersions.map(v => `${v.path} (v${v.version})`)
            });
        } catch (error) {
            // Fallback: use process PATH with cleaning
            const currentPath = process.env.PATH || '';
            const cleanedPaths = this.cleanPathString(currentPath);
            const normalizedFirmwareCliDir = this.normalizePath(firmwareCliDir);
            const isInPath = cleanedPaths.some(p => this.normalizePath(p) === normalizedFirmwareCliDir);

            const oldVersions = await this.findOldEnvVersions(extensionName, extensionVersion);
            const installedInfo = this.context.globalState.get('quickFirmwarePlus.envInstalledVersion');

            this.settingsPanel.webview.postMessage({
                command: 'envStatusResult',
                installed: isInPath,
                path: firmwareCliDir,
                version: extensionVersion,
                extensionName: `${extensionName} v${extensionVersion}`,
                hasOldVersion: oldVersions.length > 0,
                oldVersions: oldVersions.map(v => `${v.path} (v${v.version})`)
            });
        }
    }

    /**
     * Install skill to specified agent
     * @param {string} agent - Agent name ('claude-code' or 'cline')
     */
    async installSkill(agent) {
        const extensionPath = this.context.extensionPath;
        const packageJson = require(path.join(extensionPath, 'package.json'));
        const extensionVersion = packageJson.version;
        const extensionName = packageJson.name;
        const userHome = process.env.USERPROFILE || process.env.HOME;

        // Source skill files
        const firmwareActionSrc = path.join(extensionPath, 'dove', 'skill', 'firmware-action', 'SKILL.md');
        const firmwareToolSrc = path.join(extensionPath, 'dove', 'skill', 'firmware-tool', 'SKILL.md');

        // Check source files exist
        if (!fs.existsSync(firmwareActionSrc) || !fs.existsSync(firmwareToolSrc)) {
            this.settingsPanel.webview.postMessage({
                command: 'skillInstallResult',
                agent: agent,
                success: false,
                message: localize('settings.installFailed') + ': Skill files not found'
            });
            return;
        }

        try {
            let installedPath;

            if (agent === 'claude-code') {
                // Claude Code: versioned structure ~/.claude/skills/<skill-name>/<extension-version>/SKILL.md
                const skillsBaseDir = path.join(userHome, '.claude', 'skills');
                const versionedDirName = `${extensionName}-${extensionVersion}`;

                // Check for old versions and remove them
                const skillDirNames = ['firmware-action', 'firmware-tool'];
                for (const skillName of skillDirNames) {
                    const skillDir = path.join(skillsBaseDir, skillName);
                    if (fs.existsSync(skillDir)) {
                        const items = fs.readdirSync(skillDir);
                        for (const item of items) {
                            if (item !== versionedDirName && item !== 'SKILL.md') {
                                const oldVersionDir = path.join(skillDir, item);
                                if (fs.statSync(oldVersionDir).isDirectory()) {
                                    fs.rmSync(oldVersionDir, { recursive: true, force: true });
                                }
                            }
                        }
                    }
                }

                // Create versioned skill directories
                const firmwareActionDir = path.join(skillsBaseDir, 'firmware-action', versionedDirName);
                const firmwareToolDir = path.join(skillsBaseDir, 'firmware-tool', versionedDirName);

                fs.mkdirSync(firmwareActionDir, { recursive: true });
                fs.mkdirSync(firmwareToolDir, { recursive: true });

                // Copy skill files
                fs.copyFileSync(firmwareActionSrc, path.join(firmwareActionDir, 'SKILL.md'));
                fs.copyFileSync(firmwareToolSrc, path.join(firmwareToolDir, 'SKILL.md'));

                installedPath = skillsBaseDir;
            } else if (agent === 'cline') {
                // Cline: flat structure in TWO locations:
                // 1. ~/.cline/skills/<skill-name>/SKILL.md
                // 2. ~/.agents/skills/<skill-name>/SKILL.md
                const clineSkillsDir = path.join(userHome, '.cline', 'skills');
                const agentsSkillsDir = path.join(userHome, '.agents', 'skills');

                const skillDirNames = ['firmware-action', 'firmware-tool'];

                for (const skillsDir of [clineSkillsDir, agentsSkillsDir]) {
                    for (const skillName of skillDirNames) {
                        const skillDir = path.join(skillsDir, skillName);
                        fs.mkdirSync(skillDir, { recursive: true });
                        const skillSrc = skillName === 'firmware-action' ? firmwareActionSrc : firmwareToolSrc;
                        fs.copyFileSync(skillSrc, path.join(skillDir, 'SKILL.md'));
                    }
                }

                installedPath = `${clineSkillsDir} & ${agentsSkillsDir}`;
            } else {
                this.settingsPanel.webview.postMessage({
                    command: 'skillInstallResult',
                    agent: agent,
                    success: false,
                    message: localize('settings.installFailed') + ': Unknown agent: ' + agent
                });
                return;
            }

            // Store installed version info in global state
            this.context.globalState.update(`quickFirmwarePlus.skillInstalledVersion.${agent}`, {
                version: extensionVersion,
                extensionName: extensionName,
                path: installedPath,
                installedAt: new Date().toISOString()
            });

            this.settingsPanel.webview.postMessage({
                command: 'skillInstallResult',
                agent: agent,
                success: true,
                message: localize('settings.installSuccess') + `: ${installedPath}`
            });
        } catch (error) {
            this.settingsPanel.webview.postMessage({
                command: 'skillInstallResult',
                agent: agent,
                success: false,
                message: localize('settings.installFailed') + ': ' + error.message
            });
        }
    }

    /**
     * Uninstall skill from specified agent
     * @param {string} agent - Agent name ('claude-code' or 'cline')
     */
    async uninstallSkill(agent) {
        const userHome = process.env.USERPROFILE || process.env.HOME;
        const extensionPath = this.context.extensionPath;
        const packageJson = require(path.join(extensionPath, 'package.json'));
        const extensionVersion = packageJson.version;
        const extensionName = packageJson.name;

        try {
            const skillNames = ['firmware-action', 'firmware-tool'];

            if (agent === 'claude-code') {
                // Claude Code: remove from ~/.claude/skills/
                const skillsBaseDir = path.join(userHome, '.claude', 'skills');
                this.removeSkillDirectory(skillsBaseDir, skillNames);
            } else if (agent === 'cline') {
                // Cline: remove from both ~/.cline/skills/ and ~/.agents/skills/
                const clineSkillsDir = path.join(userHome, '.cline', 'skills');
                const agentsSkillsDir = path.join(userHome, '.agents', 'skills');
                this.removeSkillDirectory(clineSkillsDir, skillNames);
                this.removeSkillDirectory(agentsSkillsDir, skillNames);
            } else {
                this.settingsPanel.webview.postMessage({
                    command: 'skillUninstallResult',
                    agent: agent,
                    success: false,
                    message: localize('settings.uninstallFailed') + ': Unknown agent'
                });
                return;
            }

            // Clear global state
            this.context.globalState.update(`quickFirmwarePlus.skillInstalledVersion.${agent}`, undefined);

            this.settingsPanel.webview.postMessage({
                command: 'skillUninstallResult',
                agent: agent,
                success: true,
                message: localize('settings.uninstallSuccess')
            });
        } catch (error) {
            this.settingsPanel.webview.postMessage({
                command: 'skillUninstallResult',
                agent: agent,
                success: false,
                message: localize('settings.uninstallFailed') + ': ' + error.message
            });
        }
    }

    /**
     * Remove skill directories from a base path
     * @param {string} skillsBaseDir - Base skills directory
     * @param {string[]} skillNames - Names of skills to remove
     */
    removeSkillDirectory(skillsBaseDir, skillNames) {
        for (const skillName of skillNames) {
            const skillDir = path.join(skillsBaseDir, skillName);
            if (fs.existsSync(skillDir)) {
                // Remove all contents
                const items = fs.readdirSync(skillDir);
                for (const item of items) {
                    const itemPath = path.join(skillDir, item);
                    if (fs.statSync(itemPath).isDirectory()) {
                        fs.rmSync(itemPath, { recursive: true, force: true });
                    } else {
                        fs.unlinkSync(itemPath);
                    }
                }
                // Remove the skill directory if empty
                if (fs.readdirSync(skillDir).length === 0) {
                    fs.rmSync(skillDir, { recursive: true });
                }
            }
        }
    }

    /**
     * Check skill installation status for specified agent
     * @param {string} agent - Agent name ('claude-code' or 'cline')
     */
    async checkSkillStatus(agent) {
        const userHome = process.env.USERPROFILE || process.env.HOME;
        const extensionPath = this.context.extensionPath;
        const packageJson = require(path.join(extensionPath, 'package.json'));
        const extensionVersion = packageJson.version;
        const extensionName = packageJson.name;

        const skillNames = ['firmware-action', 'firmware-tool'];
        let installedCount = 0;
        let installedPath = '';
        const oldVersions = [];

        if (agent === 'claude-code') {
            const skillsBaseDir = path.join(userHome, '.claude', 'skills');
            const result = this.checkSkillDirectory(skillsBaseDir, skillNames, extensionVersion);
            installedCount = result.installedCount;
            installedPath = result.installedPath;
            oldVersions.push(...result.oldVersions);
        } else if (agent === 'cline') {
            // Check both directories for Cline
            const clineSkillsDir = path.join(userHome, '.cline', 'skills');
            const agentsSkillsDir = path.join(userHome, '.agents', 'skills');

            const clineResult = this.checkSkillDirectory(clineSkillsDir, skillNames, extensionVersion);
            const agentsResult = this.checkSkillDirectory(agentsSkillsDir, skillNames, extensionVersion);

            // Combine results - installed if found in either location
            installedCount = Math.max(clineResult.installedCount, agentsResult.installedCount);
            installedPath = clineResult.installedPath || agentsResult.installedPath;
            oldVersions.push(...clineResult.oldVersions, ...agentsResult.oldVersions);
        }

        // Get stored installation info
        const installedInfo = this.context.globalState.get(`quickFirmwarePlus.skillInstalledVersion.${agent}`);

        this.settingsPanel.webview.postMessage({
            command: 'skillStatusResult',
            agent: agent,
            installed: installedCount >= 2, // Both skills need to be installed
            skillsCount: installedCount,
            path: installedPath || (agent === 'cline' ? '~/.cline/skills & ~/.agents/skills' : '~/.claude/skills'),
            version: extensionVersion,
            extensionName: `${extensionName} v${extensionVersion}`,
            hasOldVersion: oldVersions.length > 0,
            oldVersions: oldVersions
        });
    }

    /**
     * Check skill installation in a directory
     * @param {string} skillsBaseDir - Base skills directory
     * @param {string[]} skillNames - Names of skills to check
     * @param {string} extensionVersion - Current extension version
     * @returns {object} - { installedCount, installedPath, oldVersions }
     */
    checkSkillDirectory(skillsBaseDir, skillNames, extensionVersion) {
        let installedCount = 0;
        let installedPath = '';
        const oldVersions = [];

        for (const skillName of skillNames) {
            const skillDir = path.join(skillsBaseDir, skillName);
            if (fs.existsSync(skillDir)) {
                const items = fs.readdirSync(skillDir);
                for (const item of items) {
                    const itemPath = path.join(skillDir, item);
                    if (fs.statSync(itemPath).isDirectory()) {
                        // Check if it contains SKILL.md (versioned structure for Claude Code)
                        const skillMdPath = path.join(itemPath, 'SKILL.md');
                        if (fs.existsSync(skillMdPath)) {
                            installedCount++;
                            if (item.includes(extensionVersion)) {
                                installedPath = itemPath;
                            } else {
                                oldVersions.push(itemPath);
                            }
                        }
                    } else if (item === 'SKILL.md') {
                        // Direct SKILL.md without version subdirectory (flat structure for Cline)
                        installedCount++;
                        installedPath = skillDir;
                    }
                }
            }
        }

        return { installedCount, installedPath, oldVersions };
    }

    /**
     * Get settings page HTML
     */
    getSettingsHtml() {
        const locale = this.getLocale();
        const styleUri = this.settingsPanel.webview.asWebviewUri(
            vscode.Uri.file(path.join(this.context.extensionPath, 'src', 'webview', 'style.css'))
        );
        const settingsCssUri = this.settingsPanel.webview.asWebviewUri(
            vscode.Uri.file(path.join(this.context.extensionPath, 'src', 'webview', 'settings', 'settings.css'))
        );
        const fontAwesomeUri = this.settingsPanel.webview.asWebviewUri(
            vscode.Uri.file(path.join(this.context.extensionPath, 'src', 'webview', 'assets', 'fontawesome', 'all.min.css'))
        );
        const settingsJsUri = this.settingsPanel.webview.asWebviewUri(
            vscode.Uri.file(path.join(this.context.extensionPath, 'src', 'webview', 'settings', 'settings.js'))
        );
        
        // Get current config and effective theme
        const currentConfig = configManager.getConfig();
        const themeConfig = currentConfig.theme || 'auto';
        const effectiveTheme = this.getEffectiveTheme(themeConfig);

        let html = this.loadTemplate('settings/settings', {
            'locale': locale,
            'settings.title': localize('settings.title'),
            'settings.subtitle': localize('settings.subtitle'),
            'settings.firmwarePath': localize('settings.firmwarePath'),
            'settings.firmwarePathLabel': localize('settings.firmwarePathLabel'),
            'settings.firmwarePathDesc': localize('settings.firmwarePathDesc'),
            'settings.firmwarePathPlaceholder': localize('settings.firmwarePathPlaceholder'),
            'settings.browse': localize('wizard.browse'),
            'settings.buildCommands': localize('settings.buildCommands'),
            'settings.buildCommandsLabel': localize('settings.buildCommandsLabel'),
            'settings.buildCommandsDesc': localize('settings.buildCommandsDesc'),
            'settings.commandName': localize('settings.commandName'),
            'settings.commandValue': localize('settings.commandValue'),
            'settings.commandActions': localize('settings.commandActions'),
            'settings.noCommands': localize('settings.noCommands'),
            'settings.addCommand': localize('settings.addCommand'),
            'settings.commandNamePlaceholder': localize('settings.commandNamePlaceholder'),
            'settings.commandValuePlaceholder': localize('settings.commandValuePlaceholder'),
            'settings.add': localize('settings.add'),
            'settings.gitBashPath': localize('settings.gitBashPath'),
            'settings.gitBashPathLabel': localize('settings.gitBashPathLabel'),
            'settings.gitBashPathDesc': localize('settings.gitBashPathDesc'),
            'settings.gitBashPathPlaceholder': localize('settings.gitBashPathPlaceholder'),
            'settings.comPort': localize('settings.comPort'),
            'settings.comPortLabel': localize('settings.comPortLabel'),
            'settings.comPortDesc': localize('settings.comPortDesc'),
            'settings.comPortPlaceholder': localize('settings.comPortPlaceholder'),
            'settings.language': localize('settings.language'),
            'settings.languageLabel': localize('settings.languageLabel'),
            'settings.languageDesc': localize('settings.languageDesc'),
            'settings.languageAuto': localize('settings.languageAuto'),
            'settings.languageZhCn': localize('settings.languageZhCn'),
            'settings.languageEn': localize('settings.languageEn'),
            'settings.configFile': localize('settings.configFile'),
            'settings.configFileLabel': localize('settings.configFileLabel'),
            'settings.configFileDesc': localize('settings.configFileDesc'),
            'settings.configFileLoading': localize('settings.configFileLoading'),
            'settings.openConfigFile': localize('settings.openConfigFile'),
            'settings.reset': localize('settings.reset'),
            'settings.save': localize('settings.save'),
            'settings.selectScriptFile': localize('selectScriptFile'),
            // Theme settings - add missing theme localization strings
            'settings.theme': localize('settings.theme'),
            'settings.themeLabel': localize('settings.themeLabel'),
            'settings.themeDesc': localize('settings.themeDesc'),
            'settings.themeAuto': localize('settings.themeAuto'),
            'settings.themeDark': localize('settings.themeDark'),
            'settings.themeLight': localize('settings.themeLight'),
            // Agent Integration settings
            'settings.agentIntegration': localize('settings.agentIntegration'),
            'settings.envSetup': localize('settings.envSetup'),
            'settings.envSetupDesc': localize('settings.envSetupDesc'),
            'settings.runEnvSetup': localize('settings.runEnvSetup'),
            'settings.skillIntegration': localize('settings.skillIntegration'),
            'settings.skillIntegrationDesc': localize('settings.skillIntegrationDesc'),
            'settings.installToClaudeCode': localize('settings.installToClaudeCode'),
            'settings.installToCline': localize('settings.installToCline'),
            'settings.installing': localize('settings.installing'),
            'settings.installSuccess': localize('settings.installSuccess'),
            'settings.installFailed': localize('settings.installFailed'),
            'settings.envSetupSuccess': localize('settings.envSetupSuccess'),
            'settings.envSetupFailed': localize('settings.envSetupFailed'),
            // Installation status strings
            'settings.installStatus': localize('settings.installStatus'),
            'settings.checkStatus': localize('settings.checkStatus'),
            'settings.checkingStatus': localize('settings.checkingStatus'),
            'settings.installed': localize('settings.installed'),
            'settings.notInstalled': localize('settings.notInstalled'),
            'settings.install': localize('settings.install'),
            'settings.uninstall': localize('settings.uninstall'),
            'settings.uninstallSuccess': localize('settings.uninstallSuccess'),
            'settings.uninstallFailed': localize('settings.uninstallFailed'),
            'settings.oldVersionFound': localize('settings.oldVersionFound'),
            'settings.version': localize('settings.version'),
            'settings.extensionName': localize('settings.extensionName')
        });
        
        // Replace CSS and JS placeholders with webview URIs
        html = html.replace('href="{{style.css}}"', `href="${styleUri}"`);
        html = html.replace('href="{{settings.css}}"', `href="${settingsCssUri}"`);
        html = html.replace('href="{{fontawesome.css}}"', `href="${fontAwesomeUri}"`);
        html = html.replace('src="{{settings.js}}"', `src="${settingsJsUri}"`);
        
        // Apply effective theme to HTML
        // Note: {{locale}} was already replaced by loadTemplate(), so use actual locale value
        const accentColor = currentConfig.accentColor || 'blue';
        html = html.replace(`<html lang="${locale}">`, `<html lang="${locale}" data-theme="${effectiveTheme}" data-accent="${accentColor}">`);
        
        return html;
    }
}

module.exports = { WebviewManager };
