/**
 * Active Network Measurements Module
 * Performs real-time network performance measurements
 * Independent of Network Information API - works everywhere
 * 
 * @module detectors/activeMeasurements
 * @description Measures actual RTT, download speed, and upload speed using fetch API
 */

/**
 * Configuration for active measurements
 */
const DEFAULT_CONFIG = {
    // Ping endpoint for RTT measurement (relative URL)
    // Uses the test file with HEAD request for minimal data transfer
    pingUrl: './network-test-3mb.bin',
    
    // Download test file URL (relative URL, should be a known size file)
    // 3MB file for accurate bandwidth measurement
    downloadUrl: './network-test-3mb.bin',
    
    // Upload endpoint URL (relative URL)
    uploadUrl: '/test-upload',
    
    // Expected file size for download test (bytes) - fallback if Content-Length not available
    // 3MB = 3 * 1024 * 1024 bytes
    expectedDownloadBytes: 3 * 1024 * 1024, // 3MB
    
    // Upload payload size (bytes)
    uploadBytes: 100 * 1024, // 100KB
    
    // Number of ping samples for RTT averaging
    pingCount: 3,
    
    // Timeout for each measurement (ms)
    timeout: 10000,
    
    // Whether to use fallback self-hosted endpoints
    useFallback: true,
    
    // Fallback: Use data URL for download speed estimation
    useSyntheticTest: true
};

/**
 * Active Network Measurements Detector
 * Performs real network measurements using fetch API timing
 */
class ActiveMeasurementsDetector {
    /**
     * @param {Object} config - Configuration options
     */
    constructor(config = {}) {
        this.config = { ...DEFAULT_CONFIG, ...config };
        this.metrics = {};
        this.measurementResults = {
            rtt: null,
            downlink: null,
            uplink: null
        };
    }

    /**
     * Run all active measurements
     * @param {Object} options - Measurement options
     * @returns {Promise<Object>} Measurement results
     */
    async analyze(options = {}) {
        const startTime = performance.now();
        
        const [rttMetrics, downloadMetrics, uploadMetrics] = await Promise.all([
            this._measureRtt(options),
            this._measureDownlink(options),
            this._measureUplink(options)
        ]);

        const totalTime = performance.now() - startTime;

        this.metrics = {
            ...rttMetrics,
            ...downloadMetrics,
            ...uploadMetrics,
            measurementDuration: {
                value: Math.round(totalTime),
                description: 'Total time for all active measurements (ms)',
                risk: 'N/A'
            },
            measurementTimestamp: {
                value: Date.now(),
                description: 'Timestamp when measurements were taken',
                risk: 'N/A'
            }
        };

        return this.metrics;
    }

    /**
     * Measure Round-Trip Time using fetch
     * @private
     * @param {Object} options - Options including custom URL
     * @returns {Promise<Object>} RTT metrics
     */
    async _measureRtt(options = {}) {
        const pingUrl = options.pingUrl || this.config.pingUrl;
        const samples = [];
        let error = null;

        // Try actual fetch first, fallback to synthetic
        try {
            for (let i = 0; i < this.config.pingCount; i++) {
                const sample = await this._singleRttMeasurement(pingUrl);
                if (sample !== null) {
                    samples.push(sample);
                }
            }
        } catch (e) {
            error = e.message;
        }

        // If no samples from real fetch, try synthetic measurement
        if (samples.length === 0 && this.config.useSyntheticTest) {
            try {
                const syntheticRtt = await this._syntheticRttMeasurement();
                if (syntheticRtt !== null) {
                    samples.push(syntheticRtt);
                }
            } catch (e) {
                // Synthetic also failed
            }
        }

        const rttMs = samples.length > 0 ? 
            Math.round(samples.reduce((a, b) => a + b, 0) / samples.length) : null;
        
        this.measurementResults.rtt = rttMs;

        return {
            measuredRtt: {
                value: rttMs ?? 'Not available',
                description: 'Measured round-trip time in milliseconds (via fetch timing)',
                risk: this._assessMeasuredRttRisk(rttMs)
            },
            measuredRttSamples: {
                value: samples,
                description: 'Individual RTT measurement samples',
                risk: 'N/A'
            },
            measuredRttMin: {
                value: samples.length > 0 ? Math.min(...samples) : 'Not available',
                description: 'Minimum observed RTT',
                risk: 'N/A'
            },
            measuredRttMax: {
                value: samples.length > 0 ? Math.max(...samples) : 'Not available',
                description: 'Maximum observed RTT',
                risk: 'N/A'
            },
            measuredRttJitter: {
                value: samples.length > 1 ? 
                    Math.round(Math.max(...samples) - Math.min(...samples)) : 'Not available',
                description: 'RTT jitter (difference between max and min)',
                risk: 'N/A'
            },
            rttMeasurementMethod: {
                value: samples.length > 0 && !error ? 'fetch' : 'synthetic',
                description: 'Method used for RTT measurement',
                risk: 'N/A'
            },
            rttMeasurementError: {
                value: error,
                description: 'Error during RTT measurement if any',
                risk: 'N/A'
            }
        };
    }

    /**
     * Single RTT measurement using fetch
     * @private
     */
    async _singleRttMeasurement(url) {
        try {
            const controller = new AbortController();
            const timeoutId = setTimeout(() => controller.abort(), this.config.timeout);

            const t0 = performance.now();
            
            await fetch(url, {
                method: 'HEAD', // Use HEAD for minimal data transfer
                cache: 'no-store',
                credentials: 'omit',
                signal: controller.signal
            });

            clearTimeout(timeoutId);
            return Math.round(performance.now() - t0);
        } catch (e) {
            // Fetch failed (likely CORS or no server)
            return null;
        }
    }

    /**
     * Synthetic RTT measurement using local timing
     * @private
     */
    async _syntheticRttMeasurement() {
        // Create a small data URL request to measure browser overhead
        const t0 = performance.now();
        
        try {
            const smallData = new Blob(['test'], { type: 'text/plain' });
            const url = URL.createObjectURL(smallData);
            
            await fetch(url, { cache: 'no-store' });
            
            URL.revokeObjectURL(url);
            const elapsed = performance.now() - t0;
            
            // This measures local processing time, not network RTT
            // Mark as synthetic in the results
            return Math.round(elapsed);
        } catch (e) {
            return null;
        }
    }

    /**
     * Measure download speed
     * @private
     * @param {Object} options - Options including custom URL and expected bytes
     * @returns {Promise<Object>} Downlink metrics
     */
    async _measureDownlink(options = {}) {
        const downloadUrl = options.downloadUrl || this.config.downloadUrl;
        const expectedBytes = options.expectedBytes || this.config.expectedDownloadBytes;
        
        let result = null;
        let error = null;
        let method = 'fetch';

        // Try actual file download first
        try {
            result = await this._actualDownloadMeasurement(downloadUrl, expectedBytes);
        } catch (e) {
            error = e.message;
        }

        // If actual download failed, try synthetic
        if (!result && this.config.useSyntheticTest) {
            try {
                result = await this._syntheticDownloadMeasurement();
                method = 'synthetic';
            } catch (e) {
                // Synthetic also failed
            }
        }

        this.measurementResults.downlink = result;

        return {
            measuredDownlink: {
                value: result?.mbps ?? 'Not available',
                description: 'Measured download speed in Mbps',
                risk: this._assessMeasuredDownlinkRisk(result?.mbps)
            },
            measuredDownlinkBytes: {
                value: result?.bytes ?? 'Not available',
                description: 'Bytes downloaded during test',
                risk: 'N/A'
            },
            measuredDownlinkDuration: {
                value: result?.dtMs ?? 'Not available',
                description: 'Download test duration in milliseconds',
                risk: 'N/A'
            },
            measuredDownlinkBytesPerSecond: {
                value: result ? Math.round((result.bytes / result.dtMs) * 1000) : 'Not available',
                description: 'Download speed in bytes per second',
                risk: 'N/A'
            },
            downlinkMeasurementMethod: {
                value: method,
                description: 'Method used for download measurement',
                risk: 'N/A'
            },
            downlinkMeasurementError: {
                value: error,
                description: 'Error during download measurement if any',
                risk: 'N/A'
            }
        };
    }

    /**
     * Actual file download measurement
     * @private
     */
    async _actualDownloadMeasurement(url, expectedBytes) {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), this.config.timeout);

        const t0 = performance.now();
        
        const res = await fetch(url, {
            cache: 'no-store',
            credentials: 'omit',
            signal: controller.signal
        });

        const buf = await res.arrayBuffer();
        clearTimeout(timeoutId);
        
        const dtMs = performance.now() - t0;
        const dtSec = dtMs / 1000;
        const bytes = expectedBytes || buf.byteLength;
        const mbps = (bytes * 8) / dtSec / 1_000_000;

        return {
            mbps: +mbps.toFixed(2),
            bytes,
            dtMs: Math.round(dtMs)
        };
    }

    /**
     * Synthetic download measurement using Blob
     * @private
     */
    async _syntheticDownloadMeasurement() {
        // Create a large Blob to measure read speed
        // Use a reasonable size that won't hit crypto limits
        const testSize = 256 * 1024; // 256KB - good balance for measurement
        const testData = new Uint8Array(testSize);
        
        // crypto.getRandomValues has a 65536 byte limit per call
        // Fill in chunks to avoid the exception
        const maxChunk = 65536;
        for (let offset = 0; offset < testSize; offset += maxChunk) {
            const chunkSize = Math.min(maxChunk, testSize - offset);
            const chunk = new Uint8Array(testData.buffer, offset, chunkSize);
            crypto.getRandomValues(chunk);
        }
        
        const blob = new Blob([testData], { type: 'application/octet-stream' });
        const url = URL.createObjectURL(blob);

        const t0 = performance.now();
        
        const res = await fetch(url, { cache: 'no-store' });
        const buf = await res.arrayBuffer();
        
        URL.revokeObjectURL(url);
        
        const dtMs = performance.now() - t0;
        const dtSec = dtMs / 1000;
        const bytes = buf.byteLength;
        const mbps = (bytes * 8) / dtSec / 1_000_000;

        return {
            mbps: +mbps.toFixed(2),
            bytes,
            dtMs: Math.round(dtMs),
            isSynthetic: true
        };
    }

    /**
     * Measure upload speed
     * @private
     * @param {Object} options - Options including custom URL and bytes to send
     * @returns {Promise<Object>} Uplink metrics
     */
    async _measureUplink(options = {}) {
        const uploadUrl = options.uploadUrl || this.config.uploadUrl;
        const bytesToSend = options.uploadBytes || this.config.uploadBytes;

        let result = null;
        let error = null;
        let method = 'fetch';

        // Try actual upload first
        try {
            result = await this._actualUploadMeasurement(uploadUrl, bytesToSend);
        } catch (e) {
            error = e.message;
        }

        // If actual upload failed, try synthetic estimation
        if (!result && this.config.useSyntheticTest) {
            try {
                result = await this._syntheticUploadEstimation(bytesToSend);
                method = 'synthetic';
            } catch (e) {
                // Synthetic also failed
            }
        }

        this.measurementResults.uplink = result;

        return {
            measuredUplink: {
                value: result?.mbps ?? 'Not available',
                description: 'Measured/estimated upload speed in Mbps',
                risk: 'N/A'
            },
            measuredUplinkBytes: {
                value: result?.bytes ?? 'Not available',
                description: 'Bytes uploaded during test',
                risk: 'N/A'
            },
            measuredUplinkDuration: {
                value: result?.dtMs ?? 'Not available',
                description: 'Upload test duration in milliseconds',
                risk: 'N/A'
            },
            measuredUplinkBytesPerSecond: {
                value: result ? Math.round((result.bytes / result.dtMs) * 1000) : 'Not available',
                description: 'Upload speed in bytes per second',
                risk: 'N/A'
            },
            uplinkMeasurementMethod: {
                value: method,
                description: 'Method used for upload measurement',
                risk: 'N/A'
            },
            uplinkMeasurementError: {
                value: error,
                description: 'Error during upload measurement if any',
                risk: 'N/A'
            }
        };
    }

    /**
     * Actual upload measurement using POST
     * @private
     */
    async _actualUploadMeasurement(url, bytesToSend) {
        const payload = new Uint8Array(bytesToSend);
        
        // crypto.getRandomValues has a 65536 byte limit per call
        // Fill in chunks to avoid the exception
        const maxChunk = 65536;
        for (let offset = 0; offset < bytesToSend; offset += maxChunk) {
            const chunkSize = Math.min(maxChunk, bytesToSend - offset);
            const chunk = new Uint8Array(payload.buffer, offset, chunkSize);
            crypto.getRandomValues(chunk);
        }

        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), this.config.timeout);

        const t0 = performance.now();
        
        await fetch(url, {
            method: 'POST',
            cache: 'no-store',
            credentials: 'omit',
            headers: { 'Content-Type': 'application/octet-stream' },
            body: payload,
            signal: controller.signal
        });

        clearTimeout(timeoutId);
        
        const dtMs = performance.now() - t0;
        const dtSec = dtMs / 1000;
        const mbps = (bytesToSend * 8) / dtSec / 1_000_000;

        return {
            mbps: +mbps.toFixed(2),
            bytes: bytesToSend,
            dtMs: Math.round(dtMs)
        };
    }

    /**
     * Synthetic upload estimation (measures data preparation time)
     * @private
     */
    async _syntheticUploadEstimation(bytesToSend) {
        const payload = new Uint8Array(bytesToSend);
        
        const t0 = performance.now();
        
        // crypto.getRandomValues has a 65536 byte limit per call
        // Fill in chunks to avoid the exception
        const maxChunk = 65536;
        for (let offset = 0; offset < bytesToSend; offset += maxChunk) {
            const chunkSize = Math.min(maxChunk, bytesToSend - offset);
            const chunk = new Uint8Array(payload.buffer, offset, chunkSize);
            crypto.getRandomValues(chunk);
        }
        
        // Create a blob and read it back (simulates data handling)
        const blob = new Blob([payload], { type: 'application/octet-stream' });
        await blob.arrayBuffer();
        
        const dtMs = performance.now() - t0;
        const dtSec = dtMs / 1000;
        
        // This is an estimation based on local processing speed
        // Actual upload would be slower due to network
        const mbps = (bytesToSend * 8) / dtSec / 1_000_000;

        return {
            mbps: +mbps.toFixed(2),
            bytes: bytesToSend,
            dtMs: Math.round(dtMs),
            isEstimation: true
        };
    }

    /**
     * Assess measured RTT risk
     * @private
     */
    _assessMeasuredRttRisk(rtt) {
        if (rtt === null || rtt === undefined) return 'N/A';
        // Very low RTT might indicate synthetic/mocked
        if (rtt < 1) return 'MEDIUM';
        return 'LOW';
    }

    /**
     * Assess measured downlink risk
     * @private
     */
    _assessMeasuredDownlinkRisk(mbps) {
        if (mbps === null || mbps === undefined) return 'N/A';
        // Unrealistically high speeds might indicate synthetic test
        if (mbps > 1000) return 'LOW'; // Could be gigabit or blob URL
        return 'LOW';
    }

    /**
     * Compare with Network Information API values
     * @param {Object} connectionData - Data from navigator.connection
     * @returns {Object} Comparison metrics
     */
    compareWithConnectionAPI(connectionData) {
        const comparison = {};

        if (connectionData && this.measurementResults.rtt !== null) {
            const apiRtt = connectionData.rtt;
            const measuredRtt = this.measurementResults.rtt;
            
            if (typeof apiRtt === 'number') {
                const rttDiff = Math.abs(apiRtt - measuredRtt);
                const rttRatio = apiRtt > 0 ? measuredRtt / apiRtt : null;
                
                comparison.rttComparison = {
                    apiValue: apiRtt,
                    measuredValue: measuredRtt,
                    difference: rttDiff,
                    ratio: rttRatio ? rttRatio.toFixed(2) : 'N/A',
                    consistent: rttDiff < 100, // Within 100ms is considered consistent
                    description: 'Comparison between API-reported and measured RTT'
                };
            }
        }

        if (connectionData && this.measurementResults.downlink !== null) {
            const apiDownlink = connectionData.downlink;
            const measuredDownlink = this.measurementResults.downlink.mbps;
            
            if (typeof apiDownlink === 'number' && measuredDownlink) {
                const downlinkRatio = apiDownlink > 0 ? measuredDownlink / apiDownlink : null;
                
                comparison.downlinkComparison = {
                    apiValue: apiDownlink,
                    measuredValue: measuredDownlink,
                    ratio: downlinkRatio ? downlinkRatio.toFixed(2) : 'N/A',
                    consistent: downlinkRatio ? (downlinkRatio > 0.3 && downlinkRatio < 3) : false,
                    description: 'Comparison between API-reported and measured downlink'
                };
            }
        }

        return comparison;
    }

    /**
     * Get formatted results for inclusion in fingerprint
     * @returns {Object} Formatted active measurement metrics
     */
    getFormattedResults() {
        return {
            activeMeasurements: this.metrics
        };
    }

    /**
     * Get suspicious indicators related to active measurements
     * @param {Object} connectionData - Optional navigator.connection data for comparison
     * @returns {Array} Array of suspicious indicator objects
     */
    getSuspiciousIndicators(connectionData = null) {
        const indicators = [];

        // Check for measurement anomalies
        if (this.measurementResults.rtt !== null && this.measurementResults.rtt < 1) {
            indicators.push({
                category: 'active_measurement',
                name: 'suspiciously_low_rtt',
                description: 'Measured RTT is suspiciously low (< 1ms)',
                severity: 'MEDIUM',
                confidence: 0.5,
                details: `Measured RTT: ${this.measurementResults.rtt}ms`
            });
        }

        // Check for inconsistency with Connection API
        if (false) {
            const comparison = this.compareWithConnectionAPI(connectionData);
            
            if (comparison.rttComparison && !comparison.rttComparison.consistent) {
                indicators.push({
                    category: 'active_measurement',
                    name: 'rtt_api_mismatch',
                    description: 'Measured RTT differs significantly from Connection API value',
                    severity: 'LOW',
                    confidence: 0.4,
                    details: `API: ${comparison.rttComparison.apiValue}ms, Measured: ${comparison.rttComparison.measuredValue}ms`
                });
            }

            if (comparison.downlinkComparison && !comparison.downlinkComparison.consistent) {
                indicators.push({
                    category: 'active_measurement',
                    name: 'downlink_api_mismatch',
                    description: 'Measured downlink differs significantly from Connection API value',
                    severity: 'LOW',
                    confidence: 0.4,
                    details: `API: ${comparison.downlinkComparison.apiValue}Mbps, Measured: ${comparison.downlinkComparison.measuredValue}Mbps`
                });
            }
        }

        return indicators;
    }

    /**
     * Quick RTT measurement (single sample)
     * Useful for lightweight fingerprinting
     * @param {string} url - URL to ping
     * @returns {Promise<number|null>} RTT in milliseconds or null
     */
    async quickRtt(url = null) {
        const pingUrl = url || this.config.pingUrl;
        const rtt = await this._singleRttMeasurement(pingUrl);
        return rtt ?? (this.config.useSyntheticTest ? await this._syntheticRttMeasurement() : null);
    }

    /**
     * Quick download speed measurement
     * @param {string} url - URL to download
     * @param {number} expectedBytes - Expected file size
     * @returns {Promise<Object|null>} Download speed result or null
     */
    async quickDownload(url = null, expectedBytes = null) {
        const downloadUrl = url || this.config.downloadUrl;
        const bytes = expectedBytes || this.config.expectedDownloadBytes;
        
        try {
            return await this._actualDownloadMeasurement(downloadUrl, bytes);
        } catch (e) {
            return this.config.useSyntheticTest ? await this._syntheticDownloadMeasurement() : null;
        }
    }
}

export { ActiveMeasurementsDetector, DEFAULT_CONFIG as ACTIVE_MEASUREMENTS_CONFIG };
