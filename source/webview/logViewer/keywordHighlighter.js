/**
 * @description: Keyword Highlighter - Manages keyword highlighting
 *               Temporary highlighting with color cycling and auto-highlight for common keywords
 * @author: destin.zhang@quectel.com
 */

/**
 * Keyword Highlighter Class
 * Manages temporary keyword highlighting with color cycling
 */
class KeywordHighlighter {
    constructor() {
        // Predefined highlight colors (6 colors cycle)
        this.colors = [
            { bg: '#ff6b6b', text: '#ffffff' }, // Red
            { bg: '#4ecdc4', text: '#ffffff' }, // Teal
            { bg: '#45b7d1', text: '#ffffff' }, // Blue
            { bg: '#96ceb4', text: '#ffffff' }, // Green
            { bg: '#ffeaa7', text: '#2d3436' }, // Yellow
            { bg: '#dfe6e9', text: '#2d3436' }  // Gray
        ];

        // Default auto-highlight keywords with predefined colors
        // These are common log keywords that should be highlighted automatically
        this.defaultKeywords = {
            // Error/Problem keywords - Red
            'error': { bg: '#ff6b6b', text: '#ffffff' },
            'failed': { bg: '#ff6b6b', text: '#ffffff' },
            'fail': { bg: '#ff6b6b', text: '#ffffff' },
            'exception': { bg: '#ff6b6b', text: '#ffffff' },
            'critical': { bg: '#ff6b6b', text: '#ffffff' },
            'crash': { bg: '#ff6b6b', text: '#ffffff' },
            'fatal': { bg: '#ff6b6b', text: '#ffffff' },
            'err': { bg: '#ff6b6b', text: '#ffffff' },

            // Warning keywords - Orange/Yellow
            'warning': { bg: '#ff9f43', text: '#ffffff' },
            'warn': { bg: '#ff9f43', text: '#ffffff' },
            'deprecated': { bg: '#ff9f43', text: '#ffffff' },
            'caution': { bg: '#ff9f43', text: '#ffffff' },

            // Success/OK keywords - Green
            'ok': { bg: '#96ceb4', text: '#ffffff' },
            'success': { bg: '#96ceb4', text: '#ffffff' },
            'passed': { bg: '#96ceb4', text: '#ffffff' },
            'pass': { bg: '#96ceb4', text: '#ffffff' },
            'complete': { bg: '#96ceb4', text: '#ffffff' },
            'completed': { bg: '#96ceb4', text: '#ffffff' },
            'done': { bg: '#96ceb4', text: '#ffffff' },
            'finished': { bg: '#96ceb4', text: '#ffffff' },

            // Info/Debug keywords - Blue
            'info': { bg: '#45b7d1', text: '#ffffff' },
            'debug': { bg: '#45b7d1', text: '#ffffff' },
            'trace': { bg: '#45b7d1', text: '#ffffff' },
            'log': { bg: '#45b7d1', text: '#ffffff' },
            'notice': { bg: '#45b7d1', text: '#ffffff' },

            // Special keywords - Purple
            'assert': { bg: '#a29bfe', text: '#ffffff' },
            'test': { bg: '#a29bfe', text: '#ffffff' },
            'testing': { bg: '#a29bfe', text: '#ffffff' }
        };

        // Auto-highlight is enabled by default
        this.autoHighlightEnabled = true;

        // Active highlights: Map<keyword, { colorIndex, regex }>
        this.highlights = new Map();

        // Color index counter for cycling (used for custom highlights)
        this.nextColorIndex = 0;

        // Initialize default keywords if auto-highlight is enabled
        this.initializeDefaultHighlights();
    }

    /**
     * Initialize default auto-highlight keywords
     */
    initializeDefaultHighlights() {
        if (!this.autoHighlightEnabled) return;

        for (const [keyword, color] of Object.entries(this.defaultKeywords)) {
            // Use word boundary for whole word matching, case insensitive
            // \b ensures we match whole words only (e.g., "pass" won't match "bypass")
            // But allows matching words adjacent to separators like .info or -OK
            const escaped = this.escapeRegex(keyword);
            const regex = new RegExp(`(\\b${escaped}\\b)`, 'gi');

            const highlightInfo = {
                keyword: keyword,
                colorIndex: -1, // -1 indicates default keyword (uses predefined color)
                color: color,
                regex: regex,
                useRegex: false,
                isDefault: true // Mark as default keyword
            };

            this.highlights.set(keyword, highlightInfo);
        }
    }

    /**
     * Enable or disable auto-highlight
     * @param {boolean} enabled - Enable status
     */
    setAutoHighlight(enabled) {
        this.autoHighlightEnabled = enabled;

        if (enabled) {
            // Add default keywords if not already present
            this.initializeDefaultHighlights();
        } else {
            // Remove only default keywords, keep custom ones
            for (const [keyword, info] of this.highlights) {
                if (info.isDefault) {
                    this.highlights.delete(keyword);
                }
            }
        }
    }

    /**
     * Check if auto-highlight is enabled
     * @returns {boolean} Auto-highlight status
     */
    isAutoHighlightEnabled() {
        return this.autoHighlightEnabled;
    }

    /**
     * Get all default keywords
     * @returns {Object} Default keywords with their colors
     */
    getDefaultKeywords() {
        return this.defaultKeywords;
    }

    /**
     * Add custom highlight for a keyword (non-default)
     * @param {string} keyword - Keyword to highlight
     * @param {boolean} useRegex - Treat keyword as regex
     * @returns {Object|null} Highlight info or null if failed
     */
    addHighlight(keyword, useRegex = false) {
        if (!keyword || keyword.trim() === '') {
            return null;
        }

        const trimmedKeyword = keyword.trim();

        // Check if already highlighted
        if (this.highlights.has(trimmedKeyword)) {
            return this.highlights.get(trimmedKeyword);
        }

        // Create regex pattern
        let regex;
        try {
            if (useRegex) {
                regex = new RegExp(`(${trimmedKeyword})`, 'g');
            } else {
                const escaped = this.escapeRegex(trimmedKeyword);
                regex = new RegExp(`(${escaped})`, 'g');
            }
        } catch (error) {
            // Invalid regex, escape and try again
            const escaped = this.escapeRegex(trimmedKeyword);
            regex = new RegExp(`(${escaped})`, 'g');
        }

        // Assign color (cycle through available colors)
        const colorIndex = this.nextColorIndex;
        this.nextColorIndex = (this.nextColorIndex + 1) % this.colors.length;

        const highlightInfo = {
            keyword: trimmedKeyword,
            colorIndex: colorIndex,
            color: this.colors[colorIndex],
            regex: regex,
            useRegex: useRegex,
            isDefault: false // Mark as custom keyword
        };

        this.highlights.set(trimmedKeyword, highlightInfo);
        return highlightInfo;
    }

    /**
     * Remove highlight for a keyword
     * @param {string} keyword - Keyword to remove
     * @returns {boolean} Success status
     */
    removeHighlight(keyword) {
        if (!keyword) {
            return false;
        }

        const trimmedKeyword = keyword.trim();
        const info = this.highlights.get(trimmedKeyword);

        // If it's a default keyword and auto-highlight is enabled, don't remove it
        if (info && info.isDefault && this.autoHighlightEnabled) {
            // Instead, temporarily disable it by marking as inactive
            info.inactive = true;
            return true;
        }

        return this.highlights.delete(trimmedKeyword);
    }

    /**
     * Toggle highlight for a keyword
     * @param {string} keyword - Keyword to toggle
     * @param {boolean} useRegex - Treat keyword as regex
     * @returns {Object} Result with added/removed status
     */
    toggleHighlight(keyword, useRegex = false) {
        const trimmedKeyword = keyword.trim();
        const existingInfo = this.highlights.get(trimmedKeyword);

        if (existingInfo) {
            // For default keywords, toggle inactive state
            if (existingInfo.isDefault) {
                if (existingInfo.inactive) {
                    existingInfo.inactive = false;
                    return { action: 'added', keyword: trimmedKeyword, info: existingInfo, isDefault: true };
                } else {
                    existingInfo.inactive = true;
                    return { action: 'removed', keyword: trimmedKeyword, isDefault: true };
                }
            }
            // For custom keywords, remove completely
            this.highlights.delete(trimmedKeyword);
            return { action: 'removed', keyword: trimmedKeyword };
        } else {
            const info = this.addHighlight(trimmedKeyword, useRegex);
            return { action: 'added', keyword: trimmedKeyword, info: info };
        }
    }

    /**
     * Check if keyword is highlighted
     * @param {string} keyword - Keyword to check
     * @returns {boolean} Is highlighted
     */
    isHighlighted(keyword) {
        if (!keyword) return false;
        const info = this.highlights.get(keyword.trim());
        return info && !info.inactive;
    }

    /**
     * Get highlight info for a keyword
     * @param {string} keyword - Keyword to get info for
     * @returns {Object|null} Highlight info or null
     */
    getHighlight(keyword) {
        if (!keyword) return null;
        const info = this.highlights.get(keyword.trim());
        return info && !info.inactive ? info : null;
    }

    /**
     * Get all active highlights (excluding inactive ones)
     * @returns {Array} Array of highlight info objects
     */
    getAllHighlights() {
        return Array.from(this.highlights.values()).filter(h => !h.inactive);
    }

    /**
     * Get only custom (non-default) highlights
     * @returns {Array} Array of custom highlight info objects
     */
    getCustomHighlights() {
        return Array.from(this.highlights.values()).filter(h => !h.isDefault && !h.inactive);
    }

    /**
     * Get only default highlights
     * @returns {Array} Array of default highlight info objects
     */
    getDefaultHighlights() {
        return Array.from(this.highlights.values()).filter(h => h.isDefault && !h.inactive);
    }

    /**
     * Build highlighted HTML by finding all matches
     * @param {string} text - Original text
     * @returns {string} Highlighted HTML
     */
    buildHighlightedHtml(text) {
        if (!text || this.highlights.size === 0) {
            return this.escapeHtml(text);
        }

        // Find all matches with their positions and colors
        const matches = [];

        for (const [keyword, info] of this.highlights) {
            // Skip inactive highlights
            if (info.inactive) continue;

            // Use the pre-built regex directly
            const regex = info.regex;
            regex.lastIndex = 0; // Reset regex index for each new text

            let match;
            while ((match = regex.exec(text)) !== null) {
                matches.push({
                    start: match.index,
                    end: match.index + match[0].length,
                    text: match[0],
                    color: info.color
                });

                // Prevent infinite loop on zero-length matches
                if (match.index === regex.lastIndex) {
                    regex.lastIndex++;
                }
            }
        }

        // Sort matches by position
        matches.sort((a, b) => a.start - b.start);

        // Remove overlapping matches (keep first one)
        const nonOverlapping = [];
        let lastEnd = -1;
        for (const match of matches) {
            if (match.start >= lastEnd) {
                nonOverlapping.push(match);
                lastEnd = match.end;
            }
        }

        // Build HTML
        let result = '';
        let lastIndex = 0;

        for (const match of nonOverlapping) {
            // Add text before match
            result += this.escapeHtml(text.substring(lastIndex, match.start));

            // Add highlighted match
            const style = `background-color: ${match.color.bg}; color: ${match.color.text}; padding: 1px 2px; border-radius: 2px; font-weight: 500;`;
            result += `<span class="highlight" style="${style}">${this.escapeHtml(match.text)}</span>`;

            lastIndex = match.end;
        }

        // Add remaining text
        result += this.escapeHtml(text.substring(lastIndex));

        return result;
    }

    /**
     * Clear all custom highlights (keep default ones if auto-highlight enabled)
     */
    clearAll() {
        if (this.autoHighlightEnabled) {
            // Only clear custom highlights, keep default ones
            for (const [keyword, info] of this.highlights) {
                if (!info.isDefault) {
                    this.highlights.delete(keyword);
                }
            }
        } else {
            // Clear all
            this.highlights.clear();
        }
        this.nextColorIndex = 0;
    }

    /**
     * Clear everything including default highlights
     */
    clearAllIncludingDefaults() {
        this.highlights.clear();
        this.nextColorIndex = 0;
    }

    /**
     * Get highlight count
     * @returns {number} Number of active highlights
     */
    getHighlightCount() {
        return this.getAllHighlights().length;
    }

    /**
     * Get next color to be used for highlighting
     * @returns {Object} Color object with bg and text properties
     */
    getNextColor() {
        return this.colors[this.nextColorIndex];
    }

    /**
     * Escape special regex characters
     * @param {string} string - String to escape
     * @returns {string} Escaped string
     */
    escapeRegex(string) {
        return string.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    }

    escapeHtml(text) {
        if (!text) return '';
        return text
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&#39;');
    }

    /**
     * Serialize highlights for transfer (only custom ones)
     * @returns {Array} Serializable highlight data
     */
    serialize() {
        return this.getCustomHighlights().map(h => ({
            keyword: h.keyword,
            colorIndex: h.colorIndex,
            useRegex: h.useRegex
        }));
    }

    /**
     * Deserialize highlights (adds as custom highlights)
     * @param {Array} data - Serialized highlight data
     */
    deserialize(data) {
        if (Array.isArray(data)) {
            for (const item of data) {
                this.addHighlight(item.keyword, item.useRegex);
            }
        }
    }
}

module.exports = { KeywordHighlighter };
