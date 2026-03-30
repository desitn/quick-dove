/**
 * Search Manager Module
 * Manages search functionality and integrates with webview
 */

const vscode = require('vscode');
const path = require('path');
const fs = require('fs');
const EverythingApi = require('./everythingApi');
const FileTypeClassifier = require('./fileTypeClassifier');
const { debugLog } = require('../debug');

class SearchManager {
    constructor(webview, configManager) {
        this.webview = webview;
        this.configManager = configManager;
        this.everythingApi = new EverythingApi();
        this.fileClassifier = new FileTypeClassifier();
        this.searchTimeout = null;
        this.lastSearchTime = 0;
        this.searchDebounceMs = 300;
        this.favorites = [];
    }

    /**
     * Initialize search manager
     */
    initialize() {
        this._loadFavorites();
        this._registerMessageHandlers();
        debugLog('SearchManager', 'Search manager initialized');
    }

    /**
     * Register webview message handlers
     */
    _registerMessageHandlers() {
        if (!this.webview) return;

        // Listen for messages from webview
        this.webview.onDidReceiveMessage(async (message) => {
            switch (message.command) {
                case 'search':
                    await this._handleSearch(message);
                    break;
                case 'openFile':
                    await this._handleOpenFile(message);
                    break;
                case 'revealInExplorer':
                    await this._handleRevealInExplorer(message);
                    break;
                case 'addToFavorites':
                    await this._handleAddToFavorites(message);
                    break;
                case 'copyPath':
                    await this._handleCopyPath(message);
                    break;
                case 'getSearchConfig':
                    await this._handleGetSearchConfig();
                    break;
                case 'updateSearchConfig':
                    await this._handleUpdateSearchConfig(message);
                    break;
                case 'testEverythingConnection':
                    await this._handleTestConnection();
                    break;
            }
        });
    }

    /**
     * Handle search request
     */
    async _handleSearch(message) {
        const { keyword, scope, maxResults } = message;
        
        // Clear previous timeout
        if (this.searchTimeout) {
            clearTimeout(this.searchTimeout);
        }

        // Debounce search
        this.searchTimeout = setTimeout(async () => {
            try {
                const workspacePath = this._getWorkspacePath();
                const searchConfig = this._getSearchConfig();
                
                const options = {
                    port: searchConfig.port,
                    scope: scope || searchConfig.scope,
                    workspacePath: workspacePath,
                    maxResults: maxResults || searchConfig.maxResults,
                    type: 'all'
                };

                debugLog('SearchManager', `Searching: ${keyword}`);
                const results = await this.everythingApi.search(keyword, options);
                
                // Group by category
                const groupedResults = this.fileClassifier.groupByCategory(results);
                
                // Send results to webview
                this.webview.postMessage({
                    command: 'searchResults',
                    results: groupedResults,
                    totalCount: results.length,
                    keyword: keyword
                });
                
            } catch (error) {
                debugLog('SearchManager', `Search error: ${error.message}`);
                this.webview.postMessage({
                    command: 'searchError',
                    error: error.message
                });
            }
        }, this.searchDebounceMs);
    }

    /**
     * Handle open file request
     */
    async _handleOpenFile(message) {
        const { filePath } = message;
        
        try {
            if (!fs.existsSync(filePath)) {
                throw new Error(`File not found: ${filePath}`);
            }

            const stat = fs.statSync(filePath);
            
            if (stat.isDirectory()) {
                // Open folder in explorer
                await vscode.commands.executeCommand('revealFileInOS', vscode.Uri.file(filePath));
            } else {
                // Open file in editor
                const document = await vscode.workspace.openTextDocument(filePath);
                await vscode.window.showTextDocument(document);
            }
        } catch (error) {
            debugLog('SearchManager', `Open file error: ${error.message}`);
            vscode.window.showErrorMessage(`Cannot open file: ${error.message}`);
        }
    }

    /**
     * Handle reveal in explorer request
     */
    async _handleRevealInExplorer(message) {
        debugLog('SearchManager', '[revealInExplorer] === START ===');
        debugLog('SearchManager', `[revealInExplorer] Full message: ${JSON.stringify(message)}`);
        
        const { filePath } = message;
        
        debugLog('SearchManager', `[revealInExplorer] filePath type: ${typeof filePath}`);
        debugLog('SearchManager', `[revealInExplorer] filePath value: "${filePath}"`);
        debugLog('SearchManager', `[revealInExplorer] filePath length: ${filePath?.length}`);
        
        try {
            if (!filePath) {
                debugLog('SearchManager', '[revealInExplorer] Error: filePath is empty or undefined');
                throw new Error('File path is empty or undefined');
            }
            
            const exists = fs.existsSync(filePath);
            debugLog('SearchManager', `[revealInExplorer] File exists check: ${exists}`);
            
            if (!exists) {
                // Try to get more info about the path
                try {
                    const stat = fs.statSync(filePath);
                    debugLog('SearchManager', `[revealInExplorer] Is directory: ${stat.isDirectory()}`);
                } catch (statErr) {
                    debugLog('SearchManager', `[revealInExplorer] stat error: ${statErr.message}`);
                }
                throw new Error(`File not found: ${filePath}`);
            }

            debugLog('SearchManager', `[revealInExplorer] Executing revealFileInOS command`);
            await vscode.commands.executeCommand('revealFileInOS', vscode.Uri.file(filePath));
            debugLog('SearchManager', `[revealInExplorer] Successfully revealed: ${filePath}`);
        } catch (error) {
            debugLog('SearchManager', `[revealInExplorer] Catch error: ${error.message}`);
            debugLog('SearchManager', `[revealInExplorer] Error stack: ${error.stack}`);
            vscode.window.showErrorMessage(`Cannot reveal file: ${error.message}`);
        }
        
        debugLog('SearchManager', '[revealInExplorer] === END ===');
    }

    /**
     * Handle add to favorites request
     */
    async _handleAddToFavorites(message) {
        const { filePath, fileName } = message;
        
        try {
            // Check if already in favorites
            const exists = this.favorites.some(f => f.path === filePath);
            if (exists) {
                vscode.window.showInformationMessage(`"${fileName}" is already in favorites`);
                return;
            }

            // Add to favorites
            const favorite = {
                path: filePath,
                name: fileName,
                addedAt: new Date().toISOString()
            };
            
            this.favorites.push(favorite);
            this._saveFavorites();
            
            // Notify webview
            this.webview.postMessage({
                command: 'favoriteAdded',
                favorite: favorite
            });
            
            vscode.window.showInformationMessage(`Added "${fileName}" to favorites`);
            debugLog('SearchManager', `Added to favorites: ${filePath}`);
            
        } catch (error) {
            debugLog('SearchManager', `Add favorite error: ${error.message}`);
            vscode.window.showErrorMessage(`Cannot add to favorites: ${error.message}`);
        }
    }

    /**
     * Handle copy path request
     */
    async _handleCopyPath(message) {
        const { filePath } = message;
        
        try {
            await vscode.env.clipboard.writeText(filePath);
            vscode.window.showInformationMessage('Path copied to clipboard');
        } catch (error) {
            debugLog('SearchManager', `Copy path error: ${error.message}`);
            vscode.window.showErrorMessage(`Cannot copy path: ${error.message}`);
        }
    }

    /**
     * Handle get search config request
     */
    async _handleGetSearchConfig() {
        const config = this._getSearchConfig();
        this.webview.postMessage({
            command: 'searchConfig',
            config: config
        });
    }

    /**
     * Handle update search config request
     */
    async _handleUpdateSearchConfig(message) {
        const { config } = message;
        
        try {
            // Update individual search config properties using ConfigManager methods
            if (config.port !== undefined) {
                this.configManager.setSearchPort(config.port);
            }
            if (config.scope !== undefined) {
                this.configManager.setSearchScope(config.scope);
            }
            if (config.maxResults !== undefined) {
                this.configManager.setSearchMaxResults(config.maxResults);
            }
            
            // Get updated config to send back
            const updatedConfig = this._getSearchConfig();
            this.webview.postMessage({
                command: 'searchConfigUpdated',
                config: updatedConfig
            });
            
            debugLog('SearchManager', 'Search config updated');
        } catch (error) {
            debugLog('SearchManager', `Update config error: ${error.message}`);
        }
    }

    /**
     * Handle test Everything connection
     */
    async _handleTestConnection() {
        const config = this._getSearchConfig();
        
        try {
            const connected = await this.everythingApi.testConnection(config.port);
            this.webview.postMessage({
                command: 'connectionTestResult',
                connected: connected
            });
        } catch (error) {
            this.webview.postMessage({
                command: 'connectionTestResult',
                connected: false,
                error: error.message
            });
        }
    }

    /**
     * Get search configuration
     */
    _getSearchConfig() {
        return {
            port: this.configManager.getSearchPort(),
            scope: this.configManager.getSearchScope(),
            maxResults: this.configManager.getSearchMaxResults()
        };
    }

    /**
     * Get workspace path
     */
    _getWorkspacePath() {
        const workspaceFolders = vscode.workspace.workspaceFolders;
        if (workspaceFolders && workspaceFolders.length > 0) {
            return workspaceFolders[0].uri.fsPath;
        }
        return '';
    }

    /**
     * Load favorites from storage
     */
    _loadFavorites() {
        try {
            const config = this.configManager.getConfig();
            this.favorites = config.search?.favorites || [];
        } catch (error) {
            this.favorites = [];
        }
    }

    /**
     * Save favorites to storage
     */
    _saveFavorites() {
        try {
            const currentSearchConfig = this.configManager.getSearchConfig();
            const updatedSearchConfig = {
                ...currentSearchConfig,
                favorites: this.favorites
            };
            this.configManager.setSearchConfig(updatedSearchConfig);
        } catch (error) {
            debugLog('SearchManager', `Save favorites error: ${error.message}`);
        }
    }

    /**
     * Search with text (for command palette)
     */
    async searchWithText(text) {
        // Open webview and trigger search
        await vscode.commands.executeCommand('firmwareDownloader.showSearch');
        
        // Wait for webview to be ready
        setTimeout(() => {
            if (this.webview) {
                this.webview.postMessage({
                    command: 'triggerSearch',
                    text: text
                });
            }
        }, 500);
    }
}

module.exports = SearchManager;
