/**
 * Simplified Worker Signals Detector
 * 
 * Lightweight detection of main-thread vs worker-thread discrepancies.
 * Optimized for minimal CPU usage while catching common bot/automation fingerprints.
 * 
 * Key signals compared:
 * - navigator.hardwareConcurrency
 * - navigator.deviceMemory
 * - navigator.platform
 * - navigator.language / languages
 * - timezone (via Intl.DateTimeFormat)
 * - userAgent (basic consistency check)
 * 
 * @module detectors/workerSignalsSimple
 */

const SIMPLE_WORKER_CONFIG = {
    timeoutMs: 200,  // Aggressive timeout - real workers respond in <50ms
    enableWebGL: false,  // WebGL adds ~10ms latency, skip for performance
};

/**
 * Minimal inline worker script - collects only essential signals
 * Designed to be as small as possible for fast parsing/execution
 */
const MINIMAL_WORKER_SCRIPT = `
self.onmessage=()=>{
    const n=navigator,d=new Date();
    let tz;try{tz=Intl.DateTimeFormat().resolvedOptions().timeZone}catch(e){tz=null}
    postMessage({
        hc:n.hardwareConcurrency||null,
        dm:n.deviceMemory||null,
        pl:n.platform||null,
        lg:n.language||null,
        lgs:n.languages?[...n.languages]:[],
        tz:tz,
        tzo:d.getTimezoneOffset(),
        ua:n.userAgent||null
    });
};
`;

class WorkerSignalsSimple {
    constructor(config = {}) {
        this.config = { ...SIMPLE_WORKER_CONFIG, ...config };
        this.result = null;
    }

    /**
     * Run the simplified worker check
     * @returns {Promise<Object>} Analysis result with mismatches
     */
    async analyze() {
        const startTime = performance.now();
        
        // Collect main thread signals (sync, ~0ms)
        const mainSignals = this._getMainSignals();
        
        // Check worker capability
        if (!this._canCreateWorker()) {
            return this._buildResult(mainSignals, null, {
                supported: false,
                reason: 'Workers not available',
                durationMs: Math.round((performance.now() - startTime) * 100) / 100
            });
        }

        // Collect worker signals (async, ~10-50ms typical)
        const workerResult = await this._getWorkerSignals();
        const durationMs = Math.round((performance.now() - startTime) * 100) / 100;

        return this._buildResult(mainSignals, workerResult.data, {
            supported: true,
            status: workerResult.status,
            reason: workerResult.reason,
            durationMs
        });
    }

    /**
     * Synchronous main thread signal collection
     * ~0.1ms execution time
     */
    _getMainSignals() {
        const nav = navigator;
        const d = new Date();
        let tz = null;
        try {
            tz = Intl.DateTimeFormat().resolvedOptions().timeZone;
        } catch (e) {}

        return {
            hc: nav.hardwareConcurrency ?? null,
            dm: ('deviceMemory' in nav) ? nav.deviceMemory : null,
            pl: nav.platform ?? null,
            lg: nav.language ?? null,
            lgs: nav.languages ? [...nav.languages] : [],
            tz: tz,
            tzo: d.getTimezoneOffset(),
            ua: nav.userAgent ?? null
        };
    }

    /**
     * Quick capability check without creating worker
     */
    _canCreateWorker() {
        return typeof Worker !== 'undefined' && 
               typeof Blob !== 'undefined' && 
               typeof URL !== 'undefined' &&
               typeof URL.createObjectURL === 'function';
    }

    /**
     * Create and run worker, return signals
     */
    _getWorkerSignals() {
        return new Promise((resolve) => {
            const blob = new Blob([MINIMAL_WORKER_SCRIPT], { type: 'application/javascript' });
            const url = URL.createObjectURL(blob);
            
            let worker;
            try {
                worker = new Worker(url);
            } catch (e) {
                URL.revokeObjectURL(url);
                return resolve({ status: 'error', reason: e.message, data: null });
            }

            const timeout = setTimeout(() => {
                worker.terminate();
                URL.revokeObjectURL(url);
                resolve({ status: 'timeout', reason: 'Worker timed out', data: null });
            }, this.config.timeoutMs);

            worker.onmessage = (e) => {
                clearTimeout(timeout);
                worker.terminate();
                URL.revokeObjectURL(url);
                resolve({ status: 'ok', reason: null, data: e.data });
            };

            worker.onerror = (e) => {
                clearTimeout(timeout);
                worker.terminate();
                URL.revokeObjectURL(url);
                resolve({ status: 'error', reason: e.message || 'Worker error', data: null });
            };

            worker.postMessage(0);
        });
    }

    /**
     * Build comparison result
     */
    _buildResult(main, worker, meta) {
        const mismatches = [];
        const details = {};

        if (!worker) {
            // No worker data - can't compare
            return {
                supported: meta.supported,
                status: meta.status || 'unavailable',
                reason: meta.reason,
                durationMs: meta.durationMs,
                mismatches: [],
                mismatchCount: 0,
                details: {},
                risk: meta.supported === false ? 'LOW' : 'UNKNOWN'
            };
        }

        // Compare each field
        const checks = [
            { key: 'hc', name: 'hardwareConcurrency', critical: true },
            { key: 'dm', name: 'deviceMemory', critical: true },
            { key: 'pl', name: 'platform', critical: true },
            { key: 'lg', name: 'language', critical: false },
            { key: 'tzo', name: 'timezoneOffset', critical: true },
            { key: 'tz', name: 'timezone', critical: true },
            { key: 'ua', name: 'userAgent', critical: false },
        ];

        let hasCriticalMismatch = false;

        for (const { key, name, critical } of checks) {
            const mainVal = main[key];
            const workerVal = worker[key];
            const match = this._areEqual(mainVal, workerVal);
            
            details[name] = {
                main: mainVal,
                worker: workerVal,
                match
            };

            if (!match) {
                mismatches.push(name);
                if (critical) hasCriticalMismatch = true;
            }
        }

        // Special check for languages array
        const langMatch = this._arraysEqual(main.lgs, worker.lgs);
        details.languages = {
            main: main.lgs,
            worker: worker.lgs,
            match: langMatch
        };
        if (!langMatch) mismatches.push('languages');

        // Calculate risk
        let risk = 'NONE';
        if (mismatches.length > 0) {
            risk = hasCriticalMismatch ? 'HIGH' : 'MEDIUM';
        }

        this.result = {
            supported: true,
            status: 'ok',
            reason: null,
            durationMs: meta.durationMs,
            mismatches,
            mismatchCount: mismatches.length,
            details,
            risk
        };

        return this.result;
    }

    _areEqual(a, b) {
        if (a === b) return true;
        if (a === null || a === undefined) return b === null || b === undefined;
        if (Array.isArray(a)) return this._arraysEqual(a, b);
        return false;
    }

    _arraysEqual(a, b) {
        if (!Array.isArray(a) || !Array.isArray(b)) return false;
        if (a.length !== b.length) return false;
        for (let i = 0; i < a.length; i++) {
            if (a[i] !== b[i]) return false;
        }
        return true;
    }

    /**
     * Get formatted metrics for dashboard display
     */
    getMetrics() {
        if (!this.result) return {};

        const r = this.result;
        return {
            workerSimpleSupported: {
                value: r.supported,
                description: 'Worker API available',
                risk: r.supported ? 'N/A' : 'LOW'
            },
            workerSimpleStatus: {
                value: r.status,
                description: 'Worker check status',
                risk: r.status === 'ok' ? 'N/A' : 'MEDIUM'
            },
            workerSimpleDurationMs: {
                value: r.durationMs,
                description: 'Total check duration',
                risk: 'N/A'
            },
            workerSimpleMismatchCount: {
                value: r.mismatchCount,
                description: 'Number of signal mismatches',
                risk: r.mismatchCount > 0 ? 'HIGH' : 'N/A'
            },
            workerSimpleMismatches: {
                value: r.mismatches.length ? r.mismatches.join(', ') : 'None',
                description: 'Fields with discrepancies',
                risk: r.mismatches.length ? 'HIGH' : 'N/A'
            },
            workerSimpleRisk: {
                value: r.risk,
                description: 'Overall risk assessment',
                risk: r.risk
            }
        };
    }
}

export { WorkerSignalsSimple };
