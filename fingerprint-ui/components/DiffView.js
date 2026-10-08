/**
 * Fingerprint UI - Diff View Component
 * Displays fingerprint comparison results with visual diff indicators
 */

import { DiffType } from '../utils/BaselineComparator.js';
import { formatMetricName, formatValue, getJsCode, getCategoryConfig } from '../utils/helpers.js';

/**
 * Diff type visual configuration
 */
const DIFF_CONFIG = {
    [DiffType.DIFFERENT]: {
        icon: '⚡',
        label: 'Changed',
        className: 'diff-changed',
        color: 'var(--fp-warning-500)',
        bgColor: 'var(--fp-warning-50)',
        borderColor: 'var(--fp-warning-200)',
        priority: 1
    },
    [DiffType.MISSING_BASELINE]: {
        icon: '✨',
        label: 'New',
        className: 'diff-new',
        color: 'var(--fp-info-500)',
        bgColor: 'var(--fp-info-50)',
        borderColor: 'var(--fp-info-200)',
        priority: 2
    },
    [DiffType.MISSING_CURRENT]: {
        icon: '🚫',
        label: 'Missing',
        className: 'diff-missing',
        color: 'var(--fp-danger-500)',
        bgColor: 'var(--fp-danger-50)',
        borderColor: 'var(--fp-danger-200)',
        priority: 3
    },
    [DiffType.MATCH]: {
        icon: '✓',
        label: 'Match',
        className: 'diff-match',
        color: 'var(--fp-success-500)',
        bgColor: 'var(--fp-success-50)',
        borderColor: 'var(--fp-success-200)',
        priority: 4
    },
    [DiffType.IGNORED]: {
        icon: '○',
        label: 'Ignored',
        className: 'diff-ignored',
        color: 'var(--fp-gray-400)',
        bgColor: 'var(--fp-gray-50)',
        borderColor: 'var(--fp-gray-200)',
        priority: 5
    }
};

/**
 * Get diff configuration for a diff type
 * @param {string} diffType - The diff type
 * @returns {object} Configuration
 */
export function getDiffConfig(diffType) {
    return DIFF_CONFIG[diffType] || DIFF_CONFIG[DiffType.MATCH];
}

/**
 * Create the diff mode toggle control bar
 * @param {object} options - Toggle options
 * @param {boolean} options.enabled - Initial state
 * @param {Function} options.onChange - Callback when state changes
 * @param {object} options.summary - Comparison summary data
 * @param {object} options.baselineInfo - Baseline information
 * @returns {HTMLElement} Toggle bar element
 */
export function createDiffToggleBar({ enabled = false, onChange, summary = null, baselineInfo = null }) {
    const bar = document.createElement('div');
    bar.className = 'fp-diff-toggle-bar';
    
    console.log('🔧 Creating diff toggle bar:', { enabled, summary, baselineInfo });
    
    bar.innerHTML = `
        <div class="fp-diff-toggle-bar__left">
            <div class="fp-diff-toggle">
                <label class="fp-diff-toggle__label" for="fp-diff-mode-toggle">
                    <span class="fp-diff-toggle__icon">🔍</span>
                    <span class="fp-diff-toggle__text">Show Differences Only</span>
                </label>
                <div class="fp-diff-toggle__switch">
                    <input type="checkbox" id="fp-diff-mode-toggle" ${enabled ? 'checked' : ''}>
                    <span class="fp-diff-toggle__slider"></span>
                </div>
            </div>
            ${baselineInfo ? `
                <div class="fp-diff-baseline-info" title="Comparing against baseline fingerprint">
                    <span class="fp-diff-baseline-info__icon">📋</span>
                    <span class="fp-diff-baseline-info__text">Baseline: Chrome (${baselineInfo.formattedDate})</span>
                </div>
            ` : ''}
        </div>
        <div class="fp-diff-toggle-bar__right">
            ${summary ? createDiffSummaryBadges(summary) : ''}
        </div>
    `;
    
    // Attach event listener
    const toggle = bar.querySelector('#fp-diff-mode-toggle');
    console.log('🔧 Toggle element found:', toggle);
    
    if (toggle) {
        toggle.addEventListener('change', (e) => {
            console.log('🔄 Toggle changed:', e.target.checked);
            if (onChange) onChange(e.target.checked);
        });
    }
    
    return bar;
}

/**
 * Create summary badges for diff statistics
 * @param {object} summary - Comparison summary
 * @returns {string} HTML string
 */
function createDiffSummaryBadges(summary) {
    const badges = [];
    
    if (summary.totalDifferences > 0) {
        badges.push(`
            <span class="fp-diff-badge fp-diff-badge--changed" title="${summary.totalDifferences} metrics changed">
                ⚡ ${summary.totalDifferences} changed
            </span>
        `);
    }
    
    if (summary.totalNew > 0) {
        badges.push(`
            <span class="fp-diff-badge fp-diff-badge--new" title="${summary.totalNew} new metrics">
                ✨ ${summary.totalNew} new
            </span>
        `);
    }
    
    if (summary.totalMissing > 0) {
        badges.push(`
            <span class="fp-diff-badge fp-diff-badge--missing" title="${summary.totalMissing} missing metrics">
                🚫 ${summary.totalMissing} missing
            </span>
        `);
    }
    
    if (summary.totalMatches > 0) {
        badges.push(`
            <span class="fp-diff-badge fp-diff-badge--match" title="${summary.totalMatches} metrics match baseline">
                ✓ ${summary.totalMatches} match
            </span>
        `);
    }
    
    badges.push(`
        <span class="fp-diff-badge fp-diff-badge--percentage" title="${summary.differencePercentage}% of metrics differ from baseline">
            ${summary.differencePercentage}% different
        </span>
    `);
    
    return badges.join('');
}

/**
 * Update the summary badges in an existing toggle bar
 * @param {HTMLElement} bar - The toggle bar element
 * @param {object} summary - New summary data
 */
export function updateDiffSummary(bar, summary) {
    const rightSection = bar.querySelector('.fp-diff-toggle-bar__right');
    if (rightSection && summary) {
        rightSection.innerHTML = createDiffSummaryBadges(summary);
    }
}

/**
 * Create a diff metrics table (shows only differences)
 * @param {object} diffMetrics - Diff metrics from BaselineComparator
 * @param {string} categoryKey - The category key
 * @returns {HTMLElement} Table element
 */
export function createDiffMetricsTable(diffMetrics, categoryKey) {
    const table = document.createElement('table');
    table.className = 'fp-metrics-table fp-metrics-table--diff';
    
    // Create header with diff columns
    const thead = document.createElement('thead');
    thead.innerHTML = `
        <tr>
            <th style="width: 40px;">#</th>
            <th style="width: 60px;">Status</th>
            <th style="width: 160px;">Metric</th>
            <th style="width: 200px;">Current Value</th>
            <th style="width: 200px;">Baseline Value</th>
            <th style="width: 200px;">Description</th>
        </tr>
    `;
    table.appendChild(thead);
    
    // Create body
    const tbody = document.createElement('tbody');
    
    // Sort by priority (changes first, then new, then missing)
    const sortedMetrics = Object.entries(diffMetrics)
        .sort(([, a], [, b]) => {
            const priorityA = getDiffConfig(a.type).priority;
            const priorityB = getDiffConfig(b.type).priority;
            return priorityA - priorityB;
        });
    
    let index = 1;
    for (const [metricName, metricResult] of sortedMetrics) {
        const row = createDiffMetricRow(index++, metricName, metricResult, categoryKey);
        tbody.appendChild(row);
    }
    
    if (sortedMetrics.length === 0) {
        const emptyRow = document.createElement('tr');
        emptyRow.innerHTML = `
            <td colspan="6" style="text-align: center; padding: var(--fp-spacing-lg); color: var(--fp-gray-500);">
                <div style="font-size: 1.5rem; margin-bottom: var(--fp-spacing-sm);">✅</div>
                All metrics match baseline
            </td>
        `;
        tbody.appendChild(emptyRow);
    }
    
    table.appendChild(tbody);
    return table;
}

/**
 * Create a single diff metric row
 * @param {number} index - Row number
 * @param {string} metricName - The metric name
 * @param {object} metricResult - The comparison result
 * @param {string} categoryKey - The category key
 * @returns {HTMLTableRowElement} Table row element
 */
function createDiffMetricRow(index, metricName, metricResult, categoryKey) {
    const row = document.createElement('tr');
    const config = getDiffConfig(metricResult.type);
    
    row.className = `fp-diff-row fp-diff-row--${config.className}`;
    
    // Number cell
    const numCell = document.createElement('td');
    numCell.style.textAlign = 'center';
    numCell.style.fontWeight = '600';
    numCell.style.color = 'var(--fp-gray-400)';
    numCell.style.fontFamily = 'var(--fp-font-mono)';
    numCell.textContent = index;
    
    // Status badge cell
    const statusCell = document.createElement('td');
    statusCell.innerHTML = `
        <span class="fp-diff-status fp-diff-status--${config.className}" title="${metricResult.message}">
            ${config.icon}
        </span>
    `;
    
    // Name cell
    const nameCell = document.createElement('td');
    nameCell.innerHTML = `<span class="fp-metric-name">${formatMetricName(metricName)}</span>`;
    
    // Current value cell
    const currentCell = document.createElement('td');
    currentCell.className = 'fp-diff-value fp-diff-value--current';
    if (metricResult.currentValue === null || metricResult.currentValue === undefined) {
        currentCell.innerHTML = `<span class="fp-diff-na">—</span>`;
    } else {
        currentCell.appendChild(createDiffValueElement(metricResult.currentValue, metricResult.type, 'current'));
    }
    
    // Baseline value cell
    const baselineCell = document.createElement('td');
    baselineCell.className = 'fp-diff-value fp-diff-value--baseline';
    if (metricResult.baselineValue === null || metricResult.baselineValue === undefined) {
        baselineCell.innerHTML = `<span class="fp-diff-na">—</span>`;
    } else {
        baselineCell.appendChild(createDiffValueElement(metricResult.baselineValue, metricResult.type, 'baseline'));
    }
    
    // Description cell
    const descCell = document.createElement('td');
    descCell.innerHTML = `<span class="fp-metric-description">${escapeHtml(metricResult.message)}</span>`;
    
    row.appendChild(numCell);
    row.appendChild(statusCell);
    row.appendChild(nameCell);
    row.appendChild(currentCell);
    row.appendChild(baselineCell);
    row.appendChild(descCell);
    
    return row;
}

/**
 * Create a value element for diff display
 * @param {any} value - The value
 * @param {string} diffType - The diff type
 * @param {string} side - 'current' or 'baseline'
 * @returns {HTMLElement} Value element
 */
function createDiffValueElement(value, diffType, side) {
    const span = document.createElement('span');
    span.className = `fp-metric-value fp-diff-value-text fp-diff-value-text--${side}`;
    
    // Add highlight for changed values
    if (diffType === DiffType.DIFFERENT) {
        span.classList.add('fp-diff-value-text--highlighted');
    }
    
    span.textContent = formatValue(value, 50);
    span.title = String(value);
    
    return span;
}

/**
 * Create a diff section (category) with expanded diff view
 * @param {object} options - Section options
 * @param {string} options.categoryKey - The category key
 * @param {object} options.categoryDiff - Category diff data
 * @param {boolean} options.expanded - Initial expanded state
 * @returns {HTMLElement} Section element
 */
export function createDiffSection({ categoryKey, categoryDiff, expanded = true }) {
    const config = getCategoryConfig(categoryKey);
    const summary = categoryDiff.summary;
    
    const section = document.createElement('div');
    section.className = `fp-section fp-section--${categoryKey} fp-section--diff${expanded ? ' fp-section--expanded' : ''}`;
    section.dataset.category = categoryKey;
    
    // Determine section status
    let statusIcon = '✅';
    let statusClass = 'match';
    if (summary.differences > 0 || summary.new > 0 || summary.missing > 0) {
        statusIcon = '⚡';
        statusClass = 'changed';
    }
    
    // Create header
    const header = document.createElement('div');
    header.className = 'fp-section__header fp-section__header--diff';
    header.setAttribute('role', 'button');
    header.setAttribute('aria-expanded', expanded ? 'true' : 'false');
    header.setAttribute('tabindex', '0');
    
    header.innerHTML = `
        <div class="fp-section__icon" aria-hidden="true">${config.icon}</div>
        <div class="fp-section__title-group">
            <h3 class="fp-section__title">${config.label}</h3>
            <p class="fp-section__subtitle">
                ${summary.differences > 0 ? `<span class="fp-diff-count fp-diff-count--changed">${summary.differences} changed</span>` : ''}
                ${summary.new > 0 ? `<span class="fp-diff-count fp-diff-count--new">${summary.new} new</span>` : ''}
                ${summary.missing > 0 ? `<span class="fp-diff-count fp-diff-count--missing">${summary.missing} missing</span>` : ''}
                ${summary.differences === 0 && summary.new === 0 && summary.missing === 0 ? 
                    '<span class="fp-diff-count fp-diff-count--match">All match baseline</span>' : ''}
            </p>
        </div>
        <div class="fp-section__meta">
            <span class="fp-section__diff-status fp-section__diff-status--${statusClass}" title="${summary.filteredCount || summary.total} metrics to review">
                ${statusIcon}
            </span>
            <span class="fp-section__count" title="${summary.filteredCount || summary.total} metrics">${summary.filteredCount || summary.total}</span>
            <div class="fp-section__toggle">
                <svg class="fp-section__toggle-icon fp-chevron" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                    <polyline points="6 9 12 15 18 9"></polyline>
                </svg>
            </div>
        </div>
    `;
    
    // Create content wrapper
    const contentWrapper = document.createElement('div');
    contentWrapper.className = 'fp-section__content';
    
    const contentInner = document.createElement('div');
    contentInner.className = 'fp-section__inner';
    
    // Create diff table
    const table = createDiffMetricsTable(categoryDiff.metrics, categoryKey);
    contentInner.appendChild(table);
    
    contentWrapper.appendChild(contentInner);
    
    // Toggle functionality
    const toggleSection = () => {
        const isExpanded = section.classList.toggle('fp-section--expanded');
        header.setAttribute('aria-expanded', isExpanded ? 'true' : 'false');
    };
    
    header.addEventListener('click', toggleSection);
    header.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault();
            toggleSection();
        }
    });
    
    section.appendChild(header);
    section.appendChild(contentWrapper);
    
    return section;
}

/**
 * Create the empty state when no differences found
 * @returns {HTMLElement} Empty state element
 */
export function createNoDifferencesState() {
    const container = document.createElement('div');
    container.className = 'fp-diff-empty-state';
    
    container.innerHTML = `
        <div class="fp-diff-empty-state__icon">🎉</div>
        <h3 class="fp-diff-empty-state__title">Perfect Match!</h3>
        <p class="fp-diff-empty-state__text">
            All fingerprint metrics match the baseline Chrome values.
            Your browser appears to have a standard configuration.
        </p>
        <div class="fp-diff-empty-state__action">
            <button class="fp-btn fp-btn--outline" id="fp-show-all-metrics">
                View All Metrics
            </button>
        </div>
    `;
    
    return container;
}

/**
 * Create a comparison overview card
 * @param {object} comparisonResult - Full comparison result
 * @returns {HTMLElement} Overview card element
 */
export function createDiffOverviewCard(comparisonResult) {
    const summary = comparisonResult.summary;
    const card = document.createElement('div');
    card.className = 'fp-diff-overview';
    
    // Calculate match percentage
    const matchPercentage = 100 - summary.differencePercentage;
    
    // Determine status
    let statusClass = 'good';
    let statusText = 'Standard Browser';
    let statusIcon = '✅';
    
    if (summary.differencePercentage > 30) {
        statusClass = 'warning';
        statusText = 'Notable Differences';
        statusIcon = '⚠️';
    } else if (summary.differencePercentage > 50) {
        statusClass = 'danger';
        statusText = 'Significant Differences';
        statusIcon = '🔴';
    }
    
    card.innerHTML = `
        <div class="fp-diff-overview__header">
            <span class="fp-diff-overview__icon">${statusIcon}</span>
            <div class="fp-diff-overview__title-group">
                <h3 class="fp-diff-overview__title">Baseline Comparison</h3>
                <p class="fp-diff-overview__subtitle">Compared against standard Chrome fingerprint</p>
            </div>
        </div>
        <div class="fp-diff-overview__stats">
            <div class="fp-diff-stat">
                <div class="fp-diff-stat__value fp-diff-stat__value--primary">${matchPercentage}%</div>
                <div class="fp-diff-stat__label">Match Rate</div>
            </div>
            <div class="fp-diff-stat">
                <div class="fp-diff-stat__value fp-diff-stat__value--changed">${summary.totalDifferences}</div>
                <div class="fp-diff-stat__label">Changed</div>
            </div>
            <div class="fp-diff-stat">
                <div class="fp-diff-stat__value fp-diff-stat__value--new">${summary.totalNew}</div>
                <div class="fp-diff-stat__label">New</div>
            </div>
            <div class="fp-diff-stat">
                <div class="fp-diff-stat__value fp-diff-stat__value--missing">${summary.totalMissing}</div>
                <div class="fp-diff-stat__label">Missing</div>
            </div>
            <div class="fp-diff-stat">
                <div class="fp-diff-stat__value">${summary.totalMetrics}</div>
                <div class="fp-diff-stat__label">Total Metrics</div>
            </div>
        </div>
        <div class="fp-diff-overview__status fp-diff-overview__status--${statusClass}">
            ${statusText}
        </div>
    `;
    
    return card;
}

/**
 * Escape HTML characters
 * @param {string} str - String to escape
 * @returns {string} Escaped string
 */
function escapeHtml(str) {
    if (typeof str !== 'string') return String(str);
    const div = document.createElement('div');
    div.textContent = str;
    return div.innerHTML;
}

// Export all components
export default {
    createDiffToggleBar,
    createDiffMetricsTable,
    createDiffSection,
    createNoDifferencesState,
    createDiffOverviewCard,
    updateDiffSummary,
    getDiffConfig
};
