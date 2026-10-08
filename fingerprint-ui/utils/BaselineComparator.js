/**
 * Fingerprint UI - Baseline Comparator
 * Compares fingerprint data against a known baseline (trivial Chrome values)
 * to identify differences and anomalies.
 */

/**
 * Default path to the baseline fingerprint JSON
 */
const DEFAULT_BASELINE_PATH = './fp_base/browser-fingerprint-chrome-trivial.json';

/**
 * Metrics that are expected to vary and should be ignored in comparison
 * These are dynamic values that naturally change between sessions
 */
const IGNORED_METRICS = new Set([
    // Timestamps and session-specific
    'timestamp',
    'analysisComplete',
    'usedMemory',
    'totalMemory',
    'historyLength',
    'redirectCount',
    
    // Window position/size (varies by viewport)
    'innerWidth',
    'innerHeight',
    'outerWidth',
    'outerHeight',
    'screenTop',
    'screenLeft',
    'availHeight',
    'availWidth',
    
    // Network-dependent metrics
    'downlink',
    'effectiveType',
    'rtt',
    'downloadSpeed',
    'uploadSpeed',
    'latency',
    'pingLatency',
    
    // Session-specific behavioral data
    'mouseMovements',
    'keystrokes',
    'scrollEvents',
    'clickEvents',
    'focusChanges',
    'sessionDuration',
    
    // Behavioral telemetry (always varies per session)
    'totalMouseMoves',
    'totalMouseDistance',
    'averageMouseVelocity',
    'maxMouseVelocity',
    'mouseMovementCount',
    'collectionDurationMs',
    'eventsPerSecond',
    'mouseToClickRatio',
    'totalClicks',
    'totalKeyPresses',
    'totalScrollDistance',
    'scrollCount',
    'idleTime',
    'activeTime',
    
    // Audio timing (varies per collection)
    'audioCollectionTime',
    'collectionTime',
    
    // Timing/performance (always varies)
    'navigationStart',
    'domComplete',
    'loadEventEnd',
    'fetchStart',
    'responseEnd',
    'domContentLoadedEventEnd',
]);

/**
 * Categories that are entirely behavioral/dynamic and should be excluded from comparison
 */
const IGNORED_CATEGORIES = new Set([
    'behavioralIndicators',
    'behavioralTelemetry',
    'activeMeasurements',
]);

/**
 * Categories that are optional (shown but can be toggled)
 */
const OPTIONAL_CATEGORIES = new Set([
    // Currently empty - all dynamic categories are now ignored
]);

/**
 * Comparison result types
 */
export const DiffType = {
    MATCH: 'match',           // Value matches baseline
    DIFFERENT: 'different',   // Value differs from baseline
    MISSING_BASELINE: 'missing_baseline',   // Metric not in baseline
    MISSING_CURRENT: 'missing_current',     // Metric in baseline but not current
    IGNORED: 'ignored',       // Metric is in ignore list
    NEW_CATEGORY: 'new_category',  // Entire category not in baseline
};

/**
 * Class to manage baseline comparison
 */
export class BaselineComparator {
    constructor() {
        this.baseline = null;
        this.baselineLoaded = false;
        this.baselineError = null;
        this.customIgnoredMetrics = new Set();
    }
    
    /**
     * Load baseline data from a JSON file
     * @param {string} path - Path to baseline JSON file
     * @returns {Promise<boolean>} True if loaded successfully
     */
    async loadBaseline(path = DEFAULT_BASELINE_PATH) {
        try {
            console.log('📥 Loading baseline from:', path);
            const response = await fetch(path);
            if (!response.ok) {
                throw new Error(`Failed to load baseline: ${response.status} ${response.statusText} (path: ${path})`);
            }
            this.baseline = await response.json();
            this.baselineLoaded = true;
            this.baselineError = null;
            console.log('✅ Baseline fingerprint loaded:', path);
            return true;
        } catch (error) {
            console.error('❌ Failed to load baseline fingerprint:', error);
            this.baselineError = error;
            this.baselineLoaded = false;
            return false;
        }
    }
    
    /**
     * Set baseline data directly (for testing or custom baselines)
     * @param {object} baselineData - The baseline fingerprint data
     */
    setBaseline(baselineData) {
        this.baseline = baselineData;
        this.baselineLoaded = true;
        this.baselineError = null;
    }
    
    /**
     * Add custom metrics to ignore list
     * @param {string[]} metrics - Array of metric names to ignore
     */
    addIgnoredMetrics(metrics) {
        metrics.forEach(m => this.customIgnoredMetrics.add(m));
    }
    
    /**
     * Check if a metric should be ignored
     * @param {string} metricName - The metric name
     * @returns {boolean} True if should be ignored
     */
    isIgnored(metricName) {
        return IGNORED_METRICS.has(metricName) || this.customIgnoredMetrics.has(metricName);
    }
    
    /**
     * Check if a category should be completely ignored in comparison
     * @param {string} categoryName - The category name
     * @returns {boolean} True if category should be ignored
     */
    isIgnoredCategory(categoryName) {
        return IGNORED_CATEGORIES.has(categoryName);
    }
    
    /**
     * Check if a category is optional for comparison
     * @param {string} categoryName - The category name
     * @returns {boolean} True if category is optional
     */
    isOptionalCategory(categoryName) {
        return OPTIONAL_CATEGORIES.has(categoryName);
    }
    
    /**
     * Compare two values for equality (deep comparison for objects/arrays)
     * @param {any} current - Current value
     * @param {any} baseline - Baseline value
     * @returns {boolean} True if values are equal
     */
    valuesEqual(current, baseline) {
        // Handle null/undefined
        if (current === baseline) return true;
        if (current === null || baseline === null) return false;
        if (current === undefined || baseline === undefined) return false;
        
        // Handle different types
        if (typeof current !== typeof baseline) return false;
        
        // Handle primitives
        if (typeof current !== 'object') {
            return current === baseline;
        }
        
        // Handle arrays
        if (Array.isArray(current) && Array.isArray(baseline)) {
            if (current.length !== baseline.length) return false;
            return current.every((val, idx) => this.valuesEqual(val, baseline[idx]));
        }
        
        // Handle objects
        if (Array.isArray(current) !== Array.isArray(baseline)) return false;
        
        const currentKeys = Object.keys(current);
        const baselineKeys = Object.keys(baseline);
        
        if (currentKeys.length !== baselineKeys.length) return false;
        
        return currentKeys.every(key => 
            baselineKeys.includes(key) && this.valuesEqual(current[key], baseline[key])
        );
    }
    
    /**
     * Extract the raw value from a metric (handles both {value, description} and plain values)
     * @param {any} metric - The metric data
     * @returns {any} The raw value
     */
    extractValue(metric) {
        if (metric === null || metric === undefined) return metric;
        if (typeof metric === 'object' && 'value' in metric) {
            return metric.value;
        }
        return metric;
    }
    
    /**
     * Compare a single metric against baseline
     * @param {string} metricName - Name of the metric
     * @param {any} currentValue - Current metric value/data
     * @param {any} baselineValue - Baseline metric value/data
     * @returns {object} Comparison result
     */
    compareMetric(metricName, currentValue, baselineValue) {
        // Check if metric is in ignore list
        if (this.isIgnored(metricName)) {
            return {
                type: DiffType.IGNORED,
                metricName,
                currentValue: this.extractValue(currentValue),
                baselineValue: this.extractValue(baselineValue),
                message: 'Metric varies between sessions (ignored)'
            };
        }
        
        // Check if metric missing from baseline
        if (baselineValue === undefined) {
            return {
                type: DiffType.MISSING_BASELINE,
                metricName,
                currentValue: this.extractValue(currentValue),
                baselineValue: null,
                message: 'New metric not in baseline'
            };
        }
        
        // Check if metric missing from current
        if (currentValue === undefined) {
            return {
                type: DiffType.MISSING_CURRENT,
                metricName,
                currentValue: null,
                baselineValue: this.extractValue(baselineValue),
                message: 'Metric missing from current fingerprint'
            };
        }
        
        // Extract raw values for comparison
        const currentRaw = this.extractValue(currentValue);
        const baselineRaw = this.extractValue(baselineValue);
        
        // Compare values
        if (this.valuesEqual(currentRaw, baselineRaw)) {
            return {
                type: DiffType.MATCH,
                metricName,
                currentValue: currentRaw,
                baselineValue: baselineRaw,
                message: 'Matches baseline'
            };
        }
        
        return {
            type: DiffType.DIFFERENT,
            metricName,
            currentValue: currentRaw,
            baselineValue: baselineRaw,
            message: 'Differs from baseline'
        };
    }
    
    /**
     * Compare an entire category of metrics
     * @param {string} categoryName - Name of the category
     * @param {object} currentMetrics - Current category metrics
     * @param {object} baselineMetrics - Baseline category metrics
     * @returns {object} Category comparison results
     */
    compareCategory(categoryName, currentMetrics, baselineMetrics) {
        const results = {
            categoryName,
            isNewCategory: baselineMetrics === undefined,
            isOptional: this.isOptionalCategory(categoryName),
            metrics: {},
            summary: {
                total: 0,
                matches: 0,
                differences: 0,
                ignored: 0,
                missing: 0,
                new: 0
            }
        };
        
        // Handle new category (not in baseline)
        if (baselineMetrics === undefined) {
            for (const [metricName, metricData] of Object.entries(currentMetrics || {})) {
                results.metrics[metricName] = {
                    type: DiffType.MISSING_BASELINE,
                    metricName,
                    currentValue: this.extractValue(metricData),
                    baselineValue: null,
                    message: 'Category not in baseline'
                };
                results.summary.total++;
                results.summary.new++;
            }
            return results;
        }
        
        // Collect all metric names from both current and baseline
        const allMetrics = new Set([
            ...Object.keys(currentMetrics || {}),
            ...Object.keys(baselineMetrics || {})
        ]);
        
        for (const metricName of allMetrics) {
            const result = this.compareMetric(
                metricName,
                currentMetrics?.[metricName],
                baselineMetrics?.[metricName]
            );
            
            results.metrics[metricName] = result;
            results.summary.total++;
            
            switch (result.type) {
                case DiffType.MATCH:
                    results.summary.matches++;
                    break;
                case DiffType.DIFFERENT:
                    results.summary.differences++;
                    break;
                case DiffType.IGNORED:
                    results.summary.ignored++;
                    break;
                case DiffType.MISSING_BASELINE:
                    results.summary.new++;
                    break;
                case DiffType.MISSING_CURRENT:
                    results.summary.missing++;
                    break;
            }
        }
        
        return results;
    }
    
    /**
     * Compare entire fingerprint data against baseline
     * @param {object} currentData - Current fingerprint data
     * @returns {object} Full comparison results
     */
    compare(currentData) {
        if (!this.baselineLoaded || !this.baseline) {
            throw new Error('Baseline not loaded. Call loadBaseline() first.');
        }
        
        const results = {
            timestamp: Date.now(),
            baselineTimestamp: this.baseline.timestamp,
            categories: {},
            summary: {
                totalCategories: 0,
                totalMetrics: 0,
                totalMatches: 0,
                totalDifferences: 0,
                totalIgnored: 0,
                totalNew: 0,
                totalMissing: 0,
                differencePercentage: 0
            }
        };
        
        const currentMetrics = currentData?.metrics || {};
        const baselineMetrics = this.baseline?.metrics || {};
        
        // Collect all category names (excluding ignored categories)
        const allCategories = new Set([
            ...Object.keys(currentMetrics),
            ...Object.keys(baselineMetrics)
        ]);
        
        for (const categoryName of allCategories) {
            // Skip entirely ignored categories
            if (this.isIgnoredCategory(categoryName)) {
                console.log(`⏭️ Skipping ignored category: ${categoryName}`);
                continue;
            }
            
            const categoryResult = this.compareCategory(
                categoryName,
                currentMetrics[categoryName],
                baselineMetrics[categoryName]
            );
            
            results.categories[categoryName] = categoryResult;
            results.summary.totalCategories++;
            results.summary.totalMetrics += categoryResult.summary.total;
            results.summary.totalMatches += categoryResult.summary.matches;
            results.summary.totalDifferences += categoryResult.summary.differences;
            results.summary.totalIgnored += categoryResult.summary.ignored;
            results.summary.totalNew += categoryResult.summary.new;
            results.summary.totalMissing += categoryResult.summary.missing;
        }
        
        // Calculate difference percentage (excluding ignored metrics)
        const comparableMetrics = results.summary.totalMetrics - results.summary.totalIgnored;
        if (comparableMetrics > 0) {
            const nonMatching = results.summary.totalDifferences + results.summary.totalNew + results.summary.totalMissing;
            results.summary.differencePercentage = Math.round((nonMatching / comparableMetrics) * 100);
        }
        
        return results;
    }
    
    /**
     * Get only the different metrics from a comparison result
     * @param {object} comparisonResult - Result from compare()
     * @param {object} options - Filter options
     * @param {boolean} options.includeMissing - Include missing metrics
     * @param {boolean} options.includeNew - Include new metrics
     * @param {boolean} options.includeIgnored - Include ignored metrics (default: false)
     * @returns {object} Filtered metrics by category
     */
    getDifferences(comparisonResult, options = {}) {
        const {
            includeMissing = true,
            includeNew = true,
            includeIgnored = false
        } = options;
        
        const differences = {};
        
        for (const [categoryName, categoryData] of Object.entries(comparisonResult.categories)) {
            const categoryDiffs = {};
            let hasDiffs = false;
            
            for (const [metricName, metricResult] of Object.entries(categoryData.metrics)) {
                let include = false;
                
                switch (metricResult.type) {
                    case DiffType.DIFFERENT:
                        include = true;
                        break;
                    case DiffType.MISSING_BASELINE:
                        include = includeNew;
                        break;
                    case DiffType.MISSING_CURRENT:
                        include = includeMissing;
                        break;
                    case DiffType.IGNORED:
                        include = includeIgnored;
                        break;
                    case DiffType.MATCH:
                        include = false;
                        break;
                }
                
                if (include) {
                    categoryDiffs[metricName] = metricResult;
                    hasDiffs = true;
                }
            }
            
            if (hasDiffs) {
                differences[categoryName] = {
                    ...categoryData,
                    metrics: categoryDiffs,
                    summary: {
                        ...categoryData.summary,
                        filteredCount: Object.keys(categoryDiffs).length
                    }
                };
            }
        }
        
        return differences;
    }
    
    /**
     * Check if baseline is loaded
     * @returns {boolean}
     */
    isLoaded() {
        return this.baselineLoaded;
    }
    
    /**
     * Get baseline load error if any
     * @returns {Error|null}
     */
    getError() {
        return this.baselineError;
    }
    
    /**
     * Get baseline metadata
     * @returns {object} Baseline info
     */
    getBaselineInfo() {
        if (!this.baseline) return null;
        return {
            timestamp: this.baseline.timestamp,
            formattedDate: this.baseline.timestamp ? new Date(this.baseline.timestamp).toLocaleString() : 'Unknown',
            categoryCount: Object.keys(this.baseline.metrics || {}).length,
            metricCount: Object.values(this.baseline.metrics || {}).reduce(
                (sum, cat) => sum + Object.keys(cat || {}).length, 0
            )
        };
    }
}

/**
 * Create and initialize a BaselineComparator instance
 * @param {string} baselinePath - Optional path to baseline file
 * @returns {Promise<BaselineComparator>} Initialized comparator
 */
export async function createBaselineComparator(baselinePath = DEFAULT_BASELINE_PATH) {
    const comparator = new BaselineComparator();
    await comparator.loadBaseline(baselinePath);
    return comparator;
}

// Default export for convenience
export default BaselineComparator;
