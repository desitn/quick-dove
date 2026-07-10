/**
 * C/C++ Define Helper Commands
 */
const vscode = require('vscode');
const path = require('path');
const fs = require('fs');

/**
 * Check if a define name is valid
 */
function isValidCppDefineName(text) {
    const definePattern = /^[A-Z_][A-Z0-9_]*$/;
    return definePattern.test(text);
}

/**
 * Get C/C++ defines from workspace settings
 */
function getCppDefines() {
    const workspaceFolders = vscode.workspace.workspaceFolders;
    if (!workspaceFolders || workspaceFolders.length === 0) return [];
    const settingsPath = path.join(workspaceFolders[0].uri.fsPath, '.vscode', 'settings.json');
    if (!fs.existsSync(settingsPath)) return [];
    try {
        const content = fs.readFileSync(settingsPath, 'utf8');
        if (!content.trim()) return [];
        const settings = JSON.parse(content);
        return settings['C_Cpp.default.defines'] || [];
    } catch (error) {
        return [];
    }
}

/**
 * Save C/C++ defines to workspace settings
 */
function saveCppDefines(defines) {
    const workspaceFolders = vscode.workspace.workspaceFolders;
    if (!workspaceFolders || workspaceFolders.length === 0) return false;
    const settingsPath = path.join(workspaceFolders[0].uri.fsPath, '.vscode', 'settings.json');
    const vscodeDir = path.dirname(settingsPath);
    if (!fs.existsSync(vscodeDir)) fs.mkdirSync(vscodeDir, { recursive: true });
    let settings = {};
    if (fs.existsSync(settingsPath)) {
        try {
            const content = fs.readFileSync(settingsPath, 'utf8');
            if (content.trim()) settings = JSON.parse(content);
        } catch (error) { settings = {}; }
    }
    settings['C_Cpp.default.defines'] = defines;
    try {
        fs.writeFileSync(settingsPath, JSON.stringify(settings, null, 4));
        return true;
    } catch (error) { return false; }
}

/**
 * Toggle C/C++ define in settings
 * @returns {boolean} true if added, false if removed
 */
function toggleCppDefine(defineName) {
    const defines = getCppDefines();
    const index = defines.indexOf(defineName);
    if (index > -1) {
        defines.splice(index, 1);
        saveCppDefines(defines);
        return false;
    } else {
        defines.push(defineName);
        saveCppDefines(defines);
        return true;
    }
}

module.exports = {
    isValidCppDefineName,
    getCppDefines,
    saveCppDefines,
    toggleCppDefine
};
