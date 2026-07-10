/**
 * Progress tracker for download status bar
 */
class ProgressTracker {
    constructor(status_bar_dl) {
        this.status_bar_dl = status_bar_dl;
        this.current_progress = 0;
    }

    update_progress(progress) {
        if (progress !== null && !isNaN(progress)) {
            this.current_progress = progress;
            this.status_bar_dl.text = `${this.get_progress_bar(5)}`;
        }
    }

    get_progress_bar(barLength) {
        const filledLength = Math.floor(this.current_progress / 100 * barLength);
        const decimalPart = (this.current_progress / 100 * barLength) % 1;
        const emptyLength = barLength - filledLength;
        let filled = '';
        if (filledLength > 0) {
            filled = '⣿'.repeat(filledLength);
        }
        let partial = '';
        if (decimalPart > 0) {
            if (decimalPart < 0.25) {
                partial = '⣀';
            } else if (decimalPart < 0.5) {
                partial = '⣄';
            } else if (decimalPart < 0.75) {
                partial = '⣤';
            } else {
                partial = '⣶';
            }
        }
        const empty = '⣀'.repeat(emptyLength - (partial ? 1 : 0));
        return `${filled}${partial}${empty}`;
    }

    reset() {
        this.current_progress = 0;
    }
}

module.exports = ProgressTracker;
