/**
 * File Type Classifier Module
 * Classifies files into categories based on extension
 */

class FileTypeClassifier {
    constructor() {
        // File type categories with extensions and icons
        this.categories = {
            folder: {
                name: 'folder',
                label: 'Folders',
                icon: '📁',
                extensions: [],
                isDirectory: true
            },
            archive: {
                name: 'archive',
                label: 'Archive Files',
                icon: '🗜️',
                extensions: ['zip', 'rar', '7z', 'tar', 'gz', 'bz2', 'xz', 'lz', 'lzma', 'lzo', 'rz', 'sz', 'z', 'tgz', 'tbz', 'tbz2', 'tlz', 'txz', 'cab', 'iso', 'dmg', 'pkg', 'deb', 'rpm', 'jar', 'war', 'ear']
            },
            pdf: {
                name: 'pdf',
                label: 'PDF Documents',
                icon: '📕',
                extensions: ['pdf']
            },
            office: {
                name: 'office',
                label: 'Office Documents',
                icon: '📊',
                extensions: ['doc', 'docx', 'xls', 'xlsx', 'ppt', 'pptx', 'odt', 'ods', 'odp', 'rtf', 'wps', 'et', 'dps', 'docm', 'dotx', 'dotm', 'xlsm', 'xltx', 'xltm', 'pptm', 'potx', 'potm', 'ppsx', 'ppsm']
            },
            firmware: {
                name: 'firmware',
                label: 'Firmware Files',
                icon: '🔧',
                extensions: ['fbf', 'pac', 'bin', 'hex', 'elf', 's19', 's28', 's37', 'dfu', 'img', 'rom', 'fw', 'ota']
            },
            code: {
                name: 'code',
                label: 'Code Files',
                icon: '💻',
                extensions: ['c', 'h', 'cpp', 'hpp', 'cc', 'hh', 'cxx', 'hxx', 'js', 'ts', 'jsx', 'tsx', 'py', 'java', 'class', 'jar', 'go', 'rs', 'swift', 'kt', 'kts', 'scala', 'groovy', 'php', 'rb', 'erb', 'pl', 'pm', 'sh', 'bash', 'zsh', 'fish', 'ps1', 'bat', 'cmd', 'vbs', 'lua', 'r', 'm', 'mm', 'cs', 'vb', 'fs', 'fsx', 'fsi', 'ml', 'mli', 'hs', 'lhs', 'elm', 'erl', 'hrl', 'ex', 'exs', 'clj', 'cljs', 'coffee', 'iced', 'dart', 'flutter', 'groovy', 'gvy', 'gy', 'gsh', 'json', 'xml', 'yaml', 'yml', 'toml', 'ini', 'conf', 'cfg', 'properties', 'gradle', 'mk', 'makefile', 'cmake', 'dockerfile']
            },
            image: {
                name: 'image',
                label: 'Images',
                icon: '🖼️',
                extensions: ['png', 'jpg', 'jpeg', 'gif', 'bmp', 'svg', 'webp', 'ico', 'psd', 'ai', 'eps', 'tiff', 'tif', 'raw', 'cr2', 'nef', 'orf', 'sr2', 'heic', 'heif', 'avif', 'jxl']
            },
            video: {
                name: 'video',
                label: 'Videos',
                icon: '🎬',
                extensions: ['mp4', 'avi', 'mkv', 'mov', 'wmv', 'flv', 'webm', 'm4v', 'mpg', 'mpeg', 'mpe', 'mpv', 'ogv', '3gp', '3g2', 'm2v', 'mts', 'm2ts', 'ts', 'vob', 'ogm']
            },
            audio: {
                name: 'audio',
                label: 'Audio',
                icon: '🎵',
                extensions: ['mp3', 'wav', 'flac', 'aac', 'ogg', 'm4a', 'wma', 'midi', 'mid', 'opus', 'wma', 'aiff', 'au', 'ra', 'ram', 'amr', 'ape', 'wv', 'mpc', 'dsf', 'dff']
            },
            text: {
                name: 'text',
                label: 'Text Files',
                icon: '📝',
                extensions: ['txt', 'md', 'markdown', 'rst', 'adoc', 'asciidoc', 'tex', 'latex', 'log', 'csv', 'tsv', 'tab', 'diff', 'patch']
            },
            executable: {
                name: 'executable',
                label: 'Executables',
                icon: '⚙️',
                extensions: ['exe', 'dll', 'so', 'dylib', 'app', 'msi', 'msp', 'msm', 'com', 'gadget', 'msix', 'appx', 'appxbundle', 'msixbundle']
            },
            other: {
                name: 'other',
                label: 'Other Files',
                icon: '📄',
                extensions: []
            }
        };

        // Build extension to category mapping for fast lookup
        this.extensionMap = new Map();
        for (const [categoryKey, category] of Object.entries(this.categories)) {
            if (categoryKey === 'folder' || categoryKey === 'other') continue;
            for (const ext of category.extensions) {
                this.extensionMap.set(ext.toLowerCase(), categoryKey);
            }
        }
    }

    /**
     * Get file category
     * @param {Object} file File object with name, path, isDirectory
     * @returns {string} Category key
     */
    getCategory(file) {
        if (file.isDirectory) {
            return 'folder';
        }

        const ext = this._getExtension(file.name);
        if (!ext) {
            return 'other';
        }

        return this.extensionMap.get(ext.toLowerCase()) || 'other';
    }

    /**
     * Get category info
     * @param {string} categoryKey Category key
     * @returns {Object} Category info
     */
    getCategoryInfo(categoryKey) {
        return this.categories[categoryKey] || this.categories.other;
    }

    /**
     * Get all categories
     * @returns {Array} Array of category keys
     */
    getAllCategories() {
        return Object.keys(this.categories);
    }

    /**
     * Group files by category
     * @param {Array} files Array of file objects
     * @returns {Object} Grouped files by category
     */
    groupByCategory(files) {
        const grouped = {};

        // Initialize all categories
        for (const key of this.getAllCategories()) {
            grouped[key] = [];
        }

        // Group files
        for (const file of files) {
            const category = this.getCategory(file);
            grouped[category].push(file);
        }

        return grouped;
    }

    /**
     * Get file icon
     * @param {Object} file File object
     * @returns {string} Icon character
     */
    getFileIcon(file) {
        const category = this.getCategory(file);
        return this.getCategoryInfo(category).icon;
    }

    /**
     * Get file extension
     * @param {string} filename File name
     * @returns {string|null} Extension or null
     */
    _getExtension(filename) {
        if (!filename) return null;
        const lastDot = filename.lastIndexOf('.');
        if (lastDot === -1 || lastDot === 0) return null;
        return filename.slice(lastDot + 1).toLowerCase();
    }

    /**
     * Check if file is a firmware file
     * @param {Object} file File object
     * @returns {boolean}
     */
    isFirmwareFile(file) {
        return this.getCategory(file) === 'firmware';
    }

    /**
     * Get file size string
     * @param {number} size Size in bytes
     * @returns {string} Formatted size string
     */
    formatFileSize(size) {
        if (size === undefined || size === null) return '';
        if (size === 0) return '0 B';

        const units = ['B', 'KB', 'MB', 'GB', 'TB'];
        const i = Math.floor(Math.log(size) / Math.log(1024));
        const value = size / Math.pow(1024, i);

        return `${value.toFixed(2)} ${units[i]}`;
    }

    /**
     * Format date
     * @param {number|string} date Date value
     * @returns {string} Formatted date string
     */
    formatDate(date) {
        if (!date) return '';
        const d = new Date(date);
        if (isNaN(d.getTime())) return '';
        return d.toLocaleString();
    }
}

module.exports = FileTypeClassifier;
