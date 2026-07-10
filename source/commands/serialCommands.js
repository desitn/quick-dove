/**
 * Serial port and AT command management for Quick Dove
 */
const vscode = require('vscode');
const path = require('path');
const fs = require('fs');
const ini = require('ini');
const QuickSerial = require('../serial/quickSerial');

// Serial debug panel management
const serialPanels = [];
const quickSerialInstances = [];

function getSerialPanels() { return serialPanels; }
function getQuickSerialInstances() { return quickSerialInstances; }

/**
 * Register the open serial command
 */
function registerOpenSerialCommand(context) {
    return vscode.commands.registerCommand('firmwareDownloader.openSerial', async (deviceItem) => {
        try {
            let portPath = null;

            if (deviceItem && deviceItem.label) {
                portPath = deviceItem.label;
            } else {
                const qs = new QuickSerial();
                const ports = await qs.listPorts();
                if (ports.length === 0) {
                    vscode.window.showErrorMessage('No serial ports available');
                    return;
                }
                const items = ports.map(p => ({
                    label: p.path,
                    description: p.friendlyName || p.manufacturer || ''
                }));
                const selected = await vscode.window.showQuickPick(items, {
                    placeHolder: 'Select serial port'
                });
                if (!selected) return;
                portPath = selected.label;
            }

            if (!portPath) {
                vscode.window.showErrorMessage('No port specified');
                return;
            }

            const panel = vscode.window.createWebviewPanel(
                'quickSerial',
                `[Serial] ${portPath}`,
                { viewColumn: vscode.ViewColumn.Active },
                {
                    enableScripts: true,
                    retainContextWhenHidden: true,
                    localResourceRoots: [
                        vscode.Uri.file(path.join(context.extensionPath, 'source', 'webview'))
                    ]
                }
            );

            const quickSerial = new QuickSerial();
            const panelIndex = serialPanels.length;

            serialPanels.push(panel);
            quickSerialInstances.push(quickSerial);

            panel.webview.html = getSerialHtml(panel.webview, context);

            // Send the port path to webview so it can pre-select in dropdown
            setTimeout(() => {
                if (serialPanels[panelIndex] && serialPanels[panelIndex].webview) {
                    serialPanels[panelIndex].webview.postMessage({
                        command: 'preSelectPort',
                        portPath: portPath
                    });
                }
            }, 100);

            panel.onDidDispose(() => {
                const index = serialPanels.indexOf(panel);
                if (index !== -1) {
                    serialPanels.splice(index, 1);
                    quickSerialInstances.splice(index, 1);
                    quickSerial.close().catch(() => {});
                }
            });

            panel.webview.onDidReceiveMessage(async (message) => {
                await handleSerialMessage(message, panelIndex, quickSerial, panel, context);
            });

            // Auto-connect after panel is ready
            setTimeout(async () => {
                if (serialPanels[panelIndex] && serialPanels[panelIndex].webview) {
                    const success = await quickSerial.open(portPath, 115200);
                    if (success) {
                        quickSerial.setOnReceive((data) => {
                            if (serialPanels[panelIndex] && serialPanels[panelIndex].webview) {
                                serialPanels[panelIndex].webview.postMessage({
                                    command: 'addReceivedData',
                                    data: data
                                });
                            }
                        });
                        serialPanels[panelIndex].webview.postMessage({
                            command: 'serialConnected',
                            portPath: portPath,
                            baudRate: 115200
                        });
                    } else {
                        vscode.window.showErrorMessage(`Failed to connect to ${portPath}`);
                    }
                }
            }, 500);

        } catch (error) {
            vscode.window.showErrorMessage(`Failed to open serial terminal: ${error.message}`);
        }
    });
}

/**
 * Handle messages from serial webview
 */
async function handleSerialMessage(message, panelIndex, quickSerial, panel, context) {
    switch (message.command) {
        case 'serialConnected':
            try {
                const portPath = message.portPath;
                const baudRate = message.baudRate;
                const success = await quickSerial.open(portPath, baudRate);
                if (success) {
                    quickSerial.setOnReceive((data) => {
                        if (serialPanels[panelIndex] && serialPanels[panelIndex].webview) {
                            serialPanels[panelIndex].webview.postMessage({ command: 'addReceivedData', data: data });
                        }
                    });
                    if (serialPanels[panelIndex] && serialPanels[panelIndex].webview) {
                        serialPanels[panelIndex].webview.postMessage({ command: 'serialConnected', portPath, baudRate });
                    }
                } else {
                    vscode.window.showErrorMessage('Serial connection failed');
                }
            } catch (err) {
                vscode.window.showErrorMessage(`Serial connection error: ${err.message}`);
            }
            break;

        case 'serialDisconnected':
            try { await quickSerial.close(); } catch (err) {
                vscode.window.showErrorMessage(`Serial disconnect error: ${err.message}`);
            }
            break;

        case 'requestPorts':
            try {
                const ports = await quickSerial.listPorts();
                if (serialPanels[panelIndex] && serialPanels[panelIndex].webview) {
                    serialPanels[panelIndex].webview.postMessage({ command: 'updatePorts', ports });
                }
            } catch (err) {
                vscode.window.showErrorMessage(`Failed to get serial port list: ${err.message}`);
            }
            break;

        case 'sendData':
            try {
                const data = message.data;
                const isHex = message.isHex || false;
                const isCRLF = (message.isCRLF === undefined || message.isCRLF === null) ? true : message.isCRLF;
                await quickSerial.write(data, isHex, isCRLF);
            } catch (err) {
                vscode.window.showErrorMessage(`Failed to send data: ${err.message}`);
            }
            break;

        case 'setDTR':
            try { if (quickSerial.isOpen) await quickSerial.setDTR(message.state); } catch (err) {}
            break;

        case 'setRTS':
            try { if (quickSerial.isOpen) await quickSerial.setRTS(message.state); } catch (err) {}
            break;

        case 'loadAtCommands':
            loadAtCommandsFromIni(message.configName || null, panel);
            break;

        case 'loadAtConfigList':
            loadAtConfigList(context);
            break;

        case 'updateAtCommand':
            updateAtCommand(message.oldCommand, message.newCommand, message.configName, message.commandIndex, panel);
            break;

        case 'addNewAtConfig':
            await addNewAtConfig(context);
            break;

        case 'saveLog':
            try {
                const logContent = message.content || '';
                const defaultName = `serial-log-${new Date().toISOString().slice(0, 19).replace(/:/g, '-')}.txt`;
                const result = await vscode.window.showSaveDialog({
                    defaultUri: vscode.Uri.file(defaultName),
                    filters: { 'Text Files': ['txt', 'log'], 'All Files': ['*'] }
                });
                if (result) {
                    fs.writeFileSync(result.fsPath, logContent, 'utf-8');
                    vscode.window.showInformationMessage(`Log saved to ${result.fsPath}`);
                }
            } catch (err) {
                vscode.window.showErrorMessage(`Failed to save log: ${err.message}`);
            }
            break;
    }
}

/**
 * Generate serial webview HTML
 */
function getSerialHtml(webview, context) {
    const serialCssUri = webview.asWebviewUri(
        vscode.Uri.file(path.join(context.extensionPath, 'source', 'webview', 'serial', 'serial.css'))
    );
    const serialJsUri = webview.asWebviewUri(
        vscode.Uri.file(path.join(context.extensionPath, 'source', 'webview', 'serial', 'serial.js'))
    );
    const fontAwesomeUri = webview.asWebviewUri(
        vscode.Uri.file(path.join(context.extensionPath, 'source', 'webview', 'assets', 'fontawesome', 'all.min.css'))
    );
    const htmlPath = path.join(context.extensionPath, 'source', 'webview', 'serial', 'serial.html');
    let html = fs.readFileSync(htmlPath, 'utf-8');
    html = html.replace('{{serial.css}}', serialCssUri.toString());
    html = html.replace('{{serial.js}}', serialJsUri.toString());
    html = html.replace('{{fontawesome.css}}', fontAwesomeUri.toString());
    return html;
}

// ======================== AT Command Management ========================

function parseAtCommandsFromIni(iniFile) {
    const commands = [];
    const numericSections = Object.keys(iniFile).filter(key =>
        !isNaN(key) && typeof iniFile[key] === 'object' && key !== 'SET'
    );
    if (numericSections.length > 0) {
        numericSections.sort((a, b) => parseInt(a) - parseInt(b)).forEach(sectionKey => {
            const cmdValue = iniFile[sectionKey]['CMD'];
            if (typeof cmdValue === 'string') {
                commands.push(cmdValue);
            } else if (cmdValue === undefined || cmdValue === null) {
                commands.push('');
            }
        });
    }
    return commands;
}

function loadAtConfigList(context) {
    const config = vscode.workspace.getConfiguration('quickSerial');
    let atCommandPaths = config.get('atCommandPaths') || [];
    const configs = [];

    if (atCommandPaths.length === 0) {
        const defaultPath = path.join(context.extensionPath, 'source', 'webview', 'serial', 'basic.ini');
        if (fs.existsSync(defaultPath)) {
            configs.push({ name: `file:${defaultPath}`, displayName: `Basic Commands` });
            atCommandPaths.push(defaultPath);
            config.update('atCommandPaths', atCommandPaths, vscode.ConfigurationTarget.Global);
        }
    }

    atCommandPaths.forEach((cmdPath) => {
        if (cmdPath && cmdPath.trim() !== '') {
            if (fs.existsSync(cmdPath)) {
                const fileName = path.basename(cmdPath, '.ini').toUpperCase().substring(0, 10);
                configs.push({ name: `file:${cmdPath}`, displayName: `${fileName}` });
            }
        }
    });

    serialPanels.forEach(panel => {
        if (panel && panel.webview) {
            panel.webview.postMessage({ command: 'updateAtConfigList', configs });
        }
    });
}

function loadAtCommandsFromIni(configName, targetPanel) {
    let iniPath = null;
    let atCommands = [];

    if (configName && configName.startsWith('file:')) {
        iniPath = configName.substring(5);
    }
    if (!iniPath || !fs.existsSync(iniPath)) return;

    try {
        const iniFile = ini.parse(fs.readFileSync(iniPath, 'utf-8'));
        atCommands = parseAtCommandsFromIni(iniFile);
    } catch (error) {
        console.error('Error loading AT commands:', error);
    }

    const panels = targetPanel ? [targetPanel] : serialPanels;
    panels.forEach(panel => {
        if (panel && panel.webview) {
            panel.webview.postMessage({ command: 'displayAtCommands', commands: atCommands });
        }
    });
}

function updateAtCommand(oldCommand, newCommand, configName, commandIndex, targetPanel) {
    let iniPath = null;
    if (configName && configName.startsWith('file:')) {
        iniPath = configName.substring(5);
    }
    if (!iniPath || !fs.existsSync(iniPath)) return;

    try {
        const iniFile = ini.parse(fs.readFileSync(iniPath, 'utf-8'));
        const numericSections = Object.keys(iniFile).filter(key =>
            !isNaN(key) && typeof iniFile[key] === 'object' && key !== 'SET'
        );
        if (numericSections.length > 0) {
            numericSections.sort((a, b) => parseInt(a) - parseInt(b));
            if (commandIndex >= 0 && commandIndex < numericSections.length) {
                const targetSection = numericSections[commandIndex];
                iniFile[targetSection]['CMD'] = newCommand;
            }
        }
        fs.writeFileSync(iniPath, ini.stringify(iniFile));
        loadAtCommandsFromIni(configName, targetPanel);
    } catch (error) {
        console.error('Error updating AT command:', error);
    }
}

async function addNewAtConfig(context) {
    try {
        const fileUri = await vscode.window.showOpenDialog({
            canSelectMany: false,
            openLabel: 'Select',
            filters: { 'INI Files': ['ini'], 'All Files': ['*'] }
        });
        if (fileUri && fileUri[0]) {
            const filePath = fileUri[0].fsPath;
            if (!filePath.toLowerCase().endsWith('.ini')) {
                vscode.window.showErrorMessage('Please select a valid .ini file');
                return;
            }
            const config = vscode.workspace.getConfiguration('quickSerial');
            let atCommandPaths = config.get('atCommandPaths') || [];
            if (!atCommandPaths.includes(filePath)) {
                atCommandPaths.push(filePath);
                await config.update('atCommandPaths', atCommandPaths, vscode.ConfigurationTarget.Global);
                loadAtConfigList(context);
                vscode.window.showInformationMessage('Successfully added AT command configuration file!');
            } else {
                vscode.window.showInformationMessage('The configuration file already exists!');
            }
        }
    } catch (error) {
        console.error('Error adding new AT config:', error);
        vscode.window.showErrorMessage('Error occurred while creating new AT configuration');
    }
}

module.exports = {
    registerOpenSerialCommand,
    serialPanels,
    quickSerialInstances,
    getSerialPanels,
    getQuickSerialInstances
};
