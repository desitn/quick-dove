/**
 * Hermes Remote - terminal detection.
 * Ported from claude-vscode-context-plus (hermes-remote) terminalDetector.ts.
 */
'use strict';

const vscode = require('vscode');
const {
  matchesHermesTerminalName,
  isHermesCommandEcho,
  isHermesUiContent,
} = require('./matching');

const POLL_INTERVAL_MS = 2000;
const POLL_DURATION_MS = 30000;
const SCAN_INTERVAL_MS = 2000;
const BUFFER_SCAN_LINES = 500;

class TerminalDetector {
  constructor() {
    this._onDidChange = new vscode.EventEmitter();
    this.onDidChange = this._onDidChange.event;

    this.disposables = [];
    this.designatedTerminal = undefined;
    this.activeHermesTerminal = undefined;
    this.pollTimer = undefined;
    this.scanTimer = undefined;
    /** Terminals detected via buffer content (no name match, e.g. local `hermes` run). */
    this.bufferMatchedTerminals = new Set();

    this.disposables.push(
      vscode.window.onDidOpenTerminal(() => this.onTerminalOpened()),
      vscode.window.onDidCloseTerminal((t) => this.onTerminalClosed(t)),
      vscode.window.onDidChangeActiveTerminal(() => this.refresh()),
      // Note: `onDidWriteTerminalData` is a proposed API and cannot be used by
      // released extensions (it fails activation). We rely on the stable
      // `terminal.buffer` polling API below instead.
      this._onDidChange,
    );
    this.refresh();
    this.startScanning();
  }

  get target() {
    // Always re-scan fresh so we pick up name changes
    this.scanForTarget();
    if (this.designatedTerminal) {
      return this.designatedTerminal;
    }
    return this.activeHermesTerminal;
  }

  get hasTarget() {
    return this.target !== undefined;
  }

  designate(terminal) {
    this.designatedTerminal = terminal;
    this._onDidChange.fire();
  }

  clearDesignation() {
    this.designatedTerminal = undefined;
    this.refresh();
  }

  getHermesTerminals() {
    return vscode.window.terminals.filter(
      (t) =>
        t === this.designatedTerminal ||
        this.isHermesTerminal(t) ||
        this.bufferMatchedTerminals.has(t),
    );
  }

  isHermesTerminal(terminal) {
    const config = vscode.workspace.getConfiguration('hermesRemote');
    const customPatterns = config.get('terminalNamePatterns', []);
    return matchesHermesTerminalName(terminal.name, customPatterns);
  }

  scanForTarget() {
    const active = vscode.window.activeTerminal;
    if (
      active &&
      (active === this.designatedTerminal ||
        this.isHermesTerminal(active) ||
        this.bufferMatchedTerminals.has(active))
    ) {
      this.activeHermesTerminal = active;
    }

    const terminals = vscode.window.terminals;
    if (this.activeHermesTerminal && !terminals.includes(this.activeHermesTerminal)) {
      this.activeHermesTerminal = terminals.find(
        (t) =>
          this.isHermesTerminal(t) || this.bufferMatchedTerminals.has(t),
      );
    }

    if (!this.activeHermesTerminal) {
      this.activeHermesTerminal = terminals.find(
        (t) =>
          this.isHermesTerminal(t) || this.bufferMatchedTerminals.has(t),
      );
    }
  }

  refresh() {
    this.scanForTarget();
    this._onDidChange.fire();
  }

  onTerminalOpened() {
    this.refresh();
    // Terminal name may be empty at open time (Hermes sets its title
    // asynchronously). Poll for a while to catch the name change.
    this.startPolling();
  }

  startPolling() {
    if (this.pollTimer) return;
    let elapsed = 0;
    this.pollTimer = setInterval(() => {
      elapsed += POLL_INTERVAL_MS;
      this.refresh();
      if (this.activeHermesTerminal || elapsed >= POLL_DURATION_MS) {
        this.stopPolling();
      }
    }, POLL_INTERVAL_MS);
  }

  stopPolling() {
    if (this.pollTimer) {
      clearInterval(this.pollTimer);
      this.pollTimer = undefined;
    }
  }

  onTerminalClosed(terminal) {
    this.bufferMatchedTerminals.delete(terminal);
    if (terminal === this.designatedTerminal) {
      this.designatedTerminal = undefined;
      // The target is gone; resume scanning for a new hermes terminal.
      this.startScanning();
    }
    if (terminal === this.activeHermesTerminal) {
      this.activeHermesTerminal = undefined;
    }
    this.refresh();
  }

  /**
   * Continuously scan terminal buffers for a `hermes` command echo or the
   * Hermes TUI title. Relies only on the stable `terminal.buffer` API, so it
   * works for local terminals and SSH sessions alike.
   */
  startScanning() {
    if (this.scanTimer) return;
    this.scanTimer = setInterval(() => this.scanTerminalBuffers(), SCAN_INTERVAL_MS);
  }

  stopScanning() {
    if (this.scanTimer) {
      clearInterval(this.scanTimer);
      this.scanTimer = undefined;
    }
  }

  scanTerminalBuffers() {
    // A manually designated terminal locks the target; stop auto-scanning.
    if (this.designatedTerminal) {
      this.stopScanning();
      return;
    }

    for (const terminal of vscode.window.terminals) {
      // Name match works in every scenario (including SSH). It does not lock
      // the target — switching focus to another hermes terminal follows.
      if (this.isHermesTerminal(terminal)) {
        continue; // handled by scanForTarget via name
      }

      const lines = this.getRecentBufferLines(terminal, BUFFER_SCAN_LINES);
      if (lines.length === 0) continue;
      const content = lines.join('\n');
      // Buffer check catches local terminals (shell integration present):
      // the launch command echo (`hermes ...`) or the Hermes TUI title bar
      // (⚕ Hermes). Mark it so it participates in target resolution.
      if (isHermesCommandEcho(content) || isHermesUiContent(content)) {
        this.bufferMatchedTerminals.add(terminal);
      }
    }

    this.scanForTarget();
  }

  getRecentBufferLines(terminal, count) {
    const buffer = terminal.buffer;
    if (!buffer || buffer.size === 0) return [];
    const start = Math.max(0, buffer.size - count);
    const lines = [];
    for (let i = start; i < buffer.size; i++) {
      const line = buffer.getLine(i);
      if (line) lines.push(line.text);
    }
    return lines;
  }

  dispose() {
    this.stopPolling();
    this.stopScanning();
    for (const d of this.disposables) {
      d.dispose();
    }
  }
}

module.exports = { TerminalDetector };
