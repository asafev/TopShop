/**
 * Fingerprint UI - Metrics Customizer Component
 * Enterprise-grade metrics visibility and display customization
 */

/**
 * Create a metrics customizer panel
 * @param {object} allMetrics - All metrics data
 * @param {Function} onChange - Change callback function(state)
 * @param {object} options - Configuration options
 * @returns {HTMLElement} Customizer panel element
 */
export function createMetricsCustomizer(allMetrics, onChange, options = {}) {
    const customizer = document.createElement('div');
    customizer.className = 'fp-metrics-customizer';
    customizer.setAttribute('role', 'complementary');
    customizer.setAttribute('aria-label', 'Metrics display customization');
    
    const {
        defaultVisibleCategories = null, // null = all visible
        defaultVisibleColumns = ['key', 'name', 'value', 'description', 'code', 'risk'],
        showColumnToggles = true,
        showCategoryToggles = true,
        showMetricToggles = false // Can be slow with hundreds of metrics
    } = options;
    
    // Initialize state
    const state = {
        visibleCategories: defaultVisibleCategories || Object.keys(allMetrics || {}),
        visibleColumns: [...defaultVisibleColumns],
        visibleMetrics: {}, // category -> Set of metric names
        collapsedCategories: new Set()
    };
    
    // Build category list
    const categories = Object.keys(allMetrics || {});
    
    customizer.innerHTML = `
        <div class="fp-metrics-customizer__header">
            <h3 class="fp-metrics-customizer__title">
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                    <path d="M12 20h9"></path>
                    <path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z"></path>
                </svg>
                <span>Display Options</span>
            </h3>
            <button class="fp-metrics-customizer__close" id="fp-customizer-close" aria-label="Close customizer">
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                    <line x1="18" y1="6" x2="6" y2="18"></line>
                    <line x1="6" y1="6" x2="18" y2="18"></line>
                </svg>
            </button>
        </div>
        <div class="fp-metrics-customizer__content">
            ${showColumnToggles ? `
            <div class="fp-metrics-customizer__section">
                <h4 class="fp-metrics-customizer__section-title">Table Columns</h4>
                <div class="fp-metrics-customizer__checkbox-group">
                    <label class="fp-checkbox-label">
                        <input type="checkbox" class="fp-checkbox" data-column="key" ${defaultVisibleColumns.includes('key') ? 'checked' : ''}>
                        <span>Property Key</span>
                    </label>
                    <label class="fp-checkbox-label">
                        <input type="checkbox" class="fp-checkbox" data-column="name" ${defaultVisibleColumns.includes('name') ? 'checked' : ''}>
                        <span>Metric Name</span>
                    </label>
                    <label class="fp-checkbox-label">
                        <input type="checkbox" class="fp-checkbox" data-column="value" ${defaultVisibleColumns.includes('value') ? 'checked' : ''}>
                        <span>Value</span>
                    </label>
                    <label class="fp-checkbox-label">
                        <input type="checkbox" class="fp-checkbox" data-column="description" ${defaultVisibleColumns.includes('description') ? 'checked' : ''}>
                        <span>Description</span>
                    </label>
                    <label class="fp-checkbox-label">
                        <input type="checkbox" class="fp-checkbox" data-column="code" ${defaultVisibleColumns.includes('code') ? 'checked' : ''}>
                        <span>API Reference</span>
                    </label>
                    <label class="fp-checkbox-label">
                        <input type="checkbox" class="fp-checkbox" data-column="risk" ${defaultVisibleColumns.includes('risk') ? 'checked' : ''}>
                        <span>Risk Level</span>
                    </label>
                </div>
            </div>
            ` : ''}
            ${showCategoryToggles ? `
            <div class="fp-metrics-customizer__section">
                <div class="fp-metrics-customizer__section-header">
                    <h4 class="fp-metrics-customizer__section-title">Categories</h4>
                    <div class="fp-metrics-customizer__actions">
                        <button class="fp-btn fp-btn--secondary fp-btn--sm" id="fp-show-all-categories" aria-label="Show all categories">
                            Show All
                        </button>
                        <button class="fp-btn fp-btn--secondary fp-btn--sm" id="fp-hide-all-categories" aria-label="Hide all categories">
                            Hide All
                        </button>
                    </div>
                </div>
                <div class="fp-metrics-customizer__categories" id="fp-customizer-categories">
                    ${categories.map(categoryKey => {
                        const metricCount = Object.keys(allMetrics[categoryKey] || {}).length;
                        return `
                            <div class="fp-metrics-customizer__category" data-category="${categoryKey}">
                                <label class="fp-checkbox-label fp-checkbox-label--category">
                                    <input type="checkbox" class="fp-checkbox" data-category-toggle="${categoryKey}" checked>
                                    <span class="fp-checkbox-label__text">
                                        <span class="fp-checkbox-label__name">${formatCategoryName(categoryKey)}</span>
                                        <span class="fp-checkbox-label__count">${metricCount} metrics</span>
                                    </span>
                                </label>
                            </div>
                        `;
                    }).join('')}
                </div>
            </div>
            ` : ''}
            <div class="fp-metrics-customizer__section">
                <h4 class="fp-metrics-customizer__section-title">Actions</h4>
                <div class="fp-metrics-customizer__actions-group">
                    <button class="fp-btn fp-btn--outline" id="fp-reset-customization" aria-label="Reset to defaults">
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                            <polyline points="1 4 1 10 7 10"></polyline>
                            <path d="M3.51 15a9 9 0 1 0 2.13-9.36L1 10"></path>
                        </svg>
                        <span>Reset to Defaults</span>
                    </button>
                    <button class="fp-btn fp-btn--outline" id="fp-save-customization" aria-label="Save preferences">
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                            <path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2z"></path>
                            <polyline points="17 21 17 13 7 13 7 21"></polyline>
                            <polyline points="7 3 7 8 15 8"></polyline>
                        </svg>
                        <span>Save Preferences</span>
                    </button>
                    <button class="fp-btn fp-btn--outline" id="fp-load-customization" aria-label="Load preferences">
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                            <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path>
                            <polyline points="7 10 12 15 17 10"></polyline>
                            <line x1="12" y1="15" x2="12" y2="3"></line>
                        </svg>
                        <span>Load Preferences</span>
                    </button>
                </div>
            </div>
        </div>
    `;
    
    // Column toggles
    if (showColumnToggles) {
        customizer.querySelectorAll('[data-column]').forEach(checkbox => {
            checkbox.addEventListener('change', (e) => {
                const column = e.target.dataset.column;
                if (e.target.checked) {
                    if (!state.visibleColumns.includes(column)) {
                        state.visibleColumns.push(column);
                    }
                } else {
                    state.visibleColumns = state.visibleColumns.filter(c => c !== column);
                }
                notifyChange();
            });
        });
    }
    
    // Category toggles
    if (showCategoryToggles) {
        customizer.querySelectorAll('[data-category-toggle]').forEach(checkbox => {
            checkbox.addEventListener('change', (e) => {
                const category = e.target.dataset.categoryToggle;
                if (e.target.checked) {
                    if (!state.visibleCategories.includes(category)) {
                        state.visibleCategories.push(category);
                    }
                } else {
                    state.visibleCategories = state.visibleCategories.filter(c => c !== category);
                }
                notifyChange();
            });
        });
    }
    
    // Show all categories
    const showAllBtn = customizer.querySelector('#fp-show-all-categories');
    if (showAllBtn) {
        showAllBtn.addEventListener('click', () => {
            state.visibleCategories = [...categories];
            customizer.querySelectorAll('[data-category-toggle]').forEach(checkbox => {
                checkbox.checked = true;
            });
            notifyChange();
        });
    }
    
    // Hide all categories
    const hideAllBtn = customizer.querySelector('#fp-hide-all-categories');
    if (hideAllBtn) {
        hideAllBtn.addEventListener('click', () => {
            state.visibleCategories = [];
            customizer.querySelectorAll('[data-category-toggle]').forEach(checkbox => {
                checkbox.checked = false;
            });
            notifyChange();
        });
    }
    
    // Reset
    const resetBtn = customizer.querySelector('#fp-reset-customization');
    if (resetBtn) {
        resetBtn.addEventListener('click', () => {
            state.visibleCategories = [...categories];
            state.visibleColumns = [...defaultVisibleColumns];
            state.visibleMetrics = {};
            
            // Update checkboxes
            customizer.querySelectorAll('[data-category-toggle]').forEach(checkbox => {
                checkbox.checked = true;
            });
            customizer.querySelectorAll('[data-column]').forEach(checkbox => {
                checkbox.checked = defaultVisibleColumns.includes(checkbox.dataset.column);
            });
            
            notifyChange();
        });
    }
    
    // Save preferences
    const saveBtn = customizer.querySelector('#fp-save-customization');
    if (saveBtn) {
        saveBtn.addEventListener('click', () => {
            try {
                const preferences = {
                    visibleCategories: state.visibleCategories,
                    visibleColumns: state.visibleColumns,
                    visibleMetrics: Object.fromEntries(
                        Object.entries(state.visibleMetrics).map(([cat, set]) => [cat, Array.from(set)])
                    ),
                    version: '1.0',
                    timestamp: Date.now()
                };
                localStorage.setItem('fp-metrics-preferences', JSON.stringify(preferences));
                
                // Show success feedback
                const originalText = saveBtn.innerHTML;
                saveBtn.innerHTML = '<span>✓ Saved</span>';
                saveBtn.style.color = 'var(--fp-status-success)';
                setTimeout(() => {
                    saveBtn.innerHTML = originalText;
                    saveBtn.style.color = '';
                }, 2000);
            } catch (error) {
                console.error('Failed to save preferences:', error);
                alert('Failed to save preferences. Please check browser storage permissions.');
            }
        });
    }
    
    // Load preferences
    const loadBtn = customizer.querySelector('#fp-load-customization');
    if (loadBtn) {
        loadBtn.addEventListener('click', () => {
            try {
                const stored = localStorage.getItem('fp-metrics-preferences');
                if (!stored) {
                    alert('No saved preferences found.');
                    return;
                }
                
                const preferences = JSON.parse(stored);
                state.visibleCategories = preferences.visibleCategories || [...categories];
                state.visibleColumns = preferences.visibleColumns || [...defaultVisibleColumns];
                state.visibleMetrics = preferences.visibleMetrics ? 
                    Object.fromEntries(
                        Object.entries(preferences.visibleMetrics).map(([cat, arr]) => [cat, new Set(arr)])
                    ) : {};
                
                // Update checkboxes
                customizer.querySelectorAll('[data-category-toggle]').forEach(checkbox => {
                    const category = checkbox.dataset.categoryToggle;
                    checkbox.checked = state.visibleCategories.includes(category);
                });
                customizer.querySelectorAll('[data-column]').forEach(checkbox => {
                    const column = checkbox.dataset.column;
                    checkbox.checked = state.visibleColumns.includes(column);
                });
                
                notifyChange();
                
                // Show success feedback
                const originalText = loadBtn.innerHTML;
                loadBtn.innerHTML = '<span>✓ Loaded</span>';
                loadBtn.style.color = 'var(--fp-status-success)';
                setTimeout(() => {
                    loadBtn.innerHTML = originalText;
                    loadBtn.style.color = '';
                }, 2000);
            } catch (error) {
                console.error('Failed to load preferences:', error);
                alert('Failed to load preferences. The stored data may be corrupted.');
            }
        });
    }
    
    // Close button
    const closeBtn = customizer.querySelector('#fp-customizer-close');
    if (closeBtn) {
        closeBtn.addEventListener('click', () => {
            customizer.hide();
        });
    }
    
    // Create backdrop
    const backdrop = document.createElement('div');
    backdrop.className = 'fp-metrics-customizer-backdrop';
    backdrop.style.cssText = `
        position: fixed;
        top: 0;
        left: 0;
        width: 100%;
        height: 100%;
        background: rgba(0, 0, 0, 0.3);
        backdrop-filter: blur(2px);
        z-index: 9999;
        opacity: 0;
        pointer-events: none;
        transition: opacity var(--fp-duration-normal, 200ms) var(--fp-easing-standard, ease);
    `;
    backdrop.addEventListener('click', () => {
        customizer.hide();
    });
    document.body.appendChild(backdrop);
    
    // Store backdrop reference
    customizer.backdrop = backdrop;
    
    // Notify change
    function notifyChange() {
        if (onChange) {
            onChange({ ...state });
        }
    }
    
    // Expose state getter
    customizer.getState = () => ({ ...state });
    
    // Expose show/hide methods
    customizer.show = () => {
        customizer.classList.add('fp-metrics-customizer--visible');
        if (backdrop) {
            backdrop.style.opacity = '1';
            backdrop.style.pointerEvents = 'auto';
        }
    };
    
    customizer.hide = () => {
        customizer.classList.remove('fp-metrics-customizer--visible');
        if (backdrop) {
            backdrop.style.opacity = '0';
            backdrop.style.pointerEvents = 'none';
        }
    };
    
    customizer.toggle = () => {
        if (customizer.classList.contains('fp-metrics-customizer--visible')) {
            customizer.hide();
        } else {
            customizer.show();
        }
    };
    
    return customizer;
}

/**
 * Format category name for display
 * @param {string} categoryKey - Category key
 * @returns {string} Formatted name
 */
function formatCategoryName(categoryKey) {
    return categoryKey
        .replace(/([A-Z])/g, ' $1')
        .replace(/^./, str => str.toUpperCase())
        .trim();
}

