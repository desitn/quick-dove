/**
 * Utility functions for Quick Dove extension
 */
const vscode = require('vscode');
const path = require('path');
const fs = require('fs');
const { spawn } = require('child_process');
const { configManager } = require('./config/configManager');
const { localize } = require('./localization');

/** @note dove executable path */
const FIRMWARE_CLI = 'dove.exe';

const output_chan = vscode.window.createOutputChannel('Quick Dove');
const alert = localize('noFirmware');

function getOutputChan() {
    return output_chan;
}

function getFirmwareCliName() {
    return FIRMWARE_CLI;
}

function getFirmwareAlert() {
    return alert;
}

/**
 * Get configuration from config manager
 */
function get_configuration() {
    return configManager.getConfig();
}

/**
 * Write .dove/dove.json configuration file
 */
function writeFirmwareCliConfig(config) {
    const configPath = configManager.getConfigPath();
    if (!configPath) return;

    const configToWrite = {
        workspacePath: config.workspacePath ?? '',
        firmwarePath: config.firmwarePath ?? '',
        buildCommands: config.buildCommands ?? [],
        buildGitBashPath: config.buildGitBashPath ?? '',
        comPorts: config.comPorts ?? [],
        theme: config.theme ?? { color: 'blue' },
        extension: config.extension ?? { language: 'auto', themeMode: 'auto' }
    };

    const newContent = JSON.stringify(configToWrite, null, 2);
    try {
        if (fs.existsSync(configPath)) {
            const existingContent = fs.readFileSync(configPath, 'utf8');
            if (existingContent === newContent) return;
        }
        fs.writeFileSync(configPath, newContent);
        output_chan.appendLine(localize('configurationWritten', configPath));
    } catch (error) {
        output_chan.appendLine(localize('failedToWriteConfig', error.message));
    }
}

function is_windows() {
    return process.platform === 'win32';
}

function is_remote_ssh() {
    return vscode.env.remoteName === 'ssh-remote';
}

function not_support_disp() {
    vscode.window.showErrorMessage(alert);
}

/**
 * Setup environment variables for VSCode terminals
 */
function setupTerminalEnvironment(context) {
    const doveDir = path.join(context.extensionPath, 'dove');

    if (fs.existsSync(path.join(doveDir, 'dove.exe'))) {
        context.environmentVariableCollection.prepend('PATH', doveDir + ';');
        context.environmentVariableCollection.replace('DOVE_PATH', doveDir);
        output_chan.appendLine(`[Terminal Environment] dove path added: ${doveDir}`);
    } else {
        output_chan.appendLine('[Terminal Environment] dove.exe not found, skipping PATH setup');
    }
}

/**
 * Get dove executable path
 */
function getFirmwareCliPath(context) {
    if (!context || !context.extensionPath) {
        return null;
    }
    const firmwareCliPath = path.join(context.extensionPath, 'dove', 'dove.exe');
    if (fs.existsSync(firmwareCliPath)) {
        return firmwareCliPath;
    }
    return null;
}

/**
 * Kill process tree (Windows: taskkill, others: SIGKILL)
 */
function kill_process_tree(child_process, signal = 'SIGKILL') {
    return new Promise((resolve, reject) => {
        if (!child_process || !child_process.pid) {
            resolve();
            return;
        }
        if (is_windows()) {
            const taskkill = spawn('taskkill', ['/PID', child_process.pid, '/T', '/F'], { shell: true });
            taskkill.on('close', (code) => {
                if (code === 0 || code === 128) {
                    resolve();
                } else {
                    reject(new Error(`taskkill failed with code ${code}`));
                }
            });
            taskkill.on('error', (error) => {
                reject(error);
            });
        } else {
            try {
                child_process.kill(signal);
                resolve();
            } catch (error) {
                reject(error);
            }
        }
    });
}

module.exports = {
    get_configuration,
    writeFirmwareCliConfig,
    is_windows,
    is_remote_ssh,
    not_support_disp,
    setupTerminalEnvironment,
    getFirmwareCliPath,
    kill_process_tree,
    getOutputChan,
    getFirmwareCliName,
    getFirmwareAlert,
    configManager,
    FIRMWARE_CLI,
    output_chan,
    alert
};
