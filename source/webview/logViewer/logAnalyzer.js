/**
 * @description: Log Analyzer - Core log analysis engine
 *               Handles log file loading, parsing, and line management
 * @author: destin.zhang@quectel.com
 */

const fs = require('fs');
const iconv = require('iconv-lite');
const readline = require('readline');
const events = require('events');

/**
 * Log Analyzer Class
 * Handles log file loading with multiple encoding support and format detection
 */
class LogAnalyzer extends events.EventEmitter {
    constructor() {
        super();
        this.lines = [];           // Array of log lines
        this.filePath = '';        // Current file path
        this.fileSize = 0;         // File size in bytes
        this.encoding = 'utf8';    // Detected encoding
        this.isLoading = false;    // Loading state
        this.isJsonl = false;      // Is JSONL format
    }

    /**
     * Load log file with automatic encoding detection and format support
     * @param {string} filePath - Path to log file
     * @returns {Promise<boolean>} Success status
     */
    async loadFile(filePath) {
        if (this.isLoading) {
            return false;
        }

        this.isLoading = true;
        this.filePath = filePath;
        this.lines = [];

        try {
            // Detect if file is JSONL format
            this.isJsonl = this.isJsonlFile(filePath);

            // Detect file encoding
            this.encoding = await this.detectEncoding(filePath);

            // Get file stats
            const stats = fs.statSync(filePath);
            this.fileSize = stats.size;

            // Read file with detected encoding
            const content = await this.readFileWithEncoding(filePath, this.encoding);

            // Split into lines and parse
            this.lines = content.split(/\r?\n/).map((text, index) => {
                const parsedText = this.isJsonl ? this.parseJsonlLine(text) : text;
                return {
                    lineNumber: index + 1,
                    text: parsedText,
                    rawText: text,  // Keep original for JSONL
                    length: parsedText.length,
                    isJson: this.isJsonl && this.isValidJson(text)
                };
            }).filter(line => line.text.length > 0);  // Remove empty lines

            this.emit('loaded', {
                filePath: this.filePath,
                lineCount: this.lines.length,
                encoding: this.encoding,
                fileSize: this.fileSize,
                isJsonl: this.isJsonl
            });

            this.isLoading = false;
            return true;

        } catch (error) {
            this.emit('error', error);
            this.isLoading = false;
            return false;
        }
    }

    /**
     * Check if file is JSONL format
     * @param {string} filePath - File path
     * @returns {boolean} Is JSONL file
     */
    isJsonlFile(filePath) {
        const ext = filePath.toLowerCase();
        if (ext.endsWith('.jsonl')) {
            return true;
        }
        // Also check content - first line should be valid JSON
        try {
            const firstLines = fs.readFileSync(filePath, { encoding: 'utf8', length: 1024 });
            const firstLine = firstLines.split('\n')[0].trim();
            if (firstLine.length > 0) {
                JSON.parse(firstLine);
                return true;
            }
        } catch {
            // Not JSONL
        }
        return false;
    }

    /**
     * Parse a JSONL line into readable format
     * @param {string} lineText - Raw line text
     * @returns {string} Parsed/formatted text
     */
    parseJsonlLine(lineText) {
        if (!lineText || lineText.trim().length === 0) {
            return '';
        }

        try {
            const json = JSON.parse(lineText);

            // Format based on common log fields
            if (typeof json === 'object') {
                // Extract common log fields
                const timestamp = json.timestamp || json.time || json.ts || json.date || '';
                const level = json.level || json.severity || json.status || '';
                const message = json.message || json.msg || json.log || json.text || '';
                const source = json.source || json.src || json.component || json.logger || '';

                // Build formatted output
                let formatted = '';
                if (timestamp) {
                    formatted += `[${timestamp}] `;
                }
                if (level) {
                    formatted += `${level.toUpperCase().padEnd(5)} `;
                }
                if (source) {
                    formatted += `[${source}] `;
                }
                if (message) {
                    formatted += message;
                }

                // If no common fields, pretty-print the JSON
                if (!formatted) {
                    formatted = JSON.stringify(json, null, 2);
                }

                // Add remaining fields as context if not already included
                const remaining = this.getRemainingFields(json, ['timestamp', 'time', 'ts', 'date', 'level', 'severity', 'status', 'message', 'msg', 'log', 'text', 'source', 'src', 'component', 'logger']);
                if (remaining && Object.keys(remaining).length > 0) {
                    formatted += ` | ${JSON.stringify(remaining)}`;
                }

                return formatted;
            }

            return JSON.stringify(json);
        } catch {
            // Not valid JSON, return raw text
            return lineText;
        }
    }

    /**
     * Get remaining fields from JSON object
     * @param {Object} json - JSON object
     * @param {Array<string>} excludeFields - Fields to exclude
     * @returns {Object} Remaining fields
     */
    getRemainingFields(json, excludeFields) {
        const remaining = {};
        for (const key of Object.keys(json)) {
            if (!excludeFields.includes(key)) {
                remaining[key] = json[key];
            }
        }
        return remaining;
    }

    /**
     * Check if text is valid JSON
     * @param {string} text - Text to check
     * @returns {boolean} Is valid JSON
     */
    isValidJson(text) {
        try {
            JSON.parse(text);
            return true;
        } catch {
            return false;
        }
    }

    /**
     * Detect file encoding
     * @param {string} filePath - Path to file
     * @returns {Promise<string>} Detected encoding
     */
    async detectEncoding(filePath) {
        try {
            // Read first 4KB for detection
            const buffer = fs.readFileSync(filePath, { length: 4096 });
            
            // Check BOM
            if (buffer.length >= 3 && buffer[0] === 0xEF && buffer[1] === 0xBB && buffer[2] === 0xBF) {
                return 'utf8';
            }
            if (buffer.length >= 2 && buffer[0] === 0xFF && buffer[1] === 0xFE) {
                return 'utf16le';
            }

            // Try UTF-8 first
            if (this.isValidUTF8(buffer)) {
                return 'utf8';
            }

            // Try GBK/GB2312
            const gbkContent = iconv.decode(buffer, 'gbk');
            const utf8FromGbk = iconv.encode(gbkContent, 'utf8');
            
            // If conversion is reversible, likely GBK
            if (utf8FromGbk.length >= buffer.length * 0.8) {
                return 'gbk';
            }

            return 'utf8'; // Default fallback
        } catch (error) {
            return 'utf8';
        }
    }

    /**
     * Check if buffer is valid UTF-8
     * @param {Buffer} buffer - Buffer to check
     * @returns {boolean} Is valid UTF-8
     */
    isValidUTF8(buffer) {
        try {
            const decoder = new TextDecoder('utf-8', { fatal: true });
            decoder.decode(buffer);
            return true;
        } catch {
            return false;
        }
    }

    /**
     * Read file with specific encoding
     * @param {string} filePath - Path to file
     * @param {string} encoding - Encoding to use
     * @returns {Promise<string>} File content
     */
    async readFileWithEncoding(filePath, encoding) {
        if (encoding === 'utf8') {
            return fs.readFileSync(filePath, 'utf8');
        }
        
        const buffer = fs.readFileSync(filePath);
        return iconv.decode(buffer, encoding);
    }

    /**
     * Get line by line number
     * @param {number} lineNumber - 1-based line number
     * @returns {Object|null} Line object or null
     */
    getLine(lineNumber) {
        const index = lineNumber - 1;
        if (index >= 0 && index < this.lines.length) {
            return this.lines[index];
        }
        return null;
    }

    /**
     * Get lines range
     * @param {number} start - Start line number (1-based)
     * @param {number} end - End line number (1-based)
     * @returns {Array} Array of line objects
     */
    getLinesRange(start, end) {
        const startIndex = Math.max(0, start - 1);
        const endIndex = Math.min(this.lines.length, end);
        return this.lines.slice(startIndex, endIndex);
    }

    /**
     * Search lines with regex
     * @param {string} pattern - Search pattern
     * @param {boolean} useRegex - Use regex mode
     * @returns {Array} Array of matching line objects
     */
    search(pattern, useRegex = true) {
        let regex;
        try {
            if (useRegex) {
                regex = new RegExp(pattern, 'gi');
            } else {
                regex = new RegExp(this.escapeRegex(pattern), 'gi');
            }
        } catch (error) {
            // Invalid regex, treat as literal
            regex = new RegExp(this.escapeRegex(pattern), 'gi');
        }

        const results = [];
        for (const line of this.lines) {
            if (regex.test(line.text)) {
                results.push({
                    ...line,
                    matches: this.getMatches(line.text, regex)
                });
            }
        }
        return results;
    }

    /**
     * Get all matches in text
     * @param {string} text - Text to search
     * @param {RegExp} regex - Regex pattern
     * @returns {Array} Array of match positions
     */
    getMatches(text, regex) {
        const matches = [];
        let match;
        const globalRegex = new RegExp(regex.source, 'gi');
        while ((match = globalRegex.exec(text)) !== null) {
            matches.push({
                start: match.index,
                end: match.index + match[0].length,
                text: match[0]
            });
        }
        return matches;
    }

    /**
     * Filter lines with regex (for creating filter view)
     * @param {string} pattern - Filter pattern
     * @param {boolean} useRegex - Use regex mode
     * @returns {Array} Array of matching line objects
     */
    filter(pattern, useRegex = true) {
        return this.search(pattern, useRegex);
    }

    /**
     * Escape special regex characters
     * @param {string} string - String to escape
     * @returns {string} Escaped string
     */
    escapeRegex(string) {
        return string.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    }

    /**
     * Get total line count
     * @returns {number} Line count
     */
    getLineCount() {
        return this.lines.length;
    }

    /**
     * Get file info
     * @returns {Object} File information
     */
    getFileInfo() {
        return {
            filePath: this.filePath,
            lineCount: this.lines.length,
            encoding: this.encoding,
            fileSize: this.fileSize,
            isJsonl: this.isJsonl
        };
    }

    /**
     * Clear loaded data
     */
    clear() {
        this.lines = [];
        this.filePath = '';
        this.fileSize = 0;
        this.encoding = 'utf8';
        this.isJsonl = false;
    }
}

module.exports = { LogAnalyzer };
