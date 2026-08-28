/**
 * Hermes Remote - context sender.
 * Ported from claude-vscode-context-plus (hermes-remote) contextSender.ts.
 */
'use strict';

const vscode = require('vscode');
const { localize } = require('../localization');
const {
  formatLineRef,
  mapToRemotePath,
  toPosixPath,
  toPathStyle,
} = require('./matching');

class ContextSender {
  constructor(detector) {
    this.detector = detector;
  }

  addFiles(uris) {
    const terminal = this.requireTerminal();
    if (!terminal) return;

    const refs = uris.map((uri) => this.buildReference(uri.fsPath)).join(' ');
    terminal.sendText(' ' + refs + ' ', false);
    terminal.show(false);
  }

  addWorkspace() {
    const terminal = this.requireTerminal();
    if (!terminal) return;

    const folders = vscode.workspace.workspaceFolders;
    if (!folders || folders.length === 0) {
      vscode.window.showWarningMessage(localize('hermes.noWorkspace'));
      return;
    }

    const refs = folders
      .map((f) => this.buildScope(f.uri.fsPath))
      .join(' ');
    terminal.sendText(' ' + refs + ' ', false);
    terminal.show(false);
  }

  sendSelection() {
    const terminal = this.requireTerminal();
    if (!terminal) return;

    const editor = vscode.window.activeTextEditor;
    if (!editor || editor.selection.isEmpty) {
      vscode.window.showWarningMessage(localize('hermes.noSelection'));
      return;
    }

    const sel = editor.selection;
    const startLine = sel.start.line + 1;
    const endLine = sel.end.line + 1;
    const ref = this.buildReference(editor.document.uri.fsPath, {
      start: startLine,
      end: endLine,
    });

    terminal.sendText(' ' + ref + ' ', false);
    terminal.show(false);
  }

  /**
   * Build a reference in the form:
   *   `@windows F:\proj\src\main.py`          (file)
   *   `@windows F:\proj\src\main.py:10-20`    (selection)
   *
   * The complete absolute path is sent in one piece — host prefix included —
   * so Hermes receives the full location without scope concatenation.
   */
  buildReference(fileFsPath, lineInfo) {
    const style = this.getPathStyle();
    const remote = mapToRemotePath(fileFsPath, this.getRemoteMappings());
    const full = remote ?? fileFsPath;
    const fullNorm = toPathStyle(full, style);
    const base = this.withPrefix(fullNorm);
    return lineInfo
      ? formatLineRef(base, lineInfo.start, lineInfo.end)
      : `@${base}`;
  }

  /** Build the workspace reference, e.g. `@windows F:\proj`. */
  buildScope(rootFsPath) {
    const style = this.getPathStyle();
    const root = rootFsPath ?? this.getWorkspaceRoot();
    if (!root) return '';
    const rootNorm = toPathStyle(root, style).replace(/[\\/]+$/, '');
    return `@${this.withPrefix(rootNorm)}`;
  }

  /** Prepend the host prefix (e.g. `windows`) to a path string. */
  withPrefix(pathStr) {
    const prefix = this.getPathPrefix();
    return prefix ? `${prefix} ${pathStr}` : pathStr;
  }

  getPathStyle() {
    const config = vscode.workspace.getConfiguration('hermesRemote');
    const style = config.get('pathStyle', 'windows');
    return style === 'posix' ? 'posix' : 'windows';
  }

  getPathPrefix() {
    const config = vscode.workspace.getConfiguration('hermesRemote');
    return config.get('pathPrefix', 'windows');
  }

  getWorkspaceRoot() {
    // Explicitly configured root wins; otherwise default to the first
    // workspace folder so adding the workspace sends `@windows F:\proj` out
    // of the box.
    const config = vscode.workspace.getConfiguration('hermesRemote');
    const root = config.get('workspaceRoot', '');
    if (root) return root;
    const folder = vscode.workspace.workspaceFolders?.[0];
    return folder ? folder.uri.fsPath : undefined;
  }

  getRemoteMappings() {
    const config = vscode.workspace.getConfiguration('hermesRemote');
    return config.get('remoteMappings', []);
  }

  getTerminalCwd(terminal) {
    // Shell integration (VS Code 1.93+) — most accurate, tracks cd
    const si = terminal.shellIntegration;
    if (si && si.cwd) {
      return si.cwd.fsPath ?? String(si.cwd);
    }
    // Creation options — initial CWD set when terminal was opened
    const opts = terminal.creationOptions;
    if (opts && 'cwd' in opts && opts.cwd) {
      return typeof opts.cwd === 'string'
        ? opts.cwd
        : opts.cwd.fsPath;
    }
    return undefined;
  }

  getTerminalWorkspacePaths(terminal) {
    const cwd = this.getTerminalCwd(terminal);
    if (cwd) return [cwd];
    // Fallback: mapped remote roots first (SSH terminal without shell
    // integration), then the first workspace folder.
    const remotes = this.getRemoteMappings().map((m) => toPosixPath(m.remote));
    const first = vscode.workspace.workspaceFolders?.[0];
    return remotes.length > 0
      ? remotes
      : first
        ? [first.uri.fsPath]
        : [];
  }

  requireTerminal() {
    const terminal = this.detector.target;
    if (!terminal) {
      vscode.window.showWarningMessage(localize('hermes.noHermesTerminal'));
    }
    return terminal;
  }
}

module.exports = { ContextSender };
