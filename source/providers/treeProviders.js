/**
 * Tree Data Providers for Quick Dove
 */
const vscode = require('vscode');
const path = require('path');
const fs = require('fs');
const { spawn, spawnSync } = require('child_process');
const { localize } = require('../localization');
const {
    get_configuration,
    getFirmwareCliPath,
    writeFirmwareCliConfig,
    is_windows,
    configManager,
    output_chan
} = require('../utils');

// ======================== Firmware Tree ========================

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

        // Try dove flash --list first
        try {
            const firmwareCliPath = getFirmwareCliPath(this.context);
            if (firmwareCliPath) {
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
                            if (items.length > 0) return items;
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
                    let firmware_files = this.getFirmwareFiles(firmwarePath);
                    if (firmware_files.length > 0) {
                        items.push(new FirmwareItem(dir, firmwarePath, time, vscode.TreeItemCollapsibleState.Collapsed, firmware_files));
                        return items;
                    }
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
                        if (items.length > 0) return items;
                    }
                }
            }
        }

        // Fallback: check workspace quectel_build/release
        const workspace_folders = vscode.workspace.workspaceFolders;
        if (workspace_folders && workspace_folders.length > 0) {
            for (const folder of workspace_folders) {
                const release_path = path.join(folder.uri.fsPath, 'quectel_build', 'release');
                if (fs.existsSync(release_path)) {
                    const release_dirs = fs.readdirSync(release_path);
                    for (const dir of release_dirs) {
                        const dir_path = path.join(release_path, dir);
                        if (fs.statSync(dir_path).isDirectory()) {
                            const firmware_files = this.getFirmwareFiles(dir_path);
                            const time = fs.statSync(dir_path).mtime;
                            items.push(new FirmwareItem(dir, dir_path, time, vscode.TreeItemCollapsibleState.Collapsed, firmware_files));
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

// ======================== Device Tree ========================

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
        this.refreshIntervalMs = 20000;
    }

    refresh() {
        this._onDidChangeTreeData.fire();
    }

    startAutoRefresh() {
        if (this.autoRefreshIntervalId) {
            clearInterval(this.autoRefreshIntervalId);
        }
        this.isAutoRefreshEnabled = true;
        this.autoRefreshIntervalId = setInterval(() => {
            this.refresh();
        }, this.refreshIntervalMs);
    }

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
                const firmwareCliPath = getFirmwareCliPath(this.context);
                if (!firmwareCliPath) {
                    return [new InfoItem(localize('noDeviceFound'), 'dove not found', vscode.TreeItemCollapsibleState.None)];
                }
                return new Promise((resolve) => {
                    const configPath = configManager.getConfigPath();
                    const env = { ...process.env };
                    if (configPath) {
                        env.FIRMWARE_CLI_CONFIG = configPath;
                    }
                    const child = spawn(firmwareCliPath, ['port', 'list'], { env });
                    let output = '';
                    let errorOutput = '';
                    child.stdout.on('data', (data) => { output += data.toString('utf8'); });
                    child.stderr.on('data', (data) => { errorOutput += data.toString('utf8'); });
                    child.on('close', (code) => {
                        if (code === 0) {
                            try {
                                output_chan.appendLine(output);
                                const result = JSON.parse(output);
                                if (result.ports && result.ports.length > 0) {
                                    for (const port of result.ports) {
                                        items.push(new DeviceItem(port.path, port.friendlyName || '', vscode.TreeItemCollapsibleState.None));
                                    }
                                    resolve(items);
                                } else {
                                    resolve([new InfoItem(localize('noDeviceFound'), localize('checkDeviceConnection'), vscode.TreeItemCollapsibleState.None)]);
                                }
                            } catch (e) {
                                console.error('JSON parsing error:', e);
                                resolve([new InfoItem(localize('noDeviceFound'), localize('checkDeviceConnection'), vscode.TreeItemCollapsibleState.None)]);
                            }
                        } else {
                            console.error('dove devices failed:', errorOutput);
                            resolve([new InfoItem(localize('noDeviceFound'), localize('checkDeviceConnection'), vscode.TreeItemCollapsibleState.None)]);
                        }
                    });
                });
            } else {
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
        this.contextValue = 'serial-device';
    }
}

// ======================== Settings Tree ========================

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
        items.push(new SettingsItem(localize('view.showWelcome'), '', vscode.TreeItemCollapsibleState.None, 'show-welcome'));
        items.push(new SettingsItem(localize('view.pluginSettings'), '', vscode.TreeItemCollapsibleState.None, 'firmware-settings'));
        return items;
    }
}

class SettingsItem extends vscode.TreeItem {
    constructor(label, description, collapsibleState, type, data = null) {
        super(label, collapsibleState);
        this.description = description;
        this.tooltip = description;
        this.type = type;
        this.data = data;
        switch (type) {
            case 'show-welcome':
                this.iconPath = new vscode.ThemeIcon('home');
                this.command = { command: 'firmwareDownloader.showWelcome', title: localize('view.showWelcome'), arguments: [] };
                break;
            case 'show-wizard':
                this.iconPath = new vscode.ThemeIcon('wand');
                this.command = { command: 'firmwareDownloader.showSetupWizard', title: localize('view.showSetupWizard'), arguments: [] };
                break;
            case 'firmware-settings':
                this.iconPath = new vscode.ThemeIcon('gear');
                this.command = { command: 'firmwareDownloader.settings', title: localize('view.settings'), arguments: [] };
                break;
        }
    }
}

// ======================== Portable Tools Tree ========================

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
        items.push(new PortableToolItem(localize('view.search'), '', vscode.TreeItemCollapsibleState.None, 'search'));
        items.push(new PortableToolItem(localize('view.logViewer'), '', vscode.TreeItemCollapsibleState.None, 'log-viewer'));
        return items;
    }
}

class PortableToolItem extends vscode.TreeItem {
    constructor(label, description, collapsibleState, type, data = null) {
        super(label, collapsibleState);
        this.description = description;
        this.tooltip = description;
        this.type = type;
        this.data = data;
        switch (type) {
            case 'search':
                this.iconPath = new vscode.ThemeIcon('search');
                this.command = { command: 'firmwareDownloader.showSearch', title: localize('view.search'), arguments: [] };
                break;
            case 'log-viewer':
                this.iconPath = new vscode.ThemeIcon('file-text');
                this.command = { command: 'firmwareDownloader.openLogViewer', title: localize('view.logViewer'), arguments: [] };
                break;
        }
    }
}

// ======================== Info Item ========================

class InfoItem extends vscode.TreeItem {
    constructor(label, description, collapsibleState) {
        super(label, collapsibleState);
        this.description = description;
        this.iconPath = new vscode.ThemeIcon('info');
    }
}

module.exports = {
    FirmwareTreeDataProvider,
    FirmwareItem,
    FirmwareFileItem,
    DeviceTreeDataProvider,
    DeviceItem,
    SettingsTreeDataProvider,
    SettingsItem,
    PortableToolsTreeDataProvider,
    PortableToolItem,
    InfoItem
};
