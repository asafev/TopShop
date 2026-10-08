/**
 * Performance Timing Detector Module
 * Collects critical performance timing metrics from the Performance API
 * 
 * Focuses on key performance entry types:
 * - navigation: Page load and DOM timing metrics
 * - paint: First paint and first contentful paint
 * - first-input: User's first interaction timing
 * - animation frames: Frame timing statistical analysis
 * - execution speed: JS benchmark for environment fingerprinting
 * 
 * These metrics help cluster and identify specific actors based on
 * their page load patterns, interaction timing signatures, and
 * execution environment characteristics.
 * 
 * @module detectors/performanceTiming
 */

/**
 * Configuration for performance timing collection
 */
export const PERFORMANCE_TIMING_CONFIG = {
    // Whether to collect navigation timing
    collectNavigation: true,
    // Whether to collect paint timing
    collectPaint: true,
    // Whether to collect first-input timing
    collectFirstInput: true,
    // Whether to setup PerformanceObserver for first-input
    observeFirstInput: true,
    // Timeout for first-input observation (ms)
    firstInputTimeout: 5000,
    // Animation frame analysis settings
    collectAnimationFrames: true,
    animationFrameCount: 30,  // Number of frames to analyze (reduced for faster collection)
    // Execution speed benchmark settings
    collectExecutionSpeed: true,
    benchmarkIterations: 5000
};

/**
 * Performance Timing Detector
 * Collects performance metrics useful for actor clustering and analysis
 */
export class PerformanceTimingDetector {
    /**
     * @param {Object} config - Configuration options
     */
    constructor(config = {}) {
        this.config = { ...PERFORMANCE_TIMING_CONFIG, ...config };
        this.metrics = {};
        this.firstInputData = null;
        this.firstInputObserver = null;
        this.isInitialized = false;
        
        // Animation frame analysis state
        this.animationFrameAnalysis = null;
        
        // Reference timestamps for timing
        this.startTime = Date.now();
        this.perfStartTime = this._getPerfNow();
    }

    /**
     * Initialize the detector - should be called early in page lifecycle
     * to capture first-input data before it's available
     */
    init() {
        if (this.isInitialized) return;
        
        // Setup PerformanceObserver for first-input if configured
        if (this.config.observeFirstInput && typeof PerformanceObserver !== 'undefined') {
            this._setupFirstInputObserver();
        }
        
        // Start animation frame analysis early (async, non-blocking)
        // Store the promise so we can wait for it in analyze() if needed
        if (this.config.collectAnimationFrames) {
            this._animationFramePromise = this._startAnimationFrameAnalysis();
        }
        
        this.isInitialized = true;
    }

    /**
     * Get high-resolution timestamp with fallback
     * @private
     * @returns {number} High-resolution timestamp
     */
    _getPerfNow() {
        try {
            if (typeof performance !== 'undefined' && performance.now) {
                return performance.now();
            }
        } catch (e) {}
        return Date.now() - this.startTime;
    }

    /**
     * Setup PerformanceObserver for first-input entries
     * @private
     */
    _setupFirstInputObserver() {
        try {
            // Check if first-input type is supported
            if (!PerformanceObserver.supportedEntryTypes?.includes('first-input')) {
                return;
            }

            this.firstInputObserver = new PerformanceObserver((list) => {
                const entries = list.getEntries();
                if (entries.length > 0) {
                    this.firstInputData = this._processFirstInputEntry(entries[0]);
                    // Disconnect after capturing first input
                    this.firstInputObserver?.disconnect();
                }
            });

            this.firstInputObserver.observe({ type: 'first-input', buffered: true });

            // Auto-disconnect after timeout
            setTimeout(() => {
                this.firstInputObserver?.disconnect();
            }, this.config.firstInputTimeout);

        } catch (e) {
            // Silently fail - first-input observation is optional
        }
    }

    /**
     * Run performance timing analysis
     * @returns {Promise<Object>} Performance timing metrics
     */
    async analyze() {
        this.metrics = {};

        // Collect navigation timing
        if (this.config.collectNavigation) {
            Object.assign(this.metrics, this._collectNavigationTiming());
        }

        // Collect paint timing
        if (this.config.collectPaint) {
            Object.assign(this.metrics, this._collectPaintTiming());
        }

        // Collect first-input timing
        if (this.config.collectFirstInput) {
            Object.assign(this.metrics, this._collectFirstInputTiming());
        }

        // Wait for and collect animation frame analysis
        if (this.config.collectAnimationFrames) {
            // Wait for animation frame analysis to complete if still running
            if (this._animationFramePromise) {
                try {
                    await this._animationFramePromise;
                } catch (e) {
                    // Analysis failed, animationFrameAnalysis will be null or have error
                }
            }
            Object.assign(this.metrics, this._getAnimationFrameMetrics());
        }

        // Collect execution speed benchmark
        if (this.config.collectExecutionSpeed) {
            Object.assign(this.metrics, this._collectExecutionSpeed());
        }

        // Add collection metadata
        this.metrics.collectionTimestamp = {
            value: Date.now(),
            description: 'Timestamp when performance metrics were collected',
            risk: 'N/A'
        };

        return this.metrics;
    }

    /**
     * Collect Navigation Timing metrics
     * @private
     * @returns {Object} Navigation timing metrics
     */
    _collectNavigationTiming() {
        const metrics = {};
        
        try {
            if (typeof performance === 'undefined') {
                return { navigationTimingError: this._createErrorMetric('Performance API not available') };
            }

            const timing = performance.timing;
            const navigationStart = timing?.navigationStart || 0;

            // Primary navigation metrics (relative to navigationStart)
            if (timing) {
                // DOM Complete: When DOM is fully loaded and parsed
                const domComplete = timing.domComplete > 0 
                    ? timing.domComplete - navigationStart 
                    : null;
                
                metrics.domComplete = {
                    value: domComplete ?? 'Not available',
                    description: 'Time until DOM is complete (ms since navigationStart)',
                    risk: this._assessDomCompleteRisk(domComplete),
                    code: 'performance.timing.domComplete - performance.timing.navigationStart'
                };

                // Load Event: When load event finishes
                const loadEvent = timing.loadEventEnd > 0 
                    ? timing.loadEventEnd - navigationStart 
                    : null;
                
                metrics.loadEvent = {
                    value: loadEvent ?? 'Not available',
                    description: 'Time until load event completes (ms since navigationStart)',
                    risk: this._assessLoadEventRisk(loadEvent),
                    code: 'performance.timing.loadEventEnd - performance.timing.navigationStart'
                };

                // DOM Interactive: When DOM parsing is complete
                const domInteractive = timing.domInteractive > 0 
                    ? timing.domInteractive - navigationStart 
                    : null;
                
                metrics.domInteractive = {
                    value: domInteractive ?? 'Not available',
                    description: 'Time until DOM is interactive (ms since navigationStart)',
                    risk: 'N/A',
                    code: 'performance.timing.domInteractive - performance.timing.navigationStart'
                };

                // DOM Content Loaded: When DOMContentLoaded event fires
                const domContentLoaded = timing.domContentLoadedEventEnd > 0 
                    ? timing.domContentLoadedEventEnd - navigationStart 
                    : null;
                
                metrics.domContentLoaded = {
                    value: domContentLoaded ?? 'Not available',
                    description: 'Time until DOMContentLoaded event completes (ms)',
                    risk: 'N/A',
                    code: 'performance.timing.domContentLoadedEventEnd - performance.timing.navigationStart'
                };

                // Time to First Byte (TTFB)
                const ttfb = timing.responseStart > 0 
                    ? timing.responseStart - navigationStart 
                    : null;
                
                metrics.ttfb = {
                    value: ttfb ?? 'Not available',
                    description: 'Time to First Byte - server response time (ms)',
                    risk: 'N/A',
                    code: 'performance.timing.responseStart - performance.timing.navigationStart'
                };

                // Response time
                const responseTime = timing.responseEnd > 0 && timing.responseStart > 0
                    ? timing.responseEnd - timing.responseStart
                    : null;

                metrics.responseTime = {
                    value: responseTime ?? 'Not available',
                    description: 'Time to receive full response (ms)',
                    risk: 'N/A',
                    code: 'performance.timing.responseEnd - performance.timing.responseStart'
                };

                // DNS Lookup time
                const dnsLookup = timing.domainLookupEnd > 0 && timing.domainLookupStart > 0
                    ? timing.domainLookupEnd - timing.domainLookupStart
                    : null;

                metrics.dnsLookup = {
                    value: dnsLookup ?? 0,
                    description: 'DNS lookup time (ms) - 0 indicates cached or same-origin',
                    risk: 'N/A',
                    code: 'performance.timing.domainLookupEnd - performance.timing.domainLookupStart'
                };

                // TCP Connection time
                const tcpConnect = timing.connectEnd > 0 && timing.connectStart > 0
                    ? timing.connectEnd - timing.connectStart
                    : null;

                metrics.tcpConnect = {
                    value: tcpConnect ?? 0,
                    description: 'TCP connection establishment time (ms) - 0 indicates reused connection',
                    risk: 'N/A',
                    code: 'performance.timing.connectEnd - performance.timing.connectStart'
                };

                // Build timing signature (like PerimeterX) for clustering
                // Format: dnsLookup:tcpConnect:ttfb:domInteractive:domComplete:pageLoadTime
                const timingSignatureValues = [
                    dnsLookup ?? 0,
                    tcpConnect ?? 0,
                    ttfb ?? 0,
                    domInteractive ?? 0,
                    domComplete ?? 0,
                    loadEvent ?? 0  // pageLoadTime equivalent
                ];
                const timingSignature = timingSignatureValues.map(v => Math.round(v)).join(':');

                metrics.timingSignature = {
                    value: timingSignature,
                    description: 'Compact timing signature (dns:tcp:ttfb:domInteractive:domComplete:loadEvent) for actor clustering',
                    risk: 'N/A',
                    code: '[dnsLookup, tcpConnect, ttfb, domInteractive, domComplete, loadEvent].map(v => Math.round(v)).join(":")'
                };
            }

            // Navigation Timing Level 2 (PerformanceNavigationTiming)
            if (performance.getEntriesByType) {
                const navEntries = performance.getEntriesByType('navigation');
                if (navEntries?.length > 0) {
                    const nav = navEntries[0];
                    
                    // === EXISTING METRICS (keep names unchanged) ===
                    
                    metrics.navigationType = {
                        value: nav.type || 'Not available',
                        description: 'Navigation type (navigate, reload, back_forward, prerender)',
                        risk: 'N/A',
                        code: "performance.getEntriesByType('navigation')[0].type"
                    };

                    metrics.redirectCount = {
                        value: nav.redirectCount ?? 'Not available',
                        description: 'Number of redirects before reaching this page',
                        risk: 'N/A',
                        code: "performance.getEntriesByType('navigation')[0].redirectCount"
                    };

                    metrics.transferSize = {
                        value: nav.transferSize ?? 'Not available',
                        description: 'Total bytes transferred for the page (including headers)',
                        risk: 'N/A',
                        code: "performance.getEntriesByType('navigation')[0].transferSize"
                    };

                    metrics.encodedBodySize = {
                        value: nav.encodedBodySize ?? 'Not available',
                        description: 'Encoded (compressed) size of the page body',
                        risk: 'N/A',
                        code: "performance.getEntriesByType('navigation')[0].encodedBodySize"
                    };

                    metrics.decodedBodySize = {
                        value: nav.decodedBodySize ?? 'Not available',
                        description: 'Decoded (uncompressed) size of the page body',
                        risk: 'N/A',
                        code: "performance.getEntriesByType('navigation')[0].decodedBodySize"
                    };
                    
                    // === NEW METRICS: All PerformanceNavigationTiming properties ===
                    
                    // --- Resource Timing Properties ---
                    
                    metrics.navStartTime = {
                        value: nav.startTime ?? 'Not available',
                        description: 'Start time of the navigation (always 0 for navigation entries)',
                        risk: 'N/A',
                        code: "nav.startTime"
                    };
                    
                    metrics.navDuration = {
                        value: nav.duration ? Math.round(nav.duration) : 'Not available',
                        description: 'Total duration from navigationStart to loadEventEnd (ms)',
                        risk: 'N/A',
                        code: "nav.duration"
                    };
                    
                    metrics.navName = {
                        value: nav.name || 'Not available',
                        description: 'URL of the navigated document',
                        risk: 'N/A',
                        code: "nav.name"
                    };
                    
                    metrics.navEntryType = {
                        value: nav.entryType || 'Not available',
                        description: 'Entry type (always "navigation" for this entry)',
                        risk: 'N/A',
                        code: "nav.entryType"
                    };
                    
                    metrics.navInitiatorType = {
                        value: nav.initiatorType || 'Not available',
                        description: 'Initiator type (always "navigation" for document)',
                        risk: 'N/A',
                        code: "nav.initiatorType"
                    };
                    
                    // --- Network Timing Properties ---
                    
                    metrics.navWorkerStart = {
                        value: nav.workerStart ? Math.round(nav.workerStart * 100) / 100 : 0,
                        description: 'Time when service worker started (0 if no service worker)',
                        risk: 'N/A',
                        code: "nav.workerStart"
                    };
                    
                    metrics.navRedirectStart = {
                        value: nav.redirectStart ? Math.round(nav.redirectStart * 100) / 100 : 0,
                        description: 'Start time of first redirect (0 if no redirect)',
                        risk: 'N/A',
                        code: "nav.redirectStart"
                    };
                    
                    metrics.navRedirectEnd = {
                        value: nav.redirectEnd ? Math.round(nav.redirectEnd * 100) / 100 : 0,
                        description: 'End time of last redirect (0 if no redirect)',
                        risk: 'N/A',
                        code: "nav.redirectEnd"
                    };
                    
                    metrics.navFetchStart = {
                        value: nav.fetchStart ? Math.round(nav.fetchStart * 100) / 100 : 'Not available',
                        description: 'Time when browser starts fetching the resource',
                        risk: 'N/A',
                        code: "nav.fetchStart"
                    };
                    
                    metrics.navDomainLookupStart = {
                        value: nav.domainLookupStart ? Math.round(nav.domainLookupStart * 100) / 100 : 'Not available',
                        description: 'Time when DNS lookup starts',
                        risk: 'N/A',
                        code: "nav.domainLookupStart"
                    };
                    
                    metrics.navDomainLookupEnd = {
                        value: nav.domainLookupEnd ? Math.round(nav.domainLookupEnd * 100) / 100 : 'Not available',
                        description: 'Time when DNS lookup ends',
                        risk: 'N/A',
                        code: "nav.domainLookupEnd"
                    };
                    
                    metrics.navConnectStart = {
                        value: nav.connectStart ? Math.round(nav.connectStart * 100) / 100 : 'Not available',
                        description: 'Time when TCP connection starts',
                        risk: 'N/A',
                        code: "nav.connectStart"
                    };
                    
                    metrics.navConnectEnd = {
                        value: nav.connectEnd ? Math.round(nav.connectEnd * 100) / 100 : 'Not available',
                        description: 'Time when TCP connection ends',
                        risk: 'N/A',
                        code: "nav.connectEnd"
                    };
                    
                    metrics.navSecureConnectionStart = {
                        value: nav.secureConnectionStart ? Math.round(nav.secureConnectionStart * 100) / 100 : 0,
                        description: 'Time when TLS handshake starts (0 if not HTTPS)',
                        risk: 'N/A',
                        code: "nav.secureConnectionStart"
                    };
                    
                    metrics.navRequestStart = {
                        value: nav.requestStart ? Math.round(nav.requestStart * 100) / 100 : 'Not available',
                        description: 'Time when browser sends request',
                        risk: 'N/A',
                        code: "nav.requestStart"
                    };
                    
                    metrics.navResponseStart = {
                        value: nav.responseStart ? Math.round(nav.responseStart * 100) / 100 : 'Not available',
                        description: 'Time when first byte of response is received (TTFB)',
                        risk: 'N/A',
                        code: "nav.responseStart"
                    };
                    
                    metrics.navResponseEnd = {
                        value: nav.responseEnd ? Math.round(nav.responseEnd * 100) / 100 : 'Not available',
                        description: 'Time when last byte of response is received',
                        risk: 'N/A',
                        code: "nav.responseEnd"
                    };
                    
                    // --- DOM Timing Properties ---
                    
                    metrics.navDomInteractive = {
                        value: nav.domInteractive ? Math.round(nav.domInteractive * 100) / 100 : 'Not available',
                        description: 'Time when DOM is interactive',
                        risk: 'N/A',
                        code: "nav.domInteractive"
                    };
                    
                    metrics.navDomContentLoadedEventStart = {
                        value: nav.domContentLoadedEventStart ? Math.round(nav.domContentLoadedEventStart * 100) / 100 : 'Not available',
                        description: 'Time when DOMContentLoaded event starts',
                        risk: 'N/A',
                        code: "nav.domContentLoadedEventStart"
                    };
                    
                    metrics.navDomContentLoadedEventEnd = {
                        value: nav.domContentLoadedEventEnd ? Math.round(nav.domContentLoadedEventEnd * 100) / 100 : 'Not available',
                        description: 'Time when DOMContentLoaded event ends',
                        risk: 'N/A',
                        code: "nav.domContentLoadedEventEnd"
                    };
                    
                    metrics.navDomComplete = {
                        value: nav.domComplete ? Math.round(nav.domComplete * 100) / 100 : 'Not available',
                        description: 'Time when DOM is complete',
                        risk: 'N/A',
                        code: "nav.domComplete"
                    };
                    
                    metrics.navLoadEventStart = {
                        value: nav.loadEventStart ? Math.round(nav.loadEventStart * 100) / 100 : 'Not available',
                        description: 'Time when load event starts',
                        risk: 'N/A',
                        code: "nav.loadEventStart"
                    };
                    
                    metrics.navLoadEventEnd = {
                        value: nav.loadEventEnd ? Math.round(nav.loadEventEnd * 100) / 100 : 'Not available',
                        description: 'Time when load event ends',
                        risk: 'N/A',
                        code: "nav.loadEventEnd"
                    };
                    
                    metrics.navUnloadEventStart = {
                        value: nav.unloadEventStart ? Math.round(nav.unloadEventStart * 100) / 100 : 0,
                        description: 'Time when previous document unload event starts (0 if no previous doc)',
                        risk: 'N/A',
                        code: "nav.unloadEventStart"
                    };
                    
                    metrics.navUnloadEventEnd = {
                        value: nav.unloadEventEnd ? Math.round(nav.unloadEventEnd * 100) / 100 : 0,
                        description: 'Time when previous document unload event ends (0 if no previous doc)',
                        risk: 'N/A',
                        code: "nav.unloadEventEnd"
                    };
                    
                    // --- Protocol & Server Timing ---
                    
                    metrics.navNextHopProtocol = {
                        value: nav.nextHopProtocol || 'Not available',
                        description: 'Network protocol used (h2, http/1.1, h3, etc.)',
                        risk: 'N/A',
                        code: "nav.nextHopProtocol"
                    };
                    
                    // Server timing entries (if available)
                    if (nav.serverTiming && nav.serverTiming.length > 0) {
                        metrics.navServerTiming = {
                            value: nav.serverTiming.map(st => ({
                                name: st.name,
                                duration: st.duration,
                                description: st.description
                            })),
                            description: 'Server timing entries from Server-Timing header',
                            risk: 'N/A',
                            code: "nav.serverTiming"
                        };
                    }
                    
                    // --- Additional Properties (where available) ---
                    
                    // Response status (Chrome 109+)
                    if (typeof nav.responseStatus !== 'undefined') {
                        metrics.navResponseStatus = {
                            value: nav.responseStatus,
                            description: 'HTTP response status code',
                            risk: 'N/A',
                            code: "nav.responseStatus"
                        };
                    }
                    
                    // Delivery type (Chrome 117+)
                    if (typeof nav.deliveryType !== 'undefined') {
                        metrics.navDeliveryType = {
                            value: nav.deliveryType || 'Not available',
                            description: 'How resource was delivered (cache, navigational-prefetch, etc.)',
                            risk: 'N/A',
                            code: "nav.deliveryType"
                        };
                    }
                    
                    // Render blocking status (Chrome 107+)
                    if (typeof nav.renderBlockingStatus !== 'undefined') {
                        metrics.navRenderBlockingStatus = {
                            value: nav.renderBlockingStatus || 'Not available',
                            description: 'Render blocking status of the resource',
                            risk: 'N/A',
                            code: "nav.renderBlockingStatus"
                        };
                    }
                    
                    // Content type (where available)
                    if (typeof nav.contentType !== 'undefined') {
                        metrics.navContentType = {
                            value: nav.contentType || 'Not available',
                            description: 'MIME type of the resource',
                            risk: 'N/A',
                            code: "nav.contentType"
                        };
                    }
                    
                    // Activation start (for prerendered pages)
                    if (typeof nav.activationStart !== 'undefined') {
                        metrics.navActivationStart = {
                            value: nav.activationStart ? Math.round(nav.activationStart * 100) / 100 : 0,
                            description: 'Time when prerendered page was activated (0 if not prerendered)',
                            risk: 'N/A',
                            code: "nav.activationStart"
                        };
                    }
                    
                    // Critical CH restart (Client Hints)
                    if (typeof nav.criticalCHRestart !== 'undefined') {
                        metrics.navCriticalCHRestart = {
                            value: nav.criticalCHRestart ? Math.round(nav.criticalCHRestart * 100) / 100 : 0,
                            description: 'Time when Critical-CH caused a restart (0 if no restart)',
                            risk: 'N/A',
                            code: "nav.criticalCHRestart"
                        };
                    }
                    
                    // === COMPUTED METRICS from Navigation Timing ===
                    
                    // DNS lookup time (from Level 2 API)
                    const navDnsTime = nav.domainLookupEnd && nav.domainLookupStart
                        ? Math.round((nav.domainLookupEnd - nav.domainLookupStart) * 100) / 100
                        : 0;
                    metrics.navDnsTime = {
                        value: navDnsTime,
                        description: 'DNS lookup duration (ms) - computed from Level 2 API',
                        risk: 'N/A',
                        code: "nav.domainLookupEnd - nav.domainLookupStart"
                    };
                    
                    // TCP connection time (from Level 2 API)
                    const navTcpTime = nav.connectEnd && nav.connectStart
                        ? Math.round((nav.connectEnd - nav.connectStart) * 100) / 100
                        : 0;
                    metrics.navTcpTime = {
                        value: navTcpTime,
                        description: 'TCP connection duration (ms) - computed from Level 2 API',
                        risk: 'N/A',
                        code: "nav.connectEnd - nav.connectStart"
                    };
                    
                    // TLS handshake time
                    const navTlsTime = nav.secureConnectionStart && nav.connectEnd
                        ? Math.round((nav.connectEnd - nav.secureConnectionStart) * 100) / 100
                        : 0;
                    metrics.navTlsTime = {
                        value: navTlsTime,
                        description: 'TLS handshake duration (ms) - 0 if HTTP',
                        risk: 'N/A',
                        code: "nav.connectEnd - nav.secureConnectionStart"
                    };
                    
                    // Request time (from request start to response start)
                    const navRequestTime = nav.responseStart && nav.requestStart
                        ? Math.round((nav.responseStart - nav.requestStart) * 100) / 100
                        : null;
                    metrics.navRequestTime = {
                        value: navRequestTime ?? 'Not available',
                        description: 'Request time until first byte (ms)',
                        risk: 'N/A',
                        code: "nav.responseStart - nav.requestStart"
                    };
                    
                    // Response download time
                    const navResponseTime = nav.responseEnd && nav.responseStart
                        ? Math.round((nav.responseEnd - nav.responseStart) * 100) / 100
                        : null;
                    metrics.navResponseDownloadTime = {
                        value: navResponseTime ?? 'Not available',
                        description: 'Response download duration (ms)',
                        risk: 'N/A',
                        code: "nav.responseEnd - nav.responseStart"
                    };
                    
                    // DOM processing time
                    const navDomProcessingTime = nav.domComplete && nav.responseEnd
                        ? Math.round((nav.domComplete - nav.responseEnd) * 100) / 100
                        : null;
                    metrics.navDomProcessingTime = {
                        value: navDomProcessingTime ?? 'Not available',
                        description: 'DOM processing time from response end to DOM complete (ms)',
                        risk: 'N/A',
                        code: "nav.domComplete - nav.responseEnd"
                    };
                    
                    // Redirect time (if any redirects)
                    const navRedirectTime = nav.redirectEnd && nav.redirectStart
                        ? Math.round((nav.redirectEnd - nav.redirectStart) * 100) / 100
                        : 0;
                    metrics.navRedirectTime = {
                        value: navRedirectTime,
                        description: 'Total redirect time (ms) - 0 if no redirects',
                        risk: 'N/A',
                        code: "nav.redirectEnd - nav.redirectStart"
                    };
                }
            }

        } catch (e) {
            metrics.navigationTimingError = this._createErrorMetric(e.message);
        }

        return metrics;
    }

    /**
     * Collect Paint Timing metrics
     * @private
     * @returns {Object} Paint timing metrics
     */
    _collectPaintTiming() {
        const metrics = {};

        try {
            if (typeof performance === 'undefined' || !performance.getEntriesByType) {
                return { paintTimingError: this._createErrorMetric('Paint timing not available') };
            }

            const paintEntries = performance.getEntriesByType('paint');
            
            // First Paint
            const firstPaintEntry = paintEntries?.find(entry => entry.name === 'first-paint');
            metrics.firstPaint = {
                value: firstPaintEntry?.startTime 
                    ? Math.round(firstPaintEntry.startTime * 100) / 100 
                    : 'Not available',
                description: 'Time until first pixel is painted on screen (ms)',
                risk: this._assessFirstPaintRisk(firstPaintEntry?.startTime),
                code: "performance.getEntriesByType('paint').find(e => e.name === 'first-paint')?.startTime"
            };

            // First Contentful Paint (FCP)
            const fcpEntry = paintEntries?.find(entry => entry.name === 'first-contentful-paint');
            metrics.firstContentfulPaint = {
                value: fcpEntry?.startTime 
                    ? Math.round(fcpEntry.startTime * 100) / 100 
                    : 'Not available',
                description: 'Time until first content element is painted (ms)',
                risk: this._assessFcpRisk(fcpEntry?.startTime),
                code: "performance.getEntriesByType('paint').find(e => e.name === 'first-contentful-paint')?.startTime"
            };

            // Paint timing available
            metrics.paintTimingSupported = {
                value: paintEntries?.length > 0,
                description: 'Whether paint timing entries are available',
                risk: 'N/A',
                code: "performance.getEntriesByType('paint').length > 0"
            };

        } catch (e) {
            metrics.paintTimingError = this._createErrorMetric(e.message);
        }

        return metrics;
    }

    /**
     * Collect First Input timing metrics
     * @private
     * @returns {Object} First input timing metrics
     */
    _collectFirstInputTiming() {
        const metrics = {};

        try {
            // First try to get from observer data
            if (this.firstInputData) {
                return this._buildFirstInputMetrics(this.firstInputData);
            }

            // Fall back to direct API access
            if (typeof performance === 'undefined' || !performance.getEntriesByType) {
                metrics.firstInputSupported = {
                    value: false,
                    description: 'First-input performance API support',
                    risk: 'N/A'
                };
                return metrics;
            }

            const firstInputEntries = performance.getEntriesByType('first-input');
            
            if (firstInputEntries?.length > 0) {
                const entry = firstInputEntries[0];
                const processedData = this._processFirstInputEntry(entry);
                return this._buildFirstInputMetrics(processedData);
            }

            // No first-input recorded yet
            metrics.firstInputRecorded = {
                value: false,
                description: 'Whether first user input has been recorded',
                risk: 'N/A',
                code: "performance.getEntriesByType('first-input').length > 0"
            };

            metrics.firstInputSupported = {
                value: this._isFirstInputSupported(),
                description: 'Whether first-input performance entry type is supported',
                risk: 'N/A'
            };

        } catch (e) {
            metrics.firstInputError = this._createErrorMetric(e.message);
        }

        return metrics;
    }

    /**
     * Process a first-input performance entry
     * @private
     * @param {PerformanceEntry} entry - The first-input entry
     * @returns {Object} Processed first input data
     */
    _processFirstInputEntry(entry) {
        const data = {
            recorded: true,
            eventName: entry.name,
            startTime: Math.round(entry.startTime),
            processingStart: entry.processingStart ? Math.round(entry.processingStart) : null,
            processingEnd: entry.processingEnd ? Math.round(entry.processingEnd) : null,
            duration: entry.duration ? Math.round(entry.duration) : null
        };

        // Calculate First Input Delay (FID)
        if (entry.processingStart && entry.startTime) {
            data.firstInputDelay = Math.round(entry.processingStart - entry.startTime);
        }

        // Try to get target element info
        if (entry.target) {
            try {
                data.targetTagName = entry.target.tagName;
                data.targetId = entry.target.id || null;
                data.targetClassName = entry.target.className || null;
                
                // Get element position
                const rect = entry.target.getBoundingClientRect?.();
                if (rect) {
                    data.targetX = Math.round(rect.x);
                    data.targetY = Math.round(rect.y);
                }
            } catch (e) {
                // Target element access failed
            }
        }

        return data;
    }

    /**
     * Build metrics object from processed first-input data
     * @private
     * @param {Object} data - Processed first input data
     * @returns {Object} Metrics object
     */
    _buildFirstInputMetrics(data) {
        const metrics = {};

        metrics.firstInputRecorded = {
            value: true,
            description: 'Whether first user input has been recorded',
            risk: 'N/A'
        };

        metrics.firstInputEventName = {
            value: data.eventName || 'Not available',
            description: 'Type of first user input event (pointerdown, click, keydown, etc.)',
            risk: 'N/A',
            code: "performance.getEntriesByType('first-input')[0].name"
        };

        metrics.firstInputStartTime = {
            value: data.startTime ?? 'Not available',
            description: 'Time when first input occurred (ms since page load)',
            risk: this._assessFirstInputTimeRisk(data.startTime),
            code: "performance.getEntriesByType('first-input')[0].startTime"
        };

        metrics.firstInputDelay = {
            value: data.firstInputDelay ?? 'Not available',
            description: 'First Input Delay - time between input and processing start (ms)',
            risk: this._assessFirstInputDelayRisk(data.firstInputDelay),
            code: "entry.processingStart - entry.startTime"
        };

        metrics.firstInputDuration = {
            value: data.duration ?? 'Not available',
            description: 'Total duration of first input event handling (ms)',
            risk: 'N/A',
            code: "performance.getEntriesByType('first-input')[0].duration"
        };

        // Target element info (useful for bot detection - automated clicks often target specific patterns)
        if (data.targetTagName) {
            metrics.firstInputTargetTag = {
                value: data.targetTagName,
                description: 'HTML tag of first interacted element',
                risk: 'N/A'
            };
        }

        if (data.targetX !== undefined && data.targetY !== undefined) {
            metrics.firstInputTargetPosition = {
                value: `${data.targetX},${data.targetY}`,
                description: 'Position of first interacted element (x,y)',
                risk: 'N/A'
            };
        }

        // Compact format for clustering (similar to competitor implementations)
        metrics.firstInputSignature = {
            value: this._buildFirstInputSignature(data),
            description: 'Compact first-input signature for clustering',
            risk: 'N/A'
        };

        return metrics;
    }

    /**
     * Build a compact signature from first-input data
     * @private
     * @param {Object} data - First input data
     * @returns {string} Compact signature
     */
    _buildFirstInputSignature(data) {
        const parts = [
            data.recorded ? '1' : '0',
            data.eventName || '-',
            data.startTime ?? '-',
            data.firstInputDelay ?? '-'
        ];

        if (data.targetTagName) {
            parts.push(data.targetTagName);
            parts.push(data.targetX ?? '-');
            parts.push(data.targetY ?? '-');
        }

        return parts.join(',');
    }

    /**
     * Check if first-input entry type is supported
     * @private
     * @returns {boolean}
     */
    _isFirstInputSupported() {
        try {
            return PerformanceObserver?.supportedEntryTypes?.includes('first-input') ?? false;
        } catch (e) {
            return false;
        }
    }

    // =========================================================================
    // Animation Frame Analysis (Bot Detection)
    // =========================================================================

    /**
     * Start animation frame analysis asynchronously
     * Called during init() to begin collecting frame data early
     * @private
     * @returns {Promise<Object>} Promise that resolves when frame analysis is complete
     */
    _startAnimationFrameAnalysis() {
        return new Promise((resolve) => {
            if (typeof requestAnimationFrame === 'undefined') {
                this.animationFrameAnalysis = { supported: false };
                resolve(this.animationFrameAnalysis);
                return;
            }

            const frames = [];
            const maxFrames = this.config.animationFrameCount;
            let frameCount = 0;

            const recordFrame = (timestamp) => {
                frames.push({
                    index: frameCount,
                    timestamp,
                    delta: frameCount > 0 ? timestamp - frames[frameCount - 1].timestamp : 0
                });

                frameCount++;

                if (frameCount < maxFrames) {
                    requestAnimationFrame(recordFrame);
                } else {
                    // Analysis complete
                    this.animationFrameAnalysis = this._computeFrameAnalysis(frames);
                    resolve(this.animationFrameAnalysis);
                }
            };

            requestAnimationFrame(recordFrame);
        });
    }

    /**
     * Compute statistical analysis of animation frame timing
     * Bots often have unusual/consistent frame timing patterns
     * @private
     * @param {Array} frames - Collected frame data
     * @returns {Object} Frame analysis results
     */
    _computeFrameAnalysis(frames) {
        if (frames.length < 2) {
            return { frames: 0, supported: true };
        }

        const deltas = frames.slice(1).map(f => f.delta);

        // Calculate statistics
        const sum = deltas.reduce((a, b) => a + b, 0);
        const mean = sum / deltas.length;

        const squaredDiffs = deltas.map(d => Math.pow(d - mean, 2));
        const variance = squaredDiffs.reduce((a, b) => a + b, 0) / deltas.length;
        const stdDev = Math.sqrt(variance);

        const min = Math.min(...deltas);
        const max = Math.max(...deltas);

        // Sort for percentiles
        const sorted = [...deltas].sort((a, b) => a - b);
        const p50 = sorted[Math.floor(sorted.length * 0.5)];
        const p95 = sorted[Math.floor(sorted.length * 0.95)];

        return {
            supported: true,
            frames: frames.length,
            totalTime: Math.round(frames[frames.length - 1].timestamp - frames[0].timestamp),
            avgFps: Math.round((1000 / mean) * 10) / 10,
            mean: Math.round(mean * 100) / 100,
            stdDev: Math.round(stdDev * 100) / 100,
            min: Math.round(min * 100) / 100,
            max: Math.round(max * 100) / 100,
            p50: Math.round(p50 * 100) / 100,
            p95: Math.round(p95 * 100) / 100,
            // Coefficient of variation for additional insight
            coefficientOfVariation: mean > 0 ? Math.round((stdDev / mean) * 1000) / 1000 : 0
        };
    }

    /**
     * Get animation frame metrics for the result object
     * @private
     * @returns {Object} Animation frame metrics
     */
    _getAnimationFrameMetrics() {
        const metrics = {};
        const analysis = this.animationFrameAnalysis;

        if (!analysis) {
            metrics.animationFrameAnalysis = {
                value: 'Pending',
                description: 'Animation frame analysis still collecting data',
                risk: 'N/A'
            };
            return metrics;
        }

        if (!analysis.supported) {
            metrics.animationFrameSupported = {
                value: false,
                description: 'requestAnimationFrame not available',
                risk: 'N/A'
            };
            return metrics;
        }

        metrics.animationFrameCount = {
            value: analysis.frames,
            description: 'Number of animation frames analyzed',
            risk: 'N/A',
            code: 'requestAnimationFrame loop count'
        };

        metrics.animationAvgFps = {
            value: analysis.avgFps,
            description: 'Average frames per second based on frame deltas',
            risk: 'N/A',
            code: '1000 / meanFrameDelta'
        };

        metrics.animationFrameMean = {
            value: analysis.mean,
            description: 'Mean frame delta time (ms)',
            risk: 'N/A',
            code: 'average of frame deltas'
        };

        metrics.animationFrameStdDev = {
            value: analysis.stdDev,
            description: 'Standard deviation of frame timing (ms)',
            risk: 'N/A',
            code: 'Math.sqrt(variance of frame deltas)'
        };

        metrics.animationFrameMin = {
            value: analysis.min,
            description: 'Minimum frame delta (ms)',
            risk: 'N/A',
            code: 'Math.min(...frameDeltas)'
        };

        metrics.animationFrameMax = {
            value: analysis.max,
            description: 'Maximum frame delta (ms)',
            risk: 'N/A',
            code: 'Math.max(...frameDeltas)'
        };

        metrics.animationFrameP50 = {
            value: analysis.p50,
            description: 'Median (p50) frame delta (ms)',
            risk: 'N/A',
            code: 'percentile 50 of frame deltas'
        };

        metrics.animationFrameP95 = {
            value: analysis.p95,
            description: '95th percentile frame delta (ms)',
            risk: 'N/A',
            code: 'percentile 95 of frame deltas'
        };

        metrics.animationFrameCV = {
            value: analysis.coefficientOfVariation,
            description: 'Coefficient of variation (stdDev/mean) - measures relative variability',
            risk: 'N/A',
            code: 'stdDev / mean'
        };

        metrics.animationTotalTime = {
            value: analysis.totalTime,
            description: 'Total time to collect all frames (ms)',
            risk: 'N/A',
            code: 'lastTimestamp - firstTimestamp'
        };

        return metrics;
    }

    // =========================================================================
    // Execution Speed Benchmark (VM/Environment Detection)
    // =========================================================================

    /**
     * Measure JavaScript execution speed
     * Collects execution timing for different operation types - useful for environment fingerprinting
     * @private
     * @returns {Object} Execution speed metrics
     */
    _collectExecutionSpeed() {
        const metrics = {};
        const iterations = this.config.benchmarkIterations;

        try {
            const operations = [];

            // Measure math operations (sensitive to CPU differences)
            const mathStart = this._getPerfNow();
            let mathResult = 0;
            for (let i = 0; i < iterations; i++) {
                mathResult = Math.sqrt(i) * Math.sin(i);
            }
            const mathTime = this._getPerfNow() - mathStart;
            operations.push({ name: 'math', time: Math.round(mathTime * 100) / 100 });

            // Measure string operations
            const strStart = this._getPerfNow();
            let strResult = '';
            for (let i = 0; i < iterations / 10; i++) {
                strResult = 'benchmark'.repeat(10);
            }
            const strTime = this._getPerfNow() - strStart;
            operations.push({ name: 'string', time: Math.round(strTime * 100) / 100 });

            // Measure array operations
            const arrStart = this._getPerfNow();
            const arrResult = [];
            for (let i = 0; i < iterations / 10; i++) {
                arrResult.push(i);
            }
            const arrTime = this._getPerfNow() - arrStart;
            operations.push({ name: 'array', time: Math.round(arrTime * 100) / 100 });

            // Prevent dead code elimination
            void (mathResult + strResult.length + arrResult.length);

            // Calculate total and operations per millisecond
            const totalTime = operations.reduce((sum, op) => sum + op.time, 0);
            const opsPerMs = Math.round(iterations / totalTime);

            metrics.executionMathTime = {
                value: operations.find(o => o.name === 'math')?.time,
                description: 'Math operations benchmark time (ms)',
                risk: 'N/A',
                code: 'Math.sqrt/sin loop timing'
            };

            metrics.executionStringTime = {
                value: operations.find(o => o.name === 'string')?.time,
                description: 'String operations benchmark time (ms)',
                risk: 'N/A',
                code: 'String.repeat loop timing'
            };

            metrics.executionArrayTime = {
                value: operations.find(o => o.name === 'array')?.time,
                description: 'Array operations benchmark time (ms)',
                risk: 'N/A',
                code: 'Array.push loop timing'
            };

            metrics.executionOpsPerMs = {
                value: opsPerMs,
                description: 'Operations per millisecond - baseline execution speed',
                risk: 'N/A',
                code: 'iterations / totalTime'
            };

            metrics.executionTotalTime = {
                value: Math.round(totalTime * 100) / 100,
                description: 'Total benchmark execution time (ms)',
                risk: 'N/A',
                code: 'sum of all operation times'
            };

        } catch (e) {
            metrics.executionSpeedError = this._createErrorMetric(e.message);
        }

        return metrics;
    }

    // =========================================================================
    // Risk Assessment Helpers
    // =========================================================================

    /**
     * Assess risk for DOM complete timing
     * @private
     */
    _assessDomCompleteRisk(value) {
        if (value === null || value === undefined) return 'N/A';
        // Impossibly fast page load suggests automation/caching issues
        if (value < 50) return 'MEDIUM';
        return 'N/A';
    }

    /**
     * Assess risk for load event timing
     * @private
     */
    _assessLoadEventRisk(value) {
        if (value === null || value === undefined) return 'N/A';
        // Impossibly fast suggests automation
        if (value < 50) return 'MEDIUM';
        return 'N/A';
    }

    /**
     * Assess risk for first paint timing
     * @private
     */
    _assessFirstPaintRisk(value) {
        if (value === null || value === undefined) return 'N/A';
        // Very fast first paint might indicate headless/cached scenarios
        if (value < 10) return 'LOW';
        return 'N/A';
    }

    /**
     * Assess risk for FCP timing
     * @private
     */
    _assessFcpRisk(value) {
        if (value === null || value === undefined) return 'N/A';
        // Very fast FCP might indicate headless/cached scenarios
        if (value < 10) return 'LOW';
        return 'N/A';
    }

    /**
     * Assess risk for first input timing
     * @private
     */
    _assessFirstInputTimeRisk(value) {
        if (value === null || value === undefined) return 'N/A';
        // Extremely fast first input (before page fully loads) is suspicious
        if (value < 100) return 'MEDIUM';
        return 'N/A';
    }

    /**
     * Assess risk for first input delay
     * @private
     */
    _assessFirstInputDelayRisk(value) {
        if (value === null || value === undefined) return 'N/A';
        // Very low FID might indicate automation (immediate processing)
        if (value < 1) return 'LOW';
        // High FID indicates slow page but not necessarily suspicious
        return 'N/A';
    }

    /**
     * Create error metric object
     * @private
     */
    _createErrorMetric(message) {
        return {
            value: 'Error',
            description: message,
            risk: 'N/A'
        };
    }

    /**
     * Cleanup observer if active
     */
    destroy() {
        if (this.firstInputObserver) {
            this.firstInputObserver.disconnect();
            this.firstInputObserver = null;
        }
    }
}

export default PerformanceTimingDetector;
