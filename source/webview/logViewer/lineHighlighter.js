/**
 * @description: Line Highlighter - Manages line background highlighting
 *               Highlights entire lines that match keywords with background colors
 *               Does NOT affect text color or keyword highlighting
 * @author: destin.zhang@quectel.com
 */

/**
 * Line Highlighter Class
 * Manages line background highlighting with color cycling
 */
class LineHighlighter {
    constructor() {
        // Predefined line background colors (6 colors cycle) - semi-transparent for better readability
        this.colors = [
            { bg: 'rgba(255, 107, 107, 0.15)', name: 'red' },     // Red (light)
            { bg: 'rgba(78, 205, 196, 0.15)', name: 'teal' },     // Teal (light)
            { bg: 'rgba(69, 183, 209, 0.15)', name: 'blue' },     // Blue (light)
            { bg: 'rgba(150, 206, 180, 0.15)', name: 'green' },   // Green (light)
            { bg: 'rgba(255, 234, 167, 0.15)', name: 'yellow' },  // Yellow (light)
            { bg: 'rgba(162, 155, 254, 0.15)', name: 'purple' }   // Purple (light)
        ];

        // Active line highlights: Map<keyword, { colorIndex, regex, color }>
        this.lineHighlights = new Map();

        // Color index counter for cycling
        this.nextColorIndex = 0;
    }

    /**
     * Add line highlight for a keyword
     * @param {string} keyword - Keyword to match for line highlighting
     * @param {boolean} useRegex - Treat keyword as regex
     * @returns {Object|null} Highlight info or null if failed
     */
    addLineHighlight(keyword, useRegex = false) {
        if (!keyword || keyword.trim() === '') {
            return null;
        }

        const trimmedKeyword = keyword.trim();

        // Check if already highlighted
        if (this.lineHighlights.has(trimmedKeyword)) {
            return this.lineHighlights.get(trimmedKeyword);
        }

        // Create regex pattern
        let regex;
        try {
            if (useRegex) {
                regex = new RegExp(trimmedKeyword, 'gi');
            } else {
                const escaped = this.escapeRegex(trimmedKeyword);
                regex = new RegExp(escaped, 'gi');
            }
        } catch (error) {
            // Invalid regex, escape and try again
            const escaped = this.escapeRegex(trimmedKeyword);
            regex = new RegExp(escaped, 'gi');
        }

        // Assign color (cycle through available colors)
        const colorIndex = this.nextColorIndex;
        this.nextColorIndex = (this.nextColorIndex + 1) % this.colors.length;

        const highlightInfo = {
            keyword: trimmedKeyword,
            colorIndex: colorIndex,
            color: this.colors[colorIndex],
            regex: regex,
            useRegex: useRegex
        };

        this.lineHighlights.set(trimmedKeyword, highlightInfo);
        return highlightInfo;
    }

    /**
     * Remove line highlight for a keyword
     * @param {string} keyword - Keyword to remove
     * @returns {boolean} Success status
     */
    removeLineHighlight(keyword) {
        if (!keyword) {
            return false;
        }
        return this.lineHighlights.delete(keyword.trim());
    }

    /**
     * Toggle line highlight for a keyword
     * @param {string} keyword - Keyword to toggle
     * @param {boolean} useRegex - Treat keyword as regex
     * @returns {Object} Result with added/removed status
     */
    toggleLineHighlight(keyword, useRegex = false) {
        const trimmedKeyword = keyword.trim();

        if (this.lineHighlights.has(trimmedKeyword)) {
            this.lineHighlights.delete(trimmedKeyword);
            return { action: 'removed', keyword: trimmedKeyword };
        } else {
            const info = this.addLineHighlight(trimmedKeyword, useRegex);
            return { action: 'added', keyword: trimmedKeyword, info: info };
        }
    }

    /**
     * Check if keyword has line highlight
     * @param {string} keyword - Keyword to check
     * @returns {boolean} Is highlighted
     */
    hasLineHighlight(keyword) {
        if (!keyword) return false;
        return this.lineHighlights.has(keyword.trim());
    }

    /**
     * Get line highlight info for a keyword
     * @param {string} keyword - Keyword to get info for
     * @returns {Object|null} Highlight info or null
     */
    getLineHighlight(keyword) {
        if (!keyword) return null;
        return this.lineHighlights.get(keyword.trim());
    }

    /**
     * Get all active line highlights
     * @returns {Array} Array of highlight info objects
     */
    getAllLineHighlights() {
        return Array.from(this.lineHighlights.values());
    }

    /**
     * Check if a line text matches any line highlight keyword
     * @param {string} text - Line text to check
     * @returns {Object|null} Match info with color or null
     */
    getLineMatch(text) {
        if (!text || this.lineHighlights.size === 0) {
            return null;
        }

        for (const [keyword, info] of this.lineHighlights) {
            info.regex.lastIndex = 0;
            if (info.regex.test(text)) {
                return { keyword: keyword, color: info.color };
            }
        }

        return null;
    }

    /**
     * Get matching keywords for a line text
     * @param {string} text - Line text to check
     * @returns {Array} Array of matching keywords
     */
    getMatchingKeywords(text) {
        if (!text || this.lineHighlights.size === 0) {
            return [];
        }

        const matches = [];
        for (const [keyword, info] of this.lineHighlights) {
            info.regex.lastIndex = 0;
            if (info.regex.test(text)) {
                matches.push(keyword);
            }
        }

        return matches;
    }

    /**
     * Clear all line highlights
     */
    clearAll() {
        this.lineHighlights.clear();
        this.nextColorIndex = 0;
    }

    /**
     * Get line highlight count
     * @returns {number} Number of active line highlights
     */
    getLineHighlightCount() {
        return this.lineHighlights.size;
    }

    /**
     * Get next color to be used
     * @returns {Object} Color object
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

    /**
     * Serialize line highlights for transfer
     * @returns {Array} Serializable highlight data
     */
    serialize() {
        return Array.from(this.lineHighlights.values()).map(h => ({
            keyword: h.keyword,
            colorIndex: h.colorIndex,
            useRegex: h.useRegex
        }));
    }

    /**
     * Deserialize line highlights
     * @param {Array} data - Serialized highlight data
     */
    deserialize(data) {
        if (Array.isArray(data)) {
            for (const item of data) {
                this.addLineHighlight(item.keyword, item.useRegex);
            }
        }
    }
}

module.exports = { LineHighlighter };