/**
 * @description: Configuration Manager
 *               Unified configuration management using dove.json only
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
    buildGitBashPath: '',
    defaultComPort: '',
    language: 'auto',
    theme: {
        mode: 'auto',
        accent: 'blue'
    },
    search: {
        port: 8080,
        scope: 'global',
        maxResults: 500,
        favorites: []
    }
};

/**
 * Configuration Manager Class
 * Manages all configuration through dove.json file only
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
            this._configPath = path.join(this._workspacePath, 'dove.json');
        } else {
            this._workspacePath = null;
            this._configPath = null;
        }
    }

    /**
     * Get configuration file path
     * @returns {string|null} Path to dove.json or null if no workspace
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
     * @param {string} description - Command description (optional)
     * @returns {boolean} Success status
     */
    addBuildCommand(name, command, description = '') {
        const commands = this.getBuildCommands();
        const isActive = commands.length === 0; // First command is active by default
        commands.push({ name, command, description, isActive });
        return this.setBuildCommands(commands);
    }

    /**
     * Get active build command (for dove)
     * @returns {string} Active build command string
     */
    getActiveBuildCommand() {
        const buildCommands = this.getBuildCommands();

        if (buildCommands.length > 0) {
            const activeCmd = buildCommands.find(cmd => cmd.isActive);
            if (activeCmd) {
                return activeCmd.command;
            }
            return buildCommands[0].command;
        }

        return '';
    }

    /**
     * Get active build command item
     * @returns {Object|null} Active build command item or null
     */
    getActiveBuildCommandItem() {
        const buildCommands = this.getBuildCommands();

        if (buildCommands.length > 0) {
            const activeCmd = buildCommands.find(cmd => cmd.isActive);
            if (activeCmd) {
                return activeCmd;
            }
            return buildCommands[0];
        }

        return null;
    }

    /**
     * Set active build command by name
     * @param {string} name - Command name
     * @returns {boolean} Success status
     */
    setActiveBuildCommand(name) {
        const commands = this.getBuildCommands();

        // Clear all isActive flags and set the specified one
        commands.forEach(cmd => {
            cmd.isActive = cmd.name === name;
        });

        return this.setBuildCommands(commands);
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
     * Get theme configuration
     * @returns {Object} Theme configuration object with mode and accent
     */
    getThemeConfig() {
        const config = this.getConfig();
        // Handle migration from old flat structure
        if (typeof config.theme === 'string') {
            return {
                mode: config.theme,
                accent: config.accentColor || 'blue'
            };
        }
        return config.theme || DEFAULT_CONFIG.theme;
    }

    /**
     * Set theme configuration
     * @param {Object} themeConfig - Theme configuration object
     * @returns {boolean} Success status
     */
    setThemeConfig(themeConfig) {
        const config = this.getConfig();
        config.theme = { ...config.theme, ...themeConfig };
        return this._writeConfig(config);
    }

    /**
     * Get theme mode setting
     * @returns {string} Theme mode (dark/light/auto)
     */
    getTheme() {
        const themeConfig = this.getThemeConfig();
        return themeConfig.mode || 'auto';
    }

    /**
     * Set theme mode
     * @param {string} mode - Theme mode (dark/light/auto)
     * @returns {boolean} Success status
     */
    setTheme(mode) {
        return this.setThemeConfig({ mode });
    }

    /**
     * Get accent color setting
     * @returns {string} Accent color (blue/green/purple/orange/pink)
     */
    getAccentColor() {
        const themeConfig = this.getThemeConfig();
        return themeConfig.accent || 'blue';
    }

    /**
     * Set accent color
     * @param {string} accent - Accent color (blue/green/purple/orange/pink)
     * @returns {boolean} Success status
     */
    setAccentColor(accent) {
        return this.setThemeConfig({ accent });
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
