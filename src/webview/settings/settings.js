/**
 * Settings Page JavaScript
 * Handles configuration viewing and editing with macOS-style two-column layout
 */

const vscode = acquireVsCodeApi();

// Current configuration state
let currentConfig = {
    firmwarePath: '',
    buildCommands: [],
    lastBuildCommand: '',
    buildGitBashPath: '',
    defaultComPort: '',
    language: 'auto',
    theme: 'auto'
};

// Command being edited
let editingCommandIndex = -1;

// Track if settings have been modified
let hasUnsavedChanges = false;

// Section titles mapping
const sectionTitles = {
    'firmware': { icon: 'fa-folder-open', text: '' },
    'commands': { icon: 'fa-terminal', text: '' },
    'gitbash': { icon: 'fa-git-alt', text: '' },
    'comport': { icon: 'fa-plug', text: '' },
    'language': { icon: 'fa-language', text: '' },
    'theme': { icon: 'fa-palette', text: '' },
    'config': { icon: 'fa-file-code', text: '' }
};

/**
 * Initialize settings page
 */
function init() {
    // Setup navigation click handlers
    setupNavigation();
    
    // Setup input change listeners for modified indicator
    setupChangeTracking();
    
    // Request current configuration from extension
    vscode.postMessage({ command: 'getConfig' });
    
    // Handle keyboard shortcuts
    document.addEventListener('keydown', handleKeyboardShortcuts);
    
    // Handle browser back/forward
    window.addEventListener('beforeunload', handleBeforeUnload);
}

/**
 * Setup navigation click handlers
 */
function setupNavigation() {
    document.querySelectorAll('.nav-item').forEach(item => {
        item.addEventListener('click', () => {
            const sectionId = item.dataset.section;
            switchSection(sectionId);
        });
    });
}

/**
 * Switch to a specific section
 */
function switchSection(sectionId) {
    // Remove active class from all nav items and sections
    document.querySelectorAll('.nav-item').forEach(n => n.classList.remove('active'));
    document.querySelectorAll('.content-section').forEach(s => s.classList.remove('active'));
    
    // Add active class to selected item and section
    const navItem = document.querySelector(`.nav-item[data-section="${sectionId}"]`);
    if (navItem) {
        navItem.classList.add('active');
    }
    
    const section = document.getElementById(sectionId);
    if (section) {
        section.classList.add('active');
    }
    
    // Update header title
    updateContentHeader(sectionId);
}

/**
 * Update content header with section title
 */
function updateContentHeader(sectionId) {
    const header = document.getElementById('contentTitle');
    const sectionInfo = sectionTitles[sectionId];
    if (sectionInfo && header) {
        const key = getSectionTitleKey(sectionId);
        // Use the localized string from the nav item
        const navItem = document.querySelector(`.nav-item[data-section="${sectionId}"]`);
        const text = navItem ? navItem.querySelector('.nav-text').textContent : sectionId;
        header.innerHTML = `<i class="fa-solid ${sectionInfo.icon}"></i> ${text}`;
    }
}

/**
 * Get section title key for localization
 */
function getSectionTitleKey(sectionId) {
    const keys = {
        'firmware': 'settings.firmwarePath',
        'commands': 'settings.buildCommands',
        'gitbash': 'settings.gitBashPath',
        'comport': 'settings.comPort',
        'language': 'settings.language',
        'config': 'settings.configFile'
    };
    return keys[sectionId] || sectionId;
}

/**
 * Setup change tracking for modified indicator
 */
function setupChangeTracking() {
    // Track input changes
    const inputs = document.querySelectorAll('input[type="text"], select');
    inputs.forEach(input => {
        input.addEventListener('input', () => {
            markAsModified(input, true);
            hasUnsavedChanges = true;
        });
        input.addEventListener('change', () => {
            markAsModified(input, true);
            hasUnsavedChanges = true;
        });
    });
}

/**
 * Mark an input as modified
 */
function markAsModified(input, modified) {
    input.setAttribute('data-modified', modified ? 'true' : 'false');
    
    // Update nav indicator
    const sectionId = input.closest('.content-section')?.id;
    if (sectionId) {
        const navItem = document.querySelector(`.nav-item[data-section="${sectionId}"]`);
        if (navItem) {
            if (modified) {
                navItem.classList.add('modified');
            } else {
                navItem.classList.remove('modified');
            }
        }
    }
}

/**
 * Clear all modified indicators
 */
function clearModifiedIndicators() {
    document.querySelectorAll('input[type="text"], select').forEach(input => {
        input.setAttribute('data-modified', 'false');
    });
    document.querySelectorAll('.nav-item').forEach(item => {
        item.classList.remove('modified');
    });
    hasUnsavedChanges = false;
}

/**
 * Handle keyboard shortcuts
 */
function handleKeyboardShortcuts(e) {
    // Ctrl+S or Cmd+S to save
    if ((e.ctrlKey || e.metaKey) && e.key === 's') {
        e.preventDefault();
        saveSettings();
    }
}

/**
 * Handle before unload
 */
function handleBeforeUnload(e) {
    if (hasUnsavedChanges) {
        e.preventDefault();
        e.returnValue = '';
        return '';
    }
}

/**
 * Handle messages from extension
 */
window.addEventListener('message', event => {
    const message = event.data;
    
    switch (message.command) {
        case 'configData':
            currentConfig = message.config;
            currentConfig.configFilePath = message.configFilePath;
            populateForm();
            clearModifiedIndicators();
            // Apply effective theme from server
            if (message.effectiveTheme) {
                applyEffectiveTheme(message.effectiveTheme);
            }
            break;
        case 'themeChanged':
            applyTheme(message.theme);
            break;
        case 'configSaved':
            showStatusMessage('success', message.message);
            clearModifiedIndicators();
            break;
        case 'configError':
            showStatusMessage('error', message.message);
            break;
        case 'firmwarePathSelected':
            document.getElementById('firmwarePath').value = message.path;
            markAsModified(document.getElementById('firmwarePath'), true);
            hasUnsavedChanges = true;
            break;
        case 'gitBashPathSelected':
            document.getElementById('gitBashPath').value = message.path;
            markAsModified(document.getElementById('gitBashPath'), true);
            hasUnsavedChanges = true;
            break;
        case 'scriptFileSelected':
            // Add command from selected script file
            addCommandFromScript(message.name, message.commandValue);
            break;
        case 'effectiveTheme':
            // Apply effective theme from extension (for auto mode)
            applyEffectiveTheme(message.theme);
            break;
    }
});

/**
 * Populate form with current configuration
 */
function populateForm() {
    // Firmware Path
    document.getElementById('firmwarePath').value = currentConfig.firmwarePath || '';
    
    // Build Commands
    renderCommandTable();
    
    // Git Bash Path
    document.getElementById('gitBashPath').value = currentConfig.buildGitBashPath || '';
    
    // COM Port
    document.getElementById('comPort').value = currentConfig.defaultComPort || '';
    
    // Language
    document.getElementById('languageSelect').value = currentConfig.language || 'auto';
    
    // Theme
    document.getElementById('themeSelect').value = currentConfig.theme || 'auto';
    
    // Apply theme preview
    applyTheme(currentConfig.theme || 'auto');
    
    // Config File Path
    if (currentConfig.configFilePath) {
        document.getElementById('configFilePath').textContent = currentConfig.configFilePath;
    }
}

/**
 * Render command table
 */
function renderCommandTable() {
    const tbody = document.getElementById('commandTableBody');
    const noCommandsMsg = document.getElementById('noCommandsMsg');
    const table = document.getElementById('commandTable');
    
    if (!currentConfig.buildCommands || currentConfig.buildCommands.length === 0) {
        tbody.innerHTML = '';
        table.style.display = 'none';
        noCommandsMsg.style.display = 'block';
        return;
    }
    
    table.style.display = 'table';
    noCommandsMsg.style.display = 'none';
    
    tbody.innerHTML = currentConfig.buildCommands.map((cmd, index) => {
        const isActive = cmd.name === currentConfig.lastBuildCommand;
        return `
            <tr class="${isActive ? 'active' : ''}">
                <td>${escapeHtml(cmd.name)}</td>
                <td>${escapeHtml(cmd.command)}</td>
                <td>
                    <div class="cmd-actions">
                        <button class="btn-icon btn-set-active" 
                                onclick="setActiveCommand(${index})" 
                                ${isActive ? 'disabled' : ''}
                                title="${isActive ? 'Current Active' : 'Set as Active'}">
                            <i class="fa-solid ${isActive ? 'fa-check' : 'fa-play'}"></i>
                        </button>
                        <button class="btn-icon btn-edit" onclick="editCommand(${index})" title="Edit">
                            <i class="fa-solid fa-pen"></i>
                        </button>
                        <button class="btn-icon btn-delete" onclick="deleteCommand(${index})" title="Delete">
                            <i class="fa-solid fa-trash"></i>
                        </button>
                    </div>
                </td>
            </tr>
        `;
    }).join('');
}

/**
 * Escape HTML special characters
 */
function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

/**
 * Browse for firmware path
 */
function browseFirmwarePath() {
    vscode.postMessage({ command: 'browseFirmwarePath' });
}

/**
 * Browse for Git Bash path
 */
function browseGitBashPath() {
    vscode.postMessage({ command: 'browseGitBashPath' });
}

/**
 * Select script file from dialog
 */
function selectScriptFile() {
    vscode.postMessage({ command: 'selectScriptFile' });
}

/**
 * Add command from selected script file
 * Fills the form inputs instead of directly adding
 */
function addCommandFromScript(name, commandValue) {
    const nameInput = document.getElementById('newCommandName');
    const valueInput = document.getElementById('newCommandValue');
    
    // Fill the form inputs with script file info
    nameInput.value = name;
    valueInput.value = commandValue;
    
    // Focus on the name input for user to review/edit
    nameInput.focus();
    nameInput.select();
    
    showStatusMessage('success', 'Script file selected. Review and click Add to save.');
}

/**
 * Add new command
 */
function addCommand() {
    const nameInput = document.getElementById('newCommandName');
    const valueInput = document.getElementById('newCommandValue');
    
    const name = nameInput.value.trim();
    const command = valueInput.value.trim();
    
    if (!name) {
        showStatusMessage('error', 'Please enter a command name');
        return;
    }
    
    if (!command) {
        showStatusMessage('error', 'Please enter a command');
        return;
    }
    
    // Check for duplicate names
    if (currentConfig.buildCommands.some(cmd => cmd.name === name)) {
        showStatusMessage('error', 'Command name already exists');
        return;
    }
    
    currentConfig.buildCommands.push({ name, command });
    
    // If this is the first command, set it as active
    if (currentConfig.buildCommands.length === 1) {
        currentConfig.lastBuildCommand = name;
    }
    
    renderCommandTable();
    
    // Clear inputs
    nameInput.value = '';
    valueInput.value = '';
    
    showStatusMessage('success', 'Command added');
}

/**
 * Set active command
 */
function setActiveCommand(index) {
    currentConfig.lastBuildCommand = currentConfig.buildCommands[index].name;
    renderCommandTable();
    showStatusMessage('success', 'Active command updated');
}

/**
 * Edit command
 */
function editCommand(index) {
    const cmd = currentConfig.buildCommands[index];
    const nameInput = document.getElementById('newCommandName');
    const valueInput = document.getElementById('newCommandValue');
    
    nameInput.value = cmd.name;
    valueInput.value = cmd.command;
    
    editingCommandIndex = index;
    
    // Change add button to update
    const addBtn = document.querySelector('.add-command-form .btn-primary');
    addBtn.innerHTML = '<i class="fa-solid fa-check"></i>';
    addBtn.onclick = updateCommand;
    
    // Add cancel button
    const formRow = document.querySelector('.add-command-form .form-row:last-child');
    if (!document.getElementById('cancelEditBtn')) {
        const cancelBtn = document.createElement('button');
        cancelBtn.id = 'cancelEditBtn';
        cancelBtn.className = 'btn btn-secondary';
        cancelBtn.innerHTML = '<i class="fa-solid fa-times"></i> Cancel';
        cancelBtn.onclick = cancelEdit;
        formRow.appendChild(cancelBtn);
    }
    
    nameInput.focus();
}

/**
 * Update command
 */
function updateCommand() {
    const nameInput = document.getElementById('newCommandName');
    const valueInput = document.getElementById('newCommandValue');
    
    const name = nameInput.value.trim();
    const command = valueInput.value.trim();
    
    if (!name || !command) {
        showStatusMessage('error', 'Please enter both name and command');
        return;
    }
    
    // Check for duplicate names (excluding current editing index)
    const duplicateIndex = currentConfig.buildCommands.findIndex(
        (cmd, idx) => cmd.name === name && idx !== editingCommandIndex
    );
    if (duplicateIndex !== -1) {
        showStatusMessage('error', 'Command name already exists');
        return;
    }
    
    const oldName = currentConfig.buildCommands[editingCommandIndex].name;
    currentConfig.buildCommands[editingCommandIndex] = { name, command };
    
    // Update lastBuildCommand if the renamed command was active
    if (currentConfig.lastBuildCommand === oldName) {
        currentConfig.lastBuildCommand = name;
    }
    
    renderCommandTable();
    cancelEdit();
    showStatusMessage('success', 'Command updated');
}

/**
 * Cancel edit
 */
function cancelEdit() {
    const nameInput = document.getElementById('newCommandName');
    const valueInput = document.getElementById('newCommandValue');
    
    nameInput.value = '';
    valueInput.value = '';
    
    editingCommandIndex = -1;
    
    // Restore add button
    const addBtn = document.querySelector('.add-command-form .btn-primary');
    addBtn.innerHTML = '<i class="fa-solid fa-plus"></i> Add';
    addBtn.onclick = addCommand;
    
    // Remove cancel button
    const cancelBtn = document.getElementById('cancelEditBtn');
    if (cancelBtn) {
        cancelBtn.remove();
    }
}

/**
 * Delete command
 */
function deleteCommand(index) {
    const cmd = currentConfig.buildCommands[index];
    
    // If deleting the active command, clear lastBuildCommand
    if (cmd.name === currentConfig.lastBuildCommand) {
        currentConfig.lastBuildCommand = '';
    }
    
    currentConfig.buildCommands.splice(index, 1);
    
    // If there's still commands and no active one, set the first as active
    if (currentConfig.buildCommands.length > 0 && !currentConfig.lastBuildCommand) {
        currentConfig.lastBuildCommand = currentConfig.buildCommands[0].name;
    }
    
    renderCommandTable();
    showStatusMessage('success', 'Command deleted');
}

/**
 * Apply theme to the document
 */
function applyTheme(theme) {
    // If auto, request effective theme from extension
    if (theme === 'auto') {
        vscode.postMessage({ command: 'getEffectiveTheme' });
        return;
    }
    
    document.documentElement.setAttribute('data-theme', theme);
}

/**
 * Apply effective theme from extension (for auto mode)
 */
function applyEffectiveTheme(effectiveTheme) {
    document.documentElement.setAttribute('data-theme', effectiveTheme);
}

// Apply initial theme as soon as possible
(function applyInitialTheme() {
    // Check if theme is already set by server-side (in HTML data-theme attribute)
    const htmlTheme = document.documentElement.getAttribute('data-theme');
    if (htmlTheme && (htmlTheme === 'dark' || htmlTheme === 'light')) {
        // Theme already set by server, use it
        return;
    }
    // Default to dark until we receive config
    document.documentElement.setAttribute('data-theme', 'dark');
})();

/**
 * Save all settings
 */
function saveSettings() {
    // Update config from form
    currentConfig.firmwarePath = document.getElementById('firmwarePath').value.trim();
    currentConfig.buildGitBashPath = document.getElementById('gitBashPath').value.trim();
    currentConfig.defaultComPort = document.getElementById('comPort').value.trim();
    currentConfig.language = document.getElementById('languageSelect').value;
    currentConfig.theme = document.getElementById('themeSelect').value;
    
    // Debug: log the config being saved
    console.log('[Settings] Saving config, theme:', currentConfig.theme);
    
    vscode.postMessage({
        command: 'saveConfig',
        config: currentConfig
    });
}

/**
 * Reset to defaults
 */
function resetToDefaults() {
    if (!confirm('Are you sure you want to reset all settings to defaults?')) {
        return;
    }
    
    vscode.postMessage({ command: 'resetConfig' });
}

/**
 * Open config file in editor
 */
function openConfigFile() {
    vscode.postMessage({ command: 'openConfigFile' });
}

/**
 * Show status message
 */
function showStatusMessage(type, message) {
    // Remove existing messages
    const existing = document.querySelector('.status-message');
    if (existing) {
        existing.remove();
    }
    
    const msgDiv = document.createElement('div');
    msgDiv.className = `status-message ${type}`;
    msgDiv.textContent = message;
    document.body.appendChild(msgDiv);
    
    // Auto remove after 3 seconds
    setTimeout(() => {
        msgDiv.style.opacity = '0';
        msgDiv.style.transform = 'translateX(100px)';
        msgDiv.style.transition = 'all 0.3s ease';
        setTimeout(() => msgDiv.remove(), 300);
    }, 3000);
}

// Initialize on load
init();