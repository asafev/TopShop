/**
 * Worker Signals Detector Module
 * Collects worker-scope fingerprint signals and compares with main window
 * Inspired by CreepJS src/worker/index.ts
 *
 * @module detectors/workerSignals
 * @see https://github.com/abrahamjuliot/creepjs/tree/master/src/worker
 */

import { fnv1a32 } from './audioFingerprint.js';
import { normalizeLocale } from './languageDetector.js';

const WORKER_CONFIG = {
    // Aggressive timeouts - workers respond in <100ms on modern browsers
    dedicatedTimeoutMs: 300,
    // Skip shared worker (causes FPs and adds latency)
    skipSharedWorker: true
};

function normalizeList(list) {
    if (!Array.isArray(list)) return [];
    const normalized = list.map(normalizeLocale).filter(Boolean);
    const seen = new Set();
    return normalized.filter((entry) => {
        if (seen.has(entry)) return false;
        seen.add(entry);
        return true;
    });
}

function normalizeString(value) {
    if (value === null || value === undefined) return null;
    const str = String(value).trim();
    return str ? str : null;
}

function stableProfileString(profile) {
    const keys = Object.keys(profile).sort();
    return keys.map((key) => {
        const value = profile[key];
        if (Array.isArray(value)) {
            return `${key}:[${value.join(',')}]`;
        }
        return `${key}:${value === null || value === undefined ? 'null' : String(value)}`;
    }).join('|');
}

function getWebglBasicFromCanvas(canvas) {
    try {
        const gl = canvas.getContext('webgl');
        if (!gl) return null;
        return {
            webglVendor: gl.getParameter(gl.VENDOR),
            webglRenderer: gl.getParameter(gl.RENDERER)
        };
    } catch (error) {
        return { error: error.message || 'webgl-error' };
    }
}

class WorkerSignalsDetector {
    constructor(config = {}) {
        this.config = { ...WORKER_CONFIG, ...config };
        this.metrics = {};
        this.result = null;
        // Timing breakdown for performance analysis
        this.timings = {};
    }

    _markTime(label) {
        this.timings[label] = performance.now();
    }

    _measureTime(startLabel, endLabel) {
        const start = this.timings[startLabel];
        const end = this.timings[endLabel];
        if (start !== undefined && end !== undefined) {
            return Math.round((end - start) * 100) / 100;
        }
        return null;
    }

    async analyze() {
        this._markTime('analyze_start');
        const result = await this.collect();
        this._markTime('analyze_end');
        this.result = result;
        this.metrics = this._formatMetrics(result);
        return this.metrics;
    }

    async collect() {
        this._markTime('collect_start');

        // Measure window profile collection
        this._markTime('windowProfile_start');
        const windowProfile = this._getWindowProfile();
        this._markTime('windowProfile_end');

        // Test Web Worker capability first (without creating actual worker)
        this._markTime('capabilityTest_start');
        const workerCapability = this._testWebWorkerCapability();
        this._markTime('capabilityTest_end');

        let dedicated, service;

        if (!workerCapability.supported) {
            // Workers not supported or blocked - skip worker creation entirely
            dedicated = {
                supported: false,
                status: 'unsupported',
                reason: workerCapability.reason,
                data: null,
                durationMs: 0
            };
        } else {
            // Measure blob creation
            this._markTime('blobCreate_start');
            const workerScript = this._buildWorkerScript();
            const blob = new Blob([workerScript], { type: 'application/javascript' });
            const blobUrl = URL.createObjectURL(blob);
            this._markTime('blobCreate_end');

            // Get dedicated worker profile
            this._markTime('dedicated_start');
            dedicated = await this._getDedicatedWorkerProfile(blobUrl);
            this._markTime('dedicated_end');

            // Cleanup blob URL
            URL.revokeObjectURL(blobUrl);
        }

        // Service-worker realm is never collected: registering a worker on the hosting origin would
        // replace that site's own service worker for the scope.
        this._markTime('service_start');
        service = { supported: null, status: 'not-collected', reason: null, data: null, durationMs: 0 };
        this._markTime('service_end');

        this._markTime('comparison_start');
        const comparison = this._compareProfiles(windowProfile, dedicated.data);
        this._markTime('comparison_end');
        
        this._markTime('collect_end');

        // Build timing breakdown
        const timingBreakdown = {
            totalCollectMs: this._measureTime('collect_start', 'collect_end'),
            windowProfileMs: this._measureTime('windowProfile_start', 'windowProfile_end'),
            capabilityTestMs: this._measureTime('capabilityTest_start', 'capabilityTest_end'),
            blobCreateMs: this._measureTime('blobCreate_start', 'blobCreate_end'),
            comparisonMs: this._measureTime('comparison_start', 'comparison_end'),
            // Individual worker timings (from worker results)
            dedicatedWorkerMs: dedicated.durationMs || null,
            serviceWorkerMs: service.durationMs || null,
            // Block timings
            dedicatedBlockMs: this._measureTime('dedicated_start', 'dedicated_end'),
            serviceBlockMs: this._measureTime('service_start', 'service_end')
        };

        return {
            windowProfile,
            dedicated,
            workerCapability,
            service,
            comparison,
            timingBreakdown
        };
    }

    /**
     * Test if Web Workers are supported and functional without creating the full worker.
     * This is a lightweight check that validates all required APIs exist.
     * The actual worker is only created once during profiling, avoiding double creation.
     * 
     * @returns {Object} - { supported: boolean, reason: string|null }
     */
    _testWebWorkerCapability() {
        // Check all required APIs exist
        if (typeof Worker === 'undefined') {
            return { supported: false, reason: 'Worker constructor not available' };
        }
        if (typeof URL === 'undefined' || typeof URL.createObjectURL !== 'function') {
            return { supported: false, reason: 'URL.createObjectURL not available' };
        }
        if (typeof Blob === 'undefined') {
            return { supported: false, reason: 'Blob constructor not available' };
        }

        // All APIs exist - worker creation will be tested during actual profiling
        // This avoids double worker creation while still detecting API availability
        return { supported: true, reason: null };
    }

    _getWindowProfile() {
        const languages = normalizeList(navigator.languages);
        const language = normalizeLocale(navigator.language);
        const timeZone = (() => {
            try {
                return Intl.DateTimeFormat().resolvedOptions().timeZone || null;
            } catch (e) {
                return null;
            }
        })();

        // CreepJS: Collect userAgentData (Chromium only)
        const userAgentData = (() => {
            try {
                if (!('userAgentData' in navigator)) return null;
                const uad = navigator.userAgentData;
                return {
                    brands: Array.isArray(uad.brands) ? uad.brands.map(b => ({
                        brand: b.brand || '',
                        version: b.version || ''
                    })) : [],
                    mobile: !!uad.mobile,
                    platform: uad.platform || null
                };
            } catch (e) {
                return null;
            }
        })();

        // CreepJS: Collect comprehensive Intl locales
        const intlLocales = (() => {
            try {
                const constructors = ['Collator', 'DateTimeFormat', 'DisplayNames', 
                                     'ListFormat', 'NumberFormat', 'PluralRules', 'RelativeTimeFormat'];
                const localeMap = {};
                constructors.forEach(name => {
                    try {
                        const IntlConstructor = Intl[name];
                        if (IntlConstructor) {
                            const resolved = new IntlConstructor().resolvedOptions();
                            localeMap[name] = resolved.locale || null;
                        }
                    } catch (e) {
                        localeMap[name] = null;
                    }
                });
                return localeMap;
            } catch (e) {
                return {};
            }
        })();

        const webgl = (() => {
            try {
                const canvas = document.createElement('canvas');
                return getWebglBasicFromCanvas(canvas);
            } catch (e) {
                return null;
            }
        })();

        return this._normalizeProfile({
            ua: normalizeString(navigator.userAgent),
            platform: normalizeString(navigator.platform),
            language,
            languages,
            timezoneOffset: new Date().getTimezoneOffset(),
            timeZone: normalizeString(timeZone),
            hardwareConcurrency: navigator.hardwareConcurrency ?? null,
            deviceMemory: ('deviceMemory' in navigator) ? navigator.deviceMemory : null,
            errorStack: !!(new Error()).stack,
            performanceNowSupport: typeof performance !== 'undefined' && typeof performance.now === 'function',
            webglVendor: normalizeString(webgl && webgl.webglVendor),
            webglRenderer: normalizeString(webgl && webgl.webglRenderer),
            userAgentData,
            intlLocales
        });
    }

    _normalizeProfile(profile) {
        return {
            ua: profile.ua || null,
            platform: profile.platform || null,
            language: profile.language || null,
            languages: Array.isArray(profile.languages) ? profile.languages : [],
            timezoneOffset: typeof profile.timezoneOffset === 'number' ? profile.timezoneOffset : null,
            timeZone: profile.timeZone || null,
            hardwareConcurrency: typeof profile.hardwareConcurrency === 'number' ? profile.hardwareConcurrency : null,
            deviceMemory: typeof profile.deviceMemory === 'number' ? profile.deviceMemory : null,
            errorStack: !!profile.errorStack,
            performanceNowSupport: !!profile.performanceNowSupport,
            webglVendor: profile.webglVendor || null,
            webglRenderer: profile.webglRenderer || null,
            userAgentData: profile.userAgentData || null,
            intlLocales: profile.intlLocales || {}
        };
    }

    _buildWorkerScript() {
        return `
            const normalize = (value) => value === undefined || value === null ? null : String(value);
            const getWebglBasic = () => {
                try {
                    if (typeof OffscreenCanvas === 'undefined') return null;
                    const canvas = new OffscreenCanvas(16, 16);
                    const gl = canvas.getContext('webgl');
                    if (!gl) return null;
                    return {
                        webglVendor: gl.getParameter(gl.VENDOR),
                        webglRenderer: gl.getParameter(gl.RENDERER)
                    };
                } catch (e) {
                    return { error: e.message || 'webgl-error' };
                }
            };
            const getUserAgentData = () => {
                try {
                    if (typeof navigator === 'undefined' || !('userAgentData' in navigator)) return null;
                    const uad = navigator.userAgentData;
                    return {
                        brands: Array.isArray(uad.brands) ? uad.brands.map(b => ({
                            brand: b.brand || '',
                            version: b.version || ''
                        })) : [],
                        mobile: !!uad.mobile,
                        platform: uad.platform || null
                    };
                } catch (e) {
                    return null;
                }
            };
            const getComprehensiveIntlLocales = () => {
                try {
                    const constructors = ['Collator', 'DateTimeFormat', 'DisplayNames', 
                                         'ListFormat', 'NumberFormat', 'PluralRules', 'RelativeTimeFormat'];
                    const localeMap = {};
                    constructors.forEach(name => {
                        try {
                            const IntlConstructor = Intl[name];
                            if (IntlConstructor) {
                                const resolved = new IntlConstructor().resolvedOptions();
                                localeMap[name] = resolved.locale || null;
                            }
                        } catch (e) {
                            localeMap[name] = null;
                        }
                    });
                    return localeMap;
                } catch (e) {
                    return {};
                }
            };
            const buildProfile = () => {
                const timeZone = (() => {
                    try {
                        return Intl.DateTimeFormat().resolvedOptions().timeZone || null;
                    } catch (e) {
                        return null;
                    }
                })();
                const webgl = getWebglBasic();
                const userAgentData = getUserAgentData();
                const intlLocales = getComprehensiveIntlLocales();
                return {
                    ua: normalize(navigator.userAgent),
                    platform: normalize(navigator.platform),
                    language: normalize(navigator.language),
                    languages: Array.isArray(navigator.languages) ? Array.from(navigator.languages) : [],
                    timezoneOffset: new Date().getTimezoneOffset(),
                    timeZone: normalize(timeZone),
                    hardwareConcurrency: navigator.hardwareConcurrency || null,
                    deviceMemory: ('deviceMemory' in navigator) ? navigator.deviceMemory : null,
                    errorStack: !!(new Error()).stack,
                    performanceNowSupport: typeof performance !== 'undefined' && typeof performance.now === 'function',
                    webglVendor: normalize(webgl && webgl.webglVendor),
                    webglRenderer: normalize(webgl && webgl.webglRenderer),
                    userAgentData,
                    intlLocales
                };
            };
            const respond = (target) => {
                try {
                    const data = buildProfile();
                    target.postMessage({ ok: true, data });
                } catch (e) {
                    target.postMessage({ ok: false, error: e.message || 'worker-error' });
                }
            };
            if (typeof onconnect === 'function') {
                onconnect = (event) => {
                    const port = event.ports[0];
                    port.start();
                    respond(port);
                };
            } else {
                onmessage = () => respond(self);
            }
        `;
    }

    _getDedicatedWorkerProfile(blobUrl) {
        const startTime = performance.now();
        return new Promise((resolve) => {
            if (typeof Worker === 'undefined') {
                return resolve({
                    supported: false,
                    status: 'unsupported',
                    reason: 'Worker constructor not available',
                    data: null,
                    durationMs: Math.round((performance.now() - startTime) * 100) / 100
                });
            }

            // Use provided blob URL or create one
            const needsCleanup = !blobUrl;
            if (!blobUrl) {
                const blob = new Blob([this._buildWorkerScript()], { type: 'application/javascript' });
                blobUrl = URL.createObjectURL(blob);
            }

            const worker = new Worker(blobUrl);
            const timeout = setTimeout(() => {
                worker.terminate();
                if (needsCleanup) URL.revokeObjectURL(blobUrl);
                resolve({
                    supported: true,
                    status: 'timeout',
                    reason: 'Dedicated worker timed out',
                    data: null,
                    durationMs: Math.round((performance.now() - startTime) * 100) / 100
                });
            }, this.config.dedicatedTimeoutMs);

            worker.onmessage = (event) => {
                clearTimeout(timeout);
                worker.terminate();
                if (needsCleanup) URL.revokeObjectURL(blobUrl);
                const payload = event.data || {};
                if (!payload.ok) {
                    return resolve({
                        supported: true,
                        status: 'error',
                        reason: payload.error || 'worker-error',
                        data: null,
                        durationMs: Math.round((performance.now() - startTime) * 100) / 100
                    });
                }
                resolve({
                    supported: true,
                    status: 'ok',
                    reason: null,
                    data: this._normalizeProfile(this._normalizeWorkerData(payload.data)),
                    durationMs: Math.round((performance.now() - startTime) * 100) / 100
                });
            };

            worker.onerror = (event) => {
                clearTimeout(timeout);
                worker.terminate();
                if (needsCleanup) URL.revokeObjectURL(blobUrl);
                resolve({
                    supported: true,
                    status: 'error',
                    reason: event.message || 'worker-error',
                    data: null,
                    durationMs: Math.round((performance.now() - startTime) * 100) / 100
                });
            };

            worker.postMessage(0);
        });
    }

    _normalizeWorkerData(data) {
        if (!data) return {};
        return {
            ua: normalizeString(data.ua),
            platform: normalizeString(data.platform),
            language: normalizeLocale(data.language),
            languages: normalizeList(data.languages),
            timezoneOffset: data.timezoneOffset,
            timeZone: normalizeString(data.timeZone),
            hardwareConcurrency: data.hardwareConcurrency,
            deviceMemory: data.deviceMemory,
            errorStack: data.errorStack,
            performanceNowSupport: data.performanceNowSupport,
            webglVendor: normalizeString(data.webglVendor),
            webglRenderer: normalizeString(data.webglRenderer)
        };
    }

    _compareProfiles(windowProfile, workerProfile) {
        const fields = [
            'ua',
            'platform',
            'language',
            'languages',
            'timezoneOffset',
            'timeZone',
            'hardwareConcurrency',
            'deviceMemory',
            'errorStack',
            'performanceNowSupport',
            'webglVendor',
            'webglRenderer'
        ];

        const mismatches = [];
        const missing = [];
        const perField = {};

        fields.forEach((field) => {
            const windowValue = windowProfile ? windowProfile[field] : null;
            const workerValue = workerProfile ? workerProfile[field] : null;

            if (workerProfile === null || workerProfile === undefined) {
                perField[field] = null;
                missing.push(field);
                return;
            }

            if (workerValue === null || workerValue === undefined) {
                perField[field] = null;
                if (windowValue !== null && windowValue !== undefined) {
                    missing.push(field);
                }
                return;
            }

            const isEqual = Array.isArray(windowValue)
                ? JSON.stringify(windowValue) === JSON.stringify(workerValue)
                : windowValue === workerValue;

            perField[field] = isEqual;
            if (!isEqual) {
                mismatches.push(field);
            }
        });

        return {
            perField,
            mismatches,
            missing,
            windowProfileHash: windowProfile ? fnv1a32(stableProfileString(windowProfile)) : fnv1a32('window-missing'),
            workerProfileHash: workerProfile ? fnv1a32(stableProfileString(workerProfile)) : fnv1a32('worker-missing')
        };
    }

    _formatMetrics(result) {
        const comparison = result.comparison || {};
        const perField = comparison.perField || {};
        const timing = result.timingBreakdown || {};
        const capability = result.workerCapability || {};

        const metrics = {
            // === TIMING BREAKDOWN (for performance analysis) ===
            workerTimingTotalMs: {
                value: timing.totalCollectMs ?? 'N/A',
                description: 'Total time for worker signals collection',
                risk: 'N/A'
            },
            workerTimingWindowProfileMs: {
                value: timing.windowProfileMs ?? 'N/A',
                description: 'Time to collect window profile',
                risk: 'N/A'
            },
            workerTimingCapabilityTestMs: {
                value: timing.capabilityTestMs ?? 'N/A',
                description: 'Time to test worker capability',
                risk: 'N/A'
            },
            workerTimingBlobCreateMs: {
                value: timing.blobCreateMs ?? 'N/A',
                description: 'Time to create worker blob URL',
                risk: 'N/A'
            },
            workerTimingDedicatedMs: {
                value: timing.dedicatedWorkerMs ?? 'N/A',
                description: 'Dedicated worker response time',
                risk: 'N/A'
            },
            workerTimingServiceMs: {
                value: timing.serviceWorkerMs ?? 'N/A',
                description: 'Service worker response time',
                risk: 'N/A'
            },
            workerTimingComparisonMs: {
                value: timing.comparisonMs ?? 'N/A',
                description: 'Time to compare window/worker profiles',
                risk: 'N/A'
            },
            // === EXISTING METRICS ===
            workerWindowProfileHash: {
                value: comparison.windowProfileHash || 'Not available',
                description: 'FNV-1a hash of window profile',
                risk: 'N/A'
            },
            workerProfileHash: {
                value: comparison.workerProfileHash || 'Not available',
                description: 'FNV-1a hash of dedicated worker profile',
                risk: 'N/A'
            },
            workerMismatchCount: {
                value: (comparison.mismatches || []).length,
                description: 'Number of mismatched fields between window and worker',
                risk: (comparison.mismatches || []).length ? 'MEDIUM' : 'N/A'
            },
            workerMismatchFields: {
                value: (comparison.mismatches || []).length ? comparison.mismatches.join(', ') : 'None',
                description: 'Fields that differ between window and worker',
                risk: (comparison.mismatches || []).length ? 'MEDIUM' : 'N/A'
            },
            workerMissingFields: {
                value: (comparison.missing || []).length ? comparison.missing.join(', ') : 'None',
                description: 'Fields missing from worker profile',
                risk: (comparison.missing || []).length ? 'MEDIUM' : 'N/A'
            },
            workerStatus: {
                value: result.dedicated.status,
                description: 'Dedicated worker collection status',
                risk: result.dedicated.status === 'ok' ? 'N/A' : 'LOW'
            },
            workerStatusReason: {
                value: result.dedicated.reason || 'None',
                description: 'Dedicated worker failure reason (if any)',
                risk: result.dedicated.reason ? 'LOW' : 'N/A'
            },
            workerCapabilitySupported: {
                value: capability.supported ?? 'N/A',
                description: 'Whether Web Workers are supported and functional',
                risk: capability.supported === false ? 'MEDIUM' : 'N/A'
            },
            workerCapabilityReason: {
                value: capability.reason || 'None',
                description: 'Reason for worker capability failure (if any)',
                risk: capability.reason ? 'MEDIUM' : 'N/A'
            },
            serviceWorkerStatus: {
                value: result.service.status,
                description: 'Service worker collection status',
                risk: 'N/A'
            },
            serviceWorkerStatusReason: {
                value: result.service.reason || 'None',
                description: 'Service worker failure reason (if any)',
                risk: 'N/A'
            }
        };

        const fieldLabels = {
            ua: 'User Agent',
            platform: 'Platform',
            language: 'Language',
            languages: 'Languages',
            timezoneOffset: 'Timezone Offset',
            timeZone: 'Intl Time Zone',
            hardwareConcurrency: 'Hardware Concurrency',
            deviceMemory: 'Device Memory',
            errorStack: 'Error Stack Support',
            performanceNowSupport: 'Performance.now Support',
            webglVendor: 'WebGL Vendor',
            webglRenderer: 'WebGL Renderer'
        };

        Object.keys(fieldLabels).forEach((field) => {
            const value = perField[field];
            metrics[`workerMatch${fieldLabels[field].replace(/\s+/g, '')}`] = {
                value: value === null || value === undefined ? 'Unknown' : value,
                description: `${fieldLabels[field]} match between window and dedicated worker`,
                risk: value === false ? 'MEDIUM' : 'N/A'
            };
        });

        return metrics;
    }
}

export { WorkerSignalsDetector };
