/**
 * Fingerprint UI - Main Renderer
 * Orchestrates the rendering of all fingerprint analysis UI components
 */

import { 
    createSection, 
    createSectionManager,
    createMetricsTable,
    setRawResults,
    createSummaryCards,
    createSuspiciousIndicatorsSection,
    createBehavioralIndicatorsSection,
    createFakeDevicesSection,
    createKnownAgentsSection,
    updateKnownAgentsSection,
    createExportBar,
    exportFingerprintData,
    createDiffToggleBar,
    createDiffSection,
    createDiffOverviewCard,
    createNoDifferencesState,
    updateDiffSummary,
    createSearchBar,
    createSearchFilter,
    createMetricsCustomizer,
    createCategorySidebar
} from './components/index.js';

import { sortCategories } from './utils/helpers.js';
import { BaselineComparator } from './utils/BaselineComparator.js';
import { TELEMETRY_DESCRIPTIONS } from './config/constants.js';

/**
 * Main UI Renderer class
 * Manages the rendering of the fingerprint analysis page
 */
export class FingerprintUIRenderer {
    constructor(container, options = {}) {
        this.container = container;
        this.sectionManager = createSectionManager();
        this.fingerprintData = null;
        this.diffMode = options.diffModeDefault || false;
        this.baselineComparator = null;
        this.comparisonResult = null;
        this.baselinePath = options.baselinePath || './fp_base/browser-fingerprint-chrome-trivial.json';
        
        // Store references for re-rendering
        this.sectionsContainer = null;
        this.diffToggleBar = null;
        this.diffOverviewCard = null;
        this.searchBar = null;
        this.metricsCustomizer = null;
        this.categorySidebar = null;
        
        // Search and customization state
        this.searchState = null;
        this.customizationState = {
            visibleCategories: null, // null = all visible
            visibleColumns: ['key', 'name', 'value', 'description', 'code', 'risk'],
            visibleMetrics: {}
        };
        
        // Store all metrics for search/filtering
        this.allMetrics = null;
        
        // Load saved preferences on initialization
        this.loadSavedPreferences();
    }
    
    /**
     * Load saved preferences from localStorage
     */
    loadSavedPreferences() {
        try {
            const stored = localStorage.getItem('fp-metrics-preferences');
            if (stored) {
                const preferences = JSON.parse(stored);
                if (preferences.visibleCategories) {
                    this.customizationState.visibleCategories = preferences.visibleCategories;
                }
                if (preferences.visibleColumns) {
                    this.customizationState.visibleColumns = preferences.visibleColumns;
                }
                if (preferences.visibleMetrics) {
                    this.customizationState.visibleMetrics = Object.fromEntries(
                        Object.entries(preferences.visibleMetrics).map(([cat, arr]) => [cat, new Set(arr)])
                    );
                }
                console.log('✅ Loaded saved preferences:', preferences);
            }
        } catch (error) {
            console.warn('⚠️ Failed to load saved preferences:', error);
        }
    }
    
    /**
     * Initialize baseline comparator
     * @returns {Promise<boolean>} True if baseline loaded successfully
     */
    async initBaseline() {
        try {
            this.baselineComparator = new BaselineComparator();
            const loaded = await this.baselineComparator.loadBaseline(this.baselinePath);
            if (loaded) {
                console.log('✅ Baseline comparator initialized');
            }
            return loaded;
        } catch (error) {
            console.warn('⚠️ Failed to initialize baseline comparator:', error);
            return false;
        }
    }
    
    /**
     * Render the complete fingerprint analysis UI
     * @param {object} data - Fingerprint analysis data
     */
    async render(data) {
        this.fingerprintData = data;
        this.container.innerHTML = '';
        
        console.log('🎨 Rendering fingerprint UI, diffMode:', this.diffMode);
        
        // Set raw results for detail drill-downs
        if (data.rawResults) {
            setRawResults(data.rawResults);
        }
        
        // Initialize baseline comparator if not already done
        if (!this.baselineComparator) {
            console.log('📥 Initializing baseline comparator...');
            await this.initBaseline();
        }
        
        // Perform comparison if baseline is available
        if (this.baselineComparator?.isLoaded()) {
            try {
                this.comparisonResult = this.baselineComparator.compare(data);
                console.log('📊 Comparison result:', this.comparisonResult.summary);
            } catch (error) {
                console.warn('⚠️ Comparison failed:', error);
                this.comparisonResult = null;
            }
        } else {
            console.warn('⚠️ Baseline not loaded, comparison not available');
        }
        
        try {
            // Store all metrics for search/filtering
            this.allMetrics = data.metrics || {};
            
            // Render header
            this.container.appendChild(this.createHeader());
            
            // Render summary cards
            if (false) {
                this.container.appendChild(createSummaryCards(data.summary));
            }
            
            // Render search bar (not in diff mode)
            if (!this.diffMode) {
                this.searchBar = this.createSearchBar();
                this.container.appendChild(this.searchBar);
            }
            
            // Render metrics customizer button and panel
            if (!this.diffMode) {
                this.metricsCustomizer = this.createMetricsCustomizer();
                document.body.appendChild(this.metricsCustomizer);
                
                // Add customizer toggle button to export bar area
                const customizerToggle = document.createElement('button');
                customizerToggle.className = 'fp-btn fp-btn--secondary';
                customizerToggle.id = 'fp-customizer-toggle';
                customizerToggle.innerHTML = `
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                        <path d="M12 20h9"></path>
                        <path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z"></path>
                    </svg>
                    <span>Customize Display</span>
                `;
                customizerToggle.addEventListener('click', () => {
                    this.metricsCustomizer.toggle();
                });
                
                // Store for later attachment to export bar
                this.customizerToggle = customizerToggle;
            }
            
            // Render diff toggle bar (if baseline available)
            if (this.comparisonResult) {
                this.diffToggleBar = createDiffToggleBar({
                    enabled: this.diffMode,
                    onChange: (enabled) => this.handleDiffModeChange(enabled),
                    summary: this.comparisonResult.summary,
                    baselineInfo: this.baselineComparator.getBaselineInfo()
                });
                this.container.appendChild(this.diffToggleBar);
            }
            
            // Render diff overview card (if in diff mode)
            if (this.diffMode && this.comparisonResult) {
                this.diffOverviewCard = createDiffOverviewCard(this.comparisonResult);
                this.container.appendChild(this.diffOverviewCard);
            }
            
            // Render fake devices alert (if detected and not in diff mode)
            if (!this.diffMode && data.metrics?.mediaDevices) {
                const fakeDevicesSection = createFakeDevicesSection(
                    data.metrics.mediaDevices
                );
                if (fakeDevicesSection) {
                    this.container.appendChild(fakeDevicesSection);
                }
            }
            
            // Render suspicious indicators alert (if any and not in diff mode)
            if (!this.diffMode && data.suspiciousIndicators && data.suspiciousSummary) {
                const alertSection = createSuspiciousIndicatorsSection(
                    data.suspiciousIndicators, 
                    data.suspiciousSummary
                );
                if (alertSection) {
                    this.container.appendChild(alertSection);
                }
            }
            
            // Render behavioral indicators alert (if any and not in diff mode)
            if (!this.diffMode && data.metrics?.behavioralIndicators) {
                const behavioralSection = createBehavioralIndicatorsSection(
                    data.metrics.behavioralIndicators
                );
                if (behavioralSection) {
                    this.container.appendChild(behavioralSection);
                }
            }
            
            // Render known agents detection section (if data available and not in diff mode)
            if (!this.diffMode && data.knownAgentsDetection) {
                const knownAgentsSection = createKnownAgentsSection(data.knownAgentsDetection);
                if (knownAgentsSection) {
                    this.container.appendChild(knownAgentsSection);
                }
            }
            
            // Render export controls
            const exportBar = createExportBar((format) => {
                exportFingerprintData(this.fingerprintData, format);
            });
            
            // Add customizer toggle to export bar if available
            if (this.customizerToggle) {
                const actionsGroup = exportBar.querySelector('.fp-export-bar__group:last-child');
                if (actionsGroup) {
                    actionsGroup.appendChild(this.customizerToggle);
                }
            }
            
            // Add expand/collapse all handlers
            const expandBtn = exportBar.querySelector('#fp-expand-all');
            const collapseBtn = exportBar.querySelector('#fp-collapse-all');
            
            if (expandBtn) {
                expandBtn.addEventListener('click', () => this.sectionManager.expandAll());
            }
            if (collapseBtn) {
                collapseBtn.addEventListener('click', () => this.sectionManager.collapseAll());
            }
            
            this.container.appendChild(exportBar);
            
            // Render sections based on mode
            this.sectionsContainer = document.createElement('div');
            this.sectionsContainer.className = 'fp-sections-container';
            
            if (this.diffMode && this.comparisonResult) {
                this.renderDiffSections();
            } else {
                this.renderNormalSections(data);
            }
            
            this.container.appendChild(this.sectionsContainer);
            
            // Initialize category sidebar (only in normal mode)
            if (!this.diffMode) {
                this.initCategorySidebar();
            }
            
            // Render footer
            this.container.appendChild(this.createFooter());
            
        } catch (error) {
            console.error('Error rendering fingerprint UI:', error);
            this.container.innerHTML = '';
            this.container.appendChild(this.createGlobalError(error));
        }
    }
    
    /**
     * Initialize the persistent category sidebar
     */
    initCategorySidebar() {
        // Cleanup previous sidebar if exists
        if (this.categorySidebar) {
            this.categorySidebar.destroy();
        }
        
        // Create new category sidebar
        this.categorySidebar = createCategorySidebar({
            sectionsContainer: this.sectionsContainer,
            showProgress: true,
            collapsible: true,
            showMetricCounts: true,
            onCategoryClick: (category) => {
                console.log(`📍 Navigated to: ${category.label}`);
            }
        });
        
        // Mount sidebar to body (before main container)
        this.categorySidebar.mount(document.body);
        
        // Add body class for layout offset
        document.body.classList.add('fp-has-sidebar');
        
        // Listen for sidebar toggle to update body class
        window.addEventListener('fp-sidebar-toggle', (e) => {
            document.body.classList.toggle('fp-sidebar-collapsed', e.detail.collapsed);
        });
        
        // Initialize after DOM is ready
        this.categorySidebar.init();
    }
    
    /**
     * Handle diff mode toggle
     * @param {boolean} enabled - Whether diff mode is enabled
     */
    handleDiffModeChange(enabled) {
        this.diffMode = enabled;
        console.log(`🔄 Diff mode ${enabled ? 'enabled' : 'disabled'}`);
        console.log('📊 Current fingerprint data:', this.fingerprintData ? 'available' : 'null');
        console.log('📊 Comparison result:', this.comparisonResult ? 'available' : 'null');
        
        // Cleanup sidebar before re-render
        if (this.categorySidebar) {
            this.categorySidebar.destroy();
            this.categorySidebar = null;
            document.body.classList.remove('fp-has-sidebar', 'fp-sidebar-collapsed');
        }
        
        // Re-render the page with new mode
        this.render(this.fingerprintData).then(() => {
            console.log('✅ Re-render complete');
        }).catch(err => {
            console.error('❌ Re-render failed:', err);
        });
        
        // Scroll to top smoothly
        window.scrollTo({ top: 0, behavior: 'smooth' });
    }
    
    /**
     * Create search bar component
     * @returns {HTMLElement} Search bar element
     */
    createSearchBar() {
        const searchFilter = createSearchFilter(
            { query: '', searchFields: ['name', 'value', 'description', 'category'], riskFilters: ['high', 'medium', 'low', 'none'], activeQuickFilters: [] },
            this.allMetrics
        );
        
        const searchBar = createSearchBar((searchState) => {
            this.searchState = searchState;
            this.applyFilters();
            return { count: this.getFilteredMetricCount() };
        }, {
            placeholder: 'Search metrics by name, value, description, or category...',
            showAdvancedFilters: true,
            showQuickFilters: true
        });
        
        return searchBar;
    }
    
    /**
     * Create metrics customizer component
     * @returns {HTMLElement} Customizer element
     */
    createMetricsCustomizer() {
        // Use saved preferences if available
        const savedPreferences = this.customizationState;
        const customizer = createMetricsCustomizer(this.allMetrics, (state) => {
            this.customizationState = state;
            this.applyFilters();
        }, {
            defaultVisibleCategories: savedPreferences.visibleCategories || null,
            defaultVisibleColumns: savedPreferences.visibleColumns || ['key', 'name', 'value', 'description', 'code', 'risk'],
            showColumnToggles: true,
            showCategoryToggles: true,
            showMetricToggles: false
        });
        
        // Apply saved preferences to customizer UI
        if (savedPreferences.visibleCategories) {
            setTimeout(() => {
                const categoryCheckboxes = customizer.querySelectorAll('[data-category-toggle]');
                categoryCheckboxes.forEach(checkbox => {
                    const category = checkbox.dataset.categoryToggle;
                    checkbox.checked = savedPreferences.visibleCategories.includes(category);
                });
            }, 100);
        }
        
        if (savedPreferences.visibleColumns) {
            setTimeout(() => {
                const columnCheckboxes = customizer.querySelectorAll('[data-column]');
                columnCheckboxes.forEach(checkbox => {
                    const column = checkbox.dataset.column;
                    checkbox.checked = savedPreferences.visibleColumns.includes(column);
                });
            }, 100);
        }
        
        return customizer;
    }
    
    /**
     * Apply search and customization filters
     */
    applyFilters() {
        if (!this.sectionsContainer || !this.allMetrics) return;
        
        // Get current filter function
        let filterFn = null;
        if (this.searchState && this.searchBar) {
            const searchState = this.searchBar.getSearchState();
            filterFn = createSearchFilter(searchState, this.allMetrics);
        }
        
        // Get visible categories - if null, show all
        const visibleCategories = this.customizationState.visibleCategories === null 
            ? Object.keys(this.allMetrics) 
            : (this.customizationState.visibleCategories || Object.keys(this.allMetrics));
        
        // Get visible columns
        const visibleColumns = this.customizationState.visibleColumns || ['key', 'name', 'value', 'description', 'code', 'risk'];
        
        // Update all sections
        const sections = this.sectionsContainer.querySelectorAll('.fp-section');
        let totalVisible = 0;
        
        sections.forEach(section => {
            const categoryKey = section.dataset.category;
            if (!categoryKey) return;
            
            const isCategoryVisible = visibleCategories.includes(categoryKey);
            
            // Show/hide entire section based on category visibility
            if (!isCategoryVisible) {
                section.style.display = 'none';
                return; // Skip further processing for hidden categories
            }
            
            // Section is visible, process its content
            section.style.display = '';
            
            // Update table columns
            const tableWrapper = section.querySelector('.fp-table-wrapper');
            if (tableWrapper && tableWrapper.updateColumnVisibility) {
                tableWrapper.updateColumnVisibility(visibleColumns);
            }
            
            // Update table filtering
            const table = section.querySelector('table');
            if (table) {
                const tbody = table.querySelector('tbody');
                if (tbody) {
                    const rows = tbody.querySelectorAll('tr');
                    let visibleInSection = 0;
                    
                    if (filterFn) {
                        // Get category metrics for filtering
                        const categoryMetrics = this.allMetrics[categoryKey] || {};
                        
                        rows.forEach(row => {
                            const metricName = row.getAttribute('data-metric-name');
                            if (metricName && categoryMetrics[metricName]) {
                                const metricData = categoryMetrics[metricName];
                                if (filterFn(categoryKey, metricName, metricData)) {
                                    row.style.display = '';
                                    visibleInSection++;
                                } else {
                                    row.style.display = 'none';
                                }
                            } else {
                                // If we can't identify the metric, show the row
                                row.style.display = '';
                                visibleInSection++;
                            }
                        });
                    } else {
                        // No filter, show all rows
                        rows.forEach(row => row.style.display = '');
                        visibleInSection = rows.length;
                    }
                    
                    totalVisible += visibleInSection;
                    
                    // Update section count badge
                    const countBadge = section.querySelector('.fp-section__count');
                    if (countBadge) {
                        countBadge.textContent = visibleInSection;
                    }
                    
                    // Hide entire section if no metrics are visible (but only if search is active)
                    // Don't hide based on metric count if category is visible - let category visibility control it
                    if (filterFn && visibleInSection === 0) {
                        section.style.display = 'none';
                    } else {
                        section.style.display = '';
                    }
                }
            }
        });
        
        // Update search results count if available
        if (this.searchBar && this.searchBar.querySelector) {
            const resultsInfo = this.searchBar.querySelector('#fp-search-results-info');
            const resultsCount = this.searchBar.querySelector('#fp-search-results-count');
            if (resultsInfo && resultsCount) {
                resultsCount.textContent = totalVisible.toLocaleString();
                resultsInfo.style.display = (this.searchState?.query || this.searchState?.activeQuickFilters?.length > 0) ? 'flex' : 'none';
            }
        }
    }
    
    /**
     * Get filtered metric count
     * @returns {number} Total visible metrics
     */
    getFilteredMetricCount() {
        if (!this.allMetrics) return 0;
        
        let count = 0;
        const visibleCategories = this.customizationState.visibleCategories || Object.keys(this.allMetrics);
        
        if (this.searchState && this.searchBar) {
            const searchState = this.searchBar.getSearchState();
            const filterFn = createSearchFilter(searchState, this.allMetrics);
            
            visibleCategories.forEach(categoryKey => {
                const categoryMetrics = this.allMetrics[categoryKey] || {};
                Object.entries(categoryMetrics).forEach(([metricName, metricData]) => {
                    if (filterFn(categoryKey, metricName, metricData)) {
                        count++;
                    }
                });
            });
        } else {
            visibleCategories.forEach(categoryKey => {
                count += Object.keys(this.allMetrics[categoryKey] || {}).length;
            });
        }
        
        return count;
    }
    
    /**
     * Render sections in normal mode (all metrics)
     * @param {object} data - Fingerprint data
     */
    renderNormalSections(data) {
        if (!data.metrics) return;
        
        const categories = sortCategories(Object.keys(data.metrics));
        const visibleCategories = this.customizationState.visibleCategories || categories;
        const visibleColumns = this.customizationState.visibleColumns || ['key', 'name', 'value', 'description', 'code', 'risk'];
        
        // Get filter function if search is active
        let filterFn = null;
        if (this.searchState && this.searchBar) {
            const searchState = this.searchBar.getSearchState();
            filterFn = createSearchFilter(searchState, this.allMetrics);
        }
        
        // Always create ALL sections, but hide them if not in visibleCategories
        // This allows sections to be shown/hidden dynamically without re-rendering
        categories.forEach((categoryKey, index) => {
            try {
                const categoryMetrics = data.metrics[categoryKey];
                if (!categoryMetrics || typeof categoryMetrics !== 'object') {
                    console.warn(`Skipping invalid category: ${categoryKey}`);
                    return;
                }
                
                const metricCount = Object.keys(categoryMetrics).length;
                if (metricCount === 0) return;
                
                // Create metrics table for this category with filters
                const table = createMetricsTable(categoryMetrics, categoryKey, null, {
                    visibleColumns,
                    filterFn
                });
                
                // Create expandable section
                // Expand first 3 sections by default, or important ones
                const importantCategories = ['automation', 'functionIntegrity', 'behavioralIndicators', 'security'];
                const isExpanded = index < 2 || importantCategories.includes(categoryKey);
                
                const section = createSection({
                    categoryKey,
                    metricCount,
                    content: table,
                    expanded: isExpanded
                });
                
                // Hide section if category is not in visibleCategories
                if (!visibleCategories.includes(categoryKey)) {
                    section.style.display = 'none';
                }
                
                this.sectionManager.register(categoryKey, section);
                this.sectionsContainer.appendChild(section);
                
            } catch (error) {
                console.error(`Error rendering category "${categoryKey}":`, error);
                this.sectionsContainer.appendChild(this.createErrorSection(categoryKey, error));
            }
        });
        
        // Apply filters after rendering
        setTimeout(() => this.applyFilters(), 100);
    }
    
    /**
     * Render sections in diff mode (only differences)
     */
    renderDiffSections() {
        if (!this.comparisonResult) {
            this.sectionsContainer.innerHTML = '<p>No comparison data available.</p>';
            return;
        }
        
        // Get only differences
        const differences = this.baselineComparator.getDifferences(this.comparisonResult, {
            includeMissing: true,
            includeNew: true,
            includeIgnored: false
        });
        
        const diffCategories = Object.keys(differences);
        
        // Check if there are any differences
        if (diffCategories.length === 0) {
            const emptyState = createNoDifferencesState();
            
            // Add handler to switch to full view
            const showAllBtn = emptyState.querySelector('#fp-show-all-metrics');
            if (showAllBtn) {
                showAllBtn.addEventListener('click', () => {
                    this.handleDiffModeChange(false);
                });
            }
            
            this.sectionsContainer.appendChild(emptyState);
            return;
        }
        
        // Sort categories
        const sortedCategories = sortCategories(diffCategories);
        
        sortedCategories.forEach((categoryKey) => {
            try {
                const categoryDiff = differences[categoryKey];
                
                const section = createDiffSection({
                    categoryKey,
                    categoryDiff,
                    expanded: true // Expand all in diff mode
                });
                
                this.sectionManager.register(categoryKey, section);
                this.sectionsContainer.appendChild(section);
                
            } catch (error) {
                console.error(`Error rendering diff category "${categoryKey}":`, error);
                this.sectionsContainer.appendChild(this.createErrorSection(categoryKey, error));
            }
        });
    }
    
    /**
     * Create page header
     * @returns {HTMLElement} Header element
     */
    createHeader() {
        const header = document.createElement('header');
        header.className = 'fp-header premium-header';
        header.setAttribute('role', 'banner');
        
        const now = new Date();
        const formattedDate = now.toLocaleDateString(undefined, { 
            weekday: 'short', 
            year: 'numeric', 
            month: 'short', 
            day: 'numeric' 
        });
        const formattedTime = now.toLocaleTimeString(undefined, { 
            hour: '2-digit', 
            minute: '2-digit' 
        });
        
        // Calculate metrics summary for header
        const totalMetrics = this.fingerprintData?.summary?.totalMetrics || 0;
        const categoriesCount = Object.keys(this.fingerprintData?.metrics || {}).length;
        
        header.innerHTML = `
            <h1 class="fp-header__title premium-header__title">
                <span class="fp-header__title-icon premium-header__title-icon" aria-hidden="true">
                    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                        <path d="M12 2L2 7l10 5 10-5-10-5z"></path>
                        <path d="M2 17l10 5 10-5"></path>
                        <path d="M2 12l10 5 10-5"></path>
                    </svg>
                </span>
                Browser Fingerprint Analysis
            </h1>
            <p class="fp-header__subtitle premium-header__subtitle">
                Enterprise security assessment analyzing ${totalMetrics.toLocaleString()} data points across ${categoriesCount} categories to identify browser characteristics, automation patterns, and security signals.
            </p>
            <div class="fp-header__meta premium-header__meta">
                <div class="fp-header__meta-item premium-header__meta-item">
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
                        <rect x="3" y="4" width="18" height="18" rx="2" ry="2"></rect>
                        <line x1="16" y1="2" x2="16" y2="6"></line>
                        <line x1="8" y1="2" x2="8" y2="6"></line>
                        <line x1="3" y1="10" x2="21" y2="10"></line>
                    </svg>
                    <span>${formattedDate}</span>
                </div>
                <div class="fp-header__meta-item premium-header__meta-item">
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
                        <circle cx="12" cy="12" r="10"></circle>
                        <polyline points="12 6 12 12 16 14"></polyline>
                    </svg>
                    <span>${formattedTime}</span>
                </div>
                <div class="fp-header__meta-item premium-header__meta-item">
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
                        <circle cx="12" cy="12" r="10"></circle>
                        <line x1="2" y1="12" x2="22" y2="12"></line>
                        <path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z"></path>
                    </svg>
                    <span>${window.location.hostname || 'localhost'}</span>
                </div>
                <div class="fp-header__meta-item premium-header__meta-item">
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
                        <line x1="18" y1="20" x2="18" y2="10"></line>
                        <line x1="12" y1="20" x2="12" y2="4"></line>
                        <line x1="6" y1="20" x2="6" y2="14"></line>
                    </svg>
                    <span>${totalMetrics} metrics</span>
                </div>
            </div>
        `;
        
        return header;
    }
    
    /**
     * Create page footer
     * @returns {HTMLElement} Footer element
     */
    createFooter() {
        const footer = document.createElement('footer');
        footer.className = 'fp-footer';
        footer.setAttribute('role', 'contentinfo');
        footer.style.cssText = `
            text-align: center;
            padding: var(--fp-space-6, 1.5rem);
            margin-top: var(--fp-space-6, 1.5rem);
            color: var(--fp-neutral-foreground-4, #707070);
            font-size: var(--fp-font-size-300, 0.8125rem);
            border-top: 1px solid var(--fp-neutral-stroke-3, #EBEBEB);
        `;
        
        const now = new Date();
        const timestamp = now.toISOString();
        const localTime = now.toLocaleString();
        
        footer.innerHTML = `
            <p style="margin: 0 0 var(--fp-space-2, 0.5rem) 0;">
                <strong>Browser Fingerprint Analysis</strong> • Enterprise Security Dashboard
            </p>
            <p style="margin: 0; font-size: var(--fp-font-size-200, 0.75rem);">
                Generated: ${localTime} (${timestamp})
            </p>
        `;
        
        return footer;
    }
    
    /**
     * Create error section for failed category rendering
     * @param {string} categoryKey - The category that failed
     * @param {Error} error - The error
     * @returns {HTMLElement} Error section element
     */
    createErrorSection(categoryKey, error) {
        const section = document.createElement('div');
        section.className = 'fp-section';
        section.style.borderColor = 'var(--fp-danger-200)';
        
        section.innerHTML = `
            <div class="fp-section__header" style="background: var(--fp-danger-50);">
                <div class="fp-section__icon" style="background: var(--fp-danger-100);">❌</div>
                <div class="fp-section__title-group">
                    <h3 class="fp-section__title" style="color: var(--fp-danger-700);">
                        Error: ${categoryKey}
                    </h3>
                    <p class="fp-section__subtitle" style="color: var(--fp-danger-600);">
                        Failed to render this section: ${error.message}
                    </p>
                </div>
            </div>
        `;
        
        return section;
    }
    
    /**
     * Create global error state
     * @param {Error} error - The error
     * @returns {HTMLElement} Error element
     */
    createGlobalError(error) {
        const errorDiv = document.createElement('div');
        errorDiv.className = 'fp-error';
        
        errorDiv.innerHTML = `
            <div class="fp-error__icon">❌</div>
            <h3 class="fp-error__title">Rendering Failed</h3>
            <p class="fp-error__message">
                An error occurred while rendering the fingerprint analysis: ${error.message}
            </p>
            <pre style="margin-top: var(--fp-spacing-md); font-size: 0.75rem; text-align: left; max-width: 600px; overflow: auto; background: var(--fp-gray-100); padding: var(--fp-spacing-md); border-radius: var(--fp-radius-md);">
${error.stack || 'No stack trace available'}
            </pre>
        `;
        
        return errorDiv;
    }
    
    /**
     * Get the section manager for external control
     * @returns {object} Section manager
     */
    getSectionManager() {
        return this.sectionManager;
    }
}

/**
 * Helper to get telemetry description
 * Used for behavioral telemetry metrics
 * @param {string} key - Telemetry metric key
 * @returns {string} Description
 */
export function getTelemetryDescription(key) {
    return TELEMETRY_DESCRIPTIONS[key] || 'Behavioral telemetry metric';
}
