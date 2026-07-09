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
        const themeInfo = this._getThemeInfo();

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
        html = html.replace(`<html lang="${locale}">`, `<html lang="${locale}" data-theme="${themeInfo.mode}" data-accent="${themeInfo.color}">`);

        return html;
    }

    /**
     * Get current locale
     */
    getLocale() {
        const language = configManager.getLanguage();
        if (language === 'auto') {
            return vscode.env.language.toLowerCase();
        }
        return language.toLowerCase();
    }

    /**
     * Get theme info for webview
     * dove CLI: theme.color (stored in .dove/dove.json)
     * Plugin: themeMode (stored in globalState)
     * @returns {Object} { mode: 'dark'|'light', color: 'blue'|... }
     */
    _getThemeInfo() {
        const themeColor = configManager.getThemeColor() || 'blue';
        const themeMode = configManager.getThemeMode() || 'auto';
        const effectiveTheme = this.getEffectiveTheme(themeMode);
        return { mode: effectiveTheme, color: themeColor };
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
                const themeMode = configManager.getThemeMode();
                if (themeMode === 'auto') {
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
                        const themeInfo = this._getThemeInfo();
                        this.settingsPanel.webview.postMessage({
                            command: 'configData',
                            config: config,
                            configFilePath: configManager.getConfigPath(),
                            effectiveTheme: themeInfo.mode,
                            localizedStrings: {
                                uninstall: localize('settings.uninstall'),
                                installing: localize('settings.installing'),
                                uninstalling: localize('settings.uninstalling'),
                                checkingStatus: localize('settings.checkingStatus'),
                                checkStatus: localize('settings.checkStatus'),
                                install: localize('settings.install'),
                                portExists: localize('settings.portExists'),
                                portNameEmpty: localize('settings.portNameEmpty'),
                                portTagsEmpty: localize('settings.portTagsEmpty')
                            }
                        });
                        // Also check initial skill installation status
                        this.checkSkillStatus('claude-code');
                        this.checkSkillStatus('cline');
                        return;
                    case 'getEffectiveTheme':
                        // Send effective theme for auto mode
                        const themeInfoForAuto = this._getThemeInfo();
                        this.settingsPanel.webview.postMessage({
                            command: 'effectiveTheme',
                            theme: themeInfoForAuto.mode
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
                    // COM Port operations
                    case 'scanPorts':
                        // Call dove.exe port list to get serial ports
                        const doveExePath = path.join(this.context.extensionPath, 'dove', 'dove.exe');
                        if (!fs.existsSync(doveExePath)) {
                            this.settingsPanel.webview.postMessage({
                                command: 'configError',
                                message: 'dove.exe not found'
                            });
                            return;
                        }
                        try {
                            const { execSync } = require('child_process');
                            const workspacePath = configManager.getWorkspacePath();
                            const result = execSync(`"${doveExePath}" port list`, {
                                encoding: 'utf8',
                                timeout: 5000,
                                cwd: workspacePath || undefined
                            });
                            const ports = JSON.parse(result);
                            this.settingsPanel.webview.postMessage({
                                command: 'scanPortsResult',
                                ports: ports
                            });
                        } catch (error) {
                            this.settingsPanel.webview.postMessage({
                                command: 'configError',
                                message: 'Failed to scan ports: ' + error.message
                            });
                        }
                        return;
                    case 'addComPort':
                        const addSuccess = configManager.addComPort(message.port, message.tag);
                        if (addSuccess) {
                            this.settingsPanel.webview.postMessage({
                                command: 'configData',
                                config: configManager.getConfig(),
                                configFilePath: configManager.getConfigPath()
                            });
                        } else {
                            this.settingsPanel.webview.postMessage({
                                command: 'configError',
                                message: localize('settings.portExists') || 'Port already exists'
                            });
                        }
                        return;
                    case 'deleteComPort':
                        configManager.deleteComPort(message.index);
                        this.settingsPanel.webview.postMessage({
                            command: 'configData',
                            config: configManager.getConfig(),
                            configFilePath: configManager.getConfigPath()
                        });
                        return;
                    case 'deleteComPortRequest':
                        const portNameToDelete = message.portName;
                        const confirmDelete = await vscode.window.showWarningMessage(
                            localize('settings.deletePortConfirm') || `Delete port "${portNameToDelete}"?`,
                            { modal: true },
                            localize('settings.delete') || 'Delete'
                        );
                        if (confirmDelete) {
                            configManager.deleteComPort(message.index);
                            this.settingsPanel.webview.postMessage({
                                command: 'configData',
                                config: configManager.getConfig(),
                                configFilePath: configManager.getConfigPath()
                            });
                        }
                        return;
                    case 'saveConfig':
                        // Save configuration - dove CLI fields and extension field to .dove/dove.json
                        const cliUpdates = {
                            firmwarePath: message.config.firmwarePath,
                            buildCommands: message.config.buildCommands,
                            buildGitBashPath: message.config.buildGitBashPath
                        };

                        if (message.config.theme && message.config.theme.color) {
                            cliUpdates.theme = { color: message.config.theme.color };
                        }

                        // comPorts is managed separately

                        const success = configManager.setMultiple(cliUpdates);

                        // Save extension settings (language, themeMode) to dove.json extension field
                        if (message.config.language) {
                            configManager.setLanguage(message.config.language);
                        }
                        if (message.config.theme && message.config.theme.mode) {
                            configManager.setThemeMode(message.config.theme.mode);
                        }

                        if (success) {
                            // Notify theme change
                            const newThemeInfo = this._getThemeInfo();
                            this.settingsPanel.webview.postMessage({
                                command: 'themeChanged',
                                theme: newThemeInfo.mode,
                                accentColor: newThemeInfo.color
                            });
                            this.settingsPanel.webview.postMessage({
                                command: 'configSaved',
                                message: localize('settings.saved')
                            });
                            vscode.commands.executeCommand('firmwareDownloader.refresh');
                        } else {
                            this.settingsPanel.webview.postMessage({
                                command: 'configError',
                                message: localize('settings.saveFailed') + ': '
                            });
                        }
                        return;
                    case 'resetConfigRequest':
                        const confirmReset = await vscode.window.showWarningMessage(
                            localize('settings.resetConfirm') || 'Are you sure you want to reset all settings to defaults?',
                            { modal: true },
                            localize('settings.reset') || 'Reset'
                        );
                        if (confirmReset) {
                            const success = configManager.reset();
                            if (success) {
                                const resetConfig = configManager.getConfig();
                                const resetThemeInfo = this._getThemeInfo();
                                this.settingsPanel.webview.postMessage({
                                    command: 'configData',
                                    config: resetConfig,
                                    configFilePath: configManager.getConfigPath(),
                                    effectiveTheme: resetThemeInfo.mode,
                                    localizedStrings: {
                                        uninstall: localize('settings.uninstall'),
                                        installing: localize('settings.installing'),
                                        uninstalling: localize('settings.uninstalling'),
                                        checkingStatus: localize('settings.checkingStatus'),
                                        checkStatus: localize('settings.checkStatus'),
                                        install: localize('settings.install'),
                                        portExists: localize('settings.portExists'),
                                        portNameEmpty: localize('settings.portNameEmpty'),
                                        portTagsEmpty: localize('settings.portTagsEmpty')
                                    }
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
                        }
                        return;
                    case 'resetConfig':
                        const resetSuccess = configManager.reset();
                        if (resetSuccess) {
                            const resetConfig = configManager.getConfig();
                            const resetThemeInfo = this._getThemeInfo();
                            this.settingsPanel.webview.postMessage({
                                command: 'configData',
                                config: resetConfig,
                                configFilePath: configManager.getConfigPath(),
                                effectiveTheme: resetThemeInfo.mode,
                                localizedStrings: {
                                    uninstall: localize('settings.uninstall'),
                                    installing: localize('settings.installing'),
                                    uninstalling: localize('settings.uninstalling'),
                                    checkingStatus: localize('settings.checkingStatus'),
                                    checkStatus: localize('settings.checkStatus'),
                                    install: localize('settings.install'),
                                    portExists: localize('settings.portExists'),
                                    portNameEmpty: localize('settings.portNameEmpty'),
                                    portTagsEmpty: localize('settings.portTagsEmpty')
                                }
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
                    case 'getCppDefines':
                        // Get C/C++ defines list
                        const defines = this.getCppDefines();
                        this.settingsPanel.webview.postMessage({
                            command: 'cppDefineData',
                            defines: defines
                        });
                        return;
                    case 'addCppDefine':
                        // Add a new C/C++ define
                        if (message.defineName) {
                            const defineName = message.defineName.trim();
                            if (this.isValidCppDefineName(defineName)) {
                                const defines = this.getCppDefines();
                                if (!defines.includes(defineName)) {
                                    defines.push(defineName);
                                    this.saveCppDefines(defines);
                                    this.settingsPanel.webview.postMessage({
                                        command: 'cppDefineAdded',
                                        defineName: defineName
                                    });
                                    // Refresh list
                                    this.settingsPanel.webview.postMessage({
                                        command: 'cppDefineData',
                                        defines: defines
                                    });
                                } else {
                                    this.settingsPanel.webview.postMessage({
                                        command: 'cppDefineError',
                                        message: localize('cppDefineExists') || 'Define already exists'
                                    });
                                }
                            } else {
                                this.settingsPanel.webview.postMessage({
                                    command: 'cppDefineError',
                                    message: localize('cppDefineInvalid')
                                });
                            }
                        }
                        return;
                    case 'deleteCppDefine':
                        // Delete a C/C++ define
                        if (message.defineName) {
                            const defines = this.getCppDefines();
                            const index = defines.indexOf(message.defineName);
                            if (index > -1) {
                                defines.splice(index, 1);
                                this.saveCppDefines(defines);
                                this.settingsPanel.webview.postMessage({
                                    command: 'cppDefineRemoved',
                                    defineName: message.defineName
                                });
                                // Refresh list
                                this.settingsPanel.webview.postMessage({
                                    command: 'cppDefineData',
                                    defines: defines
                                });
                            }
                        }
                        return;
                    case 'openKeybindingSettings':
                        // Open VS Code keybinding settings
                        vscode.commands.executeCommand('workbench.action.openGlobalKeybindings');
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
        const themeInfo = this._getThemeInfo();

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
        html = html.replace(`<html lang="${locale}">`, `<html lang="${locale}" data-theme="${themeInfo.mode}" data-accent="${themeInfo.color}">`);

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
        const doveActionSrc = path.join(extensionPath, 'dove', 'skill', 'dove-action', 'SKILL.md');
        const doveQuerySrc = path.join(extensionPath, 'dove', 'skill', 'dove-query', 'SKILL.md');

        // Check source files exist
        if (!fs.existsSync(doveActionSrc) || !fs.existsSync(doveQuerySrc)) {
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
                // Claude Code: flat structure ~/.claude/skills/<skill-name>/SKILL.md
                const skillsBaseDir = path.join(userHome, '.claude', 'skills');
                const skillDirNames = ['dove-action', 'dove-query'];

                for (const skillName of skillDirNames) {
                    const skillDir = path.join(skillsBaseDir, skillName);
                    // Remove old versioned subdirectories if exist
                    if (fs.existsSync(skillDir)) {
                        const items = fs.readdirSync(skillDir);
                        for (const item of items) {
                            const itemPath = path.join(skillDir, item);
                            if (fs.statSync(itemPath).isDirectory()) {
                                // Remove old versioned directories like "quick-dove-0.2.5"
                                fs.rmSync(itemPath, { recursive: true, force: true });
                            }
                        }
                    }
                    // Create flat skill directory
                    fs.mkdirSync(skillDir, { recursive: true });
                    const skillSrc = skillName === 'dove-action' ? doveActionSrc : doveQuerySrc;
                    fs.copyFileSync(skillSrc, path.join(skillDir, 'SKILL.md'));
                }

                installedPath = skillsBaseDir;
            } else if (agent === 'cline') {
                // Cline: flat structure in TWO locations:
                // 1. ~/.cline/skills/<skill-name>/SKILL.md
                // 2. ~/.agents/skills/<skill-name>/SKILL.md
                //const clineSkillsDir = path.join(userHome, '.cline', 'skills');
                const agentsSkillsDir = path.join(userHome, '.agents', 'skills');
                const skillDirNames = ['dove-action', 'dove-query'];

                for (const skillsDir of [agentsSkillsDir]) {
                    for (const skillName of skillDirNames) {
                        const skillDir = path.join(skillsDir, skillName);
                        fs.mkdirSync(skillDir, { recursive: true });
                        const skillSrc = skillName === 'dove-action' ? doveActionSrc : doveQuerySrc;
                        fs.copyFileSync(skillSrc, path.join(skillDir, 'SKILL.md'));
                    }
                }

                installedPath = `${agentsSkillsDir}`;
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
            const skillNames = ['dove-action', 'dove-query'];

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

        const skillNames = ['dove-action', 'dove-query'];
        let installedCount = 0;
        const installedPaths = [];
        const oldVersions = [];

        if (agent === 'claude-code') {
            const skillsBaseDir = path.join(userHome, '.claude', 'skills');
            const result = this.checkSkillDirectory(skillsBaseDir, skillNames, extensionVersion);
            installedCount = result.installedCount;
            installedPaths.push(...result.installedPaths);
            oldVersions.push(...result.oldVersions);
        } else if (agent === 'cline') {
            // Check both directories for Cline
            const clineSkillsDir = path.join(userHome, '.cline', 'skills');
            const agentsSkillsDir = path.join(userHome, '.agents', 'skills');

            const clineResult = this.checkSkillDirectory(clineSkillsDir, skillNames, extensionVersion);
            const agentsResult = this.checkSkillDirectory(agentsSkillsDir, skillNames, extensionVersion);

            // Combine results - installed if found in either location
            installedCount = Math.max(clineResult.installedCount, agentsResult.installedCount);
            // Use agents skills dir paths preferentially (most common setup)
            if (agentsResult.installedPaths.length > 0) {
                installedPaths.push(...agentsResult.installedPaths);
            } else if (clineResult.installedPaths.length > 0) {
                installedPaths.push(...clineResult.installedPaths);
            }
            oldVersions.push(...clineResult.oldVersions, ...agentsResult.oldVersions);
        }

        // Get stored installation info
        const installedInfo = this.context.globalState.get(`quickFirmwarePlus.skillInstalledVersion.${agent}`);

        // Format paths for display - show all skill paths
        const formattedPaths = installedPaths.map(p =>
            p.replace(userHome, '~').replace(/\\/g, '/')
        );

        // Base skills directory for display when no skills installed
        const baseDir = agent === 'cline'
            ? '~/.agents/skills (or ~/.cline/skills)'
            : '~/.claude/skills';

        this.settingsPanel.webview.postMessage({
            command: 'skillStatusResult',
            agent: agent,
            installed: installedCount >= 2, // Both skills need to be installed
            skillsCount: installedCount,
            // Show all installed skill paths
            paths: formattedPaths.length > 0 ? formattedPaths : [baseDir],
            extensionName: extensionName,
            currentVersion: extensionVersion,
            hasOldVersion: oldVersions.length > 0,
            oldVersions: oldVersions.map(p => p.replace(userHome, '~').replace(/\\/g, '/'))
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
        const installedPaths = [];
        const oldVersions = [];

        for (const skillName of skillNames) {
            const skillDir = path.join(skillsBaseDir, skillName);
            if (fs.existsSync(skillDir)) {
                const items = fs.readdirSync(skillDir);
                for (const item of items) {
                    const itemPath = path.join(skillDir, item);
                    if (fs.statSync(itemPath).isDirectory()) {
                        // Old versioned structure - mark as old version
                        const skillMdPath = path.join(itemPath, 'SKILL.md');
                        if (fs.existsSync(skillMdPath)) {
                            oldVersions.push(itemPath);
                        }
                    } else if (item === 'SKILL.md') {
                        // Flat structure (correct) - SKILL.md directly in skill folder
                        installedCount++;
                        installedPaths.push(skillDir);
                    }
                }
            }
        }

        return {
            installedCount,
            installedPaths,
            hasCurrentVersion: installedCount >= skillNames.length,
            oldVersions
        };
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
        const themeInfo = this._getThemeInfo();

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
            'settings.commandDesc': localize('settings.commandDesc'),
            'settings.commandValue': localize('settings.commandValue'),
            'settings.commandActions': localize('settings.commandActions'),
            'settings.noCommands': localize('settings.noCommands'),
            'settings.addCommand': localize('settings.addCommand'),
            'settings.commandNamePlaceholder': localize('settings.commandNamePlaceholder'),
            'settings.commandDescPlaceholder': localize('settings.commandDescPlaceholder'),
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
            // COM Ports (multi-port with tags)
            'settings.comPorts': localize('settings.comPorts'),
            'settings.comPortsLabel': localize('settings.comPortsLabel'),
            'settings.comPortsDesc': localize('settings.comPortsDesc'),
            'settings.portName': localize('settings.portName'),
            'settings.portTags': localize('settings.portTags'),
            'settings.portActions': localize('settings.portActions'),
            'settings.noPorts': localize('settings.noPorts'),
            'settings.addPort': localize('settings.addPort'),
            'settings.add': localize('settings.add'),
            'settings.portNamePlaceholder': localize('settings.portNamePlaceholder'),
            'settings.portExists': localize('settings.portExists'),
            'settings.portNameEmpty': localize('settings.portNameEmpty'),
            'settings.portTagEmpty': localize('settings.portTagEmpty'),
            'settings.scanPorts': localize('settings.scanPorts'),
            'settings.noPortsFound': localize('settings.noPortsFound'),
            'settings.availablePorts': localize('settings.availablePorts'),
            'settings.delete': localize('settings.delete'),
            // PortTag types (synced with dove submodule)
            'settings.portTagEmpty': localize('settings.portTagEmpty'),
            'settings.selectTag': localize('settings.selectTag'),
            'settings.tagUARTAT': localize('settings.tagUARTAT'),
            'settings.tagUARTDBG': localize('settings.tagUARTDBG'),
            'settings.tagUSBAT': localize('settings.tagUSBAT'),
            'settings.tagUSBDIAG': localize('settings.tagUSBDIAG'),
            'settings.tagInvalid': localize('settings.tagInvalid'),
            'settings.tagUARTATDesc': localize('settings.tagUARTATDesc'),
            'settings.tagUARTDBGDesc': localize('settings.tagUARTDBGDesc'),
            'settings.tagUSBATDesc': localize('settings.tagUSBATDesc'),
            'settings.tagUSBDIAGDesc': localize('settings.tagUSBDIAGDesc'),
            'settings.tagInvalidDesc': localize('settings.tagInvalidDesc'),
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
            'settings.resetShort': localize('settings.resetShort'),
            'settings.save': localize('settings.save'),
            'settings.saveShort': localize('settings.saveShort'),
            'settings.selectScriptFile': localize('selectScriptFile'),
            // Theme settings - add missing theme localization strings
            'settings.theme': localize('settings.theme'),
            'settings.themeLabel': localize('settings.themeLabel'),
            'settings.themeDesc': localize('settings.themeDesc'),
            'settings.themeAuto': localize('settings.themeAuto'),
            'settings.themeDark': localize('settings.themeDark'),
            'settings.themeLight': localize('settings.themeLight'),
            'settings.accentColorLabel': localize('settings.accentColorLabel'),
            'settings.accentColorDesc': localize('settings.accentColorDesc'),
            'settings.accentCyan': localize('settings.accentCyan'),
            'settings.accentBlue': localize('settings.accentBlue'),
            'settings.accentGreen': localize('settings.accentGreen'),
            'settings.accentMagenta': localize('settings.accentMagenta'),
            'settings.accentYellow': localize('settings.accentYellow'),
            'settings.accentRed': localize('settings.accentRed'),
            'settings.accentWhite': localize('settings.accentWhite'),
            // Agent Integration settings
            'settings.agentIntegration': localize('settings.agentIntegration'),
            'settings.skillIntegration': localize('settings.skillIntegration'),
            'settings.skillIntegrationDesc': localize('settings.skillIntegrationDesc'),
            'settings.installToClaudeCode': localize('settings.installToClaudeCode'),
            'settings.installToCline': localize('settings.installToCline'),
            'settings.installing': localize('settings.installing'),
            'settings.installSuccess': localize('settings.installSuccess'),
            'settings.installFailed': localize('settings.installFailed'),
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
            'settings.extensionName': localize('settings.extensionName'),
            // C/C++ Define Helper
            'settings.cppDefine': localize('settings.cppDefine'),
            'settings.cppDefineLabel': localize('settings.cppDefineLabel'),
            'settings.cppDefineDesc': localize('settings.cppDefineDesc'),
            'settings.cppDefineList': localize('settings.cppDefineList'),
            'settings.cppDefineAdd': localize('settings.cppDefineAdd'),
            'settings.cppDefineDelete': localize('settings.cppDefineDelete'),
            'settings.cppDefineEmpty': localize('settings.cppDefineEmpty'),
            'settings.cppDefinePlaceholder': localize('settings.cppDefinePlaceholder'),
            'settings.cppDefineKeybinding': localize('settings.cppDefineKeybinding'),
            'settings.cppDefineKeybindingDesc': localize('settings.cppDefineKeybindingDesc'),
            'settings.cppDefineOpenKeybinding': localize('settings.cppDefineOpenKeybinding')
        });
        
        // Replace CSS and JS placeholders with webview URIs
        html = html.replace('href="{{style.css}}"', `href="${styleUri}"`);
        html = html.replace('href="{{settings.css}}"', `href="${settingsCssUri}"`);
        html = html.replace('href="{{fontawesome.css}}"', `href="${fontAwesomeUri}"`);
        html = html.replace('src="{{settings.js}}"', `src="${settingsJsUri}"`);

        // Apply effective theme to HTML
        html = html.replace(`<html lang="${locale}">`, `<html lang="${locale}" data-theme="${themeInfo.mode}" data-accent="${themeInfo.color}">`);

        return html;
    }

    // ========== C/C++ Define Helper Methods ==========

    /**
     * Check if a define name is valid
     * @param {string} text
     * @returns {boolean}
     */
    isValidCppDefineName(text) {
        const definePattern = /^[A-Z_][A-Z0-9_]*$/;
        return definePattern.test(text);
    }

    /**
     * Get C/C++ defines from workspace settings
     * @returns {Array<string>}
     */
    getCppDefines() {
        const workspaceFolders = vscode.workspace.workspaceFolders;
        if (!workspaceFolders || workspaceFolders.length === 0) {
            return [];
        }

        const settingsPath = path.join(workspaceFolders[0].uri.fsPath, '.vscode', 'settings.json');

        if (!fs.existsSync(settingsPath)) {
            return [];
        }

        try {
            const content = fs.readFileSync(settingsPath, 'utf8');
            if (!content.trim()) {
                return [];
            }
            const settings = JSON.parse(content);
            return settings['C_Cpp.default.defines'] || [];
        } catch (error) {
            return [];
        }
    }

    /**
     * Save C/C++ defines to workspace settings
     * @param {Array<string>} defines
     */
    saveCppDefines(defines) {
        const workspaceFolders = vscode.workspace.workspaceFolders;
        if (!workspaceFolders || workspaceFolders.length === 0) {
            return false;
        }

        const settingsPath = path.join(workspaceFolders[0].uri.fsPath, '.vscode', 'settings.json');
        const vscodeDir = path.dirname(settingsPath);

        // Ensure .vscode directory exists
        if (!fs.existsSync(vscodeDir)) {
            fs.mkdirSync(vscodeDir, { recursive: true });
        }

        let settings = {};

        // Read existing settings
        if (fs.existsSync(settingsPath)) {
            try {
                const content = fs.readFileSync(settingsPath, 'utf8');
                if (content.trim()) {
                    settings = JSON.parse(content);
                }
            } catch (error) {
                // If parse fails, start fresh
                settings = {};
            }
        }

        settings['C_Cpp.default.defines'] = defines;

        try {
            fs.writeFileSync(settingsPath, JSON.stringify(settings, null, 4));
            return true;
        } catch (error) {
            return false;
        }
    }
}

module.exports = { WebviewManager };
