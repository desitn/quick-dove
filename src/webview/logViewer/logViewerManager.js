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
const { MarkbookManager } = require('./markbookManager');
const { localize } = require('../../localization');

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
    }

    /**
     * Open log file in viewer
     * @param {string} filePath - Path to log file
     */
    async openLogFile(filePath) {
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
            // Load file
            const success = await panelInfo.analyzer.loadFile(panelInfo.filePath);
            if (!success) {
                throw new Error('Failed to load file');
            }

            // Generate HTML
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
        
        // Generate line content HTML
        const linesHtml = lines.map(line => {
            const highlightedText = panelInfo.highlighter.buildHighlightedHtml(line.text);
            const isBookmarked = panelInfo.markbook.isBookmarked(line.lineNumber);
            const bookmarkIcon = isBookmarked ? '<i class="fa-solid fa-bookmark"></i>' : '';
            return `
                <div class="line" data-line="${line.lineNumber}">
                    <span class="line-number">${line.lineNumber}</span>
                    <span class="line-content">${highlightedText}</span>
                    <span class="bookmark-icon">${bookmarkIcon}</span>
                </div>
            `;
        }).join('');

        const templatePath = path.join(this.context.extensionPath, 'src', 'webview', 'logViewer', 'logViewer.html');
        let html = fs.readFileSync(templatePath, 'utf8');

        // Replace placeholders
        html = html.replace('{{fileName}}', path.basename(panelInfo.filePath));
        html = html.replace('{{fileInfo}}', `${fileInfo.lineCount} lines | ${fileInfo.encoding} | ${this.formatFileSize(fileInfo.fileSize)}`);
        html = html.replace('{{linesContent}}', linesHtml);
        html = html.replace('{{panelId}}', panelInfo.id);
        html = html.replace('{{isFilterView}}', 'false');
        html = html.replace('{{locale}}', this.getLocale());

        // Replace localization strings
        html = this.replaceLocalizationStrings(html);

        // Replace resource URIs
        const styleUri = panelInfo.panel.webview.asWebviewUri(
            vscode.Uri.file(path.join(this.context.extensionPath, 'src', 'webview', 'logViewer', 'logViewer.css'))
        );
        const scriptUri = panelInfo.panel.webview.asWebviewUri(
            vscode.Uri.file(path.join(this.context.extensionPath, 'src', 'webview', 'logViewer', 'logViewer.js'))
        );
        const fontAwesomeUri = panelInfo.panel.webview.asWebviewUri(
            vscode.Uri.file(path.join(this.context.extensionPath, 'src', 'webview', 'assets', 'fontawesome', 'all.min.css'))
        );

        html = html.replace('{{style.css}}', styleUri.toString());
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
            return `
                <div class="line filter-line" data-line="${line.lineNumber}" data-original-line="${line.lineNumber}">
                    <span class="line-number">${line.lineNumber}</span>
                    <span class="line-content">${highlightedText}</span>
                    <span class="bookmark-icon">${bookmarkIcon}</span>
                </div>
            `;
        }).join('');

        const templatePath = path.join(this.context.extensionPath, 'src', 'webview', 'logViewer', 'logViewer.html');
        let html = fs.readFileSync(templatePath, 'utf8');

        // Replace placeholders
        html = html.replace('{{fileName}}', `Filter: ${filterInfo.filterKeyword}`);
        html = html.replace('{{fileInfo}}', `${lines.length} matches | Original: ${path.basename(filterInfo.filePath)}`);
        html = html.replace('{{linesContent}}', linesHtml);
        html = html.replace('{{panelId}}', filterInfo.id);
        html = html.replace('{{isFilterView}}', 'true');
        html = html.replace('{{originalPanelId}}', filterInfo.originalPanelId);
        html = html.replace('{{filterKeyword}}', filterInfo.filterKeyword);
        html = html.replace('{{locale}}', this.getLocale());

        // Replace localization strings
        html = this.replaceLocalizationStrings(html);

        // Replace resource URIs
        const styleUri = filterInfo.panel.webview.asWebviewUri(
            vscode.Uri.file(path.join(this.context.extensionPath, 'src', 'webview', 'logViewer', 'logViewer.css'))
        );
        const scriptUri = filterInfo.panel.webview.asWebviewUri(
            vscode.Uri.file(path.join(this.context.extensionPath, 'src', 'webview', 'logViewer', 'logViewer.js'))
        );
        const fontAwesomeUri = filterInfo.panel.webview.asWebviewUri(
            vscode.Uri.file(path.join(this.context.extensionPath, 'src', 'webview', 'assets', 'fontawesome', 'all.min.css'))
        );

        html = html.replace('{{style.css}}', styleUri.toString());
        html = html.replace('{{logViewer.js}}', scriptUri.toString());
        html = html.replace('{{fontawesome.css}}', fontAwesomeUri.toString());

        return html;
    }

    /**
     * Get current locale
     * @returns {string} Locale string
     */
    getLocale() {
        const config = vscode.workspace.getConfiguration('quickFirmwarePlus');
        const language = config.get('language', 'auto');
        if (language === 'auto') {
            return vscode.env.language.toLowerCase();
        }
        return language.toLowerCase();
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
        
        // Refresh display
        await this.refreshPanel(panelInfo);
    }

    /**
     * Handle clear all highlights command
     * @param {Object} panelInfo - Panel info
     * @param {Object} message - Message data
     */
    async handleClearAllHighlights(panelInfo, message) {
        panelInfo.highlighter.clearAll();
        
        // Refresh display
        await this.refreshPanel(panelInfo);

        // Notify success
        panelInfo.panel.webview.postMessage({
            command: 'highlightResult',
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
        
        // Refresh display
        await this.refreshPanel(panelInfo);

        // Notify success
        panelInfo.panel.webview.postMessage({
            command: 'bookmarkResult',
            result: result
        });
    }

    /**
     * Handle remove bookmark command
     * @param {Object} panelInfo - Panel info
     * @param {Object} message - Message data
     */
    async handleRemoveBookmark(panelInfo, message) {
        const { lineNumber } = message;
        
        panelInfo.markbook.removeBookmark(lineNumber);
        
        // Refresh display
        await this.refreshPanel(panelInfo);
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
}

module.exports = { LogViewerManager };
