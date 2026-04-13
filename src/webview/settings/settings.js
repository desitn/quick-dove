/**
 * Settings Page JavaScript
 * Handles configuration viewing and editing with macOS-style two-column layout
 */

const vscode = acquireVsCodeApi();

// Current configuration state
let currentConfig = {
    firmwarePath: '',
    buildCommands: [],
    buildGitBashPath: '',
    defaultComPort: '',
    comPorts: [],
    language: 'auto',
    theme: {
        mode: 'auto',
        accent: 'blue'
    }
};

// Localized strings for button text
let localizedStrings = {};

// Command being edited
let editingCommandIndex = -1;

// Port being edited
let editingPortIndex = -1;

// Track if settings have been modified
let hasUnsavedChanges = false;

// Section titles mapping
const sectionTitles = {
    'firmware': { icon: 'fa-folder-open', text: '' },
    'commands': { icon: 'fa-terminal', text: '' },
    'gitbash': { icon: 'fa-git-alt', text: '' },
    'comport': { icon: 'fa-plug', text: '' },
    'cppdefine': { icon: 'fa-code', text: '' },
    'language': { icon: 'fa-language', text: '' },
    'theme': { icon: 'fa-palette', text: '' },
    'agent': { icon: 'fa-robot', text: '' },
    'config': { icon: 'fa-file-code', text: '' }
};

// Current C/C++ defines state
let currentDefines = [];

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

    // Request C/C++ defines data
    vscode.postMessage({ command: 'getCppDefines' });

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
        'cppdefine': 'settings.cppDefine',
        'language': 'settings.language',
        'theme': 'settings.theme',
        'agent': 'settings.agentIntegration',
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
            // Store localized strings for button text
            if (message.localizedStrings) {
                localizedStrings = message.localizedStrings;
            }
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
        case 'accentColorChanged':
            applyAccentColor(message.accentColor);
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
        case 'skillInstallResult':
            handleSkillInstallResult(message);
            break;
        case 'skillUninstallResult':
            handleSkillUninstallResult(message);
            break;
        case 'skillStatusResult':
            handleSkillStatusResult(message);
            break;
        case 'cppDefineData':
            currentDefines = message.defines;
            renderDefineTable();
            break;
        case 'cppDefineAdded':
            showStatusMessage('success', message.defineName + ' added');
            break;
        case 'cppDefineRemoved':
            showStatusMessage('success', message.defineName + ' removed');
            break;
        case 'cppDefineError':
            showStatusMessage('error', message.message);
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

    // COM Ports (new multi-port with tags)
    renderPortTable();

    // Language
    document.getElementById('languageSelect').value = currentConfig.language || 'auto';

    // Theme - handle both old (string) and new (object) structure
    const themeConfig = typeof currentConfig.theme === 'object' ? currentConfig.theme : { mode: currentConfig.theme || 'auto', accent: currentConfig.accentColor || 'blue' };
    document.getElementById('themeSelect').value = themeConfig.mode || 'auto';
    document.getElementById('accentColorSelect').value = themeConfig.accent || 'blue';

    // Apply theme preview
    applyTheme(themeConfig.mode || 'auto');

    // Apply accent color
    applyAccentColor(themeConfig.accent || 'blue');

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
        const isActive = cmd.isActive;
        return `
            <tr class="${isActive ? 'active' : ''}">
                <td>${escapeHtml(cmd.name)}</td>
                <td>${escapeHtml(cmd.description || '')}</td>
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
 * Render port table
 */
function renderPortTable() {
    const tbody = document.getElementById('portTableBody');
    const noPortsMsg = document.getElementById('noPortsMsg');
    const table = document.getElementById('portTable');

    if (!currentConfig.comPorts || currentConfig.comPorts.length === 0) {
        tbody.innerHTML = '';
        table.style.display = 'none';
        noPortsMsg.style.display = 'block';
        return;
    }

    table.style.display = 'table';
    noPortsMsg.style.display = 'none';

    tbody.innerHTML = currentConfig.comPorts.map((p, index) => {
        const isActive = p.isActive;
        const tagsHtml = p.tags.map(t => `<span class="tag-badge tag-${t.toLowerCase()}">${t}</span>`).join('');
        return `
            <tr class="${isActive ? 'active' : ''}">
                <td>${escapeHtml(p.port)}</td>
                <td>${tagsHtml}</td>
                <td>${escapeHtml(p.description || '')}</td>
                <td>
                    <div class="port-actions">
                        <button class="btn-icon btn-set-active"
                                onclick="setActivePort(${index})"
                                ${isActive ? 'disabled' : ''}
                                title="${isActive ? 'Current Active' : 'Set as Active'}">
                            <i class="fa-solid ${isActive ? 'fa-check' : 'fa-play'}"></i>
                        </button>
                        <button class="btn-icon btn-edit" onclick="editPort(${index})" title="Edit">
                            <i class="fa-solid fa-pen"></i>
                        </button>
                        <button class="btn-icon btn-delete" onclick="deletePort(${index})" title="Delete">
                            <i class="fa-solid fa-trash"></i>
                        </button>
                    </div>
                </td>
            </tr>
        `;
    }).join('');
}

/**
 * Add new port
 */
function addPort() {
    const portInput = document.getElementById('newPortName');
    const descInput = document.getElementById('newPortDesc');
    const port = portInput.value.trim();
    const description = descInput.value.trim();

    // Collect selected tags
    const tags = [];
    document.querySelectorAll('.tag-checkbox input:checked').forEach(cb => {
        tags.push(cb.value);
    });

    if (!port) {
        showStatusMessage('error', localizedStrings.portNameEmpty || 'Please enter port name');
        return;
    }

    if (tags.length === 0) {
        showStatusMessage('error', localizedStrings.portTagsEmpty || 'Please select at least one tag');
        return;
    }

    // Check for duplicate ports
    if (currentConfig.comPorts && currentConfig.comPorts.some(p => p.port === port)) {
        showStatusMessage('error', localizedStrings.portExists || 'Port already exists');
        return;
    }

    vscode.postMessage({
        command: 'addComPort',
        port: port,
        tags: tags,
        description: description
    });

    // Clear form
    portInput.value = '';
    descInput.value = '';
    document.querySelectorAll('.tag-checkbox input').forEach(cb => cb.checked = false);
}

/**
 * Delete port
 */
function deletePort(index) {
    if (!currentConfig.comPorts || index >= currentConfig.comPorts.length) {
        return;
    }

    const portName = currentConfig.comPorts[index].port;
    if (!confirm(`Delete port "${portName}"?`)) {
        return;
    }

    vscode.postMessage({
        command: 'deleteComPort',
        index: index
    });
}

/**
 * Set active port
 */
function setActivePort(index) {
    if (!currentConfig.comPorts || index >= currentConfig.comPorts.length) {
        return;
    }

    vscode.postMessage({
        command: 'setActiveComPort',
        portName: currentConfig.comPorts[index].port
    });
}

/**
 * Edit port - populate form with existing values
 */
function editPort(index) {
    if (!currentConfig.comPorts || index >= currentConfig.comPorts.length) {
        return;
    }

    editingPortIndex = index;
    const port = currentConfig.comPorts[index];

    // Populate form
    document.getElementById('newPortName').value = port.port;
    document.getElementById('newPortDesc').value = port.description || '';

    // Clear all checkboxes first
    document.querySelectorAll('.tag-checkbox input').forEach(cb => cb.checked = false);

    // Set checkboxes based on existing tags
    port.tags.forEach(tag => {
        const checkbox = document.querySelector(`.tag-checkbox input[value="${tag}"]`);
        if (checkbox) checkbox.checked = true;
    });

    // Change add button to update button
    const addBtn = document.querySelector('.add-port-form .btn-primary');
    addBtn.innerHTML = '<i class="fa-solid fa-save"></i> Update';
    addBtn.onclick = () => updatePort(index);

    // Focus on port name input
    document.getElementById('newPortName').focus();
}

/**
 * Update port after editing
 */
function updatePort(index) {
    if (index < 0) {
        return;
    }

    const port = document.getElementById('newPortName').value.trim();
    const description = document.getElementById('newPortDesc').value.trim();

    const tags = [];
    document.querySelectorAll('.tag-checkbox input:checked').forEach(cb => {
        tags.push(cb.value);
    });

    if (!port) {
        showStatusMessage('error', localizedStrings.portNameEmpty || 'Please enter port name');
        return;
    }

    if (tags.length === 0) {
        showStatusMessage('error', localizedStrings.portTagsEmpty || 'Please select at least one tag');
        return;
    }

    vscode.postMessage({
        command: 'updateComPort',
        index: index,
        updates: {
            port: port,
            tags: tags,
            description: description
        }
    });

    // Reset form
    editingPortIndex = -1;
    document.getElementById('newPortName').value = '';
    document.getElementById('newPortDesc').value = '';
    document.querySelectorAll('.tag-checkbox input').forEach(cb => cb.checked = false);

    // Reset button
    const addBtn = document.querySelector('.add-port-form .btn-primary');
    addBtn.innerHTML = '<i class="fa-solid fa-plus"></i> Add';
    addBtn.onclick = addPort;
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
    const descInput = document.getElementById('newCommandDesc');
    const valueInput = document.getElementById('newCommandValue');

    const name = nameInput.value.trim();
    const description = descInput.value.trim();
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

    // Set isActive to true if this is the first command
    const isActive = currentConfig.buildCommands.length === 0;

    currentConfig.buildCommands.push({ name, description, command, isActive });

    renderCommandTable();

    // Clear inputs
    nameInput.value = '';
    descInput.value = '';
    valueInput.value = '';

    showStatusMessage('success', 'Command added');
}

/**
 * Set active command
 */
function setActiveCommand(index) {
    // Clear all isActive flags and set the specified one
    currentConfig.buildCommands.forEach((cmd, idx) => {
        cmd.isActive = idx === index;
    });
    renderCommandTable();
    showStatusMessage('success', 'Active command updated');
}

/**
 * Edit command
 */
function editCommand(index) {
    const cmd = currentConfig.buildCommands[index];
    const nameInput = document.getElementById('newCommandName');
    const descInput = document.getElementById('newCommandDesc');
    const valueInput = document.getElementById('newCommandValue');

    nameInput.value = cmd.name;
    descInput.value = cmd.description || '';
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
    const descInput = document.getElementById('newCommandDesc');
    const valueInput = document.getElementById('newCommandValue');

    const name = nameInput.value.trim();
    const description = descInput.value.trim();
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

    // Preserve isActive status
    const wasActive = currentConfig.buildCommands[editingCommandIndex].isActive;
    currentConfig.buildCommands[editingCommandIndex] = { name, description, command, isActive: wasActive };

    renderCommandTable();
    cancelEdit();
    showStatusMessage('success', 'Command updated');
}

/**
 * Cancel edit
 */
function cancelEdit() {
    const nameInput = document.getElementById('newCommandName');
    const descInput = document.getElementById('newCommandDesc');
    const valueInput = document.getElementById('newCommandValue');

    nameInput.value = '';
    descInput.value = '';
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

    // If deleting the active command, transfer active status to another command
    if (cmd.isActive) {
        currentConfig.buildCommands.splice(index, 1);
        // Set first command as active if available
        if (currentConfig.buildCommands.length > 0) {
            currentConfig.buildCommands[0].isActive = true;
        }
    } else {
        currentConfig.buildCommands.splice(index, 1);
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
 * Apply accent color to the document
 */
function applyAccentColor(accent) {
    document.documentElement.setAttribute('data-accent', accent);
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
    // comPorts is managed separately through add/update/delete messages
    // defaultComPort is auto-synced with active port in configManager
    currentConfig.language = document.getElementById('languageSelect').value;
    currentConfig.theme = {
        mode: document.getElementById('themeSelect').value,
        accent: document.getElementById('accentColorSelect').value
    };

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
 * Install skill to Claude Code
 */
function installToClaudeCode() {
    const btn = document.getElementById('btnInstallClaudeCode');
    btn.disabled = true;
    const installingText = localizedStrings.installing || 'Installing...';
    btn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> ' + installingText;

    vscode.postMessage({ command: 'installSkill', agent: 'claude-code' });
}

/**
 * Install skill to Cline
 */
function installToCline() {
    const btn = document.getElementById('btnInstallCline');
    btn.disabled = true;
    const installingText = localizedStrings.installing || 'Installing...';
    btn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> ' + installingText;

    vscode.postMessage({ command: 'installSkill', agent: 'cline' });
}

/**
 * Uninstall skill from Claude Code
 */
function uninstallFromClaudeCode() {
    const btn = document.getElementById('btnUninstallClaudeCode');
    btn.disabled = true;
    const uninstallingText = localizedStrings.uninstalling || 'Uninstalling...';
    btn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> ' + uninstallingText;

    vscode.postMessage({ command: 'uninstallSkill', agent: 'claude-code' });
}

/**
 * Uninstall skill from Cline
 */
function uninstallFromCline() {
    const btn = document.getElementById('btnUninstallCline');
    btn.disabled = true;
    const uninstallingText = localizedStrings.uninstalling || 'Uninstalling...';
    btn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> ' + uninstallingText;

    vscode.postMessage({ command: 'uninstallSkill', agent: 'cline' });
}

/**
 * Handle skill install result
 */
function handleSkillInstallResult(message) {
    const agent = message.agent;
    let installBtn, uninstallBtn;

    if (agent === 'claude-code') {
        installBtn = document.getElementById('btnInstallClaudeCode');
        uninstallBtn = document.getElementById('btnUninstallClaudeCode');
    } else if (agent === 'cline') {
        installBtn = document.getElementById('btnInstallCline');
        uninstallBtn = document.getElementById('btnUninstallCline');
    }

    const installText = localizedStrings.install || 'Install';
    const uninstallText = localizedStrings.uninstall || 'Uninstall';

    if (installBtn) {
        installBtn.disabled = false;
        installBtn.innerHTML = '<i class="fa-solid fa-download"></i> ' + installText;
    }
    if (uninstallBtn) {
        uninstallBtn.disabled = false;
        uninstallBtn.innerHTML = '<i class="fa-solid fa-trash"></i> ' + uninstallText;
    }

    if (message.success) {
        showStatusMessage('success', message.message || 'Installation successful');
        // Refresh skill status
        vscode.postMessage({ command: 'checkSkillStatus', agent: agent });
    } else {
        showStatusMessage('error', message.message || 'Installation failed');
    }
}

/**
 * Handle skill uninstall result
 */
function handleSkillUninstallResult(message) {
    const agent = message.agent;
    let installBtn, uninstallBtn;

    if (agent === 'claude-code') {
        installBtn = document.getElementById('btnInstallClaudeCode');
        uninstallBtn = document.getElementById('btnUninstallClaudeCode');
    } else if (agent === 'cline') {
        installBtn = document.getElementById('btnInstallCline');
        uninstallBtn = document.getElementById('btnUninstallCline');
    }

    const installText = localizedStrings.install || 'Install';
    const uninstallText = localizedStrings.uninstall || 'Uninstall';

    if (installBtn) {
        installBtn.disabled = false;
        installBtn.innerHTML = '<i class="fa-solid fa-download"></i> ' + installText;
    }
    if (uninstallBtn) {
        uninstallBtn.disabled = false;
        uninstallBtn.innerHTML = '<i class="fa-solid fa-trash"></i> ' + uninstallText;
    }

    if (message.success) {
        showStatusMessage('success', message.message || 'Uninstallation successful');
        // Refresh skill status
        vscode.postMessage({ command: 'checkSkillStatus', agent: agent });
    } else {
        showStatusMessage('error', message.message || 'Uninstallation failed');
    }
}

/**
 * Handle skill status check result
 */
function handleSkillStatusResult(message) {
    const agent = message.agent;
    let statusContainer;

    if (agent === 'claude-code') {
        statusContainer = document.getElementById('claudeCodeStatus');
    } else if (agent === 'cline') {
        statusContainer = document.getElementById('clineStatus');
    }

    if (!statusContainer) return;

    if (message.installed) {
        statusContainer.innerHTML = `
            <div class="status-item">
                <div class="status-icon installed">
                    <i class="fa-solid fa-check"></i>
                </div>
                <div class="status-info">
                    <div class="status-title">Installed (${message.skillsCount} skills)</div>
                    <div class="status-path">${escapeHtml(message.path)}</div>
                    ${message.version ? `<div class="status-version">Version: ${escapeHtml(message.version)}</div>` : ''}
                    ${message.extensionName ? `<div class="status-version">Extension: ${escapeHtml(message.extensionName)}</div>` : ''}
                </div>
            </div>
        `;
    } else {
        statusContainer.innerHTML = `
            <div class="status-item">
                <div class="status-icon not-installed">
                    <i class="fa-solid fa-times"></i>
                </div>
                <div class="status-info">
                    <div class="status-title">Not Installed</div>
                    <div class="status-path">Click "Install" to add skills</div>
                </div>
            </div>
        `;
    }

    // Handle old version warning
    if (message.hasOldVersion && message.oldVersions && message.oldVersions.length > 0) {
        statusContainer.innerHTML += `
            <div class="status-item">
                <div class="status-icon warning">
                    <i class="fa-solid fa-exclamation-triangle"></i>
                </div>
                <div class="status-info">
                    <div class="status-title">Old Versions Found</div>
                    <div class="status-path">${message.oldVersions.map(v => escapeHtml(v)).join('<br>')}</div>
                </div>
            </div>
        `;
    }
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

/**
 * Render define table
 */
function renderDefineTable() {
    const tbody = document.getElementById('defineTableBody');
    const table = document.getElementById('defineTable');
    const noDefinesMsg = document.getElementById('noDefinesMsg');

    if (!currentDefines || currentDefines.length === 0) {
        tbody.innerHTML = '';
        table.style.display = 'none';
        noDefinesMsg.style.display = 'block';
        return;
    }

    table.style.display = 'table';
    noDefinesMsg.style.display = 'none';

    tbody.innerHTML = currentDefines.map(define => `
        <tr>
            <td>${escapeHtml(define)}</td>
            <td>
                <button class="btn-icon" onclick="deleteDefine('${escapeHtml(define)}')">
                    <i class="fa-solid fa-trash"></i>
                </button>
            </td>
        </tr>
    `).join('');
}

/**
 * Add new define
 */
function addDefine() {
    const input = document.getElementById('newDefineName');
    const defineName = input.value.trim();

    if (!defineName) {
        showStatusMessage('error', 'Please enter a define name');
        return;
    }

    // Validate define name (must be uppercase letters, numbers, underscores)
    const validPattern = /^[A-Z_][A-Z0-9_]*$/;
    if (!validPattern.test(defineName)) {
        showStatusMessage('error', 'Invalid define name (must be uppercase letters, numbers, underscores)');
        return;
    }

    vscode.postMessage({
        command: 'addCppDefine',
        defineName: defineName
    });

    input.value = '';
}

/**
 * Delete define
 */
function deleteDefine(defineName) {
    vscode.postMessage({
        command: 'deleteCppDefine',
        defineName: defineName
    });
}

/**
 * Open keybinding settings
 */
function openKeybindingSettings() {
    vscode.postMessage({ command: 'openKeybindingSettings' });
}

// Initialize on load
init();