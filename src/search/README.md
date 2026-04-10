# File Search Feature

This module provides Everything-based file search functionality for Quick Dove extension.

## Overview

The search feature allows users to quickly find files on their computer using the Everything search engine, with results categorized by file type for easy navigation.

## Architecture

```
src/search/
├── everythingApi.js      # Everything HTTP API client
├── fileTypeClassifier.js # File type classification logic
├── searchManager.js      # Search management and coordination
└── README.md            # This file

src/webview/
├── searchPanel.html     # Search UI HTML
├── searchPanel.js       # Search UI JavaScript
└── assets/              # FontAwesome icons
```

## Features

1. **Real-time Search**: Type to search with debouncing (300ms)
2. **Categorized Results**: Results grouped by file type:
   - Folders
   - Archive Files (zip, rar, 7z, etc.)
   - PDF Documents
   - Office Documents (doc, docx, xls, xlsx)
   - Firmware Files (fbf, pac, bin)
   - Code Files (c, h, cpp, js, py, etc.)
   - Images (png, jpg, gif)
   - Videos (mp4, avi)
   - Audio (mp3, wav)
   - Text Files (txt, md)
   - Executables (exe, dll)
   - Other Files

3. **Search Scope**: Global (entire computer) or Workspace (current project)
4. **Quick Actions**: 
   - Open file
   - Reveal in Explorer
   - Copy path
   - Add to favorites (placeholder)
5. **Keyboard Shortcuts**: 
   - `Esc` to clear search
   - Select text in editor → Right click → "Search with Everything"

## Commands

- `firmwareDownloader.showSearch` - Show search panel
- `firmwareDownloader.searchWithEverything` - Search selected text

## Configuration

Search settings are stored in dove.json configuration file:
- `search.port`: Everything HTTP server port (default: 8080)
- `search.scope`: Search scope - "global" or "workspace" (default: "global")
- `search.maxResults`: Maximum number of results (default: 50)
- `search.favorites`: Array of favorite files/folders

Configuration can be changed via the search panel UI (left sidebar) or programmatically via ConfigManager methods:
- `configManager.getSearchPort()` / `configManager.setSearchPort(port)`
- `configManager.getSearchScope()` / `configManager.setSearchScope(scope)`
- `configManager.getSearchMaxResults()` / `configManager.setSearchMaxResults(maxResults)`
- `configManager.getSearchConfig()` / `configManager.setSearchConfig(config)`

## Requirements

- Everything search tool must be installed
- Everything HTTP server must be enabled (default port: 8080)

## Usage

1. Open search panel from welcome page or command palette
2. Type search keywords
3. Results appear categorized in real-time
4. Click category in left sidebar to filter
5. Click file to open
6. Right-click for context menu actions

## Integration

The search feature is integrated into the existing webview system:
- Uses the same webview infrastructure as settings/welcome pages
- Follows VS Code theme automatically
- Supports localization (English/Chinese)

## Notes

- Search requires Everything HTTP server to be running
- Large result sets are limited by maxResults setting
- File icons use FontAwesome for consistent appearance
