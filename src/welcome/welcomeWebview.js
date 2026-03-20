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
                retainContextWhenHidden: true
            }
        );

        this.wizardPanel.webview.html = this.getWizardHtml();

        // Handle messages from webview
        this.wizardPanel.webview.onDidReceiveMessage(
            async message => {
                switch (message.command) {
                    case 'selectFirmwarePath':
                        const folderUri = await vscode.window.showOpenDialog({
                            canSelectFiles: false,
                            canSelectFolders: true,
                            canSelectMany: false,
                            openLabel: localize('selectFirmwareDir')
                        });
                        if (folderUri && folderUri.length > 0) {
                            this.wizardPanel.webview.postMessage({
                                command: 'firmwarePathSelected',
                                path: folderUri[0].fsPath
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
     * Get welcome page HTML
     */
    getWelcomeHtml() {
        const locale = this.getLocale();
        
        return `<!DOCTYPE html>
<html lang="${locale}">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>${localize('welcome.title')}</title>
    <style>
        * {
            margin: 0;
            padding: 0;
            box-sizing: border-box;
        }
        body {
            font-family: var(--vscode-font-family);
            font-size: var(--vscode-font-size);
            color: var(--vscode-foreground);
            background: var(--vscode-editor-background);
            line-height: 1.6;
            padding: 40px;
            max-width: 800px;
            margin: 0 auto;
        }
        .header {
            text-align: center;
            margin-bottom: 40px;
        }
        .header h1 {
            font-size: 2em;
            margin-bottom: 10px;
            color: var(--vscode-textLink-foreground);
        }
        .header p {
            color: var(--vscode-descriptionForeground);
        }
        .features {
            display: grid;
            grid-template-columns: repeat(auto-fit, minmax(250px, 1fr));
            gap: 20px;
            margin-bottom: 40px;
        }
        .feature-card {
            background: var(--vscode-editor-inactiveSelectionBackground);
            border-radius: 8px;
            padding: 20px;
            border: 1px solid var(--vscode-panel-border);
        }
        .feature-card h3 {
            margin-bottom: 10px;
            color: var(--vscode-textLink-foreground);
        }
        .feature-card p {
            color: var(--vscode-descriptionForeground);
            font-size: 0.9em;
        }
        .actions {
            display: flex;
            gap: 10px;
            justify-content: center;
            flex-wrap: wrap;
            margin-bottom: 30px;
        }
        .btn {
            padding: 10px 20px;
            border: none;
            border-radius: 4px;
            cursor: pointer;
            font-size: 14px;
            transition: opacity 0.2s;
        }
        .btn:hover {
            opacity: 0.8;
        }
        .btn-primary {
            background: var(--vscode-button-background);
            color: var(--vscode-button-foreground);
        }
        .btn-secondary {
            background: var(--vscode-button-secondaryBackground);
            color: var(--vscode-button-secondaryForeground);
        }
        .shortcuts {
            background: var(--vscode-editor-inactiveSelectionBackground);
            border-radius: 8px;
            padding: 20px;
            margin-bottom: 30px;
        }
        .shortcuts h3 {
            margin-bottom: 15px;
        }
        .shortcut-item {
            display: flex;
            justify-content: space-between;
            padding: 8px 0;
            border-bottom: 1px solid var(--vscode-panel-border);
        }
        .shortcut-item:last-child {
            border-bottom: none;
        }
        .key {
            background: var(--vscode-keybindingLabel-background);
            padding: 2px 8px;
            border-radius: 3px;
            font-family: monospace;
        }
        .footer {
            text-align: center;
            color: var(--vscode-descriptionForeground);
            font-size: 0.9em;
        }
        .footer a {
            color: var(--vscode-textLink-foreground);
            cursor: pointer;
        }
    </style>
</head>
<body>
    <div class="header">
        <h1>${localize('welcome.header')}</h1>
        <p>${localize('welcome.subtitle')}</p>
    </div>

    <div class="features">
        <div class="feature-card">
            <h3>$(arrow-circle-down) ${localize('welcome.feature.download')}</h3>
            <p>${localize('welcome.feature.download.desc')}</p>
        </div>
        <div class="feature-card">
            <h3>$(coffee) ${localize('welcome.feature.build')}</h3>
            <p>${localize('welcome.feature.build.desc')}</p>
        </div>
        <div class="feature-card">
            <h3>$(plug) ${localize('welcome.feature.device')}</h3>
            <p>${localize('welcome.feature.device.desc')}</p>
        </div>
    </div>

    <div class="actions">
        <button class="btn btn-primary" onclick="openWizard()">${localize('welcome.startWizard')}</button>
        <button class="btn btn-secondary" onclick="openSettings()">${localize('welcome.openSettings')}</button>
        <button class="btn btn-secondary" onclick="closeWelcome()">${localize('welcome.close')}</button>
    </div>

    <div class="shortcuts">
        <h3>${localize('welcome.shortcuts')}</h3>
        <div class="shortcut-item">
            <span>${localize('command.build')}</span>
            <span class="key">Ctrl+Shift+B</span>
        </div>
        <div class="shortcut-item">
            <span>${localize('command.download')}</span>
            <span class="key">Ctrl+Shift+D</span>
        </div>
        <div class="shortcut-item">
            <span>${localize('command.refresh')}</span>
            <span class="key">Ctrl+Shift+R</span>
        </div>
    </div>

    <div class="footer">
        <p>${localize('welcome.footer')} <a onclick="dontShowAgain()">${localize('welcome.dontShowAgain')}</a></p>
    </div>

    <script>
        const vscode = acquireVsCodeApi();

        function openWizard() {
            vscode.postMessage({ command: 'openWizard' });
        }

        function openSettings() {
            vscode.postMessage({ command: 'openSettings' });
        }

        function closeWelcome() {
            vscode.postMessage({ command: 'close' });
        }

        function dontShowAgain() {
            vscode.postMessage({ command: 'dontShowAgain' });
        }
    </script>
</body>
</html>`;
    }

    /**
     * Get wizard HTML
     */
    getWizardHtml() {
        const locale = this.getLocale();
        
        return `<!DOCTYPE html>
<html lang="${locale}">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>${localize('wizard.title')}</title>
    <style>
        * {
            margin: 0;
            padding: 0;
            box-sizing: border-box;
        }
        body {
            font-family: var(--vscode-font-family);
            font-size: var(--vscode-font-size);
            color: var(--vscode-foreground);
            background: var(--vscode-editor-background);
            line-height: 1.6;
            padding: 40px;
            max-width: 600px;
            margin: 0 auto;
        }
        .header {
            text-align: center;
            margin-bottom: 30px;
        }
        .header h1 {
            font-size: 1.5em;
            margin-bottom: 10px;
        }
        .step-indicator {
            display: flex;
            justify-content: center;
            gap: 10px;
            margin-bottom: 30px;
        }
        .step {
            width: 30px;
            height: 30px;
            border-radius: 50%;
            background: var(--vscode-editor-inactiveSelectionBackground);
            display: flex;
            align-items: center;
            justify-content: center;
            font-weight: bold;
        }
        .step.active {
            background: var(--vscode-textLink-foreground);
            color: white;
        }
        .step.completed {
            background: var(--vscode-testing-iconPassed);
            color: white;
        }
        .step-content {
            display: none;
        }
        .step-content.active {
            display: block;
        }
        .form-group {
            margin-bottom: 20px;
        }
        .form-group label {
            display: block;
            margin-bottom: 8px;
            font-weight: 500;
        }
        .form-group input {
            width: 100%;
            padding: 8px 12px;
            border: 1px solid var(--vscode-panel-border);
            border-radius: 4px;
            background: var(--vscode-input-background);
            color: var(--vscode-input-foreground);
            font-family: var(--vscode-font-family);
        }
        .form-group input:focus {
            outline: none;
            border-color: var(--vscode-focusBorder);
        }
        .path-selector {
            display: flex;
            gap: 10px;
        }
        .path-selector input {
            flex: 1;
        }
        .btn {
            padding: 8px 16px;
            border: none;
            border-radius: 4px;
            cursor: pointer;
            font-size: 14px;
            transition: opacity 0.2s;
        }
        .btn:hover {
            opacity: 0.8;
        }
        .btn-primary {
            background: var(--vscode-button-background);
            color: var(--vscode-button-foreground);
        }
        .btn-secondary {
            background: var(--vscode-button-secondaryBackground);
            color: var(--vscode-button-secondaryForeground);
        }
        .actions {
            display: flex;
            justify-content: space-between;
            margin-top: 30px;
            padding-top: 20px;
            border-top: 1px solid var(--vscode-panel-border);
        }
        .command-list {
            margin-top: 10px;
        }
        .command-item {
            display: flex;
            gap: 10px;
            margin-bottom: 10px;
            align-items: center;
        }
        .command-item input {
            flex: 1;
        }
        .command-item .btn-remove {
            padding: 4px 8px;
            background: var(--vscode-errorForeground);
            color: white;
        }
        .btn-add {
            margin-top: 10px;
            width: 100%;
        }
        .summary-item {
            padding: 10px;
            background: var(--vscode-editor-inactiveSelectionBackground);
            border-radius: 4px;
            margin-bottom: 10px;
        }
        .summary-item label {
            font-weight: bold;
            display: block;
            margin-bottom: 5px;
        }
        .summary-item span {
            color: var(--vscode-descriptionForeground);
        }
    </style>
</head>
<body>
    <div class="header">
        <h1>${localize('wizard.title')}</h1>
        <p>${localize('wizard.subtitle')}</p>
    </div>

    <div class="step-indicator">
        <div class="step active" id="step1-indicator">1</div>
        <div class="step" id="step2-indicator">2</div>
        <div class="step" id="step3-indicator">3</div>
        <div class="step" id="step4-indicator">4</div>
    </div>

    <!-- Step 1: Firmware Path -->
    <div class="step-content active" id="step1">
        <div class="form-group">
            <label>${localize('wizard.firmwarePath')}</label>
            <div class="path-selector">
                <input type="text" id="firmwarePath" placeholder="${localize('wizard.firmwarePath.placeholder')}" readonly>
                <button class="btn btn-secondary" onclick="selectFirmwarePath()">${localize('wizard.browse')}</button>
            </div>
        </div>
    </div>

    <!-- Step 2: Build Commands -->
    <div class="step-content" id="step2">
        <div class="form-group">
            <label>${localize('wizard.buildCommands')}</label>
            <div class="command-list" id="commandList">
                <div class="command-item">
                    <input type="text" placeholder="${localize('wizard.commandName')}" class="cmd-name">
                    <input type="text" placeholder="${localize('wizard.commandValue')}" class="cmd-value">
                </div>
            </div>
            <button class="btn btn-secondary btn-add" onclick="addCommand()">+ ${localize('wizard.addCommand')}</button>
        </div>
    </div>

    <!-- Step 3: Git Bash Path -->
    <div class="step-content" id="step3">
        <div class="form-group">
            <label>${localize('wizard.gitBashPath')}</label>
            <div class="path-selector">
                <input type="text" id="gitBashPath" placeholder="${localize('wizard.gitBashPath.placeholder')}" readonly>
                <button class="btn btn-secondary" onclick="selectGitBashPath()">${localize('wizard.browse')}</button>
            </div>
            <small style="color: var(--vscode-descriptionForeground);">${localize('wizard.gitBashPath.optional')}</small>
        </div>
    </div>

    <!-- Step 4: Summary -->
    <div class="step-content" id="step4">
        <div id="summary">
            <div class="summary-item">
                <label>${localize('wizard.firmwarePath')}</label>
                <span id="summary-firmwarePath">-</span>
            </div>
            <div class="summary-item">
                <label>${localize('wizard.buildCommands')}</label>
                <span id="summary-buildCommands">-</span>
            </div>
            <div class="summary-item">
                <label>${localize('wizard.gitBashPath')}</label>
                <span id="summary-gitBashPath">-</span>
            </div>
        </div>
    </div>

    <div class="actions">
        <button class="btn btn-secondary" id="btn-prev" onclick="prevStep()" disabled>${localize('wizard.prev')}</button>
        <div>
            <button class="btn btn-secondary" onclick="closeWizard()">${localize('wizard.cancel')}</button>
            <button class="btn btn-primary" id="btn-next" onclick="nextStep()">${localize('wizard.next')}</button>
        </div>
    </div>

    <script>
        const vscode = acquireVsCodeApi();
        let currentStep = 1;
        const totalSteps = 4;

        // Handle messages from extension
        window.addEventListener('message', event => {
            const message = event.data;
            switch (message.command) {
                case 'firmwarePathSelected':
                    document.getElementById('firmwarePath').value = message.path;
                    break;
                case 'gitBashPathSelected':
                    document.getElementById('gitBashPath').value = message.path;
                    break;
            }
        });

        function selectFirmwarePath() {
            vscode.postMessage({ command: 'selectFirmwarePath' });
        }

        function selectGitBashPath() {
            vscode.postMessage({ command: 'selectGitBashPath' });
        }

        function addCommand() {
            const list = document.getElementById('commandList');
            const item = document.createElement('div');
            item.className = 'command-item';
            item.innerHTML = \`
                <input type="text" placeholder="${localize('wizard.commandName')}" class="cmd-name">
                <input type="text" placeholder="${localize('wizard.commandValue')}" class="cmd-value">
                <button class="btn btn-remove" onclick="removeCommand(this)">-</button>
            \`;
            list.appendChild(item);
        }

        function removeCommand(btn) {
            btn.parentElement.remove();
        }

        function nextStep() {
            if (currentStep < totalSteps) {
                if (currentStep === totalSteps - 1) {
                    // Update summary before showing last step
                    updateSummary();
                    document.getElementById('btn-next').textContent = '${localize('wizard.finish')}';
                }
                if (currentStep === totalSteps) {
                    saveConfig();
                    return;
                }
                document.getElementById(\`step\${currentStep}\`).classList.remove('active');
                document.getElementById(\`step\${currentStep}-indicator\`).classList.remove('active');
                document.getElementById(\`step\${currentStep}-indicator\`).classList.add('completed');
                currentStep++;
                document.getElementById(\`step\${currentStep}\`).classList.add('active');
                document.getElementById(\`step\${currentStep}-indicator\`).classList.add('active');
                document.getElementById('btn-prev').disabled = false;
            } else {
                saveConfig();
            }
        }

        function prevStep() {
            if (currentStep > 1) {
                document.getElementById(\`step\${currentStep}\`).classList.remove('active');
                document.getElementById(\`step\${currentStep}-indicator\`).classList.remove('active');
                currentStep--;
                document.getElementById(\`step\${currentStep}\`).classList.add('active');
                document.getElementById(\`step\${currentStep}-indicator\`).classList.remove('completed');
                document.getElementById(\`step\${currentStep}-indicator\`).classList.add('active');
                document.getElementById('btn-prev').disabled = currentStep === 1;
                document.getElementById('btn-next').textContent = '${localize('wizard.next')}';
            }
        }

        function updateSummary() {
            document.getElementById('summary-firmwarePath').textContent = 
                document.getElementById('firmwarePath').value || '${localize('wizard.notSet')}';
            
            const commands = [];
            document.querySelectorAll('.command-item').forEach(item => {
                const name = item.querySelector('.cmd-name').value;
                const value = item.querySelector('.cmd-value').value;
                if (name && value) {
                    commands.push(\`\${name}: \${value}\`);
                }
            });
            document.getElementById('summary-buildCommands').textContent = 
                commands.length > 0 ? commands.join(', ') : '${localize('wizard.notSet')}';
            
            document.getElementById('summary-gitBashPath').textContent = 
                document.getElementById('gitBashPath').value || '${localize('wizard.notSet')}';
        }

        function saveConfig() {
            const config = {
                firmwarePath: document.getElementById('firmwarePath').value,
                buildCommands: [],
                gitBashPath: document.getElementById('gitBashPath').value
            };

            document.querySelectorAll('.command-item').forEach(item => {
                const name = item.querySelector('.cmd-name').value;
                const value = item.querySelector('.cmd-value').value;
                if (name && value) {
                    config.buildCommands.push({ name, command: value });
                }
            });

            vscode.postMessage({ command: 'saveConfig', config });
        }

        function closeWizard() {
            vscode.postMessage({ command: 'close' });
        }
    </script>
</body>
</html>`;
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
