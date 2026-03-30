/**
 * @description: Configuration Manager
 *               Unified configuration management using firmware-cli.json only
 *               No dependency on VS Code settings
 * @author: destin.zhang@quectel.com
 */

const vscode = require('vscode');
const path = require('path');
const fs = require('fs');
const { localize } = require('../localization');

/**
 * Default configuration values
 */
const DEFAULT_CONFIG = {
    firmwarePath: '',
    buildCommands: [],
    lastBuildCommand: '',
    buildGitBashPath: '',
    defaultComPort: '',
    language: 'auto',
    theme: 'auto',
    search: {
        port: 8080,
        scope: 'global',
        maxResults: 50,
        favorites: []
    }
};

/**
 * Configuration Manager Class
 * Manages all configuration through firmware-cli.json file only
 */
class ConfigManager {
    constructor() {
        this._config = null;
        this._configPath = null;
        this._workspacePath = null;
        this._onDidChangeConfig = new vscode.EventEmitter();
        this.onDidChangeConfig = this._onDidChangeConfig.event;
        this._fileWatcher = null;
    }

    /**
     * Initialize configuration manager
     * @param {vscode.ExtensionContext} context - Extension context
     */
    initialize(context) {
        this._updateWorkspacePath();
        this._ensureConfigFile();
        this._setupFileWatcher(context);
    }

    /**
     * Update workspace path
     */
    _updateWorkspacePath() {
        const workspace = vscode.workspace.workspaceFolders;
        if (workspace && workspace.length > 0) {
            this._workspacePath = workspace[0].uri.fsPath;
            this._configPath = path.join(this._workspacePath, 'firmware-cli.json');
        } else {
            this._workspacePath = null;
            this._configPath = null;
        }
    }

    /**
     * Get configuration file path
     * @returns {string|null} Path to firmware-cli.json or null if no workspace
     */
    getConfigPath() {
        return this._configPath;
    }

    /**
     * Get workspace path
     * @returns {string|null} Workspace path or null if no workspace
     */
    getWorkspacePath() {
        return this._workspacePath;
    }

    /**
     * Ensure configuration file exists
     */
    _ensureConfigFile() {
        if (!this._configPath) {
            return;
        }

        if (!fs.existsSync(this._configPath)) {
            this._writeConfig(DEFAULT_CONFIG);
        }
    }

    /**
     * Setup file watcher for configuration changes
     * @param {vscode.ExtensionContext} context - Extension context
     */
    _setupFileWatcher(context) {
        if (!this._configPath) {
            return;
        }

        const configUri = vscode.Uri.file(this._configPath);
        this._fileWatcher = vscode.workspace.createFileSystemWatcher(configUri.fsPath);

        this._fileWatcher.onDidChange(() => {
            this._config = null; // Clear cache
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

    /**
     * Read configuration from file
     * @returns {Object} Configuration object
     */
    _readConfig() {
        if (!this._configPath) {
            return { ...DEFAULT_CONFIG };
        }

        try {
            if (fs.existsSync(this._configPath)) {
                const content = fs.readFileSync(this._configPath, 'utf8');
                const parsed = JSON.parse(content);
                return { ...DEFAULT_CONFIG, ...parsed };
            }
        } catch (error) {
            console.error('Error reading config:', error);
        }

        return { ...DEFAULT_CONFIG };
    }

    /**
     * Write configuration to file
     * @param {Object} config - Configuration object
     */
    _writeConfig(config) {
        if (!this._configPath) {
            return false;
        }

        try {
            fs.writeFileSync(this._configPath, JSON.stringify(config, null, 2));
            this._config = config;
            return true;
        } catch (error) {
            console.error('Error writing config:', error);
            return false;
        }
    }

    /**
     * Get full configuration object
     * @returns {Object} Configuration object
     */
    getConfig() {
        if (!this._config) {
            this._config = this._readConfig();
        }
        return { ...this._config };
    }

    /**
     * Get specific configuration value
     * @param {string} key - Configuration key
     * @param {*} defaultValue - Default value if not found
     * @returns {*} Configuration value
     */
    get(key, defaultValue = undefined) {
        const config = this.getConfig();
        return config[key] !== undefined ? config[key] : defaultValue;
    }

    /**
     * Set configuration value
     * @param {string} key - Configuration key
     * @param {*} value - Configuration value
     * @returns {boolean} Success status
     */
    set(key, value) {
        const config = this.getConfig();
        config[key] = value;
        return this._writeConfig(config);
    }

    /**
     * Set multiple configuration values
     * @param {Object} updates - Object with key-value pairs to update
     * @returns {boolean} Success status
     */
    setMultiple(updates) {
        const config = this.getConfig();
        Object.assign(config, updates);
        return this._writeConfig(config);
    }

    /**
     * Get firmware path
     * @returns {string} Firmware path
     */
    getFirmwarePath() {
        return this.get('firmwarePath', '');
    }

    /**
     * Set firmware path
     * @param {string} path - Firmware path
     * @returns {boolean} Success status
     */
    setFirmwarePath(path) {
        return this.set('firmwarePath', path);
    }

    /**
     * Get build commands
     * @returns {Array} Build commands array
     */
    getBuildCommands() {
        return this.get('buildCommands', []);
    }

    /**
     * Set build commands
     * @param {Array} commands - Build commands array
     * @returns {boolean} Success status
     */
    setBuildCommands(commands) {
        return this.set('buildCommands', commands);
    }

    /**
     * Add build command
     * @param {string} name - Command name
     * @param {string} command - Command value
     * @returns {boolean} Success status
     */
    addBuildCommand(name, command) {
        const commands = this.getBuildCommands();
        commands.push({ name, command });
        return this.setBuildCommands(commands);
    }

    /**
     * Get last used build command name
     * @returns {string} Last build command name
     */
    getLastBuildCommand() {
        return this.get('lastBuildCommand', '');
    }

    /**
     * Set last used build command name
     * @param {string} name - Command name
     * @returns {boolean} Success status
     */
    setLastBuildCommand(name) {
        return this.set('lastBuildCommand', name);
    }

    /**
     * Get active build command (for firmware-cli)
     * @returns {string} Active build command string
     */
    getActiveBuildCommand() {
        const buildCommands = this.getBuildCommands();
        const lastBuildCommand = this.getLastBuildCommand();

        if (lastBuildCommand && buildCommands.length > 0) {
            const found = buildCommands.find(cmd => cmd.name === lastBuildCommand);
            if (found) {
                return found.command;
            }
        }

        if (buildCommands.length > 0) {
            return buildCommands[0].command;
        }

        return '';
    }

    /**
     * Get Git Bash path
     * @returns {string} Git Bash path
     */
    getBuildGitBashPath() {
        return this.get('buildGitBashPath', '');
    }

    /**
     * Set Git Bash path
     * @param {string} path - Git Bash path
     * @returns {boolean} Success status
     */
    setBuildGitBashPath(path) {
        return this.set('buildGitBashPath', path);
    }

    /**
     * Get default COM port
     * @returns {string} COM port
     */
    getDefaultComPort() {
        return this.get('defaultComPort', '');
    }

    /**
     * Set default COM port
     * @param {string} port - COM port
     * @returns {boolean} Success status
     */
    setDefaultComPort(port) {
        return this.set('defaultComPort', port);
    }

    /**
     * Get language setting
     * @returns {string} Language code
     */
    getLanguage() {
        return this.get('language', 'auto');
    }

    /**
     * Set language
     * @param {string} language - Language code
     * @returns {boolean} Success status
     */
    setLanguage(language) {
        return this.set('language', language);
    }

    /**
     * Get theme setting
     * @returns {string} Theme setting (dark/light/auto)
     */
    getTheme() {
        return this.get('theme', 'auto');
    }

    /**
     * Set theme
     * @param {string} theme - Theme setting (dark/light/auto)
     * @returns {boolean} Success status
     */
    setTheme(theme) {
        return this.set('theme', theme);
    }

    /**
     * Get search configuration
     * @returns {Object} Search configuration object
     */
    getSearchConfig() {
        const config = this.getConfig();
        return config.search || DEFAULT_CONFIG.search;
    }

    /**
     * Set search configuration
     * @param {Object} searchConfig - Search configuration object
     * @returns {boolean} Success status
     */
    setSearchConfig(searchConfig) {
        const config = this.getConfig();
        config.search = { ...config.search, ...searchConfig };
        return this._writeConfig(config);
    }

    /**
     * Get search port
     * @returns {number} Search port number
     */
    getSearchPort() {
        const searchConfig = this.getSearchConfig();
        return searchConfig.port || 8080;
    }

    /**
     * Set search port
     * @param {number} port - Port number
     * @returns {boolean} Success status
     */
    setSearchPort(port) {
        const searchConfig = this.getSearchConfig();
        searchConfig.port = port;
        return this.setSearchConfig(searchConfig);
    }

    /**
     * Get search scope
     * @returns {string} Search scope ('global' | 'workspace')
     */
    getSearchScope() {
        const searchConfig = this.getSearchConfig();
        return searchConfig.scope || 'global';
    }

    /**
     * Set search scope
     * @param {string} scope - Search scope ('global' | 'workspace')
     * @returns {boolean} Success status
     */
    setSearchScope(scope) {
        const searchConfig = this.getSearchConfig();
        searchConfig.scope = scope;
        return this.setSearchConfig(searchConfig);
    }

    /**
     * Get max search results
     * @returns {number} Max results count
     */
    getSearchMaxResults() {
        const searchConfig = this.getSearchConfig();
        return searchConfig.maxResults || 50;
    }

    /**
     * Set max search results
     * @param {number} maxResults - Max results count
     * @returns {boolean} Success status
     */
    setSearchMaxResults(maxResults) {
        const searchConfig = this.getSearchConfig();
        searchConfig.maxResults = maxResults;
        return this.setSearchConfig(searchConfig);
    }

    /**
     * Check if configuration is valid (has required fields)
     * @returns {boolean} True if valid
     */
    isValid() {
        const config = this.getConfig();
        return config.firmwarePath || (config.buildCommands && config.buildCommands.length > 0);
    }

    /**
     * Reset configuration to defaults
     * @returns {boolean} Success status
     */
    reset() {
        return this._writeConfig({ ...DEFAULT_CONFIG });
    }

    /**
     * Dispose resources
     */
    dispose() {
        if (this._fileWatcher) {
            this._fileWatcher.dispose();
            this._fileWatcher = null;
        }
        this._onDidChangeConfig.dispose();
    }
}

// Export singleton instance
const configManager = new ConfigManager();

module.exports = { configManager, ConfigManager };
