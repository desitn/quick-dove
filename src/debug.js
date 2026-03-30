/**
 * Debug utility module
 * Provides logging functionality for the extension
 */

const vscode = require('vscode');

let debugEnabled = false;

/**
 * Enable or disable debug logging
 * @param {boolean} enabled 
 */
function setDebugEnabled(enabled) {
    debugEnabled = enabled;
}

/**
 * Get debug enabled state
 * @returns {boolean}
 */
function getDebugEnabled() {
    return debugEnabled;
}

/**
 * Log debug message
 * @param {string} module Module name
 * @param {string} message Message to log
 * @param {any} data Optional data to log
 */
function debugLog(module, message, data) {
    if (!debugEnabled) return;
    
    const timestamp = new Date().toISOString();
    const logMessage = `[${timestamp}] [${module}] ${message}`;
    
    console.log(logMessage);
    if (data !== undefined) {
        console.log(data);
    }
    
    // Also log to output channel if available
    try {
        const outputChannel = vscode.window.createOutputChannel('Quick Firmware+ Debug');
        outputChannel.appendLine(logMessage);
        if (data !== undefined) {
            outputChannel.appendLine(typeof data === 'object' ? JSON.stringify(data, null, 2) : String(data));
        }
    } catch (e) {
        // Ignore errors
    }
}

module.exports = {
    setDebugEnabled,
    getDebugEnabled,
    debugLog
};
