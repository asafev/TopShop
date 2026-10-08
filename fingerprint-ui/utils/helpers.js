/**
 * Fingerprint UI - Utility Functions
 * Helper functions for formatting, value processing, and error handling
 */

import { CATEGORY_CONFIG, RISK_LEVELS, JS_CODE_MAP } from '../config/constants.js';

/**
 * Format a category name for display
 * @param {string} categoryKey - The category key
 * @returns {string} Formatted category label
 */
export function formatCategoryName(categoryKey) {
    const config = CATEGORY_CONFIG[categoryKey];
    if (config) {
        return `${config.icon} ${config.label}`;
    }
    // Fallback: convert camelCase to Title Case
    return categoryKey
        .replace(/([A-Z])/g, ' $1')
        .replace(/^./, str => str.toUpperCase())
        .trim();
}

/**
 * Get category configuration
 * @param {string} categoryKey - The category key
 * @returns {object} Category configuration object
 */
export function getCategoryConfig(categoryKey) {
    const config = CATEGORY_CONFIG[categoryKey];
    if (config) {
        return config;
    }
    // Fallback config with SVG icon
    return {
        icon: `<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <line x1="18" y1="20" x2="18" y2="10"></line>
            <line x1="12" y1="20" x2="12" y2="4"></line>
            <line x1="6" y1="20" x2="6" y2="14"></line>
        </svg>`,
        iconType: 'svg',
        label: formatCategoryName(categoryKey),
        description: 'Fingerprint metrics',
        color: '#6B7280'
    };
}

/**
 * Format a metric name from camelCase to readable format
 * @param {string} name - The metric name
 * @returns {string} Formatted metric name
 */
export function formatMetricName(name) {
    if (!name) return 'Unknown';
    return name
        .replace(/([A-Z])/g, ' $1')
        .replace(/^./, str => str.toUpperCase())
        .replace(/_/g, ' ')
        .trim();
}

/**
 * Format a metric value for display
 * @param {any} value - The value to format
 * @param {number} maxLength - Maximum string length before truncation
 * @returns {string} Formatted value
 */
export function formatValue(value, maxLength = 60) {
    if (value === null || value === undefined) {
        return 'Not available';
    }
    
    if (typeof value === 'boolean') {
        return value ? '✓ True' : '✗ False';
    }
    
    if (typeof value === 'number') {
        // Format large numbers with locale string
        if (Number.isInteger(value) && value > 1000) {
            return value.toLocaleString();
        }
        // Round decimals to 4 places
        if (!Number.isInteger(value)) {
            return value.toFixed(4);
        }
        return String(value);
    }
    
    if (Array.isArray(value)) {
        const str = JSON.stringify(value);
        return str.length > maxLength ? str.substring(0, maxLength - 3) + '...' : str;
    }
    
    if (typeof value === 'object') {
        const str = JSON.stringify(value);
        return str.length > maxLength ? str.substring(0, maxLength - 3) + '...' : str;
    }
    
    const str = String(value);
    if (str.length > maxLength) {
        return str.substring(0, maxLength - 3) + '...';
    }
    return str;
}

/**
 * Get the JavaScript code for a metric
 * @param {string} metricName - The metric name
 * @param {string} category - The category name
 * @returns {string} JavaScript code example
 */
export function getJsCode(metricName, category) {
    if (JS_CODE_MAP[metricName]) {
        return JS_CODE_MAP[metricName];
    }
    // Fallback: construct a reasonable code example
    return `${category}.${metricName}`;
}

/**
 * Get risk level configuration
 * @param {string} riskLevel - The risk level string
 * @returns {object} Risk level configuration
 */
export function getRiskConfig(riskLevel) {
    const normalized = String(riskLevel || 'NONE').toUpperCase();
    return RISK_LEVELS[normalized] || RISK_LEVELS.NONE;
}

/**
 * Safely get a nested property value
 * @param {object} obj - The object to access
 * @param {string} path - Dot-separated path to the property
 * @param {any} defaultValue - Default value if not found
 * @returns {any} The property value or default
 */
export function safeGet(obj, path, defaultValue = null) {
    try {
        const result = path.split('.').reduce((acc, key) => {
            if (acc === null || acc === undefined) return defaultValue;
            return acc[key];
        }, obj);
        return result !== undefined ? result : defaultValue;
    } catch (error) {
        console.warn(`Error accessing path "${path}":`, error);
        return defaultValue;
    }
}

/**
 * Create an error element for failed metric rendering
 * @param {string} metricName - The metric that failed
 * @param {Error} error - The error that occurred
 * @returns {HTMLElement} Error element
 */
export function createErrorElement(metricName, error) {
    const element = document.createElement('span');
    element.className = 'fp-metric-error';
    element.textContent = `Error: ${error.message || 'Failed to render'}`;
    element.title = `Metric "${metricName}" failed to render: ${error.stack || error.message}`;
    return element;
}

/**
 * Debounce function for performance
 * @param {Function} func - Function to debounce
 * @param {number} wait - Wait time in ms
 * @returns {Function} Debounced function
 */
export function debounce(func, wait) {
    let timeout;
    return function executedFunction(...args) {
        const later = () => {
            clearTimeout(timeout);
            func(...args);
        };
        clearTimeout(timeout);
        timeout = setTimeout(later, wait);
    };
}

/**
 * Generate a unique ID
 * @returns {string} Unique ID
 */
export function generateId() {
    return `fp-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
}

/**
 * Check if value is an image data URL
 * @param {any} value - Value to check
 * @returns {boolean} True if image data URL
 */
export function isImageDataUrl(value) {
    return typeof value === 'string' && value.startsWith('data:image');
}

/**
 * Calculate suspicion score percentage
 * @param {number} score - Score between 0 and 1
 * @returns {string} Formatted percentage
 */
export function formatPercentage(score) {
    return `${Math.round((score || 0) * 100)}%`;
}

/**
 * Sort categories by importance/priority
 * @param {string[]} categories - Array of category keys
 * @returns {string[]} Sorted categories
 */
export function sortCategories(categories) {
    const priority = [
        'automation',
        'functionIntegrity',
        'behavioralIndicators',
        'stringSignatureAutomation',
        'security',
        'navigator',
        'display',
        'window',
        'webgl',
        'performance',
        'performanceTiming',
        'collectionTiming',
        'webApis',
        'webRTCLeak',
        'jsEnvironment',
        'document',
        'behavioralTelemetry',
        'speechSynthesis',
        'language',
        'keyboardLayout',
        'cssComputedStyle',
        'workerSignals',
        'fonts',
        'audio',
        'cdpSignals',
        'battery',
        'network'
    ];
    
    return categories.sort((a, b) => {
        const indexA = priority.indexOf(a);
        const indexB = priority.indexOf(b);
        // Unknown categories go to the end
        const orderA = indexA === -1 ? 999 : indexA;
        const orderB = indexB === -1 ? 999 : indexB;
        return orderA - orderB;
    });
}

/**
 * Escape HTML special characters to prevent XSS
 * @param {string} str - String to escape
 * @returns {string} Escaped string
 */
export function escapeHtml(str) {
    if (typeof str !== 'string') return String(str);
    return str
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#039;');
}
