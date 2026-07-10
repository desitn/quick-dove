/**
* @description: Quick Dove 
*  A tool for building and syncing firmware in a developer-friendly way.
*  Entry point - registers all commands and wires modules together.
* @author: destin.zhang@quectel.com
*/

const vscode = require('vscode');
const path = require('path');
const fs = require('fs');
const iconv = require('iconv-lite');
const { spawn } = require('child_process');

const { localize } = require('./source/localization');
const { configManager } = require('./source/config/configManager');
const { WebviewManager } = require('./source/webview/webviewManager');
const { LogViewerManager } = require('./source/webview/logViewer/logViewerManager');

const {
    writeFirmwareCliConfig,
    is_windows,
    setupTerminalEnvironment,
    getFirmwareCliPath,
    kill_process_tree,
    output_chan
} = require('./source/utils');

const {
    FirmwareTreeDataProvider,
    DeviceTreeDataProvider,
    SettingsTreeDataProvider,
    PortableToolsTreeDataProvider
} = require('./source/providers/treeProviders');

const ProgressTracker = require('./source/providers/progressTracker');
const { registerOpenSerialCommand } = require('./source/commands/serialCommands');
const {
    isValidCppDefineName,
    getCppDefines,
    saveCppDefines,
    toggleCppDefine
} = require('./source/commands/cppDefine');

function activate(context) {
    setupTerminalEnvironment(context);

    configManager.initialize(context);
    configManager.onDidChangeConfig(() => {
        writeFirmwareCliConfig(configManager.getConfig());
    });
    writeFirmwareCliConfig(configManager.getConfig());

    let last_dl_info = {
        dlPromise: null, filePath: '', fileName: '', toolType: '',
        dlState: 'stop', dlChild: null, terminal: null
    };

    const status_bar_build = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Right, 99);
    status_bar_build.text = "$(coffee)";
    status_bar_build.tooltip = localize('command.build');
    status_bar_build.command = "firmwareDownloader.build";
    status_bar_build.show();

    const status_bar_dl = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Right, 98);
    status_bar_dl.text = "$(arrow-circle-down)";
    status_bar_dl.tooltip = localize('command.download');
    status_bar_dl.command = "firmwareDownloader.download";
    status_bar_dl.show();

    const workspace_folders = vscode.workspace.workspaceFolders;

    // Tree Data Providers
    const firmwareTreeDataProvider = new FirmwareTreeDataProvider(context);
    vscode.window.registerTreeDataProvider('firmware-explorer', firmwareTreeDataProvider);

    const settingsTreeDataProvider = new SettingsTreeDataProvider();
    vscode.window.registerTreeDataProvider('firmware-settings', settingsTreeDataProvider);

    const deviceTreeDataProvider = new DeviceTreeDataProvider(context);
    vscode.window.registerTreeDataProvider('firmware-devices', deviceTreeDataProvider);
    deviceTreeDataProvider.startAutoRefresh();

    const portableToolsTreeDataProvider = new PortableToolsTreeDataProvider();
    vscode.window.registerTreeDataProvider('firmware-tools', portableToolsTreeDataProvider);

    const webviewManager = new WebviewManager(context);
    const logViewerManager = new LogViewerManager(context);

    if (webviewManager.shouldShowWelcome()) {
        webviewManager.showWelcome();
    }

    // Commands
    const showWelcomeCommand = vscode.commands.registerCommand('firmwareDownloader.showWelcome', () => {
        webviewManager.showWelcome();
    });

    const refreshFirmwareListCommand = vscode.commands.registerCommand('firmwareDownloader.refresh', () => {
        firmwareTreeDataProvider.refresh();
        settingsTreeDataProvider.refresh();
    });

    const refreshDevicesCommand = vscode.commands.registerCommand('firmwareDownloader.devices_refresh', () => {
        deviceTreeDataProvider.refresh();
    });

    const selectFirmwareDirCommand = vscode.commands.registerCommand('firmwareDownloader.find', async () => {
        const options = {
            canSelectFiles: false, canSelectFolders: true, canSelectMany: false,
            openLabel: localize('selectFirmwareDir'),
            defaultUri: workspace_folders ? vscode.Uri.file(workspace_folders[0].uri.fsPath) : undefined
        };
        const result = await vscode.window.showOpenDialog(options);
        if (result && result.length > 0) {
            configManager.setFirmwarePath(result[0].fsPath);
            writeFirmwareCliConfig(configManager.getConfig());
            vscode.commands.executeCommand('firmwareDownloader.refresh');
        }
    });

    const clearFirmwareDirCommand = vscode.commands.registerCommand('firmwareDownloader.clear', async () => {
        configManager.setFirmwarePath('');
        writeFirmwareCliConfig(configManager.getConfig());
        vscode.commands.executeCommand('firmwareDownloader.refresh');
    });

    const addBuildCommand = vscode.commands.registerCommand('firmwareDownloader.addBuildCommand', async () => {
        const name = await vscode.window.showInputBox({
            prompt: localize('enterCommandName'), placeHolder: 'e.g., Release Build',
            validateInput: (v) => {
                if (!v || !v.trim()) return localize('commandNameEmpty');
                if (configManager.getBuildCommands().some(c => c.name === v.trim())) return localize('commandNameExists');
                return null;
            }
        });
        if (!name) return;
        const desc = await vscode.window.showInputBox({ prompt: localize('enterCommandDesc'), placeHolder: 'e.g., Build for production' });
        const cmd = await vscode.window.showInputBox({
            prompt: localize('enterBuildCommand'), placeHolder: localize('enterBuildCommandPlaceholder'),
            validateInput: (v) => (!v || !v.trim()) ? localize('commandEmpty') : null
        });
        if (!cmd) return;
        configManager.addBuildCommand(name.trim(), cmd.trim(), (desc || '').trim());
        writeFirmwareCliConfig(configManager.getConfig());
        vscode.commands.executeCommand('firmwareDownloader.refresh');
        vscode.window.showInformationMessage(localize('commandAdded', name));
    });

    const selectBuildCommand = vscode.commands.registerCommand('firmwareDownloader.selectBuildCommand', async (cmdData) => {
        if (!cmdData) return;
        configManager.setActiveBuildCommand(cmdData.name);
        writeFirmwareCliConfig(configManager.getConfig());
        vscode.commands.executeCommand('firmwareDownloader.refresh');
        vscode.window.showInformationMessage(localize('selectActiveCommand', cmdData.name));
    });

    const configBuildCommand = vscode.commands.registerCommand('firmwareDownloader.configBuildCommand', async () => {
        const bcmds = configManager.getBuildCommands();
        let items = bcmds.map(c => ({
            label: c.isActive ? `$(check) ${c.name}` : c.name,
            description: c.description ? `${c.description} - ${c.command}` : c.command, command: c
        }));
        items.push({ label: '$(file-code) ' + localize('addScriptFromFile'), description: localize('selectScriptFile'), command: '-selectScript' });
        items.push({ label: '$(add) ' + localize('addNewCommand'), description: localize('configureNewCommand'), command: '-addNewCommand' });
        const sel = await vscode.window.showQuickPick(items, { placeHolder: localize('selectCommandToSwitch'), ignoreFocusOut: true });
        if (!sel) return;
        if (sel.command === '-addNewCommand') { vscode.commands.executeCommand('firmwareDownloader.addBuildCommand'); return; }
        if (sel.command === '-selectScript') {
            const r = await vscode.window.showOpenDialog({
                canSelectFiles: true, canSelectFolders: false, canSelectMany: false,
                openLabel: localize('selectScriptFile'),
                defaultUri: workspace_folders ? vscode.Uri.file(workspace_folders[0].uri.fsPath) : undefined,
                filters: { Scripts: ['bat','sh','py','cmd','ps1'], All: ['*'] }
            });
            if (r && r[0]) {
                const p = r[0].fsPath, sn = path.basename(p, path.extname(p)), sc = path.basename(p);
                let fn = sn, c = 1;
                while (configManager.getBuildCommands().some(x => x.name === fn)) fn = sn + '_' + c++;
                configManager.addBuildCommand(fn, sc, '');
                writeFirmwareCliConfig(configManager.getConfig());
                vscode.commands.executeCommand('firmwareDownloader.refresh');
                vscode.window.showInformationMessage(localize('scriptFileAdded', fn));
                vscode.commands.executeCommand('firmwareDownloader.build');
            }
            return;
        }
        configManager.setActiveBuildCommand(sel.command.name);
        writeFirmwareCliConfig(configManager.getConfig());
        vscode.commands.executeCommand('firmwareDownloader.refresh');
        vscode.commands.executeCommand('firmwareDownloader.build');
    });

    const copyPathCommand = vscode.commands.registerCommand('firmwareDownloader.copyPath', async (uri) => {
        if (uri && uri.fsPath) {
            try { await vscode.env.clipboard.writeText(uri.fsPath); }
            catch (e) { vscode.window.showErrorMessage(localize('copyPathFailed', e.message)); }
        }
    });

    const openSettingsCommand = vscode.commands.registerCommand('firmwareDownloader.settings', () => webviewManager.showSettings());
    const showSearchCommand = vscode.commands.registerCommand('firmwareDownloader.showSearch', () => webviewManager.showSearch());
    const searchWithEverythingCommand = vscode.commands.registerCommand('firmwareDownloader.searchWithEverything', async () => {
        const ae = vscode.window.activeTextEditor;
        if (!ae) { vscode.window.showErrorMessage('No active editor'); return; }
        const t = ae.document.getText(ae.selection);
        if (!t) { vscode.window.showErrorMessage('Please select text'); return; }
        await webviewManager.searchWithText(t.trim());
        vscode.window.showInformationMessage('Searching: "' + t.trim() + '"');
    });
    const openLogViewerCommand = vscode.commands.registerCommand('firmwareDownloader.openLogViewer', async (uri) => {
        try { uri && uri.fsPath ? await logViewerManager.openLogFile(uri.fsPath) : await logViewerManager.showEmptyPanel(); }
        catch (e) { vscode.window.showErrorMessage('Failed to open log: ' + e.message); }
    });

    // C/C++ Define
    const toggleCppDefineCommand = vscode.commands.registerCommand('firmwareDownloader.toggleCppDefine', async () => {
        const e = vscode.window.activeTextEditor;
        if (!e) { vscode.window.showErrorMessage(localize('cppDefineNoSelection')); return; }
        const t = e.document.getText(e.selection);
        if (!t || !isValidCppDefineName(t)) { vscode.window.showErrorMessage(localize('cppDefineInvalid')); return; }
        try {
            const a = toggleCppDefine(t);
            vscode.window.showInformationMessage(a ? localize('cppDefineAdded', t) : localize('cppDefineRemoved', t));
        } catch (err) { vscode.window.showErrorMessage('Error: ' + err.message); }
    });
    const openCppDefineSettingsCommand = vscode.commands.registerCommand('firmwareDownloader.openCppDefineSettings', () => webviewManager.showSettings('cppdefine'));

    // Serial
    const openSerialCommand = registerOpenSerialCommand(context);

    // Build
    let build_disposable = vscode.commands.registerCommand('firmwareDownloader.build', async function () {
        const bcmds = configManager.getBuildCommands();
        let items = bcmds.map((c, i) => ({
            label: (i + 1) + '. ' + c.name, description: c.description || c.command,
            detail: c.isActive ? '✓ active' : '', command: c, index: i
        }));
        items.push({ label: '$(add) Add build command', description: 'Configure new build script', command: '-addCommand', index: -1 });
        const sel = await vscode.window.showQuickPick(items, {
            placeHolder: bcmds.length > 0 ? 'Select (1-' + bcmds.length + ')' : 'Add build command',
            ignoreFocusOut: true
        });
        if (!sel) return;
        if (sel.command === '-addCommand') { vscode.commands.executeCommand('firmwareDownloader.addBuildCommand'); return; }
        const sc = sel.command;
        if (!sc.isActive) {
            configManager.setActiveBuildCommand(sc.name);
            writeFirmwareCliConfig(configManager.getConfig());
            vscode.commands.executeCommand('firmwareDownloader.refresh');
        }
        const cli = getFirmwareCliPath(context);
        if (!cli) { vscode.window.showErrorMessage(localize('toolNotFound', 'dove.exe')); return; }
        const td = {
            type: 'shell', label: 'Build: ' + sc.name, command: cli,
            args: ['build', '-n', sc.name], options: { cwd: '${workspaceFolder}' },
            presentation: { echo: true, reveal: 'always', focus: false, panel: 'shared', close: false }
        };
        try {
            if (last_dl_info.terminal) { last_dl_info.terminal.dispose(); last_dl_info.terminal = null; }
            const te = await vscode.tasks.executeTask(new vscode.Task(td, vscode.TaskScope.Workspace, td.label, 'dove-query',
                new vscode.ShellExecution(td.command, td.args, td.options)));
            await new Promise(r => { const d = vscode.tasks.onDidEndTask(e => { if (e.execution === te) { d.dispose(); r(); } }); });
            vscode.window.showInformationMessage(localize('buildComplete'));
            firmwareTreeDataProvider.refresh();
        } catch (err) { vscode.window.showErrorMessage(localize('buildFailed', err.message)); }
    });

    // Download
    let download_disposable = vscode.commands.registerCommand('firmwareDownloader.download', async function (uri) {
        if (last_dl_info.dlPromise) { output_chan.appendLine(localize('alreadyDownloading')); return; }
        last_dl_info.dlPromise = (async () => {
            try {
                let su = uri;
                if (!su) {
                    const cu = configManager.getFirmwarePath();
                    if (cu && fs.existsSync(cu)) su = vscode.Uri.file(cu);
                }
                if (!su && workspace_folders && workspace_folders[0]) {
                    const rp = path.join(workspace_folders[0].uri.fsPath, 'quectel_build', 'release');
                    if (fs.existsSync(rp)) {
                        const files = fs.readdirSync(rp);
                        if (files.length > 0) {
                            const sel = await vscode.window.showInformationMessage(
                                localize('confirmFirmwareDir', path.join(rp, files[0])), localize('yes'), localize('no'));
                            if (sel === localize('yes')) su = vscode.Uri.file(path.join(rp, files[0]));
                            else return;
                        }
                    }
                }
                if (!su) { vscode.window.showErrorMessage(localize('noFirmware')); return; }

                const fp = su.fsPath;
                const cli = getFirmwareCliPath(context);
                if (!cli) { vscode.window.showErrorMessage(localize('toolNotFound', 'dove.exe')); return; }

                status_bar_dl.text = '$(sync) ' + localize('waitingForDownload');
                if (last_dl_info.dlState !== 'stop' && last_dl_info.dlChild) {
                    output_chan.appendLine(localize('doLastDlProcessKill'));
                    kill_process_tree(last_dl_info.dlChild, 'SIGKILL')
                        .then(() => output_chan.appendLine(localize('previousProcessTerminateSuccess')))
                        .catch(e => output_chan.appendLine(localize('previousProcessTerminateFailed', e)));
                }
                last_dl_info.filePath = fp;
                last_dl_info.fileName = fp;
                last_dl_info.toolType = 'cli';
                last_dl_info.dlState = 'waiting';
                last_dl_info.dlChild = null;

                const env = { ...process.env };
                const cp = configManager.getConfigPath();
                if (cp) env.FIRMWARE_CLI_CONFIG = cp;

                const child = spawn(cli, ['flash', fp, '--progress', 'json'], { shell: true, env });
                const tracker = new ProgressTracker(status_bar_dl);
                tracker.reset();
                last_dl_info.dlState = 'running';
                last_dl_info.dlChild = child;

                let kt = null;
                const rkt = () => {
                    if (kt) clearTimeout(kt);
                    kt = setTimeout(() => {
                        output_chan.appendLine(localize('doChildDownloadProcessKill'));
                        kill_process_tree(child, 'SIGKILL')
                            .then(() => { output_chan.appendLine(localize('childProcessTerminateSuccess')); last_dl_info.dlState = 'stop'; last_dl_info.dlChild = null; })
                            .catch(e => { output_chan.appendLine(localize('childProcessTerminateFailed', e)); last_dl_info.dlState = 'stop'; last_dl_info.dlChild = null; });
                    }, 120000);
                };
                rkt();

                child.stdout.on('data', (d) => {
                    let o = process.platform === 'win32' ? iconv.decode(d, 'gbk') : d.toString('utf8');
                    output_chan.appendLine(o);
                    rkt();
                    try {
                        for (const l of o.split('\n')) {
                            if (l.trim().startsWith('{') && l.trim().endsWith('}')) {
                                const j = JSON.parse(l.trim());
                                if (j.progress !== undefined) tracker.update_progress(j.progress);
                            }
                        }
                    } catch (_) {}
                });
                child.stderr.on('data', (d) => {
                    let eo = process.platform === 'win32' ? iconv.decode(d, 'gbk') : d.toString('utf8');
                    output_chan.appendLine('stderr: ' + eo);
                    tracker.reset();
                    rkt();
                });

                await new Promise((resolve, reject) => {
                    child.on('close', (code) => {
                        if (code === 0) { vscode.window.showInformationMessage(localize('downloadComplete')); status_bar_dl.text = '$(check) ' + localize('downloadSuccess'); }
                        else { vscode.window.showErrorMessage(localize('downloadFailed', code)); status_bar_dl.text = '$(error) ' + localize('downloadFailed2'); }
                        setTimeout(() => { status_bar_dl.text = '$(arrow-circle-down)'; vscode.commands.executeCommand('firmwareDownloader.devices_refresh'); }, 5000);
                        if (kt) { clearTimeout(kt); kt = null; }
                        tracker.reset(); last_dl_info.dlState = 'stop'; last_dl_info.dlChild = null;
                        resolve();
                    });
                    child.on('error', (error) => {
                        vscode.window.showErrorMessage(localize('downloadStartFailed', error.message));
                        status_bar_dl.text = '$(error) ' + localize('startFailed');
                        last_dl_info.dlState = 'stop'; last_dl_info.dlChild = null;
                        if (kt) { clearTimeout(kt); kt = null; }
                        reject(error);
                    });
                });
            } catch (error) {
                vscode.window.showErrorMessage(localize('downloadError', error.message));
                status_bar_dl.text = '$(error) ' + localize('downloadException');
                last_dl_info.dlState = 'stop'; last_dl_info.dlChild = null;
            } finally { last_dl_info.dlPromise = null; }
        })();
    });

    // Subscriptions
    context.subscriptions.push(status_bar_dl, status_bar_build);
    context.subscriptions.push(firmwareTreeDataProvider, settingsTreeDataProvider);
    context.subscriptions.push(
        refreshFirmwareListCommand, selectFirmwareDirCommand, clearFirmwareDirCommand, refreshDevicesCommand,
        addBuildCommand, selectBuildCommand, configBuildCommand, copyPathCommand, openSettingsCommand,
        showSearchCommand, searchWithEverythingCommand, openLogViewerCommand,
        build_disposable, download_disposable,
        showWelcomeCommand, toggleCppDefineCommand, openCppDefineSettingsCommand,
        openSerialCommand
    );

    module.exports._helpers = { getCppDefines, saveCppDefines, toggleCppDefine, isValidCppDefineName };
}

function deactivate() { configManager.dispose(); }

module.exports = { activate, deactivate };