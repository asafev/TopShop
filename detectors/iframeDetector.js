/**
 * Iframe & Cross-Realm Detector Module
 * 
 * Behavioral micro-diff detection for VM vs genuine browser identification.
 * Focuses on:
 * 1. Reproducibility tests (timing jitter, noise injection patterns)
 * 2. Cross-context coherence (top vs iframe vs worker)
 * 3. Font & text metrics differences
 * 4. Rendering stability tests
 * 5. Worker realm comparison
 * 
 * Philosophy: Coherence > raw values, Distributions > single samples
 * 
 * @module detectors/iframeDetector
 */

/**
 * Configuration for iframe/cross-realm detection
 */
export const IFRAME_DETECTOR_CONFIG = {
    // Timing probe settings
    timingProbes: {
        performanceNowSamples: 50,
        setTimeoutSamples: 30,
        rafSamples: 40,
        postMessageSamples: 25
    },
    // Font detection settings
    fontDetection: {
        testFonts: [
            'Arial', 'Helvetica', 'Times New Roman', 'Georgia', 'Verdana',
            'Courier New', 'Comic Sans MS', 'Impact', 'Trebuchet MS', 'Palatino',
            'Lucida Console', 'Tahoma', 'Segoe UI', 'Roboto', 'Ubuntu',
            'Consolas', 'Monaco', 'Menlo', 'SF Pro', 'Fira Code'
        ],
        baselineFont: 'monospace',
        testString: 'mmmmmmmmmmlli1|WMwQqOo0'
    },
    // Canvas stability settings
    canvasStability: {
        renderIterations: 3,
        pixelSampleSize: 100
    },
    // Worker settings
    enableWorkerTests: true,
    // Timeout for async operations
    asyncTimeout: 3000
};

/**
 * Statistical utilities
 */
const Stats = {
    mean: (arr) => arr.length ? arr.reduce((a, b) => a + b, 0) / arr.length : 0,
    stddev: (arr) => {
        if (arr.length < 2) return 0;
        const m = Stats.mean(arr);
        return Math.sqrt(arr.reduce((sum, x) => sum + (x - m) ** 2, 0) / (arr.length - 1));
    },
    min: (arr) => arr.length ? Math.min(...arr) : 0,
    max: (arr) => arr.length ? Math.max(...arr) : 0,
    median: (arr) => {
        if (!arr.length) return 0;
        const sorted = [...arr].sort((a, b) => a - b);
        const mid = Math.floor(sorted.length / 2);
        return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
    },
    histogram: (arr, bins = 10) => {
        if (!arr.length) return [];
        const min = Stats.min(arr);
        const max = Stats.max(arr);
        const binSize = (max - min) / bins || 1;
        const hist = new Array(bins).fill(0);
        arr.forEach(v => {
            const idx = Math.min(bins - 1, Math.floor((v - min) / binSize));
            hist[idx]++;
        });
        return hist;
    },
    summarize: (arr) => ({
        mean: Stats.mean(arr),
        stddev: Stats.stddev(arr),
        min: Stats.min(arr),
        max: Stats.max(arr),
        median: Stats.median(arr),
        count: arr.length
    })
};

/**
 * Simple hash function for strings/data
 */
function simpleHash(str) {
    let hash = 0;
    for (let i = 0; i < str.length; i++) {
        const char = str.charCodeAt(i);
        hash = ((hash << 5) - hash) + char;
        hash = hash & hash;
    }
    return hash >>> 0;
}

/**
 * Iframe & Cross-Realm Detector Class
 */
export class IframeDetector {
    constructor(config = {}) {
        this.config = { ...IFRAME_DETECTOR_CONFIG, ...config };
        this.iframe = null;
        this.iframeWindow = null;
        this.worker = null;
    }

    /**
     * Main detection entry point
     * @returns {Promise<Object>} Formatted detection metrics
     */
    async detect() {
        const startTime = performance.now();
        
        try {
            // Phase 1: Create iframe and wait for it properly
            await this.createIframe();
            
            // Phase 2: Run all tests in parallel where possible
            const [
                timingResults,
                coherenceResults,
                fontResults,
                canvasResults,
                workerResults
            ] = await Promise.all([
                this.runTimingProbes(),
                this.runCoherenceChecks(),
                this.runFontDetection(),
                this.runCanvasStability(),
                this.config.enableWorkerTests ? this.runWorkerComparison() : Promise.resolve(null)
            ]);

            // Cleanup
            this.cleanup();

            const collectionTime = Math.round(performance.now() - startTime);

            // Format as metrics
            return this._formatMetrics({
                timing: timingResults,
                coherence: coherenceResults,
                fonts: fontResults,
                canvas: canvasResults,
                worker: workerResults
            }, collectionTime);
            
        } catch (error) {
            this.cleanup();
            return {
                error: {
                    value: error.message,
                    description: 'Cross-realm analysis error',
                    risk: 'N/A'
                },
                collectionTimeMs: {
                    value: Math.round(performance.now() - startTime),
                    description: 'Detection duration (ms)',
                    risk: 'N/A'
                }
            };
        }
    }

    // =========================================================================
    // SECTION 1: IFRAME CREATION (proper wait, no fixed sleep)
    // =========================================================================

    /**
     * Create iframe and wait for it to be ready properly
     */
    async createIframe() {
        return new Promise((resolve, reject) => {
            const timeout = setTimeout(() => {
                reject(new Error('Iframe creation timeout'));
            }, this.config.asyncTimeout);

            this.iframe = document.createElement('iframe');
            this.iframe.style.cssText = 'position:absolute;width:1px;height:1px;left:-9999px;visibility:hidden;';
            
            // Use onload instead of fixed sleep
            this.iframe.onload = () => {
                clearTimeout(timeout);
                this.iframeWindow = this.iframe.contentWindow;
                if (this.iframeWindow) {
                    resolve();
                } else {
                    reject(new Error('Iframe contentWindow not available'));
                }
            };

            this.iframe.onerror = () => {
                clearTimeout(timeout);
                reject(new Error('Iframe load error'));
            };

            document.body.appendChild(this.iframe);
            
            // For about:blank, onload fires immediately in most browsers
            // But we also poll as backup
            const pollInterval = setInterval(() => {
                if (this.iframe.contentWindow && this.iframe.contentDocument?.readyState === 'complete') {
                    clearInterval(pollInterval);
                    clearTimeout(timeout);
                    this.iframeWindow = this.iframe.contentWindow;
                    resolve();
                }
            }, 10);
        });
    }

    // =========================================================================
    // SECTION 2: TIMING PROBES (Jitter distributions)
    // =========================================================================

    /**
     * Run timing reproducibility tests
     * VMs and remote-rendered Chromium show different jitter patterns
     */
    async runTimingProbes() {
        const results = {
            performanceNow: { top: null, iframe: null },
            setTimeout: { top: null, iframe: null },
            raf: { top: null, iframe: null },
            postMessage: { top: null, iframe: null }
        };

        try {
            // Run probes in both contexts
            const [topTiming, iframeTiming] = await Promise.all([
                this._collectTimingInContext(window, 'top'),
                this._collectTimingInContext(this.iframeWindow, 'iframe')
            ]);

            results.performanceNow.top = topTiming.performanceNow;
            results.performanceNow.iframe = iframeTiming.performanceNow;
            results.setTimeout.top = topTiming.setTimeout;
            results.setTimeout.iframe = iframeTiming.setTimeout;
            results.raf.top = topTiming.raf;
            results.raf.iframe = iframeTiming.raf;
            results.postMessage.top = topTiming.postMessage;
            results.postMessage.iframe = iframeTiming.postMessage;

        } catch (error) {
            results.error = error.message;
        }

        return results;
    }

    /**
     * Collect timing samples in a given context (window or iframe)
     */
    async _collectTimingInContext(ctx, label) {
        const results = {
            performanceNow: null,
            setTimeout: null,
            raf: null,
            postMessage: null
        };

        if (!ctx) return results;

        try {
            // 1. performance.now() granularity and jitter
            results.performanceNow = this._probePerformanceNow(ctx);

            // 2. setTimeout(0) latency distribution
            results.setTimeout = await this._probeSetTimeout(ctx);

            // 3. requestAnimationFrame cadence distribution
            results.raf = await this._probeRAF(ctx);

            // 4. postMessage round-trip latency
            results.postMessage = await this._probePostMessage(ctx);

        } catch (error) {
            results.error = error.message;
        }

        return results;
    }

    /**
     * Probe performance.now() step/granularity
     */
    _probePerformanceNow(ctx) {
        const samples = [];
        const deltas = [];
        const config = this.config.timingProbes;

        try {
            let prev = ctx.performance.now();
            for (let i = 0; i < config.performanceNowSamples; i++) {
                const now = ctx.performance.now();
                samples.push(now);
                if (now !== prev) {
                    deltas.push(now - prev);
                }
                prev = now;
                // Busy wait to get different samples
                let j = 0;
                while (j++ < 1000);
            }

            return {
                ...Stats.summarize(deltas),
                histogram: Stats.histogram(deltas, 8),
                uniqueValues: new Set(samples).size,
                totalSamples: samples.length
            };
        } catch (e) {
            return { error: e.message };
        }
    }

    /**
     * Probe setTimeout(0) latency
     */
    async _probeSetTimeout(ctx) {
        const samples = [];
        const config = this.config.timingProbes;

        try {
            for (let i = 0; i < config.setTimeoutSamples; i++) {
                const start = ctx.performance.now();
                await new Promise(resolve => ctx.setTimeout(resolve, 0));
                samples.push(ctx.performance.now() - start);
            }

            return {
                ...Stats.summarize(samples),
                histogram: Stats.histogram(samples, 8)
            };
        } catch (e) {
            return { error: e.message };
        }
    }

    /**
     * Probe requestAnimationFrame cadence
     */
    async _probeRAF(ctx) {
        const timestamps = [];
        const config = this.config.timingProbes;

        if (!ctx.requestAnimationFrame) {
            return { error: 'RAF not available' };
        }

        try {
            await new Promise((resolve) => {
                let count = 0;
                const collect = (ts) => {
                    timestamps.push(ts);
                    if (++count < config.rafSamples) {
                        ctx.requestAnimationFrame(collect);
                    } else {
                        resolve();
                    }
                };
                ctx.requestAnimationFrame(collect);
            });

            // Calculate frame deltas
            const deltas = [];
            for (let i = 1; i < timestamps.length; i++) {
                deltas.push(timestamps[i] - timestamps[i - 1]);
            }

            return {
                ...Stats.summarize(deltas),
                histogram: Stats.histogram(deltas, 8),
                estimatedFPS: deltas.length ? 1000 / Stats.mean(deltas) : 0
            };
        } catch (e) {
            return { error: e.message };
        }
    }

    /**
     * Probe postMessage round-trip latency
     */
    async _probePostMessage(ctx) {
        const samples = [];
        const config = this.config.timingProbes;

        try {
            for (let i = 0; i < config.postMessageSamples; i++) {
                const start = performance.now();
                await new Promise(resolve => {
                    const handler = () => {
                        window.removeEventListener('message', handler);
                        resolve();
                    };
                    window.addEventListener('message', handler);
                    ctx.postMessage('ping', '*');
                });
                samples.push(performance.now() - start);
            }

            return {
                ...Stats.summarize(samples),
                histogram: Stats.histogram(samples, 8)
            };
        } catch (e) {
            return { error: e.message };
        }
    }

    // =========================================================================
    // SECTION 3: CROSS-CONTEXT COHERENCE
    // =========================================================================

    /**
     * Run coherence checks between top, iframe, and worker
     * VMs frequently have mismatches between contexts
     */
    async runCoherenceChecks() {
        const results = {
            hardwareConcurrency: {},
            deviceMemory: {},
            timezone: {},
            locale: {},
            screen: {},
            webglVendor: {},
            canvasHash: {},
            coherenceScore: 0,
            mismatches: []
        };

        try {
            // Collect from top window
            const topData = this._collectCoherenceData(window);
            
            // Collect from iframe
            const iframeData = this._collectCoherenceData(this.iframeWindow);

            // Compare each metric
            const comparisons = [
                { key: 'hardwareConcurrency', top: topData.hardwareConcurrency, iframe: iframeData.hardwareConcurrency },
                { key: 'deviceMemory', top: topData.deviceMemory, iframe: iframeData.deviceMemory },
                { key: 'timezone', top: topData.timezone, iframe: iframeData.timezone },
                { key: 'locale', top: topData.locale, iframe: iframeData.locale },
                { key: 'screenWidth', top: topData.screen?.width, iframe: iframeData.screen?.width },
                { key: 'screenHeight', top: topData.screen?.height, iframe: iframeData.screen?.height },
                { key: 'dpr', top: topData.dpr, iframe: iframeData.dpr },
                { key: 'webglVendor', top: topData.webglVendor, iframe: iframeData.webglVendor },
                { key: 'webglRenderer', top: topData.webglRenderer, iframe: iframeData.webglRenderer }
            ];

            let matches = 0;
            let total = 0;

            for (const comp of comparisons) {
                const match = comp.top === comp.iframe;
                results[comp.key] = {
                    top: comp.top,
                    iframe: comp.iframe,
                    match
                };
                if (comp.top !== undefined && comp.iframe !== undefined) {
                    total++;
                    if (match) matches++;
                    else results.mismatches.push(comp.key);
                }
            }

            // Canvas hash comparison
            const topCanvasHash = this._getCanvasHash(window);
            const iframeCanvasHash = this._getCanvasHash(this.iframeWindow);
            results.canvasHash = {
                top: topCanvasHash,
                iframe: iframeCanvasHash,
                match: topCanvasHash === iframeCanvasHash
            };
            if (topCanvasHash && iframeCanvasHash) {
                total++;
                if (topCanvasHash === iframeCanvasHash) matches++;
                else results.mismatches.push('canvasHash');
            }

            results.coherenceScore = total ? Math.round((matches / total) * 100) : 100;

        } catch (error) {
            results.error = error.message;
        }

        return results;
    }

    /**
     * Collect coherence data from a context
     */
    _collectCoherenceData(ctx) {
        if (!ctx) return {};

        const data = {};

        try {
            data.hardwareConcurrency = ctx.navigator?.hardwareConcurrency;
            data.deviceMemory = ctx.navigator?.deviceMemory;
            data.dpr = ctx.devicePixelRatio;

            // Intl data
            try {
                const dtf = new ctx.Intl.DateTimeFormat();
                const resolved = dtf.resolvedOptions();
                data.timezone = resolved.timeZone;
                data.locale = resolved.locale;
            } catch (e) {
                data.timezone = 'error';
                data.locale = 'error';
            }

            // Screen data
            data.screen = {
                width: ctx.screen?.width,
                height: ctx.screen?.height,
                availWidth: ctx.screen?.availWidth,
                availHeight: ctx.screen?.availHeight
            };

            // WebGL data
            try {
                const canvas = ctx.document.createElement('canvas');
                const gl = canvas.getContext('webgl') || canvas.getContext('experimental-webgl');
                if (gl) {
                    const debugInfo = gl.getExtension('WEBGL_debug_renderer_info');
                    if (debugInfo) {
                        data.webglVendor = gl.getParameter(debugInfo.UNMASKED_VENDOR_WEBGL);
                        data.webglRenderer = gl.getParameter(debugInfo.UNMASKED_RENDERER_WEBGL);
                    }
                }
            } catch (e) {
                data.webglVendor = 'error';
                data.webglRenderer = 'error';
            }

        } catch (error) {
            data.error = error.message;
        }

        return data;
    }

    /**
     * Get canvas fingerprint hash
     */
    _getCanvasHash(ctx) {
        if (!ctx) return null;

        try {
            const canvas = ctx.document.createElement('canvas');
            canvas.width = 200;
            canvas.height = 50;
            const context = canvas.getContext('2d');
            
            // Draw test pattern
            context.textBaseline = 'top';
            context.font = '14px Arial';
            context.fillStyle = '#f60';
            context.fillRect(0, 0, 200, 50);
            context.fillStyle = '#069';
            context.fillText('Cwm fjord veg balks', 2, 15);
            context.fillStyle = 'rgba(102, 204, 0, 0.7)';
            context.fillText('xyz !@#$%', 4, 30);

            return simpleHash(canvas.toDataURL());
        } catch (e) {
            return null;
        }
    }

    // =========================================================================
    // SECTION 4: FONT DETECTION
    // =========================================================================

    /**
     * Run font and text metrics detection
     * VM images differ in font availability and rasterization
     */
    async runFontDetection() {
        const results = {
            topFonts: {},
            iframeFonts: {},
            fontCoherence: true,
            detectedFonts: [],
            metricsHash: { top: 0, iframe: 0 }
        };

        try {
            const topFonts = this._detectFonts(window);
            const iframeFonts = this._detectFonts(this.iframeWindow);

            results.topFonts = topFonts;
            results.iframeFonts = iframeFonts;

            // Check coherence
            results.fontCoherence = topFonts.hash === iframeFonts.hash;
            results.detectedFonts = topFonts.detected || [];
            results.metricsHash.top = topFonts.hash;
            results.metricsHash.iframe = iframeFonts.hash;

            // Subpixel difference detection
            results.subpixelDiff = Math.abs((topFonts.totalWidth || 0) - (iframeFonts.totalWidth || 0));

        } catch (error) {
            results.error = error.message;
        }

        return results;
    }

    /**
     * Detect fonts by measuring text widths
     */
    _detectFonts(ctx) {
        if (!ctx) return { error: 'Context not available' };

        const config = this.config.fontDetection;
        const detected = [];
        const widths = {};
        let totalWidth = 0;

        try {
            const canvas = ctx.document.createElement('canvas');
            const context = canvas.getContext('2d');
            context.font = `72px ${config.baselineFont}`;
            const baselineWidth = context.measureText(config.testString).width;

            for (const font of config.testFonts) {
                context.font = `72px "${font}", ${config.baselineFont}`;
                const width = context.measureText(config.testString).width;
                widths[font] = width;
                totalWidth += width;

                // If width differs from baseline, font is likely installed
                if (Math.abs(width - baselineWidth) > 0.1) {
                    detected.push(font);
                }
            }

            return {
                detected,
                widths,
                totalWidth,
                hash: simpleHash(JSON.stringify(widths)),
                baselineWidth
            };
        } catch (e) {
            return { error: e.message };
        }
    }

    // =========================================================================
    // SECTION 5: CANVAS STABILITY
    // =========================================================================

    /**
     * Run canvas re-render stability tests
     * Checks if rendering is deterministic
     */
    async runCanvasStability() {
        const results = {
            topStability: null,
            iframeStability: null,
            coherent: true
        };

        try {
            results.topStability = this._testCanvasStability(window);
            results.iframeStability = this._testCanvasStability(this.iframeWindow);
            
            // Check if both contexts produce same results
            results.coherent = results.topStability?.hash === results.iframeStability?.hash;
            results.topHash = results.topStability?.hash;
            results.iframeHash = results.iframeStability?.hash;

        } catch (error) {
            results.error = error.message;
        }

        return results;
    }

    /**
     * Test canvas rendering stability in a context
     */
    _testCanvasStability(ctx) {
        if (!ctx) return { error: 'Context not available' };

        const config = this.config.canvasStability;
        const hashes = [];

        try {
            for (let i = 0; i < config.renderIterations; i++) {
                const canvas = ctx.document.createElement('canvas');
                canvas.width = 100;
                canvas.height = 30;
                const context = canvas.getContext('2d');

                // Render deterministic pattern
                context.fillStyle = '#ff6600';
                context.fillRect(0, 0, 100, 30);
                context.fillStyle = '#0066ff';
                context.beginPath();
                context.arc(50, 15, 10, 0, Math.PI * 2);
                context.fill();
                context.font = '10px Arial';
                context.fillStyle = '#000';
                context.fillText('test123', 5, 20);

                hashes.push(simpleHash(canvas.toDataURL()));
            }

            const allSame = hashes.every(h => h === hashes[0]);
            return {
                stable: allSame,
                hash: hashes[0],
                iterations: hashes.length,
                uniqueHashes: new Set(hashes).size
            };
        } catch (e) {
            return { error: e.message };
        }
    }

    // =========================================================================
    // SECTION 6: WORKER COMPARISON
    // =========================================================================

    /**
     * Run worker realm comparison
     * Many stealth stacks patch window but forget workers
     */
    async runWorkerComparison() {
        const results = {
            available: false,
            workerData: null,
            coherence: {},
            mismatches: []
        };

        try {
            // Create inline worker
            const workerCode = `
                self.onmessage = function(e) {
                    const data = {
                        hardwareConcurrency: navigator.hardwareConcurrency,
                        deviceMemory: navigator.deviceMemory,
                        userAgent: navigator.userAgent,
                        platform: navigator.platform,
                        language: navigator.language,
                        languages: navigator.languages ? [...navigator.languages] : [],
                        timing: []
                    };

                    // Timing probe in worker
                    const samples = [];
                    let prev = performance.now();
                    for (let i = 0; i < 50; i++) {
                        const now = performance.now();
                        if (now !== prev) samples.push(now - prev);
                        prev = now;
                        let j = 0; while (j++ < 1000);
                    }
                    data.timingMean = samples.length ? samples.reduce((a,b) => a+b, 0) / samples.length : 0;
                    data.timingStddev = samples.length > 1 ? Math.sqrt(samples.reduce((sum, x) => sum + (x - data.timingMean) ** 2, 0) / (samples.length - 1)) : 0;

                    // Crypto subtle availability
                    data.hasCryptoSubtle = typeof crypto !== 'undefined' && !!crypto.subtle;

                    // WASM availability
                    data.hasWasm = typeof WebAssembly !== 'undefined';

                    self.postMessage(data);
                };
            `;

            const blob = new Blob([workerCode], { type: 'text/javascript' });
            const workerUrl = URL.createObjectURL(blob);

            const workerData = await new Promise((resolve, reject) => {
                const timeout = setTimeout(() => reject(new Error('Worker timeout')), 2000);
                
                try {
                    this.worker = new Worker(workerUrl);
                    this.worker.onmessage = (e) => {
                        clearTimeout(timeout);
                        resolve(e.data);
                    };
                    this.worker.onerror = (e) => {
                        clearTimeout(timeout);
                        reject(new Error(e.message || 'Worker error'));
                    };
                    this.worker.postMessage('start');
                } catch (e) {
                    clearTimeout(timeout);
                    reject(e);
                }
            });

            URL.revokeObjectURL(workerUrl);
            results.available = true;
            results.workerData = workerData;

            // Compare with main window
            const mainData = {
                hardwareConcurrency: navigator.hardwareConcurrency,
                deviceMemory: navigator.deviceMemory,
                userAgent: navigator.userAgent,
                platform: navigator.platform,
                language: navigator.language
            };

            // Check coherence
            const checks = ['hardwareConcurrency', 'deviceMemory', 'userAgent', 'platform', 'language'];
            for (const key of checks) {
                const match = mainData[key] === workerData[key];
                results.coherence[key] = { main: mainData[key], worker: workerData[key], match };
                if (!match) results.mismatches.push(key);
            }

            results.coherenceScore = Math.round(((checks.length - results.mismatches.length) / checks.length) * 100);

        } catch (error) {
            results.error = error.message;
        }

        return results;
    }

    // =========================================================================
    // SECTION 7: CLEANUP & FORMATTING
    // =========================================================================

    /**
     * Cleanup resources
     */
    cleanup() {
        if (this.iframe) {
            try {
                this.iframe.remove();
            } catch (e) {}
            this.iframe = null;
            this.iframeWindow = null;
        }
        if (this.worker) {
            try {
                this.worker.terminate();
            } catch (e) {}
            this.worker = null;
        }
    }

    /**
     * Format results as metrics with value/description/risk
     * NOTE: For timing metrics, we store both raw (number) and formatted (string) values
     * Raw values preserve precision for analysis/signatures, formatted for UI display
     */
    _formatMetrics(results, collectionTimeMs) {
        const metrics = {};

        // Helper to get raw number or null
        const getRaw = (val) => (typeof val === 'number' && !isNaN(val)) ? val : null;

        // === TIMING METRICS ===
        // Store both raw (for analysis) and formatted (for display) values
        if (results.timing) {
            // Performance.now jitter - raw values
            const perfNowTopStddev = getRaw(results.timing.performanceNow?.top?.stddev);
            const perfNowIframeStddev = getRaw(results.timing.performanceNow?.iframe?.stddev);
            const perfNowTopMin = getRaw(results.timing.performanceNow?.top?.min);

            metrics.perfNowJitterTopRaw = {
                value: perfNowTopStddev,
                description: 'performance.now() jitter (stddev) in main window - raw',
                risk: 'N/A'
            };
            metrics.perfNowJitterTop = {
                value: perfNowTopStddev?.toFixed(4) ?? 'N/A',
                description: 'performance.now() jitter (stddev) in main window',
                risk: 'N/A'
            };
            metrics.perfNowJitterIframeRaw = {
                value: perfNowIframeStddev,
                description: 'performance.now() jitter (stddev) in iframe - raw',
                risk: 'N/A'
            };
            metrics.perfNowJitterIframe = {
                value: perfNowIframeStddev?.toFixed(4) ?? 'N/A',
                description: 'performance.now() jitter (stddev) in iframe',
                risk: 'N/A'
            };
            metrics.perfNowGranularityTopRaw = {
                value: perfNowTopMin,
                description: 'performance.now() minimum step in main window - raw',
                risk: 'N/A'
            };
            metrics.perfNowGranularityTop = {
                value: perfNowTopMin?.toFixed(4) ?? 'N/A',
                description: 'performance.now() minimum step in main window',
                risk: 'N/A'
            };

            // setTimeout latency - raw values
            const setTimeoutTopMean = getRaw(results.timing.setTimeout?.top?.mean);
            const setTimeoutIframeMean = getRaw(results.timing.setTimeout?.iframe?.mean);
            const setTimeoutTopStddev = getRaw(results.timing.setTimeout?.top?.stddev);
            const setTimeoutIframeStddev = getRaw(results.timing.setTimeout?.iframe?.stddev);

            metrics.setTimeoutMeanTopRaw = {
                value: setTimeoutTopMean,
                description: 'setTimeout(0) mean latency (ms) in main window - raw',
                risk: 'N/A'
            };
            metrics.setTimeoutMeanTop = {
                value: setTimeoutTopMean?.toFixed(2) ?? 'N/A',
                description: 'setTimeout(0) mean latency (ms) in main window',
                risk: 'N/A'
            };
            metrics.setTimeoutMeanIframeRaw = {
                value: setTimeoutIframeMean,
                description: 'setTimeout(0) mean latency (ms) in iframe - raw',
                risk: 'N/A'
            };
            metrics.setTimeoutMeanIframe = {
                value: setTimeoutIframeMean?.toFixed(2) ?? 'N/A',
                description: 'setTimeout(0) mean latency (ms) in iframe',
                risk: 'N/A'
            };
            metrics.setTimeoutStddevTopRaw = {
                value: setTimeoutTopStddev,
                description: 'setTimeout(0) stddev latency (ms) in main window - raw',
                risk: 'N/A'
            };
            metrics.setTimeoutStddevIframeRaw = {
                value: setTimeoutIframeStddev,
                description: 'setTimeout(0) stddev latency (ms) in iframe - raw',
                risk: 'N/A'
            };

            // RAF cadence - raw values
            const rafTopFPS = getRaw(results.timing.raf?.top?.estimatedFPS);
            const rafIframeFPS = getRaw(results.timing.raf?.iframe?.estimatedFPS);
            const rafTopStddev = getRaw(results.timing.raf?.top?.stddev);
            const rafIframeStddev = getRaw(results.timing.raf?.iframe?.stddev);
            const rafTopMean = getRaw(results.timing.raf?.top?.mean);
            const rafIframeMean = getRaw(results.timing.raf?.iframe?.mean);

            metrics.rafFPSTopRaw = {
                value: rafTopFPS,
                description: 'Estimated FPS from RAF cadence in main window - raw',
                risk: 'N/A'
            };
            metrics.rafFPSTop = {
                value: rafTopFPS?.toFixed(1) ?? 'N/A',
                description: 'Estimated FPS from RAF cadence in main window',
                risk: 'N/A'
            };
            metrics.rafFPSIframeRaw = {
                value: rafIframeFPS,
                description: 'Estimated FPS from RAF cadence in iframe - raw',
                risk: 'N/A'
            };
            metrics.rafFPSIframe = {
                value: rafIframeFPS?.toFixed(1) ?? 'N/A',
                description: 'Estimated FPS from RAF cadence in iframe',
                risk: 'N/A'
            };
            metrics.rafJitterTopRaw = {
                value: rafTopStddev,
                description: 'RAF frame time jitter (stddev ms) in main window - raw',
                risk: 'N/A'
            };
            metrics.rafJitterTop = {
                value: rafTopStddev?.toFixed(2) ?? 'N/A',
                description: 'RAF frame time jitter (stddev ms) in main window',
                risk: 'N/A'
            };
            metrics.rafJitterIframeRaw = {
                value: rafIframeStddev,
                description: 'RAF frame time jitter (stddev ms) in iframe - raw',
                risk: 'N/A'
            };
            metrics.rafMeanTopRaw = {
                value: rafTopMean,
                description: 'RAF mean frame time (ms) in main window - raw',
                risk: 'N/A'
            };
            metrics.rafMeanIframeRaw = {
                value: rafIframeMean,
                description: 'RAF mean frame time (ms) in iframe - raw',
                risk: 'N/A'
            };

            // PostMessage latency - raw values
            const postMessageTopMean = getRaw(results.timing.postMessage?.top?.mean);
            const postMessageTopStddev = getRaw(results.timing.postMessage?.top?.stddev);

            metrics.postMessageMeanRaw = {
                value: postMessageTopMean,
                description: 'postMessage round-trip mean latency (ms) - raw',
                risk: 'N/A'
            };
            metrics.postMessageMean = {
                value: postMessageTopMean?.toFixed(3) ?? 'N/A',
                description: 'postMessage round-trip mean latency (ms)',
                risk: 'N/A'
            };
            metrics.postMessageStddevRaw = {
                value: postMessageTopStddev,
                description: 'postMessage round-trip stddev latency (ms) - raw',
                risk: 'N/A'
            };

            // Store histograms for advanced analysis
            metrics.perfNowHistogramTop = {
                value: results.timing.performanceNow?.top?.histogram ?? [],
                description: 'performance.now() jitter histogram (top)',
                risk: 'N/A'
            };
            metrics.rafHistogramTop = {
                value: results.timing.raf?.top?.histogram ?? [],
                description: 'RAF cadence histogram (top)',
                risk: 'N/A'
            };
            metrics.setTimeoutHistogramTop = {
                value: results.timing.setTimeout?.top?.histogram ?? [],
                description: 'setTimeout latency histogram (top)',
                risk: 'N/A'
            };
        }

        // === COHERENCE METRICS ===
        if (results.coherence) {
            metrics.coherenceScore = {
                value: results.coherence.coherenceScore ?? 100,
                description: 'Cross-context coherence score (0-100, higher is more coherent)',
                risk: (results.coherence.coherenceScore || 100) < 80 ? 'Medium' : 'N/A'
            };
            metrics.coherenceMismatches = {
                value: results.coherence.mismatches?.length > 0 ? results.coherence.mismatches : 'none',
                description: 'Properties that differ between top window and iframe',
                risk: results.coherence.mismatches?.length > 2 ? 'High' : 
                      results.coherence.mismatches?.length > 0 ? 'Medium' : 'N/A'
            };
            metrics.canvasHashMatch = {
                value: results.coherence.canvasHash?.match ?? 'unknown',
                description: 'Canvas fingerprint matches between top and iframe',
                risk: results.coherence.canvasHash?.match === false ? 'High' : 'N/A'
            };
            metrics.webglVendorMatch = {
                value: results.coherence.webglVendor?.match ?? 'unknown',
                description: 'WebGL vendor matches between top and iframe',
                risk: results.coherence.webglVendor?.match === false ? 'High' : 'N/A'
            };
            metrics.webglRendererMatch = {
                value: results.coherence.webglRenderer?.match ?? 'unknown',
                description: 'WebGL renderer matches between top and iframe',
                risk: results.coherence.webglRenderer?.match === false ? 'High' : 'N/A'
            };
        }

        // === FONT METRICS ===
        if (results.fonts) {
            metrics.detectedFontsCount = {
                value: results.fonts.detectedFonts?.length ?? 0,
                description: 'Number of detected system fonts',
                risk: 'N/A'
            };
            metrics.fontCoherence = {
                value: results.fonts.fontCoherence ?? 'unknown',
                description: 'Font metrics match between top and iframe',
                risk: results.fonts.fontCoherence === false ? 'Medium' : 'N/A'
            };
            metrics.fontMetricsHashTop = {
                value: results.fonts.metricsHash?.top ?? 0,
                description: 'Font metrics hash in main window',
                risk: 'N/A'
            };
            metrics.fontMetricsHashIframe = {
                value: results.fonts.metricsHash?.iframe ?? 0,
                description: 'Font metrics hash in iframe',
                risk: 'N/A'
            };
            
            // Subpixel diff - raw for analysis
            const subpixelDiffVal = results.fonts.subpixelDiff;
            metrics.subpixelDiffRaw = {
                value: typeof subpixelDiffVal === 'number' ? subpixelDiffVal : null,
                description: 'Subpixel width difference between contexts - raw',
                risk: 'N/A'
            };
            metrics.subpixelDiff = {
                value: typeof subpixelDiffVal === 'number' ? subpixelDiffVal.toFixed(2) : '0',
                description: 'Subpixel width difference between contexts',
                risk: (subpixelDiffVal || 0) > 1 ? 'Low' : 'N/A'
            };
            
            // Store detected fonts list for analysis
            metrics.detectedFonts = {
                value: results.fonts.detectedFonts ?? [],
                description: 'List of detected system fonts',
                risk: 'N/A'
            };
        }

        // === CANVAS STABILITY METRICS ===
        if (results.canvas) {
            metrics.canvasStableTop = {
                value: results.canvas.topStability?.stable ?? 'unknown',
                description: 'Canvas rendering is deterministic in main window',
                risk: results.canvas.topStability?.stable === false ? 'Medium' : 'N/A'
            };
            metrics.canvasStableIframe = {
                value: results.canvas.iframeStability?.stable ?? 'unknown',
                description: 'Canvas rendering is deterministic in iframe',
                risk: results.canvas.iframeStability?.stable === false ? 'Medium' : 'N/A'
            };
            metrics.canvasCoherent = {
                value: results.canvas.coherent ?? 'unknown',
                description: 'Canvas hash matches between top and iframe',
                risk: results.canvas.coherent === false ? 'High' : 'N/A'
            };
        }

        // === WORKER METRICS ===
        if (results.worker) {
            metrics.workerAvailable = {
                value: results.worker.available ?? false,
                description: 'Web Worker realm accessible for comparison',
                risk: 'N/A'
            };
            if (results.worker.available) {
                metrics.workerCoherenceScore = {
                    value: results.worker.coherenceScore ?? 100,
                    description: 'Worker-to-main coherence score (0-100)',
                    risk: (results.worker.coherenceScore || 100) < 80 ? 'High' : 'N/A'
                };
                metrics.workerMismatches = {
                    value: results.worker.mismatches?.length > 0 ? results.worker.mismatches : 'none',
                    description: 'Properties that differ between main window and worker',
                    risk: results.worker.mismatches?.length > 0 ? 'High' : 'N/A'
                };
                
                // Worker timing - raw values for analysis
                const workerTimingMean = results.worker.workerData?.timingMean;
                const workerTimingStddev = results.worker.workerData?.timingStddev;
                
                metrics.workerTimingMeanRaw = {
                    value: typeof workerTimingMean === 'number' ? workerTimingMean : null,
                    description: 'performance.now() mean step in worker - raw',
                    risk: 'N/A'
                };
                metrics.workerTimingMean = {
                    value: typeof workerTimingMean === 'number' ? workerTimingMean.toFixed(4) : 'N/A',
                    description: 'performance.now() mean step in worker',
                    risk: 'N/A'
                };
                metrics.workerTimingStddevRaw = {
                    value: typeof workerTimingStddev === 'number' ? workerTimingStddev : null,
                    description: 'performance.now() stddev step in worker - raw',
                    risk: 'N/A'
                };
                
                metrics.workerHasCryptoSubtle = {
                    value: results.worker.workerData?.hasCryptoSubtle ?? false,
                    description: 'Worker has crypto.subtle API',
                    risk: 'N/A'
                };
                metrics.workerHasWasm = {
                    value: results.worker.workerData?.hasWasm ?? false,
                    description: 'Worker has WebAssembly support',
                    risk: 'N/A'
                };
            }
        }

        // === OVERALL ASSESSMENT ===
        const totalMismatches = (results.coherence?.mismatches?.length || 0) + 
                                (results.worker?.mismatches?.length || 0);
        const canvasCoherent = results.canvas?.coherent !== false;
        const fontCoherent = results.fonts?.fontCoherence !== false;

        let overallRisk = 'N/A';
        if (totalMismatches > 3 || !canvasCoherent) overallRisk = 'High';
        else if (totalMismatches > 0 || !fontCoherent) overallRisk = 'Medium';
        else if (results.worker?.available && results.worker?.coherenceScore < 100) overallRisk = 'Low';

        metrics.overallAssessment = {
            value: overallRisk === 'N/A' ? 'Coherent' : `${totalMismatches} mismatches detected`,
            description: 'Overall cross-realm coherence assessment',
            risk: overallRisk
        };

        metrics.collectionTimeMs = {
            value: collectionTimeMs,
            description: 'Total collection time (ms)',
            risk: 'N/A'
        };

        // Store raw results for research
        metrics._rawResults = {
            value: results,
            description: 'Raw detection data for advanced analysis',
            risk: 'N/A'
        };

        return metrics;
    }
}

/**
 * Convenience function for quick detection
 * @returns {Promise<Object>} Detection results
 */
export async function detectIframeAnomalies() {
    const detector = new IframeDetector();
    return detector.detect();
}

// Default export
export default IframeDetector;
