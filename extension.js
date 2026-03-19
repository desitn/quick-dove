/**
* @description: Quick Firmware + 
*               A tool for building and syncing firmware in a developer-friendly way.
* @author: destin.zhang@quectel.com
*/

const vscode = require('vscode');
const path = require('path');
const fs = require('fs');
const admzip = require('adm-zip');
const iconv = require('iconv-lite');
const { spawn } = require('child_process');
const ini = require('ini');
const { localize } = require('./src/localization');

/** @note All download tool paths used directly by this extension */
const tool_set = {
    'ddl':'detect_dl.exe',
    'ad' :'adownload.exe',
    'fbf':'FBFDownloader.exe',
    'pac':'pacdownload\\CmdDloader.exe',
    'ecf':'ecflashtool\\ECFlashTool.exe'
};

const output_chan = vscode.window.createOutputChannel('Quick Firmware +');
const alert = localize('noFirmware');

function get_configuration() {
    return vscode.workspace.getConfiguration('quickFirmwarePlus');
}

/**
 * Write firmware-cli.json configuration file to workspace root
 * This file is used by the independent firmware-cli tool
 */
function writeFirmwareCliConfig(config) {
    const workspace = vscode.workspace.workspaceFolders;
    if (!workspace || workspace.length === 0) {
        return;
    }
    
    const workspacePath = workspace[0].uri.fsPath;
    const configPath = path.join(workspacePath, 'firmware-cli.json');
    
    const buildCommands = config.get('buildCommands') || [];
    const lastBuildCommand = config.get('lastBuildCommand') || '';
    // Get the command from last used or first command
    let buildCommand = '';
    if (lastBuildCommand && buildCommands.length > 0) {
        const found = buildCommands.find(cmd => cmd.name === lastBuildCommand);
        if (found) {
            buildCommand = found.command;
        }
    }
    if (!buildCommand && buildCommands.length > 0) {
        buildCommand = buildCommands[0].command;
    }
    
    const configData = {
        firmwarePath: config.get('firmwarePath') || '',
        buildCommand: buildCommand,
        buildGitBashPath: config.get('buildGitBashPath') || '',
        defaultComPort: config.get('defaultComPort') || ''
    };
    
    try {
        fs.writeFileSync(configPath, JSON.stringify(configData, null, 2));
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



class FirmwareTreeDataProvider {
    constructor() {
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
        const firmwarePath = config.get('firmwarePath');
        if (firmwarePath && firmwarePath.length > 0) {
            if (fs.existsSync(firmwarePath)) {
                const dir_path = firmwarePath;
                const time = fs.statSync(dir_path).mtime;
                if (fs.statSync(dir_path).isDirectory()) {
                    const dir = path.basename(dir_path);
                    const firmware_files = this.getFirmwareFiles(dir_path);
                    const item = new FirmwareItem(dir, dir_path, time, vscode.TreeItemCollapsibleState.Collapsed, firmware_files);
                    items.push(item);
                }
                return items;
            }
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
    constructor() {
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
                // Use wmic command to get USB devices on Windows
                const command_dflt     = 'wmic path Win32_PnPEntity where "Name like \'%USB%\' OR Name like \'%Quectel%\'" get Name';
                let command = command_dflt;
                const { spawn } = require('child_process');
                return new Promise((resolve) => {
                    // Use wmic to get USB device information
                    const wmic = spawn('cmd', ['/c', command], { shell: true });
                    let output = '';
                    wmic.stdout.on('data', (data) => {
                        output += iconv.decode(data, 'cp936'); // Decode using CP936 (default encoding for Chinese Windows)
                    });
                    wmic.stderr.on('data', (data) => {
                        console.error(`WMIC error: ${iconv.decode(data, 'cp936')}`);
                    });
                    wmic.on('close', (code) => {
                        if (code === 0) {
                            // Parse wmic output
                            const lines = output.split('\n');
                            for (const line of lines) {
                                const trimmedLine = line.trim();
                                if (trimmedLine && 
                                    !trimmedLine.includes('Name') && // Skip header line
                                    trimmedLine.length > 0) {
                                    // Filter out non-device entries like keyboard, mouse, etc.
                                    if (!(trimmedLine.includes('Keyboard') || 
                                          trimmedLine.includes('Mouse') || 
                                          trimmedLine.includes('Controller') ||
                                          trimmedLine.includes('Input') ||
                                          trimmedLine.includes('Hub') ||
                                          trimmedLine.includes('Oray') ||
                                          trimmedLine.includes('ECM') ||
                                          trimmedLine.includes('Composite Device') ||
                                          trimmedLine.includes('输入设备') ||
                                          trimmedLine.includes('集线器') ||
                                          trimmedLine.includes('主机控制器'))) {
                                        items.push(new DeviceItem(
                                            trimmedLine,
                                            '',
                                            vscode.TreeItemCollapsibleState.None
                                        ));
                                    }
                                }
                            }
                            
                            if (items.length === 0) {
                                resolve([new InfoItem(localize('noDeviceFound'), localize('checkDeviceConnection'), vscode.TreeItemCollapsibleState.None)]);
                            } else {
                                // Sort device list
                                items.sort((a, b) => a.label.localeCompare(b.label));
                                resolve(items);
                            }
                        } else {
                            // If wmic fails
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
        
        // Only keep Plugin Settings entry
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
    
    start_pseudo_progress(tool_type, max = 90) {
        let interval = 2000;
        if (this.pseudo_interval != null) {
            return;
        }
        if (tool_type == 'fbf') {
            interval = 1200;
        }
        if (tool_type == 'pac') {
            interval = 300;
        }
        if (tool_type == 'ecf') {
            interval = 500;
        }
        console.info(`pseudo progress start`);
        this.pseudo_interval = setInterval(() => {
            if (this.current_progress < max) {
                const increment = Math.max(1, Math.floor((max - this.current_progress) * 0.05));
                this.update_progress(this.current_progress + increment);
            }
        }, interval); 
    }
    
    stop_pseudo_progress() {
        if (this.pseudo_interval) {
            clearInterval(this.pseudo_interval);
            this.pseudo_interval = null;
        }
    }

    reset() {
        this.current_progress = 0;
        this.stop_pseudo_progress();
    }
}

function ad_extract_progress(output) 
{
    let found = false;
    let jsonBuffer = ''; 
    const lines = output.split('\n');
    
    for (const line of lines) {
        if (line.includes('ABOOT_EVENT_DEVICE_CHANGE')) {
            found = true;
            jsonBuffer = ''; 
            continue;
        } 
        if (found) {
            jsonBuffer += line.trim() + '\n'; // Accumulate line content
            if (jsonBuffer.trim().startsWith('{')) {
                try {
                    const logObject = JSON.parse(jsonBuffer);
                    if (logObject.progress !== undefined) {
                        output_chan.appendLine(localize('adProgress', logObject.progress));
                        return logObject.progress;
                    }
                } catch (error) {
                    if (line.trim().endsWith('}')) {
                        output_chan.appendLine(localize('parsingJsonError', jsonBuffer), error);
                        found = false;
                        jsonBuffer = '';
                    }
                }
            }
            if (line.trim().endsWith('}')) {
                found = false;
                jsonBuffer = '';
            }
        }
    }
    
    return null;
}

function fbf_extract_progress(output) 
{
    let max_progress = 0;
    const download_fiter = "Download percentage";
    const burn_fiter = "Burning flash percentage";
    const ok_fiter = "Download Completed successfully";
    const lines = output.split('\n');

    for (const line of lines) {
        const download_match = line.includes(download_fiter);
        const burn_match = line.includes(burn_fiter);
        const ok_match = line.includes(ok_fiter);
        if (download_match) {
            max_progress = 0xFF; // Use pseudo progress
        } else if (burn_match) {
            max_progress = 90;
        } else if (ok_match) {
            max_progress = 100;
        }
    }
    console.info('fbf max_progress', max_progress)

    return max_progress > 0 ? max_progress : null;
}

function pac_extract_progress(output) 
{
    let max_progress = 0;
    const download_fiter = "Downloading";
    const ok_fiter = "DownLoad Passed";
    const lines = output.split('\n');

    for (const line of lines) {
        const download_match = line.includes(download_fiter);
        const ok_match = line.includes(ok_fiter);
        if (download_match) {
            max_progress = 0xFF; 
        } else if (ok_match) {
            max_progress = 100;
        }
    }
    console.info('pac max_progress', max_progress)

    return max_progress > 0 ? max_progress : null;
}


function ecf_extract_progress(output) 
{
    let max_progress = 0;
    const download_fiter = "DownLoading";
    const ok_fiter = "DownLoad done";
    const lines = output.split('\n');

    for (const line of lines) {
        const download_match = line.includes(download_fiter);
        const ok_match = line.includes(ok_fiter);
        if (download_match) {
            max_progress = 0xFF; 
        } else if (ok_match) {
            max_progress = 100;
        }
    }
    console.info('ecf max_progress', max_progress)

    return max_progress > 0 ? max_progress : null;
}

function extract_progress_from_output(output, tool_type) 
{

    if (tool_type == 'ad') {
        return ad_extract_progress(output);
    }
    else if (tool_type == 'fbf') {
        return fbf_extract_progress(output);
    } 
    else if (tool_type == 'pac') {
        return pac_extract_progress(output);
    } 
    else if (tool_type == 'ecf') {
        return ecf_extract_progress(output);
    }

    return null;
}

function zip_is_adownload_file(file_name) 
{
    if (file_name.match(/.*\.zip$/i)) { 
        try {
            const zip = new admzip(file_name);
            const zip_entries = zip.getEntries();
            const has_download_json = zip_entries.some(entry => {
                return entry.entryName === 'download.json' || 
                    entry.entryName.endsWith('/download.json');
            });
            if (!has_download_json) {
                return false;
            } else {
                return true;
            }
        } catch (error) {
            vscode.window.showErrorMessage(localize('zipCheckFailed', error.message));
        }
    }

    return false;
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
    const firmwareTreeDataProvider = new FirmwareTreeDataProvider();
    vscode.window.registerTreeDataProvider('firmware-explorer', firmwareTreeDataProvider);
    
    const settingsTreeDataProvider = new SettingsTreeDataProvider();
    vscode.window.registerTreeDataProvider('firmware-settings', settingsTreeDataProvider);
    
    const deviceTreeDataProvider = new DeviceTreeDataProvider();
    vscode.window.registerTreeDataProvider('firmware-devices', deviceTreeDataProvider);
    deviceTreeDataProvider.startAutoRefresh();

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
            const config = get_configuration();
            await config.update('firmwarePath', selectedPath, vscode.ConfigurationTarget.Workspace);
            writeFirmwareCliConfig(config);
            vscode.commands.executeCommand('firmwareDownloader.refresh');
        }
    });

    const clearFirmwareDirCommand = vscode.commands.registerCommand('firmwareDownloader.clear', async () => {
        const config = get_configuration();
        await config.update('firmwarePath', '', vscode.ConfigurationTarget.Workspace);
        writeFirmwareCliConfig(config);
        vscode.commands.executeCommand('firmwareDownloader.refresh');
    });
 
    // Add build command
    const addBuildCommand = vscode.commands.registerCommand('firmwareDownloader.addBuildCommand', async () => {
        const config = get_configuration();
        
        // Get command name
        const name = await vscode.window.showInputBox({
            prompt: localize('enterCommandName'),
            placeHolder: 'e.g., Release Build, Debug Build',
            validateInput: (value) => {
                if (!value || value.trim().length === 0) {
                    return localize('commandNameEmpty');
                }
                const buildCommands = config.get('buildCommands') || [];
                if (buildCommands.some(cmd => cmd.name === value.trim())) {
                    return localize('commandNameExists');
                }
                return null;
            }
        });
        
        if (!name) {
            return;
        }
        
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
        
        // Save to configuration
        const buildCommands = config.get('buildCommands') || [];
        buildCommands.push({ name: name.trim(), command: command.trim() });
        await config.update('buildCommands', buildCommands, vscode.ConfigurationTarget.Workspace);
        
        // Set as last used if it's the first command
        if (buildCommands.length === 1) {
            await config.update('lastBuildCommand', name.trim(), vscode.ConfigurationTarget.Workspace);
        }
        
        writeFirmwareCliConfig(config);
        vscode.commands.executeCommand('firmwareDownloader.refresh');
        vscode.window.showInformationMessage(localize('commandAdded', name));
    });
    
    // Select build command (from settings view)
    const selectBuildCommand = vscode.commands.registerCommand('firmwareDownloader.selectBuildCommand', async (cmdData) => {
        if (!cmdData) {
            return;
        }
        
        const config = get_configuration();
        await config.update('lastBuildCommand', cmdData.name, vscode.ConfigurationTarget.Workspace);
        writeFirmwareCliConfig(config);
        vscode.commands.executeCommand('firmwareDownloader.refresh');
        vscode.window.showInformationMessage(localize('selectActiveCommand', cmdData.name));
    });
    

    const switchBuildCommand = vscode.commands.registerCommand('firmwareDownloader.switchBuildCommand', async () => {
        const config = get_configuration();
        const buildCommands = config.get('buildCommands') || [];
        const lastBuildCommand = config.get('lastBuildCommand') || '';
        
        if (buildCommands.length === 0) {
            // No commands configured, prompt to add
            const choice = await vscode.window.showInformationMessage(
                localize('noBuildCommand'),
                localize('addCommand')
            );
            if (choice === localize('addCommand')) {
                vscode.commands.executeCommand('firmwareDownloader.addBuildCommand');
            }
            return;
        }
        
        // Show quick pick to select command
        const quickPickItems = buildCommands.map(cmd => ({
            label: cmd.name === lastBuildCommand ? `$(check) ${cmd.name}` : cmd.name,
            description: cmd.command,
            command: cmd
        }));
        
        // Add "Add New Command" option
        quickPickItems.push({
            label: '$(add) ' + localize('addNewCommand'),
            description: localize('configureNewCommand'),
            command: null
        });
        
        const selected = await vscode.window.showQuickPick(quickPickItems, {
            placeHolder: localize('selectCommandToSwitch'),
            ignoreFocusOut: true
        });
        
        if (!selected) {
            return;
        }
        
        if (selected.command === null) {
            // User chose to add new command
            vscode.commands.executeCommand('firmwareDownloader.addBuildCommand');
            return;
        }
        
        // Update lastBuildCommand
        await config.update('lastBuildCommand', selected.command.name, vscode.ConfigurationTarget.Workspace);
        writeFirmwareCliConfig(config);
        vscode.commands.executeCommand('firmwareDownloader.refresh');
        vscode.window.showInformationMessage(localize('switchedTo', selected.command.name));
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
        vscode.commands.executeCommand('workbench.action.openSettings', 'quickFirmwarePlus');
    });

    // Register build command - with confirmation dialog
    let build_disposable = vscode.commands.registerCommand('firmwareDownloader.build', async function () {

        const config = get_configuration();
        const buildCommands = config.get('buildCommands') || [];
        const lastBuildCommand = config.get('lastBuildCommand') || '';
        let build_args = '';
        let is_bash = false;
        let bash_run = config.get('buildGitBashPath') || '';
        
        // If there are configured build commands, use the last used one or first one
        if (buildCommands.length > 0) {
            let selectedCmd = null;
            
            if (lastBuildCommand) {
                selectedCmd = buildCommands.find(cmd => cmd.name === lastBuildCommand);
            }
            
            if (!selectedCmd) {
                selectedCmd = buildCommands[0];
            }
            
            build_args = selectedCmd.command;
            
            // Update lastBuildCommand if it was not set
            if (selectedCmd.name !== lastBuildCommand) {
                await config.update('lastBuildCommand', selectedCmd.name, vscode.ConfigurationTarget.Workspace);
                writeFirmwareCliConfig(config);
            }
        } else {
            // No configured commands, use auto-detection
            // Default to build OPT.bat
            if (workspace_folders && workspace_folders.length > 0) { 
                const re ='build*OPTfile.bat'
                const re_sh ='build*OPTfile.sh'
                const ws_folder = workspace_folders[0]; 
                output_chan.appendLine(localize('currentWorkspace', ws_folder.uri));
                let file = await vscode.workspace.findFiles(re, null, 1);
                let detectedCommand = '';
                let detectedName = '';
                
                if (file && file.length > 0) {  
                    const file_path = file[0].fsPath;
                    build_args = path.basename(file_path);
                    detectedCommand = build_args;
                    detectedName = path.basename(file_path, '.bat');
                    output_chan.appendLine(localize('rootBuildFile', build_args));
                }
                // Default to build.sh
                if (!build_args) { 
                    file = await vscode.workspace.findFiles(re_sh, null, 1);
                    if (file && file.length > 0) {  
                        const file_path = file[0].fsPath;
                        build_args = path.basename(file_path);
                        detectedCommand = build_args;
                        detectedName = path.basename(file_path, '.sh');
                        output_chan.appendLine(localize('rootBuildFile', build_args) + ' git bash');
                        is_bash = true;
                        if (fs.existsSync(bash_run)) {
                            output_chan.appendLine(localize('gitBashPath', bash_run));
                        } else {
                            vscode.window.showErrorMessage(localize('configGitBashPath'));
                            vscode.commands.executeCommand('firmwareDownloader.settings');
                            return;
                        }
                    }
                }
                
                // Auto-save detected command as default
                if (detectedCommand && detectedName) {
                    const buildCommands = config.get('buildCommands') || [];
                    // Check if already exists
                    const exists = buildCommands.some(cmd => cmd.name === detectedName);
                    if (!exists) {
                        buildCommands.push({ name: detectedName, command: detectedCommand });
                        await config.update('buildCommands', buildCommands, vscode.ConfigurationTarget.Workspace);
                        await config.update('lastBuildCommand', detectedName, vscode.ConfigurationTarget.Workspace);
                        writeFirmwareCliConfig(config);
                        vscode.commands.executeCommand('firmwareDownloader.refresh');
                        output_chan.appendLine(localize('autoDetectedSaved', detectedName));
                    }
                }
            }
        }

        if (!build_args) { 
            const choice = await vscode.window.showInformationMessage(
                localize('noBuildCommand'),
                localize('addCommand')
            );
            if (choice === localize('addCommand')) {
                vscode.commands.executeCommand('firmwareDownloader.addBuildCommand');
            }
            return;
        }

        // Show confirmation dialog with current command
        const confirmMessage = localize('confirmBuildCommand', build_args);
        const choice = await vscode.window.showInformationMessage(
            confirmMessage,
            { modal: false },
            localize('executeBuild'),
            localize('switchCommand')
        );

        if (choice === localize('switchCommand')) {
            // User chose to switch command
            vscode.commands.executeCommand('firmwareDownloader.switchBuildCommand');
            return;
        }

        if (choice !== localize('executeBuild')) {
            // User cancelled
            return;
        }

        // User confirmed, proceed with build
        let task_cmd = null;
        let args = null;

        if(is_windows()) {
            task_cmd = !is_bash ? "cmd": bash_run;
            args = !is_bash ? ["/c", `${build_args}`]:["-c", `./${build_args}`];
        } else {
            task_cmd = "/bin/bash";
            args = ["-c", `${build_args}`];
        }

        task_definition = {
            type: "shell",
            label: localize('command.build'),
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
        const task = new vscode.Task(task_definition, vscode.TaskScope.Workspace, task_definition.label, "firmware-tool", execution);
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
                    // Prioritize reading from VS Code configuration
                    const config = get_configuration();
                    let config_uri = config.get('firmwarePath');
                    output_chan.appendLine(localize('configUri', config_uri));
                    if (fs.existsSync(config_uri)) {
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

                let file_name;
                let tool;
                let tool_type;
                let bin_file;
                const file_path = selected_uri.fsPath;
                const stats = fs.statSync(file_path);
                if (stats.isDirectory()) {
                    const files = fs.readdirSync(file_path);
                    if (bin_file = files.find(file => file.toLowerCase().endsWith('_fbf.bin'))) {//ASR 1X03
                        tool_type = 'fbf';
                        file_name = path.join(file_path, bin_file);
                    }
                    else if(bin_file = files.find(file => file.toLowerCase().endsWith('.pac'))) {//UNISOC 8310 8910
                        tool_type = 'pac';
                        file_name = path.join(file_path, bin_file);
                    }
                    else if(bin_file = files.find(file => file.toLowerCase().endsWith('.zip'))) {
                        tool_type = 'ad';
                        file_name = path.join(file_path, bin_file);
                        if (!zip_is_adownload_file(file_name)) {
                            not_support_disp();
                            return;
                        }
                    }
                    else if(bin_file = files.find(file => file.toLowerCase().endsWith('download_usb.ini'))) {
                        tool_type = 'ecf';
                        file_name = path.join(file_path, bin_file);
                    }
                    else {
                        not_support_disp();
                        return;
                    }

                } else {
                    file_name = file_path;
                    // Verify if filename is supported
                    if (zip_is_adownload_file(file_name)) {         //ASR 160x
                        tool_type = 'ad';
                    }  else if (file_name.match(/.*\_fbf.bin$/i)) { //ASR 1X03
                        tool_type = 'fbf';
                    } else if (file_name.match(/.*\.pac$/i)) {      //UNISOC 8310 8910
                        tool_type = 'pac';
                    } else if (file_name.match(/.*\_download_usb.ini$/i)) {  //Eigen
                        tool_type = 'ecf';
                    } else {
                        not_support_disp();
                        return;
                    }
                    
                }   
           
                tool = tool_set[tool_type];
                const extension_path = context.extensionPath;
                const tools_path = path.join(extension_path, 'tools');
                const toolfile   = path.join(tools_path, tool);
                if (!fs.existsSync(toolfile)) {
                    vscode.window.showErrorMessage(localize('toolNotFound', tool));
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
                last_dl_info.toolType = tool_type;
                last_dl_info.dlState = 'waiting';
                last_dl_info.dlChild = null;

                // Send QDOWNLOAD command -> subprocess handling
                if (process.platform === 'win32') {
                    let ddl_cmd = 'cmd';
                    const ddl_tool = path.join(tools_path, tool_set['ddl']);
                    if (tool_type == 'pac') {
                        ddl_run = `${ddl_tool} -t unisoc -f 1`
                    } else {
                        ddl_run = `${ddl_tool} -t asr`;
                    }
                    ddl_args = ['/c', ddl_run]; 
                    const ddl_child = spawn(ddl_cmd, ddl_args, { shell: true });
                    ddl_child.stdout.on('data', (data) => {
                        let output;
                        if (process.platform === 'win32') {
                            output = iconv.decode(data, 'gbk');
                        } else {
                            output = data.toString('utf8');
                        }
                        output_chan.appendLine(output);
                    });
                    ddl_child.stderr.on('data', (data) => {
                        let output;
                        if (process.platform === 'win32') {
                            output = iconv.decode(data, 'gbk');
                        } else {
                            output = data.toString('utf8');
                        }
                        output_chan.appendLine(output);
                    });
                    ddl_child.on('close', (code) => {
                        if (!(code === 0)) {
                            vscode.window.showInformationMessage(localize('enterDownloadMode'));
                        } 
                    });
                }
                // Build download command -> subprocess handling
                let command;
                let cmdStr;
                let args;
                if (process.platform === 'win32') {
                    command = 'cmd';
                    //args = ['/c'];
                    if (tool_type == 'ad') {
                        cmdStr=`${toolfile} -r -q -a -u -s 115200 ${file_name}`;
                    } else if (tool_type == 'pac') {
                        cmdStr=`${toolfile} -pac ${file_name}`;
                    } else if (tool_type == 'ecf') {
                        cmdStr=`${toolfile} -f ${file_name} --timeout 60`;
                    } else {
                        cmdStr=`${toolfile} -b ${file_name}`;
                    }
                    args = ['/c', cmdStr]; 
                    //console.log(`show: ${tool} ${command} ${args}`);
                    output_chan.appendLine(`show: ${tool} ${command} ${args}`);
                } else {
                    // Unix-like systems
                    command = toolfile;
                    if (tool_type == 'ad') {
                        args = ['-r', '-q', '-a', '-u', '-s', '115200', file_name];
                    } else if (tool_type == 'pac') {
                        args = ['-pac', file_name];
                    } else {
                        args = ['-b', file_name];
                    }
                }
                const child   = spawn(command, args, { shell: true });
                const tracker = new progress_tracker(status_bar_dl);
                tracker.reset();
                last_dl_info.dlState = 'running';
                last_dl_info.dlChild = child;
                // 30-second timeout: kill download process if no output
                let kill_timeout = setTimeout(() => {
                    //vscode.window.showErrorMessage(`下载等待超时`);
                    output_chan.appendLine(localize('doChildDownloadProcessKill'));
                    kill_process_tree(child, 'SIGKILL')
                    .then(() => {
                        output_chan.appendLine(localize('childProcessTerminateSuccess'));
                    })
                    .catch((error) => {
                        output_chan.appendLine(localize('childProcessTerminateFailed', error));
                    });
                }, 30000);

                // Listen to stdout
                child.stdout.on('data', (data) => {
                    let output;
                    if (process.platform === 'win32') {
                        output = iconv.decode(data, 'gbk');
                    } else {
                        output = data.toString('utf8');
                    }
                    output_chan.appendLine(output);
                    progress = extract_progress_from_output(output, tool_type);
                    if (progress == 0xFF) {
                        tracker.start_pseudo_progress(tool_type,95);
                    } else { 
                        if (progress != null) {
                            tracker.stop_pseudo_progress();
                            tracker.update_progress(progress);
                        }
                    }
                    if (progress != null) {
                        if (kill_timeout) {
                            clearTimeout(kill_timeout);
                            kill_timeout = null;
                        }
                        vscode.commands.executeCommand('firmwareDownloader.devices_refresh');
                    }
                });

                // Listen to stderr
                child.stderr.on('data', (data) => {
                    let errorOutput;
                    if (process.platform === 'win32') {
                        // Windows Chinese system typically uses GBK encoding
                        errorOutput = iconv.decode(data, 'gbk');
                    } else {
                        errorOutput = data.toString('utf8');
                    }
                    output_chan.appendLine(`stderr: ${errorOutput}`);
                    tracker.reset();
                    last_dl_info.dlState = 'stop';
                    last_dl_info.dlChild = null;
                    if (kill_timeout) {
                        clearTimeout(kill_timeout);
                        kill_timeout = null;
                    }
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
                            status_bar_dl.text = "$(arrow-circle-down) " + localize('command.download');
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
            } finally {

                last_dl_info.dlPromise = null;
            }
            
        })(); 
        
    });
 
    // Set terminal close event listener
    function terminal_close_listener(last_dl_info) {
        return vscode.window.onDidCloseTerminal((closed_terminal) => {
            if (last_dl_info.terminal === closed_terminal) {
                console.log("terminal close by user");
                last_dl_info.terminal = null; 
            }
        });
    }

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
    context.subscriptions.push(switchBuildCommand);
    context.subscriptions.push(copyPathCommand);
    context.subscriptions.push(openSettingsCommand);
    context.subscriptions.push(build_disposable);
    context.subscriptions.push(download_disposable);


}

function deactivate() {
}

// Add module exports to allow VS Code to activate this extension
module.exports = {
    activate,
    deactivate
};
