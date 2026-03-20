# Welcome Webview Module

This module provides the welcome page and setup wizard functionality for Quick Firmware + extension.

## Features

### Welcome Page
- Displayed on first install of the extension
- Shows key features and keyboard shortcuts
- Provides quick access to setup wizard and settings
- "Don't show again" option to disable

### Setup Wizard
- 4-step configuration wizard for new workspaces
- Guides users through:
  1. Firmware path selection
  2. Build command configuration
  3. Git Bash path (optional, for .sh scripts on Windows)
  4. Configuration summary

### Auto-detection
- Automatically detects firmware projects when opening new workspaces
- Checks for:
  - `quectel_build/release` directory structure
  - Build scripts (build.bat, build.sh, etc.)
- Prompts user to run setup wizard if project structure detected

## Usage

### Manual Commands
- `Quick Firmware +: Show Welcome Page` - Display welcome page
- `Quick Firmware +: Run Setup Wizard` - Run configuration wizard

### Automatic
- Welcome page shows on first install
- Setup wizard prompt shows when opening firmware project workspaces

## Files

- `welcomeWebview.js` - Main module containing:
  - `WelcomeWebviewManager` class
  - Welcome page HTML generation
  - Wizard HTML generation
  - Configuration persistence

## State Management

Uses VS Code globalState for:
- `quickFirmwarePlus.welcomeShown` - Track if welcome has been shown
- `quickFirmwarePlus.dontShowWelcome` - User preference to hide welcome

Uses VS Code workspace configuration for:
- `quickFirmwarePlus.firmwarePath`
- `quickFirmwarePlus.buildCommands`
- `quickFirmwarePlus.buildGitBashPath`
