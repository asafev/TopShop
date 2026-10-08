/**
 * Fingerprint UI - Search Bar Component
 * Enterprise-grade search functionality with real-time filtering
 */

/**
 * Create a search bar component with advanced filtering
 * @param {Function} onSearch - Search callback function(query, filters)
 * @param {object} options - Configuration options
 * @returns {HTMLElement} Search bar element
 */
export function createSearchBar(onSearch, options = {}) {
    const searchBar = document.createElement('div');
    searchBar.className = 'fp-search-bar premium-search-bar';
    searchBar.setAttribute('role', 'search');
    
    const {
        placeholder = 'Search metrics by name, value, description, or category...',
        showAdvancedFilters = true,
        showQuickFilters = true
    } = options;
    
    searchBar.innerHTML = `
        <div class="fp-search-bar__main premium-search-main">
            <div class="fp-search-bar__input-wrapper premium-search-input-wrapper">
                <svg class="fp-search-bar__icon premium-search-icon" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                    <circle cx="11" cy="11" r="8"></circle>
                    <path d="m21 21-4.35-4.35"></path>
                </svg>
                <input 
                    type="text" 
                    class="fp-search-bar__input premium-search-input" 
                    id="fp-search-input"
                    placeholder="${placeholder}"
                    autocomplete="off"
                    spellcheck="false"
                    aria-label="Search metrics"
                />
                <button 
                    class="fp-search-bar__clear premium-search-clear" 
                    id="fp-search-clear"
                    aria-label="Clear search"
                    style="display: none;"
                >
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                        <line x1="18" y1="6" x2="6" y2="18"></line>
                        <line x1="6" y1="6" x2="18" y2="18"></line>
                    </svg>
                </button>
            </div>
            <div class="fp-search-bar__actions premium-search-actions">
                <button class="fp-search-bar__toggle premium-search-toggle" id="fp-search-advanced-toggle" aria-label="Toggle advanced filters">
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                        <polygon points="22 3 2 3 10 12.46 10 19 14 21 14 12.46 22 3"></polygon>
                    </svg>
                    <span>Filters</span>
                </button>
            </div>
        </div>
        ${showQuickFilters ? `
        <div class="fp-search-bar__quick-filters premium-quick-filters" id="fp-quick-filters">
            <div class="fp-search-bar__quick-filters-label premium-quick-filters-label">Quick Filters:</div>
            <div class="fp-search-bar__filter-chips premium-filter-chips">
                <button class="fp-filter-chip premium-filter-chip" data-filter="risk:high" aria-label="Filter high risk metrics">
                    <span class="fp-filter-chip__icon premium-filter-chip-icon">
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/></svg>
                    </span>
                    <span>High Risk</span>
                </button>
                <button class="fp-filter-chip premium-filter-chip" data-filter="risk:medium" aria-label="Filter medium risk metrics">
                    <span class="fp-filter-chip__icon premium-filter-chip-icon">
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>
                    </span>
                    <span>Medium Risk</span>
                </button>
                <button class="fp-filter-chip premium-filter-chip" data-filter="risk:low" aria-label="Filter low risk metrics">
                    <span class="fp-filter-chip__icon premium-filter-chip-icon">
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><path d="M12 16v-4M12 8h.01"/></svg>
                    </span>
                    <span>Low Risk</span>
                </button>
                <button class="fp-filter-chip premium-filter-chip" data-filter="category:automation" aria-label="Filter automation metrics">
                    <span class="fp-filter-chip__icon premium-filter-chip-icon">
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="11" width="18" height="11" rx="2" ry="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/></svg>
                    </span>
                    <span>Automation</span>
                </button>
                <button class="fp-filter-chip premium-filter-chip" data-filter="category:security" aria-label="Filter security metrics">
                    <span class="fp-filter-chip__icon premium-filter-chip-icon">
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/></svg>
                    </span>
                    <span>Security</span>
                </button>
            </div>
        </div>
        ` : ''}
        ${showAdvancedFilters ? `
        <div class="fp-search-bar__advanced premium-search-advanced" id="fp-search-advanced" style="display: none;">
            <div class="fp-search-bar__advanced-content premium-search-advanced-content">
                <div class="fp-search-bar__filter-group premium-filter-group">
                    <label class="fp-search-bar__filter-label premium-filter-label">Search In:</label>
                    <div class="fp-search-bar__checkbox-group premium-checkbox-group">
                        <label class="fp-checkbox-label premium-checkbox-label">
                            <input type="checkbox" class="fp-checkbox premium-checkbox" data-search-field="name" checked>
                            <span>Metric Names</span>
                        </label>
                        <label class="fp-checkbox-label premium-checkbox-label">
                            <input type="checkbox" class="fp-checkbox premium-checkbox" data-search-field="value" checked>
                            <span>Values</span>
                        </label>
                        <label class="fp-checkbox-label premium-checkbox-label">
                            <input type="checkbox" class="fp-checkbox premium-checkbox" data-search-field="description" checked>
                            <span>Descriptions</span>
                        </label>
                        <label class="fp-checkbox-label premium-checkbox-label">
                            <input type="checkbox" class="fp-checkbox premium-checkbox" data-search-field="category" checked>
                            <span>Categories</span>
                        </label>
                    </div>
                </div>
                <div class="fp-search-bar__filter-group premium-filter-group">
                    <label class="fp-search-bar__filter-label premium-filter-label">Risk Level:</label>
                    <div class="fp-search-bar__checkbox-group premium-checkbox-group">
                        <label class="fp-checkbox-label premium-checkbox-label">
                            <input type="checkbox" class="fp-checkbox premium-checkbox" data-filter-risk="high" checked>
                            <span>High</span>
                        </label>
                        <label class="fp-checkbox-label premium-checkbox-label">
                            <input type="checkbox" class="fp-checkbox premium-checkbox" data-filter-risk="medium" checked>
                            <span>Medium</span>
                        </label>
                        <label class="fp-checkbox-label premium-checkbox-label">
                            <input type="checkbox" class="fp-checkbox premium-checkbox" data-filter-risk="low" checked>
                            <span>Low</span>
                        </label>
                        <label class="fp-checkbox-label premium-checkbox-label">
                            <input type="checkbox" class="fp-checkbox premium-checkbox" data-filter-risk="none" checked>
                            <span>N/A</span>
                        </label>
                    </div>
                </div>
            </div>
        </div>
        ` : ''}
        <div class="fp-search-bar__results-info premium-results-info" id="fp-search-results-info" style="display: none;">
            <span class="fp-search-bar__results-count premium-results-count" id="fp-search-results-count">0</span>
            <span>results found</span>
        </div>
    `;
    
    // State
    let searchState = {
        query: '',
        searchFields: ['name', 'value', 'description', 'category'],
        riskFilters: ['high', 'medium', 'low', 'none'],
        activeQuickFilters: []
    };
    
    // Get elements
    const input = searchBar.querySelector('#fp-search-input');
    const clearBtn = searchBar.querySelector('#fp-search-clear');
    const advancedToggle = searchBar.querySelector('#fp-search-advanced-toggle');
    const advancedPanel = searchBar.querySelector('#fp-search-advanced');
    const resultsInfo = searchBar.querySelector('#fp-search-results-info');
    const resultsCount = searchBar.querySelector('#fp-search-results-count');
    
    // Debounce search
    let searchTimeout;
    const performSearch = () => {
        clearTimeout(searchTimeout);
        searchTimeout = setTimeout(() => {
            if (onSearch) {
                const result = onSearch(searchState);
                if (result && typeof result === 'object' && 'count' in result) {
                    updateResultsInfo(result.count);
                }
            }
        }, 150);
    };
    
    // Update results info
    const updateResultsInfo = (count) => {
        if (count !== undefined) {
            resultsCount.textContent = count.toLocaleString();
            resultsInfo.style.display = searchState.query || searchState.activeQuickFilters.length > 0 ? 'flex' : 'none';
        }
    };
    
    // Input handler
    input.addEventListener('input', (e) => {
        searchState.query = e.target.value.trim();
        clearBtn.style.display = searchState.query ? 'flex' : 'none';
        performSearch();
    });
    
    // Clear button
    clearBtn.addEventListener('click', () => {
        input.value = '';
        searchState.query = '';
        clearBtn.style.display = 'none';
        performSearch();
    });
    
    // Advanced toggle
    if (advancedToggle && advancedPanel) {
        advancedToggle.addEventListener('click', () => {
            const isVisible = advancedPanel.style.display !== 'none';
            advancedPanel.style.display = isVisible ? 'none' : 'block';
            advancedToggle.classList.toggle('fp-search-bar__toggle--active', !isVisible);
            advancedToggle.classList.toggle('premium-search-toggle--active', !isVisible);
        });
    }
    
    // Search field checkboxes
    searchBar.querySelectorAll('[data-search-field]').forEach(checkbox => {
        checkbox.addEventListener('change', (e) => {
            const field = e.target.dataset.searchField;
            if (e.target.checked) {
                if (!searchState.searchFields.includes(field)) {
                    searchState.searchFields.push(field);
                }
            } else {
                searchState.searchFields = searchState.searchFields.filter(f => f !== field);
            }
            performSearch();
        });
    });
    
    // Risk filter checkboxes
    searchBar.querySelectorAll('[data-filter-risk]').forEach(checkbox => {
        checkbox.addEventListener('change', (e) => {
            const risk = e.target.dataset.filterRisk;
            if (e.target.checked) {
                if (!searchState.riskFilters.includes(risk)) {
                    searchState.riskFilters.push(risk);
                }
            } else {
                searchState.riskFilters = searchState.riskFilters.filter(r => r !== risk);
            }
            performSearch();
        });
    });
    
    // Quick filter chips
    searchBar.querySelectorAll('.fp-filter-chip').forEach(chip => {
        chip.addEventListener('click', () => {
            const filter = chip.dataset.filter;
            const isActive = chip.classList.contains('fp-filter-chip--active');
            
            if (isActive) {
                chip.classList.remove('fp-filter-chip--active');
                searchState.activeQuickFilters = searchState.activeQuickFilters.filter(f => f !== filter);
            } else {
                chip.classList.add('fp-filter-chip--active');
                if (!searchState.activeQuickFilters.includes(filter)) {
                    searchState.activeQuickFilters.push(filter);
                }
            }
            performSearch();
        });
    });
    
    // Keyboard shortcuts
    input.addEventListener('keydown', (e) => {
        if (e.key === 'Escape') {
            input.value = '';
            searchState.query = '';
            clearBtn.style.display = 'none';
            performSearch();
        } else if (e.key === 'Enter') {
            e.preventDefault();
            performSearch();
        }
    });
    
    // Focus management
    input.addEventListener('focus', () => {
        searchBar.classList.add('fp-search-bar--focused');
    });
    
    input.addEventListener('blur', () => {
        searchBar.classList.remove('fp-search-bar--focused');
    });
    
    // Expose search state getter
    searchBar.getSearchState = () => ({ ...searchState });
    
    // Expose clear method
    searchBar.clear = () => {
        input.value = '';
        searchState.query = '';
        searchState.activeQuickFilters = [];
        clearBtn.style.display = 'none';
        searchBar.querySelectorAll('.fp-filter-chip').forEach(chip => {
            chip.classList.remove('fp-filter-chip--active');
        });
        performSearch();
    };
    
    return searchBar;
}

/**
 * Create a search filter function
 * @param {object} searchState - Current search state
 * @param {object} allMetrics - All metrics data
 * @returns {Function} Filter function
 */
export function createSearchFilter(searchState, allMetrics) {
    return (categoryKey, metricName, metricData) => {
        // Quick filters
        for (const quickFilter of searchState.activeQuickFilters) {
            const [type, value] = quickFilter.split(':');
            if (type === 'risk') {
                const risk = (metricData?.risk || 'N/A').toLowerCase();
                if (risk !== value.toLowerCase()) {
                    return false;
                }
            } else if (type === 'category') {
                if (categoryKey !== value) {
                    return false;
                }
            }
        }
        
        // Risk level filter
        if (searchState.riskFilters && searchState.riskFilters.length > 0) {
            const risk = (metricData?.risk || 'N/A').toLowerCase();
            if (!searchState.riskFilters.includes(risk) && !searchState.riskFilters.includes('none')) {
                return false;
            }
        }
        
        // Text search
        if (!searchState.query || !searchState.searchFields || searchState.searchFields.length === 0) {
            return true;
        }
        
        const query = searchState.query.toLowerCase();
        const value = metricData?.value !== undefined ? metricData.value : metricData;
        const description = metricData?.description || '';
        
        const searchableText = {
            name: metricName.toLowerCase(),
            value: String(value).toLowerCase(),
            description: description.toLowerCase(),
            category: categoryKey.toLowerCase()
        };
        
        // Check if query matches any enabled search field
        for (const field of searchState.searchFields) {
            if (searchableText[field] && searchableText[field].includes(query)) {
                return true;
            }
        }
        
        return false;
    };
}

