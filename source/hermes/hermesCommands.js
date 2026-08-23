/**
 * Hermes Remote - command registration.
 * Ported from claude-vscode-context-plus (hermes-remote) extension.ts and
 * wired into Quick Dove's activate() via activateHermesRemote(context).
 */
'use strict';

const vscode = require('vscode');
const { localize } = require('../localization');
const { TerminalDetector } = require('./terminalDetector');
const { ContextSender } = require('./contextSender');
const { StatusBar } = require('./statusBar');

/**
 * Activate the Hermes Remote feature. Registers all hermesRemote.* commands,
 * the terminal detector and the status bar indicator.
 */
function activateHermesRemote(context) {
  const detector = new TerminalDetector();
  const sender = new ContextSender(detector);
  const statusBar = new StatusBar(detector);

  context.subscriptions.push(detector, statusBar);

  context.subscriptions.push(
    vscode.commands.registerCommand(
      'hermesRemote.addFileToContext',
      (uri, uris) => {
        // When invoked from explorer context menu, `uri` is the right-clicked
        // item and `uris` is all selected items (if multi-select).
        // When invoked from editor title context or keybinding, fall back to active editor.
        const targets =
          uris && uris.length > 0
            ? uris
            : uri
              ? [uri]
              : vscode.window.activeTextEditor
                ? [vscode.window.activeTextEditor.document.uri]
                : [];

        if (targets.length === 0) {
          vscode.window.showWarningMessage(localize('hermes.noFilesToAdd'));
          return;
        }
        sender.addFiles(targets);
      },
    ),
  );

  context.subscriptions.push(
    vscode.commands.registerCommand(
      'hermesRemote.sendSelectionToContext',
      () => {
        sender.sendSelection();
      },
    ),
  );

  context.subscriptions.push(
    vscode.commands.registerCommand(
      'hermesRemote.setAsHermesTerminal',
      async () => {
        const active = vscode.window.activeTerminal;
        const terminals = vscode.window.terminals;

        if (terminals.length === 0) {
          vscode.window.showWarningMessage(localize('hermes.noTerminal'));
          return;
        }

        // If there's a focused terminal, offer to designate it directly
        if (terminals.length === 1 && active) {
          detector.designate(active);
          vscode.window.showInformationMessage(
            localize('hermes.setAsHermes', active.name),
          );
          return;
        }

        const items = terminals.map((t) => ({
          label: t.name,
          terminal: t,
          description: t === active ? localize('hermes.current') : undefined,
        }));

        const picked = await vscode.window.showQuickPick(items, {
          placeHolder: localize('hermes.selectTerminalToSet'),
        });

        if (picked) {
          detector.designate(picked.terminal);
          vscode.window.showInformationMessage(
            localize('hermes.setAsHermes', picked.terminal.name),
          );
        }
      },
    ),
  );

  context.subscriptions.push(
    vscode.commands.registerCommand(
      'hermesRemote.selectTerminal',
      async () => {
        const hermesTerminals = detector.getHermesTerminals();

        if (hermesTerminals.length === 0) {
          vscode.window.showWarningMessage(localize('hermes.noHermesTerminalFound'));
          return;
        }

        if (hermesTerminals.length === 1) {
          vscode.window.showInformationMessage(
            localize('hermes.onlyOneHermesTerminal', hermesTerminals[0].name),
          );
          return;
        }

        const items = hermesTerminals.map((t) => ({
          label: t.name,
          terminal: t,
          description: t === detector.target ? localize('hermes.currentTarget') : undefined,
        }));

        const picked = await vscode.window.showQuickPick(items, {
          placeHolder: localize('hermes.selectTargetTerminal'),
        });

        if (picked) {
          detector.designate(picked.terminal);
        }
      },
    ),
  );

  context.subscriptions.push(
    vscode.commands.registerCommand(
      'hermesRemote.addWorkspaceToContext',
      () => {
        sender.addWorkspace();
      },
    ),
  );
}

module.exports = { activateHermesRemote };
