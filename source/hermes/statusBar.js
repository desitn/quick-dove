/**
 * Hermes Remote - status bar indicator.
 * Ported from claude-vscode-context-plus (hermes-remote) statusBar.ts.
 */
'use strict';

const vscode = require('vscode');
const { localize } = require('../localization');

class StatusBar {
  constructor(detector) {
    this.detector = detector;

    this.item = vscode.window.createStatusBarItem(
      vscode.StatusBarAlignment.Right,
      50,
    );
    this.item.command = 'hermesRemote.sendSelectionToContext';

    this.disposables = [
      this.item,
      detector.onDidChange(() => this.update()),
      vscode.window.onDidChangeTextEditorSelection(() => this.update()),
      vscode.window.onDidChangeActiveTextEditor(() => this.update()),
    ];

    this.update();
  }

  update() {
    if (!this.detector.hasTarget) {
      this.item.hide();
      return;
    }

    const hasSelection =
      vscode.window.activeTextEditor !== undefined &&
      !vscode.window.activeTextEditor.selection.isEmpty;

    if (hasSelection) {
      this.item.text = '$(terminal) Hermes $(selection)';
      this.item.tooltip = localize('hermes.selectionVisible');
    } else {
      this.item.text = '$(terminal) Hermes';
      this.item.tooltip = localize('hermes.terminalActive');
    }

    this.item.show();
  }

  dispose() {
    for (const d of this.disposables) {
      d.dispose();
    }
  }
}

module.exports = { StatusBar };
