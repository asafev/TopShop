/**
 * Research Workspace v2.0
 * Enterprise Fingerprint Analysis Interface
 * Senior Researcher Optimized Category Structure
 * 2026 Edition
 */

import { getIcon, getCategoryIcon } from '../utils/icons-v2.js';
import { formatMetricName, formatValue, getRiskConfig, isImageDataUrl } from '../utils/helpers.js';
import { showDetailModal } from './DetailModal.js';
import { 
    hasAdvancedRenderer, 
    createViewModeToggle, 
    renderAdvancedMetrics 
} from './AdvancedMetricsRenderer.js';

/**
 * Escape HTML special characters
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
 * Senior Researcher Category Structure
 * Organized by analysis domain for efficient investigation workflow
 */
const RESEARCH_CATEGORIES = {
    overview: {
        id: 'overview',
        label: 'Overview',
        description: 'Summary and key findings',
        collapsed: false,
        categories: [
            { key: 'summary', label: 'Analysis Summary', icon: 'dashboard' },
            { key: 'suspiciousIndicators', label: 'Suspicious Signals', icon: 'shieldAlert' },
            { key: 'knownAgents', label: 'Detected Agents', icon: 'agent' }
        ]
    },
    browser: {
        id: 'browser',
        label: 'Browser Environment',
        description: 'Core browser properties and APIs',
        collapsed: false,
        categories: [
            { key: 'core', label: 'Core Properties', icon: 'browser' },
            { key: 'navigator', label: 'Navigator API', icon: 'navigator' },
            { key: 'window', label: 'Window Object', icon: 'window' },
            { key: 'document', label: 'Document State', icon: 'document' },
            { key: 'jsEnvironment', label: 'JS Environment', icon: 'code' }
        ]
    },
    hardware: {
        id: 'hardware',
        label: 'Hardware Fingerprints',
        description: 'Device and GPU identification',
        collapsed: false,
        categories: [
            { key: 'webgl', label: 'WebGL / GPU', icon: 'gpu' },
            { key: 'audioFingerprint', label: 'Audio Fingerprint (CreepJS)', icon: 'audio' },
            { key: 'codecSupport', label: 'Codec Support', icon: 'audio' },
            { key: 'display', label: 'Display Properties', icon: 'display' },
            { key: 'batteryStorage', label: 'Battery & Storage', icon: 'battery' },
            { key: 'mediaDevices', label: 'Media Devices', icon: 'mediaDevices' }
        ]
    },
    network: {
        id: 'network',
        label: 'Network & WebRTC',
        description: 'Network capabilities and leaks',
        collapsed: false,
        categories: [
            { key: 'network', label: 'Network Info', icon: 'network' },
            { key: 'networkCapabilities', label: 'Capabilities', icon: 'wifi' },
            { key: 'webrtc', label: 'WebRTC Leaks', icon: 'webrtc' },
            { key: 'webRTCLeak', label: 'IP Discovery', icon: 'webrtc' },
            { key: 'activeMeasurements', label: 'Active Probes', icon: 'measurements' }
        ]
    },
    rendering: {
        id: 'rendering',
        label: 'Rendering & Styles',
        description: 'CSS, fonts, and visual fingerprinting',
        collapsed: true,
        categories: [
            { key: 'css', label: 'CSS Properties', icon: 'css' },
            { key: 'cssComputedStyle', label: 'Computed Styles', icon: 'css' },
            { key: 'fonts', label: 'Font Detection', icon: 'fonts' }
        ]
    },
    locale: {
        id: 'locale',
        label: 'Locale & Input',
        description: 'Language, keyboard, and accessibility',
        collapsed: true,
        categories: [
            { key: 'language', label: 'Language Config', icon: 'language' },
            { key: 'keyboardLayout', label: 'Keyboard Layout', icon: 'keyboard' },
            { key: 'speechSynthesis', label: 'Speech Synthesis', icon: 'speech' },
            { key: 'permissions', label: 'Permissions', icon: 'permissions' }
        ]
    },
    automation: {
        id: 'automation',
        label: 'Automation Detection',
        description: 'Bot and automation signals',
        collapsed: false,
        categories: [
            { key: 'automation', label: 'Automation Flags', icon: 'shield' },
            { key: 'functionIntegrity', label: 'Function Integrity', icon: 'shieldCheck' },
            { key: 'stringSignature', label: 'String Signatures', icon: 'signature' },
            { key: 'stringSignatureAutomation', label: 'Signature Analysis', icon: 'signature' },
            { key: 'cdpSignals', label: 'CDP Signals', icon: 'terminal' },
            { key: 'workerSignals', label: 'Worker Threads', icon: 'worker' },
            { key: 'stackTraceFingerprint', label: 'Stack Trace Analysis', icon: 'stackTraceFingerprint' },
            { key: 'creepjsEnhanced', label: 'CreepJS Enhanced', icon: 'fingerprint' },
            { key: 'iframeAnalysis', label: 'Iframe Analysis', icon: 'window' }
        ]
    },
    behavioral: {
        id: 'behavioral',
        label: 'Behavioral Analysis',
        description: 'User behavior and timing patterns',
        collapsed: true,
        categories: [
            { key: 'behavioralIndicators', label: 'Behavior Signals', icon: 'activity' },
            { key: 'behavioralTelemetry', label: 'Telemetry Data', icon: 'chart' },
            { key: 'performanceTiming', label: 'Timing Analysis', icon: 'timer' },
            { key: 'performance', label: 'Performance', icon: 'chart' }
        ]
    }
};

/**
 * Category configuration with labels and descriptions
 */
const CATEGORY_CONFIG = {
    summary: { label: 'Analysis Summary', description: 'Overview of fingerprint analysis results' },
    suspiciousIndicators: { label: 'Suspicious Signals', description: 'Detected suspicious browser configurations' },
    knownAgents: { label: 'Detected Agents', description: 'Known automation tools and frameworks' },
    core: { label: 'Core Properties', description: 'Essential browser identification' },
    navigator: { label: 'Navigator API', description: 'Browser navigator object properties' },
    window: { label: 'Window Object', description: 'Window dimensions and properties' },
    document: { label: 'Document State', description: 'DOM and document properties' },
    jsEnvironment: { label: 'JS Environment', description: 'JavaScript runtime characteristics' },
    webApis: { label: 'Web APIs', description: 'Web API availability and features' },
    webgl: { label: 'WebGL / GPU', description: 'Graphics and GPU fingerprinting' },
    audio: { label: 'Audio Context', description: 'Audio processing fingerprint' },
    audioFingerprint: { label: 'Audio Fingerprint (CreepJS)', description: 'Enhanced audio fingerprint with lie detection, pattern validation, and engine fingerprinting' },
    codecSupport: { label: 'Codec Support', description: 'Audio/video codec detection & RTC capabilities' },
    display: { label: 'Display Properties', description: 'Screen and display configuration' },
    battery: { label: 'Battery Status', description: 'Battery API information' },
    batteryStorage: { label: 'Battery & Storage', description: 'Battery and storage API information' },
    mediaDevices: { label: 'Media Devices', description: 'Available cameras and microphones' },
    network: { label: 'Network Info', description: 'Network connection properties' },
    networkCapabilities: { label: 'Capabilities', description: 'Network feature detection' },
    webrtc: { label: 'WebRTC Leaks', description: 'WebRTC information disclosure' },
    webRTCLeak: { label: 'IP Discovery', description: 'IP address leak detection' },
    activeMeasurements: { label: 'Active Probes', description: 'Active network measurements' },
    css: { label: 'CSS Properties', description: 'CSS feature detection' },
    cssComputedStyle: { label: 'Computed Styles', description: 'Computed CSS values fingerprint' },
    fonts: { label: 'Font Detection', description: 'Installed system fonts' },
    language: { label: 'Language Config', description: 'Browser language settings' },
    keyboardLayout: { label: 'Keyboard Layout', description: 'Physical keyboard detection' },
    speechSynthesis: { label: 'Speech Synthesis', description: 'Text-to-speech voices' },
    permissions: { label: 'Permissions', description: 'Permission API states' },
    automation: { label: 'Automation Flags', description: 'Automation framework indicators' },
    functionIntegrity: { label: 'Function Integrity', description: 'Native function modification detection' },
    stringSignature: { label: 'String Signatures', description: 'Function toString analysis' },
    stringSignatureAutomation: { label: 'Signature Analysis', description: 'Automation signature detection' },
    cdpSignals: { label: 'CDP Signals', description: 'Chrome DevTools Protocol detection' },
    workerSignals: { label: 'Worker Threads', description: 'Web Worker characteristics' },
    stackTraceFingerprint: { label: 'Stack Trace Analysis', description: 'Stack trace patterns for browser/environment detection' },
    creepjsEnhanced: { label: 'CreepJS Enhanced', description: 'Math precision, DOMRect, CSS Media, and Intl API fingerprinting for stealth detection' },
    iframeAnalysis: { label: 'Iframe Analysis', description: 'Cross-realm iframe consistency and integrity checks' },
    behavioralIndicators: { label: 'Behavior Signals', description: 'User interaction patterns' },
    behavioralTelemetry: { label: 'Telemetry Data', description: 'Raw behavioral measurements' },
    performanceTiming: { label: 'Timing Analysis', description: 'Navigation and paint timing' },
    performance: { label: 'Performance', description: 'Performance metrics' },
    collectionTiming: { label: 'Collection Timing', description: 'Time taken for each fingerprint category' }
};

/**
 * Create the research workspace
 */
export function createResearchWorkspace(container, data, options = {}) {
    // State
    let activeCategory = null;
    let searchQuery = '';
    let sidebarCollapsed = false;
    let groupStates = {};
    let searchResults = [];
    let searchResultsVisible = false;
    let focusedResultIndex = -1;
    let highlightedMetrics = new Set();
    let viewModes = {}; // Track v1/v2 view mode per category
    
    // DOM references
    let sidebarEl = null;
    let workspaceEl = null;
    let contentEl = null;
    let searchInputEl = null;
    let searchResultsEl = null;
    
    // Build category metadata
    const categories = buildCategoryMetadata(data);
    
    // Build search index for fast lookups
    const searchIndex = buildSearchIndex(categories);
    
    // Initialize group states
    Object.keys(RESEARCH_CATEGORIES).forEach(groupId => {
        const saved = localStorage.getItem(`rx-group-${groupId}`);
        groupStates[groupId] = saved !== null 
            ? saved === 'true' 
            : !RESEARCH_CATEGORIES[groupId].collapsed;
    });
    
    // Initialize view mode preferences (v1 table / v2 grouped)
    Object.keys(categories).forEach(categoryKey => {
        const savedMode = localStorage.getItem(`rx-view-mode-${categoryKey}`);
        if (savedMode) {
            viewModes[categoryKey] = savedMode;
        }
    });
    
    /**
     * Initialize workspace
     */
    function init() {
        container.innerHTML = '';
        container.className = 'rx-app';
        
        const layout = document.createElement('div');
        layout.className = 'rx-layout';
        
        sidebarEl = createSidebar();
        layout.appendChild(sidebarEl);
        
        workspaceEl = createWorkspace();
        layout.appendChild(workspaceEl);
        
        container.appendChild(layout);
        
        // Set initial category
        const firstCategory = findFirstCategory();
        if (firstCategory) {
            setActiveCategory(firstCategory);
        }
        
        loadSidebarState();
        setupKeyboardShortcuts();
    }
    
    /**
     * Build category metadata from data
     */
    function buildCategoryMetadata(data) {
        const result = {};
        const metrics = data.metrics || {};
        
        for (const [key, categoryMetrics] of Object.entries(metrics)) {
            if (!categoryMetrics || typeof categoryMetrics !== 'object') continue;
            
            const metricCount = Object.keys(categoryMetrics).length;
            if (metricCount === 0) continue;
            
            const config = CATEGORY_CONFIG[key] || { label: formatMetricName(key), description: '' };
            const riskSummary = calculateCategoryRisk(categoryMetrics);
            
            result[key] = {
                key,
                label: config.label,
                description: config.description,
                metricCount,
                riskSummary,
                metrics: categoryMetrics
            };
        }
        
        // Special sections
        if (data.suspiciousIndicators?.length > 0) {
            result['suspiciousIndicators'] = {
                key: 'suspiciousIndicators',
                label: 'Suspicious Signals',
                description: 'Detected suspicious configurations',
                metricCount: data.suspiciousIndicators.length,
                riskSummary: { high: data.suspiciousIndicators.length },
                data: data.suspiciousIndicators,
                summary: data.suspiciousSummary
            };
        }
        
        if (data.knownAgentsDetection) {
            // Handle both 'results' and 'detectionResults' property names
            const agentResults = data.knownAgentsDetection.results 
                || data.knownAgentsDetection.detectionResults 
                || [];
            const resultsArray = Array.isArray(agentResults) ? agentResults : [];
            const detected = resultsArray.filter(r => r.detected);
            result['knownAgents'] = {
                key: 'knownAgents',
                label: 'Detected Agents',
                description: 'Known automation tools',
                metricCount: resultsArray.length,
                riskSummary: { high: detected.length },
                data: data.knownAgentsDetection
            };
        }
        
        result['summary'] = {
            key: 'summary',
            label: 'Analysis Summary',
            description: 'Overview and key findings',
            metricCount: Object.keys(result).length,
            data: data.summary
        };
        
        return result;
    }
    
    /**
     * Build search index from all categories
     * Creates a flat array of all searchable metrics for fast lookup
     */
    function buildSearchIndex(categories) {
        const index = [];
        
        for (const [categoryKey, category] of Object.entries(categories)) {
            if (!category.metrics) continue;
            
            for (const [metricKey, metricData] of Object.entries(category.metrics)) {
                index.push({
                    key: metricKey,
                    name: formatMetricName(metricKey),
                    category: categoryKey,
                    categoryLabel: category.label,
                    value: metricData.value !== undefined ? String(metricData.value) : '',
                    description: metricData.description || '',
                    risk: metricData.risk || 'none',
                    // Searchable text (lowercase for matching)
                    searchText: [
                        metricKey,
                        formatMetricName(metricKey),
                        metricData.value !== undefined ? String(metricData.value) : '',
                        metricData.description || ''
                    ].join(' ').toLowerCase()
                });
            }
        }
        
        return index;
    }
    
    /**
     * Search the index for matching metrics
     */
    function searchMetrics(query) {
        if (!query || query.length < 2) return [];
        
        const q = query.toLowerCase();
        const results = [];
        
        for (const item of searchIndex) {
            if (item.searchText.includes(q)) {
                // Calculate relevance score
                let score = 0;
                if (item.key.toLowerCase().includes(q)) score += 10;
                if (item.key.toLowerCase() === q) score += 20;
                if (item.name.toLowerCase().includes(q)) score += 5;
                if (item.value.toLowerCase().includes(q)) score += 3;
                
                results.push({ ...item, score });
            }
        }
        
        // Sort by relevance score
        results.sort((a, b) => b.score - a.score);
        
        // Limit results
        return results.slice(0, 20);
    }
    
    /**
     * Calculate risk summary
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
     * Find first available category
     */
    function findFirstCategory() {
        if (categories['summary']) return 'summary';
        for (const group of Object.values(RESEARCH_CATEGORIES)) {
            for (const cat of group.categories) {
                if (categories[cat.key]) return cat.key;
            }
        }
        return Object.keys(categories)[0];
    }
    
    /**
     * Create sidebar
     */
    function createSidebar() {
        const sidebar = document.createElement('aside');
        sidebar.className = 'rx-sidebar';
        sidebar.setAttribute('role', 'navigation');
        
        // Header
        sidebar.innerHTML = `
            <div class="rx-sidebar__header">
                <div class="rx-sidebar__brand">
                    ${getIcon('fingerprint')}
                    <span class="rx-sidebar__title">Research</span>
                </div>
                <button class="rx-sidebar__toggle" title="Toggle sidebar">
                    ${getIcon('chevronLeft')}
                </button>
            </div>
            <div class="rx-sidebar__search" style="position: relative;">
                <div class="rx-search">
                    <span class="rx-search__icon">${getIcon('search')}</span>
                    <input type="text" class="rx-search__input" placeholder="Search metrics..." aria-label="Search metrics" autocomplete="off">
                    <span class="rx-search__kbd">/</span>
                </div>
                <div class="rx-search-results" style="display: none;"></div>
            </div>
            <nav class="rx-sidebar__nav"></nav>
            <div class="rx-sidebar__footer">
                <span>${Object.keys(categories).length} categories</span>
            </div>
        `;
        
        // Toggle handler
        sidebar.querySelector('.rx-sidebar__toggle').addEventListener('click', toggleSidebar);
        
        // Search elements
        searchInputEl = sidebar.querySelector('.rx-search__input');
        searchResultsEl = sidebar.querySelector('.rx-search-results');
        
        // Search input handler with debounce
        let searchTimeout = null;
        searchInputEl.addEventListener('input', (e) => {
            const query = e.target.value.trim();
            clearTimeout(searchTimeout);
            
            if (query.length < 2) {
                hideSearchResults();
                searchQuery = '';
                highlightedMetrics.clear();
                return;
            }
            
            searchTimeout = setTimeout(() => {
                searchQuery = query.toLowerCase();
                searchResults = searchMetrics(query);
                showSearchResults();
            }, 150);
        });
        
        // Keyboard navigation in search
        searchInputEl.addEventListener('keydown', (e) => {
            if (!searchResultsVisible) return;
            
            if (e.key === 'ArrowDown') {
                e.preventDefault();
                focusedResultIndex = Math.min(focusedResultIndex + 1, searchResults.length - 1);
                updateSearchResultsFocus();
            } else if (e.key === 'ArrowUp') {
                e.preventDefault();
                focusedResultIndex = Math.max(focusedResultIndex - 1, 0);
                updateSearchResultsFocus();
            } else if (e.key === 'Enter' && focusedResultIndex >= 0) {
                e.preventDefault();
                selectSearchResult(searchResults[focusedResultIndex]);
            } else if (e.key === 'Escape') {
                hideSearchResults();
                searchInputEl.blur();
            }
        });
        
        // Close search results on click outside
        document.addEventListener('click', (e) => {
            if (!sidebar.querySelector('.rx-sidebar__search').contains(e.target)) {
                hideSearchResults();
            }
        });
        
        // Build navigation
        const nav = sidebar.querySelector('.rx-sidebar__nav');
        buildNavigation(nav);
        
        return sidebar;
    }
    
    /**
     * Show search results dropdown
     */
    function showSearchResults() {
        if (!searchResultsEl) return;
        
        focusedResultIndex = -1;
        
        if (searchResults.length === 0) {
            searchResultsEl.innerHTML = `
                <div class="rx-search-results__empty">
                    No metrics found for "${escapeHtml(searchQuery)}"
                </div>
            `;
        } else {
            // Group results by category
            const grouped = {};
            for (const result of searchResults) {
                if (!grouped[result.category]) {
                    grouped[result.category] = [];
                }
                grouped[result.category].push(result);
            }
            
            let html = '';
            for (const [categoryKey, items] of Object.entries(grouped)) {
                const categoryLabel = categories[categoryKey]?.label || categoryKey;
                html += `<div class="rx-search-results__group">`;
                html += `<div class="rx-search-results__group-header">${escapeHtml(categoryLabel)}</div>`;
                
                for (const item of items) {
                    const idx = searchResults.indexOf(item);
                    html += `
                        <button class="rx-search-result" data-index="${idx}" data-category="${item.category}" data-key="${escapeHtml(item.key)}">
                            <span class="rx-search-result__key">${escapeHtml(item.key)}</span>
                            <span class="rx-search-result__name">${highlightMatch(item.name, searchQuery)}</span>
                        </button>
                    `;
                }
                
                html += `</div>`;
            }
            
            searchResultsEl.innerHTML = html;
            
            // Add click handlers
            searchResultsEl.querySelectorAll('.rx-search-result').forEach(btn => {
                btn.addEventListener('click', () => {
                    const idx = parseInt(btn.dataset.index, 10);
                    selectSearchResult(searchResults[idx]);
                });
            });
        }
        
        searchResultsEl.style.display = 'block';
        searchResultsVisible = true;
    }
    
    /**
     * Hide search results dropdown
     */
    function hideSearchResults() {
        if (searchResultsEl) {
            searchResultsEl.style.display = 'none';
        }
        searchResultsVisible = false;
        focusedResultIndex = -1;
    }
    
    /**
     * Update focus state in search results
     */
    function updateSearchResultsFocus() {
        if (!searchResultsEl) return;
        
        const items = searchResultsEl.querySelectorAll('.rx-search-result');
        items.forEach((item, idx) => {
            item.classList.toggle('rx-search-result--focused', idx === focusedResultIndex);
            if (idx === focusedResultIndex) {
                item.scrollIntoView({ block: 'nearest' });
            }
        });
    }
    
    /**
     * Select a search result and navigate to it
     */
    function selectSearchResult(result) {
        if (!result) return;
        
        // Hide dropdown
        hideSearchResults();
        
        // Set highlighted metrics
        highlightedMetrics.clear();
        highlightedMetrics.add(result.key);
        
        // Ensure the category's group is expanded
        for (const [groupId, group] of Object.entries(RESEARCH_CATEGORIES)) {
            if (group.categories.some(c => c.key === result.category)) {
                if (!groupStates[groupId]) {
                    toggleGroup(groupId);
                }
                break;
            }
        }
        
        // Navigate to category
        setActiveCategory(result.category);
        
        // Keep search input value
        searchInputEl.value = result.key;
        searchQuery = result.key.toLowerCase();
        
        // Scroll to highlighted row after render
        setTimeout(() => {
            const matchedRow = contentEl.querySelector('.rx-search-match');
            if (matchedRow) {
                matchedRow.scrollIntoView({ behavior: 'smooth', block: 'center' });
            }
        }, 100);
    }
    
    /**
     * Highlight matching text in search results
     */
    function highlightMatch(text, query) {
        if (!query) return escapeHtml(text);
        
        const lowerText = text.toLowerCase();
        const lowerQuery = query.toLowerCase();
        const idx = lowerText.indexOf(lowerQuery);
        
        if (idx === -1) return escapeHtml(text);
        
        const before = text.slice(0, idx);
        const match = text.slice(idx, idx + query.length);
        const after = text.slice(idx + query.length);
        
        return escapeHtml(before) + '<span class="rx-highlight">' + escapeHtml(match) + '</span>' + escapeHtml(after);
    }
    
    /**
     * Build navigation tree
     */
    function buildNavigation(nav) {
        nav.innerHTML = '';
        
        for (const [groupId, group] of Object.entries(RESEARCH_CATEGORIES)) {
            const availableCategories = group.categories.filter(cat => categories[cat.key]);
            if (availableCategories.length === 0) continue;
            
            const groupEl = document.createElement('div');
            groupEl.className = 'rx-nav-group';
            if (!groupStates[groupId]) {
                groupEl.classList.add('rx-nav-group--collapsed');
            }
            groupEl.dataset.group = groupId;
            
            // Group header
            const headerEl = document.createElement('div');
            headerEl.className = 'rx-nav-group__header';
            headerEl.innerHTML = `
                <span class="rx-nav-group__chevron">${getIcon('chevronDown')}</span>
                <span class="rx-nav-group__label">${escapeHtml(group.label)}</span>
                <span class="rx-nav-group__count">${availableCategories.length}</span>
            `;
            headerEl.addEventListener('click', () => toggleGroup(groupId));
            groupEl.appendChild(headerEl);
            
            // Category list
            const listEl = document.createElement('ul');
            listEl.className = 'rx-nav-group__list';
            listEl.style.maxHeight = groupStates[groupId] 
                ? `${availableCategories.length * 40}px` 
                : '0';
            
            for (const cat of availableCategories) {
                const catData = categories[cat.key];
                const li = document.createElement('li');
                li.className = 'rx-nav-item';
                
                const button = document.createElement('button');
                button.className = 'rx-nav-link';
                button.dataset.category = cat.key;
                
                // Status dot
                let dotHtml = '';
                if (catData.riskSummary?.high > 0) {
                    dotHtml = '<span class="rx-nav-dot rx-nav-dot--danger"></span>';
                } else if (catData.riskSummary?.medium > 0) {
                    dotHtml = '<span class="rx-nav-dot rx-nav-dot--warning"></span>';
                }
                
                button.innerHTML = `
                    <span class="rx-nav-icon">${getCategoryIcon(cat.key)}</span>
                    <span class="rx-nav-label">${escapeHtml(cat.label)}</span>
                    <span class="rx-nav-badge">${catData.metricCount}</span>
                    ${dotHtml}
                `;
                
                button.addEventListener('click', () => setActiveCategory(cat.key));
                li.appendChild(button);
                listEl.appendChild(li);
            }
            
            groupEl.appendChild(listEl);
            nav.appendChild(groupEl);
        }
    }
    
    /**
     * Toggle navigation group
     */
    function toggleGroup(groupId) {
        groupStates[groupId] = !groupStates[groupId];
        localStorage.setItem(`rx-group-${groupId}`, groupStates[groupId]);
        
        const groupEl = sidebarEl.querySelector(`[data-group="${groupId}"]`);
        if (groupEl) {
            groupEl.classList.toggle('rx-nav-group--collapsed', !groupStates[groupId]);
            const listEl = groupEl.querySelector('.rx-nav-group__list');
            const categories = groupEl.querySelectorAll('.rx-nav-item');
            listEl.style.maxHeight = groupStates[groupId] 
                ? `${categories.length * 40}px` 
                : '0';
        }
    }
    
    /**
     * Create workspace panel
     */
    function createWorkspace() {
        const workspace = document.createElement('main');
        workspace.className = 'rx-workspace';
        
        workspace.innerHTML = `
            <header class="rx-workspace__header">
                <div class="rx-workspace__title-group">
                    <h1 class="rx-workspace__title">Fingerprint Analysis</h1>
                    <span class="rx-workspace__subtitle">Select a category</span>
                </div>
                <div class="rx-workspace__actions">
                    <button class="rx-btn rx-btn--secondary" id="rx-export-btn">
                        ${getIcon('download')}
                        Export
                    </button>
                </div>
            </header>
            <div class="rx-workspace__content"></div>
        `;
        
        // Export handler
        workspace.querySelector('#rx-export-btn').addEventListener('click', exportData);
        
        contentEl = workspace.querySelector('.rx-workspace__content');
        return workspace;
    }
    
    /**
     * Set active category
     */
    function setActiveCategory(categoryKey) {
        if (!categories[categoryKey]) return;
        
        activeCategory = categoryKey;
        
        // Update nav state
        sidebarEl.querySelectorAll('.rx-nav-link').forEach(link => {
            link.classList.toggle('rx-nav-link--active', link.dataset.category === categoryKey);
        });
        
        // Update header
        const category = categories[categoryKey];
        const header = workspaceEl.querySelector('.rx-workspace__header');
        header.querySelector('.rx-workspace__title').textContent = category.label;
        header.querySelector('.rx-workspace__subtitle').textContent = 
            category.description || `${category.metricCount} metrics`;
        
        renderCategoryContent(categoryKey);
    }
    
    /**
     * Render category content
     */
    function renderCategoryContent(categoryKey) {
        const category = categories[categoryKey];
        if (!category) return;
        
        contentEl.innerHTML = '';
        
        if (categoryKey === 'summary') {
            renderSummary();
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
        
        if (category.metrics) {
            // Check if this category supports advanced rendering
            const supportsAdvanced = hasAdvancedRenderer(categoryKey);
            const currentMode = viewModes[categoryKey] || (supportsAdvanced ? 'v2' : 'v1');
            
            console.log(`[AdvancedMetrics] Category: ${categoryKey}, supportsAdvanced: ${supportsAdvanced}, currentMode: ${currentMode}`);
            
            // Render view mode toggle if supported
            if (supportsAdvanced) {
                const toggleContainer = document.createElement('div');
                toggleContainer.className = 'rx-view-toggle-container';
                toggleContainer.style.cssText = 'display: flex; justify-content: flex-end; margin-bottom: 16px;';
                
                const toggle = createViewModeToggle(categoryKey, currentMode, (newMode) => {
                    viewModes[categoryKey] = newMode;
                    localStorage.setItem(`rx-view-mode-${categoryKey}`, newMode);
                    renderCategoryContent(categoryKey);
                });
                
                if (toggle) {
                    toggleContainer.appendChild(toggle);
                    contentEl.appendChild(toggleContainer);
                    console.log(`[AdvancedMetrics] Toggle rendered for ${categoryKey}`);
                }
            }
            
            // Render metrics based on view mode
            if (currentMode === 'v2' && supportsAdvanced) {
                const metricsContainer = document.createElement('div');
                renderAdvancedMetrics(metricsContainer, categoryKey, category.metrics);
                contentEl.appendChild(metricsContainer);
            } else {
                renderMetricsPanel(category);
            }
        }
    }
    
    /**
     * Render summary
     */
    function renderSummary() {
        const totalMetrics = Object.values(categories).reduce((sum, cat) => 
            sum + (cat.metricCount || 0), 0);
        const highRiskCount = Object.values(categories).reduce((sum, cat) => 
            sum + (cat.riskSummary?.high || 0), 0);
        const mediumRiskCount = Object.values(categories).reduce((sum, cat) => 
            sum + (cat.riskSummary?.medium || 0), 0);
        
        // Stats panel
        const statsPanel = document.createElement('div');
        statsPanel.className = 'rx-panel';
        statsPanel.innerHTML = `
            <div class="rx-stats">
                <div class="rx-stat">
                    <span class="rx-stat__value">${Object.keys(categories).length}</span>
                    <span class="rx-stat__label">Categories</span>
                </div>
                <div class="rx-stat">
                    <span class="rx-stat__value">${totalMetrics}</span>
                    <span class="rx-stat__label">Total Metrics</span>
                </div>
                <div class="rx-stat rx-stat--danger">
                    <span class="rx-stat__value">${highRiskCount}</span>
                    <span class="rx-stat__label">High Risk</span>
                </div>
                <div class="rx-stat rx-stat--warning">
                    <span class="rx-stat__value">${mediumRiskCount}</span>
                    <span class="rx-stat__label">Medium Risk</span>
                </div>
            </div>
        `;
        contentEl.appendChild(statsPanel);
        
        // Alerts
        if (data.suspiciousIndicators?.length > 0) {
            contentEl.appendChild(createAlert('warning',
                `${data.suspiciousIndicators.length} suspicious indicators detected`,
                'Review the Suspicious Signals section for details.'
            ));
        }
        
        const agentResultsRaw = data.knownAgentsDetection?.results 
            || data.knownAgentsDetection?.detectionResults 
            || [];
        const agentResults = Array.isArray(agentResultsRaw) ? agentResultsRaw : [];
        const detectedAgents = agentResults.filter(r => r.detected);
        if (detectedAgents.length > 0) {
            contentEl.appendChild(createAlert('danger',
                `${detectedAgents.length} automation agent(s) detected`,
                detectedAgents.map(a => a.agent || a.name).join(', ')
            ));
        }
        
        // Category cards
        const cardsPanel = document.createElement('div');
        cardsPanel.className = 'rx-panel';
        cardsPanel.innerHTML = `
            <div class="rx-panel__header">
                <h2 class="rx-panel__title">${getIcon('layers')} Category Overview</h2>
            </div>
            <div class="rx-panel__content">
                <div class="rx-category-grid"></div>
            </div>
        `;
        
        const grid = cardsPanel.querySelector('.rx-category-grid');
        Object.values(categories)
            .filter(cat => cat.key !== 'summary')
            .forEach(cat => {
                const card = document.createElement('button');
                card.className = 'rx-category-card';
                card.dataset.category = cat.key;
                card.innerHTML = `
                    <div class="rx-category-card__header">
                        <span class="rx-category-card__icon">${getCategoryIcon(cat.key)}</span>
                        <span class="rx-category-card__name">${escapeHtml(cat.label)}</span>
                    </div>
                    <div class="rx-category-card__meta">
                        <span>${cat.metricCount} metrics</span>
                        ${cat.riskSummary?.high ? `<span class="rx-category-card__alert">● ${cat.riskSummary.high} alerts</span>` : ''}
                    </div>
                `;
                card.addEventListener('click', () => setActiveCategory(cat.key));
                grid.appendChild(card);
            });
        
        contentEl.appendChild(cardsPanel);
    }
    
    /**
     * Render suspicious indicators
     */
    function renderSuspiciousIndicators(indicators, summary) {
        if (!indicators || indicators.length === 0) {
            contentEl.appendChild(createEmptyState('No suspicious indicators detected'));
            return;
        }
        
        const riskLevel = summary?.riskLevel || 'MEDIUM';
        const alertType = riskLevel === 'HIGH' ? 'danger' : riskLevel === 'MEDIUM' ? 'warning' : 'info';
        contentEl.appendChild(createAlert(alertType,
            `Risk Level: ${riskLevel}`,
            `${indicators.length} suspicious indicator(s) found.`
        ));
        
        const panel = document.createElement('div');
        panel.className = 'rx-panel rx-panel--flush';
        panel.innerHTML = `
            <div class="rx-panel__header">
                <h2 class="rx-panel__title">${getIcon('shieldAlert')} Detected Indicators</h2>
                <span class="rx-panel__badge">${indicators.length}</span>
            </div>
            <div class="rx-panel__content"></div>
        `;
        
        const content = panel.querySelector('.rx-panel__content');
        indicators.forEach((indicator, i) => {
            const row = document.createElement('div');
            row.style.cssText = `
                padding: var(--rx-space-4) var(--rx-space-5);
                border-bottom: 1px solid var(--rx-border-subtle);
                display: flex;
                align-items: flex-start;
                gap: var(--rx-space-3);
            `;
            row.innerHTML = `
                <span class="rx-risk rx-risk--${(indicator.risk || 'medium').toLowerCase()}">${indicator.risk || 'MEDIUM'}</span>
                <div style="flex: 1;">
                    <div style="font-weight: var(--rx-weight-medium); color: var(--rx-text-primary); margin-bottom: var(--rx-space-1);">
                        ${escapeHtml(indicator.name || indicator.indicator || `Indicator ${i + 1}`)}
                    </div>
                    <div style="font-size: var(--rx-text-sm); color: var(--rx-text-tertiary);">
                        ${escapeHtml(indicator.description || indicator.reason || '')}
                    </div>
                    ${indicator.value !== undefined ? `
                        <div style="margin-top: var(--rx-space-2);">
                            <code class="rx-table__value">${escapeHtml(String(indicator.value))}</code>
                        </div>
                    ` : ''}
                </div>
            `;
            content.appendChild(row);
        });
        
        contentEl.appendChild(panel);
    }
    
    /**
     * Render known agents
     */
    function renderKnownAgents(agentData) {
        if (!agentData) {
            contentEl.appendChild(createEmptyState('No agent detection data'));
            return;
        }
        
        const resultsRaw = agentData.results || agentData.detectionResults || [];
        const results = Array.isArray(resultsRaw) ? resultsRaw : [];
        const detected = results.filter(r => r.detected);
        
        if (detected.length > 0) {
            contentEl.appendChild(createAlert('danger',
                `${detected.length} automation agent(s) detected`,
                'The following tools were identified.'
            ));
        } else {
            contentEl.appendChild(createAlert('success',
                'No known automation agents detected',
                'All detection checks passed.'
            ));
        }
        
        const panel = document.createElement('div');
        panel.className = 'rx-panel rx-panel--flush';
        panel.innerHTML = `
            <div class="rx-panel__header">
                <h2 class="rx-panel__title">${getIcon('agent')} Detection Results</h2>
                <span class="rx-panel__badge">${results.length} checked</span>
            </div>
            <div class="rx-panel__content" style="overflow-x: auto;">
                <table class="rx-table">
                    <thead>
                        <tr>
                            <th>Agent</th>
                            <th>Status</th>
                            <th>Indicators</th>
                        </tr>
                    </thead>
                    <tbody></tbody>
                </table>
            </div>
        `;
        
        const tbody = panel.querySelector('tbody');
        results.forEach(result => {
            const tr = document.createElement('tr');
            tr.innerHTML = `
                <td class="rx-table__name">${escapeHtml(result.agent || result.name || 'Unknown')}</td>
                <td>
                    ${result.detected 
                        ? '<span class="rx-risk rx-risk--high">DETECTED</span>'
                        : '<span class="rx-risk rx-risk--safe">Clear</span>'}
                </td>
                <td style="font-size: var(--rx-text-xs); color: var(--rx-text-tertiary);">
                    ${result.indicators?.length 
                        ? result.indicators.slice(0, 3).map(i => escapeHtml(i.name || i)).join(', ')
                        : '—'}
                </td>
            `;
            tbody.appendChild(tr);
        });
        
        contentEl.appendChild(panel);
    }
    
    /**
     * Render metrics panel
     */
    function renderMetricsPanel(category) {
        const metrics = category.metrics;
        if (!metrics || Object.keys(metrics).length === 0) {
            contentEl.appendChild(createEmptyState('No metrics available'));
            return;
        }
        
        let filteredMetrics = Object.entries(metrics);
        if (searchQuery) {
            filteredMetrics = filteredMetrics.filter(([name, data]) => {
                const text = [
                    name,
                    formatMetricName(name),
                    data.value !== undefined ? String(data.value) : '',
                    data.description || ''
                ].join(' ').toLowerCase();
                return text.includes(searchQuery);
            });
        }
        
        if (filteredMetrics.length === 0) {
            contentEl.appendChild(createEmptyState(`No metrics matching "${searchQuery}"`));
            return;
        }
        
        // Split by risk
        const groupedMetrics = { high: [], medium: [], low: [], none: [] };
        filteredMetrics.forEach(([name, data]) => {
            const risk = (data.risk || 'none').toLowerCase();
            (groupedMetrics[risk] || groupedMetrics.none).push([name, data]);
        });
        
        // High/Medium risk panel
        if (groupedMetrics.high.length > 0 || groupedMetrics.medium.length > 0) {
            const alertMetrics = [...groupedMetrics.high, ...groupedMetrics.medium];
            contentEl.appendChild(createMetricsTable('Attention Required', alertMetrics, true));
        }
        
        // All metrics
        contentEl.appendChild(createMetricsTable('All Metrics', filteredMetrics));
    }
    
    /**
     * Create metrics table
     */
    function createMetricsTable(title, metrics, highlighted = false) {
        const panel = document.createElement('div');
        panel.className = 'rx-panel rx-panel--flush';
        if (highlighted) {
            panel.style.borderColor = 'var(--rx-status-warning-border)';
        }
        
        panel.innerHTML = `
            <div class="rx-panel__header">
                <h2 class="rx-panel__title">
                    ${highlighted ? getIcon('alertTriangle') : ''}
                    ${escapeHtml(title)}
                </h2>
                <span class="rx-panel__badge">${metrics.length}</span>
            </div>
            <div class="rx-panel__content" style="overflow-x: auto;">
                <table class="rx-table">
                    <thead>
                        <tr>
                            <th style="width: 40px;">#</th>
                            <th style="width: 130px;">Key</th>
                            <th style="width: 160px;">Property</th>
                            <th>Value</th>
                            <th style="width: 200px;">Description</th>
                            <th style="width: 80px;">Risk</th>
                        </tr>
                    </thead>
                    <tbody></tbody>
                </table>
            </div>
        `;
        
        const tbody = panel.querySelector('tbody');
        metrics.forEach(([name, data], idx) => {
            const tr = document.createElement('tr');
            
            // Check if this metric should be highlighted from search
            const isHighlighted = highlightedMetrics.has(name);
            if (isHighlighted) {
                tr.classList.add('rx-search-match');
            }
            
            // Format value
            let valueHtml = '';
            const value = data.value;
            if (isImageDataUrl(value)) {
                valueHtml = `<img src="${value}" style="max-width: 80px; max-height: 40px; border-radius: 4px;">`;
            } else if (typeof value === 'object' && value !== null) {
                const json = JSON.stringify(value);
                valueHtml = `<code class="rx-table__value rx-table__value--wrap">${escapeHtml(json)}</code>`;
            } else if (typeof value === 'string' && value.length > 80) {
                valueHtml = `<code class="rx-table__value rx-table__value--wrap">${escapeHtml(value)}</code>`;
            } else {
                valueHtml = `<code class="rx-table__value">${escapeHtml(formatValue(value))}</code>`;
            }
            
            const risk = (data.risk || 'none').toLowerCase();
            const riskConfig = getRiskConfig(risk);
            
            // Highlight matching text in key and name if there's a search query
            const keyDisplay = searchQuery && name.toLowerCase().includes(searchQuery)
                ? highlightMatch(name, searchQuery)
                : escapeHtml(name);
            const nameDisplay = searchQuery && formatMetricName(name).toLowerCase().includes(searchQuery)
                ? highlightMatch(formatMetricName(name), searchQuery)
                : escapeHtml(formatMetricName(name));
            
            tr.innerHTML = `
                <td style="text-align: center; color: var(--rx-text-muted); font-size: var(--rx-text-xs);">${idx + 1}</td>
                <td><span class="rx-table__key" title="${escapeHtml(name)}">${keyDisplay}</span></td>
                <td class="rx-table__name">${nameDisplay}</td>
                <td>${valueHtml}</td>
                <td class="rx-table__desc">${escapeHtml(data.description || '—')}</td>
                <td><span class="rx-risk rx-risk--${risk}">${riskConfig.label}</span></td>
            `;
            
            tbody.appendChild(tr);
        });
        
        return panel;
    }
    
    /**
     * Create alert element
     */
    function createAlert(type, title, message) {
        const iconMap = {
            info: 'info',
            warning: 'alertTriangle',
            danger: 'alertCircle',
            success: 'checkCircle'
        };
        
        const alert = document.createElement('div');
        alert.className = `rx-alert rx-alert--${type}`;
        alert.innerHTML = `
            <span class="rx-alert__icon">${getIcon(iconMap[type] || 'info')}</span>
            <div class="rx-alert__content">
                <div class="rx-alert__title">${escapeHtml(title)}</div>
                <div class="rx-alert__message">${escapeHtml(message)}</div>
            </div>
        `;
        return alert;
    }
    
    /**
     * Create empty state
     */
    function createEmptyState(message) {
        const empty = document.createElement('div');
        empty.className = 'rx-empty';
        empty.innerHTML = `
            <span class="rx-empty__icon">${getIcon('info')}</span>
            <p class="rx-empty__title">${escapeHtml(message)}</p>
        `;
        return empty;
    }
    
    /**
     * Toggle sidebar
     */
    function toggleSidebar() {
        sidebarCollapsed = !sidebarCollapsed;
        sidebarEl.classList.toggle('rx-sidebar--collapsed', sidebarCollapsed);
        document.body.classList.toggle('rx-sidebar-collapsed', sidebarCollapsed);
        localStorage.setItem('rx-sidebar-collapsed', sidebarCollapsed ? 'true' : 'false');
    }
    
    /**
     * Load sidebar state
     */
    function loadSidebarState() {
        if (localStorage.getItem('rx-sidebar-collapsed') === 'true') {
            sidebarCollapsed = true;
            sidebarEl.classList.add('rx-sidebar--collapsed');
            document.body.classList.add('rx-sidebar-collapsed');
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
                searchInputEl?.select();
            }
            
            // Navigate categories with arrow keys (when not in search)
            if ((e.key === 'ArrowUp' || e.key === 'ArrowDown') && 
                document.activeElement === document.body) {
                e.preventDefault();
                navigateCategories(e.key === 'ArrowUp' ? -1 : 1);
            }
            
            // Escape clears search and highlights
            if (e.key === 'Escape') {
                if (searchResultsVisible) {
                    hideSearchResults();
                } else if (document.activeElement === searchInputEl) {
                    clearSearch();
                    searchInputEl.blur();
                }
            }
        });
    }
    
    /**
     * Clear search state
     */
    function clearSearch() {
        searchInputEl.value = '';
        searchQuery = '';
        highlightedMetrics.clear();
        hideSearchResults();
        if (activeCategory) renderCategoryContent(activeCategory);
    }
    
    /**
     * Navigate categories
     */
    function navigateCategories(direction) {
        const keys = Object.keys(categories);
        const currentIdx = keys.indexOf(activeCategory);
        let newIdx = currentIdx + direction;
        if (newIdx < 0) newIdx = keys.length - 1;
        if (newIdx >= keys.length) newIdx = 0;
        setActiveCategory(keys[newIdx]);
    }
    
    /**
     * Export data
     */
    function exportData() {
        const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `fingerprint-${Date.now()}.json`;
        a.click();
        URL.revokeObjectURL(url);
    }
    
    // Initialize
    init();
    
    return {
        setActiveCategory,
        toggleSidebar,
        refresh: () => renderCategoryContent(activeCategory),
        destroy: () => {
            container.innerHTML = '';
            document.body.classList.remove('rx-sidebar-collapsed');
        }
    };
}

