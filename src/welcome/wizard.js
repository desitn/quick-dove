const vscode = acquireVsCodeApi();
let currentStep = 1;
const totalSteps = 4;

// Localization strings (will be replaced by the extension)
const strings = window.wizardStrings || {};

// Request auto-detect firmware path when page loads
document.addEventListener('DOMContentLoaded', () => {
    // Request auto-detect from extension
    vscode.postMessage({ command: 'autoDetectFirmwarePath' });
});

// Handle messages from extension
window.addEventListener('message', event => {
    const message = event.data;
    switch (message.command) {
        case 'firmwarePathSelected':
            document.getElementById('firmwarePath').value = message.path;
            break;
        case 'autoDetectResult':
            // Show auto-detect result in input (display only, actual path is empty)
            if (message.detected) {
                document.getElementById('firmwarePath').value = message.displayText;
            }
            break;
        case 'gitBashPathSelected':
            document.getElementById('gitBashPath').value = message.path;
            break;
        case 'scriptFileSelected':
            // Add command from selected script file
            addCommandFromScript(message.name, message.commandValue);
            break;
    }
});

function selectFirmwarePath() {
    vscode.postMessage({ command: 'selectFirmwarePath' });
}

function selectGitBashPath() {
    vscode.postMessage({ command: 'selectGitBashPath' });
}

function selectScriptFile() {
    vscode.postMessage({ command: 'selectScriptFile' });
}

function addManualCommand() {
    const list = document.getElementById('commandList');
    const item = document.createElement('div');
    item.className = 'command-item';
    const namePlaceholder = strings.wizard_commandName || 'Name';
    const valuePlaceholder = strings.wizard_commandValue || 'Command';
    item.innerHTML = `
        <input type="text" placeholder="${namePlaceholder}" class="cmd-name">
        <input type="text" placeholder="${valuePlaceholder}" class="cmd-value">
        <button class="btn btn-remove" onclick="removeCommand(this)">-</button>
    `;
    list.appendChild(item);
    // Remove "no commands" message if it exists
    const noCommandsMsg = list.querySelector('.no-commands');
    if (noCommandsMsg) {
        noCommandsMsg.remove();
    }
}

function addCommandFromScript(name, commandValue) {
    const list = document.getElementById('commandList');
    // Remove "no commands" message if it exists
    const noCommandsMsg = list.querySelector('.no-commands');
    if (noCommandsMsg) {
        noCommandsMsg.remove();
    }
    
    const item = document.createElement('div');
    item.className = 'command-item';
    const namePlaceholder = strings.wizard_commandName || 'Name';
    const valuePlaceholder = strings.wizard_commandValue || 'Command';
    item.innerHTML = `
        <input type="text" placeholder="${namePlaceholder}" class="cmd-name" value="${name}">
        <input type="text" placeholder="${valuePlaceholder}" class="cmd-value" value="${commandValue}">
        <button class="btn btn-remove" onclick="removeCommand(this)">-</button>
    `;
    list.appendChild(item);
}

function removeCommand(btn) {
    btn.parentElement.remove();
    // Show "no commands" message if list is empty
    const list = document.getElementById('commandList');
    if (list.children.length === 0) {
        showNoCommandsMessage();
    }
}

function showNoCommandsMessage() {
    const list = document.getElementById('commandList');
    const message = strings.wizard_noCommandsAdded || 'No build commands added yet. Use the buttons above to add commands.';
    list.innerHTML = `<div class="no-commands">${message}</div>`;
}

// Initialize with no commands message
showNoCommandsMessage();

function nextStep() {
    if (currentStep < totalSteps) {
        if (currentStep === totalSteps - 1) {
            // Update summary before showing last step
            updateSummary();
            const finishText = strings.wizard_finish || 'Finish';
            document.getElementById('btn-next').textContent = finishText;
        }
        if (currentStep === totalSteps) {
            saveConfig();
            return;
        }
        document.getElementById(`step${currentStep}`).classList.remove('active');
        document.getElementById(`step${currentStep}-indicator`).classList.remove('active');
        document.getElementById(`step${currentStep}-indicator`).classList.add('completed');
        currentStep++;
        document.getElementById(`step${currentStep}`).classList.add('active');
        document.getElementById(`step${currentStep}-indicator`).classList.add('active');
        document.getElementById('btn-prev').disabled = false;
    } else {
        saveConfig();
    }
}

function prevStep() {
    if (currentStep > 1) {
        document.getElementById(`step${currentStep}`).classList.remove('active');
        document.getElementById(`step${currentStep}-indicator`).classList.remove('active');
        currentStep--;
        document.getElementById(`step${currentStep}`).classList.add('active');
        document.getElementById(`step${currentStep}-indicator`).classList.remove('completed');
        document.getElementById(`step${currentStep}-indicator`).classList.add('active');
        document.getElementById('btn-prev').disabled = currentStep === 1;
        const nextText = strings.wizard_next || 'Next';
        document.getElementById('btn-next').textContent = nextText;
    }
}

function updateSummary() {
    const notSetText = strings.wizard_notSet || 'Not set';
    document.getElementById('summary-firmwarePath').textContent = 
        document.getElementById('firmwarePath').value || notSetText;
    
    const commands = [];
    document.querySelectorAll('.command-item').forEach(item => {
        const name = item.querySelector('.cmd-name').value;
        const value = item.querySelector('.cmd-value').value;
        if (name && value) {
            commands.push(`${name}: ${value}`);
        }
    });
    document.getElementById('summary-buildCommands').textContent = 
        commands.length > 0 ? commands.join(', ') : notSetText;
    
    document.getElementById('summary-gitBashPath').textContent = 
        document.getElementById('gitBashPath').value || notSetText;
}

function saveConfig() {
    const firmwarePathValue = document.getElementById('firmwarePath').value;
    
    // If firmwarePath is auto-detected display text (starts with "auto:"), save empty string
    const actualFirmwarePath = firmwarePathValue.startsWith('auto:') ? '' : firmwarePathValue;
    
    const config = {
        firmwarePath: actualFirmwarePath,
        buildCommands: [],
        gitBashPath: document.getElementById('gitBashPath').value
    };

    document.querySelectorAll('.command-item').forEach(item => {
        const name = item.querySelector('.cmd-name').value;
        const value = item.querySelector('.cmd-value').value;
        if (name && value) {
            config.buildCommands.push({ name, command: value });
        }
    });

    vscode.postMessage({ command: 'saveConfig', config });
}

function closeWizard() {
    vscode.postMessage({ command: 'close' });
}
