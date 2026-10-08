/**
 * Fingerprint UI - Detail Modal Component
 * Shows detailed information for metrics when clicked
 */

/**
 * Modal singleton instance
 */
let modalInstance = null;

/**
 * Create and show the detail modal
 * @param {object} options - Modal options
 * @param {string} options.title - Modal title
 * @param {string} options.metricName - The metric name
 * @param {any} options.value - The metric value (summary)
 * @param {any} options.details - Detailed data to display
 * @param {string} options.detailType - Type of detail view ('fonts', 'emoji', 'list', 'json')
 */
export function showDetailModal({ title, metricName, value, details, detailType = 'json' }) {
    // Remove existing modal if present
    hideDetailModal();
    
    // Create modal backdrop
    const backdrop = document.createElement('div');
    backdrop.className = 'fp-modal-backdrop';
    backdrop.addEventListener('click', (e) => {
        if (e.target === backdrop) {
            hideDetailModal();
        }
    });
    
    // Create modal container
    const modal = document.createElement('div');
    modal.className = 'fp-modal';
    modal.setAttribute('role', 'dialog');
    modal.setAttribute('aria-modal', 'true');
    modal.setAttribute('aria-labelledby', 'fp-modal-title');
    
    // Create modal content
    modal.innerHTML = `
        <div class="fp-modal-header">
            <h3 id="fp-modal-title" class="fp-modal-title">${escapeHtml(title)}</h3>
            <button class="fp-modal-close" aria-label="Close modal">&times;</button>
        </div>
        <div class="fp-modal-body">
            <div class="fp-modal-summary">
                <span class="fp-modal-summary-label">Summary:</span>
                <span class="fp-modal-summary-value">${escapeHtml(String(value))}</span>
            </div>
            <div class="fp-modal-details" id="fp-modal-details-content"></div>
        </div>
        <div class="fp-modal-footer">
            <button class="fp-modal-btn fp-modal-btn--secondary" id="fp-modal-copy">📋 Copy Data</button>
            <button class="fp-modal-btn fp-modal-btn--primary" id="fp-modal-close-btn">Close</button>
        </div>
    `;
    
    backdrop.appendChild(modal);
    document.body.appendChild(backdrop);
    
    // Store reference
    modalInstance = backdrop;
    
    // Populate details based on type
    const detailsContainer = modal.querySelector('#fp-modal-details-content');
    renderDetails(detailsContainer, details, detailType);
    
    // Setup event listeners
    modal.querySelector('.fp-modal-close').addEventListener('click', hideDetailModal);
    modal.querySelector('#fp-modal-close-btn').addEventListener('click', hideDetailModal);
    modal.querySelector('#fp-modal-copy').addEventListener('click', () => copyDetailsToClipboard(details));
    
    // Handle escape key
    document.addEventListener('keydown', handleEscapeKey);
    
    // Focus trap
    modal.querySelector('.fp-modal-close').focus();
    
    // Animate in
    requestAnimationFrame(() => {
        backdrop.classList.add('fp-modal-backdrop--visible');
        modal.classList.add('fp-modal--visible');
    });
}

/**
 * Hide and remove the modal
 */
export function hideDetailModal() {
    if (modalInstance) {
        modalInstance.classList.remove('fp-modal-backdrop--visible');
        const modal = modalInstance.querySelector('.fp-modal');
        if (modal) {
            modal.classList.remove('fp-modal--visible');
        }
        setTimeout(() => {
            modalInstance?.remove();
            modalInstance = null;
        }, 200);
    }
    document.removeEventListener('keydown', handleEscapeKey);
}

/**
 * Handle escape key to close modal
 * @param {KeyboardEvent} e 
 */
function handleEscapeKey(e) {
    if (e.key === 'Escape') {
        hideDetailModal();
    }
}

/**
 * Render details based on type
 * @param {HTMLElement} container - Container element
 * @param {any} details - Details data
 * @param {string} detailType - Type of rendering
 */
function renderDetails(container, details, detailType) {
    switch (detailType) {
        case 'fonts':
            renderFontsList(container, details);
            break;
        case 'emoji':
            renderEmojiGrid(container, details);
            break;
        case 'applications':
            renderApplicationsList(container, details);
            break;
        case 'list':
            renderSimpleList(container, details);
            break;
        case 'json':
        default:
            renderJsonView(container, details);
            break;
    }
}

/**
 * Render fonts list with search/filter
 * @param {HTMLElement} container 
 * @param {string[]} fonts 
 */
function renderFontsList(container, fonts) {
    if (!Array.isArray(fonts) || fonts.length === 0) {
        container.innerHTML = '<p class="fp-modal-empty">No fonts detected</p>';
        return;
    }
    
    container.innerHTML = `
        <div class="fp-modal-toolbar">
            <input type="text" class="fp-modal-search" placeholder="Search fonts..." id="fp-font-search">
            <span class="fp-modal-count">${fonts.length} fonts detected</span>
        </div>
        <div class="fp-modal-list fp-modal-list--fonts" id="fp-font-list"></div>
    `;
    
    const listContainer = container.querySelector('#fp-font-list');
    const searchInput = container.querySelector('#fp-font-search');
    
    // Render fonts
    const renderFonts = (filter = '') => {
        const filtered = filter 
            ? fonts.filter(f => f.toLowerCase().includes(filter.toLowerCase()))
            : fonts;
        
        listContainer.innerHTML = filtered.map(font => `
            <div class="fp-modal-font-item" style="font-family: '${escapeHtml(font)}', sans-serif;">
                <span class="fp-modal-font-name">${escapeHtml(font)}</span>
                <span class="fp-modal-font-preview">AaBbCc 123</span>
            </div>
        `).join('');
        
        container.querySelector('.fp-modal-count').textContent = 
            filter ? `${filtered.length} of ${fonts.length} fonts` : `${fonts.length} fonts detected`;
    };
    
    renderFonts();
    
    searchInput.addEventListener('input', (e) => {
        renderFonts(e.target.value);
    });
}

/**
 * Render emoji measurements in a grid
 * @param {HTMLElement} container 
 * @param {object} emojiData 
 */
function renderEmojiGrid(container, emojiData) {
    if (!emojiData || !emojiData.measurements) {
        container.innerHTML = '<p class="fp-modal-empty">No emoji data available</p>';
        return;
    }
    
    const { measurements, runningHash, avgFilledPixels } = emojiData;
    
    container.innerHTML = `
        <div class="fp-modal-stats">
            <div class="fp-modal-stat">
                <span class="fp-modal-stat-label">Total Emojis</span>
                <span class="fp-modal-stat-value">${measurements.length}</span>
            </div>
            <div class="fp-modal-stat">
                <span class="fp-modal-stat-label">Running Hash</span>
                <span class="fp-modal-stat-value fp-mono">${runningHash || 'N/A'}</span>
            </div>
            <div class="fp-modal-stat">
                <span class="fp-modal-stat-label">Avg Filled Pixels</span>
                <span class="fp-modal-stat-value">${avgFilledPixels || 'N/A'}</span>
            </div>
        </div>
        <div class="fp-modal-emoji-grid" id="fp-emoji-grid"></div>
    `;
    
    const grid = container.querySelector('#fp-emoji-grid');
    
    grid.innerHTML = measurements.map(m => `
        <div class="fp-modal-emoji-item" title="Width: ${m.width}, Filled: ${m.filledPixels}px">
            <span class="fp-modal-emoji-char">${m.emoji}</span>
            <span class="fp-modal-emoji-info">${m.filledPixels}px</span>
        </div>
    `).join('');
}

/**
 * Render applications list with confidence
 * @param {HTMLElement} container 
 * @param {object[]} apps 
 */
function renderApplicationsList(container, apps) {
    if (!Array.isArray(apps) || apps.length === 0) {
        container.innerHTML = '<p class="fp-modal-empty">No applications detected</p>';
        return;
    }
    
    container.innerHTML = `
        <div class="fp-modal-count">${apps.length} applications detected</div>
        <div class="fp-modal-list fp-modal-list--apps"></div>
    `;
    
    const list = container.querySelector('.fp-modal-list--apps');
    
    list.innerHTML = apps.map(app => `
        <div class="fp-modal-app-item">
            <div class="fp-modal-app-header">
                <span class="fp-modal-app-name">${escapeHtml(app.name)}</span>
                <span class="fp-modal-app-confidence">${app.confidence}% confidence</span>
            </div>
            <div class="fp-modal-app-fonts">
                Matched fonts: ${app.matchedFonts?.map(f => `<code>${escapeHtml(f)}</code>`).join(', ') || 'None'}
            </div>
        </div>
    `).join('');
}

/**
 * Render a simple list
 * @param {HTMLElement} container 
 * @param {string[]} items 
 */
function renderSimpleList(container, items) {
    if (!Array.isArray(items) || items.length === 0) {
        container.innerHTML = '<p class="fp-modal-empty">No items</p>';
        return;
    }
    
    container.innerHTML = `
        <div class="fp-modal-count">${items.length} items</div>
        <ul class="fp-modal-simple-list">
            ${items.map(item => `<li>${escapeHtml(String(item))}</li>`).join('')}
        </ul>
    `;
}

/**
 * Render JSON view with syntax highlighting
 * @param {HTMLElement} container 
 * @param {any} data 
 */
function renderJsonView(container, data) {
    const jsonStr = JSON.stringify(data, null, 2);
    
    container.innerHTML = `
        <pre class="fp-modal-json"><code>${escapeHtml(jsonStr)}</code></pre>
    `;
}

/**
 * Copy details to clipboard
 * @param {any} details 
 */
async function copyDetailsToClipboard(details) {
    try {
        const text = typeof details === 'string' 
            ? details 
            : JSON.stringify(details, null, 2);
        
        await navigator.clipboard.writeText(text);
        
        // Show feedback
        const btn = document.querySelector('#fp-modal-copy');
        if (btn) {
            const originalText = btn.textContent;
            btn.textContent = '✓ Copied!';
            btn.classList.add('fp-modal-btn--success');
            setTimeout(() => {
                btn.textContent = originalText;
                btn.classList.remove('fp-modal-btn--success');
            }, 2000);
        }
    } catch (err) {
        console.error('Failed to copy:', err);
    }
}

/**
 * Escape HTML special characters
 * @param {string} str 
 * @returns {string}
 */
function escapeHtml(str) {
    const div = document.createElement('div');
    div.textContent = str;
    return div.innerHTML;
}
