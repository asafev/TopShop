/**
 * Stack Trace Fingerprint Detector
 * 
 * Collects stack trace characteristics for emulated Chromium identification and clustering.
 * Based on PerimeterX stack trace analysis patterns (lines 7980-8100).
 * 
 * PURPOSE:
 * ========
 * Unlike automation "detection", this module focuses on FINGERPRINTING stack traces
 * to collect signals useful for:
 * 1. Clustering similar emulated environments
 * 2. Identifying Chromium emulation libraries (Puppeteer, Playwright, CDP-based tools)
 * 3. Detecting headless/sandboxed execution patterns
 * 4. Gathering Error.stack formatting characteristics
 * 
 * UNIQUE VALUE (no overlap with other detectors):
 * ===============================================
 * - FunctionIntegrityDetector: checks if functions are native/modified
 * - AgentDetector: looks for known agent signatures (Manus, BrowserUse, etc.)
 * - CDPSignals: monitors user interaction patterns (mouse, keyboard)
 * - THIS DETECTOR: analyzes Error.stack structure, DOM method call patterns,
 *   and window/navigator property enumeration for automation-related keys
 * 
 * @module detectors/stackTraceFingerprint
 */

/**
 * Configuration
 */
const STACK_TRACE_CONFIG = {
    // DOM methods to wrap for stack trace sampling
    monitoredMethods: [
        'querySelector',
        'getElementById',
        'querySelectorAll',
        'getElementsByTagName',
        'getElementsByClassName'
    ],
    
    // Max time to collect stack trace samples (ms)
    maxCollectionTime: 5000,
    
    // Max number of unique stack traces to store for analysis
    maxStackSamples: 20,
    
    // Flush interval for stack samples (ms)
    flushInterval: 500,
    
    // Stack trace analysis patterns
    patterns: {
        ANONYMOUS: { pattern: /[Aa]nonymous/g, weight: 2 },
        UNKNOWN: { pattern: /unknown/g, weight: 3 },
        EVAL: { pattern: /\beval\b/gi, weight: 4 },
        VM_CONTEXT: { pattern: /\bVM\d+:\d+\b/g, weight: 5 },
        PUPPETEER: { pattern: /puppeteer/gi, weight: 10 },
        PLAYWRIGHT: { pattern: /playwright/gi, weight: 10 },
        SELENIUM: { pattern: /selenium|webdriver/gi, weight: 10 },
        CDP_HANDLE: { pattern: /_handle|executionContext/gi, weight: 6 },
        DEVTOOLS: { pattern: /devtools|inspector/gi, weight: 4 },
        EXTENSION: { pattern: /chrome-extension:|moz-extension:/gi, weight: 3 },
        EMPTY_LINES: { pattern: /\n\n\n/g, weight: 2 },
        INJECTED: { pattern: /__puppeteer|__playwright|__selenium/gi, weight: 10 }
    },
    
    // Property patterns that indicate automation (for window/navigator scan)
    automationPropertyPatterns: [
        { pattern: /^_(?!_)/, name: 'underscore_prefix', weight: 1 },
        { pattern: /webdriver/i, name: 'webdriver_related', weight: 5 },
        { pattern: /selenium/i, name: 'selenium_related', weight: 5 },
        { pattern: /phantom/i, name: 'phantom_related', weight: 5 },
        { pattern: /puppeteer/i, name: 'puppeteer_related', weight: 5 },
        { pattern: /playwright/i, name: 'playwright_related', weight: 5 },
        { pattern: /cdc_|__cdp/i, name: 'cdp_related', weight: 6 },
        { pattern: /domAutomation/i, name: 'dom_automation', weight: 6 },
        { pattern: /callPhantom|callSelenium/i, name: 'automation_call', weight: 6 },
        { pattern: /$cdc_|$chrome_/i, name: 'chrome_automation', weight: 5 }
    ]
};

/**
 * Stack Trace Fingerprint Detector
 */
class StackTraceFingerprintDetector {
    constructor(config = {}) {
        this.config = { ...STACK_TRACE_CONFIG, ...config };
        this.metrics = {};
        this.result = null;
        
        // Stack trace collection state
        this.isEnabled = false;
        this.isWrapped = false;
        this.stackSamples = [];
        this.stackHashes = new Set(); // Deduplicate identical stacks
        this.originalMethods = {};
        this.intervalId = null;
        this.timeoutId = null;
        
        // Fingerprint accumulator
        this.fingerprint = {
            stackCharacteristics: {},
            patternMatches: {},
            propertyScans: {},
            errorStackFormat: null,
            timing: {}
        };
    }

    /**
     * Analyze and return formatted metrics (main entry point)
     * @returns {Promise<Object>} Fingerprint metrics
     */
    async analyze() {
        const startedAt = performance.now();
        
        try {
            // Collect all fingerprint signals
            const result = await this.collect();
            this.result = result;
            this.metrics = this._formatMetrics(result);
        } catch (error) {
            this.metrics = {
                error: {
                    value: error.message,
                    description: 'Stack trace fingerprint detection error',
                    risk: 'N/A'
                }
            };
        }
        
        this.metrics._timing = {
            value: Math.round(performance.now() - startedAt),
            description: 'Detection duration (ms)',
            risk: 'N/A'
        };
        
        return this.metrics;
    }

    /**
     * Static collect method matching detector pattern
     */
    static async collect() {
        const detector = new StackTraceFingerprintDetector();
        return detector.collect();
    }

    /**
     * Collect all stack trace fingerprint signals
     * @returns {Promise<Object>} Raw fingerprint data
     */
    async collect() {
        const timing = {
            startedAt: Date.now(),
            phases: {}
        };

        const result = {
            // Error.stack format analysis
            errorStackFormat: this._analyzeErrorStackFormat(),
            
            // Stack trace line format characteristics
            stackLineFormat: this._analyzeStackLineFormat(),
            
            // Analyze Function.prototype.toString patterns
            functionToStringFormat: this._analyzeFunctionToStringFormat(),
            
            // Scan global objects for automation-related properties
            automationProperties: this._scanForAutomationProperties(),
            
            // Check for automation-specific DOM attributes
            domAttributes: this._scanDOMAttributes(),
            
            // Analyze caller/callee behavior (deprecated but revealing)
            callerAnalysis: this._analyzeCallerBehavior(),
            
            // Collect eval/Function constructor characteristics
            evalCharacteristics: this._analyzeEvalCharacteristics(),
            
            // Generate clustering hash from collected signals
            clusteringSignals: null,
            
            timing
        };
        
        // Generate clustering signals from collected data
        result.clusteringSignals = this._generateClusteringSignals(result);
        
        timing.finishedAt = Date.now();
        timing.durationMs = timing.finishedAt - timing.startedAt;
        
        return result;
    }

    /**
     * Analyze Error.stack format to fingerprint the JS engine/environment
     * This is very useful for clustering similar environments
     */
    _analyzeErrorStackFormat() {
        const analysis = {
            hasStack: false,
            format: 'unknown',
            lineCount: 0,
            hasAtSymbol: false,
            hasColumnNumbers: false,
            hasNativeCode: false,
            firstLineFormat: null,
            stackSample: null,
            anomalies: []
        };

        try {
            const error = new Error('Stack trace fingerprint');
            const stack = error.stack;
            
            if (!stack) {
                analysis.anomalies.push('no_stack_property');
                return analysis;
            }
            
            analysis.hasStack = true;
            analysis.stackSample = stack.substring(0, 500);
            
            const lines = stack.split('\n').filter(l => l.trim());
            analysis.lineCount = lines.length;
            
            // Detect stack format (V8/Chrome, SpiderMonkey/Firefox, JavaScriptCore/Safari)
            if (stack.includes(' at ')) {
                analysis.format = 'v8'; // Chrome, Node.js, Edge
                analysis.hasAtSymbol = true;
            } else if (stack.includes('@')) {
                analysis.format = 'spidermonkey'; // Firefox
                analysis.hasAtSymbol = true;
            } else {
                analysis.format = 'other';
            }
            
            // Check for column numbers (standard in modern browsers)
            analysis.hasColumnNumbers = /:\d+:\d+/.test(stack);
            
            // Check for native code markers
            analysis.hasNativeCode = /\[native code\]|\[native\]/.test(stack);
            
            // Analyze first meaningful line format
            const firstMeaningfulLine = lines.find(l => l.includes('at ') || l.includes('@'));
            if (firstMeaningfulLine) {
                analysis.firstLineFormat = this._classifyStackLine(firstMeaningfulLine);
            }
            
            // Look for anomalies that indicate emulation
            if (lines.length < 2) {
                analysis.anomalies.push('shallow_stack');
            }
            if (lines.some(l => /eval|Function|<anonymous>/.test(l) && !/test|spec/.test(l))) {
                analysis.anomalies.push('eval_context');
            }
            if (/VM\d+/.test(stack)) {
                analysis.anomalies.push('vm_context');
            }
            if (/puppeteer|playwright|selenium/i.test(stack)) {
                analysis.anomalies.push('automation_framework_in_stack');
            }
            
        } catch (e) {
            analysis.anomalies.push(`error: ${e.message}`);
        }
        
        return analysis;
    }

    /**
     * Classify a single stack line format
     */
    _classifyStackLine(line) {
        const formats = [];
        
        if (/at\s+\w+\s+\(/.test(line)) formats.push('named_function');
        if (/at\s+<anonymous>/.test(line)) formats.push('anonymous');
        if (/at\s+Object\./.test(line)) formats.push('object_method');
        if (/at\s+Array\./.test(line)) formats.push('array_method');
        if (/at\s+new\s+/.test(line)) formats.push('constructor');
        if (/eval\s+at/.test(line)) formats.push('eval');
        if (/chrome-extension:/.test(line)) formats.push('chrome_extension');
        if (/moz-extension:/.test(line)) formats.push('firefox_extension');
        if (/:\/\//.test(line)) formats.push('has_url');
        if (/native/.test(line)) formats.push('native');
        
        return formats.length > 0 ? formats.join(',') : 'unclassified';
    }

    /**
     * Analyze stack line format details for clustering
     */
    _analyzeStackLineFormat() {
        const analysis = {
            sampleLines: [],
            patterns: {}
        };

        try {
            // Create error with known call depth
            const getStack = () => {
                try {
                    throw new Error('Line format sample');
                } catch (e) {
                    return e.stack || '';
                }
            };
            
            const stack = getStack();
            const lines = stack.split('\n').slice(1, 6); // Skip error message, take up to 5 lines
            
            analysis.sampleLines = lines.map(l => ({
                raw: l.substring(0, 150),
                format: this._classifyStackLine(l)
            }));
            
            // Count pattern frequencies
            for (const line of lines) {
                for (const [name, { pattern }] of Object.entries(this.config.patterns)) {
                    const matches = (line.match(pattern) || []).length;
                    if (matches > 0) {
                        analysis.patterns[name] = (analysis.patterns[name] || 0) + matches;
                    }
                }
            }
            
        } catch (e) {
            analysis.error = e.message;
        }
        
        return analysis;
    }

    /**
     * Analyze Function.prototype.toString patterns
     * Different environments may have subtle differences
     */
    _analyzeFunctionToStringFormat() {
        const analysis = {
            nativeFunctionFormat: null,
            arrowFunctionFormat: null,
            asyncFunctionFormat: null,
            boundFunctionFormat: null,
            classFormat: null,
            toStringToString: null,
            anomalies: []
        };

        try {
            // Native function
            analysis.nativeFunctionFormat = Function.prototype.toString.call(Array.prototype.push);
            
            // Arrow function
            const arrow = () => {};
            analysis.arrowFunctionFormat = arrow.toString();
            
            // Async function
            const asyncFn = async () => {};
            analysis.asyncFunctionFormat = asyncFn.toString();
            
            // Bound function
            const bound = (function() {}).bind({});
            analysis.boundFunctionFormat = bound.toString();
            
            // Class
            class TestClass {}
            analysis.classFormat = TestClass.toString().substring(0, 100);
            
            // toString of toString (meta-check for tampering)
            analysis.toStringToString = Function.prototype.toString.toString();
            
            // Check for anomalies
            if (!/\[native code\]/.test(analysis.nativeFunctionFormat)) {
                analysis.anomalies.push('non_native_push');
            }
            if (!/function/.test(analysis.boundFunctionFormat) && !/native code/.test(analysis.boundFunctionFormat)) {
                analysis.anomalies.push('unusual_bound_format');
            }
            if (!/\[native code\]/.test(analysis.toStringToString)) {
                analysis.anomalies.push('toString_modified');
            }
            
        } catch (e) {
            analysis.anomalies.push(`error: ${e.message}`);
        }
        
        return analysis;
    }

    /**
     * Scan window, document, navigator for automation-related properties
     * This collects valuable clustering data, not just detection
     */
    _scanForAutomationProperties() {
        const results = {
            windowKeys: { found: [], count: 0 },
            documentKeys: { found: [], count: 0 },
            navigatorKeys: { found: [], count: 0 },
            automationControlled: null,
            totalSuspiciousCount: 0
        };

        const scanObject = (obj, objName) => {
            const found = [];
            if (!obj) return { found, count: 0 };
            
            try {
                for (const key in obj) {
                    try {
                        // Skip our own instrumentation and properties
                        if (key.startsWith('__browserFingerprint') || key.startsWith('__native')) continue;
                        if (key === '_fingerprintAnalyzer' || key === 'fingerprintAnalyzer') continue;
                        
                        // Skip navigator.webdriver - it's a standard property, not suspicious
                        // Only suspicious if the VALUE is true, which is checked elsewhere
                        if (objName === 'navigator' && key === 'webdriver') continue;
                        
                        for (const { pattern, name, weight } of this.config.automationPropertyPatterns) {
                            if (pattern.test(key)) {
                                // Additional check: skip if it's a standard property with false/null value
                                const val = obj[key];
                                if (val === false || val === null || val === undefined) continue;
                                
                                found.push({
                                    key,
                                    pattern: name,
                                    weight,
                                    type: typeof obj[key],
                                    valueHint: this._getSafeValueHint(obj, key)
                                });
                                break; // Only match first pattern per key
                            }
                        }
                    } catch (e) {
                        // Some properties throw on access
                    }
                }
            } catch (e) {
                // Object enumeration failed
            }
            
            return { found: found.slice(0, 20), count: found.length };
        };

        if (typeof window !== 'undefined') {
            results.windowKeys = scanObject(window, 'window');
        }
        if (typeof document !== 'undefined') {
            results.documentKeys = scanObject(document, 'document');
        }
        if (typeof navigator !== 'undefined') {
            results.navigatorKeys = scanObject(navigator, 'navigator');
        }

        // Check for automation controlled flag
        try {
            if (typeof window !== 'undefined' && window.document) {
                // Some automation sets this attribute
                results.automationControlled = document.documentElement.getAttribute('data-automation-controlled');
            }
        } catch (e) {
            results.automationControlled = 'error';
        }

        results.totalSuspiciousCount = 
            results.windowKeys.count + 
            results.documentKeys.count + 
            results.navigatorKeys.count;
        
        return results;
    }

    /**
     * Get a safe hint about a property value without exposing sensitive data
     */
    _getSafeValueHint(obj, key) {
        try {
            const val = obj[key];
            if (val === undefined) return 'undefined';
            if (val === null) return 'null';
            if (typeof val === 'boolean') return String(val);
            if (typeof val === 'number') return 'number';
            if (typeof val === 'string') return `string(${val.length})`;
            if (typeof val === 'function') return 'function';
            if (Array.isArray(val)) return `array(${val.length})`;
            if (typeof val === 'object') return 'object';
            return typeof val;
        } catch (e) {
            return 'inaccessible';
        }
    }

    /**
     * Scan DOM for automation-related attributes
     */
    _scanDOMAttributes() {
        const results = {
            htmlAttributes: [],
            bodyAttributes: [],
            metaTags: [],
            anomalies: []
        };

        if (typeof document === 'undefined') return results;

        try {
            // Check html element attributes
            if (document.documentElement && document.documentElement.attributes) {
                for (const attr of document.documentElement.attributes) {
                    if (/webdriver|automation|puppet|playwright|selenium|headless/i.test(attr.name) ||
                        /webdriver|automation|puppet|playwright|selenium|headless/i.test(attr.value)) {
                        results.htmlAttributes.push({
                            name: attr.name,
                            value: attr.value.substring(0, 100)
                        });
                    }
                }
            }
            
            // Check body attributes
            if (document.body && document.body.attributes) {
                for (const attr of document.body.attributes) {
                    if (/webdriver|automation|puppet|playwright|selenium|headless/i.test(attr.name) ||
                        /webdriver|automation|puppet|playwright|selenium|headless/i.test(attr.value)) {
                        results.bodyAttributes.push({
                            name: attr.name,
                            value: attr.value.substring(0, 100)
                        });
                    }
                }
            }
            
            // Check meta tags for automation indicators
            const metaTags = document.querySelectorAll('meta');
            for (const meta of metaTags) {
                const name = meta.getAttribute('name') || '';
                const content = meta.getAttribute('content') || '';
                if (/automation|headless|bot|crawler/i.test(name) ||
                    /automation|headless|bot|crawler/i.test(content)) {
                    results.metaTags.push({
                        name,
                        content: content.substring(0, 100)
                    });
                }
            }
            
        } catch (e) {
            results.anomalies.push(`scan_error: ${e.message}`);
        }
        
        return results;
    }

    /**
     * Analyze Function.caller and arguments.callee behavior
     * These are deprecated but their behavior can reveal emulation
     */
    _analyzeCallerBehavior() {
        const analysis = {
            callerAccessible: false,
            calleeAccessible: false,
            callerThrows: false,
            calleeThrows: false,
            stackDepthViaCaller: 0
        };

        try {
            // Test caller access in non-strict function
            const testCaller = function() {
                try {
                    return !!testCaller.caller;
                } catch (e) {
                    analysis.callerThrows = true;
                    return false;
                }
            };
            analysis.callerAccessible = testCaller();
            
        } catch (e) {
            analysis.callerThrows = true;
        }

        try {
            // Test arguments.callee in non-strict function
            const testCallee = function() {
                try {
                    return !!arguments.callee;
                } catch (e) {
                    analysis.calleeThrows = true;
                    return false;
                }
            };
            analysis.calleeAccessible = testCallee();
            
        } catch (e) {
            analysis.calleeThrows = true;
        }

        return analysis;
    }

    /**
     * Analyze eval and Function constructor characteristics
     * Different environments may have subtle differences
     */
    _analyzeEvalCharacteristics() {
        const analysis = {
            evalAvailable: false,
            functionConstructorAvailable: false,
            evalToString: null,
            functionConstructorToString: null,
            indirectEvalWorks: false,
            anomalies: []
        };

        try {
            analysis.evalAvailable = typeof eval === 'function';
            if (analysis.evalAvailable) {
                analysis.evalToString = eval.toString();
            }
            
            analysis.functionConstructorAvailable = typeof Function === 'function';
            if (analysis.functionConstructorAvailable) {
                analysis.functionConstructorToString = Function.toString();
            }
            
            // Test indirect eval (should work in all environments)
            try {
                const indirectEval = (0, eval);
                indirectEval('1+1');
                analysis.indirectEvalWorks = true;
            } catch (e) {
                analysis.anomalies.push('indirect_eval_blocked');
            }
            
            // Check if eval results have unusual stack traces
            try {
                const evalError = eval('(function() { return new Error().stack; })()');
                if (/VM\d+/.test(evalError)) {
                    analysis.anomalies.push('eval_vm_context');
                }
            } catch (e) {
                // Eval blocked or failed
            }
            
        } catch (e) {
            analysis.anomalies.push(`error: ${e.message}`);
        }
        
        return analysis;
    }

    /**
     * Generate clustering signals from collected fingerprint data
     * These signals can be used to group similar environments together
     */
    _generateClusteringSignals(data) {
        const signals = {
            // Unique fingerprint components for clustering
            stackFormat: data.errorStackFormat?.format || 'unknown',
            hasColumnNumbers: data.errorStackFormat?.hasColumnNumbers || false,
            stackAnomalies: data.errorStackFormat?.anomalies || [],
            
            // Function toString patterns
            nativeFunctionSignature: this._hashString(data.functionToStringFormat?.nativeFunctionFormat || ''),
            boundFunctionSignature: this._hashString(data.functionToStringFormat?.boundFunctionFormat || ''),
            
            // Automation property counts (useful for clustering)
            windowAutomationKeys: data.automationProperties?.windowKeys?.count || 0,
            navigatorAutomationKeys: data.automationProperties?.navigatorKeys?.count || 0,
            
            // Caller behavior (varies by environment/strict mode)
            callerAccessible: data.callerAnalysis?.callerAccessible || false,
            
            // Eval characteristics
            evalAnomalies: data.evalCharacteristics?.anomalies || [],
            
            // Combined anomaly score
            anomalyScore: this._calculateAnomalyScore(data),
            
            // Combined hash for quick comparison
            clusterHash: null
        };
        
        // Generate combined cluster hash
        signals.clusterHash = this._hashString(JSON.stringify({
            sf: signals.stackFormat,
            cn: signals.hasColumnNumbers,
            nf: signals.nativeFunctionSignature,
            bf: signals.boundFunctionSignature,
            ca: signals.callerAccessible
        }));
        
        return signals;
    }

    /**
     * Calculate overall anomaly score from collected data
     */
    _calculateAnomalyScore(data) {
        let score = 0;
        
        // Stack anomalies
        const stackAnomalies = data.errorStackFormat?.anomalies || [];
        for (const anomaly of stackAnomalies) {
            if (anomaly === 'automation_framework_in_stack') score += 50;
            else if (anomaly === 'vm_context') score += 20;
            else if (anomaly === 'eval_context') score += 10;
            else if (anomaly === 'shallow_stack') score += 5;
            else score += 2;
        }
        
        // Automation properties found (only count actual suspicious properties, not standard ones)
        score += (data.automationProperties?.totalSuspiciousCount || 0) * 5;
        
        // DOM attributes
        const domAttrCount = 
            (data.domAttributes?.htmlAttributes?.length || 0) +
            (data.domAttributes?.bodyAttributes?.length || 0) +
            (data.domAttributes?.metaTags?.length || 0);
        score += domAttrCount * 10;
        
        // Eval anomalies
        score += (data.evalCharacteristics?.anomalies?.length || 0) * 5;
        
        return score;
    }

    /**
     * Simple string hash for fingerprinting
     */
    _hashString(str) {
        if (!str) return 0;
        let hash = 0;
        for (let i = 0; i < str.length; i++) {
            const char = str.charCodeAt(i);
            hash = ((hash << 5) - hash) + char;
            hash = hash & hash; // Convert to 32bit integer
        }
        return hash >>> 0; // Convert to unsigned
    }

    /**
     * Format results into metrics object for browserFingerprint integration
     */
    _formatMetrics(result) {
        const metrics = {
            // Stack format fingerprint
            stackFormat: {
                value: result.errorStackFormat?.format || 'unknown',
                description: 'JavaScript engine stack trace format (v8, spidermonkey, other)',
                risk: 'N/A'
            },
            stackLineCount: {
                value: result.errorStackFormat?.lineCount || 0,
                description: 'Number of lines in a typical Error stack trace',
                risk: 'N/A'
            },
            hasColumnNumbers: {
                value: result.errorStackFormat?.hasColumnNumbers || false,
                description: 'Stack traces include column numbers',
                risk: 'N/A'
            },
            stackAnomalies: {
                value: result.errorStackFormat?.anomalies || [],
                description: 'Unusual patterns detected in stack traces',
                risk: (result.errorStackFormat?.anomalies?.length || 0) > 0 ? 'Medium' : 'Low'
            },
            
            // Function toString fingerprint (hashes only, for clustering)
            nativeFunctionHash: {
                value: this._hashString(result.functionToStringFormat?.nativeFunctionFormat || ''),
                description: 'Hash of native function toString format',
                risk: 'N/A'
            },
            boundFunctionHash: {
                value: this._hashString(result.functionToStringFormat?.boundFunctionFormat || ''),
                description: 'Hash of bound function toString format',
                risk: 'N/A'
            },
            
            // Automation property scan
            windowAutomationKeys: {
                value: result.automationProperties?.windowKeys?.count || 0,
                description: 'Number of automation-related window properties found',
                risk: (result.automationProperties?.windowKeys?.count || 0) > 0 ? 'High' : 'Low'
            },
            navigatorAutomationKeys: {
                value: result.automationProperties?.navigatorKeys?.count || 0,
                description: 'Number of automation-related navigator properties found',
                risk: (result.automationProperties?.navigatorKeys?.count || 0) > 0 ? 'High' : 'Low'
            },
            
            // Detailed property findings (for research/clustering)
            suspiciousProperties: {
                value: [
                    ...(result.automationProperties?.windowKeys?.found || []),
                    ...(result.automationProperties?.navigatorKeys?.found || []),
                    ...(result.automationProperties?.documentKeys?.found || [])
                ].slice(0, 30),
                description: 'Automation-related properties found in global objects',
                risk: 'N/A'
            },
            
            // DOM attributes
            automationDOMAttributes: {
                value: [
                    ...(result.domAttributes?.htmlAttributes || []),
                    ...(result.domAttributes?.bodyAttributes || []),
                    ...(result.domAttributes?.metaTags || [])
                ],
                description: 'Automation-related DOM attributes and meta tags',
                risk: 'N/A'
            },
            
            // Caller analysis
            callerAccessible: {
                value: result.callerAnalysis?.callerAccessible || false,
                description: 'Function.caller property accessible (non-strict mode behavior)',
                risk: 'N/A'
            },
            
            // Eval characteristics
            evalAnomalies: {
                value: result.evalCharacteristics?.anomalies || [],
                description: 'Unusual eval/Function constructor behavior',
                risk: (result.evalCharacteristics?.anomalies?.length || 0) > 0 ? 'Medium' : 'Low'
            },
            
            // Clustering signals
            clusterHash: {
                value: result.clusteringSignals?.clusterHash || 0,
                description: 'Combined hash for environment clustering',
                risk: 'N/A'
            },
            anomalyScore: {
                value: result.clusteringSignals?.anomalyScore || 0,
                description: 'Combined automation anomaly score (higher = more suspicious)',
                risk: result.clusteringSignals?.anomalyScore > 50 ? 'High' : 
                      result.clusteringSignals?.anomalyScore > 20 ? 'Medium' : 'Low'
            },
            
            // Stack sample for debugging/research
            stackSample: {
                value: result.errorStackFormat?.stackSample || null,
                description: 'Sample stack trace (first 500 chars) for analysis',
                risk: 'N/A'
            }
        };
        
        return metrics;
    }

    /**
     * Cleanup any active monitoring
     */
    cleanup() {
        if (this.intervalId) {
            clearInterval(this.intervalId);
            this.intervalId = null;
        }
        if (this.timeoutId) {
            clearTimeout(this.timeoutId);
            this.timeoutId = null;
        }
        this.isEnabled = false;
        
        // Restore original methods if wrapped
        if (this.isWrapped && typeof document !== 'undefined') {
            for (const [methodName, originalMethod] of Object.entries(this.originalMethods)) {
                try {
                    document[methodName] = originalMethod;
                } catch (e) {
                    // Restoration failed
                }
            }
            this.originalMethods = {};
            this.isWrapped = false;
        }
    }
}

// Export configuration for customization
export const STACK_TRACE_FINGERPRINT_CONFIG = STACK_TRACE_CONFIG;

export { StackTraceFingerprintDetector };
