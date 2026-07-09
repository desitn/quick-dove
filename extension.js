/**
* @description: Quick Dove 
*  A tool for building and syncing firmware in a developer-friendly way.
* @author: destin.zhang@quectel.com
*/

const vscode = require('vscode');
const path = require('path');
const fs = require('fs');
const iconv = require('iconv-lite');
const { spawn, spawnSync } = require('child_process');
const { localize } = require('./src/localization');
const { WebviewManager } = require('./src/webview/webviewManager');
const { LogViewerManager } = require('./src/webview/logViewer/logViewerManager');
const { configManager } = require('./src/config/configManager');

/** @note dove executable path */
const FIRMWARE_CLI = 'dove.exe';

const output_chan = vscode.window.createOutputChannel('Quick Dove');
const alert = localize('noFirmware');

/**
 * Get configuration from config manager
 * @returns {Object} Configuration object
 */
function get_configuration() {
    return configManager.getConfig();
}

/**
 * Write .dove/dove.json configuration file
 * All fields including extension are managed by configManager
 * This function syncs configManager's config to file
 */
function writeFirmwareCliConfig(config) {
    const configPath = configManager.getConfigPath();
    if (!configPath) return;

    // Write all fields including extension
    const configToWrite = {
        workspacePath: config.workspacePath ?? '',
        firmwarePath: config.firmwarePath ?? '',
        buildCommands: config.buildCommands ?? [],
        buildGitBashPath: config.buildGitBashPath ?? '',
        comPorts: config.comPorts ?? [],
        theme: config.theme ?? { color: 'blue' },
        extension: config.extension ?? { language: 'auto', themeMode: 'auto' }
    };

    const newContent = JSON.stringify(configToWrite, null, 2);
    try {
        if (fs.existsSync(configPath)) {
            const existingContent = fs.readFileSync(configPath, 'utf8');
            if (existingContent === newContent) return;
        }
        fs.writeFileSync(configPath, newContent);
        output_chan.appendLine(localize('configurationWritten', configPath));
    } catch (error) {
        output_chan.appendLine(localize('failedToWriteConfig', error.message));
    }
}

function is_windows() {
    return process.platform === 'win32';
}

function is_remote_ssh() {
    return vscode.env.remoteName === 'ssh-remote';
}

function not_support_disp() {
    vscode.window.showErrorMessage(alert);
}

/**
 * Setup environment variables for VSCode terminals
 * This uses VSCode's environmentVariableCollection API to make dove
 * immediately available in all new terminals without restarting VSCode
 * @param {vscode.ExtensionContext} context - Extension context
 */
function setupTerminalEnvironment(context) {
    const doveDir = path.join(context.extensionPath, 'dove');

    // Check if dove.exe exists
    if (fs.existsSync(path.join(doveDir, 'dove.exe'))) {
        // Prepend dove to PATH (highest priority) - affects all new terminals
        context.environmentVariableCollection.prepend('PATH', doveDir + ';');

        // Set DOVE_PATH for skill integration
        context.environmentVariableCollection.replace('DOVE_PATH', doveDir);

        output_chan.appendLine(`[Terminal Environment] dove path added: ${doveDir}`);
    } else {
        output_chan.appendLine('[Terminal Environment] dove.exe not found, skipping PATH setup');
    }
}

/**
 * Get dove executable path
 * @param {vscode.ExtensionContext} context - Extension context
 * @returns {string|null} Path to dove.exe or null if not found
 */
function getFirmwareCliPath(context) {
    if (!context || !context.extensionPath) {
        return null;
    }
    const firmwareCliPath = path.join(context.extensionPath, 'dove', 'dove.exe');
    if (fs.existsSync(firmwareCliPath)) {
        return firmwareCliPath;
    }
    return null;
}

class FirmwareTreeDataProvider {
    constructor(context) {
        this.context = context;
        this._onDidChangeTreeData = new vscode.EventEmitter();
        this.onDidChangeTreeData = this._onDidChangeTreeData.event;
        this.refresh();
    }

    refresh() {
        this._onDidChangeTreeData.fire();
    }

    getTreeItem(element) {
        return element;
    }

    getChildren(element) {
        if (!element) {
            return this.getFirmwareRootItems();
        } else {
            return element.children || [];
        }
    }

    getFirmwareRootItems() {
        const items = [];
        const config = get_configuration();
        const firmwarePath = config.firmwarePath;
        
        // Try to use dove to list firmware
        try {
            const firmwareCliPath = getFirmwareCliPath(this.context);
            if (firmwareCliPath) {
                // Use configManager's path (matches dove's findConfigPath priority)
                const configPath = configManager.getConfigPath();
                const env = { ...process.env };
                if (configPath) {
                    env.FIRMWARE_CLI_CONFIG = configPath;
                }
                const result = spawnSync(firmwareCliPath, ['flash', '--list'], {
                    shell: true,
                    encoding: 'utf8',
                    timeout: 5000,
                    env: env
                });
                
                if (result.status === 0 && result.stdout) {
                    try {
                        output_chan.appendLine(result.stdout);
                        const data = JSON.parse(result.stdout);
                        if (data.firmwares && data.firmwares.length > 0) {
                            // Group by directory
                            const dirMap = new Map();
                            for (const fw of data.firmwares) {
                                const dir = path.dirname(fw.path);
                                if (!dirMap.has(dir)) {
                                    dirMap.set(dir, []);
                                }
                                dirMap.get(dir).push(fw);
                            }
                            
                            for (const [dirPath, firmwares] of dirMap) {
                                const dirName = path.basename(dirPath);
                                const firmwareFiles = firmwares.map(fw => 
                                    new FirmwareFileItem(fw.name, fw.path, vscode.TreeItemCollapsibleState.None)
                                );
                                const time = firmwares[0].time ? new Date(firmwares[0].time) : new Date();
                                items.push(new FirmwareItem(dirName, dirPath, time, vscode.TreeItemCollapsibleState.Collapsed, firmwareFiles));
                            }
                            
                            if (items.length > 0) {
                                return items;
                            }
                        }
                    } catch (e) {
                        console.error('JSON parsing error:', e);
                    }
                }
            }
        } catch (e) {
            console.error('dove list error:', e);
        }
        
        output_chan.appendLine("fall_back firmware list!");
        // Fallback: check configured firmwarePath
        if (firmwarePath && firmwarePath.length > 0) {
            if (fs.existsSync(firmwarePath)) {
                const stat = fs.statSync(firmwarePath);
                if (stat.isDirectory()) {
                    const dir = path.basename(firmwarePath);
                    const time = stat.mtime;

                    // 1. Scan firmwarePath itself for firmware files
                    let firmware_files = this.getFirmwareFiles(firmwarePath);

                    if (firmware_files.length > 0) {
                        items.push(new FirmwareItem(dir, firmwarePath, time, vscode.TreeItemCollapsibleState.Collapsed, firmware_files));
                        return items;
                    }

                    // 2. If no files directly, check firmwarePath/quectel_build/release/
                    const release_path = path.join(firmwarePath, 'quectel_build', 'release');
                    if (fs.existsSync(release_path)) {
                        const release_dirs = fs.readdirSync(release_path);
                        for (const subdir of release_dirs) {
                            const subdir_path = path.join(release_path, subdir);
                            if (fs.statSync(subdir_path).isDirectory()) {
                                const sub_firmware_files = this.getFirmwareFiles(subdir_path);
                                if (sub_firmware_files.length > 0) {
                                    const sub_time = fs.statSync(subdir_path).mtime;
                                    items.push(new FirmwareItem(subdir, subdir_path, sub_time, vscode.TreeItemCollapsibleState.Collapsed, sub_firmware_files));
                                }
                            }
                        }
                        if (items.length > 0) {
                            return items;
                        }
                    }
                }
            }
            // firmwarePath configured but no firmware found → fall through to workspace check
        }
        const workspace_folders = vscode.workspace.workspaceFolders;
        if (workspace_folders && workspace_folders.length > 0) {
            for (const folder of workspace_folders) {
                // If firmware path is not configured, check quectel_build/release directory in workspace
                const release_path = path.join(folder.uri.fsPath, 'quectel_build', 'release');
                if (fs.existsSync(release_path)) {
                    const release_dirs = fs.readdirSync(release_path);
                    for (const dir of release_dirs) {
                        const dir_path = path.join(release_path, dir);
                        if (fs.statSync(dir_path).isDirectory()) {
                            const firmware_files = this.getFirmwareFiles(dir_path);
                            const time = fs.statSync(dir_path).mtime;
                            const item = new FirmwareItem(dir, dir_path, time, vscode.TreeItemCollapsibleState.Collapsed, firmware_files);
                            items.push(item);
                        }
                    }
                }  
                
            }
        }

        if (items.length === 0) {
            items.push(new InfoItem(localize('firmwareNotFound'), '', vscode.TreeItemCollapsibleState.None));
        }

        return items;
    }

    getFirmwareFiles(dir_path) {
        const files = fs.readdirSync(dir_path);
        const firmware_files = [];

        for (const file of files) {
            const file_path = path.join(dir_path, file);
            const stat = fs.statSync(file_path);
            if (stat.isFile() && this.isFirmwareFile(file)) {
                firmware_files.push(new FirmwareFileItem(file, file_path, vscode.TreeItemCollapsibleState.None));
            }
        }

        return firmware_files;
    }

    isFirmwareFile(filename) {
        const lower_filename = filename.toLowerCase();
        return lower_filename.endsWith('_fbf.bin') || 
               lower_filename.endsWith('.pac') || 
               lower_filename.endsWith('.zip') || 
               lower_filename.endsWith('download_usb.ini');
    }
}

class FirmwareItem extends vscode.TreeItem {
    constructor(label, path, time, collapsibleState, children) {
        super(label, collapsibleState);
        this.path = path;
        this.description = `${time.toLocaleString()}`;
        this.children = children;
        this.tooltip = localize('copyPath');
        this.contextValue = 'copy-path';
        this.command = {
            command: 'firmwareDownloader.copyPath',
            title: localize('copyPath'),
            arguments: [vscode.Uri.file(path)]
        };
        this.iconPath = new vscode.ThemeIcon('folder');
    }
}

class FirmwareFileItem extends vscode.TreeItem {
    constructor(label, path, collapsibleState) {
        super(label, collapsibleState);
        this.path = path;
        
        this.tooltip = localize('clickToDownload');
        this.command = {
            command: 'firmwareDownloader.download',
            title: localize('command.download'),
            arguments: [vscode.Uri.file(path)]
        };
        this.iconPath = new vscode.ThemeIcon('file-binary');
        this.contextValue = 'firmware-file';
    }
}

class InfoItem extends vscode.TreeItem {
    constructor(label, description, collapsibleState) {
        super(label, collapsibleState);
        this.description = description;
        this.iconPath = new vscode.ThemeIcon('info');
    }
}

class DeviceTreeDataProvider {
    constructor(context) {
        this.context = context;
        this._onDidChangeTreeData = new vscode.EventEmitter();
        this.onDidChangeTreeData = this._onDidChangeTreeData.event;
        this.devices = [];
        this.refresh();
        this.filter_filled = false;
        this.isAutoRefreshEnabled = false;
        this.autoRefreshIntervalId = null;
        this.refreshIntervalMs = 20000; // 20 seconds refresh interval
    }

    refresh() {
        this._onDidChangeTreeData.fire();
    }

    // Start auto-refresh
    startAutoRefresh() {
        if (this.autoRefreshIntervalId) {
            clearInterval(this.autoRefreshIntervalId);
        }
        this.isAutoRefreshEnabled = true;
        this.autoRefreshIntervalId = setInterval(() => {
            this.refresh();
        }, this.refreshIntervalMs);
    }

    // Stop auto-refresh
    stopAutoRefresh() {
        if (this.autoRefreshIntervalId) {
            clearInterval(this.autoRefreshIntervalId);
            this.autoRefreshIntervalId = null;
        }
        this.isAutoRefreshEnabled = false;
    }

    getTreeItem(element) {
        return element;
    }

    getChildren(element) {
        if (!element) {
            return this.getDeviceRootItems();
        } else {
            return element.children || [];
        }
    }

    async getDeviceRootItems() {
        try {
            const items = [];
            
            if (is_windows()) {
                // Get dove path
                const firmwareCliPath = getFirmwareCliPath(this.context);
                if (!firmwareCliPath) {
                    return [new InfoItem(localize('noDeviceFound'), 'dove not found', vscode.TreeItemCollapsibleState.None)];
                }

                return new Promise((resolve) => {
                    // Use configManager's path (matches dove's findConfigPath priority)
                    const configPath = configManager.getConfigPath();
                    const env = { ...process.env };
                    if (configPath) {
                        env.FIRMWARE_CLI_CONFIG = configPath;
                    }
                    const child = spawn(firmwareCliPath, ['port', 'list'], {
                        env: env
                    });
                    let output = '';
                    let errorOutput = '';
                    
                    child.stdout.on('data', (data) => {
                        output += data.toString('utf8');
                    });
                    
                    child.stderr.on('data', (data) => {
                        errorOutput += data.toString('utf8');
                    });
                    
                    child.on('close', (code) => {
                        if (code === 0) {
                            try {
                                output_chan.appendLine(output);
                                const result = JSON.parse(output);
                                if (result.ports && result.ports.length > 0) {
                                    for (const port of result.ports) {
                                        items.push(new DeviceItem(
                                            port.path,
                                            port.friendlyName || '',
                                            vscode.TreeItemCollapsibleState.None
                                        ));
                                    }
                                    resolve(items);
                                } else {
                                    resolve([new InfoItem(localize('noDeviceFound'), localize('checkDeviceConnection'), vscode.TreeItemCollapsibleState.None)]);
                                }
                            } catch (e) {
                                // JSON parsing failed
                                console.error('JSON parsing error:', e);
                                resolve([new InfoItem(localize('noDeviceFound'), localize('checkDeviceConnection'), vscode.TreeItemCollapsibleState.None)]);
                            }
                        } else {
                            // If dove fails
                            console.error('dove devices failed:', errorOutput);
                            resolve([new InfoItem(localize('noDeviceFound'), localize('checkDeviceConnection'), vscode.TreeItemCollapsibleState.None)]);
                        }
                    });
                });
            } else {
                // Non-Windows systems
                return [new InfoItem(localize('noDeviceFound'), '', vscode.TreeItemCollapsibleState.None)];
            }
        } catch (error) {
            console.error('Error getting device list:', error);
            return [new InfoItem(localize('noDeviceFound'), error.message, vscode.TreeItemCollapsibleState.None)];
        }
    }
    
}

class DeviceItem extends vscode.TreeItem {
    constructor(label, description, collapsibleState) {
        super(label, collapsibleState);
        this.description = description;
        this.tooltip = localize('deviceInfo');
        this.iconPath = new vscode.ThemeIcon('plug');
    }
}

class SettingsTreeDataProvider {
    constructor() {
        this._onDidChangeTreeData = new vscode.EventEmitter();
        this.onDidChangeTreeData = this._onDidChangeTreeData.event;
    }
    refresh() {
        this._onDidChangeTreeData.fire();
    }
    getTreeItem(element) {
        return element;
    }
    getChildren(element) {
        if (!element) {
            return this.getSettingsItems();
        }
        return [];
    }
    getSettingsItems() {
        const items = [];
        
        // Add Welcome page entry
        items.push(new SettingsItem(localize('view.showWelcome'), '', vscode.TreeItemCollapsibleState.None, 'show-welcome'));
        // Plugin Settings entry
        items.push(new SettingsItem(localize('view.pluginSettings'), '', vscode.TreeItemCollapsibleState.None, 'firmware-settings'));
        
        return items;
    }
}

class SettingsItem extends vscode.TreeItem {
    constructor(label, description, collapsibleState, type, data = null) {
        super(label, collapsibleState);
        this.description = description;
        this.tooltip     = description;
        this.type        = type;
        this.data        = data;

        switch(type) {
            case 'show-welcome':
                this.iconPath = new vscode.ThemeIcon('home');
                this.command = {
                    command: 'firmwareDownloader.showWelcome',
                    title: localize('view.showWelcome'),
                    arguments: []
                };
                break;
            case 'show-wizard':
                this.iconPath = new vscode.ThemeIcon('wand');
                this.command = {
                    command: 'firmwareDownloader.showSetupWizard',
                    title: localize('view.showSetupWizard'),
                    arguments: []
                };
                break;
            case 'separator':
                // Separator item - no icon, no command
                break;
            case 'firmware-settings':
                this.iconPath = new vscode.ThemeIcon('gear');
                this.command = {
                        command: 'firmwareDownloader.settings',
                        title: localize('view.settings'),
                        arguments: []
                };
                break;
        }
    }
}

class PortableToolsTreeDataProvider {
    constructor() {
        this._onDidChangeTreeData = new vscode.EventEmitter();
        this.onDidChangeTreeData = this._onDidChangeTreeData.event;
    }
    refresh() {
        this._onDidChangeTreeData.fire();
    }
    getTreeItem(element) {
        return element;
    }
    getChildren(element) {
        if (!element) {
            return this.getPortableToolsItems();
        }
        return [];
    }
    getPortableToolsItems() {
        const items = [];
        
        // Add Search panel entry
        items.push(new PortableToolItem(localize('view.search'), '', vscode.TreeItemCollapsibleState.None, 'search'));
        
        // Add Log Viewer entry
        items.push(new PortableToolItem(localize('view.logViewer'), '', vscode.TreeItemCollapsibleState.None, 'log-viewer'));
        
        return items;
    }
}

class PortableToolItem extends vscode.TreeItem {
    constructor(label, description, collapsibleState, type, data = null) {
        super(label, collapsibleState);
        this.description = description;
        this.tooltip     = description;
        this.type        = type;
        this.data        = data;

        switch(type) {
            case 'search':
                this.iconPath = new vscode.ThemeIcon('search');
                this.command = {
                    command: 'firmwareDownloader.showSearch',
                    title: localize('view.search'),
                    arguments: []
                };
                break;
            case 'log-viewer':
                this.iconPath = new vscode.ThemeIcon('file-text');
                this.command = {
                    command: 'firmwareDownloader.openLogViewer',
                    title: localize('view.logViewer'),
                    arguments: []
                };
                break;
        }
    }
}

class progress_tracker 
{
    constructor(status_bar_dl) {
        this.status_bar_dl = status_bar_dl;
        this.current_progress = 0;
    }
    
    update_progress(progress) {
        if (progress !== null && !isNaN(progress)) {
            this.current_progress = progress;
            this.status_bar_dl.text = `${this.get_progress_bar(5)}`;
        }
    }
    
    get_progress_bar(barLength) {
        const filledLength = Math.floor(this.current_progress / 100 * barLength);
        const decimalPart = (this.current_progress / 100 * barLength) % 1;
        const emptyLength = barLength - filledLength;
        let filled = '';
        if (filledLength > 0) {
            filled = '⣿'.repeat(filledLength);
        }
        let partial = '';
        if (decimalPart > 0) {
            if (decimalPart < 0.25) {
                partial = '⣀';
            } else if (decimalPart < 0.5) {
                partial = '⣄';
            } else if (decimalPart < 0.75) {
                partial = '⣤';
            } else {
                partial = '⣶';
            }
        }
        const empty = '⣀'.repeat(emptyLength - (partial ? 1 : 0));
        return `${filled}${partial}${empty}`;
    }
    
    reset() {
        this.current_progress = 0;
    }
}


function kill_process_tree(child_process, signal = 'SIGKILL') {
    return new Promise((resolve, reject) => {
        if (!child_process || !child_process.pid) {
            resolve();
            return;
        }
        if (is_windows()) {
            // Use taskkill on Windows system
            const taskkill = spawn('taskkill', ['/PID', child_process.pid, '/T', '/F'], { shell: true });
            taskkill.on('close', (code) => {
                if (code === 0 || code === 128) {
                    resolve();
                } else {
                    reject(new Error(`taskkill failed with code ${code}`));
                }
            });
            taskkill.on('error', (error) => {
                reject(error);
            });
        } else {
            try {
                child_process.kill(signal);
                resolve();
            } catch (error) {
                reject(error);
            }
        }
    });
}

function activate(context)
{
    // Add dove to VSCode terminal PATH for immediate effect
    // This makes dove command available in all new VSCode terminals
    setupTerminalEnvironment(context);

    // Initialize config manager
    configManager.initialize(context);

    // Listen for config changes and sync with writeFirmwareCliConfig
    configManager.onDidChangeConfig(() => {
        writeFirmwareCliConfig(configManager.getConfig());
    });

    // Initialize dove.json config file on activation
    const config = get_configuration();
    writeFirmwareCliConfig(config);
    
    let last_dl_info = {
        dlPromise: null,
        filePath: '',
        fileName: '',
        toolType: '',
        dlState: 'stop',
        dlChild: null,
        terminal:null
    };

    const status_bar_build   = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Right, 99);
    status_bar_build.text    = "$(coffee)";
    status_bar_build.tooltip = localize('command.build');
    status_bar_build.command = "firmwareDownloader.build";
    status_bar_build.show();

    const status_bar_dl   = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Right, 98);
    status_bar_dl.text    = "$(arrow-circle-down)";
    status_bar_dl.tooltip = localize('command.download');
    status_bar_dl.command = "firmwareDownloader.download";
    status_bar_dl.show();

    const workspace_folders = vscode.workspace.workspaceFolders;
    const firmwareTreeDataProvider = new FirmwareTreeDataProvider(context);
    vscode.window.registerTreeDataProvider('firmware-explorer', firmwareTreeDataProvider);
    
    const settingsTreeDataProvider = new SettingsTreeDataProvider();
    vscode.window.registerTreeDataProvider('firmware-settings', settingsTreeDataProvider);
    
    const deviceTreeDataProvider = new DeviceTreeDataProvider(context);
    vscode.window.registerTreeDataProvider('firmware-devices', deviceTreeDataProvider);
    deviceTreeDataProvider.startAutoRefresh();

    // Initialize portable tools view (search + log viewer)
    const portableToolsTreeDataProvider = new PortableToolsTreeDataProvider();
    vscode.window.registerTreeDataProvider('firmware-tools', portableToolsTreeDataProvider);

    // Initialize webview managers
    const webviewManager = new WebviewManager(context);
    const logViewerManager = new LogViewerManager(context);

    // Show welcome page on first install
    if (webviewManager.shouldShowWelcome()) {
        webviewManager.showWelcome();
    }

    // Settings page can be opened via the settings tree view or welcome page

    // Register welcome commands
    const showWelcomeCommand = vscode.commands.registerCommand('firmwareDownloader.showWelcome', () => {
        webviewManager.showWelcome();
    });

    const refreshFirmwareListCommand = vscode.commands.registerCommand('firmwareDownloader.refresh', () => {
        firmwareTreeDataProvider.refresh();
        settingsTreeDataProvider.refresh();
    });
    
    const refreshDevicesCommand = vscode.commands.registerCommand('firmwareDownloader.devices_refresh', () => {
        deviceTreeDataProvider.refresh();
    });

    const selectFirmwareDirCommand = vscode.commands.registerCommand('firmwareDownloader.find', async () => {
        const options = {
            canSelectFiles: false,
            canSelectFolders: true,
            canSelectMany: false,
            openLabel: localize('selectFirmwareDir'),
            defaultUri: workspace_folders ? vscode.Uri.file(workspace_folders[0].uri.fsPath) : undefined
        };
        const result = await vscode.window.showOpenDialog(options);
        if (result && result.length > 0) {
            const selectedPath = result[0].fsPath;
            configManager.setFirmwarePath(selectedPath);
            writeFirmwareCliConfig(configManager.getConfig());
            vscode.commands.executeCommand('firmwareDownloader.refresh');
        }
    });

    const clearFirmwareDirCommand = vscode.commands.registerCommand('firmwareDownloader.clear', async () => {
        configManager.setFirmwarePath('');
        writeFirmwareCliConfig(configManager.getConfig());
        vscode.commands.executeCommand('firmwareDownloader.refresh');
    });
 
    // Add build command
    const addBuildCommand = vscode.commands.registerCommand('firmwareDownloader.addBuildCommand', async () => {
        // Get command name
        const name = await vscode.window.showInputBox({
            prompt: localize('enterCommandName'),
            placeHolder: 'e.g., Release Build, Debug Build',
            validateInput: (value) => {
                if (!value || value.trim().length === 0) {
                    return localize('commandNameEmpty');
                }
                const buildCommands = configManager.getBuildCommands();
                if (buildCommands.some(cmd => cmd.name === value.trim())) {
                    return localize('commandNameExists');
                }
                return null;
            }
        });

        if (!name) {
            return;
        }

        // Get description (optional)
        const description = await vscode.window.showInputBox({
            prompt: localize('enterCommandDesc') || 'Enter command description',
            placeHolder: 'e.g., Build for production release'
        });

        // Get command
        const command = await vscode.window.showInputBox({
            prompt: localize('enterBuildCommand'),
            placeHolder: localize('enterBuildCommandPlaceholder'),
            validateInput: (value) => {
                if (!value || value.trim().length === 0) {
                    return localize('commandEmpty');
                }
                return null;
            }
        });

        if (!command) {
            return;
        }

        // Save to configuration using addBuildCommand method (handles isActive)
        configManager.addBuildCommand(name.trim(), command.trim(), description ? description.trim() : '');

        writeFirmwareCliConfig(configManager.getConfig());
        vscode.commands.executeCommand('firmwareDownloader.refresh');
        vscode.window.showInformationMessage(localize('commandAdded', name));
    });
    
    // Select build command (from settings view)
    const selectBuildCommand = vscode.commands.registerCommand('firmwareDownloader.selectBuildCommand', async (cmdData) => {
        if (!cmdData) {
            return;
        }

        configManager.setActiveBuildCommand(cmdData.name);
        writeFirmwareCliConfig(configManager.getConfig());
        vscode.commands.executeCommand('firmwareDownloader.refresh');
        vscode.window.showInformationMessage(localize('selectActiveCommand', cmdData.name));
    });


    const configBuildCommand = vscode.commands.registerCommand('firmwareDownloader.configBuildCommand', async () => {
        const buildCommands = configManager.getBuildCommands();
        const activeCmd = configManager.getActiveBuildCommandItem();
        let quickPickItems = [];

        if (buildCommands.length > 0) {
            // Show quick pick to select command
            quickPickItems = buildCommands.map(cmd => ({
                label: cmd.isActive ? `$(check) ${cmd.name}` : cmd.name,
                description: cmd.description ? `${cmd.description} - ${cmd.command}` : cmd.command,
                command: cmd
            }));
        }
        
        // Add "Select Script from File" option
        quickPickItems.push({
            label: '$(file-code) ' + localize('addScriptFromFile'),
            description: localize('selectScriptFile'),
            command: '-selectScript'
        });
        // Add "Add New Command" option
        quickPickItems.push({
            label: '$(add) ' + localize('addNewCommand'),
            description: localize('configureNewCommand'),
            command: '-addNewCommand'
        });
        
        const selected = await vscode.window.showQuickPick(quickPickItems, {
            placeHolder: localize('selectCommandToSwitch'),
            ignoreFocusOut: true
        });
        
        if (!selected) {
            return;
        }
        
        if (selected.command === '-addNewCommand') {
            // User chose to "Add New Command"
            vscode.commands.executeCommand('firmwareDownloader.addBuildCommand');
            return;
        }
        
        if (selected.command === '-selectScript') {
            // User chose to select script from file
            const options = {
                canSelectFiles: true,
                canSelectFolders: false,
                canSelectMany: false,
                openLabel: localize('selectScriptFile'),
                defaultUri: workspace_folders ? vscode.Uri.file(workspace_folders[0].uri.fsPath) : undefined,
                filters: {
                    'Scripts': ['bat', 'sh', 'py', 'cmd', 'ps1'],
                    'All Files': ['*']
                }
            };
            const result = await vscode.window.showOpenDialog(options);
            if (result && result.length > 0) {
                const selectedPath = result[0].fsPath;
                const scriptName = path.basename(selectedPath, path.extname(selectedPath));
                const scriptCommand = path.basename(selectedPath);
                
                // Check if command name already exists
                const existingCommands = configManager.getBuildCommands();
                let finalName = scriptName;
                let counter = 1;
                while (existingCommands.some(cmd => cmd.name === finalName)) {
                    finalName = `${scriptName}_${counter}`;
                    counter++;
                }
                
                // Add to configuration using addBuildCommand method
                configManager.addBuildCommand(finalName, scriptCommand, '');
                writeFirmwareCliConfig(configManager.getConfig());
                vscode.commands.executeCommand('firmwareDownloader.refresh');
                vscode.window.showInformationMessage(localize('scriptFileAdded', finalName));

                // Trigger build after adding script
                vscode.commands.executeCommand('firmwareDownloader.build');
            }
            return;
        }

        // Set active command
        configManager.setActiveBuildCommand(selected.command.name);
        writeFirmwareCliConfig(configManager.getConfig());
        vscode.commands.executeCommand('firmwareDownloader.refresh');
        //vscode.window.showInformationMessage(localize('switchedTo', selected.command.name));
        // Trigger build after switching command
        vscode.commands.executeCommand('firmwareDownloader.build');
    });
    
    const copyPathCommand = vscode.commands.registerCommand('firmwareDownloader.copyPath', async (uri) => {
        if (uri && uri.fsPath) {
            try {
                await vscode.env.clipboard.writeText(uri.fsPath);
            } catch (error) {
                vscode.window.showErrorMessage(localize('copyPathFailed', error.message));
            }
        }
    });
    
    const openSettingsCommand = vscode.commands.registerCommand('firmwareDownloader.settings', () => {
        webviewManager.showSettings();
    });

    // ========== C/C++ Define Helper Commands ==========

    /**
     * Check if a define name is valid
     * @param {string} text
     * @returns {boolean}
     */
    function isValidCppDefineName(text) {
        const definePattern = /^[A-Z_][A-Z0-9_]*$/;
        return definePattern.test(text);
    }

    /**
     * Get C/C++ defines from workspace settings
     * @returns {Array<string>}
     */
    function getCppDefines() {
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
    function saveCppDefines(defines) {
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

    /**
     * Toggle C/C++ define in settings
     * @param {string} defineName
     * @returns {boolean} true if added, false if removed
     */
    function toggleCppDefine(defineName) {
        const defines = getCppDefines();
        const index = defines.indexOf(defineName);

        if (index > -1) {
            // Remove define
            defines.splice(index, 1);
            saveCppDefines(defines);
            return false; // removed
        } else {
            // Add define
            defines.push(defineName);
            saveCppDefines(defines);
            return true; // added
        }
    }

    // Toggle C/C++ Define command (with shortcut)
    const toggleCppDefineCommand = vscode.commands.registerCommand('firmwareDownloader.toggleCppDefine', async function () {
        const editor = vscode.window.activeTextEditor;
        if (!editor) {
            vscode.window.showErrorMessage(localize('cppDefineNoSelection'));
            return;
        }

        // Get selected text
        const selectedText = editor.document.getText(editor.selection);
        if (!selectedText) {
            vscode.window.showErrorMessage(localize('cppDefineNoSelection'));
            return;
        }

        // Validate define name
        if (!isValidCppDefineName(selectedText)) {
            vscode.window.showErrorMessage(localize('cppDefineInvalid'));
            return;
        }

        try {
            const added = toggleCppDefine(selectedText);
            if (added) {
                vscode.window.showInformationMessage(localize('cppDefineAdded', selectedText));
            } else {
                vscode.window.showInformationMessage(localize('cppDefineRemoved', selectedText));
            }
        } catch (error) {
            vscode.window.showErrorMessage(`Error: ${error.message}`);
        }
    });

    // Open C/C++ Define Settings command
    const openCppDefineSettingsCommand = vscode.commands.registerCommand('firmwareDownloader.openCppDefineSettings', () => {
        webviewManager.showSettings('cppdefine');
    });

    // Register show search panel command
    const showSearchCommand = vscode.commands.registerCommand('firmwareDownloader.showSearch', () => {
        webviewManager.showSearch();
    });

    // Register Log Viewer commands
    const openLogViewerCommand = vscode.commands.registerCommand('firmwareDownloader.openLogViewer', async (uri) => {
        try {
            let filePath = null;
            
            if (uri && uri.fsPath) {
                // Called from context menu with a file - directly open that file
                await logViewerManager.openLogFile(uri.fsPath);
            } else {
                // Called from command palette or tree view - show empty panel first
                await logViewerManager.showEmptyPanel();
            }
        } catch (error) {
            vscode.window.showErrorMessage(`Failed to open log file: ${error.message}`);
        }
    });

    // Register search with Everything command
    const searchWithEverythingCommand = vscode.commands.registerCommand('firmwareDownloader.searchWithEverything', async () => {
        try {
            // Get current active editor
            const activeEditor = vscode.window.activeTextEditor;
            if (!activeEditor) {
                vscode.window.showErrorMessage('No active editor');
                return;
            }

            // Get selected text
            const selection = activeEditor.selection;
            const selectedText = activeEditor.document.getText(selection);
            
            if (!selectedText || selectedText.trim() === '') {
                vscode.window.showErrorMessage('Please select text to search');
                return;
            }

            // Open search panel and search
            await webviewManager.searchWithText(selectedText.trim());
            
            vscode.window.showInformationMessage(`Searching: "${selectedText.trim()}"`);
        } catch (error) {
            vscode.window.showErrorMessage(`Search failed: ${error.message}`);
        }
    });

    // Register build command - show quick pick menu to select and execute
    let build_disposable = vscode.commands.registerCommand('firmwareDownloader.build', async function () {

        const buildCommands = configManager.getBuildCommands();

        // Build quick pick items - numbered list
        let quickPickItems = [];

        if (buildCommands.length > 0) {
            // Numbered list: 1. xxx, 2. xxx, 3. xxx...
            quickPickItems = buildCommands.map((cmd, index) => ({
                label: `${index + 1}. ${cmd.name}`,
                description: cmd.description ? `${cmd.description}` : cmd.command,
                detail: cmd.isActive ? '✓ 当前选中' : '',
                command: cmd,
                index: index
            }));
        }

        // Add "add build command" option at the end
        quickPickItems.push({
            label: '$(add) 添加编译命令',
            description: '配置新的编译脚本',
            command: '-addCommand',
            index: -1
        });

        const selected = await vscode.window.showQuickPick(quickPickItems, {
            placeHolder: buildCommands.length > 0 ? '选择编译命令执行 (1-' + buildCommands.length + ')' : '添加编译命令',
            ignoreFocusOut: true
        });

        if (!selected) {
            return; // User cancelled
        }

        // Handle "add command" option
        if (selected.command === '-addCommand') {
            vscode.commands.executeCommand('firmwareDownloader.addBuildCommand');
            return;
        }

        // User selected a build command - execute directly
        const selectedCmd = selected.command;

        // Update active command (optional, keeps selection for next time)
        if (!selectedCmd.isActive) {
            configManager.setActiveBuildCommand(selectedCmd.name);
            writeFirmwareCliConfig(configManager.getConfig());
            vscode.commands.executeCommand('firmwareDownloader.refresh');
        }

        // Execute build using dove.exe
        const firmware_cli_path = getFirmwareCliPath(context);

        if (!firmware_cli_path) {
            vscode.window.showErrorMessage(localize('toolNotFound', FIRMWARE_CLI));
            return;
        }

        // Build dove.exe arguments
        let args = ['build'];
        args.push('-n', selectedCmd.name);

        const task_cmd = firmware_cli_path;

        task_definition = {
            type: "shell",
            label: localize('command.build') + ': ' + selectedCmd.name,
            command: task_cmd,
            args: args,
            options: {
                cwd: "${workspaceFolder}"
            },
            presentation: {
                echo: true,
                reveal: "always",
                focus: false,
                panel: "shared",
                close: false
            }
        };
        // Create task object
        const execution = new vscode.ShellExecution(task_definition.command, task_definition.args, task_definition.options);
        const task = new vscode.Task(task_definition, vscode.TaskScope.Workspace, task_definition.label, "dove-query", execution);
        // Execute task
        try {
            if (last_dl_info.terminal) {
                last_dl_info.terminal.dispose();
                last_dl_info.terminal = null;
            }
            // Execute build task
            const task_execution = await vscode.tasks.executeTask(task);
            // Listen for task end event to ensure task completes fully
            await new Promise(resolve => {
                const disposable = vscode.tasks.onDidEndTask(e => {
                    if (e.execution === task_execution) {
                        disposable.dispose();
                        resolve({
                            exitCode: e.exitCode,
                            taskId: e.execution.task.definition.label
                        })
                    }
                });
            });
            vscode.window.showInformationMessage(localize('buildComplete'));
            // Refresh firmware list
            firmwareTreeDataProvider.refresh();
        } catch (error) {
            vscode.window.showErrorMessage(localize('buildFailed', error.message));
        }

    });


    let download_disposable = vscode.commands.registerCommand('firmwareDownloader.download', async function (uri) {
        // Debounce: ignore new requests if a download is already running
        if (last_dl_info.dlPromise) {
            output_chan.appendLine(localize('alreadyDownloading'));
            return;
        }
        // Wrap download logic in a function and execute
        last_dl_info.dlPromise = (async () => {
            try {
                let selected_uri = uri;
                output_chan.appendLine(localize('selectedUri', selected_uri));
                // Load from configuration file
                if (!selected_uri) {
                    // Read from config manager
                    const config_uri = configManager.getFirmwarePath();
                    output_chan.appendLine(localize('configUri', config_uri));
                    if (config_uri && fs.existsSync(config_uri)) {
                        selected_uri = vscode.Uri.file(config_uri);
                        output_chan.appendLine(localize('selectedUri', selected_uri));
                    }
                }

               // Try to automatically detect firmware directory
               if (!selected_uri) { 
                    if (workspace_folders && workspace_folders.length > 0) { 
                        const workspace_folder = workspace_folders[0]; 
                        output_chan.appendLine(localize('currentWorkspace', workspace_folder.uri));
                        // Check [.\quectel_build\release] directory
                        const release_path = path.join(workspace_folder.uri.fsPath, 'quectel_build', 'release');
                        if (fs.existsSync(release_path)) {
                            const release_files = fs.readdirSync(release_path);
                            if (release_files.length > 0) {
                                // Use first folder in release directory as target
                                const selection = await vscode.window.showInformationMessage(
                                    localize('confirmFirmwareDir', path.join(release_path, release_files[0])), 
                                    localize('yes'), 
                                    localize('no')
                                );
                                if (selection === localize('yes')) {
                                    selected_uri = vscode.Uri.file(path.join(release_path, release_files[0]));
                                    output_chan.appendLine(localize('selectedUri', selected_uri));
                                } else {
                                    return;
                                }
                            }
                        }
                    }
                }

                if (!selected_uri) {
                    not_support_disp();
                    return;
                }

                const file_path = selected_uri.fsPath;
                const file_name = file_path;
                
                // Use dove.exe for flashing
                const firmware_cli_path = getFirmwareCliPath(context);
                
                if (!firmware_cli_path) {
                    vscode.window.showErrorMessage(localize('toolNotFound', FIRMWARE_CLI));
                    return;
                }
                
                status_bar_dl.text = "$(sync) " + localize('waitingForDownload');
                // Check if there is a running download task
                console.info('last dl state', last_dl_info.dlState, last_dl_info.dlChild)
                output_chan.appendLine(localize('lastDlState', last_dl_info.dlState));
                if(last_dl_info.dlState != 'stop' && last_dl_info.dlChild) {
                    output_chan.appendLine(localize('doLastDlProcessKill'));
                    kill_process_tree(last_dl_info.dlChild, 'SIGKILL')
                    .then(() => {
                        output_chan.appendLine(localize('previousProcessTerminateSuccess'));
                    })
                    .catch((error) => {
                        output_chan.appendLine(localize('previousProcessTerminateFailed', error));
                    });
                }
                
                last_dl_info.filePath = file_path;
                last_dl_info.fileName = file_name;
                last_dl_info.toolType = 'cli';
                last_dl_info.dlState = 'waiting';
                last_dl_info.dlChild = null;

                // dove command
                let command;
                let args;
                if (process.platform === 'win32') {
                    command = firmware_cli_path;
                    args = ['flash', file_name, '--progress', 'json'];
                } else {
                    command = firmware_cli_path;
                    args = ['flash', file_name, '--progress', 'json'];
                }

                output_chan.appendLine(`show: ${FIRMWARE_CLI} ${command} ${args.join(' ')}`);

                // Use configManager's path (matches dove's findConfigPath priority)
                const configPath = configManager.getConfigPath();
                const env = { ...process.env };
                if (configPath) {
                    env.FIRMWARE_CLI_CONFIG = configPath;
                }
                const child = spawn(command, args, {
                    shell: true,
                    env: env
                });
                const tracker = new progress_tracker(status_bar_dl);
                tracker.reset();
                last_dl_info.dlState = 'running';
                last_dl_info.dlChild = child;

                // Helper to reset the idle timeout on any output
                let kill_timeout = null;
                const resetKillTimeout = () => {
                    if (kill_timeout) {
                        clearTimeout(kill_timeout);
                    }
                    // 120-second idle timeout: kill if no output at all for 2 minutes
                    kill_timeout = setTimeout(() => {
                        output_chan.appendLine(localize('doChildDownloadProcessKill'));
                        kill_process_tree(child, 'SIGKILL')
                        .then(() => {
                            output_chan.appendLine(localize('childProcessTerminateSuccess'));
                            // Ensure cleanup even if close event doesn't fire
                            last_dl_info.dlState = 'stop';
                            last_dl_info.dlChild = null;
                            // The outer promise will resolve via close/error event or timeout below
                        })
                        .catch((error) => {
                            output_chan.appendLine(localize('childProcessTerminateFailed', error));
                            // Force cleanup: if taskkill also fails, clear state anyway
                            last_dl_info.dlState = 'stop';
                            last_dl_info.dlChild = null;
                        });
                    }, 120000);
                };
                // Start the initial timeout
                resetKillTimeout();

                // Listen to stdout
                child.stdout.on('data', (data) => {
                    let output;
                    if (process.platform === 'win32') {
                        output = iconv.decode(data, 'gbk');
                    } else {
                        output = data.toString('utf8');
                    }
                    output_chan.appendLine(output);

                    // Reset idle timeout on any output — process is alive
                    resetKillTimeout();

                    // Try to parse JSON progress
                    try {
                        const lines = output.split('\n');
                        for (const line of lines) {
                            if (line.trim().startsWith('{') && line.trim().endsWith('}')) {
                                const json = JSON.parse(line.trim());
                                if (json.progress !== undefined) {
                                    tracker.update_progress(json.progress);
                                }
                            }
                        }
                    } catch (e) {
                        // Not JSON, ignore
                    }
                });

                // Listen to stderr — don't treat as fatal, just log and reset timeout
                child.stderr.on('data', (data) => {
                    let errorOutput;
                    if (process.platform === 'win32') {
                        errorOutput = iconv.decode(data, 'gbk');
                    } else {
                        errorOutput = data.toString('utf8');
                    }
                    output_chan.appendLine(`stderr: ${errorOutput}`);
                    tracker.reset();
                    // Reset idle timeout on stderr output too
                    resetKillTimeout();
                });
            
                // Listen to process close event
                await new Promise((resolve, reject) => {
                    child.on('close', (code) => {
                        if (code === 0) {
                            vscode.window.showInformationMessage(localize('downloadComplete'));
                            status_bar_dl.text = "$(check) " + localize('downloadSuccess');
                        } else {
                            vscode.window.showErrorMessage(localize('downloadFailed', code));
                            status_bar_dl.text = "$(error) " + localize('downloadFailed2');
                        }
                        // Restore original status bar text after 5 seconds
                        setTimeout(() => {
                            status_bar_dl.text = "$(arrow-circle-down)";
                            vscode.commands.executeCommand('firmwareDownloader.devices_refresh');
                        }, 5000);

                        if (kill_timeout) {
                            clearTimeout(kill_timeout);
                            kill_timeout = null;
                        }
                        tracker.reset();
                        last_dl_info.dlState = 'stop';
                        last_dl_info.dlChild = null;
                        
                        resolve();
                    });
                
                    // Listen to process error event
                    child.on('error', (error) => {
                        vscode.window.showErrorMessage(localize('downloadStartFailed', error.message));
                        status_bar_dl.text = "$(error) " + localize('startFailed');
                        last_dl_info.dlState = 'stop';
                        last_dl_info.dlChild = null;
                        if (kill_timeout) {
                            clearTimeout(kill_timeout);
                            kill_timeout = null;
                        }
                        
                        reject(error);
                    });
                    
                });

            } catch (error) {
                vscode.window.showErrorMessage(localize('downloadError', error.message));
                status_bar_dl.text = "$(error) " + localize('downloadException');
                
                last_dl_info.dlState = 'stop';
                last_dl_info.dlChild = null;
                if (kill_timeout) {
                    clearTimeout(kill_timeout);
                    kill_timeout = null;
                }
                last_dl_info.dlPromise = null;
            } finally {
                last_dl_info.dlPromise = null;
            }
            
        })(); 
        
    });
 
    // Add to subscriptions for automatic cleanup
    context.subscriptions.push(status_bar_dl);
    context.subscriptions.push(status_bar_build);
    context.subscriptions.push(firmwareTreeDataProvider);
    context.subscriptions.push(settingsTreeDataProvider);
    
    context.subscriptions.push(refreshFirmwareListCommand);
    context.subscriptions.push(selectFirmwareDirCommand);
    context.subscriptions.push(clearFirmwareDirCommand);
    context.subscriptions.push(refreshDevicesCommand);

    context.subscriptions.push(addBuildCommand);
    context.subscriptions.push(selectBuildCommand);
    context.subscriptions.push(configBuildCommand);
    context.subscriptions.push(copyPathCommand);
    context.subscriptions.push(openSettingsCommand);
    context.subscriptions.push(showSearchCommand);
    context.subscriptions.push(searchWithEverythingCommand);
    context.subscriptions.push(openLogViewerCommand);
    context.subscriptions.push(build_disposable);
    context.subscriptions.push(download_disposable);
    context.subscriptions.push(showWelcomeCommand);
    context.subscriptions.push(toggleCppDefineCommand);
    context.subscriptions.push(openCppDefineSettingsCommand);

    // Export helper functions for webviewManager
    module.exports._helpers = {
        getCppDefines,
        saveCppDefines,
        toggleCppDefine,
        isValidCppDefineName
    };


}

function deactivate() {
    // Dispose config manager
    configManager.dispose();
}

// Add module exports to allow VS Code to activate this extension
module.exports = {
    activate,
    deactivate
};
