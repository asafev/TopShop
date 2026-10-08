import { log as _log } from './utils/log.js';
/**
 * Browser Fingerprint Metrics Module
 * Advanced browser fingerprinting for detection and analysis
 * Based on security research patterns and automation detection techniques
 */

import { FunctionIntegrityDetector } from './functionIntegrityDetector.js';
import { ContextAnalyzer } from './contextAnalyzer.js';
import { BehavioralStorageManager } from './behavioralStorage.js';
import { isNativeFunction } from './utils/functionUtils.js';

// ============================================================
// ERROR HANDLING UTILITIES
// ============================================================

/**
 * Safe property access - returns default value if property access throws or is undefined
 * @param {Function} accessor - Function that returns the property value
 * @param {*} defaultValue - Default value if access fails
 * @returns {*} The property value or default
 */
function safeGet(accessor, defaultValue = 'Not available') {
    try {
        const value = accessor();
        return value !== undefined && value !== null ? value : defaultValue;
    } catch (e) {
        return defaultValue;
    }
}

/**
 * Safe async operation wrapper - catches errors and returns fallback
 * @param {Function} asyncFn - Async function to execute
 * @param {*} fallbackValue - Value to return on error
 * @param {string} operationName - Name for logging
 * @returns {Promise<*>} Result or fallback value
 */
async function safeAsync(asyncFn, fallbackValue, operationName = 'operation') {
    try {
        return await asyncFn();
    } catch (error) {
        _log.warn(`⚠️ ${operationName} failed:`, error.message);
        return fallbackValue;
    }
}

/**
 * Create an error metric object for consistent error reporting
 * @param {Error|string} error - The error object or message
 * @param {string} description - Description of what failed
 * @returns {Object} Formatted error metric
 */
function createErrorMetric(error, description) {
    return {
        value: 'Error',
        description: description,
        error: error instanceof Error ? error.message : String(error),
        risk: 'N/A'
    };
}

/**
 * Wrap a synchronous analysis function with error handling
 * @param {Function} analysisFn - The analysis function to wrap
 * @param {string} categoryName - Name of the category for error reporting
 * @returns {Object} Analysis results or error object
 */
function safeAnalysis(analysisFn, categoryName) {
    try {
        return analysisFn();
    } catch (error) {
        _log.warn(`⚠️ ${categoryName} analysis failed:`, error.message);
        return {
            error: createErrorMetric(error, `${categoryName} analysis failed`)
        };
    }
}

// New modular detectors for extended fingerprinting
import { NetworkCapabilitiesDetector } from './detectors/networkCapabilities.js';
import { BatteryStorageDetector } from './detectors/batteryStorage.js';
import { AudioFingerprintDetector } from './detectors/audioFingerprint.js';
import { WebRTCLeakDetector } from './detectors/webRTCLeak.js';
import { WebGLFingerprintDetector } from './detectors/webGLfingerprint.js';
import { SpeechSynthesisDetector } from './detectors/speechSynthesis.js';
import { LanguageDetector } from './detectors/languageDetector.js';
import { CssComputedStyleDetector } from './detectors/cssComputedStyle.js';
import { WorkerSignalsDetector } from './detectors/workerSignals.js';
import { FontsDetector } from './detectors/fonts.js';
import { PerformanceTimingDetector } from './detectors/performanceTiming.js';
import { KeyboardLayoutDetector } from './detectors/keyboardLayout.js';
import { PermissionsDetector } from './detectors/permissionsDetector.js';
import { CodecSupportDetector } from './detectors/codecSupport.js';
import { StackTraceFingerprintDetector } from './detectors/stackTraceFingerprint.js';
import { IframeDetector } from './detectors/iframeDetector.js';
import { CreepjsEnhancedDetector } from './detectors/creepjsEnhanced.js';

/**
 * Suspicious Indicator Detection System
 * Detects patterns that suggest sandbox environments or AI agents
 * Uses weighted importance system to prevent false positives
 */
class SuspiciousIndicatorDetector {
    constructor() {
        this.suspiciousIndicators = [];
        this.riskThresholds = {
            HIGH: 0.8,
            MEDIUM: 0.5,
            LOW: 0.2
        };
        
        // Indicator importance configuration - easily adjustable
        this.indicatorConfig = {
            // CRITICAL indicators - strong evidence of automation/sandbox
            CRITICAL: {
                weight: 1.0,
                threshold: 0.9,
                indicators: [
                    'webgl_suspicious_renderer',
                    'permissions_api_override',
                    'date_now_override',
                    'math_random_override',
                    'performance_now_override',
                    'zero_window_dimensions',
                    'missing_plugins_mimetypes',
                    'fake_media_devices', // AI automation agents like browserUse
                    'known_agent_detected', // Known agent signature match
                    'stack_trace_automation_framework', // Automation framework detected in stack traces
                    'iframe_contentwindow_tampered', // iframe contentWindow getter is not native
                    'iframe_create_element_proxied', // document.createElement is proxied (stealth plugin)
                    'iframe_automation_globals_polluted' // Automation globals found in fresh iframe
                ]
            },
            
            // STRONG indicators - reliable but may have edge cases
            STRONG: {
                weight: 0.7,
                threshold: 0.8,
                indicators: [
                    'odd_hardware_concurrency',
                    'navigator_webdriver_true',
                    'no_media_devices',
                    'stack_trace_high_anomaly_score', // High anomaly score from stack trace analysis
                    'stack_trace_automation_properties', // Automation properties found in globals
                    'iframe_top_leakage', // iframe.contentWindow.self === window.top
                    'iframe_regexp_pollution', // RegExp static properties polluted
                    'iframe_srcdoc_tampering' // srcdoc attribute has non-native accessor
                ]
            },
            
            // WEAK indicators - contextual, need combination with others
            WEAK: {
                weight: 0.3,
                threshold: 0.6,
                indicators: [
                    'device_pixel_ratio_anomaly',
                    'dpr_float_noise_pattern',
                    'zero_touch_points',
                    'stack_trace_eval_context', // Eval context in stack traces
                    'stack_trace_vm_context', // VM context markers in stack traces
                    'iframe_fresh_window_mismatch', // Property mismatches between main and fresh window
                    'iframe_plugins_proxied' // navigator.plugins appears proxied
                ]
            }
        };
        
        // Detection thresholds for showing suspicious activity
        this.displayThresholds = {
            // Show if ANY critical indicator is found
            criticalThreshold: 1,
            
            // Show if combined weighted score exceeds this
            combinedThreshold: 0.8,
            
            // Minimum number of indicators needed for weak-only detection
            weakOnlyMinimum: 3
        };
    }

    /**
     * Analyze all suspicious indicators from fingerprint data
     * @param {Object} metrics - Browser fingerprint metrics
     * @returns {Object} Analysis results with filtered indicators
     */
    analyzeSuspiciousIndicators(metrics) {
        this.suspiciousIndicators = [];
        
        // Check all indicator categories
        this._checkWebGLIndicators(metrics);
        this._checkDevicePixelRatioIndicators(metrics);
        this._checkTouchPointIndicators(metrics);
        this._checkHardwareConcurrencyIndicators(metrics);
        this._checkAPIOverrideIndicators(metrics);
        this._checkGeneralSandboxIndicators(metrics);
        this._checkStackTraceFingerprintIndicators(metrics);
        this._checkIframeAnalysisIndicators(metrics);
        
        // Apply importance-based filtering
        const filteredResults = this._applyImportanceFiltering();
        
        return filteredResults;
    }

    /**
     * Apply importance-based filtering to determine if suspicious activity should be shown
     * @private
     */
    _applyImportanceFiltering() {
        const categorizedIndicators = this._categorizeIndicators();
        const analysis = this._analyzeIndicatorImportance(categorizedIndicators);
        
        // Decision logic for showing suspicious activity
        const shouldShowSuspiciousActivity = this._shouldShowSuspiciousActivity(analysis);
        
        return {
            indicators: shouldShowSuspiciousActivity ? this.suspiciousIndicators : [],
            allIndicators: this.suspiciousIndicators, // For debugging/admin view
            analysis: analysis,
            shouldShow: shouldShowSuspiciousActivity,
            reasoning: this._getDisplayReasoning(analysis)
        };
    }

    /**
     * Categorize indicators by importance level
     * @private
     */
    _categorizeIndicators() {
        const categorized = {
            critical: [],
            strong: [],
            weak: [],
            unknown: []
        };

        this.suspiciousIndicators.forEach(indicator => {
            const importance = this._getIndicatorImportance(indicator.name);
            categorized[importance].push(indicator);
        });

        return categorized;
    }

    /**
     * Get importance level for an indicator
     * @private
     */
    _getIndicatorImportance(indicatorName) {
        for (const [level, config] of Object.entries(this.indicatorConfig)) {
            if (config.indicators.includes(indicatorName)) {
                return level.toLowerCase();
            }
        }
        return 'unknown';
    }

    /**
     * Analyze indicator importance and calculate scores
     * @private
     */
    _analyzeIndicatorImportance(categorized) {
        const scores = {
            critical: this._calculateCategoryScore(categorized.critical, 'CRITICAL'),
            strong: this._calculateCategoryScore(categorized.strong, 'STRONG'),
            weak: this._calculateCategoryScore(categorized.weak, 'WEAK'),
            unknown: this._calculateCategoryScore(categorized.unknown, 'WEAK') // Treat unknown as weak
        };

        const totalWeightedScore = scores.critical + scores.strong + scores.weak + scores.unknown;
        
        return {
            categorized,
            scores,
            totalWeightedScore,
            hasCritical: categorized.critical.length > 0,
            hasStrong: categorized.strong.length > 0,
            hasWeak: categorized.weak.length > 0,
            totalCount: this.suspiciousIndicators.length
        };
    }

    /**
     * Calculate weighted score for a category
     * @private
     */
    _calculateCategoryScore(indicators, configKey) {
        if (indicators.length === 0) return 0;
        
        const config = this.indicatorConfig[configKey];
        const avgConfidence = indicators.reduce((sum, ind) => sum + ind.confidence, 0) / indicators.length;
        
        return indicators.length * config.weight * avgConfidence;
    }

    /**
     * Determine if suspicious activity should be displayed
     * @private
     */
    _shouldShowSuspiciousActivity(analysis) {
        const { hasCritical, totalWeightedScore, categorized } = analysis;
        const { criticalThreshold, combinedThreshold, weakOnlyMinimum } = this.displayThresholds;

        // Show if any critical indicators found
        if (hasCritical && categorized.critical.length >= criticalThreshold) {
            return true;
        }

        // Show if combined weighted score is high enough
        if (totalWeightedScore >= combinedThreshold) {
            return true;
        }

        // For weak-only scenarios, require multiple indicators
        const onlyWeakIndicators = !hasCritical && categorized.strong.length === 0;
        if (onlyWeakIndicators && categorized.weak.length >= weakOnlyMinimum) {
            return true;
        }

        // Don't show for isolated weak indicators
        return false;
    }

    /**
     * Get human-readable reasoning for display decision
     * @private
     */
    _getDisplayReasoning(analysis) {
        const { hasCritical, totalWeightedScore, categorized } = analysis;
        
        if (hasCritical) {
            return `Critical automation indicators detected (${categorized.critical.length} found)`;
        }
        
        if (totalWeightedScore >= this.displayThresholds.combinedThreshold) {
            return `High combined suspicion score: ${totalWeightedScore.toFixed(2)}`;
        }
        
        if (categorized.weak.length >= this.displayThresholds.weakOnlyMinimum) {
            return `Multiple weak indicators combined (${categorized.weak.length} found)`;
        }
        
        if (this.suspiciousIndicators.length > 0) {
            return `Insufficient evidence - ${this.suspiciousIndicators.length} weak indicator(s) found but below threshold`;
        }
        
        return 'No suspicious patterns detected';
    }

    /**
     * Check WebGL renderer for suspicious patterns
     * @private
     */
    _checkWebGLIndicators(metrics) {
        const webglRenderer = metrics.webgl?.unmaskedRenderer?.value;
        if (webglRenderer && typeof webglRenderer === 'string') {
            const suspiciousPattern = /swiftshader|subzero/i;
            if (suspiciousPattern.test(webglRenderer)) {
                this._addIndicator({
                    name: 'webgl_suspicious_renderer',
                    category: 'WebGL',
                    description: 'WebGL renderer indicates software rendering (sandbox/headless)',
                    value: webglRenderer,
                    riskLevel: 'HIGH',
                    confidence: 0.9,
                    importance: 'CRITICAL', // Critical indicator - very strong evidence
                    details: 'SwiftShader/Subzero renderers are commonly used in headless browsers and sandboxed environments'
                });
            }
        }
    }

    /**
     * Check device pixel ratio for suspicious values
     * @private
     */
    _checkDevicePixelRatioIndicators(metrics) {
        const dpr = metrics.window?.devicePixelRatio?.value;
        if (typeof dpr === 'number') {
            if (dpr < 0.95 || dpr > 2.5) {
                this._addIndicator({
                    name: 'device_pixel_ratio_anomaly',
                    category: 'Display',
                    description: 'Device pixel ratio outside normal range for real devices',
                    value: dpr,
                    riskLevel: 'MEDIUM',
                    confidence: 0.7,
                    importance: 'WEAK', // Marked as weak - can be normal user behavior
                    details: `Normal DPR range is 0.95-2.5, detected: ${dpr}. Note: This can occur with custom zoom levels or unusual display setups.`
                });
            }
            
            // Check for float noise pattern (≈ 0.8 ± noise)
            const floatNoise = Math.abs(dpr - Math.round(dpr));
            if (Math.abs(dpr - 0.8) < 0.1 && floatNoise > 0.001) {
                this._addIndicator({
                    name: 'dpr_float_noise_pattern',
                    category: 'Display',
                    description: 'Device pixel ratio shows suspicious float noise pattern around 0.8',
                    value: `${dpr} (noise: ${floatNoise.toFixed(6)})`,
                    riskLevel: 'HIGH',
                    confidence: 0.85,
                    importance: 'WEAK', // Marked as weak - may be zoom-related
                    details: 'Float noise around 0.8 can be characteristic of automation frameworks, but may also occur with certain zoom levels.'
                });
            }
        }
    }

    /**
     * Check touch points for automation indicators
     * @private
     */
    _checkTouchPointIndicators(metrics) {
        const maxTouchPoints = metrics.navigator?.maxTouchPoints?.value;
        if (maxTouchPoints === 0) {
            this._addIndicator({
                name: 'zero_touch_points',
                category: 'Hardware',
                description: 'No touch support detected (desktop automation indicator)',
                value: maxTouchPoints,
                riskLevel: 'MEDIUM',
                confidence: 0.6,
                importance: 'WEAK', // Weak - many legitimate desktop users have this
                details: 'Zero touch points on modern browsers often indicates automation or VM, but is common on desktop computers.'
            });
        }
    }

    /**
     * Check hardware concurrency for odd numbers (suspicious pattern)
     * @private
     */
    _checkHardwareConcurrencyIndicators(metrics) {
        const hardwareConcurrency = metrics.navigator?.hardwareConcurrency?.value;
        if (typeof hardwareConcurrency === 'number' && hardwareConcurrency % 2 !== 0) {
            this._addIndicator({
                name: 'odd_hardware_concurrency',
                category: 'Hardware',
                description: 'Odd number of CPU cores (unusual for consumer hardware)',
                value: hardwareConcurrency,
                riskLevel: 'MEDIUM',
                confidence: 0.6,
                importance: 'STRONG', // Strong indicator - genuinely unusual
                details: 'Odd CPU core counts are uncommon in consumer devices and may indicate virtualization or specialized hardware.'
            });
        }
    }

    /**
     * Check for overridden native APIs
     * @private
     */
    _checkAPIOverrideIndicators(metrics) {
        // Check permissions API override
        try {
            if (navigator.permissions && navigator.permissions.query) {
                const queryString = navigator.permissions.query.toString();
                if (!isNativeFunction(queryString, 'query')) {
                    this._addIndicator({
                        name: 'permissions_api_override',
                        category: 'API Overrides',
                        description: 'Permissions API query function has been overridden',
                        value: queryString.length > 200 ? queryString.substring(0, 200) + '...' : queryString,
                        riskLevel: 'HIGH',
                        confidence: 0.95,
                        importance: 'CRITICAL', // Critical - API overrides are strong automation evidence
                        details: 'Native API function overrides are strong indicators of automation frameworks'
                    });
                }
            }
        } catch (error) {
            // Permissions API check failed
        }

        // Add more API override checks here as needed
        this._checkAdditionalAPIOverrides();
    }



    /**
     * Check additional API overrides (extensible framework)
     * @private
     */
    _checkAdditionalAPIOverrides() {
        const apisToCheck = [
            {
                name: 'Date.now',
                api: Date.now,
                expectedPattern: 'function now() { [native code] }',
                indicatorName: 'date_now_override'
            },
            {
                name: 'Math.random',
                api: Math.random,
                expectedPattern: 'function random() { [native code] }',
                indicatorName: 'math_random_override'
            },
            {
                name: 'Performance.now',
                api: performance?.now,
                expectedPattern: 'function now() { [native code] }',
                indicatorName: 'performance_now_override'
            }
        ];

        apisToCheck.forEach(({ name, api, expectedPattern, indicatorName }) => {
            if (api && typeof api === 'function') {
                const apiString = api.toString();
                if (!apiString.includes('[native code]')) {
                    this._addIndicator({
                        name: indicatorName,
                        category: 'API Overrides',
                        description: `${name} function has been overridden`,
                        value: apiString.length > 150 ? apiString.substring(0, 150) + '...' : apiString,
                        riskLevel: 'HIGH',
                        confidence: 0.9,
                        importance: 'CRITICAL', // Critical - API overrides are strong evidence
                        details: `Native ${name} function appears to be modified by automation framework`
                    });
                }
            }
        });
    }

    /**
     * Check general sandbox/automation indicators
     * @private
     */
    _checkGeneralSandboxIndicators(metrics) {
        // Zero window dimensions
        const outerWidth = metrics.window?.outerWidth?.value;
        const outerHeight = metrics.window?.outerHeight?.value;
        
        if (outerWidth === 0 || outerHeight === 0) {
            this._addIndicator({
                name: 'zero_window_dimensions',
                category: 'Window',
                description: 'Zero window dimensions (headless browser indicator)',
                value: `${outerWidth || 0}x${outerHeight || 0}`,
                riskLevel: 'HIGH',
                confidence: 0.95,
                importance: 'CRITICAL', // Critical - very strong headless indicator
                details: 'Headless browsers often report zero window dimensions'
            });
        }

        // Missing plugins/mime types
        const pluginsLength = metrics.navigator?.pluginsLength?.value;
        const mimeTypesLength = metrics.navigator?.mimeTypesLength?.value;
        
        if (pluginsLength === 0 && mimeTypesLength === 0) {
            this._addIndicator({
                name: 'missing_plugins_mimetypes',
                category: 'Plugins',
                description: 'No browser plugins or MIME types detected',
                value: `plugins: ${pluginsLength || 0}, mimeTypes: ${mimeTypesLength || 0}`,
                riskLevel: 'HIGH',
                confidence: 0.8,
                importance: 'CRITICAL', // Critical - real browsers have plugins/mime types
                details: 'Real browsers typically have plugins and MIME types available'
            });
        }

        // Check for webdriver flag
        if (metrics.navigator?.webdriver?.value === true) {
            this._addIndicator({
                name: 'navigator_webdriver_true',
                category: 'Navigator',
                description: 'Navigator webdriver flag is set to true',
                value: 'true',
                riskLevel: 'HIGH',
                confidence: 0.95,
                importance: 'CRITICAL', // Critical - explicit automation flag
                details: 'The webdriver flag explicitly indicates browser automation'
            });
        }
    }

    /**
     * Check stack trace fingerprint for automation indicators
     * @private
     */
    _checkStackTraceFingerprintIndicators(metrics) {
        const stackTraceData = metrics.stackTraceFingerprint;
        if (!stackTraceData || stackTraceData.error) return;

        // Check for high anomaly score
        const anomalyScore = stackTraceData.anomalyScore?.value;
        if (typeof anomalyScore === 'number' && anomalyScore > 50) {
            this._addIndicator({
                name: 'stack_trace_high_anomaly_score',
                category: 'StackTrace',
                description: 'High automation anomaly score from stack trace analysis',
                value: anomalyScore,
                riskLevel: anomalyScore > 100 ? 'HIGH' : 'MEDIUM',
                confidence: Math.min(0.9, 0.5 + (anomalyScore / 200)),
                importance: anomalyScore > 100 ? 'CRITICAL' : 'STRONG',
                details: `Anomaly score ${anomalyScore} exceeds threshold. Higher scores indicate more automation signals.`
            });
        }

        // Check for automation framework in stack traces
        const stackAnomalies = stackTraceData.stackAnomalies?.value || [];
        if (stackAnomalies.includes('automation_framework_in_stack')) {
            this._addIndicator({
                name: 'stack_trace_automation_framework',
                category: 'StackTrace',
                description: 'Automation framework detected in stack traces',
                value: 'puppeteer/playwright/selenium detected',
                riskLevel: 'HIGH',
                confidence: 0.95,
                importance: 'CRITICAL',
                details: 'Direct reference to automation framework found in Error.stack'
            });
        }

        // Check for VM context (common in CDP-based automation)
        if (stackAnomalies.includes('vm_context')) {
            this._addIndicator({
                name: 'stack_trace_vm_context',
                category: 'StackTrace',
                description: 'VM context markers found in stack traces',
                value: 'VM context detected',
                riskLevel: 'MEDIUM',
                confidence: 0.7,
                importance: 'WEAK',
                details: 'Stack traces show VM context (common in evaluated code or automation)'
            });
        }

        // Check for eval context
        if (stackAnomalies.includes('eval_context')) {
            this._addIndicator({
                name: 'stack_trace_eval_context',
                category: 'StackTrace',
                description: 'Eval context detected in stack traces',
                value: 'eval context detected',
                riskLevel: 'MEDIUM',
                confidence: 0.6,
                importance: 'WEAK',
                details: 'Stack traces indicate code running in eval context'
            });
        }

        // Check for automation properties in global objects
        const windowAutomationKeys = stackTraceData.windowAutomationKeys?.value || 0;
        const navigatorAutomationKeys = stackTraceData.navigatorAutomationKeys?.value || 0;
        const totalAutomationProps = windowAutomationKeys + navigatorAutomationKeys;
        
        if (totalAutomationProps > 0) {
            this._addIndicator({
                name: 'stack_trace_automation_properties',
                category: 'StackTrace',
                description: 'Automation-related properties found in global objects',
                value: `window: ${windowAutomationKeys}, navigator: ${navigatorAutomationKeys}`,
                riskLevel: totalAutomationProps > 3 ? 'HIGH' : 'MEDIUM',
                confidence: Math.min(0.9, 0.5 + (totalAutomationProps * 0.1)),
                importance: totalAutomationProps > 3 ? 'CRITICAL' : 'STRONG',
                details: `Found ${totalAutomationProps} automation-related properties in window/navigator`
            });
        }
    }

    /**
     * Check iframe analysis for behavioral micro-differences
     * Based on vendor research (CHEQ, PerimeterX, DataDome) - behavioral approach
     * Detects VMs, remote-rendered browsers, and automation through statistical patterns
     * @private
     */
    _checkIframeAnalysisIndicators(metrics) {
        const iframeData = metrics.iframeAnalysis;
        if (!iframeData || iframeData.error) return;

        // Helper to extract value from metric format
        const getValue = (metric) => {
            if (!metric) return null;
            return typeof metric === 'object' && 'value' in metric ? metric.value : metric;
        };

        // ========== TIMING JITTER ANALYSIS ==========
        const timingJitter = getValue(iframeData.timingJitter);
        if (timingJitter && typeof timingJitter === 'object') {
            // Check performance.now() precision (VMs often have coarser timing)
            const performanceNow = timingJitter.performanceNow;
            if (performanceNow && performanceNow.stdDev !== undefined) {
                // Very low stdDev with many zero deltas suggests VM/remote
                const zeroCount = performanceNow.samples?.filter(s => s === 0).length || 0;
                if (performanceNow.stdDev < 0.001 || zeroCount > 20) {
                    this._addIndicator({
                        name: 'timing_precision_anomaly',
                        category: 'IframeAnalysis',
                        description: 'Abnormal performance.now() precision pattern',
                        value: `stdDev: ${performanceNow.stdDev?.toFixed(4) || 'N/A'}, zeros: ${zeroCount}/50`,
                        riskLevel: 'MEDIUM',
                        confidence: 0.75,
                        importance: 'STRONG',
                        details: 'performance.now() shows unnaturally uniform timing. VMs and remote browsers often have coarser or more uniform timing than local Chrome.'
                    });
                }
            }

            // Check setTimeout jitter pattern
            const setTimeout = timingJitter.setTimeout;
            if (setTimeout && setTimeout.mean !== undefined) {
                // setTimeout(0) in real browsers is typically 4-10ms, VMs can be very different
                if (setTimeout.mean < 1 || setTimeout.mean > 50) {
                    this._addIndicator({
                        name: 'settimeout_jitter_anomaly',
                        category: 'IframeAnalysis',
                        description: 'Unusual setTimeout timing pattern',
                        value: `mean: ${setTimeout.mean?.toFixed(2)}ms (expected ~4-10ms)`,
                        riskLevel: 'MEDIUM',
                        confidence: 0.7,
                        importance: 'STRONG',
                        details: 'setTimeout(0) timing deviates significantly from expected browser behavior. May indicate VM or throttled environment.'
                    });
                }
            }

            // Check rAF cadence
            const rAFCadence = timingJitter.rAFCadence;
            if (rAFCadence && rAFCadence.mean !== undefined) {
                // rAF should be ~16.67ms for 60fps, with low stdDev
                if (rAFCadence.stdDev > 5 || (rAFCadence.mean < 10 || rAFCadence.mean > 30)) {
                    this._addIndicator({
                        name: 'raf_cadence_anomaly',
                        category: 'IframeAnalysis',
                        description: 'Irregular requestAnimationFrame timing',
                        value: `mean: ${rAFCadence.mean?.toFixed(2)}ms, stdDev: ${rAFCadence.stdDev?.toFixed(2)}ms`,
                        riskLevel: 'LOW',
                        confidence: 0.6,
                        importance: 'WEAK',
                        details: 'rAF timing should be stable around 16.67ms (60fps). High variance may indicate headless or backgrounded browser.'
                    });
                }
            }
        }

        // ========== CROSS-REALM COHERENCE ==========
        const crossRealm = getValue(iframeData.crossRealmCoherence);
        if (crossRealm && typeof crossRealm === 'object') {
            const coherenceScore = crossRealm.coherenceScore;
            const mismatches = crossRealm.mismatches;

            // Low coherence score indicates discrepancies between window/iframe/worker
            if (coherenceScore !== undefined && coherenceScore < 0.9 && mismatches?.length > 0) {
                this._addIndicator({
                    name: 'cross_realm_coherence_low',
                    category: 'IframeAnalysis',
                    description: 'Cross-context property mismatches detected',
                    value: `Score: ${(coherenceScore * 100).toFixed(1)}%, mismatches: ${mismatches.length}`,
                    riskLevel: 'HIGH',
                    confidence: 0.85,
                    importance: 'CRITICAL',
                    details: `Properties differ between window, iframe, and worker contexts: ${mismatches.slice(0, 3).map(m => m.property).join(', ')}. Stealth stacks often forget to synchronize across realms.`
                });
            }

            // Specific hardware/device mismatches are very suspicious
            const hardwareMismatches = mismatches?.filter(m => 
                ['hardwareConcurrency', 'deviceMemory', 'screen.width', 'screen.height'].includes(m.property)
            );
            if (hardwareMismatches?.length > 0) {
                this._addIndicator({
                    name: 'hardware_coherence_mismatch',
                    category: 'IframeAnalysis',
                    description: 'Hardware properties differ across contexts',
                    value: hardwareMismatches.map(m => m.property).join(', '),
                    riskLevel: 'HIGH',
                    confidence: 0.9,
                    importance: 'CRITICAL',
                    details: 'Hardware-related properties (CPU cores, memory, screen) should be identical across all JavaScript contexts. Mismatches indicate spoofing.'
                });
            }
        }

        // ========== WORKER REALM TESTING ==========
        const workerRealm = getValue(iframeData.workerRealm);
        if (workerRealm && typeof workerRealm === 'object') {
            // Worker unavailable in automation is suspicious
            if (workerRealm.available === false && workerRealm.error) {
                this._addIndicator({
                    name: 'worker_unavailable',
                    category: 'IframeAnalysis',
                    description: 'Web Workers are not functional',
                    value: workerRealm.error || 'Worker creation failed',
                    riskLevel: 'HIGH',
                    confidence: 0.8,
                    importance: 'STRONG',
                    details: 'Web Workers failed to create or execute. Many stealth stacks do not properly support Workers.'
                });
            }

            // Worker property mismatches
            if (workerRealm.mismatches?.length > 0) {
                this._addIndicator({
                    name: 'worker_property_mismatch',
                    category: 'IframeAnalysis',
                    description: 'Worker and window properties do not match',
                    value: `${workerRealm.mismatches.length} property differences`,
                    riskLevel: 'HIGH',
                    confidence: 0.85,
                    importance: 'CRITICAL',
                    details: `Worker context shows different values: ${workerRealm.mismatches.slice(0, 3).map(m => `${m.property}: ${m.window}→${m.worker}`).join(', ')}`
                });
            }
        }

        // ========== CANVAS STABILITY ==========
        const canvasStability = getValue(iframeData.canvasStability);
        if (canvasStability && typeof canvasStability === 'object') {
            // Canvas should be perfectly stable on re-render
            if (canvasStability.stable === false) {
                this._addIndicator({
                    name: 'canvas_unstable',
                    category: 'IframeAnalysis',
                    description: 'Canvas fingerprint is not stable across renders',
                    value: `Hash mismatch detected`,
                    riskLevel: 'HIGH',
                    confidence: 0.9,
                    importance: 'CRITICAL',
                    details: 'The same canvas drawing produced different pixel hashes. This indicates environmental instability or canvas spoofing.'
                });
            }
        }

        // ========== FONT METRICS ==========
        const fontMetrics = getValue(iframeData.fontMetrics);
        if (fontMetrics && typeof fontMetrics === 'object') {
            // Check for unusual font metric patterns
            const fontWidths = fontMetrics.widths;
            if (fontWidths) {
                // All fonts having identical metrics is suspicious
                const uniqueWidths = new Set(Object.values(fontWidths).map(w => w?.toFixed(2)));
                if (uniqueWidths.size === 1 && Object.keys(fontWidths).length > 3) {
                    this._addIndicator({
                        name: 'font_metrics_uniform',
                        category: 'IframeAnalysis',
                        description: 'All fonts report identical metrics',
                        value: 'No font variation detected',
                        riskLevel: 'MEDIUM',
                        confidence: 0.75,
                        importance: 'STRONG',
                        details: 'Text measurement returns identical widths for different fonts. This suggests font metrics are being spoofed or a fallback font is always used.'
                    });
                }
            }
        }

        // ========== WebGL STABILITY ==========
        const webglStability = getValue(iframeData.webglStability);
        if (webglStability && typeof webglStability === 'object') {
            if (webglStability.stable === false) {
                this._addIndicator({
                    name: 'webgl_unstable',
                    category: 'IframeAnalysis',
                    description: 'WebGL rendering is not stable',
                    value: 'Shader output varies between renders',
                    riskLevel: 'MEDIUM',
                    confidence: 0.7,
                    importance: 'STRONG',
                    details: 'WebGL shader compilation or rendering produces inconsistent results. May indicate software rendering or GPU emulation.'
                });
            }
        }

        // ========== IFRAME ONLOAD TIMING ==========
        const iframeLoadTiming = getValue(iframeData.iframeLoadTiming);
        if (iframeLoadTiming && typeof iframeLoadTiming === 'object') {
            // Suspiciously fast or slow iframe loads
            if (iframeLoadTiming.loadTime !== undefined) {
                if (iframeLoadTiming.loadTime < 1) {
                    this._addIndicator({
                        name: 'iframe_load_too_fast',
                        category: 'IframeAnalysis',
                        description: 'Iframe loaded suspiciously fast',
                        value: `${iframeLoadTiming.loadTime}ms`,
                        riskLevel: 'LOW',
                        confidence: 0.5,
                        importance: 'WEAK',
                        details: 'Iframe onload fired almost instantly. May indicate pre-rendered or cached content manipulation.'
                    });
                }
            }
        }

        // ========== OVERALL BEHAVIORAL SUMMARY ==========
        const summary = getValue(iframeData.summary);
        if (summary && typeof summary === 'object') {
            const anomalyCount = summary.anomalyCount || 0;
            const riskScore = summary.riskScore || 0;

            // High overall risk score from behavioral analysis
            if (riskScore > 0.7 || anomalyCount > 5) {
                this._addIndicator({
                    name: 'behavioral_analysis_high_risk',
                    category: 'IframeAnalysis',
                    description: 'Multiple behavioral anomalies detected',
                    value: `Risk: ${(riskScore * 100).toFixed(0)}%, anomalies: ${anomalyCount}`,
                    riskLevel: 'HIGH',
                    confidence: 0.85,
                    importance: 'CRITICAL',
                    details: 'Combined behavioral signals suggest non-genuine browser environment. Multiple micro-differences detected across timing, cross-realm coherence, and stability tests.'
                });
            }
        }
    }

    /**
     * Add a suspicious indicator to the collection
     * @private
     */
    _addIndicator(indicator) {
        indicator.timestamp = Date.now();
        indicator.id = `${indicator.category.toLowerCase()}_${indicator.name}_${Date.now()}`;
        indicator.importance = indicator.importance || 'WEAK'; // Default to weak if not specified
        this.suspiciousIndicators.push(indicator);
    }

    /**
     * Get summary of suspicious indicators (updated for new filtering system)
     */
    getSummary() {
        const filteredResults = this._applyImportanceFiltering();
        const visibleIndicators = filteredResults.indicators;
        
        const riskCounts = {
            HIGH: visibleIndicators.filter(i => i.riskLevel === 'HIGH').length,
            MEDIUM: visibleIndicators.filter(i => i.riskLevel === 'MEDIUM').length,
            LOW: visibleIndicators.filter(i => i.riskLevel === 'LOW').length
        };

        const overallRisk = riskCounts.HIGH > 0 ? 'HIGH' : riskCounts.MEDIUM > 0 ? 'MEDIUM' : 'LOW';
        const suspicionScore = this._calculateSuspicionScore(visibleIndicators);

        return {
            totalIndicators: visibleIndicators.length,
            totalDetectedIndicators: this.suspiciousIndicators.length, // All detected, including filtered
            riskCounts,
            overallRisk,
            suspicionScore,
            hasSuspiciousActivity: filteredResults.shouldShow,
            reasoning: filteredResults.reasoning,
            analysis: filteredResults.analysis
        };
    }

    /**
     * Calculate overall suspicion score (updated for filtered indicators)
     * @private
     */
    _calculateSuspicionScore(indicators) {
        if (indicators.length === 0) return 0;

        const weightedScore = indicators.reduce((score, indicator) => {
            const weight = indicator.riskLevel === 'HIGH' ? 1 : indicator.riskLevel === 'MEDIUM' ? 0.6 : 0.3;
            return score + (indicator.confidence * weight);
        }, 0);

        return Math.min(weightedScore / indicators.length, 1);
    }

    /**
     * Get all suspicious indicators (including filtered ones for admin/debug view)
     */
    getIndicators() {
        return this.suspiciousIndicators;
    }

    /**
     * Get configuration for easy adjustment (enterprise feature)
     */
    getConfiguration() {
        return {
            indicatorConfig: this.indicatorConfig,
            displayThresholds: this.displayThresholds,
            riskThresholds: this.riskThresholds
        };
    }

    /**
     * Update configuration (enterprise feature for easy threshold adjustment)
     */
    updateConfiguration(newConfig) {
        if (newConfig.indicatorConfig) {
            this.indicatorConfig = { ...this.indicatorConfig, ...newConfig.indicatorConfig };
        }
        if (newConfig.displayThresholds) {
            this.displayThresholds = { ...this.displayThresholds, ...newConfig.displayThresholds };
        }
        if (newConfig.riskThresholds) {
            this.riskThresholds = { ...this.riskThresholds, ...newConfig.riskThresholds };
        }
    }
}

class BrowserFingerprintAnalyzer {
    constructor(options = {}) {
        this.metrics = {};
        this.analysisComplete = false;
        this.timestamp = Date.now();
        this.errors = []; // Track errors during analysis
        
        // Progress callback for UI updates
        this.onProgress = options.onProgress || null;
        this.completedPhases = [];
        
        // Initialize detectors with safe instantiation
        this.suspiciousIndicatorDetector = this._safeCreateDetector(() => new SuspiciousIndicatorDetector(), 'SuspiciousIndicatorDetector');
        this.functionIntegrityDetector = this._safeCreateDetector(() => new FunctionIntegrityDetector(), 'FunctionIntegrityDetector');
        this.suspiciousIndicators = [];
        
        // Known agents detector (Manus, Comet, Genspark, etc.)
        // Loaded lazily in _runKnownAgentsDetection(): agentDetector.js installs import-time hooks, so pages
        // that do not want known-agent detection (knownAgents: false) never load it.
        this.knownAgentsDetector = null;
        this._knownAgentsEnabled = options.knownAgents ?? true;
        this.knownAgentsResults = null;
        this.knownAgentsDetectionHistory = []; // Track detection history for periodic checks
        this._knownAgentsIntervalId = null; // Interval ID for periodic detection
        this._onKnownAgentsUpdate = options.onKnownAgentsUpdate || null; // Callback for live updates
        
        // New modular detectors - with safe instantiation
        this.networkCapabilitiesDetector = this._safeCreateDetector(() => new NetworkCapabilitiesDetector(), 'NetworkCapabilitiesDetector');
        this.batteryStorageDetector = this._safeCreateDetector(() => new BatteryStorageDetector(), 'BatteryStorageDetector');
        this.audioFingerprintDetector = this._safeCreateDetector(() => new AudioFingerprintDetector(options.audioFingerprint || {}), 'AudioFingerprintDetector');
        this.webRTCLeakDetector = this._safeCreateDetector(() => new WebRTCLeakDetector(options.webRTC || {}), 'WebRTCLeakDetector');
        this.webGLFingerprintDetector = this._safeCreateDetector(() => new WebGLFingerprintDetector(options.webgl || {}), 'WebGLFingerprintDetector');
        this.speechSynthesisDetector = this._safeCreateDetector(() => new SpeechSynthesisDetector(options.speechSynthesis || {}), 'SpeechSynthesisDetector');
        this.languageDetector = this._safeCreateDetector(() => new LanguageDetector(), 'LanguageDetector');
        this.cssComputedStyleDetector = this._safeCreateDetector(() => new CssComputedStyleDetector(), 'CssComputedStyleDetector');
        this.workerSignalsDetector = this._safeCreateDetector(() => new WorkerSignalsDetector(options.workerSignals || {}), 'WorkerSignalsDetector');
        this.fontsDetector = this._safeCreateDetector(() => new FontsDetector(options.fonts || {}), 'FontsDetector');
        this.performanceTimingDetector = this._safeCreateDetector(() => new PerformanceTimingDetector(options.performanceTiming || {}), 'PerformanceTimingDetector');
        this.keyboardLayoutDetector = this._safeCreateDetector(() => new KeyboardLayoutDetector(options.keyboardLayout || {}), 'KeyboardLayoutDetector');
        this.permissionsDetector = this._safeCreateDetector(() => new PermissionsDetector(), 'PermissionsDetector');
        this.codecSupportDetector = this._safeCreateDetector(() => new CodecSupportDetector(options.codecSupport || {}), 'CodecSupportDetector');
        this.stackTraceFingerprintDetector = this._safeCreateDetector(() => new StackTraceFingerprintDetector(options.stackTraceFingerprint || {}), 'StackTraceFingerprintDetector');
        this.iframeDetector = this._safeCreateDetector(() => new IframeDetector(options.iframe || {}), 'IframeDetector');
        this.creepjsEnhancedDetector = this._safeCreateDetector(() => new CreepjsEnhancedDetector(options.creepjsEnhanced || {}), 'CreepjsEnhancedDetector');
        
        // Initialize performance timing detector early to catch first-input
        if (this.performanceTimingDetector) {
            this.performanceTimingDetector.init();
        }
        
        // Configuration options
        this.options = {
            // Timeout for individual detectors (default 3 seconds)
            detectorTimeout: options.detectorTimeout ?? 3000,
            // Enable periodic known agents detection (default: true)
            enablePeriodicAgentDetection: options.enablePeriodicAgentDetection ?? false,
            // Interval for periodic agent detection in ms (default: 60000 = 1 minute)
            agentDetectionInterval: options.agentDetectionInterval ?? 60000
        };
    }

    /**
     * Report progress to callback if available
     * @private
     */
    _reportProgress(phase, status, details = {}) {
        if (status === 'complete' || status === 'skipped' || status === 'error') {
            this.completedPhases.push(phase);
        }
        if (this.onProgress) {
            try {
                this.onProgress({
                    phase,
                    status, // 'starting', 'complete', 'error', 'skipped'
                    completedPhases: [...this.completedPhases],
                    totalPhases: 22, // Total number of analysis phases (includes knownAgents, performanceTiming, keyboardLayout, codecSupport, stackTraceFingerprint, creepjsEnhanced)
                    percentage: Math.round((this.completedPhases.length / 22) * 100),
                    ...details
                });
            } catch (e) {
                _log.warn('Progress callback error:', e.message);
            }
        }
    }

    /**
     * Wrap an async operation with a timeout
     * @private
     */
    _withTimeout(promise, timeoutMs, operationName) {
        return Promise.race([
            promise,
            new Promise((_, reject) => 
                setTimeout(() => reject(new Error(`${operationName} timed out after ${timeoutMs}ms`)), timeoutMs)
            )
        ]);
    }

    /**
     * Safely create a detector instance - returns null if construction fails
     * @private
     */
    _safeCreateDetector(factory, name) {
        try {
            return factory();
        } catch (error) {
            _log.warn(`⚠️ Failed to create ${name}:`, error.message);
            this.errors = this.errors || [];
            this.errors.push({ detector: name, error: error.message });
            return null;
        }
    }

    /**
     * Run comprehensive browser fingerprint analysis
     * This method never throws - always returns valid results with error information
     */
    async analyzeFingerprint() {
        _log.log('🔍 Starting comprehensive browser fingerprint analysis...');
        this._reportProgress('initialization', 'starting', { message: 'Starting fingerprint analysis...' });
        
        // Initialize category timing tracking
        const categoryTiming = {};
        const totalStartTime = performance.now();
        
        // Initialize metrics with safe analysis calls
        this._reportProgress('core', 'starting', { message: 'Analyzing core browser properties...' });
        const coreStartTime = performance.now();
        this.metrics = {
            // Core Navigator Properties
            navigator: safeAnalysis(() => this._analyzeNavigator(), 'Navigator'),
            
            // Screen & Display Properties
            display: safeAnalysis(() => this._analyzeDisplay(), 'Display'),
            
            // Browser Window Properties
            window: safeAnalysis(() => this._analyzeWindow(), 'Window'),
            
            // Automation Detection Properties
            automation: safeAnalysis(() => this._analyzeAutomation(), 'Automation'),
            
            // JavaScript Environment
            jsEnvironment: safeAnalysis(() => this._analyzeJSEnvironment(), 'JS Environment'),
            
            // Performance & Memory
            performance: safeAnalysis(() => this._analyzePerformance(), 'Performance'),
            
            // Web APIs, Features & Security
            webApis: safeAnalysis(() => this._analyzeWebAPIs(), 'Web APIs'),
            
            // Document Properties
            document: safeAnalysis(() => this._analyzeDocument(), 'Document')
            
            // Note: API Override Detection is now handled by FunctionIntegrityDetector
            // which provides comprehensive cross-realm checks and only shows violations
        };
        categoryTiming.core = Math.round(performance.now() - coreStartTime);
        this._reportProgress('core', 'complete', { message: 'Core browser properties analyzed' });

        // Run Network Capabilities detection (passive, from Connection API)
        this._reportProgress('network', 'starting', { message: 'Analyzing network capabilities...' });
        _log.log('📡 Analyzing network capabilities...');
        const networkStartTime = performance.now();
        if (this.networkCapabilitiesDetector) {
            try {
                const networkMetrics = this.networkCapabilitiesDetector.analyze();
                this.metrics.networkCapabilities = networkMetrics;
                _log.log('📡 Network capabilities analysis complete:', networkMetrics);
            } catch (error) {
                _log.warn('⚠️ Network capabilities detection failed:', error.message);
                this.metrics.networkCapabilities = { error: { value: error.message, description: 'Network detection error', risk: 'N/A' } };
            }
        } else {
            this.metrics.networkCapabilities = { error: { value: 'Detector not available', description: 'Network capabilities detector failed to initialize', risk: 'N/A' } };
        }
        categoryTiming.networkCapabilities = Math.round(performance.now() - networkStartTime);
        this._reportProgress('network', 'complete', { message: 'Network capabilities analyzed' });

        // Run Performance Timing detection (async - waits for animation frame analysis)
        this._reportProgress('performanceTiming', 'starting', { message: 'Analyzing performance timing metrics...' });
        _log.log('⏱️ Analyzing performance timing metrics...');
        const perfTimingStartTime = performance.now();
        if (this.performanceTimingDetector) {
            try {
                const performanceTimingMetrics = await this._withTimeout(
                    this.performanceTimingDetector.analyze(),
                    this.options.detectorTimeout,
                    'Performance timing detection'
                );
                this.metrics.performanceTiming = performanceTimingMetrics;
                _log.log('⏱️ Performance timing analysis complete:', performanceTimingMetrics);
            } catch (error) {
                _log.warn('⚠️ Performance timing detection failed:', error.message);
                this.metrics.performanceTiming = { error: { value: error.message, description: 'Performance timing detection error', risk: 'N/A' } };
            }
        } else {
            this.metrics.performanceTiming = { error: { value: 'Detector not available', description: 'Performance timing detector failed to initialize', risk: 'N/A' } };
        }
        categoryTiming.performanceTiming = Math.round(performance.now() - perfTimingStartTime);
        this._reportProgress('performanceTiming', 'complete', { message: 'Performance timing metrics analyzed' });

        // Run Battery and Storage detection (async APIs) - WITH TIMEOUT
        this._reportProgress('battery', 'starting', { message: 'Analyzing battery and storage...' });
        _log.log('🔋 Analyzing battery and storage...');
        const batteryStartTime = performance.now();
        if (this.batteryStorageDetector) {
            try {
                const batteryStorageMetrics = await this._withTimeout(
                    this.batteryStorageDetector.analyze(),
                    this.options.detectorTimeout,
                    'Battery/storage detection'
                );
                this.metrics.batteryStorage = batteryStorageMetrics;
                _log.log('🔋 Battery and storage analysis complete:', batteryStorageMetrics);
            } catch (error) {
                _log.warn('⚠️ Battery/storage detection failed:', error.message);
                this.metrics.batteryStorage = { error: { value: error.message, description: 'Battery/storage detection error', risk: 'N/A' } };
            }
        } else {
            this.metrics.batteryStorage = { error: { value: 'Detector not available', description: 'Battery/storage detector failed to initialize', risk: 'N/A' } };
        }
        categoryTiming.batteryStorage = Math.round(performance.now() - batteryStartTime);
        this._reportProgress('battery', 'complete', { message: 'Battery and storage analyzed' });

        // Run Audio Fingerprint detection (async, uses OfflineAudioContext) - WITH TIMEOUT
        this._reportProgress('audio', 'starting', { message: 'Analyzing audio fingerprint...' });
        _log.log('🔊 Analyzing audio fingerprint...');
        const audioStartTime = performance.now();
        if (this.audioFingerprintDetector) {
            try {
                const audioFingerprintMetrics = await this._withTimeout(
                    this.audioFingerprintDetector.analyze(),
                    this.options.detectorTimeout,
                    'Audio fingerprint detection'
                );
                this.metrics.audioFingerprint = audioFingerprintMetrics;
                _log.log('🔊 Audio fingerprint analysis complete:', audioFingerprintMetrics);
            } catch (error) {
                _log.warn('⚠️ Audio fingerprint detection failed:', error.message);
                this.metrics.audioFingerprint = { error: { value: error.message, description: 'Audio fingerprint detection error', risk: 'N/A' } };
            }
        } else {
            this.metrics.audioFingerprint = { error: { value: 'Detector not available', description: 'Audio fingerprint detector failed to initialize', risk: 'N/A' } };
        }
        categoryTiming.audioFingerprint = Math.round(performance.now() - audioStartTime);
        this._reportProgress('audio', 'complete', { message: 'Audio fingerprint analyzed' });


        // Run Speech Synthesis detection (async - waits for voices when available) - WITH TIMEOUT
        this._reportProgress('speech', 'starting', { message: 'Analyzing speech synthesis...' });
        _log.log('🗣️ Analyzing speech synthesis...');
        const speechStartTime = performance.now();
        if (this.speechSynthesisDetector) {
            try {
                const speechMetrics = await this._withTimeout(
                    this.speechSynthesisDetector.analyze(),
                    this.options.detectorTimeout,
                    'Speech synthesis detection'
                );
                this.metrics.speechSynthesis = speechMetrics;
                _log.log('🗣️ Speech synthesis analysis complete:', speechMetrics);
            } catch (error) {
                _log.warn('⚠️ Speech synthesis detection failed:', error.message);
                this.metrics.speechSynthesis = { error: { value: error.message, description: 'Speech synthesis detection error', risk: 'N/A' } };
            }
        } else {
            this.metrics.speechSynthesis = { error: { value: 'Detector not available', description: 'Speech synthesis detector failed to initialize', risk: 'N/A' } };
        }
        categoryTiming.speechSynthesis = Math.round(performance.now() - speechStartTime);
        this._reportProgress('speech', 'complete', { message: 'Speech synthesis analyzed' });

        // Run Codec Support detection (async - uses RTCRtpReceiver.getCapabilities) - WITH TIMEOUT
        this._reportProgress('codec', 'starting', { message: 'Analyzing codec support...' });
        _log.log('🎬 Analyzing codec support...');
        const codecStartTime = performance.now();
        if (this.codecSupportDetector) {
            try {
                const codecMetrics = await this._withTimeout(
                    this.codecSupportDetector.analyze(),
                    this.options.detectorTimeout,
                    'Codec support detection'
                );
                this.metrics.codecSupport = codecMetrics;
                _log.log('🎬 Codec support analysis complete:', codecMetrics);
            } catch (error) {
                _log.warn('⚠️ Codec support detection failed:', error.message);
                this.metrics.codecSupport = { error: { value: error.message, description: 'Codec support detection error', risk: 'N/A' } };
            }
        } else {
            this.metrics.codecSupport = { error: { value: 'Detector not available', description: 'Codec support detector failed to initialize', risk: 'N/A' } };
        }
        categoryTiming.codecSupport = Math.round(performance.now() - codecStartTime);
        this._reportProgress('codec', 'complete', { message: 'Codec support analyzed' });

        // Run Language detection (sync)
        this._reportProgress('language', 'starting', { message: 'Analyzing language signals...' });
        _log.log('🌐 Analyzing language signals...');
        const languageStartTime = performance.now();
        if (this.languageDetector) {
            try {
                const languageMetrics = this.languageDetector.analyze();
                this.metrics.language = languageMetrics;
                _log.log('🌐 Language analysis complete:', languageMetrics);
            } catch (error) {
                _log.warn('⚠️ Language detection failed:', error.message);
                this.metrics.language = { error: { value: error.message, description: 'Language detection error', risk: 'N/A' } };
            }
        } else {
            this.metrics.language = { error: { value: 'Detector not available', description: 'Language detector failed to initialize', risk: 'N/A' } };
        }
        categoryTiming.language = Math.round(performance.now() - languageStartTime);
        this._reportProgress('language', 'complete', { message: 'Language signals analyzed' });

        // Run CSS Computed Style detection (sync)
        this._reportProgress('css', 'starting', { message: 'Analyzing computed styles...' });
        _log.log('🎨 Analyzing computed styles...');
        const cssStartTime = performance.now();
        if (this.cssComputedStyleDetector) {
            try {
                const cssMetrics = this.cssComputedStyleDetector.analyze();
                this.metrics.cssComputedStyle = cssMetrics;
                _log.log('🎨 Computed style analysis complete:', cssMetrics);
            } catch (error) {
                _log.warn('⚠️ Computed style detection failed:', error.message);
                this.metrics.cssComputedStyle = { error: { value: error.message, description: 'Computed style detection error', risk: 'N/A' } };
            }
        } else {
            this.metrics.cssComputedStyle = { error: { value: 'Detector not available', description: 'CSS computed style detector failed to initialize', risk: 'N/A' } };
        }
        categoryTiming.cssComputedStyle = Math.round(performance.now() - cssStartTime);
        this._reportProgress('css', 'complete', { message: 'Computed styles analyzed' });

        // Run WebRTC Leak detection (async - checks for IP leaks via WebRTC) - WITH TIMEOUT
        this._reportProgress('webrtc', 'starting', { message: 'Analyzing WebRTC leaks...' });
        _log.log('📡 Analyzing WebRTC leaks...');
        const webrtcStartTime = performance.now();
        if (this.webRTCLeakDetector) {
            try {
                const webRTCLeakMetrics = await this._withTimeout(
                    this.webRTCLeakDetector.analyze(),
                    this.options.detectorTimeout,
                    'WebRTC leak detection'
                );
                this.metrics.webRTCLeak = webRTCLeakMetrics;
                _log.log('📡 WebRTC leak analysis complete:', webRTCLeakMetrics);
            } catch (error) {
                _log.warn('⚠️ WebRTC leak detection failed:', error.message);
                this.metrics.webRTCLeak = { error: { value: error.message, description: 'WebRTC leak detection error', risk: 'N/A' } };
            }
        } else {
            this.metrics.webRTCLeak = { error: { value: 'Detector not available', description: 'WebRTC leak detector failed to initialize', risk: 'N/A' } };
        }
        categoryTiming.webRTCLeak = Math.round(performance.now() - webrtcStartTime);
        this._reportProgress('webrtc', 'complete', { message: 'WebRTC leaks analyzed' });

        // Run Worker signals detection (async) - WITH TIMEOUT
        this._reportProgress('workers', 'starting', { message: 'Analyzing worker signals...' });
        _log.log('🔄 Analyzing worker signals...');
        const workersStartTime = performance.now();
        if (this.workerSignalsDetector) {
            try {
                const workerMetrics = await this._withTimeout(
                    this.workerSignalsDetector.analyze(),
                    this.options.detectorTimeout,
                    'Worker signals detection'
                );
                this.metrics.workerSignals = workerMetrics;
                _log.log('🔄 Worker signals analysis complete:', workerMetrics);
            } catch (error) {
                _log.warn('⚠️ Worker signals detection failed:', error.message);
                this.metrics.workerSignals = { error: { value: error.message, description: 'Worker signals detection error', risk: 'N/A' } };
            }
        } else {
            this.metrics.workerSignals = { error: { value: 'Detector not available', description: 'Worker signals detector failed to initialize', risk: 'N/A' } };
        }
        categoryTiming.workerSignals = Math.round(performance.now() - workersStartTime);
        this._reportProgress('workers', 'complete', { message: 'Worker signals analyzed' });

        // Run Fonts detection (async - tests installed fonts via FontFace.load) - WITH TIMEOUT
        this._reportProgress('fonts', 'starting', { message: 'Analyzing fonts...' });
        _log.log('🔤 Analyzing fonts...');
        const fontsStartTime = performance.now();
        if (this.fontsDetector) {
            try {
                const fontsMetrics = await this._withTimeout(
                    this.fontsDetector.analyze(),
                    this.options.detectorTimeout,
                    'Fonts detection'
                );
                this.metrics.fonts = fontsMetrics;
                _log.log('🔤 Fonts analysis complete:', fontsMetrics);
            } catch (error) {
                _log.warn('⚠️ Fonts detection failed:', error.message);
                this.metrics.fonts = { error: { value: error.message, description: 'Fonts detection error', risk: 'N/A' } };
            }
        } else {
            this.metrics.fonts = { error: { value: 'Detector not available', description: 'Fonts detector failed to initialize', risk: 'N/A' } };
        }
        categoryTiming.fonts = Math.round(performance.now() - fontsStartTime);
        this._reportProgress('fonts', 'complete', { message: 'Fonts analyzed' });

        // Run Keyboard Layout detection (async - uses navigator.keyboard API) - WITH TIMEOUT
        this._reportProgress('keyboardLayout', 'starting', { message: 'Analyzing keyboard layout...' });
        _log.log('⌨️ Analyzing keyboard layout...');
        const keyboardStartTime = performance.now();
        if (this.keyboardLayoutDetector) {
            try {
                const keyboardLayoutMetrics = await this._withTimeout(
                    this.keyboardLayoutDetector.analyze(),
                    this.options.detectorTimeout,
                    'Keyboard layout detection'
                );
                this.metrics.keyboardLayout = keyboardLayoutMetrics;
                _log.log('⌨️ Keyboard layout analysis complete:', keyboardLayoutMetrics);
            } catch (error) {
                _log.warn('⚠️ Keyboard layout detection failed:', error.message);
                this.metrics.keyboardLayout = { error: { value: error.message, description: 'Keyboard layout detection error', risk: 'N/A' } };
            }
        } else {
            this.metrics.keyboardLayout = { error: { value: 'Detector not available', description: 'Keyboard layout detector failed to initialize', risk: 'N/A' } };
        }
        categoryTiming.keyboardLayout = Math.round(performance.now() - keyboardStartTime);
        this._reportProgress('keyboardLayout', 'complete', { message: 'Keyboard layout analyzed' });

        // Run Permissions detection (async - queries all browser permission states) - WITH TIMEOUT
        this._reportProgress('permissions', 'starting', { message: 'Analyzing permissions...' });
        _log.log('🔐 Analyzing permissions...');
        const permissionsStartTime = performance.now();
        if (this.permissionsDetector) {
            try {
                const permissionsMetrics = await this._withTimeout(
                    this.permissionsDetector.analyze(),
                    this.options.detectorTimeout,
                    'Permissions detection'
                );
                this.metrics.permissions = permissionsMetrics;
                _log.log('🔐 Permissions analysis complete:', permissionsMetrics);
            } catch (error) {
                _log.warn('⚠️ Permissions detection failed:', error.message);
                this.metrics.permissions = { error: { value: error.message, description: 'Permissions detection error', risk: 'N/A' } };
            }
        } else {
            this.metrics.permissions = { error: { value: 'Detector not available', description: 'Permissions detector failed to initialize', risk: 'N/A' } };
        }
        categoryTiming.permissions = Math.round(performance.now() - permissionsStartTime);
        this._reportProgress('permissions', 'complete', { message: 'Permissions analyzed' });

        // Run WebGL Fingerprint detection - WITH TIMEOUT
        this._reportProgress('webgl', 'starting', { message: 'Analyzing WebGL fingerprint...' });
        _log.log('🎨 Analyzing WebGL fingerprint...');
        const webglStartTime = performance.now();
        if (this.webGLFingerprintDetector) {
            try {
                const webGLMetrics = await this._withTimeout(
                    this.webGLFingerprintDetector.analyze(),
                    this.options.detectorTimeout,
                    'WebGL fingerprint detection'
                );
                this.metrics.webgl = webGLMetrics;
                _log.log('🎨 WebGL fingerprint analysis complete:', webGLMetrics);
            } catch (error) {
                _log.warn('⚠️ WebGL fingerprint detection failed:', error.message);
                this.metrics.webgl = { error: { value: error.message, description: 'WebGL fingerprint detection error', risk: 'N/A' } };
            }
        } else {
            this.metrics.webgl = { error: { value: 'Detector not available', description: 'WebGL fingerprint detector failed to initialize', risk: 'N/A' } };
        }
        categoryTiming.webgl = Math.round(performance.now() - webglStartTime);
        this._reportProgress('webgl', 'complete', { message: 'WebGL fingerprint analyzed' });

        // Run Stack Trace Fingerprint detection (collects stack trace characteristics for clustering)
        this._reportProgress('stackTraceFingerprint', 'starting', { message: 'Analyzing stack trace fingerprint...' });
        _log.log('📚 Analyzing stack trace fingerprint...');
        const stackTraceStartTime = performance.now();
        if (this.stackTraceFingerprintDetector) {
            try {
                const stackTraceMetrics = await this._withTimeout(
                    this.stackTraceFingerprintDetector.analyze(),
                    this.options.detectorTimeout,
                    'Stack trace fingerprint detection'
                );
                this.metrics.stackTraceFingerprint = stackTraceMetrics;
                _log.log('📚 Stack trace fingerprint analysis complete:', stackTraceMetrics);
            } catch (error) {
                _log.warn('⚠️ Stack trace fingerprint detection failed:', error.message);
                this.metrics.stackTraceFingerprint = { error: { value: error.message, description: 'Stack trace fingerprint detection error', risk: 'N/A' } };
            }
        } else {
            this.metrics.stackTraceFingerprint = { error: { value: 'Detector not available', description: 'Stack trace fingerprint detector failed to initialize', risk: 'N/A' } };
        }
        categoryTiming.stackTraceFingerprint = Math.round(performance.now() - stackTraceStartTime);
        this._reportProgress('stackTraceFingerprint', 'complete', { message: 'Stack trace fingerprint analyzed' });

        // Run Iframe Analysis detection (contentWindow integrity, fresh window tests, srcdoc support)
        this._reportProgress('iframeAnalysis', 'starting', { message: 'Analyzing iframe environment...' });
        _log.log('🖼️ Analyzing iframe environment...');
        const iframeStartTime = performance.now();
        if (this.iframeDetector) {
            try {
                const iframeMetrics = await this._withTimeout(
                    this.iframeDetector.detect(),
                    this.options.detectorTimeout,
                    'Iframe analysis detection'
                );
                this.metrics.iframeAnalysis = iframeMetrics;
                _log.log('🖼️ Iframe analysis complete:', iframeMetrics);
            } catch (error) {
                _log.warn('⚠️ Iframe analysis failed:', error.message);
                this.metrics.iframeAnalysis = { error: { value: error.message, description: 'Iframe analysis error', risk: 'N/A' } };
            }
        } else {
            this.metrics.iframeAnalysis = { error: { value: 'Detector not available', description: 'Iframe detector failed to initialize', risk: 'N/A' } };
        }
        categoryTiming.iframeAnalysis = Math.round(performance.now() - iframeStartTime);
        this._reportProgress('iframeAnalysis', 'complete', { message: 'Iframe analysis complete' });

        // Run CreepJS Enhanced Detection (Math, DOMRect, CSS Media, Intl fingerprinting)
        this._reportProgress('creepjsEnhanced', 'starting', { message: 'Analyzing CreepJS enhanced fingerprints...' });
        _log.log('🕵️ Analyzing CreepJS enhanced fingerprints (Math, DOMRect, CSS Media, Intl)...');
        const creepjsStartTime = performance.now();
        if (this.creepjsEnhancedDetector) {
            try {
                const creepjsMetrics = await this._withTimeout(
                    this.creepjsEnhancedDetector.analyze(),
                    this.options.detectorTimeout + 2000, // Extra time for DOMRect DOM operations
                    'CreepJS enhanced detection'
                );
                this.metrics.creepjsEnhanced = creepjsMetrics;
                _log.log('🕵️ CreepJS enhanced analysis complete:', creepjsMetrics);
            } catch (error) {
                _log.warn('⚠️ CreepJS enhanced detection failed:', error.message);
                this.metrics.creepjsEnhanced = { error: { value: error.message, description: 'CreepJS enhanced detection error', risk: 'N/A' } };
            }
        } else {
            this.metrics.creepjsEnhanced = { error: { value: 'Detector not available', description: 'CreepJS enhanced detector failed to initialize', risk: 'N/A' } };
        }
        categoryTiming.creepjsEnhanced = Math.round(performance.now() - creepjsStartTime);
        this._reportProgress('creepjsEnhanced', 'complete', { message: 'CreepJS enhanced analysis complete' });

        // Run Media Devices enumeration (async - enumerates available media devices) - WITH TIMEOUT
        this._reportProgress('media', 'starting', { message: 'Analyzing media devices...' });
        _log.log('🎤 Analyzing media devices...');
        const mediaStartTime = performance.now();
        try {
            const mediaDevicesMetrics = await this._withTimeout(
                this._analyzeMediaDevices(),
                this.options.detectorTimeout,
                'Media devices detection'
            );
            this.metrics.mediaDevices = mediaDevicesMetrics;
            _log.log('🎤 Media devices analysis complete:', mediaDevicesMetrics);
        } catch (error) {
            _log.warn('⚠️ Media devices detection failed:', error.message);
            this.metrics.mediaDevices = { error: { value: error.message, description: 'Media devices detection error', risk: 'N/A' } };
        }
        categoryTiming.mediaDevices = Math.round(performance.now() - mediaStartTime);
        this._reportProgress('media', 'complete', { message: 'Media devices analyzed' });

        // Run Function Integrity Detection
        this._reportProgress('functionIntegrity', 'starting', { message: 'Running function integrity detection...' });
        _log.log('🔒 Running Function Integrity detection...');
        const functionIntegrityStartTime = performance.now();
        let functionIntegrityResults = { success: false, error: 'Detector not available' };
        if (this.functionIntegrityDetector) {
            try {
                functionIntegrityResults = await this.functionIntegrityDetector.detectIntegrityViolations();
                if (functionIntegrityResults && functionIntegrityResults.success) {
                    // Add function integrity metrics to the main metrics collection
                    const integrityMetrics = this.functionIntegrityDetector.getFormattedResults();
                    this.metrics = { ...this.metrics, ...integrityMetrics };
                    _log.log('🔒 Function Integrity detection complete:', functionIntegrityResults);
                } else {
                    _log.warn('⚠️ Function Integrity detection returned no results');
                }
            } catch (error) {
                _log.warn('⚠️ Function Integrity detection failed:', error.message);
                functionIntegrityResults = { success: false, error: error.message };
            }
        }
        categoryTiming.functionIntegrity = Math.round(performance.now() - functionIntegrityStartTime);
        this._reportProgress('functionIntegrity', 'complete', { message: 'Function integrity detection complete' });

        // Run Known Agents Detection (Manus, Comet, Genspark, Selenium, Puppeteer, Playwright, etc.)
        this._reportProgress('knownAgents', 'starting', { message: 'Running known agents detection...' });
        _log.log('🕵️ Running Known Agents Detection...');
        const knownAgentsStartTime = performance.now();
        await this._runKnownAgentsDetection();
        categoryTiming.knownAgents = Math.round(performance.now() - knownAgentsStartTime);
        this._reportProgress('knownAgents', 'complete', { message: 'Known agents detection complete' });

        // Start periodic known agents detection if enabled
        if (this.options.enablePeriodicAgentDetection) {
            this.startPeriodicAgentDetection();
        }

        // Collect Behavioral Indicators from stored data
        this._reportProgress('behavioral', 'starting', { message: 'Analyzing behavioral indicators...' });
        _log.log('🎯 Collecting behavioral indicators...');
        const behavioralStartTime = performance.now();
        this.metrics.behavioralIndicators = safeAnalysis(() => this._analyzeBehavioralIndicators(), 'Behavioral Indicators');
        categoryTiming.behavioral = Math.round(performance.now() - behavioralStartTime);
        this._reportProgress('behavioral', 'complete', { message: 'Behavioral indicators analyzed' });

        // Analyze suspicious indicators (includes both original and AI agent indicators)
        this._reportProgress('suspicious', 'starting', { message: 'Finalizing analysis...' });
        const suspiciousStartTime = performance.now();
        let suspiciousResults = { indicators: [], shouldShow: false, reasoning: 'Analysis not available' };
        if (this.suspiciousIndicatorDetector) {
            try {
                suspiciousResults = this.suspiciousIndicatorDetector.analyzeSuspiciousIndicators(this.metrics);
                this.suspiciousIndicators = suspiciousResults.indicators || []; // Filtered indicators
            } catch (error) {
                _log.warn('⚠️ Suspicious indicator analysis failed:', error.message);
                this.suspiciousIndicators = [];
            }
        }
        
        // Add function integrity indicators to the suspicious indicators
        if (functionIntegrityResults && functionIntegrityResults.success && this.functionIntegrityDetector) {
            try {
                const integrityIndicators = this.functionIntegrityDetector.getSuspiciousIndicators();
                this.suspiciousIndicators = [...this.suspiciousIndicators, ...integrityIndicators];
            } catch (error) {
                _log.warn('⚠️ Failed to get function integrity indicators:', error.message);
            }
        }
        
        // Add network/battery/storage indicators
        try {
            this._collectModularDetectorIndicators();
        } catch (error) {
            _log.warn('⚠️ Failed to collect modular detector indicators:', error.message);
        }
        
        this.suspiciousAnalysis = suspiciousResults; // Full analysis including reasoning
        categoryTiming.suspiciousAnalysis = Math.round(performance.now() - suspiciousStartTime);
        this._reportProgress('suspicious', 'complete', { message: 'Analysis complete!' });

        // Calculate total analysis time
        const totalAnalysisTime = Math.round(performance.now() - totalStartTime);
        
        // Add timing metrics to the results - each category as a separate metric
        const categoryTimingDescriptions = {
            core: 'Core browser properties collection time',
            networkCapabilities: 'Network capabilities detection time',
            performanceTiming: 'Performance timing metrics collection time',
            batteryStorage: 'Battery and storage detection time',
            audioFingerprint: 'Audio fingerprint generation time',
            speechSynthesis: 'Speech synthesis detection time',
            language: 'Language detection time',
            cssComputedStyle: 'CSS computed style detection time',
            webRTCLeak: 'WebRTC leak detection time',
            workerSignals: 'Worker signals detection time',
            fonts: 'Fonts detection time',
            keyboardLayout: 'Keyboard layout detection time',
            webgl: 'WebGL fingerprint detection time',
            mediaDevices: 'Media devices enumeration time',
            functionIntegrity: 'Function integrity detection time',
            knownAgents: 'Known agents detection time',
            behavioral: 'Behavioral indicators analysis time',
            suspiciousAnalysis: 'Suspicious indicators analysis time'
        };
        
        this.metrics.collectionTiming = {
            totalAnalysisMs: { 
                value: totalAnalysisTime, 
                description: 'Total fingerprint analysis time in milliseconds', 
                risk: 'N/A' 
            }
        };
        
        // Add each category timing as a separate metric
        for (const [category, timeMs] of Object.entries(categoryTiming)) {
            this.metrics.collectionTiming[`${category}Ms`] = {
                value: timeMs,
                description: categoryTimingDescriptions[category] || `${category} detection time`,
                risk: 'N/A'
            };
        }

        this.analysisComplete = true;
        _log.log('✅ Browser fingerprint analysis complete:', this.metrics);
        _log.log('⏱️ Total analysis time:', totalAnalysisTime, 'ms');
        _log.log('⏱️ Category timing breakdown:', categoryTiming);
        _log.log('🚨 Suspicious indicators analysis:', suspiciousResults);
        if (functionIntegrityResults && functionIntegrityResults.success && this.functionIntegrityDetector) {
            try {
                _log.log('🔒 Function Integrity indicators:', this.functionIntegrityDetector.getSuspiciousIndicators());
            } catch (e) { /* ignore */ }
        }
        return this.metrics;
    }

    /**
     * Collect suspicious indicators from modular detectors
     * @private
     */
    _collectModularDetectorIndicators() {
        // Network capabilities indicators
        if (this.networkCapabilitiesDetector) {
            try {
                const networkIndicators = this.networkCapabilitiesDetector.getSuspiciousIndicators();
                if (networkIndicators) {
                    this.suspiciousIndicators = [...this.suspiciousIndicators, ...networkIndicators];
                }
            } catch (e) {
                // Ignore if not available
            }
        }

        // Battery/storage indicators
        if (this.batteryStorageDetector) {
            try {
                const batteryStorageIndicators = this.batteryStorageDetector.getSuspiciousIndicators();
                if (batteryStorageIndicators) {
                    this.suspiciousIndicators = [...this.suspiciousIndicators, ...batteryStorageIndicators];
                }
            } catch (e) {
                // Ignore if not available
            }
        }

        // Audio fingerprint indicators
        if (this.audioFingerprintDetector) {
            try {
                const audioIndicators = this.audioFingerprintDetector.getSuspiciousIndicators();
                if (audioIndicators) {
                    this.suspiciousIndicators = [...this.suspiciousIndicators, ...audioIndicators];
                }
            } catch (e) {
                // Ignore if not available
            }
        }

        // Codec support indicators
        if (this.codecSupportDetector) {
            try {
                const codecIndicators = this.codecSupportDetector.getSuspiciousIndicators();
                if (codecIndicators) {
                    this.suspiciousIndicators = [...this.suspiciousIndicators, ...codecIndicators];
                }
            } catch (e) {
                // Ignore if not available
            }
        }

        // WebRTC leak indicators
        if (this.webRTCLeakDetector) {
            try {
                const webRTCIndicators = this.webRTCLeakDetector.getSuspiciousIndicators();
                if (webRTCIndicators) {
                    this.suspiciousIndicators = [...this.suspiciousIndicators, ...webRTCIndicators];
                }
            } catch (e) {
                // Ignore if not available
            }
        }

        // WebGL fingerprint indicators
        if (this.webGLFingerprintDetector) {
            try {
                const webGLIndicators = this.webGLFingerprintDetector.getSuspiciousIndicators();
                if (webGLIndicators) {
                    this.suspiciousIndicators = [...this.suspiciousIndicators, ...webGLIndicators];
                }
            } catch (e) {
                // Ignore if not available
            }
        }

        // Keyboard layout indicators
        if (this.keyboardLayoutDetector) {
            try {
                const keyboardLayoutIndicators = this.keyboardLayoutDetector.getSuspiciousIndicators();
                if (keyboardLayoutIndicators) {
                    this.suspiciousIndicators = [...this.suspiciousIndicators, ...keyboardLayoutIndicators];
                }
            } catch (e) {
                // Ignore if not available
            }
        }

        // Media devices indicators
        try {
            const mediaDevicesIndicators = this._getMediaDevicesSuspiciousIndicators();
            if (mediaDevicesIndicators) {
                this.suspiciousIndicators = [...this.suspiciousIndicators, ...mediaDevicesIndicators];
            }
        } catch (e) {
            // Ignore if not available
        }
    }

    /**
     * Get suspicious indicators from media devices analysis
     * @private
     */
    _getMediaDevicesSuspiciousIndicators() {
        const indicators = [];
        const mediaDevices = this.metrics.mediaDevices;

        if (!mediaDevices) return indicators;

        // Check for fake devices - HIGHEST priority indicator for AI agents
        if (mediaDevices.fakeDevicesDetected?.value === true) {
            indicators.push({
                category: 'media_devices',
                name: 'fake_media_devices',
                description: 'Fake/simulated media devices detected - strong indicator of AI automation agents (e.g., browserUse)',
                severity: 'HIGH',
                confidence: 0.95,
                details: mediaDevices.fakeDeviceLabels?.value 
                    ? `Fake devices: ${mediaDevices.fakeDeviceLabels.value}`
                    : 'Devices with fake/simulated labels detected',
                importance: 'CRITICAL'
            });
        }

        // Check for no devices at all
        if (mediaDevices.totalDevices?.value === 0) {
            indicators.push({
                category: 'media_devices',
                name: 'no_media_devices',
                description: 'No media devices detected - common in headless browsers and VMs',
                severity: 'HIGH',
                confidence: 0.85,
                details: 'Real user environments typically have at least audio output devices'
            });
        }

        // Check for no audio input devices
        if (mediaDevices.audioInputCount?.value === 0 && mediaDevices.audioOutputCount?.value === 0) {
            indicators.push({
                category: 'media_devices',
                name: 'no_audio_devices',
                description: 'No audio devices (input or output) detected',
                severity: 'MEDIUM',
                confidence: 0.7,
                details: 'Most real systems have at least speakers or headphones'
            });
        }

        // Check if API is available but returns error
        if (mediaDevices.error) {
            indicators.push({
                category: 'media_devices',
                name: 'enumerate_devices_error',
                description: 'Error enumerating media devices',
                severity: 'MEDIUM',
                confidence: 0.6,
                details: `Error: ${mediaDevices.error.value}`
            });
        }

        return indicators;
    }

    /**
     * Run known agents detection (Manus, Comet, Genspark, Selenium, Puppeteer, Playwright, etc.)
     * @private
     */
    async _runKnownAgentsDetection() {
        if (!this._knownAgentsEnabled) {
            this.knownAgentsResults = { skipped: true };
            return;
        }
        if (!this.knownAgentsDetector) {
            try {
                const mod = await import('./agentDetector.js');
                this.knownAgentsDetector = new mod.AIAgentDetector();
            } catch (error) {
                this.errors.push({ detector: 'KnownAgentsDetector', error: error.message });
            }
        }
        if (!this.knownAgentsDetector) {
            _log.warn('⚠️ Known agents detector not available');
            this.knownAgentsResults = { error: 'Detector not available' };
            return;
        }

        try {
            // Reset the detector state for fresh detection
            this.knownAgentsDetector.detectedAgents = new Set();
            this.knownAgentsDetector.detectionResults = [];
            this.knownAgentsDetector.isRunning = false;

            const results = await this.knownAgentsDetector.runAllDetections();
            const summary = this.knownAgentsDetector.getSummary();
            
            this.knownAgentsResults = {
                timestamp: Date.now(),
                detectionResults: results,
                summary: summary,
                detectedAgents: summary.detectedAgents,
                hasAnyAgent: summary.hasAnyAgent,
                totalDetected: summary.totalDetected
            };

            // Add to detection history
            this.knownAgentsDetectionHistory.push({
                timestamp: Date.now(),
                detectedAgents: [...summary.detectedAgents],
                totalDetected: summary.totalDetected
            });

            // Keep only last 10 detection results in history
            if (this.knownAgentsDetectionHistory.length > 10) {
                this.knownAgentsDetectionHistory.shift();
            }

            // Add to metrics
            this.metrics.knownAgentsDetection = this._formatKnownAgentsMetrics();

            // Add known agents to suspicious indicators if detected
            if (summary.hasAnyAgent) {
                results.forEach(result => {
                    if (result.detected) {
                        this.suspiciousIndicators.push({
                            category: 'known_agent',
                            name: 'known_agent_detected',
                            description: `Known AI agent detected: ${result.name}`,
                            severity: 'HIGH',
                            confidence: result.confidence || 0.9,
                            importance: 'CRITICAL',
                            details: `Detection method: ${result.detectionMethod}`,
                            agentName: result.name,
                            primarySignal: result.primarySignal
                        });
                    }
                });
            }

            _log.log('🕵️ Known Agents detection complete:', this.knownAgentsResults);
        } catch (error) {
            _log.warn('⚠️ Known agents detection failed:', error.message);
            this.knownAgentsResults = { error: error.message, timestamp: Date.now() };
        }
    }

    /**
     * Format known agents detection results for metrics display
     * @private
     */
    _formatKnownAgentsMetrics() {
        if (!this.knownAgentsResults || this.knownAgentsResults.error) {
            return {
                status: {
                    value: 'Error',
                    description: 'Known agents detection status',
                    risk: 'N/A'
                },
                error: {
                    value: this.knownAgentsResults?.error || 'Unknown error',
                    description: 'Error message',
                    risk: 'N/A'
                }
            };
        }

        const metrics = {
            detectionTimestamp: {
                value: new Date(this.knownAgentsResults.timestamp).toISOString(),
                description: 'Last detection timestamp',
                risk: 'N/A'
            },
            totalAgentsChecked: {
                value: this.knownAgentsResults.detectionResults?.length || 0,
                description: 'Total number of known agents checked',
                risk: 'N/A'
            },
            agentsDetected: {
                value: this.knownAgentsResults.totalDetected || 0,
                description: 'Number of known agents detected',
                risk: (this.knownAgentsResults.totalDetected || 0) > 0 ? 'HIGH' : 'LOW'
            },
            hasAnyAgent: {
                value: this.knownAgentsResults.hasAnyAgent || false,
                description: 'Whether any known agent was detected',
                risk: this.knownAgentsResults.hasAnyAgent ? 'HIGH' : 'LOW'
            },
            detectedAgentsList: {
                value: this.knownAgentsResults.detectedAgents?.join(', ') || 'None',
                description: 'List of detected agent names',
                risk: (this.knownAgentsResults.detectedAgents?.length || 0) > 0 ? 'HIGH' : 'LOW'
            },
            periodicDetectionEnabled: {
                value: this.options.enablePeriodicAgentDetection,
                description: 'Whether periodic agent detection is enabled',
                risk: 'N/A'
            },
            detectionInterval: {
                value: `${this.options.agentDetectionInterval / 1000}s`,
                description: 'Interval between periodic detections',
                risk: 'N/A'
            },
            detectionHistoryCount: {
                value: this.knownAgentsDetectionHistory.length,
                description: 'Number of detection runs in history',
                risk: 'N/A'
            }
        };

        // Add individual agent detection results
        if (this.knownAgentsResults.detectionResults) {
            this.knownAgentsResults.detectionResults.forEach(result => {
                const agentKey = `agent_${result.name.toLowerCase().replace(/[^a-z0-9]/g, '_')}`;
                metrics[agentKey] = {
                    value: result.detected ? `DETECTED (${(result.confidence * 100).toFixed(0)}%)` : 'Not detected',
                    description: `${result.name} agent detection status (${result.detectionMethod})`,
                    risk: result.detected ? 'HIGH' : 'LOW',
                    detected: result.detected,
                    confidence: result.confidence,
                    indicators: result.indicators || [],
                    primarySignal: result.primarySignal
                };
            });
        }

        return metrics;
    }

    /**
     * Start periodic known agents detection
     * Runs detection every minute (configurable) to catch late-initializing agents
     */
    startPeriodicAgentDetection() {
        if (!this._knownAgentsEnabled) return;
        if (this._knownAgentsIntervalId) {
            _log.log('🕵️ Periodic agent detection already running');
            return;
        }

        const intervalMs = this.options.agentDetectionInterval;
        _log.log(`🕵️ Starting periodic agent detection (every ${intervalMs / 1000}s)`);

        this._knownAgentsIntervalId = setInterval(async () => {
            _log.log('🕵️ Running periodic agent detection...');
            const previousAgents = new Set(this.knownAgentsResults?.detectedAgents || []);
            
            await this._runKnownAgentsDetection();
            
            // Update metrics
            this.metrics.knownAgentsDetection = this._formatKnownAgentsMetrics();
            
            // Check for newly detected agents
            const currentAgents = new Set(this.knownAgentsResults?.detectedAgents || []);
            const newAgents = [...currentAgents].filter(agent => !previousAgents.has(agent));
            
            if (newAgents.length > 0) {
                _log.warn(`⚠️ NEW AGENT(S) DETECTED: ${newAgents.join(', ')}`);
            }
            
            // Trigger callback if provided (for UI updates)
            if (this._onKnownAgentsUpdate) {
                try {
                    this._onKnownAgentsUpdate({
                        results: this.knownAgentsResults,
                        metrics: this.metrics.knownAgentsDetection,
                        newAgentsDetected: newAgents,
                        history: this.knownAgentsDetectionHistory
                    });
                } catch (e) {
                    _log.warn('⚠️ Known agents update callback failed:', e.message);
                }
            }
        }, intervalMs);
    }

    /**
     * Stop periodic known agents detection
     */
    stopPeriodicAgentDetection() {
        if (this._knownAgentsIntervalId) {
            clearInterval(this._knownAgentsIntervalId);
            this._knownAgentsIntervalId = null;
            _log.log('🕵️ Periodic agent detection stopped');
        }
    }

    /**
     * Set callback for known agents detection updates
     * @param {Function} callback - Callback function to receive updates
     */
    setKnownAgentsUpdateCallback(callback) {
        this._onKnownAgentsUpdate = callback;
    }

    /**
     * Get known agents detection results
     * @returns {Object} Known agents detection results
     */
    getKnownAgentsResults() {
        return {
            results: this.knownAgentsResults,
            metrics: this.metrics.knownAgentsDetection,
            history: this.knownAgentsDetectionHistory,
            isPeriodicRunning: !!this._knownAgentsIntervalId
        };
    }

    /**
     * Manually trigger known agents detection
     * @returns {Promise<Object>} Detection results
     */
    async runKnownAgentsDetection() {
        await this._runKnownAgentsDetection();
        this.metrics.knownAgentsDetection = this._formatKnownAgentsMetrics();
        return this.getKnownAgentsResults();
    }

    /**
     * Analyze Navigator properties
     * @private
     */
    _analyzeNavigator() {
        try {
            const nav = window.navigator || {};
            return {
                userAgent: {
                    value: safeGet(() => nav.userAgent, 'Unknown'),
                    description: 'Browser identification string'
                },
                appCodeName: {
                    value: safeGet(() => nav.appCodeName),
                    description: 'Browser code name'
                },
                cookieEnabled: {
                    value: safeGet(() => nav.cookieEnabled, false),
                    description: 'Cookie support status'
                },
                platform: {
                    value: safeGet(() => nav.platform),
                    description: 'Operating system platform'
                },
                language: {
                    value: safeGet(() => nav.language),
                    description: 'Primary browser language'
                },
                webdriver: {
                    value: safeGet(() => nav.webdriver, false),
                    description: 'WebDriver automation flag',
                    risk: safeGet(() => nav.webdriver, false) === true ? 'HIGH' : 'LOW'
                },
                maxTouchPoints: {
                    value: safeGet(() => nav.maxTouchPoints, 0),
                    description: 'Maximum touch contact points',
                    risk: safeGet(() => nav.maxTouchPoints, 0) === 0 ? 'MEDIUM' : 'LOW'
                },
                msMaxTouchPoints: {
                    value: safeGet(() => nav.msMaxTouchPoints),
                    description: 'Microsoft-specific max touch points'
                },
                hardwareConcurrency: {
                    value: safeGet(() => nav.hardwareConcurrency),
                    description: 'Number of logical processor cores',
                    risk: (() => {
                        const cores = safeGet(() => nav.hardwareConcurrency, 0);
                        return (cores && cores % 2 !== 0) ? 'MEDIUM' : 'LOW';
                    })()
                },
                pluginsLength: {
                    value: safeGet(() => nav.plugins ? nav.plugins.length : 0, 0),
                    description: 'Number of browser plugins available',
                    risk: safeGet(() => nav.plugins && nav.plugins.length, 1) === 0 ? 'HIGH' : 'LOW'
                },
                mimeTypesLength: {
                    value: safeGet(() => nav.mimeTypes ? nav.mimeTypes.length : 0, 0),
                    description: 'Number of MIME types supported',
                    risk: safeGet(() => nav.mimeTypes && nav.mimeTypes.length, 1) === 0 ? 'HIGH' : 'LOW'
                },
                onLine: {
                    value: safeGet(() => nav.onLine, true),
                    description: 'Network connectivity status'
                },
                buildID: {
                    value: safeGet(() => nav.buildID),
                    description: 'Browser build identifier'
                },
                product: {
                    value: safeGet(() => nav.product),
                    description: 'Browser engine name'
                },
                appVersion: {
                    value: safeGet(() => nav.appVersion),
                    description: 'Browser version information'
                },
                cpuClass: {
                    value: safeGet(() => nav.cpuClass),
                    description: 'CPU class architecture'
                },
                vendor: {
                    value: safeGet(() => nav.vendor),
                    description: 'Browser vendor'
                },
                vendorSub: {
                    value: safeGet(() => nav.vendorSub),
                    description: 'Browser vendor sub-version'
                },
                productSub: {
                    value: safeGet(() => nav.productSub),
                    description: 'Browser product sub-version'
                },
                doNotTrack: {
                    value: safeGet(() => nav.doNotTrack),
                    description: 'Do Not Track preference'
                },
                msDoNotTrack: {
                    value: safeGet(() => nav.msDoNotTrack),
                    description: 'Microsoft Do Not Track'
                },
                pluginsString1: {
                    value: safeGet(() => nav.plugins && nav.plugins.length > 0 ? nav.plugins[0].name : null),
                    description: 'First plugin name string'
                },
                pluginsString2: {
                    value: safeGet(() => nav.plugins && nav.plugins.length > 1 ? nav.plugins[1].name : null),
                    description: 'Second plugin name string'
                },
                hasWebkitGetUserMedia: {
                    value: safeGet(() => !!nav.webkitGetUserMedia, false),
                    description: 'Webkit getUserMedia availability'
                },
                hasMozGetUserMedia: {
                    value: safeGet(() => !!nav.mozGetUserMedia, false),
                    description: 'Mozilla getUserMedia availability'
                },
                hasMsGetUserMedia: {
                    value: safeGet(() => !!nav.msGetUserMedia, false),
                    description: 'Microsoft getUserMedia availability'
                },
                hasVibrate: {
                    value: safeGet(() => !!nav.vibrate, false),
                    description: 'Vibrate API availability'
                },
                hasGetBattery: {
                    value: safeGet(() => !!nav.getBattery, false),
                    description: 'Battery Status API availability'
                },
                hasConnection: {
                    value: safeGet(() => !!nav.connection, false),
                    description: 'Network Information API availability'
                },
                // ==========================================
                // API Availability Checks (Bot Detection)
                // ==========================================
                
                // Priority 3 - Critical APIs
                hasNotification: {
                    value: safeGet(() => typeof Notification !== 'undefined', false),
                    description: 'Notification API availability'
                },
                
                // Priority 2 - Important APIs
                hasServiceWorker: {
                    value: safeGet(() => !!nav.serviceWorker, false),
                    description: 'Service Worker API availability'
                },
                hasClipboard: {
                    value: safeGet(() => !!nav.clipboard, false),
                    description: 'Clipboard API availability'
                },
                hasWebGL: {
                    value: safeGet(() => typeof WebGLRenderingContext !== 'undefined', false),
                    description: 'WebGL API availability'
                },
                hasWebAudio: {
                    value: safeGet(() => typeof AudioContext !== 'undefined' || typeof webkitAudioContext !== 'undefined', false),
                    description: 'Web Audio API availability'
                },
                hasSpeechSynthesis: {
                    value: safeGet(() => typeof speechSynthesis !== 'undefined', false),
                    description: 'Speech Synthesis API availability'
                },
                hasStorage: {
                    value: safeGet(() => !!nav.storage, false),
                    description: 'Storage Manager API availability'
                },
                hasPermissions: {
                    value: safeGet(() => !!nav.permissions, false),
                    description: 'Permissions API availability'
                },
                hasMediaDevices: {
                    value: safeGet(() => !!nav.mediaDevices, false),
                    description: 'MediaDevices API availability'
                },
                
                // Priority 2 - Browser Detection
                hasChrome: {
                    value: safeGet(() => !!window.chrome, false),
                    description: 'Chrome browser object availability'
                },
                hasChromeRuntime: {
                    value: safeGet(() => !!(window.chrome && window.chrome.runtime), false),
                    description: 'Chrome runtime API availability'
                },
                
                // Priority 1 - Extended APIs
                hasWebGL2: {
                    value: safeGet(() => typeof WebGL2RenderingContext !== 'undefined', false),
                    description: 'WebGL2 API availability'
                },
                hasWebRTC: {
                    value: safeGet(() => typeof RTCPeerConnection !== 'undefined' || typeof webkitRTCPeerConnection !== 'undefined', false),
                    description: 'WebRTC API availability'
                },
                hasWebCrypto: {
                    value: safeGet(() => !!(window.crypto && window.crypto.subtle), false),
                    description: 'Web Crypto API availability'
                },
                hasBluetooth: {
                    value: safeGet(() => !!nav.bluetooth, false),
                    description: 'Web Bluetooth API availability'
                },
                hasUSB: {
                    value: safeGet(() => !!nav.usb, false),
                    description: 'WebUSB API availability'
                },
                hasPayment: {
                    value: safeGet(() => typeof PaymentRequest !== 'undefined', false),
                    description: 'Payment Request API availability'
                },
                hasSpeechRecognition: {
                    value: safeGet(() => typeof SpeechRecognition !== 'undefined' || typeof webkitSpeechRecognition !== 'undefined', false),
                    description: 'Speech Recognition API availability'
                },
                hasDeviceOrientation: {
                    value: safeGet(() => typeof DeviceOrientationEvent !== 'undefined', false),
                    description: 'Device Orientation API availability'
                },
                hasDeviceMotion: {
                    value: safeGet(() => typeof DeviceMotionEvent !== 'undefined', false),
                    description: 'Device Motion API availability'
                },
                hasPointerEvent: {
                    value: safeGet(() => typeof PointerEvent !== 'undefined', false),
                    description: 'Pointer Events API availability'
                },
                hasGamepad: {
                    value: safeGet(() => typeof nav.getGamepads === 'function', false),
                    description: 'Gamepad API availability'
                },
                hasVR: {
                    value: safeGet(() => typeof nav.getVRDisplays === 'function', false),
                    description: 'WebVR API availability (deprecated)'
                },
                hasXR: {
                    value: safeGet(() => !!nav.xr, false),
                    description: 'WebXR API availability'
                },
                hasShare: {
                    value: safeGet(() => typeof nav.share === 'function', false),
                    description: 'Web Share API availability'
                },
                hasCredentials: {
                    value: safeGet(() => !!nav.credentials, false),
                    description: 'Credentials Management API availability'
                },
                hasLocks: {
                    value: safeGet(() => !!nav.locks, false),
                    description: 'Web Locks API availability'
                },
                hasWakeLock: {
                    value: safeGet(() => !!nav.wakeLock, false),
                    description: 'Screen Wake Lock API availability'
                },
                hasSerial: {
                    value: safeGet(() => !!nav.serial, false),
                    description: 'Web Serial API availability'
                },
                hasHID: {
                    value: safeGet(() => !!nav.hid, false),
                    description: 'WebHID API availability'
                },
                hasKeyboard: {
                    value: safeGet(() => !!nav.keyboard, false),
                    description: 'Keyboard API availability'
                },
                hasWebAuthn: {
                    value: safeGet(() => typeof PublicKeyCredential !== 'undefined', false),
                    description: 'Web Authentication API availability'
                },
                hasCustomElements: {
                    value: safeGet(() => typeof customElements !== 'undefined', false),
                    description: 'Custom Elements API availability'
                },
                
                // ==========================================
                // Computed API Capability Signature
                // ==========================================
                apiCapabilitySignature: {
                    value: (() => {
                        // Build a compact string signature of all API capabilities
                        // Format: abbrev:T/F separated by |
                        // This makes it easy to compare platform differences
                        const caps = [];
                        
                        // Priority 3 - Critical (uppercase)
                        caps.push(`NT:${typeof Notification !== 'undefined' ? 'T' : 'F'}`);
                        
                        // Priority 2 - Important
                        caps.push(`SW:${!!nav.serviceWorker ? 'T' : 'F'}`);
                        caps.push(`CB:${!!nav.clipboard ? 'T' : 'F'}`);
                        caps.push(`GL:${typeof WebGLRenderingContext !== 'undefined' ? 'T' : 'F'}`);
                        caps.push(`AU:${(typeof AudioContext !== 'undefined' || typeof webkitAudioContext !== 'undefined') ? 'T' : 'F'}`);
                        caps.push(`SS:${typeof speechSynthesis !== 'undefined' ? 'T' : 'F'}`);
                        caps.push(`ST:${!!nav.storage ? 'T' : 'F'}`);
                        caps.push(`PM:${!!nav.permissions ? 'T' : 'F'}`);
                        caps.push(`MD:${!!nav.mediaDevices ? 'T' : 'F'}`);
                        caps.push(`CH:${!!window.chrome ? 'T' : 'F'}`);
                        caps.push(`CR:${!!(window.chrome && window.chrome.runtime) ? 'T' : 'F'}`);
                        
                        // Priority 1 - Extended
                        caps.push(`G2:${typeof WebGL2RenderingContext !== 'undefined' ? 'T' : 'F'}`);
                        caps.push(`RT:${(typeof RTCPeerConnection !== 'undefined' || typeof webkitRTCPeerConnection !== 'undefined') ? 'T' : 'F'}`);
                        caps.push(`CY:${!!(window.crypto && window.crypto.subtle) ? 'T' : 'F'}`);
                        caps.push(`BT:${!!nav.bluetooth ? 'T' : 'F'}`);
                        caps.push(`US:${!!nav.usb ? 'T' : 'F'}`);
                        caps.push(`PY:${typeof PaymentRequest !== 'undefined' ? 'T' : 'F'}`);
                        caps.push(`SR:${(typeof SpeechRecognition !== 'undefined' || typeof webkitSpeechRecognition !== 'undefined') ? 'T' : 'F'}`);
                        caps.push(`DO:${typeof DeviceOrientationEvent !== 'undefined' ? 'T' : 'F'}`);
                        caps.push(`DM:${typeof DeviceMotionEvent !== 'undefined' ? 'T' : 'F'}`);
                        caps.push(`PE:${typeof PointerEvent !== 'undefined' ? 'T' : 'F'}`);
                        caps.push(`GP:${typeof nav.getGamepads === 'function' ? 'T' : 'F'}`);
                        caps.push(`VR:${typeof nav.getVRDisplays === 'function' ? 'T' : 'F'}`);
                        caps.push(`XR:${!!nav.xr ? 'T' : 'F'}`);
                        caps.push(`SH:${typeof nav.share === 'function' ? 'T' : 'F'}`);
                        caps.push(`CD:${!!nav.credentials ? 'T' : 'F'}`);
                        caps.push(`LK:${!!nav.locks ? 'T' : 'F'}`);
                        caps.push(`WL:${!!nav.wakeLock ? 'T' : 'F'}`);
                        caps.push(`SE:${!!nav.serial ? 'T' : 'F'}`);
                        caps.push(`HD:${!!nav.hid ? 'T' : 'F'}`);
                        caps.push(`KB:${!!nav.keyboard ? 'T' : 'F'}`);
                        caps.push(`WA:${typeof PublicKeyCredential !== 'undefined' ? 'T' : 'F'}`);
                        caps.push(`CE:${typeof customElements !== 'undefined' ? 'T' : 'F'}`);
                        
                        // Also include legacy APIs we already tracked
                        caps.push(`VB:${!!nav.vibrate ? 'T' : 'F'}`);
                        caps.push(`BA:${!!nav.getBattery ? 'T' : 'F'}`);
                        caps.push(`CN:${!!nav.connection ? 'T' : 'F'}`);
                        
                        return caps.join('|');
                    })(),
                    description: 'Compact API capability signature for platform comparison. Legend: NT=Notification, SW=ServiceWorker, CB=Clipboard, GL=WebGL, AU=WebAudio, SS=SpeechSynthesis, ST=Storage, PM=Permissions, MD=MediaDevices, CH=Chrome, CR=ChromeRuntime, G2=WebGL2, RT=WebRTC, CY=Crypto, BT=Bluetooth, US=USB, PY=Payment, SR=SpeechRecognition, DO=DeviceOrientation, DM=DeviceMotion, PE=PointerEvent, GP=Gamepad, VR=WebVR, XR=WebXR, SH=Share, CD=Credentials, LK=Locks, WL=WakeLock, SE=Serial, HD=HID, KB=Keyboard, WA=WebAuthn, CE=CustomElements, VB=Vibrate, BA=Battery, CN=Connection'
                },
                
                // Also add a hash of the signature for quick comparison
                apiCapabilityHash: {
                    value: (() => {
                        const caps = [];
                        caps.push(typeof Notification !== 'undefined' ? '1' : '0');
                        caps.push(!!nav.serviceWorker ? '1' : '0');
                        caps.push(!!nav.clipboard ? '1' : '0');
                        caps.push(typeof WebGLRenderingContext !== 'undefined' ? '1' : '0');
                        caps.push((typeof AudioContext !== 'undefined' || typeof webkitAudioContext !== 'undefined') ? '1' : '0');
                        caps.push(typeof speechSynthesis !== 'undefined' ? '1' : '0');
                        caps.push(!!nav.storage ? '1' : '0');
                        caps.push(!!nav.permissions ? '1' : '0');
                        caps.push(!!nav.mediaDevices ? '1' : '0');
                        caps.push(!!window.chrome ? '1' : '0');
                        caps.push(!!(window.chrome && window.chrome.runtime) ? '1' : '0');
                        caps.push(typeof WebGL2RenderingContext !== 'undefined' ? '1' : '0');
                        caps.push((typeof RTCPeerConnection !== 'undefined' || typeof webkitRTCPeerConnection !== 'undefined') ? '1' : '0');
                        caps.push(!!(window.crypto && window.crypto.subtle) ? '1' : '0');
                        caps.push(!!nav.bluetooth ? '1' : '0');
                        caps.push(!!nav.usb ? '1' : '0');
                        caps.push(typeof PaymentRequest !== 'undefined' ? '1' : '0');
                        caps.push((typeof SpeechRecognition !== 'undefined' || typeof webkitSpeechRecognition !== 'undefined') ? '1' : '0');
                        caps.push(typeof DeviceOrientationEvent !== 'undefined' ? '1' : '0');
                        caps.push(typeof DeviceMotionEvent !== 'undefined' ? '1' : '0');
                        caps.push(typeof PointerEvent !== 'undefined' ? '1' : '0');
                        caps.push(typeof nav.getGamepads === 'function' ? '1' : '0');
                        caps.push(typeof nav.getVRDisplays === 'function' ? '1' : '0');
                        caps.push(!!nav.xr ? '1' : '0');
                        caps.push(typeof nav.share === 'function' ? '1' : '0');
                        caps.push(!!nav.credentials ? '1' : '0');
                        caps.push(!!nav.locks ? '1' : '0');
                        caps.push(!!nav.wakeLock ? '1' : '0');
                        caps.push(!!nav.serial ? '1' : '0');
                        caps.push(!!nav.hid ? '1' : '0');
                        caps.push(!!nav.keyboard ? '1' : '0');
                        caps.push(typeof PublicKeyCredential !== 'undefined' ? '1' : '0');
                        caps.push(typeof customElements !== 'undefined' ? '1' : '0');
                        caps.push(!!nav.vibrate ? '1' : '0');
                        caps.push(!!nav.getBattery ? '1' : '0');
                        caps.push(!!nav.connection ? '1' : '0');
                        
                        // Convert binary string to hex for compact representation
                        const binStr = caps.join('');
                        let hex = '';
                        for (let i = 0; i < binStr.length; i += 4) {
                            const chunk = binStr.substr(i, 4).padEnd(4, '0');
                            hex += parseInt(chunk, 2).toString(16);
                        }
                        return hex.toUpperCase();
                    })(),
                    description: 'Hex hash of API capabilities bitmap (36 bits). Each bit represents one API availability in order of signature.'
                },
                
                // Count of available APIs for quick comparison
                apiCapabilityCount: {
                    value: (() => {
                        let count = 0;
                        if (typeof Notification !== 'undefined') count++;
                        if (!!nav.serviceWorker) count++;
                        if (!!nav.clipboard) count++;
                        if (typeof WebGLRenderingContext !== 'undefined') count++;
                        if (typeof AudioContext !== 'undefined' || typeof webkitAudioContext !== 'undefined') count++;
                        if (typeof speechSynthesis !== 'undefined') count++;
                        if (!!nav.storage) count++;
                        if (!!nav.permissions) count++;
                        if (!!nav.mediaDevices) count++;
                        if (!!window.chrome) count++;
                        if (!!(window.chrome && window.chrome.runtime)) count++;
                        if (typeof WebGL2RenderingContext !== 'undefined') count++;
                        if (typeof RTCPeerConnection !== 'undefined' || typeof webkitRTCPeerConnection !== 'undefined') count++;
                        if (!!(window.crypto && window.crypto.subtle)) count++;
                        if (!!nav.bluetooth) count++;
                        if (!!nav.usb) count++;
                        if (typeof PaymentRequest !== 'undefined') count++;
                        if (typeof SpeechRecognition !== 'undefined' || typeof webkitSpeechRecognition !== 'undefined') count++;
                        if (typeof DeviceOrientationEvent !== 'undefined') count++;
                        if (typeof DeviceMotionEvent !== 'undefined') count++;
                        if (typeof PointerEvent !== 'undefined') count++;
                        if (typeof nav.getGamepads === 'function') count++;
                        if (typeof nav.getVRDisplays === 'function') count++;
                        if (!!nav.xr) count++;
                        if (typeof nav.share === 'function') count++;
                        if (!!nav.credentials) count++;
                        if (!!nav.locks) count++;
                        if (!!nav.wakeLock) count++;
                        if (!!nav.serial) count++;
                        if (!!nav.hid) count++;
                        if (!!nav.keyboard) count++;
                        if (typeof PublicKeyCredential !== 'undefined') count++;
                        if (typeof customElements !== 'undefined') count++;
                        if (!!nav.vibrate) count++;
                        if (!!nav.getBattery) count++;
                        if (!!nav.connection) count++;
                        return count;
                    })(),
                    description: 'Total count of available APIs out of 36 checked'
                }
            };
        } catch (error) {
            _log.warn('⚠️ Navigator analysis failed:', error.message);
            return {
                error: createErrorMetric(error, 'Navigator analysis failed')
            };
        }
    }

    /**
     * Analyze Display properties
     * @private
     */
    _analyzeDisplay() {
        const screen = window.screen;
        return {
            colorDepth: {
                value: screen.colorDepth,
                description: 'Screen color depth in bits'
            },
            width: {
                value: screen.width,
                description: 'Screen width in pixels'
            },
            height: {
                value: screen.height,
                description: 'Screen height in pixels'
            },
            availWidth: {
                value: screen.availWidth,
                description: 'Available screen width'
            },
            availHeight: {
                value: screen.availHeight,
                description: 'Available screen height'
            },
            pixelDepth: {
                value: screen.pixelDepth,
                description: 'Screen pixel depth'
            },
            orientation: {
                value: screen.orientation ? screen.orientation.type : 'Not available',
                description: 'Screen orientation type'
            }
        };
    }

    /**
     * Analyze Window properties
     * @private
     */
    _analyzeWindow() {
        return {
            innerWidth: {
                value: window.innerWidth,
                description: 'Viewport inner width'
            },
            innerHeight: {
                value: window.innerHeight,
                description: 'Viewport inner height'
            },
            outerWidth: {
                value: window.outerWidth,
                description: 'Browser window outer width',
                risk: window.outerWidth === 0 ? 'HIGH' : 'LOW'
            },
            outerHeight: {
                value: window.outerHeight,
                description: 'Browser window outer height',
                risk: window.outerHeight === 0 ? 'HIGH' : 'LOW'
            },
            screenTop: {
                value: window.screenTop,
                description: 'Window position from screen top'
            },
            screenLeft: {
                value: window.screenLeft,
                description: 'Window position from screen left'
            },
            scrollX: {
                value: typeof window.scrollX === 'number' ? window.scrollX : null,
                description: 'Horizontal scroll offset (px)'
            },
            scrollY: {
                value: typeof window.scrollY === 'number' ? window.scrollY : null,
                description: 'Vertical scroll offset (px)'
            },
            devicePixelRatio: {
                value: window.devicePixelRatio,
                description: 'Device pixel ratio'
            },
            closed: {
                value: window.closed,
                description: 'Window closed status'
            },
            opener: {
                value: window.opener !== null,
                description: 'Window opener reference exists'
            },
            self: {
                value: typeof window.self !== 'undefined',
                description: 'Window self reference availability'
            },
            historyLength: {
                value: window.history.length,
                description: 'Number of entries in session history',
                risk: window.history.length === 1 ? 'MEDIUM' : 'LOW'
            },
            mozPaintCount: {
                value: window.mozPaintCount || 'Not available',
                description: 'Firefox paint count'
            },
            mozInnerScreenX: {
                value: window.mozInnerScreenX || 'Not available',
                description: 'Firefox inner screen X position'
            },
            hasSidebar: {
                value: typeof window.sidebar !== 'undefined',
                description: 'Firefox sidebar API availability'
            },
            hasScrollTo: {
                value: typeof window.scrollTo === 'function',
                description: 'scrollTo function availability'
            },
            hasChromeApp: {
                value: !!(window.chrome && window.chrome.app),
                description: 'Chrome app API availability'
            },
            hasChromeCsi: {
                value: !!(window.chrome && window.chrome.csi),
                description: 'Chrome CSI API availability'
            },
            hasInstallTrigger: {
                value: typeof window.InstallTrigger !== 'undefined',
                description: 'Firefox InstallTrigger availability'
            },
            hasExternal: {
                value: typeof window.external !== 'undefined',
                description: 'Window external object availability'
            },
            hasCallPhantom: {
                value: typeof window.callPhantom !== 'undefined',
                description: 'PhantomJS callPhantom availability'
            }
        };
    }

    /**
     * Analyze Automation Detection properties
     * @private
     */
    _analyzeAutomation() {
        const risks = [];
        
        // Selenium detection
        const seleniumIndicators = {
            seleniumKey: window.seleniumKey !== undefined,
            seleniumAlert: window.seleniumAlert !== undefined,
            webdriverAttribute: document.documentElement.getAttribute('webdriver') !== null,
            callPhantom: window.callPhantom !== undefined,
            _phantom: window._phantom !== undefined,
            __phantomas: window.__phantomas !== undefined,
            domAutomation: window.domAutomation !== undefined,
            domAutomationController: window.domAutomationController !== undefined,
            _Selenium_IDE_Recorder: window._Selenium_IDE_Recorder !== undefined,
            __webdriver_script_fn: window.__webdriver_script_fn !== undefined,
            _WEBDRIVER_ELEM_CACHE: window._WEBDRIVER_ELEM_CACHE !== undefined,
            Buffer: typeof window.Buffer !== 'undefined',
            emit: typeof window.emit !== 'undefined',
            spawn: typeof window.spawn !== 'undefined'
        };

        Object.entries(seleniumIndicators).forEach(([key, detected]) => {
            if (detected) risks.push(key);
        });

        return {
            webdriverFlag: {
                value: window.navigator.webdriver,
                description: 'Navigator webdriver property',
                risk: window.navigator.webdriver === true ? 'HIGH' : 'LOW'
            },
            webdriverAttribute: {
                value: document.documentElement.getAttribute('webdriver') !== null,
                description: 'Document element webdriver attribute',
                risk: document.documentElement.getAttribute('webdriver') !== null ? 'HIGH' : 'LOW'
            },
            seleniumIndicators: {
                value: Object.keys(seleniumIndicators).filter(key => seleniumIndicators[key]).length,
                description: 'Selenium automation indicators detected',
                risk: risks.length > 0 ? 'HIGH' : 'LOW',
                details: risks
            },
            phantomjsCheck: {
                value: window.callPhantom !== undefined || window._phantom !== undefined,
                description: 'PhantomJS automation indicators',
                risk: (window.callPhantom !== undefined || window._phantom !== undefined) ? 'HIGH' : 'LOW'
            },
            cdpIndicators: {
                value: window.chrome?.runtime?.id !== undefined,
                description: 'Chrome extension runtime detected',
                risk: window.chrome?.runtime?.id !== undefined ? 'MEDIUM' : 'LOW'
            },
            automationLibraries: {
                value: window.__playwright !== undefined || window.__puppeteer !== undefined,
                description: 'Playwright/Puppeteer automation libraries detected',
                risk: (window.__playwright !== undefined || window.__puppeteer !== undefined) ? 'HIGH' : 'LOW'
            },
            automationArtifacts: {
                value: risks.length,
                description: 'Total automation artifacts detected',
                risk: risks.length > 2 ? 'HIGH' : risks.length > 0 ? 'MEDIUM' : 'LOW'
            }
        };
    }

    /**
     * Analyze JavaScript Environment
     * @private
     */
    _analyzeJSEnvironment() {
        return {
            setTimeout: {
                value: typeof window.setTimeout !== 'undefined',
                description: 'setTimeout function availability'
            },
            setInterval: {
                value: typeof window.setInterval !== 'undefined',
                description: 'setInterval function availability'
            },
            functionBind: {
                value: typeof Function.prototype.bind !== 'undefined',
                description: 'Function.prototype.bind availability'
            },
            functionToString: {
                value: typeof Function.prototype.toString !== 'undefined',
                description: 'Function.prototype.toString availability'
            },
            mathAbs: {
                value: Math.abs(-3.186),
                description: 'Math.abs function test result'
            },
            arrayBuffer: {
                value: typeof window.ArrayBuffer !== 'undefined',
                description: 'ArrayBuffer API availability'
            },
            int8Array: {
                value: typeof window.Int8Array !== 'undefined',
                description: 'Int8Array API availability'
            },
            int16Array: {
                value: typeof window.Int16Array !== 'undefined',
                description: 'Int16Array API availability'
            },
            int32Array: {
                value: typeof window.Int32Array !== 'undefined',
                description: 'Int32Array API availability'
            },
            promise: {
                value: typeof window.Promise !== 'undefined',
                description: 'Promise API availability'
            },
            boolean: {
                value: typeof window.Boolean !== 'undefined',
                description: 'Boolean constructor availability'
            },
            map: {
                value: typeof window.Map !== 'undefined',
                description: 'Map API availability'
            },
            uriError: {
                value: typeof window.URIError !== 'undefined',
                description: 'URIError availability'
            },
            intlAPI: {
                value: Object.keys(Intl).length,
                description: 'Internationalization API objects available'
            },
            intlLocale: {
                value: Intl.DateTimeFormat().resolvedOptions().locale,
                description: 'Browser default locale'
            },
            v8BreakIterator: {
                value: typeof Intl.v8BreakIterator !== 'undefined',
                description: 'V8 engine-specific break iterator'
            },
            errorStackTrace: {
                value: (new Error()).stack !== undefined,
                description: 'Error stack trace support'
            },
            performanceNow: {
                value: typeof performance.now === 'function',
                description: 'High resolution time API'
            },
            asyncFunction: {
                value: (async function(){}).constructor.name === 'AsyncFunction',
                description: 'Async function constructor available'
            },
            generatorFunction: {
                value: (function*(){}).constructor.name === 'GeneratorFunction',
                description: 'Generator function support'
            },
            memoryAPI: {
                value: 'memory' in performance,
                description: 'Performance memory API availability'
            },
            webAssembly: {
                value: typeof WebAssembly !== 'undefined',
                description: 'WebAssembly support'
            },
            bigInt: {
                value: typeof BigInt !== 'undefined',
                description: 'BigInt primitive support'
            },
            weakMap: {
                value: typeof WeakMap !== 'undefined',
                description: 'WeakMap collection support'
            },
            weakSet: {
                value: typeof WeakSet !== 'undefined',
                description: 'WeakSet collection support'
            },
            proxy: {
                value: typeof Proxy !== 'undefined',
                description: 'Proxy object support'
            },
            reflect: {
                value: typeof Reflect !== 'undefined',
                description: 'Reflect API support'
            },
            symbol: {
                value: typeof Symbol !== 'undefined',
                description: 'Symbol primitive support'
            },
            mapIterator: {
                value: typeof Map.prototype[Symbol.iterator] === 'function',
                description: 'Map iterator support'
            },
            xhrString: {
                value: typeof XMLHttpRequest !== 'undefined' ? XMLHttpRequest.toString().substring(0, 50) : 'Not available',
                description: 'XMLHttpRequest toString representation'
            },
            int8ArrayLen5: {
                value: (() => {
                    try {
                        const arr = new Int8Array(5);
                        return arr.length;
                    } catch (e) {
                        return 'Error';
                    }
                })(),
                description: 'Int8Array length 5 sanity check'
            },
            hasUint8ClampedArray: {
                value: typeof Uint8ClampedArray !== 'undefined',
                description: 'Uint8ClampedArray availability'
            },
            hasSharedArrayBuffer: {
                value: typeof SharedArrayBuffer !== 'undefined',
                description: 'SharedArrayBuffer availability'
            },
            hasAtomics: {
                value: typeof Atomics !== 'undefined',
                description: 'Atomics API availability'
            },
            hasDataView: {
                value: typeof DataView !== 'undefined',
                description: 'DataView availability'
            },
            hasEval: {
                value: typeof eval === 'function',
                description: 'eval function availability'
            },
            hasJsonStringify: {
                value: typeof JSON.stringify === 'function',
                description: 'JSON.stringify availability'
            },
            
            // === Math Fingerprint ===
            // Different JS engines (V8, SpiderMonkey, JavaScriptCore) produce
            // slightly different floating-point results for transcendental functions.
            // This creates a high-entropy fingerprint signal.
            // @see https://gitlab.torproject.org/legacy/trac/-/issues/13018
            mathFingerprint: {
                value: this._collectMathFingerprint(),
                description: 'Math function fingerprint (engine-specific floating point results)'
            },
            
            // === Architecture Detection ===
            // Detects 32-bit vs 64-bit architecture via NaN representation.
            // On x86/x86-64, when floating-point subtraction of infinities produces NaN,
            // the sign bit handling differs from ARM/other architectures.
            // @see https://codebrowser.bddppq.com/pytorch/pytorch/third_party/XNNPACK/src/init.c.html#79
            architecture: {
                value: this._detectArchitecture(),
                description: 'CPU architecture detection (NaN sign bit behavior)'
            }
        };
    }
    
    /**
     * Collect Math function fingerprint
     * Different JavaScript engines have subtle differences in floating-point
     * implementations of transcendental functions.
     * 
     * @private
     * @returns {Object} Math fingerprint values
     */
    _collectMathFingerprint() {
        const M = Math;
        
        // Fallback for missing functions (older browsers)
        const fallbackFn = () => 0;
        
        // Native operations
        const acos = M.acos || fallbackFn;
        const acosh = M.acosh || fallbackFn;
        const asin = M.asin || fallbackFn;
        const asinh = M.asinh || fallbackFn;
        const atanh = M.atanh || fallbackFn;
        const atan = M.atan || fallbackFn;
        const sin = M.sin || fallbackFn;
        const sinh = M.sinh || fallbackFn;
        const cos = M.cos || fallbackFn;
        const cosh = M.cosh || fallbackFn;
        const tan = M.tan || fallbackFn;
        const tanh = M.tanh || fallbackFn;
        const exp = M.exp || fallbackFn;
        const expm1 = M.expm1 || fallbackFn;
        const log1p = M.log1p || fallbackFn;
        
        // Polyfill versions (to detect if browser uses native vs polyfill)
        const powPI = (value) => M.pow(M.PI, value);
        const acoshPf = (value) => M.log(value + M.sqrt(value * value - 1));
        const asinhPf = (value) => M.log(value + M.sqrt(value * value + 1));
        const atanhPf = (value) => M.log((1 + value) / (1 - value)) / 2;
        const sinhPf = (value) => (M.exp(value) - 1 / M.exp(value)) / 2;
        const coshPf = (value) => (M.exp(value) + 1 / M.exp(value)) / 2;
        const expm1Pf = (value) => M.exp(value) - 1;
        const tanhPf = (value) => (M.exp(2 * value) - 1) / (M.exp(2 * value) + 1);
        const log1pPf = (value) => M.log(1 + value);
        
        try {
            // Empirical test values chosen to maximize cross-engine variance
            const fingerprint = {
                // Native function results
                acos: acos(0.123124234234234242),
                acosh: acosh(1e308),
                asin: asin(0.123124234234234242),
                asinh: asinh(1),
                atanh: atanh(0.5),
                atan: atan(0.5),
                sin: sin(-1e300),
                sinh: sinh(1),
                cos: cos(10.000000000123),
                cosh: cosh(1),
                tan: tan(-1e300),
                tanh: tanh(1),
                exp: exp(1),
                expm1: expm1(1),
                log1p: log1p(10),
                
                // Polyfill comparisons (native vs calculated)
                acoshPf: acoshPf(1e154), // Use smaller value to avoid Infinity
                asinhPf: asinhPf(1),
                atanhPf: atanhPf(0.5),
                sinhPf: sinhPf(1),
                coshPf: coshPf(1),
                expm1Pf: expm1Pf(1),
                tanhPf: tanhPf(1),
                log1pPf: log1pPf(10),
                powPI: powPI(-100)
            };
            
            // Generate a combined hash string for quick comparison
            const values = Object.values(fingerprint);
            const hashStr = values.map(v => 
                typeof v === 'number' ? v.toString() : String(v)
            ).join('|');
            
            return {
                values: fingerprint,
                hash: this._simpleHash(hashStr)
            };
        } catch (e) {
            return {
                error: e.message,
                values: null,
                hash: null
            };
        }
    }
    
    /**
     * Detect CPU architecture via NaN representation
     * 
     * On x86/x86-64 architectures, when floating-point operations with no NaN
     * arguments produce NaN output (like Infinity - Infinity), the output NaN
     * has its sign bit set differently than on ARM and other architectures.
     * 
     * @private
     * @returns {Object} Architecture detection result
     */
    _detectArchitecture() {
        try {
            const f = new Float32Array(1);
            const u8 = new Uint8Array(f.buffer);
            
            // Set to Infinity
            f[0] = Infinity;
            
            // Subtract Infinity from Infinity -> NaN (IEEE 754)
            f[0] = f[0] - f[0];
            
            // The high byte of the NaN representation differs by architecture:
            // - x86/x86-64: typically 255 (0xFF) - sign bit set
            // - ARM/others: typically 127 (0x7F) - sign bit clear
            const nanByte = u8[3];
            
            // Interpret the result
            let archType;
            if (nanByte === 255 || nanByte === 0xFF) {
                archType = 'x86/x86-64';
            } else if (nanByte === 127 || nanByte === 0x7F) {
                archType = 'arm/other';
            } else {
                archType = 'unknown';
            }
            
            return {
                nanSignByte: nanByte,
                archType: archType,
                float32Supported: true
            };
        } catch (e) {
            return {
                error: e.message,
                nanSignByte: null,
                archType: 'detection-failed',
                float32Supported: false
            };
        }
    }
    
    /**
     * Simple hash function for Math fingerprint
     * @private
     */
    _simpleHash(str) {
        let hash = 0;
        for (let i = 0; i < str.length; i++) {
            const char = str.charCodeAt(i);
            hash = ((hash << 5) - hash) + char;
            hash = hash & hash; // Convert to 32-bit integer
        }
        return hash.toString(16);
    }

    /**
     * Analyze Performance metrics
     * @private
     */
    _analyzePerformance() {
        const perf = window.performance;
        const memory = perf && perf.memory;
        const navigation = perf && perf.navigation;

        return {
            memoryLimit: {
                value: memory ? memory.jsHeapSizeLimit : 'Not available',
                description: 'JavaScript heap size limit'
            },
            usedMemory: {
                value: memory ? memory.usedJSHeapSize : 'Not available',
                description: 'Used JavaScript heap size'
            },
            totalMemory: {
                value: memory ? memory.totalJSHeapSize : 'Not available',
                description: 'Total JavaScript heap size'
            },
            redirectCount: {
                value: navigation ? navigation.redirectCount : 'Not available',
                description: 'Page redirect count'
            },
            navigationType: {
                value: navigation ? navigation.type : 'Not available',
                description: 'Navigation type'
            },
            timezoneOffset: {
                value: new Date().getTimezoneOffset(),
                description: 'Timezone offset in minutes'
            }
        };
    }

    /**
     * Analyze Web APIs
     * @private
     */
    _analyzeWebAPIs() {
        const nav = window.navigator;
        
        return {
            geolocation: {
                value: !!nav.geolocation,
                description: 'Geolocation API availability'
            },
            getUserMedia: {
                value: !!(nav.getUserMedia || nav.webkitGetUserMedia || nav.mozGetUserMedia || nav.msGetUserMedia),
                description: 'getUserMedia API availability'
            },
            sendBeacon: {
                value: !!nav.sendBeacon,
                description: 'sendBeacon API availability'
            },
            localStorage: {
                value: typeof window.localStorage !== 'undefined',
                description: 'localStorage API availability'
            },
            sessionStorage: {
                value: typeof window.sessionStorage !== 'undefined',
                description: 'sessionStorage API availability'
            },
            indexedDB: {
                value: typeof window.indexedDB !== 'undefined',
                description: 'IndexedDB API availability'
            },
            webDatabase: {
                value: typeof window.openDatabase !== 'undefined',
                description: 'Web SQL Database API availability'
            },
            webkitSpeechGrammar: {
                value: typeof window.webkitSpeechGrammar !== 'undefined',
                description: 'Speech Recognition API availability'
            },
            cacheStorage: {
                value: typeof window.CacheStorage !== 'undefined',
                description: 'Cache Storage API availability'
            },
            midiPort: {
                value: typeof window.MIDIPort !== 'undefined',
                description: 'MIDI API availability'
            },
            mimeTypeArray: {
                value: typeof window.MimeTypeArray !== 'undefined',
                description: 'MimeTypeArray availability'
            },
            pluginArray: {
                value: typeof window.PluginArray !== 'undefined',
                description: 'PluginArray availability'
            },
            hasRequestAnimationFrame: {
                value: typeof window.requestAnimationFrame === 'function',
                description: 'requestAnimationFrame availability'
            },
            hasWebkitRequestAnimationFrame: {
                value: typeof window.webkitRequestAnimationFrame === 'function',
                description: 'Webkit requestAnimationFrame availability'
            },
            hasMozRequestAnimationFrame: {
                value: typeof window.mozRequestAnimationFrame === 'function',
                description: 'Mozilla requestAnimationFrame availability'
            },
            hasORequestAnimationFrame: {
                value: typeof window.oRequestAnimationFrame === 'function',
                description: 'Opera requestAnimationFrame availability'
            },
            hasMsRequestAnimationFrame: {
                value: typeof window.msRequestAnimationFrame === 'function',
                description: 'Microsoft requestAnimationFrame availability'
            },
            hasPostMessage: {
                value: typeof window.postMessage === 'function',
                description: 'postMessage availability'
            },
            hasMessageChannel: {
                value: typeof window.MessageChannel !== 'undefined',
                description: 'MessageChannel availability'
            },
            hasAudioContext: {
                value: typeof window.AudioContext !== 'undefined' || typeof window.webkitAudioContext !== 'undefined',
                description: 'AudioContext availability'
            },
            hasSpeechSynthesis: {
                value: typeof window.speechSynthesis !== 'undefined',
                description: 'SpeechSynthesis availability'
            },
            hasCreateImageBitmap: {
                value: typeof window.createImageBitmap === 'function',
                description: 'createImageBitmap availability'
            },
            hasFetch: {
                value: typeof window.fetch === 'function',
                description: 'fetch API availability'
            },
            hasCryptoGetRandomValues: {
                value: !!(window.crypto && window.crypto.getRandomValues),
                description: 'crypto.getRandomValues availability'
            },
            hasNotification: {
                value: typeof window.Notification !== 'undefined',
                description: 'Notification API availability'
            },
            hasBroadcastChannel: {
                value: typeof window.BroadcastChannel !== 'undefined',
                description: 'BroadcastChannel API availability'
            },
            hasOffscreenCanvas: {
                value: typeof window.OffscreenCanvas !== 'undefined',
                description: 'OffscreenCanvas availability'
            },
            // Media Devices API
            hasMediaDevices: {
                value: !!(nav.mediaDevices),
                description: 'MediaDevices API availability'
            },
            hasEnumerateDevices: {
                value: !!(nav.mediaDevices && nav.mediaDevices.enumerateDevices),
                description: 'enumerateDevices API availability'
            },
            // Security & Context Properties
            isSecureContext: {
                value: window.isSecureContext,
                description: 'Secure context (HTTPS) status'
            },
            locationProtocol: {
                value: window.location.protocol,
                description: 'Current page protocol'
            },
            activeXObject: {
                value: typeof window.ActiveXObject !== 'undefined',
                description: 'ActiveXObject availability (IE legacy)',
                risk: typeof window.ActiveXObject !== 'undefined' ? 'MEDIUM' : 'LOW'
            },
            msCredentials: {
                value: typeof window.MSCredentials !== 'undefined',
                description: 'Microsoft Credentials API availability'
            },
            ontouchstart: {
                value: typeof window.ontouchstart !== 'undefined',
                description: 'Touch events support'
            },
            ondevicelight: {
                value: typeof window.ondevicelight !== 'undefined',
                description: 'Device light sensor API availability'
            },
            persistent: {
                value: typeof window.PERSISTENT !== 'undefined',
                description: 'Persistent storage constant availability'
            },
            temporary: {
                value: typeof window.TEMPORARY !== 'undefined',
                description: 'Temporary storage constant availability'
            }
        };
    }

    /**
     * Analyze Media Devices (async - enumerates available devices)
     * @private
     */
    async _analyzeMediaDevices() {
        const result = {
            available: {
                value: !!(navigator.mediaDevices && navigator.mediaDevices.enumerateDevices),
                description: 'MediaDevices.enumerateDevices API availability'
            }
        };

        if (!navigator.mediaDevices || !navigator.mediaDevices.enumerateDevices) {
            result.error = {
                value: 'API not available',
                description: 'MediaDevices API is not supported in this browser'
            };
            return result;
        }

        try {
            const devices = await navigator.mediaDevices.enumerateDevices();
            
            // Count devices by kind
            const deviceCounts = {
                audioinput: 0,
                audiooutput: 0,
                videoinput: 0
            };
            
            const deviceDetails = [];
            
            devices.forEach(device => {
                if (deviceCounts.hasOwnProperty(device.kind)) {
                    deviceCounts[device.kind]++;
                }
                
                // Collect device info (labels may be empty without permissions)
                deviceDetails.push({
                    kind: device.kind,
                    label: device.label || '[Permission required]',
                    deviceId: device.deviceId ? device.deviceId.substring(0, 16) + '...' : 'N/A',
                    groupId: device.groupId ? device.groupId.substring(0, 16) + '...' : 'N/A'
                });
            });

            result.totalDevices = {
                value: devices.length,
                description: 'Total number of media devices detected'
            };

            result.audioInputCount = {
                value: deviceCounts.audioinput,
                description: 'Number of audio input devices (microphones)',
                risk: deviceCounts.audioinput === 0 ? 'MEDIUM' : 'LOW'
            };

            result.audioOutputCount = {
                value: deviceCounts.audiooutput,
                description: 'Number of audio output devices (speakers/headphones)',
                risk: deviceCounts.audiooutput === 0 ? 'MEDIUM' : 'LOW'
            };

            result.videoInputCount = {
                value: deviceCounts.videoinput,
                description: 'Number of video input devices (cameras)',
                risk: deviceCounts.videoinput === 0 ? 'LOW' : 'LOW'
            };

            // Check for suspicious patterns
            const hasNoDevices = devices.length === 0;
            const hasNoAudioDevices = deviceCounts.audioinput === 0 && deviceCounts.audiooutput === 0;
            
            // Check for fake device labels - strong indicator of AI agents like browserUse
            const fakeDevicePatterns = /^fake\s|fake-|fake_|simulated|virtual\s*(?:mic|camera|speaker)|dummy/i;
            const fakeDevices = devices.filter(d => 
                d.label && fakeDevicePatterns.test(d.label)
            );
            const hasFakeDevices = fakeDevices.length > 0;
            
            // Store fake device detection results
            result.fakeDevicesDetected = {
                value: hasFakeDevices,
                description: 'Fake/simulated media devices detected - strong indicator of AI automation agents',
                risk: hasFakeDevices ? 'HIGH' : 'LOW',
                details: hasFakeDevices 
                    ? `Detected ${fakeDevices.length} fake device(s): ${fakeDevices.map(d => d.label).join(', ')}`
                    : 'No fake devices detected'
            };
            
            result.fakeDeviceCount = {
                value: fakeDevices.length,
                description: 'Number of devices with fake/simulated labels',
                risk: fakeDevices.length > 0 ? 'HIGH' : 'LOW'
            };
            
            // List fake device labels if found
            if (hasFakeDevices) {
                result.fakeDeviceLabels = {
                    value: fakeDevices.map(d => d.label).join(', '),
                    description: 'Labels of detected fake media devices',
                    risk: 'HIGH'
                };
            }
            
            result.suspiciousPattern = {
                value: hasNoDevices || hasNoAudioDevices || hasFakeDevices,
                description: 'Suspicious media device pattern detected (may indicate headless/VM/AI agent)',
                risk: hasFakeDevices ? 'HIGH' : (hasNoDevices ? 'HIGH' : (hasNoAudioDevices ? 'MEDIUM' : 'LOW')),
                details: hasFakeDevices
                    ? `Fake devices detected: ${fakeDevices.map(d => d.label).join(', ')} - common in AI automation agents`
                    : (hasNoDevices 
                        ? 'No media devices detected - common in headless browsers'
                        : (hasNoAudioDevices ? 'No audio devices detected - unusual for real user environments' : 'Normal device configuration'))
            };

            // Check if labels are available (indicates permissions granted)
            const hasLabels = devices.some(d => d.label && d.label.length > 0);
            result.labelsAvailable = {
                value: hasLabels,
                description: 'Device labels available (indicates media permissions granted)'
            };

            // Store device details as JSON string for proper display
            result.deviceDetails = {
                value: JSON.stringify(deviceDetails, null, 2),
                description: 'Detailed list of enumerated media devices (JSON)'
            };

            // Also store individual device entries for easier reading
            deviceDetails.forEach((device, index) => {
                result[`device_${index}`] = {
                    value: `${device.kind}: ${device.label} (ID: ${device.deviceId})`,
                    description: `Media device #${index + 1}`
                };
            });

            // Device fingerprint hash (unique identifier based on device configuration)
            // Use the JSON string for consistent hashing
            const deviceString = JSON.stringify(devices.map(d => ({
                kind: d.kind,
                deviceId: d.deviceId,
                groupId: d.groupId
            })).sort((a, b) => a.deviceId.localeCompare(b.deviceId)));
            
            const deviceHash = this._generateDeviceHash(deviceString);
            result.deviceHash = {
                value: deviceHash,
                description: 'Hash of media device configuration (fingerprinting value)'
            };

        } catch (error) {
            result.error = {
                value: error.message,
                description: 'Error enumerating media devices',
                risk: 'MEDIUM'
            };
        }

        return result;
    }

    /**
     * Generate a hash from media devices string for fingerprinting
     * @private
     */
    _generateDeviceHash(deviceString) {
        try {
            // Simple hash function
            let hash = 0;
            for (let i = 0; i < deviceString.length; i++) {
                const char = deviceString.charCodeAt(i);
                hash = ((hash << 5) - hash) + char;
                hash = hash & hash; // Convert to 32bit integer
            }
            return hash.toString(16);
        } catch (e) {
            return 'error';
        }
    }

    /**
     * Analyze Document properties
     * @private
     */
    _analyzeDocument() {
        const doc = document;
        
        return {
            hasFocus: {
                value: doc.hasFocus(),
                description: 'Document focus status'
            },
            webkitHidden: {
                value: doc.webkitHidden,
                description: 'Webkit visibility state'
            },
            documentMode: {
                value: doc.documentMode || 'Not available',
                description: 'IE document mode'
            },
            elementFromPoint: {
                value: (() => {
                    try {
                        const element = doc.elementFromPoint(0, 0);
                        return element ? element.childNodes.length : 'Not available';
                    } catch (e) {
                        return 'Error';
                    }
                })(),
                description: 'Element at point (0,0) child count'
            },
            elementFromPointTag: {
                value: (() => {
                    try {
                        const element = doc.elementFromPoint(0, 0);
                        if (!element) return 'Not available';
                        const tagName = element.tagName ? element.tagName.toLowerCase() : 'unknown';
                        const id = element.id ? `#${element.id}` : '';
                        const classes = element.className && typeof element.className === 'string' 
                            ? `.${element.className.trim().split(/\s+/).join('.')}` 
                            : '';
                        return `${tagName}${id}${classes}`.replace(/\.$/, '');
                    } catch (e) {
                        return 'Error';
                    }
                })(),
                description: 'Element at point (0,0) tag identifier (tagName#id.classes) for research'
            },
            textNode: {
                value: doc.TEXT_NODE,
                description: 'Document TEXT_NODE constant'
            },
            commentNode: {
                value: doc.COMMENT_NODE,
                description: 'Document COMMENT_NODE constant'
            },
            attributeNode: {
                value: doc.ATTRIBUTE_NODE,
                description: 'Document ATTRIBUTE_NODE constant'
            },
            processingInstructionNode: {
                value: doc.PROCESSING_INSTRUCTION_NODE,
                description: 'Document PROCESSING_INSTRUCTION_NODE constant'
            },
            documentTypeNode: {
                value: doc.DOCUMENT_TYPE_NODE,
                description: 'Document DOCUMENT_TYPE_NODE constant'
            },
            isConnected: {
                value: typeof doc.isConnected !== 'undefined',
                description: 'Document isConnected property availability'
            },
            hasLookupNamespaceURI: {
                value: typeof doc.lookupNamespaceURI === 'function',
                description: 'lookupNamespaceURI function availability'
            },
            hasCreateDocumentFragment: {
                value: typeof doc.createDocumentFragment === 'function',
                description: 'createDocumentFragment availability'
            },
            hasQuerySelectorAll: {
                value: typeof doc.querySelectorAll === 'function',
                description: 'querySelectorAll availability'
            },
            hasCreateTreeWalker: {
                value: typeof doc.createTreeWalker === 'function',
                description: 'createTreeWalker availability'
            },
            hasCreateRange: {
                value: typeof doc.createRange === 'function',
                description: 'createRange availability'
            }
        };
    }

    /**
     * Analyze API Override Detection
     * @private
     */
    _analyzeAPIOverrides() {
        const result = {};

        // Check permissions API
        try {
            if (navigator.permissions && navigator.permissions.query) {
                const queryString = navigator.permissions.query.toString();
                const isNative = isNativeFunction(queryString, 'query');
                result.permissionsQuery = {
                    value: isNative ? '[Native Code]' : queryString,
                    description: 'Permissions API query function signature',
                    risk: isNative ? 'LOW' : 'HIGH'
                };
            } else {
                result.permissionsQuery = {
                    value: 'Not available',
                    description: 'Permissions API query function signature',
                    risk: 'LOW'
                };
            }
        } catch (error) {
            result.permissionsQuery = {
                value: `Error: ${error.message}`,
                description: 'Permissions API query function signature',
                risk: 'MEDIUM'
            };
        }

        // Check Date.now
        try {
            const dateNowString = Date.now.toString();
            const isNative = dateNowString.includes('[native code]');
            result.dateNow = {
                value: isNative ? '[Native Code]' : dateNowString,
                description: 'Date.now function signature',
                risk: isNative ? 'LOW' : 'HIGH'
            };
        } catch (error) {
            result.dateNow = {
                value: `Error: ${error.message}`,
                description: 'Date.now function signature',
                risk: 'MEDIUM'
            };
        }

        // Check Math.random
        try {
            const mathRandomString = Math.random.toString();
            const isNative = mathRandomString.includes('[native code]');
            result.mathRandom = {
                value: isNative ? '[Native Code]' : mathRandomString,
                description: 'Math.random function signature',
                risk: isNative ? 'LOW' : 'HIGH'
            };
        } catch (error) {
            result.mathRandom = {
                value: `Error: ${error.message}`,
                description: 'Math.random function signature',
                risk: 'MEDIUM'
            };
        }

        // Check performance.now
        try {
            if (performance && performance.now) {
                const perfNowString = performance.now.toString();
                const isNative = perfNowString.includes('[native code]');
                result.performanceNow = {
                    value: isNative ? '[Native Code]' : perfNowString,
                    description: 'Performance.now function signature',
                    risk: isNative ? 'LOW' : 'HIGH'
                };
            } else {
                result.performanceNow = {
                    value: 'Not available',
                    description: 'Performance.now function signature',
                    risk: 'LOW'
                };
            }
        } catch (error) {
            result.performanceNow = {
                value: `Error: ${error.message}`,
                description: 'Performance.now function signature',
                risk: 'MEDIUM'
            };
        }

        // Check JSON.stringify
        try {
            const jsonStringifyString = JSON.stringify.toString();
            const isNative = jsonStringifyString.includes('[native code]');
            result.jsonStringify = {
                value: isNative ? '[Native Code]' : jsonStringifyString,
                description: 'JSON.stringify function signature',
                risk: isNative ? 'LOW' : 'HIGH'
            };
        } catch (error) {
            result.jsonStringify = {
                value: `Error: ${error.message}`,
                description: 'JSON.stringify function signature',
                risk: 'MEDIUM'
            };
        }

        // Check Object.defineProperty
        try {
            const objectDefinePropertyString = Object.defineProperty.toString();
            const isNative = objectDefinePropertyString.includes('[native code]');
            result.objectDefineProperty = {
                value: isNative ? '[Native Code]' : objectDefinePropertyString,
                description: 'Object.defineProperty function signature',
                risk: isNative ? 'LOW' : 'HIGH'
            };
        } catch (error) {
            result.objectDefineProperty = {
                value: `Error: ${error.message}`,
                description: 'Object.defineProperty function signature',
                risk: 'MEDIUM'
            };
        }

        // Check setTimeout
        try {
            const setTimeoutString = setTimeout.toString();
            const isNative = setTimeoutString.includes('[native code]');
            result.setTimeout = {
                value: isNative ? '[Native Code]' : setTimeoutString,
                description: 'setTimeout function signature',
                risk: isNative ? 'LOW' : 'HIGH'
            };
        } catch (error) {
            result.setTimeout = {
                value: `Error: ${error.message}`,
                description: 'setTimeout function signature',
                risk: 'MEDIUM'
            };
        }

        // Check setInterval
        try {
            const setIntervalString = setInterval.toString();
            const isNative = setIntervalString.includes('[native code]');
            result.setInterval = {
                value: isNative ? '[Native Code]' : setIntervalString,
                description: 'setInterval function signature',
                risk: isNative ? 'LOW' : 'HIGH'
            };
        } catch (error) {
            result.setInterval = {
                value: `Error: ${error.message}`,
                description: 'setInterval function signature',
                risk: 'MEDIUM'
            };
        }

        // Check _log.log (commonly overridden by AI agents like ChatGPT Browser)
        try {
            const consoleLogString = console.log.toString();
            const isNative = consoleLogString.includes('[native code]');
            result.consoleLog = {
                value: isNative ? '[Native Code]' : consoleLogString,
                description: 'console.log function signature - commonly patched by AI browser agents',
                risk: isNative ? 'LOW' : 'HIGH'
            };
        } catch (error) {
            result.consoleLog = {
                value: `Error: ${error.message}`,
                description: 'console.log function signature',
                risk: 'MEDIUM'
            };
        }

        // Check Element.prototype.scrollTop getter (patched by some automation tools)
        try {
            const scrollTopDescriptor = Object.getOwnPropertyDescriptor(Element.prototype, 'scrollTop');
            if (scrollTopDescriptor && scrollTopDescriptor.get) {
                const scrollTopGetterString = scrollTopDescriptor.get.toString();
                const isNative = scrollTopGetterString.includes('[native code]');
                result.elementScrollTop = {
                    value: isNative ? '[Native Code]' : scrollTopGetterString,
                    description: 'Element.prototype.scrollTop getter - patched by scroll automation tools',
                    risk: isNative ? 'LOW' : 'HIGH'
                };
            } else {
                result.elementScrollTop = {
                    value: 'No getter defined',
                    description: 'Element.prototype.scrollTop getter',
                    risk: 'LOW'
                };
            }
        } catch (error) {
            result.elementScrollTop = {
                value: `Error: ${error.message}`,
                description: 'Element.prototype.scrollTop getter',
                risk: 'MEDIUM'
            };
        }

        return result;
    }

    /**
     * Get comprehensive analysis results
     */
    getAnalysisResults() {
        // Combine suspicious indicators from both detectors
        const combinedSuspiciousIndicators = [...this.suspiciousIndicators];
        
        // Calculate combined summary
        const originalSummary = this.suspiciousIndicatorDetector.getSummary();
        const integritySum = this.functionIntegrityDetector?.getSummary() || { totalIndicators: 0, riskCounts: { HIGH: 0, MEDIUM: 0, LOW: 0 }, suspicionScore: 0, hasSuspiciousActivity: false, reasoning: '' };
        
        // Get known agents summary
        const knownAgentsSummary = this.knownAgentsResults?.summary || {
            detectedAgents: [],
            totalDetected: 0,
            hasAnyAgent: false
        };
        
        // Merge the summaries
        const combinedSummary = {
            totalIndicators: originalSummary.totalIndicators + integritySum.totalIndicators,
            totalDetectedIndicators: originalSummary.totalDetectedIndicators + integritySum.totalIndicators,
            riskCounts: {
                HIGH: originalSummary.riskCounts.HIGH + integritySum.riskCounts.HIGH + (knownAgentsSummary.totalDetected || 0),
                MEDIUM: originalSummary.riskCounts.MEDIUM + integritySum.riskCounts.MEDIUM,
                LOW: originalSummary.riskCounts.LOW + integritySum.riskCounts.LOW
            },
            hasSuspiciousActivity: originalSummary.hasSuspiciousActivity || integritySum.hasSuspiciousActivity || knownAgentsSummary.hasAnyAgent,
            suspicionScore: Math.min((originalSummary.suspicionScore + integritySum.suspicionScore) / 2, 1.0),
            reasoning: integritySum.totalIndicators > 0 
                ? `${originalSummary.reasoning}. Function Integrity: ${integritySum.reasoning}`
                : originalSummary.reasoning
        };

        return {
            timestamp: this.timestamp,
            analysisComplete: this.analysisComplete,
            metrics: this.metrics,
            // Raw detector results for detailed drill-down views
            rawResults: {
                fonts: this.fontsDetector?.result || null,
                knownAgents: this.knownAgentsResults || null,
                // WebRTC raw result including full SDP offering string
                webRTC: this.webRTCLeakDetector?.getResult() || null,
                // Function integrity raw results including overridden functions and error stack
                functionIntegrity: this.functionIntegrityDetector?.results?.functionIntegrity || null,
            },
            suspiciousIndicators: combinedSuspiciousIndicators, // Combined indicators
            suspiciousAnalysis: this.suspiciousAnalysis, // Full analysis with reasoning
            suspiciousSummary: combinedSummary, // Combined summary
            functionIntegritySummary: integritySum, // Separate function integrity summary
            // Known agents detection data
            knownAgentsDetection: {
                results: this.knownAgentsResults,
                history: this.knownAgentsDetectionHistory,
                isPeriodicRunning: !!this._knownAgentsIntervalId,
                intervalMs: this.options.agentDetectionInterval
            },
            summary: this._generateSummary()
        };
    }

    /**
     * Get suspicious indicators (updated method)
     */
    getSuspiciousIndicators() {
        return {
            indicators: this.suspiciousIndicators, // Filtered
            allIndicators: this.suspiciousIndicatorDetector.getIndicators(), // All detected
            analysis: this.suspiciousAnalysis,
            summary: this.suspiciousIndicatorDetector.getSummary()
        };
    }

    /**
     * Generate analysis summary
     * @private
     */
    _generateSummary() {
        if (!this.analysisComplete) {
            return { status: 'Analysis not complete' };
        }

        const highRiskCount = this._countRiskLevel('HIGH');
        const mediumRiskCount = this._countRiskLevel('MEDIUM');
        const totalMetrics = this._countTotalMetrics();

        return {
            totalMetrics,
            highRiskIndicators: highRiskCount,
            mediumRiskIndicators: mediumRiskCount,
            riskLevel: highRiskCount > 0 ? 'HIGH' : mediumRiskCount > 0 ? 'MEDIUM' : 'LOW',
            automationLikelihood: this._calculateAutomationLikelihood()
        };
    }

    /**
     * Count metrics by risk level
     * @private
     */
    _countRiskLevel(level) {
        let count = 0;
        for (const category in this.metrics) {
            for (const metric in this.metrics[category]) {
                if (this.metrics[category][metric].risk === level) {
                    count++;
                }
            }
        }
        return count;
    }

    /**
     * Count total metrics
     * @private
     */
    _countTotalMetrics() {
        let count = 0;
        for (const category in this.metrics) {
            count += Object.keys(this.metrics[category]).length;
        }
        return count;
    }

    /**
     * Calculate automation likelihood
     * @private
     */
    _calculateAutomationLikelihood() {
        const automation = this.metrics.automation;
        if (!automation) return 'Unknown';

        const indicators = [
            automation.webdriverFlag?.value === true,
            automation.seleniumIndicators?.value > 0,
            automation.phantomjsCheck?.value === true,
            this.metrics.window?.outerHeight?.value === 0,
            this.metrics.window?.outerWidth?.value === 0,
            this.metrics.navigator?.pluginsLength?.value === 0
        ];

        const positiveCount = indicators.filter(Boolean).length;
        
        if (positiveCount >= 3) return 'Very High';
        if (positiveCount >= 2) return 'High';
        if (positiveCount >= 1) return 'Medium';
        return 'Low';
    }

    /**
     * Analyze behavioral indicators from stored data
     * @private
     */
    _analyzeBehavioralIndicators() {
        try {
            // Initialize or get existing behavioral storage
            const behavioralStorage = window.BehavioralStorage || new BehavioralStorageManager();
            
            // Get current behavioral indicators
            const indicators = behavioralStorage.getBehavioralIndicators();
            const summary = behavioralStorage.getDetectionSummary();
            const sessionData = behavioralStorage.getSessionData();
            
            _log.log('📊 Behavioral indicators loaded:', indicators);
            _log.log('📈 Detection summary:', summary);

            // Transform indicators into fingerprint format
            const behavioralMetrics = {
                summary: {
                    value: summary.summary,
                    description: 'Overall behavioral analysis summary'
                },
                riskLevel: {
                    value: summary.riskLevel,
                    description: 'Risk assessment based on detected behavioral patterns'
                },
                detectedCount: {
                    value: summary.detectedCount,
                    description: 'Number of behavioral indicators detected'
                },
                totalEvents: {
                    value: summary.totalEvents,
                    description: 'Total behavioral events analyzed'
                },
                maxConfidence: {
                    value: Math.round(summary.maxConfidence * 100) / 100,
                    description: 'Highest confidence score among all indicators'
                },
                sessionDuration: {
                    value: sessionData.startTime ? Math.round((Date.now() - sessionData.startTime) / 1000) : 0,
                    description: 'Session duration in seconds'
                }
            };

            // Add individual indicator details
            Object.keys(indicators).forEach(key => {
                const indicator = indicators[key];
                behavioralMetrics[key] = {
                    value: indicator.detected,
                    description: indicator.description,
                    count: indicator.count,
                    confidence: Math.round(indicator.confidence * 100) / 100,
                    threshold: indicator.threshold,
                    details: indicator.details.slice(-3) // Last 3 details
                };
            });

            return behavioralMetrics;
            
        } catch (error) {
            _log.warn('⚠️ Error analyzing behavioral indicators:', error);
            return {
                error: {
                    value: true,
                    description: 'Failed to load behavioral indicators: ' + error.message
                }
            };
        }
    }
}

// Export for use in other modules
export { 
    BrowserFingerprintAnalyzer, 
    SuspiciousIndicatorDetector, 
    FunctionIntegrityDetector, 
    ContextAnalyzer, 
    // New modular detectors
    NetworkCapabilitiesDetector,
    BatteryStorageDetector,
    AudioFingerprintDetector,
    WebRTCLeakDetector,
    WebGLFingerprintDetector,
    SpeechSynthesisDetector,
    LanguageDetector,
    CssComputedStyleDetector,
    WorkerSignalsDetector,
    PermissionsDetector,
    CodecSupportDetector
};
