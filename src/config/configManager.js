/**
 * @description: Configuration Manager
 *               All config in .dove/dove.json
 *               Dove CLI fields (CLIConfig): firmwarePath, buildCommands, buildGitBashPath, comPorts, workspacePath, theme
 *               Plugin fields: extension { language, themeMode }
 *               Dove CLI ignores `extension` field
 * @author: destin.zhang@quectel.com
 */

const vscode = require('vscode');
const path = require('path');
const fs = require('fs');

/**
 * Default CLI configuration - aligned with dove CLI CLIConfig interface
 * See dove/src/types/index.ts CLIConfig
 */
const DEFAULT_CLI_CONFIG = {
    firmwarePath: '',
    buildCommands: [],
    buildGitBashPath: '',
    comPorts: [],
    workspacePath: '',    // dove CLI CLIConfig field
    theme: { color: 'blue' }
};

/**
 * Default extension config - plugin-specific settings
 * Stored in dove.json under `extension` field
 */
const DEFAULT_EXTENSION_CONFIG = {
    language: 'auto',       // 'auto' | 'en' | 'zh-cn'
    themeMode: 'auto',      // 'auto' | 'dark' | 'light'
    search: {
        port: 8088,
        scope: 'global',
        maxResults: 50
    }
};

/**
 * Default search config
 */
const DEFAULT_SEARCH_CONFIG = {
    port: 8088,
    scope: 'global',
    maxResults: 50
};

// Predefined tags for COM ports (synced with dove submodule PortTag type)
const COM_PORT_TAGS = ['UART_AT', 'UART_DBG', 'USB_AT', 'USB_DIAG', 'Invalid'];

/**
 * Configuration Manager Class
 */
class ConfigManager {
    constructor() {
        this._config = null;
        this._configPath = null;
        this._workspacePath = null;
        this._context = null;
        this._onDidChangeConfig = new vscode.EventEmitter();
        this.onDidChangeConfig = this._onDidChangeConfig.event;
        this._fileWatcher = null;
    }

    initialize(context) {
        this._context = context;
        this._updateWorkspacePath();
        this._ensureConfigFile();
        this._setupFileWatcher(context);
    }

    _updateWorkspacePath() {
        const workspace = vscode.workspace.workspaceFolders;
        if (workspace && workspace.length > 0) {
            this._workspacePath = workspace[0].uri.fsPath;
            // 统一配置路径: .dove/dove.json
            this._configPath = path.join(this._workspacePath, '.dove', 'dove.json');
        } else {
            this._workspacePath = null;
            this._configPath = null;
        }
    }

    getConfigPath() {
        return this._configPath;
    }

    getWorkspacePath() {
        return this._workspacePath;
    }

    _ensureConfigFile() {
        if (!this._workspacePath) return;

        const doveDir = path.join(this._workspacePath, '.dove');
        if (!fs.existsSync(doveDir)) {
            fs.mkdirSync(doveDir, { recursive: true });
        }

        if (!fs.existsSync(this._configPath)) {
            // Create with both CLI fields and extension field
            const defaultConfig = {
                ...DEFAULT_CLI_CONFIG,
                extension: { ...DEFAULT_EXTENSION_CONFIG }
            };
            this._writeConfig(defaultConfig);
        }
    }

    _setupFileWatcher(context) {
        if (!this._configPath) return;

        this._fileWatcher = vscode.workspace.createFileSystemWatcher(this._configPath);

        this._fileWatcher.onDidChange(() => {
            this._config = null;
            this._onDidChangeConfig.fire();
        });

        this._fileWatcher.onDidCreate(() => {
            this._config = null;
            this._onDidChangeConfig.fire();
        });

        if (context) {
            context.subscriptions.push(this._fileWatcher);
        }
    }

    _readConfig() {
        if (!this._configPath) {
            return {
                ...DEFAULT_CLI_CONFIG,
                extension: { ...DEFAULT_EXTENSION_CONFIG }
            };
        }

        try {
            if (fs.existsSync(this._configPath)) {
                const content = fs.readFileSync(this._configPath, 'utf8');
                const parsed = JSON.parse(content);
                // Ensure extension field exists
                if (!parsed.extension) {
                    parsed.extension = { ...DEFAULT_EXTENSION_CONFIG };
                }
                return parsed;
            }
        } catch (error) {
            console.error('Error reading config:', error);
        }

        return {
            ...DEFAULT_CLI_CONFIG,
            extension: { ...DEFAULT_EXTENSION_CONFIG }
        };
    }

    _writeConfig(config) {
        if (!this._configPath) return false;

        try {
            const content = JSON.stringify(config, null, 2);
            fs.writeFileSync(this._configPath, content, 'utf8');
            this._config = config;
            return true;
        } catch (error) {
            console.error('Error writing config:', error);
            return false;
        }
    }

    getConfig() {
        if (!this._config) {
            this._config = this._readConfig();
        }
        return { ...this._config };
    }

    get(key, defaultValue = undefined) {
        const config = this.getConfig();
        return config[key] !== undefined ? config[key] : defaultValue;
    }

    set(key, value) {
        const config = this.getConfig();
        config[key] = value;
        return this._writeConfig(config);
    }

    /**
     * Set multiple config values at once
     */
    setMultiple(updates) {
        const config = this.getConfig();
        for (const [key, value] of Object.entries(updates)) {
            if (value !== undefined) {
                config[key] = value;
            }
        }
        return this._writeConfig(config);
    }

    // ========== Extension Config ==========

    /**
     * Get extension config object
     */
    getExtensionConfig() {
        const config = this.getConfig();
        return config.extension || { ...DEFAULT_EXTENSION_CONFIG };
    }

    /**
     * Set extension config
     */
    setExtensionConfig(extensionConfig) {
        const config = this.getConfig();
        config.extension = { ...config.extension, ...extensionConfig };
        return this._writeConfig(config);
    }

    /**
     * Get language (from extension field)
     */
    getLanguage() {
        const extension = this.getExtensionConfig();
        return extension.language || 'auto';
    }

    setLanguage(language) {
        return this.setExtensionConfig({ language });
    }

    /**
     * Get theme mode (from extension field)
     */
    getThemeMode() {
        const extension = this.getExtensionConfig();
        return extension.themeMode || 'auto';
    }

    setThemeMode(mode) {
        return this.setExtensionConfig({ themeMode: mode });
    }

    // ========== Search Config (stored under extension.search) ==========

    /**
     * Get search config
     */
    getSearchConfig() {
        const extension = this.getExtensionConfig();
        return extension.search || { ...DEFAULT_SEARCH_CONFIG };
    }

    /**
     * Set search config
     */
    setSearchConfig(searchConfig) {
        const extension = this.getExtensionConfig();
        extension.search = { ...extension.search, ...searchConfig };
        return this.setExtensionConfig(extension);
    }

    /**
     * Get search port
     */
    getSearchPort() {
        const search = this.getSearchConfig();
        return search.port || DEFAULT_SEARCH_CONFIG.port;
    }

    /**
     * Set search port
     */
    setSearchPort(port) {
        const search = this.getSearchConfig();
        search.port = port;
        return this.setSearchConfig(search);
    }

    /**
     * Get search scope
     */
    getSearchScope() {
        const search = this.getSearchConfig();
        return search.scope || DEFAULT_SEARCH_CONFIG.scope;
    }

    /**
     * Set search scope
     */
    setSearchScope(scope) {
        const search = this.getSearchConfig();
        search.scope = scope;
        return this.setSearchConfig(search);
    }

    /**
     * Get search max results
     */
    getSearchMaxResults() {
        const search = this.getSearchConfig();
        return search.maxResults || DEFAULT_SEARCH_CONFIG.maxResults;
    }

    /**
     * Set search max results
     */
    setSearchMaxResults(maxResults) {
        const search = this.getSearchConfig();
        search.maxResults = maxResults;
        return this.setSearchConfig(search);
    }

    // ========== Firmware Path ==========

    getFirmwarePath() {
        return this.get('firmwarePath', '');
    }

    setFirmwarePath(path) {
        return this.set('firmwarePath', path);
    }

    // ========== Build Commands ==========

    getBuildCommands() {
        return this.get('buildCommands', []);
    }

    setBuildCommands(commands) {
        return this.set('buildCommands', commands);
    }

    addBuildCommand(name, command, description = '') {
        const commands = this.getBuildCommands();
        const isActive = commands.length === 0;
        commands.push({ name, command, description, isActive });
        return this.setBuildCommands(commands);
    }

    getActiveBuildCommand() {
        const buildCommands = this.getBuildCommands();
        if (buildCommands.length > 0) {
            const activeCmd = buildCommands.find(cmd => cmd.isActive);
            return activeCmd ? activeCmd.command : buildCommands[0].command;
        }
        return '';
    }

    getActiveBuildCommandItem() {
        const buildCommands = this.getBuildCommands();
        if (buildCommands.length > 0) {
            const activeCmd = buildCommands.find(cmd => cmd.isActive);
            return activeCmd || buildCommands[0];
        }
        return null;
    }

    setActiveBuildCommand(name) {
        const commands = this.getBuildCommands();
        commands.forEach(cmd => cmd.isActive = cmd.name === name);
        return this.setBuildCommands(commands);
    }

    // ========== Git Bash Path ==========

    getBuildGitBashPath() {
        return this.get('buildGitBashPath', '');
    }

    setBuildGitBashPath(path) {
        return this.set('buildGitBashPath', path);
    }

    // ========== COM Ports ==========

    getComPorts() {
        return this.get('comPorts', []);
    }

    setComPorts(ports) {
        return this.set('comPorts', ports);
    }

    addComPort(port, tag) {
        const ports = this.getComPorts();
        if (ports.some(p => p.port === port)) return false;
        ports.push({ port, tag });
        return this.setComPorts(ports);
    }

    deleteComPort(index) {
        const ports = this.getComPorts();
        if (index < 0 || index >= ports.length) return false;
        ports.splice(index, 1);
        return this.setComPorts(ports);
    }

    getComPortByTag(tag) {
        const ports = this.getComPorts();
        return ports.find(p => p.tag === tag) || null;
    }

    updateComPort(index, updates) {
        const ports = this.getComPorts();
        if (index < 0 || index >= ports.length) return false;
        ports[index] = { ...ports[index], ...updates };
        return this.setComPorts(ports);
    }

    getComPortTags() {
        return COM_PORT_TAGS;
    }

    // ========== Theme (dove CLI ThemeConfig) ==========

    getThemeColor() {
        const theme = this.get('theme', { color: 'blue' });
        return theme.color || 'blue';
    }

    setThemeColor(color) {
        const config = this.getConfig();
        config.theme = { ...config.theme, color };
        return this._writeConfig(config);
    }

    // ========== Utility ==========

    isValid() {
        const config = this.getConfig();
        return config.firmwarePath || (config.buildCommands && config.buildCommands.length > 0);
    }

    reset() {
        const defaultConfig = {
            ...DEFAULT_CLI_CONFIG,
            extension: { ...DEFAULT_EXTENSION_CONFIG }
        };
        return this._writeConfig(defaultConfig);
    }

    dispose() {
        if (this._fileWatcher) {
            this._fileWatcher.dispose();
            this._fileWatcher = null;
        }
        this._onDidChangeConfig.dispose();
    }
}

const configManager = new ConfigManager();

module.exports = {
    configManager,
    ConfigManager,
    COM_PORT_TAGS,
    DEFAULT_CLI_CONFIG,
    DEFAULT_EXTENSION_CONFIG
};