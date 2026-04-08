/**
 * @description: Markbook Manager - Manages bookmarked lines
 *               Allows users to mark important lines for quick navigation
 * @author: destin.zhang@quectel.com
 */

/**
 * Markbook Manager Class
 * Manages bookmarked lines with notes
 */
class MarkbookManager {
    constructor() {
        // Bookmarks: Array of { lineNumber, text, note, timestamp }
        this.bookmarks = [];
    }

    /**
     * Add a bookmark
     * @param {number} lineNumber - Line number (1-based)
     * @param {string} text - Line text content
     * @param {string} note - Optional note
     * @returns {Object} Bookmark object
     */
    addBookmark(lineNumber, text, note = '') {
        // Check if already bookmarked
        const existingIndex = this.bookmarks.findIndex(b => b.lineNumber === lineNumber);
        
        const bookmark = {
            lineNumber: lineNumber,
            text: text ? text.substring(0, 100) : '', // Limit text length
            note: note,
            timestamp: Date.now()
        };

        if (existingIndex >= 0) {
            // Update existing bookmark
            this.bookmarks[existingIndex] = bookmark;
        } else {
            // Add new bookmark
            this.bookmarks.push(bookmark);
            // Sort by line number
            this.bookmarks.sort((a, b) => a.lineNumber - b.lineNumber);
        }

        return bookmark;
    }

    /**
     * Remove a bookmark
     * @param {number} lineNumber - Line number to remove
     * @returns {boolean} Success status
     */
    removeBookmark(lineNumber) {
        const index = this.bookmarks.findIndex(b => b.lineNumber === lineNumber);
        if (index >= 0) {
            this.bookmarks.splice(index, 1);
            return true;
        }
        return false;
    }

    /**
     * Toggle bookmark
     * @param {number} lineNumber - Line number
     * @param {string} text - Line text
     * @param {string} note - Optional note
     * @returns {Object} Result with action and bookmark
     */
    toggleBookmark(lineNumber, text, note = '') {
        if (this.isBookmarked(lineNumber)) {
            this.removeBookmark(lineNumber);
            return { action: 'removed', lineNumber: lineNumber };
        } else {
            const bookmark = this.addBookmark(lineNumber, text, note);
            return { action: 'added', bookmark: bookmark };
        }
    }

    /**
     * Check if line is bookmarked
     * @param {number} lineNumber - Line number
     * @returns {boolean} Is bookmarked
     */
    isBookmarked(lineNumber) {
        return this.bookmarks.some(b => b.lineNumber === lineNumber);
    }

    /**
     * Get bookmark by line number
     * @param {number} lineNumber - Line number
     * @returns {Object|null} Bookmark or null
     */
    getBookmark(lineNumber) {
        return this.bookmarks.find(b => b.lineNumber === lineNumber) || null;
    }

    /**
     * Get all bookmarks
     * @returns {Array} Array of bookmarks
     */
    getAllBookmarks() {
        return [...this.bookmarks];
    }

    /**
     * Update bookmark note
     * @param {number} lineNumber - Line number
     * @param {string} note - New note
     * @returns {boolean} Success status
     */
    updateNote(lineNumber, note) {
        const bookmark = this.getBookmark(lineNumber);
        if (bookmark) {
            bookmark.note = note;
            return true;
        }
        return false;
    }

    /**
     * Get next bookmark from current line
     * @param {number} currentLine - Current line number
     * @returns {Object|null} Next bookmark or null
     */
    getNextBookmark(currentLine) {
        for (const bookmark of this.bookmarks) {
            if (bookmark.lineNumber > currentLine) {
                return bookmark;
            }
        }
        // Wrap around to first bookmark
        return this.bookmarks.length > 0 ? this.bookmarks[0] : null;
    }

    /**
     * Get previous bookmark from current line
     * @param {number} currentLine - Current line number
     * @returns {Object|null} Previous bookmark or null
     */
    getPreviousBookmark(currentLine) {
        for (let i = this.bookmarks.length - 1; i >= 0; i--) {
            if (this.bookmarks[i].lineNumber < currentLine) {
                return this.bookmarks[i];
            }
        }
        // Wrap around to last bookmark
        return this.bookmarks.length > 0 ? this.bookmarks[this.bookmarks.length - 1] : null;
    }

    /**
     * Clear all bookmarks
     */
    clearAll() {
        this.bookmarks = [];
    }

    /**
     * Get bookmark count
     * @returns {number} Number of bookmarks
     */
    getBookmarkCount() {
        return this.bookmarks.length;
    }

    /**
     * Export bookmarks to string
     * @returns {string} Formatted bookmarks
     */
    exportToString() {
        if (this.bookmarks.length === 0) {
            return 'No bookmarks';
        }

        return this.bookmarks.map(b => {
            const time = new Date(b.timestamp).toLocaleString();
            const note = b.note ? ` [${b.note}]` : '';
            return `Line ${b.lineNumber}${note}: ${b.text}`;
        }).join('\n');
    }

    /**
     * Serialize bookmarks for storage
     * @returns {Array} Serializable bookmark data
     */
    serialize() {
        return this.bookmarks.map(b => ({
            lineNumber: b.lineNumber,
            text: b.text,
            note: b.note,
            timestamp: b.timestamp
        }));
    }

    /**
     * Deserialize bookmarks
     * @param {Array} data - Serialized bookmark data
     */
    deserialize(data) {
        this.clearAll();
        if (Array.isArray(data)) {
            for (const item of data) {
                if (item.lineNumber) {
                    this.addBookmark(item.lineNumber, item.text, item.note);
                }
            }
        }
    }
}

module.exports = { MarkbookManager };
