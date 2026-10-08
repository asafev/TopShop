/**
 * Fingerprint UI - Metrics Table Component
 * Renders metrics in a table format with error handling
 */

import { formatMetricName, formatValue, getJsCode, getRiskConfig, isImageDataUrl, createErrorElement } from '../utils/helpers.js';
import { showDetailModal } from './DetailModal.js';

// Map of metrics that have detailed drill-down data
const DETAIL_METRICS = {
    // Fonts category
    'fontsCount': { detailKey: 'fonts', detailType: 'fonts', title: 'Detected Fonts' },
    'fontHash': { detailKey: 'fonts', detailType: 'fonts', title: 'Detected Fonts' },
    'fontsApplicationsDetected': { detailKey: 'applications', detailType: 'applications', title: 'Detected Applications' },
    'fontsApplicationsList': { detailKey: 'applications', detailType: 'applications', title: 'Detected Applications' },
    'fontsEmojiSupported': { detailKey: 'emoji', detailType: 'emoji', title: 'Emoji Rendering Details' },
    'fontsEmojiAvgPixels': { detailKey: 'emoji', detailType: 'emoji', title: 'Emoji Rendering Details' },
    'fontsEmojiRunningHash': { detailKey: 'emoji', detailType: 'emoji', title: 'Emoji Rendering Details' },
    'fontsEmojiHash': { detailKey: 'emoji', detailType: 'emoji', title: 'Emoji Rendering Details' },
    'fontsPlatformOS': { detailKey: 'platform', detailType: 'json', title: 'Platform Detection Details' },
    'fontsPlatformVersion': { detailKey: 'platform', detailType: 'json', title: 'Platform Detection Details' },
    'fontsPlatformConfidence': { detailKey: 'platform', detailType: 'json', title: 'Platform Detection Details' },
};

// Store for raw result data (set externally)
let rawResultsStore = {};

/**
 * Set the raw results data for detail lookups
 * @param {object} results - The raw fingerprint results
 */
export function setRawResults(results) {
    rawResultsStore = results || {};
}

/**
 * Create a metrics table for a category
 * @param {object} metrics - The metrics object for this category
 * @param {string} categoryKey - The category key
 * @param {object} rawData - Optional raw data for this category (for details)
 * @param {object} options - Table options
 * @param {string[]} options.visibleColumns - Array of visible column keys ['key', 'name', 'value', 'description', 'code', 'risk']
 * @param {Function} options.filterFn - Optional filter function (categoryKey, metricName, metricData) => boolean
 * @returns {HTMLElement} Table element
 */
export function createMetricsTable(metrics, categoryKey, rawData = null, options = {}) {
    // Store raw data if provided
    if (rawData) {
        rawResultsStore[categoryKey] = rawData;
    }
    
    const {
        visibleColumns = ['key', 'name', 'value', 'description', 'code', 'risk'],
        filterFn = null
    } = options;
    
    // Filter metrics if filter function provided
    let filteredMetrics = metrics;
    if (filterFn) {
        filteredMetrics = {};
        for (const [metricName, metricData] of Object.entries(metrics)) {
            if (filterFn(categoryKey, metricName, metricData)) {
                filteredMetrics[metricName] = metricData;
            }
        }
    }
    
    // Create wrapper for responsive table
    const wrapper = document.createElement('div');
    wrapper.className = 'fp-table-wrapper';
    wrapper.style.cssText = 'overflow-x: auto; -webkit-overflow-scrolling: touch;';
    
    const table = document.createElement('table');
    table.className = 'fp-metrics-table';
    table.setAttribute('role', 'table');
    table.setAttribute('aria-label', `${categoryKey} metrics`);
    
    // Column definitions
    const columns = [
        { key: 'index', label: '#', width: '44px', align: 'center', alwaysVisible: true },
        { key: 'key', label: 'Property Key', width: '150px', align: 'left' },
        { key: 'name', label: 'Metric Name', width: '180px', align: 'left' },
        { key: 'value', label: 'Current Value', width: '220px', align: 'left' },
        { key: 'description', label: 'Description', width: '240px', align: 'left' },
        { key: 'code', label: 'API Reference', width: '200px', align: 'left' },
        { key: 'risk', label: 'Risk Level', width: '90px', align: 'center' }
    ];
    
    // Create header with improved accessibility
    const thead = document.createElement('thead');
    const headerRow = document.createElement('tr');
    headerRow.setAttribute('role', 'row');
    
    columns.forEach(col => {
        if (col.alwaysVisible || visibleColumns.includes(col.key)) {
            const th = document.createElement('th');
            th.setAttribute('role', 'columnheader');
            th.setAttribute('scope', 'col');
            th.setAttribute('data-column', col.key);
            th.style.width = col.width;
            th.style.textAlign = col.align;
            th.textContent = col.label;
            headerRow.appendChild(th);
        }
    });
    
    thead.appendChild(headerRow);
    table.appendChild(thead);
    
    // Create body
    const tbody = document.createElement('tbody');
    tbody.setAttribute('role', 'rowgroup');
    
    let index = 1;
    for (const [metricName, metricData] of Object.entries(filteredMetrics)) {
        try {
            const row = createMetricRow(index++, metricName, metricData, categoryKey, visibleColumns);
            tbody.appendChild(row);
        } catch (error) {
            console.error(`Error rendering metric "${metricName}":`, error);
            const errorRow = createErrorRow(index++, metricName, error, visibleColumns);
            tbody.appendChild(errorRow);
        }
    }
    
    table.appendChild(tbody);
    wrapper.appendChild(table);
    
    // Store reference for column visibility updates
    wrapper.updateColumnVisibility = (newVisibleColumns) => {
        updateTableColumnVisibility(table, columns, newVisibleColumns);
    };
    
    return wrapper;
}

/**
 * Update table column visibility
 * @param {HTMLTableElement} table - Table element
 * @param {Array} columns - Column definitions
 * @param {string[]} visibleColumns - New visible columns
 */
function updateTableColumnVisibility(table, columns, visibleColumns) {
    // Update header
    const headerRow = table.querySelector('thead tr');
    if (headerRow) {
        headerRow.innerHTML = '';
        columns.forEach(col => {
            if (col.alwaysVisible || visibleColumns.includes(col.key)) {
                const th = document.createElement('th');
                th.setAttribute('role', 'columnheader');
                th.setAttribute('scope', 'col');
                th.setAttribute('data-column', col.key);
                th.style.width = col.width;
                th.style.textAlign = col.align;
                th.textContent = col.label;
                headerRow.appendChild(th);
            }
        });
    }
    
    // Update body rows
    const rows = table.querySelectorAll('tbody tr');
    rows.forEach(row => {
        const cells = Array.from(row.querySelectorAll('td'));
        cells.forEach((cell, idx) => {
            const columnKey = cell.dataset.column;
            if (columnKey) {
                const shouldShow = columns.find(c => c.key === columnKey)?.alwaysVisible || 
                                 visibleColumns.includes(columnKey);
                cell.style.display = shouldShow ? '' : 'none';
            }
        });
    });
}

/**
 * Create a single metric row
 * @param {number} index - Row number
 * @param {string} metricName - The metric name
 * @param {object} metricData - The metric data
 * @param {string} categoryKey - The category key
 * @param {string[]} visibleColumns - Visible columns array
 * @returns {HTMLTableRowElement} Table row element
 */
function createMetricRow(index, metricName, metricData, categoryKey, visibleColumns = ['key', 'name', 'value', 'description', 'code', 'risk']) {
    const row = document.createElement('tr');
    row.setAttribute('data-metric-name', metricName);
    row.setAttribute('data-category', categoryKey);
    
    // Safely extract values with defaults
    const value = metricData?.value !== undefined ? metricData.value : metricData;
    const description = metricData?.description || 'No description available';
    const risk = metricData?.risk || 'N/A';
    
    const riskConfig = getRiskConfig(risk);
    
    // Number cell (always visible)
    const numCell = document.createElement('td');
    numCell.setAttribute('data-column', 'index');
    numCell.style.textAlign = 'center';
    numCell.style.fontWeight = '600';
    numCell.style.color = 'var(--fp-gray-400)';
    numCell.style.fontFamily = 'var(--fp-font-mono)';
    numCell.textContent = index;
    row.appendChild(numCell);
    
    // Property Key cell - small black box with exact property name
    if (visibleColumns.includes('key')) {
        const keyCell = document.createElement('td');
        keyCell.setAttribute('data-column', 'key');
        const keyBadge = document.createElement('span');
        keyBadge.className = 'fp-property-key';
        keyBadge.textContent = metricName;
        keyBadge.title = `Property key: ${metricName}`;
        keyBadge.style.cssText = `
            display: inline-block;
            background: #1a1a1a;
            color: #e0e0e0;
            font-family: 'JetBrains Mono', 'Consolas', 'Monaco', monospace;
            font-size: 0.75rem;
            font-weight: 500;
            padding: 3px 8px;
            border-radius: 4px;
            max-width: 140px;
            overflow: hidden;
            text-overflow: ellipsis;
            white-space: nowrap;
            cursor: default;
            user-select: all;
        `;
        keyCell.appendChild(keyBadge);
        row.appendChild(keyCell);
    }
    
    // Name cell
    if (visibleColumns.includes('name')) {
        const nameCell = document.createElement('td');
        nameCell.setAttribute('data-column', 'name');
        nameCell.innerHTML = `<span class="fp-metric-name">${formatMetricName(metricName)}</span>`;
        row.appendChild(nameCell);
    }
    
    // Value cell
    if (visibleColumns.includes('value')) {
        const valueCell = document.createElement('td');
        valueCell.setAttribute('data-column', 'value');
        valueCell.appendChild(createValueElement(value, metricName, categoryKey));
        row.appendChild(valueCell);
    }
    
    // Description cell
    if (visibleColumns.includes('description')) {
        const descCell = document.createElement('td');
        descCell.setAttribute('data-column', 'description');
        descCell.innerHTML = `<span class="fp-metric-description">${escapeHtml(description)}</span>`;
        row.appendChild(descCell);
    }
    
    // JS Code cell
    if (visibleColumns.includes('code')) {
        const codeCell = document.createElement('td');
        codeCell.setAttribute('data-column', 'code');
        const code = getJsCode(metricName, categoryKey);
        codeCell.innerHTML = `<code class="fp-metric-code">${escapeHtml(code)}</code>`;
        row.appendChild(codeCell);
    }
    
    // Risk cell
    if (visibleColumns.includes('risk')) {
        const riskCell = document.createElement('td');
        riskCell.setAttribute('data-column', 'risk');
        riskCell.innerHTML = `
            <span class="fp-risk-badge fp-risk-badge--${riskConfig.className}">
                ${riskConfig.icon} ${riskConfig.label}
            </span>
        `;
        row.appendChild(riskCell);
    }
    
    return row;
}

/**
 * Create a value display element with special handling for images and clickable details
 * @param {any} value - The value to display
 * @param {string} metricName - The metric name
 * @param {string} categoryKey - The category key
 * @returns {HTMLElement} Value element
 */
function createValueElement(value, metricName, categoryKey) {
    // Handle image data URLs (WebGL screenshots)
    if (isImageDataUrl(value)) {
        const wrapper = document.createElement('div');
        const img = document.createElement('img');
        img.src = value;
        img.className = 'fp-metric-image';
        img.alt = `${metricName} visualization`;
        img.title = 'Click to view full size';
        img.style.cursor = 'pointer';
        img.addEventListener('click', () => {
            window.open(value, '_blank');
        });
        wrapper.appendChild(img);
        return wrapper;
    }
    
    // Handle boolean values with color coding
    const span = document.createElement('span');
    span.className = 'fp-metric-value';
    
    if (typeof value === 'boolean') {
        span.classList.add(value ? 'fp-metric-value--success' : 'fp-metric-value--danger');
    }
    
    const fullValueStr = String(value);
    span.textContent = formatValue(value);
    span.title = `Click to copy: ${fullValueStr.length > 100 ? fullValueStr.substring(0, 100) + '...' : fullValueStr}`;
    span.dataset.fullValue = fullValueStr; // Store full value for copying
    
    // Check if this metric has detailed data available
    const detailConfig = DETAIL_METRICS[metricName];
    let hasDetailModal = false;
    
    if (detailConfig && rawResultsStore[categoryKey]) {
        const detailData = rawResultsStore[categoryKey][detailConfig.detailKey];
        if (detailData && (Array.isArray(detailData) ? detailData.length > 0 : detailData)) {
            hasDetailModal = true;
            span.classList.add('fp-metric-value--clickable');
            span.title = 'Click to view details';
            span.innerHTML = `${formatValue(value)} <span class="fp-detail-icon">🔍</span>`;
            span.addEventListener('click', () => {
                showDetailModal({
                    title: detailConfig.title,
                    metricName: metricName,
                    value: value,
                    details: detailData,
                    detailType: detailConfig.detailType
                });
            });
        }
    }
    
    // Add click-to-copy functionality for regular metrics (not detail modals)
    if (!hasDetailModal) {
        span.addEventListener('click', async () => {
            try {
                await navigator.clipboard.writeText(fullValueStr);
                // Visual feedback
                const originalBg = span.style.background;
                const originalTitle = span.title;
                span.style.background = 'var(--fp-success-100, #d1fae5)';
                span.title = 'Copied!';
                setTimeout(() => {
                    span.style.background = originalBg;
                    span.title = originalTitle;
                }, 1000);
            } catch (err) {
                console.warn('Copy failed:', err);
            }
        });
    }
    
    return span;
}

/**
 * Create an error row for failed metric rendering
 * @param {number} index - Row number
 * @param {string} metricName - The metric name
 * @param {Error} error - The error
 * @param {string[]} visibleColumns - Visible columns array
 * @returns {HTMLTableRowElement} Error row element
 */
function createErrorRow(index, metricName, error, visibleColumns = ['key', 'name', 'value', 'description', 'code', 'risk']) {
    const row = document.createElement('tr');
    row.style.backgroundColor = 'var(--fp-danger-50)';
    
    const numCell = document.createElement('td');
    numCell.setAttribute('data-column', 'index');
    numCell.textContent = index;
    numCell.style.textAlign = 'center';
    row.appendChild(numCell);
    
    // Property Key cell for error rows
    if (visibleColumns.includes('key')) {
        const keyCell = document.createElement('td');
        keyCell.setAttribute('data-column', 'key');
        const keyBadge = document.createElement('span');
        keyBadge.className = 'fp-property-key';
        keyBadge.textContent = metricName;
        keyBadge.style.cssText = `
            display: inline-block;
            background: #1a1a1a;
            color: #e0e0e0;
            font-family: 'JetBrains Mono', 'Consolas', 'Monaco', monospace;
            font-size: 0.75rem;
            font-weight: 500;
            padding: 3px 8px;
            border-radius: 4px;
            max-width: 140px;
            overflow: hidden;
            text-overflow: ellipsis;
            white-space: nowrap;
        `;
        keyCell.appendChild(keyBadge);
        row.appendChild(keyCell);
    }
    
    if (visibleColumns.includes('name')) {
        const nameCell = document.createElement('td');
        nameCell.setAttribute('data-column', 'name');
        nameCell.innerHTML = `<span class="fp-metric-name">${formatMetricName(metricName)}</span>`;
        row.appendChild(nameCell);
    }
    
    const errorCell = document.createElement('td');
    errorCell.setAttribute('data-column', 'value');
    errorCell.colSpan = visibleColumns.length; // Span remaining columns
    errorCell.appendChild(createErrorElement(metricName, error));
    row.appendChild(errorCell);
    
    return row;
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
