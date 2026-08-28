/**
 * Hermes Remote - path matching and reference formatting helpers.
 * Ported from claude-vscode-context-plus (hermes-remote) matching.ts.
 */
'use strict';

const VERSION_PATTERN = /^\d+\.\d+\.\d+$/;

/** Normalize any path separators to POSIX `/` so remote paths compare correctly. */
function toPosixPath(p) {
  return p.replace(/\\/g, '/');
}

/** Normalize any path separators to Windows `\`. */
function toWindowsPath(p) {
  return p.replace(/\//g, '\\');
}

/** Path style for references sent to Hermes. */
const PATH_STYLES = ['windows', 'posix'];

/** Normalize a path to the requested style. */
function toPathStyle(p, style) {
  return style === 'windows' ? toWindowsPath(p) : toPosixPath(p);
}

/**
 * Prepend a host prefix to a reference path (e.g. `win@:` so Hermes can
 * reach files on a Windows PC). Avoids double-prefixing.
 */
function applyReferencePrefix(pathStr, prefix) {
  if (!prefix) return pathStr;
  return pathStr.startsWith(prefix) ? pathStr : prefix + pathStr;
}

/**
 * If `fileFsPath` lives under one of the `mappings`, return the equivalent
 * remote path (POSIX separators). Returns `undefined` when no mapping matches.
 * Path matching is case-insensitive so a mapping like `f:\proj` matches an
 * actual `F:\proj` path on Windows.
 */
function mapToRemotePath(fileFsPath, mappings) {
  const filePosix = toPosixPath(fileFsPath);
  const filePosixLower = filePosix.toLowerCase();
  for (const m of mappings) {
    const local = toPosixPath(m.local).replace(/\/+$/, '');
    const localLower = local.toLowerCase();
    if (filePosixLower === localLower) {
      return toPosixPath(m.remote).replace(/\/+$/, '');
    }
    if (filePosixLower.startsWith(localLower + '/')) {
      // Preserve the original (un-lowercased) suffix so the returned remote
      // path keeps the user's casing for the file portion.
      return (
        toPosixPath(m.remote).replace(/\/+$/, '') +
        filePosix.slice(local.length)
      );
    }
  }
  return undefined;
}

function matchesHermesTerminalName(name, customPatterns = []) {
  // Match "hermes" or "ssh" terminal names (case-insensitive). SSH terminals
  // are common targets for remote Hermes, so treat them as send targets too.
  const lower = name.toLowerCase();
  if (lower.includes('hermes')) return true;
  if (lower.includes('ssh')) return true;
  if (VERSION_PATTERN.test(name)) return true;

  for (const pattern of customPatterns) {
    try {
      if (new RegExp(pattern, 'i').test(name)) return true;
    } catch {
      // Invalid regex — skip
    }
  }

  return false;
}

// Matches a `hermes` command being launched at a shell prompt. The echoed
// input typically looks like "\r\nhermes -p <user>\r\n" or
// "user@host:~$ hermes". Only matches when `hermes` is the command word
// (start of line, or preceded by a shell prompt symbol $/#/>).
const HERMES_COMMAND_PATTERN = /(^|[\r\n])(?:[^\r\n]*?[$#>]\s*)?hermes(?=[\s\r\n]|$)/;

/**
 * Returns true when terminal output shows a `hermes` command being launched,
 * e.g. "hermes", "hermes -p <user>" or "user@host:~$ hermes".
 */
function isHermesCommandEcho(data) {
  return HERMES_COMMAND_PATTERN.test(data);
}

/**
 * Returns true when the terminal content shows the Hermes TUI interface,
 * identified by its title bar (e.g. "╭─ ⚕ Hermes ─"). Unlike the command
 * echo, the UI stays on screen, so this is reliable even after the launch
 * command has scrolled away (especially with alternate-screen TUIs).
 */
function isHermesUiContent(data) {
  if (/⚕\s*hermes/i.test(data)) return true;
  if (/[╭╮╰╯─│].*hermes/i.test(data)) return true;
  return false;
}

function formatLineRef(filePath, startLine, endLine) {
  if (startLine === endLine) {
    return `@${filePath}:${startLine}`;
  }
  return `@${filePath}:${startLine}-${endLine}`;
}

module.exports = {
  PATH_STYLES,
  toPosixPath,
  toWindowsPath,
  toPathStyle,
  applyReferencePrefix,
  mapToRemotePath,
  matchesHermesTerminalName,
  isHermesCommandEcho,
  isHermesUiContent,
  formatLineRef,
};
