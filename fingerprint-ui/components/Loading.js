/**
 * Fingerprint UI - Loading Component
 * Enterprise-grade loading state with progress indicator and live stats
 * Following Microsoft Fluent and IBM Carbon design patterns
 */

/**
 * Create loading state component
 * @param {object} options - Loading options
 * @param {string} options.title - Loading title
 * @param {string} options.subtitle - Loading subtitle
 * @param {boolean} options.showProgress - Whether to show progress bar
 * @param {boolean} options.showStats - Whether to show live stats
 * @returns {HTMLElement} Loading element
 */
export function createLoadingState(options = {}) {
    const {
        title = 'Analyzing Browser Fingerprint...',
        subtitle = 'Collecting and processing browser characteristics',
        showProgress = true,
        showStats = false
    } = options;
    
    const container = document.createElement('div');
    container.className = 'fp-loading';
    container.id = 'fp-loading-state';
    container.setAttribute('role', 'status');
    container.setAttribute('aria-live', 'polite');
    container.setAttribute('aria-busy', 'true');
    
    container.innerHTML = `
        <div class="fp-loading__spinner" aria-hidden="true"></div>
        <h3 class="fp-loading__title">${escapeHtml(title)}</h3>
        <p class="fp-loading__text">${escapeHtml(subtitle)}</p>
        ${showProgress ? `
            <div class="fp-loading__progress" role="progressbar" aria-valuenow="0" aria-valuemin="0" aria-valuemax="100">
                <div class="fp-loading__progress-bar" id="fp-progress-bar" style="width: 0%;"></div>
            </div>
            <p class="fp-loading__text" id="fp-progress-text" style="margin-top: var(--fp-space-3, 0.75rem); font-size: var(--fp-font-size-300, 0.8125rem);"></p>
        ` : ''}
        ${showStats ? `
            <div class="fp-loading__stats">
                <div class="fp-loading__stat">
                    <div class="fp-loading__stat-value" id="fp-stat-mouse">0</div>
                    <div class="fp-loading__stat-label">Mouse Moves</div>
                </div>
                <div class="fp-loading__stat">
                    <div class="fp-loading__stat-value" id="fp-stat-clicks">0</div>
                    <div class="fp-loading__stat-label">Clicks</div>
                </div>
                <div class="fp-loading__stat">
                    <div class="fp-loading__stat-value" id="fp-stat-scrolls">0</div>
                    <div class="fp-loading__stat-label">Scrolls</div>
                </div>
            </div>
        ` : ''}
    `;
    
    return container;
}

/**
 * Create behavioral collection loading state
 * @returns {HTMLElement} Loading element
 */
export function createBehavioralLoadingState() {
    return createLoadingState({
        title: 'Collecting Behavioral Data...',
        subtitle: 'Please interact with the page: move your mouse, click anywhere, and scroll if possible.',
        showProgress: true,
        showStats: true
    });
}

/**
 * Update loading progress
 * @param {number} percentage - Progress percentage (0-100)
 * @param {string} text - Progress text
 */
export function updateLoadingProgress(percentage, text) {
    const progressBar = document.getElementById('fp-progress-bar');
    const progressText = document.getElementById('fp-progress-text');
    const progressContainer = progressBar?.parentElement;
    
    const normalizedPercentage = Math.min(100, Math.max(0, percentage));
    
    if (progressBar) {
        progressBar.style.width = `${normalizedPercentage}%`;
    }
    
    if (progressContainer) {
        progressContainer.setAttribute('aria-valuenow', String(Math.round(normalizedPercentage)));
    }
    
    if (progressText && text) {
        progressText.textContent = text;
    }
}

/**
 * Update behavioral stats during collection
 * @param {object} stats - Stats object with mouse, clicks, scrolls
 */
export function updateBehavioralStats(stats) {
    const mouseEl = document.getElementById('fp-stat-mouse');
    const clicksEl = document.getElementById('fp-stat-clicks');
    const scrollsEl = document.getElementById('fp-stat-scrolls');
    
    if (mouseEl) mouseEl.textContent = formatStatNumber(stats.mouseTrailLength || stats.mouse || 0);
    if (clicksEl) clicksEl.textContent = formatStatNumber(stats.clickHistoryLength || stats.clicks || 0);
    if (scrollsEl) scrollsEl.textContent = formatStatNumber(stats.scrollHistoryLength || stats.scrolls || 0);
}

/**
 * Format stat number for display
 * @param {number} num - Number to format
 * @returns {string} Formatted number
 */
function formatStatNumber(num) {
    if (typeof num !== 'number') return '0';
    if (num >= 1000) return (num / 1000).toFixed(1) + 'k';
    return String(num);
}

/**
 * Update loading state content
 * @param {string} title - New title
 * @param {string} subtitle - New subtitle
 */
export function updateLoadingContent(title, subtitle) {
    const container = document.getElementById('fp-loading-state');
    if (!container) return;
    
    const titleEl = container.querySelector('.fp-loading__title');
    const subtitleEl = container.querySelector('.fp-loading__text');
    
    if (titleEl) titleEl.textContent = title;
    if (subtitleEl) subtitleEl.textContent = subtitle;
}

/**
 * Create error state component
 * @param {Error|string} error - Error object or message
 * @returns {HTMLElement} Error element
 */
export function createErrorState(error) {
    const message = error instanceof Error ? error.message : String(error);
    
    const container = document.createElement('div');
    container.className = 'fp-error';
    container.setAttribute('role', 'alert');
    
    container.innerHTML = `
        <div class="fp-error__icon" aria-hidden="true">⚠️</div>
        <h3 class="fp-error__title">Analysis Error</h3>
        <p class="fp-error__message">${escapeHtml(message)}</p>
        <button class="fp-btn fp-btn--primary" onclick="location.reload()" style="margin-top: var(--fp-space-5, 1.25rem);">
            <span aria-hidden="true">↻</span>
            <span>Try Again</span>
        </button>
    `;
    
    return container;
}

/**
 * Escape HTML special characters
 * @param {string} str - String to escape
 * @returns {string} Escaped string
 */
function escapeHtml(str) {
    const div = document.createElement('div');
    div.textContent = str;
    return div.innerHTML;
}
