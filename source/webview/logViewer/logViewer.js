/**
 * @description: Log Viewer Frontend Logic
 *               Handles UI interactions and communication with extension
 * @author: destin.zhang@quectel.com
 */

(function() {
    // VS Code API
    const vscode = acquireVsCodeApi();

    // State
    let currentSelection = '';
    let currentLineNumber = null;
    let isFilterView = false;
    let originalPanelId = null;

    // DOM Elements
    const container = document.querySelector('.log-viewer-container');
    const linesContainer = document.getElementById('linesContainer');
    const searchPanel = document.getElementById('searchPanel');
    const filterPanel = document.getElementById('filterPanel');
    const markbookPanel = document.getElementById('markbookPanel');
    const toolsPanel = document.getElementById('toolsPanel');
    const contextMenu = document.getElementById('contextMenu');
    const notification = document.getElementById('notification');
    const resizeHandle = document.getElementById('resizeHandle');

    // Resize state
    let isResizing = false;
    let startX = 0;
    let startWidth = 280;

    // Search result navigation state
    let selectedSearchIndex = -1;
    let searchResultItems = [];

    // Pagination state (incremental loading)
    let isTabular = container.dataset.tabular === 'true';
    let totalLines = parseInt(container.dataset.totalLines || '0', 10);
    let pageSize = parseInt(container.dataset.pageSize || '500', 10);
    let loadedStart = 0;
    let loadedCount = parseInt(container.dataset.loadedCount || '0', 10);
    let isLoadingMore = false;
    let pendingGotoLine = null;

    // Column layout state (tabular files)
    let columnCount = parseInt(container.dataset.colCount || '0', 10);
    let columnWidths = [];
    let defaultColumnWidths = [];
    let columnVisibility = [];

    // Initialize
    function init() {
        // Get panel info from data attributes
        isFilterView = container.dataset.isFilterView === 'true';
        originalPanelId = container.dataset.originalPanelId;

        setupEventListeners();
        setupMessageHandlers();

        // Check if in empty state (no file loaded)
        const emptyStateContainer = document.getElementById('emptyStateContainer');
        const loadingContainer = document.getElementById('loadingContainer');

        if (emptyStateContainer && !emptyStateContainer.classList.contains('hidden')) {
            // Request recent files for empty state
            vscode.postMessage({ command: 'getRecentFiles' });
        } else if (loadingContainer && !loadingContainer.classList.contains('hidden')) {
            // In loading state, wait for content
        } else {
            // File already loaded - trigger fade-in animation
            triggerContentFadeIn();
            // Request initial data for loaded file
            vscode.postMessage({ command: 'getBookmarks' });
            vscode.postMessage({ command: 'getSearchHistory' });
        }

        // Tabular table: column layout + settings button
        if (isTabular) {
            initColumnLayout();
            const btnColumnSettings = document.getElementById('btnColumnSettings');
            if (btnColumnSettings) {
                btnColumnSettings.style.display = 'inline-flex';
            }
            buildColumnSettingsList();
            setupColumnResize();
            setupHeaderClick();
        }

        // Incremental pagination (scroll to load more)
        setupScrollPagination();
    }

    // Trigger fade-in animation for content
    function triggerContentFadeIn() {
        const contentWrapper = document.querySelector('.content-wrapper');
        const linesContainer = document.getElementById('linesContainer');
        if (contentWrapper) {
            setTimeout(() => contentWrapper.classList.add('loaded'), 50);
        }
        if (linesContainer) {
            setTimeout(() => linesContainer.classList.add('loaded'), 50);
        }
    }

    // ==================== Incremental Pagination ====================

    function setupScrollPagination() {
        const wrapper = document.querySelector('.content-wrapper');
        if (wrapper) {
            wrapper.addEventListener('scroll', handleScroll);
        }
    }

    function handleScroll() {
        const wrapper = document.querySelector('.content-wrapper');
        if (!wrapper) return;
        if (wrapper.scrollTop + wrapper.clientHeight >= wrapper.scrollHeight - 300) {
            loadMoreLines();
        }
    }

    function loadMoreLines(targetLine = null) {
        if (isLoadingMore) return;
        if (loadedStart + loadedCount >= totalLines) return;
        isLoadingMore = true;
        vscode.postMessage({
            command: 'loadMoreLines',
            offset: loadedStart + loadedCount,
            count: pageSize,
            targetLine: targetLine != null ? targetLine : undefined
        });
    }

    function handleAppendLines(message) {
        const { html, startOffset, nextOffset, hasMore, replace } = message;
        isLoadingMore = false;

        if (html) {
            if (replace) {
                // Jump mode: replace all rendered data rows, keep the header row
                linesContainer.querySelectorAll('.line:not(.table-header-line)').forEach(el => el.remove());
            }
            const temp = document.createElement('div');
            temp.innerHTML = html;
            const frag = document.createDocumentFragment();
            while (temp.firstChild) {
                frag.appendChild(temp.firstChild);
            }
            linesContainer.appendChild(frag);
        }

        if (typeof startOffset === 'number') {
            loadedStart = startOffset;
            loadedCount = nextOffset - startOffset;
        }

        if (isTabular) {
            applyColumnLayout();
        }

        // Jump to a line that wasn't loaded yet
        if (pendingGotoLine != null) {
            const targetLine = pendingGotoLine;
            const lineElement = document.querySelector(`.line[data-line="${targetLine}"]`);
            if (lineElement) {
                pendingGotoLine = null;
                scrollToLineElement(lineElement, targetLine);
            } else if (hasMore) {
                loadMoreLines(targetLine);
            } else {
                pendingGotoLine = null;
                showNotification(`Line ${targetLine} not found`, 'error');
            }
        }

        // Auto-continue if the viewport is still near the bottom
        const wrapper = document.querySelector('.content-wrapper');
        if (!replace && wrapper && wrapper.scrollTop + wrapper.clientHeight >= wrapper.scrollHeight - 300) {
            loadMoreLines();
        }
    }

    // ==================== Tabular Column Layout ====================

    function initColumnLayout() {
        if (!isTabular) return;
        let widths = [];
        try {
            widths = JSON.parse(container.dataset.columnWidths || '[]');
        } catch (e) {
            widths = [];
        }
        columnWidths = widths.slice(0, columnCount);
        defaultColumnWidths = widths.slice(0, columnCount);
        while (columnWidths.length < columnCount) {
            columnWidths.push(120);
        }
        columnVisibility = columnWidths.map(() => true);
        applyColumnLayout();
    }

    function applyColumnLayout() {
        if (!isTabular) return;
        const visible = [];
        columnVisibility.forEach((v, i) => {
            if (v) visible.push(i);
        });
        const template = visible.map(i => `${columnWidths[i]}px`).join(' ');
        document.querySelectorAll('.line-content.tabular-content').forEach(el => {
            el.style.gridTemplateColumns = template;
            el.querySelectorAll(':scope > .tabular-cell').forEach(cell => {
                const col = parseInt(cell.dataset.col, 10);
                if (Number.isNaN(col) || col < 0) return;
                if (columnVisibility[col]) {
                    cell.classList.remove('hidden');
                    cell.style.gridColumn = String(visible.indexOf(col) + 1);
                } else {
                    cell.classList.add('hidden');
                }
            });
        });
    }

    function setupColumnResize() {
        document.querySelectorAll('.table-header-line .col-resize-handle').forEach(handle => {
            handle.addEventListener('mousedown', (e) => {
                e.preventDefault();
                e.stopPropagation();
                const col = parseInt(handle.dataset.col, 10);
                if (Number.isNaN(col)) return;
                const startX = e.clientX;
                const startWidth = columnWidths[col] || 120;
                const onMove = (ev) => {
                    const newWidth = Math.max(40, Math.min(3000, startWidth + (ev.clientX - startX)));
                    columnWidths[col] = newWidth;
                    applyColumnLayout();
                    syncColumnSettingsInputs();
                };
                const onUp = () => {
                    handle.classList.remove('dragging');
                    document.removeEventListener('mousemove', onMove);
                    document.removeEventListener('mouseup', onUp);
                };
                handle.classList.add('dragging');
                document.addEventListener('mousemove', onMove);
                document.addEventListener('mouseup', onUp);
            });
        });
    }

    function setupHeaderClick() {
        document.querySelectorAll('.table-header-line .tabular-cell').forEach(cell => {
            cell.addEventListener('click', (e) => {
                if (e.target.classList.contains('col-resize-handle')) return;
                e.stopPropagation();
                const col = parseInt(cell.dataset.col, 10);
                if (Number.isNaN(col)) return;
                columnVisibility[col] = !columnVisibility[col];
                applyColumnLayout();
                buildColumnSettingsList();
            });
        });
    }

    function buildColumnSettingsList() {
        const list = document.getElementById('columnSettingsList');
        if (!list || !isTabular) return;
        list.innerHTML = '';
        let headers = [];
        try {
            headers = JSON.parse(container.dataset.headers || '[]');
        } catch (e) {
            headers = [];
        }
        for (let i = 0; i < columnCount; i++) {
            const row = document.createElement('div');
            row.className = 'column-settings-item';

            const label = document.createElement('label');
            const cb = document.createElement('input');
            cb.type = 'checkbox';
            cb.checked = columnVisibility[i];
            cb.dataset.col = String(i);
            const name = document.createElement('span');
            name.className = 'column-settings-name';
            name.textContent = headers[i] != null && headers[i] !== '' ? headers[i] : `Col ${i + 1}`;
            name.title = name.textContent;
            label.appendChild(cb);
            label.appendChild(name);

            const widthInput = document.createElement('input');
            widthInput.type = 'number';
            widthInput.className = 'column-settings-width';
            widthInput.value = columnWidths[i];
            widthInput.dataset.col = String(i);
            widthInput.min = 40;
            widthInput.max = 3000;

            row.appendChild(label);
            row.appendChild(widthInput);
            list.appendChild(row);

            cb.addEventListener('change', () => {
                columnVisibility[i] = cb.checked;
                applyColumnLayout();
            });
            widthInput.addEventListener('change', () => {
                const w = parseInt(widthInput.value, 10);
                if (!isNaN(w) && w > 0) {
                    columnWidths[i] = Math.max(40, Math.min(3000, w));
                    applyColumnLayout();
                } else {
                    widthInput.value = columnWidths[i];
                }
            });
        }
    }

    function syncColumnSettingsInputs() {
        document.querySelectorAll('.column-settings-width').forEach(inp => {
            const col = parseInt(inp.dataset.col, 10);
            if (!Number.isNaN(col)) {
                inp.value = columnWidths[col];
            }
        });
    }

    function toggleColumnSettings() {
        const panel = document.getElementById('columnSettingsPanel');
        if (panel) {
            panel.classList.toggle('visible');
            if (panel.classList.contains('visible')) {
                buildColumnSettingsList();
            }
        }
    }

    function hideColumnSettings() {
        const panel = document.getElementById('columnSettingsPanel');
        if (panel) {
            panel.classList.remove('visible');
        }
    }

    function showAllColumns() {
        columnVisibility = columnVisibility.map(() => true);
        applyColumnLayout();
        buildColumnSettingsList();
    }

    function resetColumnWidths() {
        columnWidths = defaultColumnWidths.slice();
        while (columnWidths.length < columnCount) {
            columnWidths.push(120);
        }
        columnVisibility = columnWidths.map(() => true);
        applyColumnLayout();
        buildColumnSettingsList();
    }

    // Setup Event Listeners
    function setupEventListeners() {
        // Empty state handlers
        const btnSelectLogFile = document.getElementById('btnSelectLogFile');
        if (btnSelectLogFile) {
            btnSelectLogFile.addEventListener('click', () => {
                vscode.postMessage({ command: 'selectLogFile' });
            });
        }

        const btnClearRecentFiles = document.getElementById('btnClearRecentFiles');
        if (btnClearRecentFiles) {
            btnClearRecentFiles.addEventListener('click', () => {
                vscode.postMessage({ command: 'clearRecentFiles' });
            });
        }

        // Toolbar buttons
        document.getElementById('btnSearch').addEventListener('click', toggleSearchPanel);
        document.getElementById('btnFilter').addEventListener('click', toggleFilterPanel);
        document.getElementById('btnMarkbook').addEventListener('click', toggleMarkbookPanel);
        document.getElementById('btnTools').addEventListener('click', toggleToolsPanel);
        document.getElementById('btnClearHighlights').addEventListener('click', clearAllHighlights);

        // Column settings
        const btnColumnSettings = document.getElementById('btnColumnSettings');
        if (btnColumnSettings) {
            btnColumnSettings.addEventListener('click', toggleColumnSettings);
        }
        const btnCloseColumnSettings = document.getElementById('btnCloseColumnSettings');
        if (btnCloseColumnSettings) {
            btnCloseColumnSettings.addEventListener('click', hideColumnSettings);
        }
        const btnShowAllColumns = document.getElementById('btnShowAllColumns');
        if (btnShowAllColumns) {
            btnShowAllColumns.addEventListener('click', showAllColumns);
        }
        const btnResetColumnWidths = document.getElementById('btnResetColumnWidths');
        if (btnResetColumnWidths) {
            btnResetColumnWidths.addEventListener('click', resetColumnWidths);
        }

        // Close buttons
        document.getElementById('btnCloseSearch').addEventListener('click', hideSearchPanel);
        document.getElementById('btnCloseFilter').addEventListener('click', hideFilterPanel);
        document.getElementById('btnCloseMarkbook').addEventListener('click', hideMarkbookPanel);
        document.getElementById('btnCloseTools').addEventListener('click', hideToolsPanel);

        // Regex toggle buttons
        document.getElementById('regexToggleBtn').addEventListener('click', toggleSearchRegex);
        document.getElementById('filterRegexToggleBtn').addEventListener('click', toggleFilterRegex);

        // Search functionality
        document.getElementById('searchInput').addEventListener('keydown', handleSearchKeydown);

        // Filter functionality
        document.getElementById('filterInput').addEventListener('keydown', handleFilterKeydown);

        // Tools functionality
        document.getElementById('btnHexToString').addEventListener('click', hexToString);
        document.getElementById('btnStringToHex').addEventListener('click', stringToHex);
        document.getElementById('btnToHex').addEventListener('click', () => convertBase('hex'));
        document.getElementById('btnToDec').addEventListener('click', () => convertBase('dec'));
        document.getElementById('btnToOct').addEventListener('click', () => convertBase('oct'));
        document.getElementById('btnToBin').addEventListener('click', () => convertBase('bin'));

        // Context menu items
        document.getElementById('ctxCopySelection').addEventListener('click', () => {
            copyCurrentSelection();
            hideContextMenu();
        });
        document.getElementById('ctxHighlight').addEventListener('click', () => {
            highlightSelection(false);
            hideContextMenu();
        });
        document.getElementById('ctxRemoveHighlight').addEventListener('click', () => {
            removeHighlight();
            hideContextMenu();
        });
        document.getElementById('ctxHighlightLine').addEventListener('click', () => {
            highlightLineSelection(false);
            hideContextMenu();
        });
        document.getElementById('ctxRemoveLineHighlight').addEventListener('click', () => {
            removeLineHighlight();
            hideContextMenu();
        });
        document.getElementById('ctxSearch').addEventListener('click', () => {
            searchSelection();
            hideContextMenu();
        });
        document.getElementById('ctxFilter').addEventListener('click', () => {
            filterSelection();
            hideContextMenu();
        });
        document.getElementById('ctxBookmark').addEventListener('click', () => {
            addBookmark();
            hideContextMenu();
        });
        document.getElementById('ctxGotoOriginal').addEventListener('click', () => {
            syncToOriginal();
            hideContextMenu();
        });

        // Keyboard shortcuts
        document.addEventListener('keydown', handleKeyboardShortcuts);

        // Line click handlers
        linesContainer.addEventListener('click', handleLineClick);
        linesContainer.addEventListener('contextmenu', handleContextMenu);

        // Hover tooltip for truncated content
        linesContainer.addEventListener('mouseover', handleLineMouseOver);
        linesContainer.addEventListener('mousemove', handleLineMouseMove);
        linesContainer.addEventListener('mouseleave', hideTooltip);

        // Hide context menu on click outside
        document.addEventListener('click', (e) => {
            if (!contextMenu.contains(e.target)) {
                hideContextMenu();
            }
        });

        // Text selection tracking
        document.addEventListener('selectionchange', handleSelectionChange);

        // Resize handle
        if (resizeHandle) {
            resizeHandle.addEventListener('mousedown', startResize);
        }
    }

    // Resize Functions
    function startResize(e) {
        isResizing = true;
        startX = e.clientX;
        startWidth = searchPanel.offsetWidth || filterPanel.offsetWidth || 280;
        resizeHandle.classList.add('dragging');
        document.addEventListener('mousemove', doResize);
        document.addEventListener('mouseup', stopResize);
        e.preventDefault();
    }

    function doResize(e) {
        if (!isResizing) return;
        const diff = e.clientX - startX;
        const newWidth = Math.max(150, Math.min(500, startWidth + diff));
        searchPanel.style.width = newWidth + 'px';
        filterPanel.style.width = newWidth + 'px';
    }

    function stopResize() {
        isResizing = false;
        resizeHandle.classList.remove('dragging');
        document.removeEventListener('mousemove', doResize);
        document.removeEventListener('mouseup', stopResize);
    }

    // Setup Message Handlers
    function setupMessageHandlers() {
        window.addEventListener('message', (event) => {
            const message = event.data;

            switch (message.command) {
                case 'searchResults':
                    displaySearchResults(message);
                    break;
                case 'searchHistory':
                    displaySearchHistory(message.history);
                    break;
                case 'bookmarks':
                    displayBookmarks(message.bookmarks);
                    break;
                case 'highlightResult':
                    handleHighlightResult(message.result);
                    break;
                case 'bookmarkResult':
                    handleBookmarkResult(message.result);
                    break;
                case 'updateBookmarkIcon':
                    updateBookmarkIcon(message.lineNumber, message.isBookmarked);
                    break;
                case 'scrollToLine':
                    scrollToLine(message.lineNumber);
                    break;
                case 'showTools':
                    showToolsPanel();
                    break;
                case 'nextHighlightColor':
                    updateHighlightMenuColor(message.color);
                    break;
                case 'updateLines':
                    updateLinesContent(message.lines);
                    break;
                case 'appendLines':
                    handleAppendLines(message);
                    break;
                case 'clearHighlightsDisplay':
                    clearHighlightsDisplay(message.keywords);
                    break;
                case 'recentFiles':
                    displayRecentFiles(message.files);
                    break;
                case 'recentFilesCleared':
                    showNotification('Recent files cleared', 'success');
                    displayRecentFiles([]);
                    break;
                case 'fileLoaded':
                    handleFileLoaded(message);
                    break;
                case 'updateLineHighlights':
                    updateLineHighlightsDisplay(message.keywords);
                    break;
                case 'clearLineHighlightsDisplay':
                    clearLineHighlightsDisplay();
                    break;
                case 'lineHighlightResult':
                    handleLineHighlightResult(message.result);
                    break;
            }
        });
    }

    // Display recent files in empty state
    function displayRecentFiles(files) {
        const recentFilesSection = document.getElementById('recentFilesSection');
        const recentFilesList = document.getElementById('recentFilesList');
        
        if (!recentFilesSection || !recentFilesList) return;
        
        if (!files || files.length === 0) {
            recentFilesSection.classList.add('hidden');
            return;
        }
        
        recentFilesSection.classList.remove('hidden');
        
        const html = files.map(file => {
            const fileName = file.split(/[\\/]/).pop();
            return `
                <div class="recent-file-item" data-file-path="${escapeHtml(file)}">
                    <span class="file-icon"><i class="fa-solid fa-file-lines"></i></span>
                    <span class="file-name">${escapeHtml(fileName)}</span>
                    <span class="file-path">${escapeHtml(file)}</span>
                </div>
            `;
        }).join('');
        
        recentFilesList.innerHTML = html;
        
        // Add click handlers
        recentFilesList.querySelectorAll('.recent-file-item').forEach(item => {
            item.addEventListener('click', () => {
                vscode.postMessage({
                    command: 'openRecentFile',
                    filePath: item.dataset.filePath
                });
            });
        });
    }

    // Handle file loaded (switch from empty state to file view)
    function handleFileLoaded(message) {
        const emptyStateContainer = document.getElementById('emptyStateContainer');
        const loadingContainer = document.getElementById('loadingContainer');
        const headerBar = document.getElementById('headerBar');
        const mainContent = document.querySelector('.main-content');

        // Hide empty state and loading
        if (emptyStateContainer) {
            emptyStateContainer.classList.add('hidden');
        }
        if (loadingContainer) {
            loadingContainer.classList.add('hidden');
        }

        // Show header and main content
        if (headerBar) {
            headerBar.style.display = 'flex';
        }
        if (mainContent) {
            mainContent.style.display = 'flex';
        }

        // Trigger fade-in animation for content
        const contentWrapper = document.querySelector('.content-wrapper');
        const linesContainer = document.getElementById('linesContainer');
        if (contentWrapper) {
            setTimeout(() => contentWrapper.classList.add('loaded'), 50);
        }
        if (linesContainer) {
            setTimeout(() => linesContainer.classList.add('loaded'), 50);
        }

        // Request bookmarks and search history
        vscode.postMessage({ command: 'getBookmarks' });
        vscode.postMessage({ command: 'getSearchHistory' });
    }

    // Toolbar Functions
    function toggleSearchPanel() {
        // Close filter panel when opening search panel (mutual exclusion)
        if (filterPanel.classList.contains('visible')) {
            filterPanel.classList.remove('visible');
        }
        searchPanel.classList.toggle('visible');
        if (searchPanel.classList.contains('visible')) {
            document.getElementById('searchInput').focus();
        }
    }

    function hideSearchPanel() {
        searchPanel.classList.remove('visible');
        // Clear search result selection
        selectedSearchIndex = -1;
        searchResultItems.forEach(item => item.classList.remove('selected'));
    }

    function toggleSearchRegex() {
        const checkbox = document.getElementById('regexToggle');
        const btn = document.getElementById('regexToggleBtn');
        checkbox.checked = !checkbox.checked;
        btn.classList.toggle('active', checkbox.checked);
    }

    function toggleFilterPanel() {
        // Close search panel when opening filter panel (mutual exclusion)
        if (searchPanel.classList.contains('visible')) {
            searchPanel.classList.remove('visible');
            selectedSearchIndex = -1;
            searchResultItems.forEach(item => item.classList.remove('selected'));
        }
        filterPanel.classList.toggle('visible');
        if (filterPanel.classList.contains('visible')) {
            document.getElementById('filterInput').focus();
        }
    }

    function hideFilterPanel() {
        filterPanel.classList.remove('visible');
    }

    function toggleFilterRegex() {
        const checkbox = document.getElementById('filterRegexToggle');
        const btn = document.getElementById('filterRegexToggleBtn');
        checkbox.checked = !checkbox.checked;
        btn.classList.toggle('active', checkbox.checked);
    }

    function toggleMarkbookPanel() {
        markbookPanel.classList.toggle('visible');
    }

    function hideMarkbookPanel() {
        markbookPanel.classList.remove('visible');
    }

    function toggleToolsPanel() {
        toolsPanel.classList.toggle('visible');
    }

    function hideToolsPanel() {
        toolsPanel.classList.remove('visible');
    }

    function showToolsPanel() {
        toolsPanel.classList.add('visible');
    }

    // Search Functions
    function handleSearchKeydown(e) {
        if (e.key === 'Enter') {
            performSearch();
        }
    }

    function performSearch() {
        const keyword = document.getElementById('searchInput').value;
        const useRegex = document.getElementById('regexToggle').checked;

        if (!keyword) return;

        // Show searching state
        const resultsContainer = document.getElementById('searchResults');
        resultsContainer.innerHTML = '<div class="searching-state"><i class="fa-solid fa-spinner fa-spin"></i> Searching...</div>';

        vscode.postMessage({
            command: 'search',
            keyword: keyword,
            useRegex: useRegex
        });
    }

    function displaySearchResults(message) {
        const resultsContainer = document.getElementById('searchResults');
        const { keyword, results, totalCount } = message;

        if (totalCount === 0) {
            resultsContainer.innerHTML = '<div class="empty-state"><div class="empty-state-text">No results found</div></div>';
            searchResultItems = [];
            selectedSearchIndex = -1;
            return;
        }

        const html = results.map(result => `
            <div class="search-result-item" data-line="${result.lineNumber}">
                <span class="search-result-line">${result.lineNumber}</span>
                <span class="search-result-text">${escapeHtml(result.text)}</span>
            </div>
        `).join('');

        resultsContainer.innerHTML = html;

        // Store result items for keyboard navigation
        searchResultItems = Array.from(resultsContainer.querySelectorAll('.search-result-item'));
        selectedSearchIndex = -1;

        // Add click handlers to results
        searchResultItems.forEach((item, index) => {
            item.addEventListener('click', () => {
                // Update keyboard navigation index
                if (selectedSearchIndex >= 0 && searchResultItems[selectedSearchIndex]) {
                    searchResultItems[selectedSearchIndex].classList.remove('selected');
                }
                selectedSearchIndex = index;
                item.classList.add('selected');

                const lineNumber = parseInt(item.dataset.line);
                gotoLine(lineNumber);
            });
        });
    }

    function navigateSearchResults(direction) {
        if (searchResultItems.length === 0) return;

        // Remove previous selection highlight
        if (selectedSearchIndex >= 0 && searchResultItems[selectedSearchIndex]) {
            searchResultItems[selectedSearchIndex].classList.remove('selected');
        }

        // Calculate new index
        if (direction === 1) {
            selectedSearchIndex = (selectedSearchIndex + 1) % searchResultItems.length;
        } else {
            selectedSearchIndex = selectedSearchIndex <= 0 ? searchResultItems.length - 1 : selectedSearchIndex - 1;
        }

        // Highlight new selection and auto jump to line
        const selectedItem = searchResultItems[selectedSearchIndex];
        if (selectedItem) {
            selectedItem.classList.add('selected');
            selectedItem.scrollIntoView({ behavior: 'instant', block: 'nearest' });
            // Auto jump to the line
            const lineNumber = parseInt(selectedItem.dataset.line);
            gotoLine(lineNumber);
        }
    }

    function displaySearchHistory(history) {
        const historyContainer = document.getElementById('searchHistory');
        if (!history || history.length === 0) {
            historyContainer.innerHTML = '';
            return;
        }

        const html = history.map(item => `
            <span class="history-item" data-keyword="${escapeHtml(item)}">${escapeHtml(item)}</span>
        `).join('');

        historyContainer.innerHTML = html;

        // Add click handlers
        historyContainer.querySelectorAll('.history-item').forEach(item => {
            item.addEventListener('click', () => {
                document.getElementById('searchInput').value = item.dataset.keyword;
                performSearch();
            });
        });
    }

    function searchSelection() {
        // Use selection stored in context menu
        const selectionFromMenu = contextMenu.dataset.selection;
        const keywordToSearch = selectionFromMenu || currentSelection;

        if (keywordToSearch) {
            document.getElementById('searchInput').value = keywordToSearch;
            showSearchPanel();
            performSearch();
        }
    }

    // Filter Functions
    function handleFilterKeydown(e) {
        if (e.key === 'Enter') {
            applyFilter();
        }
    }

    function applyFilter() {
        const keyword = document.getElementById('filterInput').value;
        const useRegex = document.getElementById('filterRegexToggle').checked;

        if (!keyword) return;

        vscode.postMessage({
            command: 'filter',
            keyword: keyword,
            useRegex: useRegex
        });

        hideFilterPanel();
        showNotification('Filter applied in new tab', 'success');
    }

    function filterSelection() {
        // Use selection stored in context menu
        const selectionFromMenu = contextMenu.dataset.selection;
        const keywordToFilter = selectionFromMenu || currentSelection;

        if (keywordToFilter) {
            document.getElementById('filterInput').value = keywordToFilter;
            showFilterPanel();
        }
    }

    // Highlight Functions
    function highlightSelection(useRegex = false) {
        // Get selection from context menu data attribute (stored during right-click)
        const selectionFromMenu = contextMenu.dataset.selection;
        console.log('[Highlight] highlightSelection called, selectionFromMenu:', selectionFromMenu, 'currentSelection:', currentSelection);

        // Use the selection stored in context menu if available
        const keywordToHighlight = selectionFromMenu || currentSelection;

        if (keywordToHighlight) {
            // Show processing state
            showNotification('<i class="fa-solid fa-spinner fa-spin"></i> Processing highlight...', 'info');

            console.log('[Highlight] Sending message to extension:', { command: 'highlight', keyword: keywordToHighlight, useRegex: useRegex });
            vscode.postMessage({
                command: 'highlight',
                keyword: keywordToHighlight,
                useRegex: useRegex
            });
        } else {
            console.log('[Highlight] No selection available, not sending message');
            showNotification('No selection to highlight', 'error');
        }
    }

    function removeHighlight() {
        // Use selection stored in context menu (same pattern as highlightSelection)
        const selectionFromMenu = contextMenu.dataset.selection;
        const keywordToRemove = selectionFromMenu || currentSelection;

        if (keywordToRemove) {
            vscode.postMessage({
                command: 'removeHighlight',
                keyword: keywordToRemove
            });
        }
    }

    function clearAllHighlights() {
        // Send message to extension to clear all keyword highlights
        vscode.postMessage({
            command: 'clearAllHighlights'
        });
        // Also clear all line highlights
        vscode.postMessage({
            command: 'clearAllLineHighlights'
        });
    }

    function handleHighlightResult(result) {
        const action = result.action;
        const keyword = result.keyword;
        
        if (action === 'added') {
            showNotification(`Highlighted: "${keyword}"`, 'success');
        } else if (action === 'cleared') {
            showNotification('All highlights cleared', 'success');
        } else {
            showNotification(`Removed highlight: "${keyword}"`, 'success');
        }
    }

    // Bookmark Functions
    function addBookmark() {
        if (currentLineNumber) {
            const lineElement = document.querySelector(`.line[data-line="${currentLineNumber}"]`);
            const text = lineElement ? lineElement.querySelector('.line-content').textContent : '';
            
            vscode.postMessage({
                command: 'addBookmark',
                lineNumber: currentLineNumber,
                text: text,
                note: ''
            });
        }
    }

    function handleBookmarkResult(result) {
        const action = result.action;

        if (action === 'added') {
            showNotification(`Bookmarked line ${result.bookmark.lineNumber}`, 'success');
        } else {
            showNotification(`Removed bookmark from line ${result.lineNumber}`, 'success');
        }

        // Refresh bookmarks display
        vscode.postMessage({ command: 'getBookmarks' });
    }

    // Update bookmark icon on a single line (no full page refresh)
    function updateBookmarkIcon(lineNumber, isBookmarked) {
        const lineElement = document.querySelector(`.line[data-line="${lineNumber}"]`);
        if (lineElement) {
            const bookmarkIcon = lineElement.querySelector('.bookmark-icon');
            if (bookmarkIcon) {
                bookmarkIcon.innerHTML = isBookmarked ? '<i class="fa-solid fa-bookmark"></i>' : '';
            }
        }
    }

    function displayBookmarks(bookmarks) {
        const listContainer = document.getElementById('markbookList');
        
        if (!bookmarks || bookmarks.length === 0) {
            listContainer.innerHTML = '<div class="empty-state"><div class="empty-state-text">No bookmarks</div></div>';
            return;
        }

        const html = bookmarks.map(bookmark => `
            <div class="markbook-item" data-line="${bookmark.lineNumber}">
                <div class="markbook-item-line">Line ${bookmark.lineNumber}</div>
                <div class="markbook-item-text">${escapeHtml(bookmark.text)}</div>
                ${bookmark.note ? `<div class="markbook-item-note">${escapeHtml(bookmark.note)}</div>` : ''}
            </div>
        `).join('');

        listContainer.innerHTML = html;

        // Add click handlers
        listContainer.querySelectorAll('.markbook-item').forEach(item => {
            item.addEventListener('click', () => {
                const lineNumber = parseInt(item.dataset.line);
                gotoLine(lineNumber);
            });
        });
    }

    // Tools Functions
    function hexToString() {
        const input = document.getElementById('hexStringInput').value.trim();
        if (!input) return;

        try {
            // Remove spaces and 0x prefix
            const hex = input.replace(/\s/g, '').replace(/^0x/, '');
            
            // Convert hex to string
            let result = '';
            for (let i = 0; i < hex.length; i += 2) {
                const byte = parseInt(hex.substr(i, 2), 16);
                if (!isNaN(byte)) {
                    result += String.fromCharCode(byte);
                }
            }
            
            document.getElementById('hexStringResult').textContent = result;
        } catch (error) {
            document.getElementById('hexStringResult').textContent = 'Error: Invalid hex';
        }
    }

    function stringToHex() {
        const input = document.getElementById('hexStringInput').value;
        if (!input) return;

        try {
            let result = '';
            for (let i = 0; i < input.length; i++) {
                const hex = input.charCodeAt(i).toString(16).padStart(2, '0');
                result += hex + ' ';
            }
            
            document.getElementById('hexStringResult').textContent = result.trim().toUpperCase();
        } catch (error) {
            document.getElementById('hexStringResult').textContent = 'Error: Conversion failed';
        }
    }

    function convertBase(targetBase) {
        const input = document.getElementById('baseInput').value.trim();
        if (!input) return;

        try {
            // Detect input base
            let decimal;
            if (input.startsWith('0x') || input.startsWith('0X')) {
                decimal = parseInt(input, 16);
            } else if (input.startsWith('0b') || input.startsWith('0B')) {
                decimal = parseInt(input.slice(2), 2);
            } else if (input.startsWith('0o') || input.startsWith('0O')) {
                decimal = parseInt(input.slice(2), 8);
            } else if (input.startsWith('0') && input.length > 1) {
                decimal = parseInt(input, 8);
            } else {
                decimal = parseInt(input, 10);
            }

            if (isNaN(decimal)) {
                document.getElementById('baseResult').textContent = 'Error: Invalid number';
                return;
            }

            let result;
            switch (targetBase) {
                case 'hex':
                    result = '0x' + decimal.toString(16).toUpperCase();
                    break;
                case 'dec':
                    result = decimal.toString(10);
                    break;
                case 'oct':
                    result = '0o' + decimal.toString(8);
                    break;
                case 'bin':
                    result = '0b' + decimal.toString(2);
                    break;
                default:
                    result = decimal.toString(10);
            }

            document.getElementById('baseResult').textContent = result;
        } catch (error) {
            document.getElementById('baseResult').textContent = 'Error: Conversion failed';
        }
    }

    // Line Navigation
    function handleLineClick(e) {
        const lineElement = e.target.closest('.line');
        if (lineElement) {
            // Remove previous selection
            document.querySelectorAll('.line.selected').forEach(line => {
                line.classList.remove('selected');
            });

            // Add selection to clicked line
            lineElement.classList.add('selected');
            currentLineNumber = parseInt(lineElement.dataset.line);
        }
    }

    // Hover Tooltip (shows full content of truncated lines/cells)
    let tooltipEl = null;

    function ensureTooltip() {
        if (!tooltipEl) {
            tooltipEl = document.createElement('div');
            tooltipEl.className = 'cell-tooltip';
            document.body.appendChild(tooltipEl);
        }
        return tooltipEl;
    }

    function positionTooltip(x, y) {
        if (!tooltipEl || !tooltipEl.classList.contains('visible')) return;
        const rect = tooltipEl.getBoundingClientRect();
        let left = x + 14;
        let top = y + 14;
        if (left + rect.width > window.innerWidth - 8) {
            left = Math.max(8, x - rect.width - 14);
        }
        if (top + rect.height > window.innerHeight - 8) {
            top = Math.max(8, y - rect.height - 14);
        }
        tooltipEl.style.left = left + 'px';
        tooltipEl.style.top = top + 'px';
    }

    function showTooltip(text, x, y) {
        const tip = ensureTooltip();
        tip.textContent = text;
        tip.classList.add('visible');
        // Wait for layout, then position within viewport
        requestAnimationFrame(() => positionTooltip(x, y));
    }

    function hideTooltip() {
        if (tooltipEl) {
            tooltipEl.classList.remove('visible');
        }
    }

    function getRowFullText(contentEl) {
        const cells = Array.from(contentEl.querySelectorAll(':scope > .tabular-cell:not(.hidden)'));
        return cells.map(c => c.textContent).join('\t');
    }

    function handleLineMouseOver(e) {
        const target = e.target;
        const lineEl = target.closest('.line');
        if (!lineEl) {
            hideTooltip();
            return;
        }

        // Sticky header row: no tooltip
        if (lineEl.classList.contains('table-header-line')) {
            hideTooltip();
            return;
        }

        const contentEl = lineEl.querySelector('.line-content');
        if (!contentEl) {
            hideTooltip();
            return;
        }

        if (isTabular) {
            // Row is wider than the viewport -> full row can't be seen at once
            const wrapper = document.querySelector('.content-wrapper');
            const rowOverflows = wrapper && contentEl.scrollWidth > wrapper.clientWidth + 1;

            const cell = target.closest('.tabular-cell');
            if (cell) {
                // Truncated cell -> show that cell's full content
                if (cell.scrollWidth > cell.clientWidth + 1) {
                    showTooltip(cell.textContent, e.clientX, e.clientY);
                    return;
                }
                // Cell fits but the whole row overflows -> show the full row
                if (rowOverflows) {
                    showTooltip(getRowFullText(contentEl), e.clientX, e.clientY);
                    return;
                }
            } else {
                // Line number / padding / bookmark area -> show the full row
                if (rowOverflows) {
                    showTooltip(getRowFullText(contentEl), e.clientX, e.clientY);
                    return;
                }
            }
            hideTooltip();
            return;
        }

        // Plain (non-tabular) line: show full content when truncated
        if (contentEl.scrollWidth > contentEl.clientWidth + 1) {
            showTooltip(contentEl.textContent, e.clientX, e.clientY);
        } else {
            hideTooltip();
        }
    }

    function handleLineMouseMove(e) {
        if (tooltipEl && tooltipEl.classList.contains('visible')) {
            positionTooltip(e.clientX, e.clientY);
        }
    }

    function scrollToLineElement(lineElement, lineNumber) {
        // Use instant scroll for better performance on large logs
        lineElement.scrollIntoView({ behavior: 'instant', block: 'center' });

        // Highlight the line
        document.querySelectorAll('.line.selected').forEach(line => {
            line.classList.remove('selected');
        });
        lineElement.classList.add('selected');
        currentLineNumber = lineNumber;
    }

    function gotoLine(lineNumber) {
        const lineElement = document.querySelector(`.line[data-line="${lineNumber}"]`);
        if (lineElement) {
            scrollToLineElement(lineElement, lineNumber);
        } else if (loadedStart + loadedCount < totalLines) {
            // Not loaded yet - load pages until the target line is rendered
            pendingGotoLine = lineNumber;
            loadMoreLines(lineNumber);
        } else {
            showNotification(`Line ${lineNumber} not found`, 'error');
        }
    }

    function scrollToLine(lineNumber) {
        gotoLine(lineNumber);
    }

    // Context Menu
    function handleContextMenu(e) {
        e.preventDefault();

        // Capture current selection immediately to prevent it from being lost
        const selection = window.getSelection();
        let capturedSelection = selection.toString().trim();
        console.log('[ContextMenu] Captured selection:', capturedSelection);

        // If no selection, try to get text from the clicked line
        if (!capturedSelection) {
            const lineElement = e.target.closest('.line');
            if (lineElement) {
                const lineContent = lineElement.querySelector('.line-content');
                if (lineContent) {
                    capturedSelection = lineContent.textContent.trim();
                    console.log('[ContextMenu] Using line content as selection:', capturedSelection);
                }
            }
        }
        
        // Store in a data attribute on the context menu for later use
        contextMenu.dataset.selection = capturedSelection;
        currentSelection = capturedSelection;
        console.log('[ContextMenu] Stored selection in contextMenu.dataset.selection:', contextMenu.dataset.selection);

        const lineElement = e.target.closest('.line');
        if (lineElement) {
            currentLineNumber = parseInt(lineElement.dataset.line);
        }

        // Update context menu visibility based on state
        const ctxGotoOriginal = document.getElementById('ctxGotoOriginal');
        if (isFilterView) {
            ctxGotoOriginal.style.display = 'flex';
        } else {
            ctxGotoOriginal.style.display = 'none';
        }

        // Show context menu with boundary detection
        const x = e.clientX;
        const y = e.clientY;

        // Position menu initially
        contextMenu.style.left = `${x}px`;
        contextMenu.style.top = `${y}px`;
        contextMenu.classList.add('visible');

        // Check boundaries and adjust if needed
        const menuRect = contextMenu.getBoundingClientRect();
        const viewportWidth = window.innerWidth;
        const viewportHeight = window.innerHeight;

        // Adjust horizontal position if menu exceeds right boundary
        if (menuRect.right > viewportWidth) {
            const newLeft = x - menuRect.width;
            contextMenu.style.left = `${Math.max(0, newLeft)}px`;
        }

        // Adjust vertical position if menu exceeds bottom boundary
        if (menuRect.bottom > viewportHeight) {
            const newTop = y - menuRect.height;
            contextMenu.style.top = `${Math.max(0, newTop)}px`;
        }
    }

    function hideContextMenu() {
        contextMenu.classList.remove('visible');
    }

    // Sync to Original (for filter view)
    function syncToOriginal() {
        if (isFilterView && currentLineNumber && originalPanelId) {
            vscode.postMessage({
                command: 'syncToOriginal',
                lineNumber: currentLineNumber
            });
        }
    }

    // Update highlight menu color icon
    function updateHighlightMenuColor(color) {
        const ctxHighlightIcon = document.querySelector('#ctxHighlight i');
        if (ctxHighlightIcon && color) {
            ctxHighlightIcon.style.color = color.bg;
        }
    }

    // Update lines content (partial update for performance)
    function updateLinesContent(lines) {
        if (!lines || lines.length === 0) return;
        
        console.log('[UpdateLines] Updating', lines.length, 'lines');
        
        for (const lineData of lines) {
            const lineElement = document.querySelector(`.line[data-line="${lineData.lineNumber}"]`);
            if (lineElement) {
                const contentElement = lineElement.querySelector('.line-content');
                const bookmarkElement = lineElement.querySelector('.bookmark-icon');
                
                if (contentElement) {
                    contentElement.innerHTML = lineData.highlightedText;
                }
                
                if (bookmarkElement) {
                    bookmarkElement.innerHTML = lineData.isBookmarked ? '<i class="fa-solid fa-bookmark"></i>' : '';
                }
            }
        }
        
        console.log('[UpdateLines] Lines updated successfully');

        // Re-apply column layout (collapsed columns / widths) to rebuilt tabular cells
        if (isTabular) {
            applyColumnLayout();
        }
    }

    // Clear highlights display (remove highlight markup, restore original text)
    function clearHighlightsDisplay(keywords) {
        if (!keywords || keywords.length === 0) return;

        console.log('[ClearHighlights] Clearing highlights for keywords:', keywords);

        // Get all line content elements
        const lineContents = document.querySelectorAll('.line-content');

        lineContents.forEach(contentEl => {
            // Remove all <mark> tags but keep the text content
            const marks = contentEl.querySelectorAll('mark');
            marks.forEach(mark => {
                // Replace mark element with its text content
                const textNode = document.createTextNode(mark.textContent);
                mark.parentNode.replaceChild(textNode, mark);
            });

            // Normalize text nodes (merge adjacent text nodes)
            contentEl.normalize();
        });

        console.log('[ClearHighlights] Highlights cleared successfully');
    }

    // Line Highlight Functions
    // Update line backgrounds based on keywords
    function updateLineHighlightsDisplay(keywords) {
        if (!keywords || keywords.length === 0) {
            clearLineHighlightsDisplay();
            return;
        }

        console.log('[LineHighlight] Updating line backgrounds for keywords:', keywords);

        // Line background highlight CSS classes mapping
        const colorClasses = {
            'red': 'line-bg-red',
            'teal': 'line-bg-teal',
            'blue': 'line-bg-blue',
            'green': 'line-bg-green',
            'yellow': 'line-bg-yellow',
            'purple': 'line-bg-purple'
        };

        // Get all line elements
        const lineElements = document.querySelectorAll('.line');

        lineElements.forEach(lineEl => {
            const lineContent = lineEl.querySelector('.line-content');
            if (!lineContent) return;

            const text = lineContent.textContent;

            // Remove existing line highlight classes first
            Object.values(colorClasses).forEach(cls => lineEl.classList.remove(cls));

            // Check each keyword for match
            let matchedColorName = null;
            for (const kw of keywords) {
                const regex = new RegExp(kw.keyword, 'gi');
                if (regex.test(text)) {
                    matchedColorName = kw.color.name;
                    break; // Use first matching keyword's color
                }
            }

            // Apply background class if matched
            if (matchedColorName && colorClasses[matchedColorName]) {
                lineEl.classList.add(colorClasses[matchedColorName]);
            }
        });

        console.log('[LineHighlight] Line backgrounds updated successfully');
    }

    // Clear all line background highlights
    function clearLineHighlightsDisplay() {
        console.log('[LineHighlight] Clearing all line backgrounds');

        const colorClasses = ['line-bg-red', 'line-bg-teal', 'line-bg-blue', 'line-bg-green', 'line-bg-yellow', 'line-bg-purple'];

        const lineElements = document.querySelectorAll('.line');
        lineElements.forEach(lineEl => {
            colorClasses.forEach(cls => lineEl.classList.remove(cls));
        });

        console.log('[LineHighlight] Line backgrounds cleared successfully');
    }

    // Handle line highlight result notification
    function handleLineHighlightResult(result) {
        const action = result.action;
        const keyword = result.keyword;

        if (action === 'added') {
            showNotification(`Line highlighted: "${keyword}"`, 'success');
        } else if (action === 'cleared') {
            showNotification('All line highlights cleared', 'success');
        } else if (action === 'removed') {
            showNotification(`Removed line highlight: "${keyword}"`, 'success');
        }
    }

    // Line highlight selection (for context menu)
    function highlightLineSelection(useRegex = false) {
        const selectionFromMenu = contextMenu.dataset.selection;
        const keywordToHighlight = selectionFromMenu || currentSelection;

        if (keywordToHighlight) {
            vscode.postMessage({
                command: 'highlightLine',
                keyword: keywordToHighlight,
                useRegex: useRegex
            });
        } else {
            showNotification('No selection to highlight line', 'error');
        }
    }

    // Remove line highlight for selection
    function removeLineHighlight() {
        const selectionFromMenu = contextMenu.dataset.selection;
        const keywordToRemove = selectionFromMenu || currentSelection;

        if (keywordToRemove) {
            vscode.postMessage({
                command: 'removeLineHighlight',
                keyword: keywordToRemove
            });
        }
    }

    // Selection Handling
    function handleSelectionChange() {
        const selection = window.getSelection();
        currentSelection = selection.toString().trim();
    }

    // Copy Function
    // Copy current selection (for context menu)
    function copyCurrentSelection() {
        // First try to get from context menu stored selection (captured during right-click)
        const storedSelection = contextMenu.dataset.selection;
        
        // Fallback to current window selection
        const selection = window.getSelection();
        const currentText = selection.toString().trim();
        
        // Use stored selection first, then current selection
        const text = storedSelection || currentText;
        
        console.log('[Copy] Stored selection:', storedSelection);
        console.log('[Copy] Current selection:', currentText);
        console.log('[Copy] Using text:', text);
        
        if (text) {
            navigator.clipboard.writeText(text).then(() => {
                showNotification('Copied to clipboard', 'success');
            }).catch(() => {
                showNotification('Failed to copy', 'error');
            });
        } else {
            showNotification('No text selected', 'error');
        }
    }

    // Keyboard shortcuts handler
    function handleKeyboardShortcuts(e) {
        // Handle search result navigation when search panel is visible
        if (searchPanel.classList.contains('visible') && searchResultItems.length > 0) {
            if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
                e.preventDefault();
                navigateSearchResults(e.key === 'ArrowDown' ? 1 : -1);
                return;
            }
            if (e.key === 'Enter' && selectedSearchIndex >= 0) {
                e.preventDefault();
                const item = searchResultItems[selectedSearchIndex];
                if (item) {
                    const lineNumber = parseInt(item.dataset.line);
                    gotoLine(lineNumber);
                }
                return;
            }
        }

        // Don't trigger shortcuts when typing in input fields
        if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA') {
            return;
        }

        // Ctrl+C / Cmd+C - Copy selection
        if ((e.ctrlKey || e.metaKey) && e.key === 'c') {
            const selection = window.getSelection();
            if (selection.toString().trim()) {
                // Let default copy behavior work, but show notification
                navigator.clipboard.writeText(selection.toString()).then(() => {
                    showNotification('Copied to clipboard', 'success');
                }).catch(() => {
                    // Silent fail - browser may have already copied
                });
            }
            return;
        }

        // Ctrl+F / Cmd+F - Open search
        if ((e.ctrlKey || e.metaKey) && e.key === 'f') {
            e.preventDefault();
            e.stopPropagation();
            toggleSearchPanel();
            return;
        }

        // Ctrl+H / Cmd+H - Open filter panel
        if ((e.ctrlKey || e.metaKey) && e.key === 'h') {
            e.preventDefault();
            e.stopPropagation();
            toggleFilterPanel();
            return;
        }

        // Ctrl+G / Cmd+G - Open goto line dialog
        if ((e.ctrlKey || e.metaKey) && e.key === 'g') {
            e.preventDefault();
            e.stopPropagation();
            openGotoLineDialog();
            return;
        }

        // Ctrl+B / Cmd+B - Toggle markbook panel
        if ((e.ctrlKey || e.metaKey) && e.key === 'b') {
            e.preventDefault();
            e.stopPropagation();
            toggleMarkbookPanel();
            return;
        }

        // Ctrl+X / Cmd+X - Toggle tools panel
        if ((e.ctrlKey || e.metaKey) && e.key === 'x') {
            e.preventDefault();
            e.stopPropagation();
            toggleToolsPanel();
            return;
        }
    }

    // Open goto line dialog
    function openGotoLineDialog() {
        const lineNumber = prompt('Go to line:');
        if (lineNumber) {
            const num = parseInt(lineNumber);
            if (!isNaN(num) && num > 0) {
                gotoLine(num);
            } else {
                showNotification('Invalid line number', 'error');
            }
        }
    }

    // Notification
    function showNotification(message, type = 'info') {
        notification.innerHTML = message;
        notification.className = `notification ${type} visible`;

        setTimeout(() => {
            notification.classList.remove('visible');
        }, 1500);
    }

    // Utility Functions
    function escapeHtml(text) {
        if (!text) return '';
        const div = document.createElement('div');
        div.textContent = text;
        return div.innerHTML;
    }

    // Initialize when DOM is ready
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }
})();
