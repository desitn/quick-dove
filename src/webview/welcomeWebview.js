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

/**
 * Welcome Webview Manager Class
 * Isolated from main extension logic
 */
class WelcomeWebviewManager {
    constructor(context) {
        this.context = context;
        this.panel = null;
        this.settingsPanel = null;
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
        const fontAwesomeUri = this.panel.webview.asWebviewUri(
            vscode.Uri.file(path.join(this.context.extensionPath, 'src', 'webview', 'assets', 'fontawesome', 'all.min.css'))
        );
        
        let html = this.loadTemplate('welcome', {
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
            'welcome.startWizard': localize('welcome.startWizard'),
            'welcome.openSettings': localize('welcome.openSettings'),
            'welcome.close': localize('welcome.close'),
            'welcome.footer': localize('welcome.footer'),
            'welcome.dontShowAgain': localize('welcome.dontShowAgain')
        });
        
        // Replace CSS placeholders with webview URIs
        html = html.replace('href="{{style.css}}"', `href="${styleUri}"`);
        html = html.replace('href="{{fontawesome.css}}"', `href="${fontAwesomeUri}"`);
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
                            effectiveTheme: effectiveTheme
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
                            theme: message.config.theme
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
                        // Open firmware-cli.json in editor
                        const configPath = configManager.getConfigPath();
                        if (configPath && fs.existsSync(configPath)) {
                            const doc = await vscode.workspace.openTextDocument(configPath);
                            await vscode.window.showTextDocument(doc);
                        } else {
                            vscode.window.showErrorMessage(localize('settings.configFileNotFound'));
                        }
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
     * Get settings page HTML
     */
    getSettingsHtml() {
        const locale = this.getLocale();
        const styleUri = this.settingsPanel.webview.asWebviewUri(
            vscode.Uri.file(path.join(this.context.extensionPath, 'src', 'webview', 'style.css'))
        );
        const fontAwesomeUri = this.settingsPanel.webview.asWebviewUri(
            vscode.Uri.file(path.join(this.context.extensionPath, 'src', 'webview', 'assets', 'fontawesome', 'all.min.css'))
        );
        const settingsJsUri = this.settingsPanel.webview.asWebviewUri(
            vscode.Uri.file(path.join(this.context.extensionPath, 'src', 'webview', 'settings.js'))
        );
        
        let html = this.loadTemplate('settings', {
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
            'settings.selectScriptFile': localize('selectScriptFile')
        });
        
        // Replace CSS and JS placeholders with webview URIs
        html = html.replace('href="{{style.css}}"', `href="${styleUri}"`);
        html = html.replace('href="{{fontawesome.css}}"', `href="${fontAwesomeUri}"`);
        html = html.replace('src="{{settings.js}}"', `src="${settingsJsUri}"`);
        return html;
    }
}

module.exports = { WelcomeWebviewManager };
