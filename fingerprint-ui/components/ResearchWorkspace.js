/**
 * Research Workspace Renderer
 * A focus-driven, two-panel interface for fingerprint analysis
 * Designed for long-session usability and cognitive clarity
 */

import { getCategoryConfig, formatMetricName, formatValue, getRiskConfig, getJsCode, isImageDataUrl } from '../utils/helpers.js';
import { showDetailModal } from './DetailModal.js';

/**
 * Escape HTML special characters to prevent XSS
 * @param {string} str - String to escape
 * @returns {string} Escaped string
 */
function escapeHtml(str) {
    if (typeof str !== 'string') return String(str);
    return str
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#039;');
}

/**
 * Navigation category groups for logical organization
 */
const CATEGORY_GROUPS = {
    'overview': {
        label: 'Overview',
        categories: ['summary', 'suspiciousIndicators', 'knownAgents']
    },
    'browser': {
        label: 'Browser',
        categories: ['core', 'language', 'fonts', 'css', 'permissions']
    },
    'hardware': {
        label: 'Hardware',
        categories: ['webgl', 'audio', 'mediaDevices', 'battery', 'speech']
    },
    'network': {
        label: 'Network',
        categories: ['network', 'webrtc', 'activeMeasurements']
    },
    'automation': {
        label: 'Automation',
        categories: ['functionIntegrity', 'stringSignature', 'cdpSignals', 'workers']
    },
    'behavior': {
        label: 'Behavior',
        categories: ['behavioralIndicators', 'behavioralTelemetry', 'performanceTiming', 'collectionTiming']
    }
};

/**
 * Create the research workspace layout
 * @param {HTMLElement} container - Root container element
 * @param {object} data - Fingerprint analysis data
 * @param {object} options - Configuration options
 * @returns {object} Controller object
 */
export function createResearchWorkspace(container, data, options = {}) {
    // State
    let activeCategory = null;
    let searchQuery = '';
    let sidebarCollapsed = false;
    
    // DOM references
    let sidebarEl = null;
    let workspaceEl = null;
    let contentEl = null;
    let searchInputEl = null;
    
    // Build category metadata
    const categories = buildCategoryMetadata(data);
    
    /**
     * Initialize the workspace
     */
    function init() {
        container.innerHTML = '';
        container.className = 'research-page';
        
        // Create main layout
        const layout = document.createElement('div');
        layout.className = 'research-layout';
        
        // Create sidebar
        sidebarEl = createSidebar(categories);
        layout.appendChild(sidebarEl);
        
        // Create workspace
        workspaceEl = createWorkspacePanel();
        layout.appendChild(workspaceEl);
        
        container.appendChild(layout);
        
        // Set initial active category (first with data)
        const firstCategory = findFirstCategory();
        if (firstCategory) {
            setActiveCategory(firstCategory);
        }
        
        // Load sidebar collapse state
        loadSidebarState();
        
        // Setup keyboard shortcuts
        setupKeyboardShortcuts();
    }
    
    /**
     * Build category metadata from fingerprint data
     */
    function buildCategoryMetadata(data) {
        const result = {};
        const metrics = data.metrics || {};
        
        console.log('📊 Building category metadata. Available metric keys:', Object.keys(metrics));
        
        // Process each metrics category
        for (const [key, categoryMetrics] of Object.entries(metrics)) {
            if (!categoryMetrics || typeof categoryMetrics !== 'object') continue;
            
            const metricCount = Object.keys(categoryMetrics).length;
            if (metricCount === 0) continue;
            
            const config = getCategoryConfig(key);
            const riskSummary = calculateCategoryRisk(categoryMetrics);
            
            result[key] = {
                key,
                label: config.label,
                description: config.description,
                icon: config.icon,
                iconType: config.iconType,
                metricCount,
                riskSummary,
                metrics: categoryMetrics
            };
        }
        
        // Add special sections
        if (data.suspiciousIndicators?.length > 0) {
            result['suspiciousIndicators'] = {
                key: 'suspiciousIndicators',
                label: 'Suspicious Indicators',
                description: 'Detected suspicious browser configurations',
                icon: '⚠️',
                metricCount: data.suspiciousIndicators.length,
                riskSummary: { high: data.suspiciousIndicators.length },
                data: data.suspiciousIndicators,
                summary: data.suspiciousSummary
            };
        }
        
        if (data.knownAgentsDetection) {
            result['knownAgents'] = {
                key: 'knownAgents',
                label: 'Known Agents',
                description: 'Known automation tools detection',
                icon: '🤖',
                metricCount: data.knownAgentsDetection.results?.length || 0,
                data: data.knownAgentsDetection
            };
        }
        
        // Add summary
        result['summary'] = {
            key: 'summary',
            label: 'Summary',
            description: 'Analysis overview and key findings',
            icon: '📊',
            metricCount: Object.keys(result).length,
            data: data.summary
        };
        
        return result;
    }
    
    /**
     * Calculate risk summary for a category
     */
    function calculateCategoryRisk(metrics) {
        const summary = { high: 0, medium: 0, low: 0, none: 0 };
        
        for (const metric of Object.values(metrics)) {
            const risk = (metric.risk || 'none').toLowerCase();
            if (summary.hasOwnProperty(risk)) {
                summary[risk]++;
            } else {
                summary.none++;
            }
        }
        
        return summary;
    }
    
    /**
     * Find first category with data
     */
    function findFirstCategory() {
        if (categories['summary']) return 'summary';
        
        for (const group of Object.values(CATEGORY_GROUPS)) {
            for (const cat of group.categories) {
                if (categories[cat]) return cat;
            }
        }
        
        return Object.keys(categories)[0];
    }
    
    /**
     * Create the sidebar navigation
     */
    function createSidebar(categories) {
        const sidebar = document.createElement('aside');
        sidebar.className = 'research-sidebar';
        sidebar.setAttribute('role', 'navigation');
        sidebar.setAttribute('aria-label', 'Category navigation');
        
        // Header
        const header = document.createElement('div');
        header.className = 'research-sidebar__header';
        header.innerHTML = `
            <div class="research-sidebar__brand">
                <svg class="research-sidebar__logo" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                    <path d="M12 2L2 7l10 5 10-5-10-5z"></path>
                    <path d="M2 17l10 5 10-5"></path>
                    <path d="M2 12l10 5 10-5"></path>
                </svg>
                <span class="research-sidebar__title">Analysis</span>
            </div>
            <button class="research-sidebar__toggle" title="Toggle sidebar" aria-label="Toggle sidebar">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                    <polyline points="15 18 9 12 15 6"></polyline>
                </svg>
            </button>
        `;
        sidebar.appendChild(header);
        
        // Toggle handler
        const toggleBtn = header.querySelector('.research-sidebar__toggle');
        toggleBtn.addEventListener('click', toggleSidebar);
        
        // Search
        const searchWrapper = document.createElement('div');
        searchWrapper.style.cssText = 'padding: var(--research-space-3) var(--research-space-4);';
        searchWrapper.innerHTML = `
            <div class="research-search">
                <svg class="research-search__icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                    <circle cx="11" cy="11" r="8"></circle>
                    <path d="M21 21l-4.35-4.35"></path>
                </svg>
                <input type="text" class="research-search__input" placeholder="Search metrics..." aria-label="Search metrics">
            </div>
        `;
        sidebar.appendChild(searchWrapper);
        
        searchInputEl = searchWrapper.querySelector('.research-search__input');
        searchInputEl.addEventListener('input', (e) => {
            searchQuery = e.target.value.trim().toLowerCase();
            if (activeCategory) {
                renderCategoryContent(activeCategory);
            }
        });
        
        // Navigation
        const nav = document.createElement('nav');
        nav.className = 'research-sidebar__nav';
        
        // Build navigation groups
        for (const [groupKey, group] of Object.entries(CATEGORY_GROUPS)) {
            const availableCategories = group.categories.filter(cat => categories[cat]);
            if (availableCategories.length === 0) continue;
            
            const groupEl = document.createElement('div');
            groupEl.className = 'research-nav-group';
            groupEl.innerHTML = `<div class="research-nav-group__label">${escapeHtml(group.label)}</div>`;
            
            const list = document.createElement('ul');
            list.className = 'research-nav-list';
            
            for (const catKey of availableCategories) {
                const cat = categories[catKey];
                list.appendChild(createNavItem(cat));
            }
            
            groupEl.appendChild(list);
            nav.appendChild(groupEl);
        }
        
        // Add any ungrouped categories
        const groupedCategories = new Set(
            Object.values(CATEGORY_GROUPS).flatMap(g => g.categories)
        );
        const ungrouped = Object.keys(categories).filter(k => !groupedCategories.has(k));
        
        if (ungrouped.length > 0) {
            const otherGroup = document.createElement('div');
            otherGroup.className = 'research-nav-group';
            otherGroup.innerHTML = `<div class="research-nav-group__label">Other</div>`;
            
            const list = document.createElement('ul');
            list.className = 'research-nav-list';
            
            for (const catKey of ungrouped) {
                const cat = categories[catKey];
                list.appendChild(createNavItem(cat));
            }
            
            otherGroup.appendChild(list);
            nav.appendChild(otherGroup);
        }
        
        sidebar.appendChild(nav);
        
        // Footer
        const footer = document.createElement('div');
        footer.className = 'research-sidebar__footer';
        footer.innerHTML = `
            <span>${Object.keys(categories).length} categories</span>
            <span style="margin-left: auto; opacity: 0.6;">
                <span class="research-kbd">↑↓</span> navigate
            </span>
        `;
        sidebar.appendChild(footer);
        
        return sidebar;
    }
    
    /**
     * Create a navigation item
     */
    function createNavItem(category) {
        const li = document.createElement('li');
        li.className = 'research-nav-item';
        
        const button = document.createElement('button');
        button.className = 'research-nav-link';
        button.dataset.category = category.key;
        
        // Determine status indicator
        let statusClass = '';
        if (category.riskSummary?.high > 0) {
            statusClass = 'danger';
        } else if (category.riskSummary?.medium > 0) {
            statusClass = 'warning';
        }
        
        // Icon HTML
        const iconHtml = category.iconType === 'svg'
            ? `<span class="research-nav-icon">${category.icon}</span>`
            : `<span class="research-nav-icon" style="font-size: 16px;">${category.icon}</span>`;
        
        button.innerHTML = `
            ${iconHtml}
            <span class="research-nav-label">${escapeHtml(category.label)}</span>
            <span class="research-nav-badge">${category.metricCount}</span>
            ${statusClass ? `<span class="research-nav-status research-nav-status--${statusClass}"></span>` : ''}
        `;
        
        button.addEventListener('click', () => {
            setActiveCategory(category.key);
        });
        
        li.appendChild(button);
        return li;
    }
    
    /**
     * Create the workspace panel
     */
    function createWorkspacePanel() {
        const workspace = document.createElement('main');
        workspace.className = 'research-workspace';
        
        // Header (will be updated when category changes)
        const header = document.createElement('header');
        header.className = 'research-workspace__header';
        header.innerHTML = `
            <div>
                <h1 class="research-workspace__title">Fingerprint Analysis</h1>
                <p class="research-workspace__subtitle">Select a category to begin</p>
            </div>
            <div class="research-workspace__actions">
                <button class="research-btn research-btn--secondary research-btn--sm" id="research-export-btn">
                    <svg class="research-btn__icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                        <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path>
                        <polyline points="7 10 12 15 17 10"></polyline>
                        <line x1="12" y1="15" x2="12" y2="3"></line>
                    </svg>
                    Export
                </button>
            </div>
        `;
        workspace.appendChild(header);
        
        // Export button handler
        const exportBtn = header.querySelector('#research-export-btn');
        exportBtn.addEventListener('click', () => {
            exportData();
        });
        
        // Content area
        contentEl = document.createElement('div');
        contentEl.className = 'research-workspace__content';
        workspace.appendChild(contentEl);
        
        return workspace;
    }
    
    /**
     * Set the active category and render its content
     */
    function setActiveCategory(categoryKey) {
        if (!categories[categoryKey]) return;
        
        activeCategory = categoryKey;
        
        // Update nav active state
        const navLinks = sidebarEl.querySelectorAll('.research-nav-link');
        navLinks.forEach(link => {
            link.classList.toggle('research-nav-link--active', link.dataset.category === categoryKey);
        });
        
        // Update header
        const category = categories[categoryKey];
        const header = workspaceEl.querySelector('.research-workspace__header');
        const titleEl = header.querySelector('.research-workspace__title');
        const subtitleEl = header.querySelector('.research-workspace__subtitle');
        
        titleEl.textContent = category.label;
        subtitleEl.textContent = category.description || `${category.metricCount} metrics`;
        
        // Render content
        renderCategoryContent(categoryKey);
    }
    
    /**
     * Render the content for a category
     */
    function renderCategoryContent(categoryKey) {
        const category = categories[categoryKey];
        if (!category) return;
        
        contentEl.innerHTML = '';
        
        // Handle special sections
        if (categoryKey === 'summary') {
            renderSummary(data);
            return;
        }
        
        if (categoryKey === 'suspiciousIndicators') {
            renderSuspiciousIndicators(category.data, category.summary);
            return;
        }
        
        if (categoryKey === 'knownAgents') {
            renderKnownAgents(category.data);
            return;
        }
        
        // Render metrics table
        if (category.metrics) {
            renderMetricsPanel(category);
        }
    }
    
    /**
     * Render summary overview
     */
    function renderSummary(data) {
        // Stats bar
        const totalMetrics = Object.values(categories).reduce((sum, cat) => sum + (cat.metricCount || 0), 0);
        const highRiskCount = Object.values(categories).reduce((sum, cat) => sum + (cat.riskSummary?.high || 0), 0);
        const mediumRiskCount = Object.values(categories).reduce((sum, cat) => sum + (cat.riskSummary?.medium || 0), 0);
        
        const statsPanel = document.createElement('div');
        statsPanel.className = 'research-panel';
        statsPanel.innerHTML = `
            <div class="research-stats">
                <div class="research-stat">
                    <span class="research-stat__value">${Object.keys(categories).length}</span>
                    <span class="research-stat__label">Categories</span>
                </div>
                <div class="research-stat">
                    <span class="research-stat__value">${totalMetrics}</span>
                    <span class="research-stat__label">Total Metrics</span>
                </div>
                <div class="research-stat">
                    <span class="research-stat__value" style="color: var(--research-status-danger);">${highRiskCount}</span>
                    <span class="research-stat__label">High Risk</span>
                </div>
                <div class="research-stat">
                    <span class="research-stat__value" style="color: var(--research-status-warning);">${mediumRiskCount}</span>
                    <span class="research-stat__label">Medium Risk</span>
                </div>
            </div>
        `;
        contentEl.appendChild(statsPanel);
        
        // Quick alerts
        if (data.suspiciousIndicators?.length > 0) {
            const alert = createAlert('warning', 
                `${data.suspiciousIndicators.length} suspicious indicators detected`,
                'Review the Suspicious Indicators section for details.'
            );
            contentEl.appendChild(alert);
        }
        
        const agentResults = Array.isArray(data.knownAgentsDetection?.results) 
            ? data.knownAgentsDetection.results 
            : [];
        if (agentResults.some(r => r.detected)) {
            const detectedAgents = agentResults.filter(r => r.detected);
            const alert = createAlert('danger',
                `${detectedAgents.length} automation agent(s) detected`,
                detectedAgents.map(a => a.agent || a.name).join(', ')
            );
            contentEl.appendChild(alert);
        }
        
        // Category overview cards
        const overviewPanel = document.createElement('div');
        overviewPanel.className = 'research-panel';
        overviewPanel.innerHTML = `
            <div class="research-panel__header">
                <h2 class="research-panel__title">Categories Overview</h2>
            </div>
            <div class="research-panel__content">
                <div style="display: grid; grid-template-columns: repeat(auto-fill, minmax(200px, 1fr)); gap: var(--research-space-4);">
                    ${Object.values(categories)
                        .filter(cat => cat.key !== 'summary')
                        .map(cat => `
                            <button class="research-category-card" data-category="${cat.key}" style="
                                background: var(--research-bg-subtle);
                                border: 1px solid var(--research-border-light);
                                border-radius: var(--research-radius-md);
                                padding: var(--research-space-4);
                                text-align: left;
                                cursor: pointer;
                                transition: all var(--research-transition-fast);
                            ">
                                <div style="display: flex; align-items: center; gap: var(--research-space-2); margin-bottom: var(--research-space-2);">
                                    <span style="font-size: 18px;">${cat.icon}</span>
                                    <span style="font-weight: var(--research-weight-medium); color: var(--research-text-primary);">${escapeHtml(cat.label)}</span>
                                </div>
                                <div style="font-size: var(--research-text-xs); color: var(--research-text-tertiary);">
                                    ${cat.metricCount} metrics
                                    ${cat.riskSummary?.high ? `<span style="color: var(--research-status-danger); margin-left: 8px;">● ${cat.riskSummary.high} high</span>` : ''}
                                </div>
                            </button>
                        `).join('')}
                </div>
            </div>
        `;
        contentEl.appendChild(overviewPanel);
        
        // Add click handlers for category cards
        overviewPanel.querySelectorAll('.research-category-card').forEach(card => {
            card.addEventListener('click', () => {
                setActiveCategory(card.dataset.category);
            });
            card.addEventListener('mouseenter', () => {
                card.style.borderColor = 'var(--research-accent-primary)';
                card.style.background = 'var(--research-bg-workspace)';
            });
            card.addEventListener('mouseleave', () => {
                card.style.borderColor = 'var(--research-border-light)';
                card.style.background = 'var(--research-bg-subtle)';
            });
        });
    }
    
    /**
     * Render suspicious indicators
     */
    function renderSuspiciousIndicators(indicators, summary) {
        if (!indicators || indicators.length === 0) {
            contentEl.appendChild(createEmptyState('No suspicious indicators detected'));
            return;
        }
        
        // Summary alert
        const riskLevel = summary?.riskLevel || 'MEDIUM';
        const alertType = riskLevel === 'HIGH' ? 'danger' : riskLevel === 'MEDIUM' ? 'warning' : 'info';
        const alert = createAlert(alertType,
            `Risk Level: ${riskLevel}`,
            `${indicators.length} suspicious indicator(s) found in this browser environment.`
        );
        contentEl.appendChild(alert);
        
        // Indicators list
        const panel = document.createElement('div');
        panel.className = 'research-panel';
        panel.innerHTML = `
            <div class="research-panel__header">
                <h2 class="research-panel__title">Detected Indicators</h2>
                <span class="research-panel__badge">${indicators.length}</span>
            </div>
            <div class="research-panel__content" style="padding: 0;">
                ${indicators.map((indicator, i) => `
                    <div style="
                        padding: var(--research-space-4) var(--research-space-5);
                        border-bottom: 1px solid var(--research-border-light);
                        display: flex;
                        align-items: flex-start;
                        gap: var(--research-space-4);
                    ">
                        <span class="research-risk research-risk--${(indicator.risk || 'medium').toLowerCase()}">${indicator.risk || 'MEDIUM'}</span>
                        <div style="flex: 1;">
                            <div style="font-weight: var(--research-weight-medium); color: var(--research-text-primary); margin-bottom: var(--research-space-1);">
                                ${escapeHtml(indicator.name || indicator.indicator || `Indicator ${i + 1}`)}
                            </div>
                            <div style="font-size: var(--research-text-sm); color: var(--research-text-tertiary);">
                                ${escapeHtml(indicator.description || indicator.reason || '')}
                            </div>
                            ${indicator.value !== undefined ? `
                                <div style="margin-top: var(--research-space-2);">
                                    <code class="research-value">${escapeHtml(String(indicator.value))}</code>
                                </div>
                            ` : ''}
                        </div>
                    </div>
                `).join('')}
            </div>
        `;
        contentEl.appendChild(panel);
    }
    
    /**
     * Render known agents section
     */
    function renderKnownAgents(agentData) {
        if (!agentData) {
            contentEl.appendChild(createEmptyState('No agent detection data available'));
            return;
        }
        
        const results = Array.isArray(agentData.results) ? agentData.results : [];
        const detected = results.filter(r => r.detected);
        
        if (detected.length > 0) {
            const alert = createAlert('danger',
                `${detected.length} automation agent(s) detected`,
                'The following automation tools were identified in this browser environment.'
            );
            contentEl.appendChild(alert);
        } else {
            const alert = createAlert('safe',
                'No known automation agents detected',
                'All agent detection checks passed.'
            );
            contentEl.appendChild(alert);
        }
        
        // Results panel
        const panel = document.createElement('div');
        panel.className = 'research-panel';
        panel.innerHTML = `
            <div class="research-panel__header">
                <h2 class="research-panel__title">Detection Results</h2>
                <span class="research-panel__badge">${results.length} checked</span>
            </div>
            <div class="research-panel__content" style="padding: 0;">
                <table class="research-table">
                    <thead>
                        <tr>
                            <th>Agent</th>
                            <th>Status</th>
                            <th>Indicators</th>
                        </tr>
                    </thead>
                    <tbody>
                        ${results.map(result => `
                            <tr>
                                <td class="research-table__name">${escapeHtml(result.agent || result.name || 'Unknown')}</td>
                                <td>
                                    ${result.detected 
                                        ? '<span class="research-risk research-risk--high">DETECTED</span>'
                                        : '<span class="research-risk research-risk--safe">Clear</span>'}
                                </td>
                                <td style="font-size: var(--research-text-xs); color: var(--research-text-tertiary);">
                                    ${result.indicators?.length 
                                        ? result.indicators.slice(0, 3).map(i => escapeHtml(i.name || i)).join(', ')
                                        : '—'}
                                </td>
                            </tr>
                        `).join('')}
                    </tbody>
                </table>
            </div>
        `;
        contentEl.appendChild(panel);
    }
    
    /**
     * Render metrics panel for a category
     */
    function renderMetricsPanel(category) {
        const metrics = category.metrics;
        if (!metrics || Object.keys(metrics).length === 0) {
            contentEl.appendChild(createEmptyState('No metrics available for this category'));
            return;
        }
        
        // Filter metrics by search
        let filteredMetrics = Object.entries(metrics);
        if (searchQuery) {
            filteredMetrics = filteredMetrics.filter(([name, data]) => {
                const searchableText = [
                    name,
                    formatMetricName(name),
                    data.value !== undefined ? String(data.value) : '',
                    data.description || ''
                ].join(' ').toLowerCase();
                return searchableText.includes(searchQuery);
            });
        }
        
        if (filteredMetrics.length === 0) {
            contentEl.appendChild(createEmptyState(`No metrics matching "${searchQuery}"`));
            return;
        }
        
        // Group by risk level for better organization
        const groupedMetrics = {
            high: [],
            medium: [],
            low: [],
            none: []
        };
        
        filteredMetrics.forEach(([name, data]) => {
            const risk = (data.risk || 'none').toLowerCase();
            if (groupedMetrics[risk]) {
                groupedMetrics[risk].push([name, data]);
            } else {
                groupedMetrics.none.push([name, data]);
            }
        });
        
        // Render high/medium risk first if any
        if (groupedMetrics.high.length > 0 || groupedMetrics.medium.length > 0) {
            const alertMetrics = [...groupedMetrics.high, ...groupedMetrics.medium];
            const alertPanel = createMetricsTablePanel('Attention Required', alertMetrics, category.key, true);
            contentEl.appendChild(alertPanel);
        }
        
        // Render all metrics
        const allMetricsPanel = createMetricsTablePanel('All Metrics', filteredMetrics, category.key);
        contentEl.appendChild(allMetricsPanel);
    }
    
    /**
     * Create a metrics table panel
     */
    function createMetricsTablePanel(title, metrics, categoryKey, highlighted = false) {
        const panel = document.createElement('div');
        panel.className = 'research-panel';
        if (highlighted) {
            panel.style.borderColor = 'var(--research-status-warning-border)';
        }
        
        panel.innerHTML = `
            <div class="research-panel__header">
                <h2 class="research-panel__title">
                    ${highlighted ? '<svg style="width:18px;height:18px;color:var(--research-status-warning);margin-right:8px;" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"></path><line x1="12" y1="9" x2="12" y2="13"></line><line x1="12" y1="17" x2="12.01" y2="17"></line></svg>' : ''}
                    ${escapeHtml(title)}
                </h2>
                <span class="research-panel__badge">${metrics.length}</span>
            </div>
            <div class="research-panel__content" style="padding: 0; overflow-x: auto;">
                <table class="research-table">
                    <thead>
                        <tr>
                            <th style="width: 40px;">#</th>
                            <th style="width: 140px;">Property Key</th>
                            <th style="width: 180px;">Metric</th>
                            <th>Value</th>
                            <th style="width: 240px;">Description</th>
                            <th style="width: 90px;">Risk</th>
                        </tr>
                    </thead>
                    <tbody></tbody>
                </table>
            </div>
        `;
        
        const tbody = panel.querySelector('tbody');
        
        metrics.forEach(([name, data], index) => {
            const row = document.createElement('tr');
            
            // Format value - make it fully selectable
            let valueHtml = '';
            const value = data.value;
            
            if (isImageDataUrl(value)) {
                valueHtml = `<img src="${value}" style="max-width: 100px; max-height: 50px; border-radius: 4px;">`;
            } else if (typeof value === 'object' && value !== null) {
                const jsonStr = JSON.stringify(value);
                valueHtml = `<code class="research-value research-value--long" style="user-select: text; cursor: text;">${escapeHtml(jsonStr)}</code>`;
            } else if (typeof value === 'string' && value.length > 100) {
                // Show full value but with wrapping for very long strings
                valueHtml = `<code class="research-value research-value--long" style="user-select: text; cursor: text; word-break: break-all;">${escapeHtml(value)}</code>`;
            } else {
                valueHtml = `<code class="research-value" style="user-select: text; cursor: text;">${escapeHtml(formatValue(value))}</code>`;
            }
            
            // Risk badge
            const risk = (data.risk || 'none').toLowerCase();
            const riskConfig = getRiskConfig(risk);
            
            row.innerHTML = `
                <td style="text-align: center; color: var(--research-text-muted); font-size: var(--research-text-xs);">${index + 1}</td>
                <td><span class="research-property-key" style="display: inline-block; background: #1a1a1a; color: #e0e0e0; font-family: 'JetBrains Mono', 'Consolas', 'Monaco', monospace; font-size: 0.75rem; font-weight: 500; padding: 3px 8px; border-radius: 4px; max-width: 130px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; user-select: all;" title="${escapeHtml(name)}">${escapeHtml(name)}</span></td>
                <td class="research-table__name" style="user-select: text;">${escapeHtml(formatMetricName(name))}</td>
                <td style="user-select: text;">${valueHtml}</td>
                <td class="research-table__description" style="user-select: text;">${escapeHtml(data.description || '—')}</td>
                <td><span class="research-risk research-risk--${risk}">${riskConfig.label}</span></td>
            `;
            
            tbody.appendChild(row);
        });
        
        return panel;
    }
    
    /**
     * Show metric detail modal
     */
    function showMetricDetail(name, data, categoryKey) {
        // Use existing detail modal if available
        if (typeof showDetailModal === 'function') {
            showDetailModal({
                title: formatMetricName(name),
                category: categoryKey,
                metric: name,
                data: data
            });
        } else {
            // Simple fallback
            console.log('Metric detail:', { name, data, categoryKey });
        }
    }
    
    /**
     * Create an alert element
     */
    function createAlert(type, title, message) {
        const icons = {
            info: '<circle cx="12" cy="12" r="10"></circle><line x1="12" y1="16" x2="12" y2="12"></line><line x1="12" y1="8" x2="12.01" y2="8"></line>',
            warning: '<path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"></path><line x1="12" y1="9" x2="12" y2="13"></line><line x1="12" y1="17" x2="12.01" y2="17"></line>',
            danger: '<circle cx="12" cy="12" r="10"></circle><line x1="15" y1="9" x2="9" y2="15"></line><line x1="9" y1="9" x2="15" y2="15"></line>',
            safe: '<path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"></path><polyline points="22 4 12 14.01 9 11.01"></polyline>'
        };
        
        const alert = document.createElement('div');
        alert.className = `research-alert research-alert--${type}`;
        alert.innerHTML = `
            <svg class="research-alert__icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                ${icons[type] || icons.info}
            </svg>
            <div class="research-alert__content">
                <div class="research-alert__title">${escapeHtml(title)}</div>
                <div class="research-alert__message">${escapeHtml(message)}</div>
            </div>
        `;
        return alert;
    }
    
    /**
     * Create an empty state element
     */
    function createEmptyState(message) {
        const empty = document.createElement('div');
        empty.className = 'research-empty';
        empty.innerHTML = `
            <svg class="research-empty__icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                <circle cx="12" cy="12" r="10"></circle>
                <line x1="12" y1="8" x2="12" y2="12"></line>
                <line x1="12" y1="16" x2="12.01" y2="16"></line>
            </svg>
            <p class="research-empty__title">${escapeHtml(message)}</p>
        `;
        return empty;
    }
    
    /**
     * Toggle sidebar collapsed state
     */
    function toggleSidebar() {
        sidebarCollapsed = !sidebarCollapsed;
        sidebarEl.classList.toggle('research-sidebar--collapsed', sidebarCollapsed);
        document.body.classList.toggle('research-sidebar-collapsed', sidebarCollapsed);
        localStorage.setItem('research-sidebar-collapsed', sidebarCollapsed ? 'true' : 'false');
    }
    
    /**
     * Load sidebar state from storage
     */
    function loadSidebarState() {
        const saved = localStorage.getItem('research-sidebar-collapsed');
        if (saved === 'true') {
            sidebarCollapsed = true;
            sidebarEl.classList.add('research-sidebar--collapsed');
            document.body.classList.add('research-sidebar-collapsed');
        }
    }
    
    /**
     * Setup keyboard shortcuts
     */
    function setupKeyboardShortcuts() {
        document.addEventListener('keydown', (e) => {
            // Focus search on /
            if (e.key === '/' && document.activeElement !== searchInputEl) {
                e.preventDefault();
                searchInputEl?.focus();
                return;
            }
            
            // Navigate categories with arrow keys
            if ((e.key === 'ArrowUp' || e.key === 'ArrowDown') && document.activeElement === document.body) {
                e.preventDefault();
                navigateCategories(e.key === 'ArrowUp' ? -1 : 1);
            }
            
            // Escape to clear search
            if (e.key === 'Escape' && document.activeElement === searchInputEl) {
                searchInputEl.value = '';
                searchQuery = '';
                searchInputEl.blur();
                if (activeCategory) {
                    renderCategoryContent(activeCategory);
                }
            }
        });
    }
    
    /**
     * Navigate between categories
     */
    function navigateCategories(direction) {
        const categoryKeys = Object.keys(categories);
        const currentIndex = categoryKeys.indexOf(activeCategory);
        let newIndex = currentIndex + direction;
        
        if (newIndex < 0) newIndex = categoryKeys.length - 1;
        if (newIndex >= categoryKeys.length) newIndex = 0;
        
        setActiveCategory(categoryKeys[newIndex]);
    }
    
    /**
     * Export data
     */
    function exportData() {
        const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `fingerprint-analysis-${Date.now()}.json`;
        a.click();
        URL.revokeObjectURL(url);
    }
    
    // Initialize and return controller
    init();
    
    return {
        setActiveCategory,
        toggleSidebar,
        refresh: () => renderCategoryContent(activeCategory),
        destroy: () => {
            container.innerHTML = '';
            document.body.classList.remove('research-sidebar-collapsed');
        }
    };
}
