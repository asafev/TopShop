/**
 * Fingerprint UI - Console Component
 * Unix-style console logger for displaying real-time analysis progress
 * Reusable across all fingerprint analysis pages
 */

/**
 * Console entry types with their styling
 */
const LOG_TYPES = {
    info: { prefix: '[INFO]', color: '#4fc3f7', icon: 'ℹ️' },
    success: { prefix: '[OK]', color: '#81c784', icon: '✅' },
    warning: { prefix: '[WARN]', color: '#ffb74d', icon: '⚠️' },
    error: { prefix: '[ERR]', color: '#e57373', icon: '❌' },
    phase: { prefix: '[PHASE]', color: '#ba68c8', icon: '🔍' },
    start: { prefix: '[START]', color: '#64b5f6', icon: '▶️' },
    complete: { prefix: '[DONE]', color: '#81c784', icon: '✓' },
    timeout: { prefix: '[TIMEOUT]', color: '#ff8a65', icon: '⏱️' },
    skip: { prefix: '[SKIP]', color: '#90a4ae', icon: '⏭️' }
};

/**
 * Phase name mappings for human-readable display
 */
const PHASE_NAMES = {
    initialization: 'Initialization',
    core: 'Core Browser Properties',
    network: 'Network Capabilities',
    battery: 'Battery & Storage',
    audio: 'Audio Fingerprint',
    speech: 'Speech Synthesis',
    language: 'Language Signals',
    css: 'CSS Computed Styles',
    webrtc: 'WebRTC Detection',
    workers: 'Worker Signals',
    fonts: 'Font Detection',
    keyboardLayout: 'Keyboard Layout',
    webgl: 'WebGL Fingerprint',
    media: 'Media Devices',
    activeMeasurements: 'Network Speed Test',
    aiAgent: 'AI Agent Detection',
    stringSignature: 'Automation Signatures',
    behavioral: 'Behavioral Analysis',
    suspicious: 'Risk Assessment'
};

/**
 * Fingerprint Console - Visual logging component
 */
export class FingerprintConsole {
    /**
     * Create a new FingerprintConsole instance
     * @param {Object} options - Configuration options
     * @param {HTMLElement} options.container - Parent container to append console to
     * @param {boolean} options.expanded - Whether console starts expanded (default: true)
     * @param {number} options.maxLines - Maximum log lines to keep (default: 100)
     * @param {boolean} options.timestamps - Show timestamps (default: true)
     * @param {string} options.title - Console title (default: 'Analysis Log')
     */
    constructor(options = {}) {
        this.container = options.container || document.body;
        this.expanded = options.expanded ?? true;
        this.maxLines = options.maxLines ?? 100;
        this.showTimestamps = options.timestamps ?? true;
        this.title = options.title ?? 'Analysis Log';
        this.logs = [];
        this.startTime = Date.now();
        
        this._createConsoleElement();
        this._bindEvents();
    }

    /**
     * Create the console DOM structure
     * @private
     */
    _createConsoleElement() {
        this.element = document.createElement('div');
        this.element.className = 'fp-console';
        this.element.innerHTML = `
            <div class="fp-console__header">
                <div class="fp-console__title">
                    <span class="fp-console__icon">🖥️</span>
                    <span>${this._escapeHtml(this.title)}</span>
                    <span class="fp-console__status" id="fp-console-status">Running...</span>
                </div>
                <div class="fp-console__controls">
                    <button class="fp-console__btn fp-console__btn--clear" title="Clear logs">🗑️</button>
                    <button class="fp-console__btn fp-console__btn--toggle" title="Toggle console">
                        ${this.expanded ? '▼' : '▲'}
                    </button>
                </div>
            </div>
            <div class="fp-console__body ${this.expanded ? '' : 'fp-console__body--collapsed'}">
                <div class="fp-console__output" id="fp-console-output"></div>
            </div>
            <div class="fp-console__footer">
                <span class="fp-console__timer" id="fp-console-timer">0.0s</span>
                <span class="fp-console__counter" id="fp-console-counter">0 entries</span>
            </div>
        `;

        // Add styles if not already present
        this._injectStyles();
        
        // Append to container
        this.container.appendChild(this.element);
        
        // Cache DOM references
        this.outputEl = this.element.querySelector('#fp-console-output');
        this.statusEl = this.element.querySelector('#fp-console-status');
        this.timerEl = this.element.querySelector('#fp-console-timer');
        this.counterEl = this.element.querySelector('#fp-console-counter');
        this.bodyEl = this.element.querySelector('.fp-console__body');
        this.toggleBtn = this.element.querySelector('.fp-console__btn--toggle');
        
        // Start timer
        this._startTimer();
    }

    /**
     * Inject console styles into document
     * @private
     */
    _injectStyles() {
        if (document.getElementById('fp-console-styles')) return;
        
        const styleEl = document.createElement('style');
        styleEl.id = 'fp-console-styles';
        styleEl.textContent = `
            .fp-console {
                font-family: 'JetBrains Mono', 'Consolas', 'Monaco', monospace;
                font-size: 12px;
                background: #1a1a2e;
                border-radius: 8px;
                overflow: hidden;
                box-shadow: 0 4px 20px rgba(0, 0, 0, 0.3);
                margin: 16px 0;
                border: 1px solid #2d2d44;
            }
            
            .fp-console__header {
                display: flex;
                justify-content: space-between;
                align-items: center;
                padding: 8px 12px;
                background: linear-gradient(135deg, #16213e 0%, #1a1a2e 100%);
                border-bottom: 1px solid #2d2d44;
            }
            
            .fp-console__title {
                display: flex;
                align-items: center;
                gap: 8px;
                color: #e0e0e0;
                font-weight: 600;
            }
            
            .fp-console__icon {
                font-size: 14px;
            }
            
            .fp-console__status {
                font-size: 10px;
                padding: 2px 8px;
                border-radius: 10px;
                background: #4fc3f7;
                color: #1a1a2e;
                font-weight: 600;
            }
            
            .fp-console__status--complete {
                background: #81c784;
            }
            
            .fp-console__status--error {
                background: #e57373;
            }
            
            .fp-console__controls {
                display: flex;
                gap: 4px;
            }
            
            .fp-console__btn {
                background: transparent;
                border: none;
                color: #888;
                cursor: pointer;
                padding: 4px 8px;
                border-radius: 4px;
                transition: all 0.2s;
                font-size: 12px;
            }
            
            .fp-console__btn:hover {
                background: rgba(255, 255, 255, 0.1);
                color: #fff;
            }
            
            .fp-console__body {
                max-height: 300px;
                overflow-y: auto;
                transition: max-height 0.3s ease;
            }
            
            .fp-console__body--collapsed {
                max-height: 0;
                overflow: hidden;
            }
            
            .fp-console__output {
                padding: 8px 0;
            }
            
            .fp-console__line {
                padding: 2px 12px;
                display: flex;
                align-items: flex-start;
                gap: 8px;
                line-height: 1.5;
                border-left: 2px solid transparent;
            }
            
            .fp-console__line:hover {
                background: rgba(255, 255, 255, 0.03);
            }
            
            .fp-console__line--info { border-left-color: #4fc3f7; }
            .fp-console__line--success { border-left-color: #81c784; }
            .fp-console__line--warning { border-left-color: #ffb74d; }
            .fp-console__line--error { border-left-color: #e57373; }
            .fp-console__line--phase { border-left-color: #ba68c8; }
            .fp-console__line--start { border-left-color: #64b5f6; }
            .fp-console__line--complete { border-left-color: #81c784; }
            .fp-console__line--timeout { border-left-color: #ff8a65; }
            .fp-console__line--skip { border-left-color: #90a4ae; }
            
            .fp-console__time {
                color: #666;
                min-width: 50px;
                flex-shrink: 0;
            }
            
            .fp-console__prefix {
                min-width: 70px;
                flex-shrink: 0;
                font-weight: 600;
            }
            
            .fp-console__msg {
                color: #e0e0e0;
                word-break: break-word;
            }
            
            .fp-console__footer {
                display: flex;
                justify-content: space-between;
                padding: 6px 12px;
                background: #16213e;
                border-top: 1px solid #2d2d44;
                color: #888;
                font-size: 10px;
            }
            
            .fp-console__timer {
                color: #4fc3f7;
                font-weight: 600;
            }
            
            /* Custom scrollbar */
            .fp-console__body::-webkit-scrollbar {
                width: 6px;
            }
            
            .fp-console__body::-webkit-scrollbar-track {
                background: #1a1a2e;
            }
            
            .fp-console__body::-webkit-scrollbar-thumb {
                background: #3d3d5c;
                border-radius: 3px;
            }
            
            .fp-console__body::-webkit-scrollbar-thumb:hover {
                background: #5d5d7c;
            }
        `;
        document.head.appendChild(styleEl);
    }

    /**
     * Bind event listeners
     * @private
     */
    _bindEvents() {
        this.element.querySelector('.fp-console__btn--toggle').addEventListener('click', () => {
            this.toggle();
        });
        
        this.element.querySelector('.fp-console__btn--clear').addEventListener('click', () => {
            this.clear();
        });
    }

    /**
     * Start the elapsed timer
     * @private
     */
    _startTimer() {
        this.timerInterval = setInterval(() => {
            const elapsed = ((Date.now() - this.startTime) / 1000).toFixed(1);
            if (this.timerEl) {
                this.timerEl.textContent = `${elapsed}s`;
            }
        }, 100);
    }

    /**
     * Stop the elapsed timer
     */
    stopTimer() {
        if (this.timerInterval) {
            clearInterval(this.timerInterval);
            this.timerInterval = null;
        }
    }

    /**
     * Escape HTML special characters
     * @private
     */
    _escapeHtml(str) {
        const div = document.createElement('div');
        div.textContent = str;
        return div.innerHTML;
    }

    /**
     * Get formatted timestamp
     * @private
     */
    _getTimestamp() {
        const elapsed = ((Date.now() - this.startTime) / 1000).toFixed(2);
        return `+${elapsed}s`;
    }

    /**
     * Add a log entry
     * @param {string} type - Log type (info, success, warning, error, phase, start, complete, timeout, skip)
     * @param {string} message - Log message
     * @param {Object} details - Additional details
     */
    log(type, message, details = {}) {
        const logType = LOG_TYPES[type] || LOG_TYPES.info;
        const timestamp = this._getTimestamp();
        
        const entry = {
            type,
            message,
            timestamp,
            details,
            time: Date.now()
        };
        
        this.logs.push(entry);
        
        // Trim logs if exceeding max
        while (this.logs.length > this.maxLines) {
            this.logs.shift();
        }
        
        // Create DOM element
        const lineEl = document.createElement('div');
        lineEl.className = `fp-console__line fp-console__line--${type}`;
        lineEl.innerHTML = `
            ${this.showTimestamps ? `<span class="fp-console__time">${timestamp}</span>` : ''}
            <span class="fp-console__prefix" style="color: ${logType.color}">${logType.prefix}</span>
            <span class="fp-console__msg">${this._escapeHtml(message)}</span>
        `;
        
        this.outputEl.appendChild(lineEl);
        
        // Auto-scroll to bottom
        this.outputEl.scrollTop = this.outputEl.scrollHeight;
        
        // Update counter
        this.counterEl.textContent = `${this.logs.length} entries`;
        
        return this;
    }

    /**
     * Log an info message
     */
    info(message, details) {
        return this.log('info', message, details);
    }

    /**
     * Log a success message
     */
    success(message, details) {
        return this.log('success', message, details);
    }

    /**
     * Log a warning message
     */
    warn(message, details) {
        return this.log('warning', message, details);
    }

    /**
     * Log an error message
     */
    error(message, details) {
        return this.log('error', message, details);
    }

    /**
     * Log a phase start
     */
    phaseStart(phase, message) {
        const phaseName = PHASE_NAMES[phase] || phase;
        return this.log('start', message || `Starting: ${phaseName}`, { phase });
    }

    /**
     * Log a phase completion
     */
    phaseComplete(phase, message) {
        const phaseName = PHASE_NAMES[phase] || phase;
        return this.log('complete', message || `Completed: ${phaseName}`, { phase });
    }

    /**
     * Log a phase error
     */
    phaseError(phase, errorMessage) {
        const phaseName = PHASE_NAMES[phase] || phase;
        return this.log('error', `Failed: ${phaseName} - ${errorMessage}`, { phase });
    }

    /**
     * Log a phase timeout
     */
    phaseTimeout(phase, timeoutMs) {
        const phaseName = PHASE_NAMES[phase] || phase;
        return this.log('timeout', `Timeout: ${phaseName} after ${timeoutMs}ms`, { phase });
    }

    /**
     * Log a phase skip
     */
    phaseSkip(phase, reason) {
        const phaseName = PHASE_NAMES[phase] || phase;
        return this.log('skip', `Skipped: ${phaseName}${reason ? ` - ${reason}` : ''}`, { phase });
    }

    /**
     * Handle progress update from analyzer
     * @param {Object} progress - Progress object from BrowserFingerprintAnalyzer
     */
    handleProgress(progress) {
        const { phase, status, message, error } = progress;
        
        switch (status) {
            case 'starting':
                this.phaseStart(phase, message);
                break;
            case 'complete':
                this.phaseComplete(phase, message);
                break;
            case 'error':
                if (error && error.includes('timed out')) {
                    this.phaseTimeout(phase, 3000);
                } else {
                    this.phaseError(phase, error || 'Unknown error');
                }
                break;
            case 'skipped':
                this.phaseSkip(phase, message);
                break;
            default:
                this.info(message || `Phase ${phase}: ${status}`);
        }
        
        return this;
    }

    /**
     * Mark analysis as complete
     */
    complete() {
        this.stopTimer();
        if (this.statusEl) {
            this.statusEl.textContent = 'Complete';
            this.statusEl.classList.add('fp-console__status--complete');
        }
        this.success(`Analysis complete in ${this.timerEl.textContent}`);
        return this;
    }

    /**
     * Mark analysis as failed
     */
    fail(errorMessage) {
        this.stopTimer();
        if (this.statusEl) {
            this.statusEl.textContent = 'Failed';
            this.statusEl.classList.add('fp-console__status--error');
        }
        this.error(`Analysis failed: ${errorMessage}`);
        return this;
    }

    /**
     * Toggle console visibility
     */
    toggle() {
        this.expanded = !this.expanded;
        this.bodyEl.classList.toggle('fp-console__body--collapsed');
        this.toggleBtn.textContent = this.expanded ? '▼' : '▲';
        return this;
    }

    /**
     * Clear all logs
     */
    clear() {
        this.logs = [];
        this.outputEl.innerHTML = '';
        this.counterEl.textContent = '0 entries';
        this.startTime = Date.now();
        return this;
    }

    /**
     * Get all logs as array
     */
    getLogs() {
        return [...this.logs];
    }

    /**
     * Export logs as text
     */
    exportAsText() {
        return this.logs.map(log => 
            `${log.timestamp} ${LOG_TYPES[log.type]?.prefix || '[LOG]'} ${log.message}`
        ).join('\n');
    }

    /**
     * Remove console from DOM
     */
    destroy() {
        this.stopTimer();
        if (this.element && this.element.parentNode) {
            this.element.parentNode.removeChild(this.element);
        }
    }
}

/**
 * Create a fingerprint console and attach to container
 * @param {HTMLElement|string} container - Container element or selector
 * @param {Object} options - Console options
 * @returns {FingerprintConsole}
 */
export function createFingerprintConsole(container, options = {}) {
    const containerEl = typeof container === 'string' 
        ? document.querySelector(container) 
        : container;
    
    if (!containerEl) {
        console.warn('FingerprintConsole: Container not found');
        return null;
    }
    
    return new FingerprintConsole({
        ...options,
        container: containerEl
    });
}

export default FingerprintConsole;
