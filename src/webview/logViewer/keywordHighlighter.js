/**
 * @description: Keyword Highlighter - Manages keyword highlighting
 *               Temporary highlighting with color cycling
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
        
        // Active highlights: Map<keyword, { colorIndex, regex }>
        this.highlights = new Map();
        
        // Color index counter for cycling
        this.nextColorIndex = 0;
    }

    /**
     * Add highlight for a keyword
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

        // Create regex pattern (strict case matching - 'g' flag only)
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

        // Assign color
        const colorIndex = this.nextColorIndex;
        this.nextColorIndex = (this.nextColorIndex + 1) % this.colors.length;

        const highlightInfo = {
            keyword: trimmedKeyword,
            colorIndex: colorIndex,
            color: this.colors[colorIndex],
            regex: regex,
            useRegex: useRegex
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
        
        if (this.highlights.has(trimmedKeyword)) {
            this.removeHighlight(trimmedKeyword);
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
        return this.highlights.has(keyword.trim());
    }

    /**
     * Get highlight info for a keyword
     * @param {string} keyword - Keyword to get info for
     * @returns {Object|null} Highlight info or null
     */
    getHighlight(keyword) {
        if (!keyword) return null;
        return this.highlights.get(keyword.trim()) || null;
    }

    /**
     * Get all active highlights
     * @returns {Array} Array of highlight info objects
     */
    getAllHighlights() {
        return Array.from(this.highlights.values());
    }

    /**
     * Apply highlighting to text
     * @param {string} text - Text to highlight
     * @returns {string} HTML with highlighting
     */
    applyHighlighting(text) {
        if (!text || this.highlights.size === 0) {
            return this.escapeHtml(text);
        }

        let highlightedText = this.escapeHtml(text);
        
        // Apply each highlight
        for (const [keyword, info] of this.highlights) {
            const color = info.color;
            const style = `background-color: ${color.bg}; color: ${color.text}; padding: 1px 2px; border-radius: 2px;`;
            
            // Create a temporary regex that matches the escaped HTML
            let searchPattern;
            if (info.useRegex) {
                searchPattern = info.regex.source.replace(/^\((.+)\)$/, '$1');
            } else {
                searchPattern = this.escapeRegex(keyword);
            }
            
            // We need to match the original text, not the escaped HTML
            // So we'll use a different approach: mark positions first
        }
        
        // Better approach: find all matches in original text, then build HTML
        return this.buildHighlightedHtml(text);
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
            // Use the pre-built regex directly instead of recreating it
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
     * Clear all highlights
     */
    clearAll() {
        this.highlights.clear();
        this.nextColorIndex = 0;
    }

    /**
     * Get highlight count
     * @returns {number} Number of active highlights
     */
    getHighlightCount() {
        return this.highlights.size;
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
     * Serialize highlights for transfer
     * @returns {Array} Serializable highlight data
     */
    serialize() {
        return Array.from(this.highlights.values()).map(h => ({
            keyword: h.keyword,
            colorIndex: h.colorIndex,
            useRegex: h.useRegex
        }));
    }

    /**
     * Deserialize highlights
     * @param {Array} data - Serialized highlight data
     */
    deserialize(data) {
        this.clearAll();
        if (Array.isArray(data)) {
            for (const item of data) {
                this.addHighlight(item.keyword, item.useRegex);
            }
        }
    }
}

module.exports = { KeywordHighlighter };
