/**
 * @description: Welcome Webview Manager
 *               Handles the display of welcome page and setup wizard
 * @author: destin.zhang@quectel.com
 */

const vscode = require('vscode');
const path = require('path');
const fs = require('fs');
const { localize } = require('../localization');

/**
 * Welcome Webview Manager Class
 * Isolated from main extension logic
 */
class WelcomeWebviewManager {
    constructor(context) {
        this.context = context;
        this.panel = null;
        this.wizardPanel = null;
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
                    vscode.Uri.file(path.join(this.context.extensionPath, 'src', 'welcome'))
                ]
            }
        );

        this.panel.webview.html = this.getWelcomeHtml();

        // Handle messages from webview
        this.panel.webview.onDidReceiveMessage(
            message => {
                switch (message.command) {
                    case 'openWizard':
                        this.showSetupWizard();
                        return;
                    case 'openSettings':
                        vscode.commands.executeCommand('firmwareDownloader.settings');
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
     * Check if setup wizard should be shown for new workspace
     */
    shouldShowWorkspaceWizard() {
        const workspaceFolders = vscode.workspace.workspaceFolders;
        if (!workspaceFolders || workspaceFolders.length === 0) {
            return false;
        }

        // Check if already configured for this workspace
        const config = vscode.workspace.getConfiguration('quickFirmwarePlus');
        const firmwarePath = config.get('firmwarePath');
        const buildCommands = config.get('buildCommands');

        // If nothing is configured, show wizard
        if (!firmwarePath && (!buildCommands || buildCommands.length === 0)) {
            // Check if workspace has potential firmware structure
            const workspacePath = workspaceFolders[0].uri.fsPath;
            const releasePath = path.join(workspacePath, 'quectel_build', 'release');
            
            if (fs.existsSync(releasePath)) {
                return true;
            }

            // Check for build scripts
            const buildScripts = ['build.bat', 'build.sh', 'build*.bat', 'build*.sh'];
            for (const pattern of buildScripts) {
                const files = vscode.workspace.findFiles(pattern, null, 1);
                if (files && files.length > 0) {
                    return true;
                }
            }
        }

        return false;
    }

    /**
     * Auto-detect firmware path
     * Only checks if quectel_build/release exists in workspace
     * Returns display text only, actual path remains empty
     */
    async autoDetectFirmwarePath() {
        const workspaceFolders = vscode.workspace.workspaceFolders;
        
        if (!workspaceFolders || workspaceFolders.length === 0) {
            return { detected: false, displayText: '', actualPath: '' };
        }

        const workspacePath = workspaceFolders[0].uri.fsPath;
        const releasePath = path.join(workspacePath, 'quectel_build', 'release');
        
        if (fs.existsSync(releasePath)) {
            return { 
                detected: true, 
                displayText: 'auto:quectel\\release',
                actualPath: ''  // Keep empty for firmware-cli.json
            };
        }

        return { detected: false, displayText: '', actualPath: '' };
    }

    /**
     * Detect build scripts automatically
     */
    async detectBuildScripts() {
        const scripts = [];
        const workspaceFolders = vscode.workspace.workspaceFolders;
        
        if (!workspaceFolders || workspaceFolders.length === 0) {
            return scripts;
        }

        const patterns = [
            'build*.bat', 'build*.sh', 'build*.cmd', 'build*.ps1',
            'make*.bat', 'make*.sh', '*.py'
        ];

        for (const pattern of patterns) {
            try {
                const files = await vscode.workspace.findFiles(pattern, null, 10);
                for (const file of files) {
                    const fileName = path.basename(file.fsPath);
                    const ext = path.extname(fileName);
                    const name = path.basename(fileName, ext);
                    scripts.push({
                        name: name,
                        command: fileName,
                        path: file.fsPath,
                        type: ext.slice(1)
                    });
                }
            } catch (e) {
                // Ignore errors for pattern search
            }
        }

        return scripts;
    }

    /**
     * Show setup wizard
     */
    showSetupWizard() {
        if (this.wizardPanel) {
            this.wizardPanel.reveal();
            return;
        }

        this.wizardPanel = vscode.window.createWebviewPanel(
            'quickFirmwarePlusWizard',
            localize('wizard.title'),
            vscode.ViewColumn.One,
            {
                enableScripts: true,
                retainContextWhenHidden: true,
                localResourceRoots: [
                    vscode.Uri.file(path.join(this.context.extensionPath, 'src', 'welcome'))
                ]
            }
        );

        this.wizardPanel.webview.html = this.getWizardHtml();

        // Get workspace folder for default URI
        const workspaceFolders = vscode.workspace.workspaceFolders;
        const workspacePath = workspaceFolders && workspaceFolders.length > 0 ? 
            workspaceFolders[0].uri.fsPath : '';

        // Handle messages from webview
        this.wizardPanel.webview.onDidReceiveMessage(
            async message => {
                switch (message.command) {
                    case 'autoDetectFirmwarePath':
                        const detectResult = await this.autoDetectFirmwarePath();
                        this.wizardPanel.webview.postMessage({
                            command: 'autoDetectResult',
                            detected: detectResult.detected,
                            displayText: detectResult.displayText
                        });
                        return;
                    case 'selectFirmwarePath':
                        const folderUri = await vscode.window.showOpenDialog({
                            canSelectFiles: false,
                            canSelectFolders: true,
                            canSelectMany: false,
                            openLabel: localize('selectFirmwareDir'),
                            defaultUri: workspacePath ? vscode.Uri.file(workspacePath) : undefined
                        });
                        if (folderUri && folderUri.length > 0) {
                            this.wizardPanel.webview.postMessage({
                                command: 'firmwarePathSelected',
                                path: folderUri[0].fsPath
                            });
                        }
                        return;
                    case 'selectScriptFile':
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
                            
                            // Check for duplicate names
                            const config = vscode.workspace.getConfiguration('quickFirmwarePlus');
                            const existingCommands = config.get('buildCommands') || [];
                            let finalName = scriptName;
                            let counter = 1;
                            while (existingCommands.some(cmd => cmd.name === finalName)) {
                                finalName = `${scriptName}_${counter}`;
                                counter++;
                            }
                            
                            this.wizardPanel.webview.postMessage({
                                command: 'scriptFileSelected',
                                name: finalName,
                                commandValue: scriptCommand
                            });
                        }
                        return;
                    case 'selectGitBashPath':
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
                            this.wizardPanel.webview.postMessage({
                                command: 'gitBashPathSelected',
                                path: fileUri[0].fsPath
                            });
                        }
                        return;
                    case 'saveConfig':
                        await this.saveWizardConfig(message.config);
                        vscode.window.showInformationMessage(localize('wizard.configSaved'));
                        if (this.wizardPanel) {
                            this.wizardPanel.dispose();
                        }
                        return;
                    case 'close':
                        if (this.wizardPanel) {
                            this.wizardPanel.dispose();
                        }
                        return;
                }
            },
            undefined,
            this.context.subscriptions
        );

        this.wizardPanel.onDidDispose(
            () => {
                this.wizardPanel = null;
            },
            null,
            this.context.subscriptions
        );
    }

    /**
     * Save wizard configuration
     */
    async saveWizardConfig(config) {
        const configuration = vscode.workspace.getConfiguration('quickFirmwarePlus');
        
        if (config.firmwarePath) {
            await configuration.update('firmwarePath', config.firmwarePath, vscode.ConfigurationTarget.Workspace);
        }
        
        if (config.buildCommands && config.buildCommands.length > 0) {
            await configuration.update('buildCommands', config.buildCommands, vscode.ConfigurationTarget.Workspace);
            if (config.buildCommands.length > 0) {
                await configuration.update('lastBuildCommand', config.buildCommands[0].name, vscode.ConfigurationTarget.Workspace);
            }
        }
        
        if (config.gitBashPath) {
            await configuration.update('buildGitBashPath', config.gitBashPath, vscode.ConfigurationTarget.Workspace);
        }

        // Trigger refresh
        vscode.commands.executeCommand('firmwareDownloader.refresh');
    }

    /**
     * Load HTML template from file and replace placeholders
     */
    loadTemplate(templateName, replacements) {
        const templatePath = path.join(this.context.extensionPath, 'src', 'welcome', `${templateName}.html`);
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
            vscode.Uri.file(path.join(this.context.extensionPath, 'src', 'welcome', 'style.css'))
        );
        const fontAwesomeUri = this.panel.webview.asWebviewUri(
            vscode.Uri.file(path.join(this.context.extensionPath, 'src', 'welcome', 'assets', 'fontawesome', 'all.min.css'))
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
     * Get wizard HTML
     */
    getWizardHtml() {
        const locale = this.getLocale();
        const styleUri = this.wizardPanel.webview.asWebviewUri(
            vscode.Uri.file(path.join(this.context.extensionPath, 'src', 'welcome', 'style.css'))
        );
        const fontAwesomeUri = this.wizardPanel.webview.asWebviewUri(
            vscode.Uri.file(path.join(this.context.extensionPath, 'src', 'welcome', 'assets', 'fontawesome', 'all.min.css'))
        );
        const wizardJsUri = this.wizardPanel.webview.asWebviewUri(
            vscode.Uri.file(path.join(this.context.extensionPath, 'src', 'welcome', 'wizard.js'))
        );
        
        let html = this.loadTemplate('wizard', {
            'locale': locale,
            'wizard.title': localize('wizard.title'),
            'wizard.subtitle': localize('wizard.subtitle'),
            'wizard.firmwarePath': localize('wizard.firmwarePath'),
            'wizard.firmwarePath.placeholder': localize('wizard.firmwarePath.placeholder'),
            'wizard.browse': localize('wizard.browse'),
            'wizard.detectedPaths': localize('wizard.detectedPaths'),
            'wizard.searchingPaths': localize('wizard.searchingPaths'),
            'wizard.buildCommands': localize('wizard.buildCommands'),
            'wizard.selectScriptFile': localize('wizard.selectScriptFile'),
            'wizard.or': localize('wizard.or'),
            'wizard.addManualCommand': localize('wizard.addManualCommand'),
            'wizard.gitBashPath': localize('wizard.gitBashPath'),
            'wizard.gitBashPath.placeholder': localize('wizard.gitBashPath.placeholder'),
            'wizard.gitBashPath.optional': localize('wizard.gitBashPath.optional'),
            'wizard.prev': localize('wizard.prev'),
            'wizard.next': localize('wizard.next'),
            'wizard.cancel': localize('wizard.cancel')
        });
        
        // Replace CSS and JS placeholders with webview URIs
        html = html.replace('href="{{style.css}}"', `href="${styleUri}"`);
        html = html.replace('href="{{fontawesome.css}}"', `href="${fontAwesomeUri}"`);
        html = html.replace('src="{{wizard.js}}"', `src="${wizardJsUri}"`);
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
}

module.exports = { WelcomeWebviewManager };
