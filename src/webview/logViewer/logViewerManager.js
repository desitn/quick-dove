/**
 * @description: Log Viewer Manager - Manages log viewer webview panels
 *               Handles log file viewing, filtering, and tab relations
 * @author: destin.zhang@quectel.com
 */

const vscode = require('vscode');
const path = require('path');
const fs = require('fs');
const { LogAnalyzer } = require('./logAnalyzer');
const { KeywordHighlighter } = require('./keywordHighlighter');
const { LineHighlighter } = require('./lineHighlighter');
const { MarkbookManager } = require('./markbookManager');
const { localize } = require('../../localization');
const { configManager } = require('../../config/configManager');

// Storage keys for persistence
const STORAGE_KEYS = {
    RECENT_FILES: 'quickDove.logViewer.recentFiles',
    MARKBOOK_PREFIX: 'quickDove.logViewer.markbook.'
};

/**
 * Log Viewer Manager Class
 * Manages log viewer webview panels with filter tab relations
 */
class LogViewerManager {
    constructor(context) {
        this.context = context;
        this.panels = new Map();           // panelId -> panel info
        this.filterRelations = new Map();  // filterPanelId -> originalPanelId
        this.searchHistory = [];           // In-memory search history
        this.maxHistorySize = 10;
        this.maxRecentFiles = 5;           // Max recent files to store

        // Load persisted recent files list
        this.recentFiles = this.context.globalState.get(STORAGE_KEYS.RECENT_FILES, []);

        // Filter out files that no longer exist
        this.recentFiles = this.recentFiles.filter(f => fs.existsSync(f));
    }

    /**
     * Show empty panel (for first-time use)
     * User can select a log file from the empty state
     */
    async showEmptyPanel() {
        const panelId = `logViewer-${Date.now()}`;
        
        const panel = vscode.window.createWebviewPanel(
            'logViewer',
            localize('logviewer.title'),
            vscode.ViewColumn.One,
            {
                enableScripts: true,
                retainContextWhenHidden: true,
                localResourceRoots: [
                    vscode.Uri.file(path.join(this.context.extensionPath, 'src', 'webview'))
                ]
            }
        );

        // Initialize panel info with no file loaded
        const panelInfo = {
            id: panelId,
            panel: panel,
            filePath: null,
            analyzer: new LogAnalyzer(),
            highlighter: new KeywordHighlighter(),
            lineHighlighter: new LineHighlighter(),
            markbook: new MarkbookManager(),
            isFilterView: false,
            originalPanelId: null,
            filterKeyword: null,
            isEmptyState: true
        };

        this.panels.set(panelId, panelInfo);

        // Generate empty state HTML
        const html = this.generateEmptyStateHtml(panelInfo);
        panel.webview.html = html;

        // Setup message handlers
        this.setupMessageHandlers(panelInfo);

        // Handle panel disposal
        panel.onDidDispose(() => {
            this.onPanelDisposed(panelId);
        }, null, this.context.subscriptions);
    }

    /**
     * Open log file in viewer
     * @param {string} filePath - Path to log file
     * @param {Object} existingPanelInfo - Optional existing panel info to reuse
     */
    async openLogFile(filePath, existingPanelInfo = null) {
        const panelId = `logViewer-${Date.now()}`;
        
        const panel = vscode.window.createWebviewPanel(
            'logViewer',
            `Log: ${path.basename(filePath)}`,
            vscode.ViewColumn.One,
            {
                enableScripts: true,
                retainContextWhenHidden: true,
                localResourceRoots: [
                    vscode.Uri.file(path.join(this.context.extensionPath, 'src', 'webview'))
                ]
            }
        );

        // Initialize panel info
        const panelInfo = {
            id: panelId,
            panel: panel,
            filePath: filePath,
            analyzer: new LogAnalyzer(),
            highlighter: new KeywordHighlighter(),
            lineHighlighter: new LineHighlighter(),
            markbook: new MarkbookManager(),
            isFilterView: false,
            originalPanelId: null,
            filterKeyword: null
        };

        this.panels.set(panelId, panelInfo);

        // Load and display file
        await this.loadLogFile(panelInfo);

        // Setup message handlers
        this.setupMessageHandlers(panelInfo);

        // Handle panel disposal
        panel.onDidDispose(() => {
            this.onPanelDisposed(panelId);
        }, null, this.context.subscriptions);
    }

    /**
     * Create filter view (new tab)
     * @param {string} originalPanelId - Original panel ID
     * @param {string} filterKeyword - Filter keyword/pattern
     */
    async createFilterView(originalPanelId, filterKeyword) {
        const originalInfo = this.panels.get(originalPanelId);
        if (!originalInfo) return;

        const filterPanelId = `logFilter-${Date.now()}`;
        
        const panel = vscode.window.createWebviewPanel(
            'logFilter',
            `Filter: ${filterKeyword} - ${path.basename(originalInfo.filePath)}`,
            vscode.ViewColumn.Two, // Open in second column
            {
                enableScripts: true,
                retainContextWhenHidden: true,
                localResourceRoots: [
                    vscode.Uri.file(path.join(this.context.extensionPath, 'src', 'webview'))
                ]
            }
        );

        // Filter the lines
        const filteredLines = originalInfo.analyzer.filter(filterKeyword, true);

        // Initialize filter panel info
        const filterInfo = {
            id: filterPanelId,
            panel: panel,
            filePath: originalInfo.filePath,
            analyzer: originalInfo.analyzer, // Share analyzer
            highlighter: originalInfo.highlighter, // Share highlighter
            lineHighlighter: originalInfo.lineHighlighter, // Share line highlighter
            markbook: originalInfo.markbook, // Share markbook
            isFilterView: true,
            originalPanelId: originalPanelId,
            filterKeyword: filterKeyword,
            filteredLines: filteredLines
        };

        this.panels.set(filterPanelId, filterInfo);
        this.filterRelations.set(filterPanelId, originalPanelId);

        // Load filter view
        await this.loadFilterView(filterInfo);

        // Setup message handlers
        this.setupMessageHandlers(filterInfo);

        // Handle panel disposal
        panel.onDidDispose(() => {
            this.onPanelDisposed(filterPanelId);
        }, null, this.context.subscriptions);
    }

    /**
     * Load log file into panel
     * @param {Object} panelInfo - Panel info object
     */
    async loadLogFile(panelInfo) {
        try {
            // Show loading state first for better UX on large files
            const loadingHtml = this.generateLoadingHtml(panelInfo);
            panelInfo.panel.webview.html = loadingHtml;

            // Load file (this may take time for large files)
            const success = await panelInfo.analyzer.loadFile(panelInfo.filePath);
            if (!success) {
                throw new Error('Failed to load file');
            }

            // Generate HTML with actual content
            const html = this.generateLogViewerHtml(panelInfo);
            panelInfo.panel.webview.html = html;

        } catch (error) {
            vscode.window.showErrorMessage(`Failed to open log file: ${error.message}`);
        }
    }

    /**
     * Load filter view into panel
     * @param {Object} filterInfo - Filter panel info
     */
    async loadFilterView(filterInfo) {
        // Generate HTML for filter view
        const html = this.generateFilterViewHtml(filterInfo);
        filterInfo.panel.webview.html = html;
    }

    /**
     * Generate log viewer HTML
     * @param {Object} panelInfo - Panel info
     * @returns {string} HTML content
     */
    generateLogViewerHtml(panelInfo) {
        const fileInfo = panelInfo.analyzer.getFileInfo();
        const lines = panelInfo.analyzer.lines;

        // Build file info string
        let fileInfoStr = `${fileInfo.lineCount} lines | ${fileInfo.encoding} | ${this.formatFileSize(fileInfo.fileSize)}`;
        if (fileInfo.isJsonl) {
            fileInfoStr += ' | JSONL';
        }

        // Generate line content HTML
        const linesHtml = lines.map(line => {
            const highlightedText = panelInfo.highlighter.buildHighlightedHtml(line.text);
            const isBookmarked = panelInfo.markbook.isBookmarked(line.lineNumber);
            const bookmarkIcon = isBookmarked ? '<i class="fa-solid fa-bookmark"></i>' : '';

            // Check for line highlight (background color)
            const lineMatch = panelInfo.lineHighlighter.getLineMatch(line.text);
            const lineBgStyle = lineMatch ? `style="background-color: ${lineMatch.color.bg};"` : '';

            return `
                <div class="line" data-line="${line.lineNumber}" ${lineBgStyle}>
                    <span class="line-number">${line.lineNumber}</span>
                    <span class="line-content">${highlightedText}</span>
                    <span class="bookmark-icon">${bookmarkIcon}</span>
                </div>
            `;
        }).join('');

        const templatePath = path.join(this.context.extensionPath, 'src', 'webview', 'logViewer', 'logViewer.html');
        let html = fs.readFileSync(templatePath, 'utf8');

        // Set display states for file loaded view
        html = html.replace('{{emptyStateClass}}', 'hidden');
        html = html.replace('{{loadingStateClass}}', 'hidden');
        html = html.replace('{{headerDisplay}}', 'flex');
        html = html.replace('{{mainContentDisplay}}', 'flex');

        // Replace placeholders
        html = html.replace('{{fileName}}', path.basename(panelInfo.filePath));
        html = html.replace('{{fileInfo}}', fileInfoStr);
        html = html.replace('{{linesContent}}', linesHtml);
        html = html.replace('{{panelId}}', panelInfo.id);
        html = html.replace('{{isFilterView}}', 'false');
        html = html.replace('{{locale}}', this.getLocale());

        // Apply theme and accent color to HTML
        const effectiveTheme = this.getConfigEffectiveTheme();
        const accentColor = this.getAccentColor();
        html = html.replace(`<html lang="${this.getLocale()}">`, `<html lang="${this.getLocale()}" data-theme="${effectiveTheme}" data-accent="${accentColor}">`);

        // Replace localization strings
        html = this.replaceLocalizationStrings(html);

        // Replace resource URIs
        const styleUri = panelInfo.panel.webview.asWebviewUri(
            vscode.Uri.file(path.join(this.context.extensionPath, 'src', 'webview', 'style.css'))
        );
        const logViewerCssUri = panelInfo.panel.webview.asWebviewUri(
            vscode.Uri.file(path.join(this.context.extensionPath, 'src', 'webview', 'logViewer', 'logViewer.css'))
        );
        const scriptUri = panelInfo.panel.webview.asWebviewUri(
            vscode.Uri.file(path.join(this.context.extensionPath, 'src', 'webview', 'logViewer', 'logViewer.js'))
        );
        const fontAwesomeUri = panelInfo.panel.webview.asWebviewUri(
            vscode.Uri.file(path.join(this.context.extensionPath, 'src', 'webview', 'assets', 'fontawesome', 'all.min.css'))
        );

        html = html.replace('{{style.css}}', styleUri.toString());
        html = html.replace('{{logViewer.css}}', logViewerCssUri.toString());
        html = html.replace('{{logViewer.js}}', scriptUri.toString());
        html = html.replace('{{fontawesome.css}}', fontAwesomeUri.toString());

        return html;
    }

    /**
     * Generate filter view HTML
     * @param {Object} filterInfo - Filter panel info
     * @returns {string} HTML content
     */
    generateFilterViewHtml(filterInfo) {
        const lines = filterInfo.filteredLines;

        // Generate filtered line content HTML
        const linesHtml = lines.map(line => {
            const highlightedText = filterInfo.highlighter.buildHighlightedHtml(line.text);
            const isBookmarked = filterInfo.markbook.isBookmarked(line.lineNumber);
            const bookmarkIcon = isBookmarked ? '<i class="fa-solid fa-bookmark"></i>' : '';

            // Check for line highlight (background color)
            const lineMatch = filterInfo.lineHighlighter.getLineMatch(line.text);
            const lineBgStyle = lineMatch ? `style="background-color: ${lineMatch.color.bg};"` : '';

            return `
                <div class="line filter-line" data-line="${line.lineNumber}" data-original-line="${line.lineNumber}" ${lineBgStyle}>
                    <span class="line-number">${line.lineNumber}</span>
                    <span class="line-content">${highlightedText}</span>
                    <span class="bookmark-icon">${bookmarkIcon}</span>
                </div>
            `;
        }).join('');

        const templatePath = path.join(this.context.extensionPath, 'src', 'webview', 'logViewer', 'logViewer.html');
        let html = fs.readFileSync(templatePath, 'utf8');

        // Set display states for filter view (same as file loaded view)
        html = html.replace('{{emptyStateClass}}', 'hidden');
        html = html.replace('{{loadingStateClass}}', 'hidden');
        html = html.replace('{{headerDisplay}}', 'flex');
        html = html.replace('{{mainContentDisplay}}', 'flex');

        // Replace placeholders
        html = html.replace('{{fileName}}', `Filter: ${filterInfo.filterKeyword}`);
        html = html.replace('{{fileInfo}}', `${lines.length} matches | Original: ${path.basename(filterInfo.filePath)}`);
        html = html.replace('{{linesContent}}', linesHtml);
        html = html.replace('{{panelId}}', filterInfo.id);
        html = html.replace('{{isFilterView}}', 'true');
        html = html.replace('{{originalPanelId}}', filterInfo.originalPanelId);
        html = html.replace('{{filterKeyword}}', filterInfo.filterKeyword);
        html = html.replace('{{locale}}', this.getLocale());

        // Apply theme and accent color to HTML
        const effectiveTheme = this.getConfigEffectiveTheme();
        const accentColor = this.getAccentColor();
        html = html.replace(`<html lang="${this.getLocale()}">`, `<html lang="${this.getLocale()}" data-theme="${effectiveTheme}" data-accent="${accentColor}">`);

        // Replace localization strings
        html = this.replaceLocalizationStrings(html);

        // Replace resource URIs
        const styleUri = filterInfo.panel.webview.asWebviewUri(
            vscode.Uri.file(path.join(this.context.extensionPath, 'src', 'webview', 'style.css'))
        );
        const logViewerCssUri = filterInfo.panel.webview.asWebviewUri(
            vscode.Uri.file(path.join(this.context.extensionPath, 'src', 'webview', 'logViewer', 'logViewer.css'))
        );
        const scriptUri = filterInfo.panel.webview.asWebviewUri(
            vscode.Uri.file(path.join(this.context.extensionPath, 'src', 'webview', 'logViewer', 'logViewer.js'))
        );
        const fontAwesomeUri = filterInfo.panel.webview.asWebviewUri(
            vscode.Uri.file(path.join(this.context.extensionPath, 'src', 'webview', 'assets', 'fontawesome', 'all.min.css'))
        );

        html = html.replace('{{style.css}}', styleUri.toString());
        html = html.replace('{{logViewer.css}}', logViewerCssUri.toString());
        html = html.replace('{{logViewer.js}}', scriptUri.toString());
        html = html.replace('{{fontawesome.css}}', fontAwesomeUri.toString());

        return html;
    }

    /**
     * Get current locale
     * @returns {string} Locale string
     */
    getLocale() {
        // Read language from dove.json (configManager) instead of VS Code settings
        const language = configManager.getLanguage();
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
     * Get accent color from config (dove CLI theme.color)
     * @returns {string} Theme color (cyan/blue/green/magenta/yellow/red/white)
     */
    getAccentColor() {
        const { configManager } = require('../../config/configManager');
        return configManager.getThemeColor() || 'blue';
    }

    /**
     * Get effective theme from config
     * @returns {string} Effective theme (dark/light)
     */
    getConfigEffectiveTheme() {
        const { configManager } = require('../../config/configManager');
        const themeMode = configManager.getThemeMode() || 'auto';
        return this.getEffectiveTheme(themeMode);
    }

    /**
     * Replace localization strings in HTML
     * @param {string} html - HTML content
     * @returns {string} HTML with localized strings
     */
    replaceLocalizationStrings(html) {
        // Replace all {{logviewer.xxx}} placeholders
        const logViewerKeys = [
            'title', 'search', 'filter', 'markbook', 'tools',
            'searchPlaceholder', 'filterPlaceholder', 'noResults', 'resultsCount',
            'caseSensitive', 'wholeWord', 'useRegex', 'prevMatch', 'nextMatch',
            'clearSearch', 'applyFilter', 'clearFilter', 'addToMarkbook',
            'removeFromMarkbook', 'clearMarkbook', 'jumpToLine', 'syncWithOriginal',
            'highlightColor', 'highlightAll', 'clearHighlight', 'hexToStr', 'strToHex',
            'hexConverter', 'programmerCalc', 'inputHex', 'inputDec', 'inputOct', 'inputBin',
            'line', 'content', 'noFile', 'loading', 'loadError', 'fileTooLarge',
            'noMarkbookItems', 'bookmarkAdded', 'bookmarkRemoved', 'filterApplied',
            'filterCleared', 'searchCompleted', 'encoding', 'encodingAuto',
            'encodingUtf8', 'encodingGbk', 'encodingLatin1'
        ];

        logViewerKeys.forEach(key => {
            const placeholder = `{{logviewer.${key}}}`;
            const value = localize(`logviewer.${key}`);
            html = html.replace(new RegExp(placeholder, 'g'), value);
        });

        return html;
    }

    /**
     * Setup message handlers for panel
     * @param {Object} panelInfo - Panel info
     */
    setupMessageHandlers(panelInfo) {
        panelInfo.panel.webview.onDidReceiveMessage(
            async (message) => {
                switch (message.command) {
                    case 'selectLogFile':
                        await this.handleSelectLogFile(panelInfo);
                        break;
                    case 'openRecentFile':
                        await this.handleOpenRecentFile(panelInfo, message);
                        break;
                    case 'getRecentFiles':
                        await this.handleGetRecentFiles(panelInfo);
                        break;
                    case 'clearRecentFiles':
                        await this.handleClearRecentFiles(panelInfo);
                        break;
                    case 'search':
                        await this.handleSearch(panelInfo, message);
                        break;
                    case 'filter':
                        await this.handleFilter(panelInfo, message);
                        break;
                    case 'highlight':
                        await this.handleHighlight(panelInfo, message);
                        break;
                    case 'removeHighlight':
                        await this.handleRemoveHighlight(panelInfo, message);
                        break;
                    case 'clearAllHighlights':
                        await this.handleClearAllHighlights(panelInfo, message);
                        break;
                    case 'highlightLine':
                        await this.handleHighlightLine(panelInfo, message);
                        break;
                    case 'removeLineHighlight':
                        await this.handleRemoveLineHighlight(panelInfo, message);
                        break;
                    case 'clearAllLineHighlights':
                        await this.handleClearAllLineHighlights(panelInfo, message);
                        break;
                    case 'addBookmark':
                        await this.handleAddBookmark(panelInfo, message);
                        break;
                    case 'removeBookmark':
                        await this.handleRemoveBookmark(panelInfo, message);
                        break;
                    case 'gotoLine':
                        await this.handleGotoLine(panelInfo, message);
                        break;
                    case 'syncToOriginal':
                        await this.handleSyncToOriginal(panelInfo, message);
                        break;
                    case 'getSearchHistory':
                        await this.handleGetSearchHistory(panelInfo);
                        break;
                    case 'getBookmarks':
                        await this.handleGetBookmarks(panelInfo);
                        break;
                    case 'openTools':
                        await this.handleOpenTools(panelInfo);
                        break;
                }
            },
            undefined,
            this.context.subscriptions
        );
    }

    /**
     * Handle select log file command (from empty state)
     * @param {Object} panelInfo - Panel info
     */
    async handleSelectLogFile(panelInfo) {
        const fileUri = await vscode.window.showOpenDialog({
            canSelectFiles: true,
            canSelectFolders: false,
            canSelectMany: false,
            openLabel: localize('logviewer.selectFile'),
            filters: {
                'Log Files': ['log', 'txt', 'out', 'err', 'jsonl'],
                'JSON Lines': ['jsonl'],
                'All Files': ['*']
            }
        });

        if (fileUri && fileUri.length > 0) {
            const filePath = fileUri[0].fsPath;
            await this.loadFileIntoPanel(panelInfo, filePath);
        }
    }

    /**
     * Handle open recent file command
     * @param {Object} panelInfo - Panel info
     * @param {Object} message - Message data
     */
    async handleOpenRecentFile(panelInfo, message) {
        const filePath = message.filePath;
        if (filePath && fs.existsSync(filePath)) {
            await this.loadFileIntoPanel(panelInfo, filePath);
        } else {
            vscode.window.showErrorMessage(localize('logviewer.fileNotFound'));
        }
    }

    /**
     * Handle get recent files command
     * @param {Object} panelInfo - Panel info
     */
    async handleGetRecentFiles(panelInfo) {
        const recentFiles = this.getRecentFiles();
        panelInfo.panel.webview.postMessage({
            command: 'recentFiles',
            files: recentFiles
        });
    }

    /**
     * Handle clear recent files command
     * @param {Object} panelInfo - Panel info
     */
    async handleClearRecentFiles(panelInfo) {
        this.clearRecentFiles();
        panelInfo.panel.webview.postMessage({
            command: 'recentFilesCleared',
            files: []
        });
    }

    /**
     * Handle search command
     * @param {Object} panelInfo - Panel info
     * @param {Object} message - Message data
     */
    async handleSearch(panelInfo, message) {
        const { keyword, useRegex } = message;
        
        // Add to history
        this.addToSearchHistory(keyword);

        // Perform search
        const results = panelInfo.analyzer.search(keyword, useRegex);

        // Send results back
        panelInfo.panel.webview.postMessage({
            command: 'searchResults',
            keyword: keyword,
            results: results,
            totalCount: results.length
        });
    }

    /**
     * Handle filter command
     * @param {Object} panelInfo - Panel info
     * @param {Object} message - Message data
     */
    async handleFilter(panelInfo, message) {
        const { keyword, useRegex } = message;
        
        // Create filter view
        await this.createFilterView(panelInfo.id, keyword);
    }

    /**
     * Handle highlight command
     * @param {Object} panelInfo - Panel info
     * @param {Object} message - Message data
     */
    async handleHighlight(panelInfo, message) {
        const { keyword, useRegex } = message;
        console.log('[Backend] handleHighlight called with keyword:', keyword, 'useRegex:', useRegex);
        
        const result = panelInfo.highlighter.toggleHighlight(keyword, useRegex);
        console.log('[Backend] toggleHighlight result:', result);
        console.log('[Backend] Current highlights count:', panelInfo.highlighter.getHighlightCount());
        
        // Refresh display to apply highlighting (partial update for better performance)
        await this.refreshPanel(panelInfo, keyword);
        console.log('[Backend] Panel refreshed (partial update for keyword:', keyword, ')');

        // Notify success
        panelInfo.panel.webview.postMessage({
            command: 'highlightResult',
            result: result
        });
        console.log('[Backend] highlightResult message sent to webview');

        // Send next color for the menu icon
        await this.sendNextHighlightColor(panelInfo);
    }

    /**
     * Handle remove highlight command
     * @param {Object} panelInfo - Panel info
     * @param {Object} message - Message data
     */
    async handleRemoveHighlight(panelInfo, message) {
        const { keyword } = message;

        panelInfo.highlighter.removeHighlight(keyword);

        // Only update lines containing the removed keyword (no full refresh)
        await this.updateAffectedLines(panelInfo, keyword);
    }

    /**
     * Handle clear all highlights command
     * @param {Object} panelInfo - Panel info
     * @param {Object} message - Message data
     */
    async handleClearAllHighlights(panelInfo, message) {
        // Get all highlighted keywords before clearing
        const highlightedKeywords = panelInfo.highlighter.getAllHighlights().map(h => h.keyword);

        panelInfo.highlighter.clearAll();

        // Send command to webview to clear highlights (no full page refresh)
        panelInfo.panel.webview.postMessage({
            command: 'clearHighlightsDisplay',
            keywords: highlightedKeywords
        });

        // Notify success
        panelInfo.panel.webview.postMessage({
            command: 'highlightResult',
            result: { action: 'cleared', keyword: 'all' }
        });

        // Send next color for the menu icon
        await this.sendNextHighlightColor(panelInfo);
    }

    /**
     * Handle highlight line command
     * @param {Object} panelInfo - Panel info
     * @param {Object} message - Message data
     */
    async handleHighlightLine(panelInfo, message) {
        const { keyword, useRegex } = message;

        const result = panelInfo.lineHighlighter.toggleLineHighlight(keyword, useRegex);

        // Send command to webview to update line backgrounds
        const lines = panelInfo.isFilterView ? panelInfo.filteredLines : panelInfo.analyzer.lines;
        const matchingKeywords = panelInfo.lineHighlighter.getAllLineHighlights();

        panelInfo.panel.webview.postMessage({
            command: 'updateLineHighlights',
            keywords: matchingKeywords.map(h => ({ keyword: h.keyword, color: h.color }))
        });

        // Notify success
        panelInfo.panel.webview.postMessage({
            command: 'lineHighlightResult',
            result: result
        });
    }

    /**
     * Handle remove line highlight command
     * @param {Object} panelInfo - Panel info
     * @param {Object} message - Message data
     */
    async handleRemoveLineHighlight(panelInfo, message) {
        const { keyword } = message;

        panelInfo.lineHighlighter.removeLineHighlight(keyword);

        // Send command to webview to update line backgrounds
        const matchingKeywords = panelInfo.lineHighlighter.getAllLineHighlights();

        panelInfo.panel.webview.postMessage({
            command: 'updateLineHighlights',
            keywords: matchingKeywords.map(h => ({ keyword: h.keyword, color: h.color }))
        });
    }

    /**
     * Handle clear all line highlights command
     * @param {Object} panelInfo - Panel info
     * @param {Object} message - Message data
     */
    async handleClearAllLineHighlights(panelInfo, message) {
        panelInfo.lineHighlighter.clearAll();

        // Send command to webview to clear all line backgrounds
        panelInfo.panel.webview.postMessage({
            command: 'clearLineHighlightsDisplay'
        });

        // Notify success
        panelInfo.panel.webview.postMessage({
            command: 'lineHighlightResult',
            result: { action: 'cleared', keyword: 'all' }
        });
    }

    /**
     * Handle add bookmark command
     * @param {Object} panelInfo - Panel info
     * @param {Object} message - Message data
     */
    async handleAddBookmark(panelInfo, message) {
        const { lineNumber, text, note } = message;

        const result = panelInfo.markbook.toggleBookmark(lineNumber, text, note);

        // Only update the affected line's bookmark icon (no full refresh)
        const isBookmarked = panelInfo.markbook.isBookmarked(lineNumber);
        panelInfo.panel.webview.postMessage({
            command: 'updateBookmarkIcon',
            lineNumber: lineNumber,
            isBookmarked: isBookmarked
        });

        // Notify success
        panelInfo.panel.webview.postMessage({
            command: 'bookmarkResult',
            result: result
        });

        // Persist markbook data
        this.saveMarkbook(panelInfo);
    }

    /**
     * Handle remove bookmark command
     * @param {Object} panelInfo - Panel info
     * @param {Object} message - Message data
     */
    async handleRemoveBookmark(panelInfo, message) {
        const { lineNumber } = message;

        panelInfo.markbook.removeBookmark(lineNumber);

        // Only update the affected line's bookmark icon (no full refresh)
        panelInfo.panel.webview.postMessage({
            command: 'updateBookmarkIcon',
            lineNumber: lineNumber,
            isBookmarked: false
        });

        // Persist markbook data
        this.saveMarkbook(panelInfo);
    }

    /**
     * Handle goto line command
     * @param {Object} panelInfo - Panel info
     * @param {Object} message - Message data
     */
    async handleGotoLine(panelInfo, message) {
        const { lineNumber } = message;
        
        // Scroll to line in webview
        panelInfo.panel.webview.postMessage({
            command: 'scrollToLine',
            lineNumber: lineNumber
        });
    }

    /**
     * Handle sync to original command (from filter view)
     * @param {Object} filterInfo - Filter panel info
     * @param {Object} message - Message data
     */
    async handleSyncToOriginal(filterInfo, message) {
        const { lineNumber } = message;
        const originalPanelId = filterInfo.originalPanelId;
        const originalInfo = this.panels.get(originalPanelId);
        
        if (originalInfo) {
            // Reveal original panel
            originalInfo.panel.reveal();
            
            // Scroll to line in original panel
            originalInfo.panel.webview.postMessage({
                command: 'scrollToLine',
                lineNumber: lineNumber
            });
        }
    }

    /**
     * Handle get search history command
     * @param {Object} panelInfo - Panel info
     */
    async handleGetSearchHistory(panelInfo) {
        panelInfo.panel.webview.postMessage({
            command: 'searchHistory',
            history: this.searchHistory
        });
    }

    /**
     * Send next highlight color to webview
     * @param {Object} panelInfo - Panel info
     */
    async sendNextHighlightColor(panelInfo) {
        const nextColor = panelInfo.highlighter.getNextColor();
        panelInfo.panel.webview.postMessage({
            command: 'nextHighlightColor',
            color: nextColor
        });
    }

    /**
     * Handle get bookmarks command
     * @param {Object} panelInfo - Panel info
     */
    async handleGetBookmarks(panelInfo) {
        const bookmarks = panelInfo.markbook.getAllBookmarks();
        panelInfo.panel.webview.postMessage({
            command: 'bookmarks',
            bookmarks: bookmarks
        });
    }

    /**
     * Handle open tools command
     * @param {Object} panelInfo - Panel info
     */
    async handleOpenTools(panelInfo) {
        panelInfo.panel.webview.postMessage({
            command: 'showTools'
        });
    }

    /**
     * Refresh panel display - optimized to only update affected lines
     * @param {Object} panelInfo - Panel info
     * @param {string} affectedKeyword - Optional keyword that was added/removed (for partial update)
     */
    async refreshPanel(panelInfo, affectedKeyword = null) {
        if (affectedKeyword) {
            // Partial update: only update lines containing the affected keyword
            await this.updateAffectedLines(panelInfo, affectedKeyword);
        } else {
            // Full refresh (fallback)
            if (panelInfo.isFilterView) {
                panelInfo.filteredLines = panelInfo.analyzer.filter(panelInfo.filterKeyword, true);
                panelInfo.panel.webview.html = this.generateFilterViewHtml(panelInfo);
            } else {
                panelInfo.panel.webview.html = this.generateLogViewerHtml(panelInfo);
            }
        }
    }

    /**
     * Update only lines affected by a keyword change
     * @param {Object} panelInfo - Panel info
     * @param {string} keyword - The keyword that was added/removed
     */
    async updateAffectedLines(panelInfo, keyword) {
        const lines = panelInfo.isFilterView ? panelInfo.filteredLines : panelInfo.analyzer.lines;
        
        // Find all line numbers that contain the keyword
        const affectedLineNumbers = [];
        const escapedKeyword = this.escapeRegex(keyword);
        const regex = new RegExp(escapedKeyword, 'g');
        
        for (const line of lines) {
            if (regex.test(line.text)) {
                affectedLineNumbers.push(line.lineNumber);
            }
            regex.lastIndex = 0; // Reset regex for next test
        }
        
        if (affectedLineNumbers.length === 0) {
            return; // No lines affected
        }
        
        // Send update command to webview with affected lines
        panelInfo.panel.webview.postMessage({
            command: 'updateLines',
            lineNumbers: affectedLineNumbers,
            lines: lines.filter(l => affectedLineNumbers.includes(l.lineNumber)).map(line => {
                const highlightedText = panelInfo.highlighter.buildHighlightedHtml(line.text);
                const isBookmarked = panelInfo.markbook.isBookmarked(line.lineNumber);
                return {
                    lineNumber: line.lineNumber,
                    highlightedText: highlightedText,
                    isBookmarked: isBookmarked
                };
            })
        });
    }

    /**
     * Escape special regex characters
     * @param {string} string - String to escape
     * @returns {string} Escaped string
     */
    escapeRegex(string) {
        return string.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    }

    /**
     * Add keyword to search history
     * @param {string} keyword - Search keyword
     */
    addToSearchHistory(keyword) {
        // Remove if exists
        const index = this.searchHistory.indexOf(keyword);
        if (index > -1) {
            this.searchHistory.splice(index, 1);
        }
        
        // Add to front
        this.searchHistory.unshift(keyword);
        
        // Limit size
        if (this.searchHistory.length > this.maxHistorySize) {
            this.searchHistory.pop();
        }
    }

    /**
     * Handle panel disposal
     * @param {string} panelId - Panel ID
     */
    onPanelDisposed(panelId) {
        const panelInfo = this.panels.get(panelId);
        if (panelInfo) {
            // If this is a filter view, clean up relation
            if (panelInfo.isFilterView) {
                this.filterRelations.delete(panelId);
            }
            
            // If this is original panel, close related filter views
            if (!panelInfo.isFilterView) {
                for (const [filterId, originalId] of this.filterRelations) {
                    if (originalId === panelId) {
                        const filterInfo = this.panels.get(filterId);
                        if (filterInfo) {
                            filterInfo.panel.dispose();
                        }
                    }
                }
            }
            
            this.panels.delete(panelId);
        }
    }

    /**
     * Format file size
     * @param {number} bytes - Size in bytes
     * @returns {string} Formatted size
     */
    formatFileSize(bytes) {
        if (bytes === 0) return '0 B';
        const k = 1024;
        const sizes = ['B', 'KB', 'MB', 'GB'];
        const i = Math.floor(Math.log(bytes) / Math.log(k));
        return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i];
    }

    /**
     * Generate loading state HTML
     * @param {Object} panelInfo - Panel info
     * @returns {string} HTML content
     */
    generateLoadingHtml(panelInfo) {
        const templatePath = path.join(this.context.extensionPath, 'src', 'webview', 'logViewer', 'logViewer.html');
        let html = fs.readFileSync(templatePath, 'utf8');

        // Set display states for loading view
        html = html.replace('{{emptyStateClass}}', 'hidden');
        html = html.replace('{{loadingStateClass}}', '');
        html = html.replace('{{headerDisplay}}', 'none');
        html = html.replace('{{mainContentDisplay}}', 'none');

        // Replace placeholders
        html = html.replace('{{fileName}}', path.basename(panelInfo.filePath));
        html = html.replace('{{fileInfo}}', localize('logviewer.loading'));
        html = html.replace('{{linesContent}}', '');
        html = html.replace('{{panelId}}', panelInfo.id);
        html = html.replace('{{isFilterView}}', 'false');
        html = html.replace('{{locale}}', this.getLocale());

        // Apply theme and accent color to HTML
        const effectiveTheme = this.getConfigEffectiveTheme();
        const accentColor = this.getAccentColor();
        html = html.replace(`<html lang="${this.getLocale()}">`, `<html lang="${this.getLocale()}" data-theme="${effectiveTheme}" data-accent="${accentColor}">`);

        // Replace localization strings
        html = this.replaceLocalizationStrings(html);

        // Replace resource URIs
        const styleUri = panelInfo.panel.webview.asWebviewUri(
            vscode.Uri.file(path.join(this.context.extensionPath, 'src', 'webview', 'style.css'))
        );
        const logViewerCssUri = panelInfo.panel.webview.asWebviewUri(
            vscode.Uri.file(path.join(this.context.extensionPath, 'src', 'webview', 'logViewer', 'logViewer.css'))
        );
        const scriptUri = panelInfo.panel.webview.asWebviewUri(
            vscode.Uri.file(path.join(this.context.extensionPath, 'src', 'webview', 'logViewer', 'logViewer.js'))
        );
        const fontAwesomeUri = panelInfo.panel.webview.asWebviewUri(
            vscode.Uri.file(path.join(this.context.extensionPath, 'src', 'webview', 'assets', 'fontawesome', 'all.min.css'))
        );

        html = html.replace('{{style.css}}', styleUri.toString());
        html = html.replace('{{logViewer.css}}', logViewerCssUri.toString());
        html = html.replace('{{logViewer.js}}', scriptUri.toString());
        html = html.replace('{{fontawesome.css}}', fontAwesomeUri.toString());

        return html;
    }

    /**
     * Generate empty state HTML for first-time use
     * @param {Object} panelInfo - Panel info
     * @returns {string} HTML content
     */
    generateEmptyStateHtml(panelInfo) {
        const templatePath = path.join(this.context.extensionPath, 'src', 'webview', 'logViewer', 'logViewer.html');
        let html = fs.readFileSync(templatePath, 'utf8');

        // Set display states for empty state view
        html = html.replace('{{emptyStateClass}}', '');
        html = html.replace('{{loadingStateClass}}', 'hidden');
        html = html.replace('{{headerDisplay}}', 'none');
        html = html.replace('{{mainContentDisplay}}', 'none');

        // Replace placeholders for empty state
        html = html.replace('{{fileName}}', localize('logviewer.title'));
        html = html.replace('{{fileInfo}}', '');
        html = html.replace('{{linesContent}}', '');
        html = html.replace('{{panelId}}', panelInfo.id);
        html = html.replace('{{isFilterView}}', 'false');
        html = html.replace('{{originalPanelId}}', '');
        html = html.replace('{{filterKeyword}}', '');
        html = html.replace('{{locale}}', this.getLocale());

        // Apply theme and accent color to HTML
        const effectiveTheme = this.getConfigEffectiveTheme();
        const accentColor = this.getAccentColor();
        html = html.replace(`<html lang="${this.getLocale()}">`, `<html lang="${this.getLocale()}" data-theme="${effectiveTheme}" data-accent="${accentColor}">`);

        // Replace localization strings
        html = this.replaceLocalizationStrings(html);

        // Add empty state specific strings
        html = html.replace('{{logviewer.emptyDesc}}', localize('logviewer.emptyDesc'));
        html = html.replace('{{logviewer.selectFile}}', localize('logviewer.selectFile'));
        html = html.replace('{{logviewer.supportedFormats}}', localize('logviewer.supportedFormats'));
        html = html.replace('{{logviewer.recentFiles}}', localize('logviewer.recentFiles'));
        html = html.replace('{{logviewer.clearRecentFiles}}', localize('logviewer.clearRecentFiles'));

        // Replace resource URIs
        const styleUri = panelInfo.panel.webview.asWebviewUri(
            vscode.Uri.file(path.join(this.context.extensionPath, 'src', 'webview', 'style.css'))
        );
        const logViewerCssUri = panelInfo.panel.webview.asWebviewUri(
            vscode.Uri.file(path.join(this.context.extensionPath, 'src', 'webview', 'logViewer', 'logViewer.css'))
        );
        const scriptUri = panelInfo.panel.webview.asWebviewUri(
            vscode.Uri.file(path.join(this.context.extensionPath, 'src', 'webview', 'logViewer', 'logViewer.js'))
        );
        const fontAwesomeUri = panelInfo.panel.webview.asWebviewUri(
            vscode.Uri.file(path.join(this.context.extensionPath, 'src', 'webview', 'assets', 'fontawesome', 'all.min.css'))
        );

        html = html.replace('{{style.css}}', styleUri.toString());
        html = html.replace('{{logViewer.css}}', logViewerCssUri.toString());
        html = html.replace('{{logViewer.js}}', scriptUri.toString());
        html = html.replace('{{fontawesome.css}}', fontAwesomeUri.toString());

        return html;
    }

    /**
     * Add file to recent files list
     * @param {string} filePath - File path
     */
    addToRecentFiles(filePath) {
        // Remove if exists
        const index = this.recentFiles.indexOf(filePath);
        if (index > -1) {
            this.recentFiles.splice(index, 1);
        }

        // Add to front
        this.recentFiles.unshift(filePath);

        // Limit size
        if (this.recentFiles.length > this.maxRecentFiles) {
            this.recentFiles.pop();
        }

        // Persist to globalState
        this.context.globalState.update(STORAGE_KEYS.RECENT_FILES, this.recentFiles);
    }

    /**
     * Get recent files list
     * @returns {Array} Recent files
     */
    getRecentFiles() {
        return this.recentFiles;
    }

    /**
     * Clear all recent files history
     */
    clearRecentFiles() {
        this.recentFiles = [];
        this.context.globalState.update(STORAGE_KEYS.RECENT_FILES, []);
    }

    /**
     * Clear markbook data for a specific file
     * @param {string} filePath - File path
     */
    clearMarkbook(filePath) {
        const fileHash = this.getFileHash(filePath);
        const key = STORAGE_KEYS.MARKBOOK_PREFIX + fileHash;
        this.context.globalState.update(key, undefined);
    }

    /**
     * Clear all markbook data from storage
     */
    clearAllMarkbooks() {
        // Get all keys and delete those starting with MARKBOOK_PREFIX
        const keys = this.context.globalState.keys();
        for (const key of keys) {
            if (key.startsWith(STORAGE_KEYS.MARKBOOK_PREFIX)) {
                this.context.globalState.update(key, undefined);
            }
        }
    }

    /**
     * Generate a hash key from file path for storage
     * @param {string} filePath - File path
     * @returns {string} Hash key
     */
    getFileHash(filePath) {
        // Use base64 encoding as simplified hash
        return Buffer.from(filePath).toString('base64').replace(/[/+=]/g, '_');
    }

    /**
     * Save markbook data for a file to globalState
     * @param {Object} panelInfo - Panel info with file path and markbook
     */
    saveMarkbook(panelInfo) {
        if (!panelInfo.filePath) return;

        const fileHash = this.getFileHash(panelInfo.filePath);
        const key = STORAGE_KEYS.MARKBOOK_PREFIX + fileHash;
        const data = panelInfo.markbook.serialize();

        this.context.globalState.update(key, data);
    }

    /**
     * Load markbook data from globalState for a file
     * @param {Object} panelInfo - Panel info to load markbook into
     */
    loadMarkbook(panelInfo) {
        if (!panelInfo.filePath) return;

        const fileHash = this.getFileHash(panelInfo.filePath);
        const key = STORAGE_KEYS.MARKBOOK_PREFIX + fileHash;
        const data = this.context.globalState.get(key, null);

        if (data) {
            panelInfo.markbook.deserialize(data);
        }
    }

    /**
     * Load file into existing empty panel
     * @param {Object} panelInfo - Existing panel info
     * @param {string} filePath - File path to load
     */
    async loadFileIntoPanel(panelInfo, filePath) {
        try {
            // Update panel info for loading
            panelInfo.filePath = filePath;

            // Show loading state first for better UX on large files
            const loadingHtml = this.generateLoadingHtml(panelInfo);
            panelInfo.panel.webview.html = loadingHtml;

            // Load file (this may take time for large files)
            const success = await panelInfo.analyzer.loadFile(filePath);
            if (!success) {
                throw new Error('Failed to load file');
            }

            // Update panel info
            panelInfo.isEmptyState = false;

            // Add to recent files
            this.addToRecentFiles(filePath);

            // Load persisted markbook data for this file
            this.loadMarkbook(panelInfo);

            // Update panel title
            panelInfo.panel.title = `Log: ${path.basename(filePath)}`;

            // Generate new HTML with file content
            const html = this.generateLogViewerHtml(panelInfo);
            panelInfo.panel.webview.html = html;

        } catch (error) {
            vscode.window.showErrorMessage(`Failed to open log file: ${error.message}`);
        }
    }
}

module.exports = { LogViewerManager };
