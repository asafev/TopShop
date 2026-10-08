/**
 * Context Consistency Analyzer
 * Advanced cross-context analysis to detect automation and sandboxes
 * Focuses on meaningful differences that indicate tampering
 */

export class ContextAnalyzer {
    constructor() {
        this.suspiciousIndicators = [];
    }

    /**
     * Analyze context consistency across main, iframe, and worker contexts
     * Returns detailed analysis with specific differences
     */
    analyzeContexts(contexts) {
        const { main, iframe, worker } = contexts;
        const indicators = [];
        let overallRisk = 'low';

        // Skip analysis if contexts are not properly available
        if (!main || !iframe) {
            return {
                risk: 'low',
                indicators: [],
                summary: 'Context analysis skipped - insufficient data'
            };
        }

        // 1. User Agent consistency check
        const uaResult = this._analyzeUserAgent(main, iframe, worker);
        if (uaResult.suspicious) {
            indicators.push(uaResult.indicator);
            overallRisk = this._elevateRisk(overallRisk, uaResult.indicator.riskLevel);
        }

        // 2. Platform consistency check
        const platformResult = this._analyzePlatform(main, iframe, worker);
        if (platformResult.suspicious) {
            indicators.push(platformResult.indicator);
            overallRisk = this._elevateRisk(overallRisk, platformResult.indicator.riskLevel);
        }

        // 3. Language consistency check
        const langResult = this._analyzeLanguages(main, iframe, worker);
        if (langResult.suspicious) {
            indicators.push(langResult.indicator);
            overallRisk = this._elevateRisk(overallRisk, langResult.indicator.riskLevel);
        }

        // 4. Hardware concurrency check
        const hwResult = this._analyzeHardwareConcurrency(main, iframe, worker);
        if (hwResult.suspicious) {
            indicators.push(hwResult.indicator);
            overallRisk = this._elevateRisk(overallRisk, hwResult.indicator.riskLevel);
        }

        // 5. Function signature consistency (critical)
        const funcResult = this._analyzeFunctionSignatures(main, iframe, worker);
        if (funcResult.suspicious) {
            indicators.push(funcResult.indicator);
            overallRisk = this._elevateRisk(overallRisk, funcResult.indicator.riskLevel);
        }

        // 6. Timezone consistency
        const timezoneResult = this._analyzeTimezone(main, iframe, worker);
        if (timezoneResult.suspicious) {
            indicators.push(timezoneResult.indicator);
            overallRisk = this._elevateRisk(overallRisk, timezoneResult.indicator.riskLevel);
        }

        // 7. Connection status consistency
        const connectionResult = this._analyzeConnectionStatus(main, iframe, worker);
        if (connectionResult.suspicious) {
            indicators.push(connectionResult.indicator);
            overallRisk = this._elevateRisk(overallRisk, connectionResult.indicator.riskLevel);
        }

        return {
            risk: overallRisk,
            indicators,
            summary: indicators.length > 0 
                ? `Found ${indicators.length} context inconsistencies indicating potential tampering`
                : 'All contexts appear consistent - no tampering detected'
        };
    }

    /**
     * Analyze User Agent consistency
     */
    _analyzeUserAgent(main, iframe, worker) {
        const differences = [];

        // Main vs Iframe
        if (main.ua !== iframe.ua) {
            differences.push(`Main: "${main.ua}" vs Iframe: "${iframe.ua}"`);
        }

        // Main vs Worker (if available)
        if (worker && worker.ok && worker.worker.success) {
            const workerData = worker.worker.data;
            if (main.ua !== workerData.ua) {
                differences.push(`Main: "${main.ua}" vs Worker: "${workerData.ua}"`);
            }
        }

        if (differences.length > 0) {
            return {
                suspicious: true,
                indicator: {
                    name: 'User Agent inconsistency across contexts',
                    description: 'Different user agent strings detected across execution contexts',
                    category: 'Context Inconsistency',
                    riskLevel: 'HIGH',
                    confidence: 0.9,
                    importance: 'CRITICAL',
                    value: differences.join(' | '),
                    details: 'User agent should be identical across all contexts in normal browsers'
                }
            };
        }

        return { suspicious: false };
    }

    /**
     * Analyze Platform consistency
     */
    _analyzePlatform(main, iframe, worker) {
        const differences = [];

        if (main.plat !== iframe.plat) {
            differences.push(`Main: "${main.plat}" vs Iframe: "${iframe.plat}"`);
        }

        if (worker && worker.ok && worker.worker.success) {
            const workerData = worker.worker.data;
            if (main.plat !== workerData.plat) {
                differences.push(`Main: "${main.plat}" vs Worker: "${workerData.plat}"`);
            }
        }

        if (differences.length > 0) {
            return {
                suspicious: true,
                indicator: {
                    name: 'Platform inconsistency across contexts',
                    description: 'Different platform values detected across execution contexts',
                    category: 'Context Inconsistency',
                    riskLevel: 'HIGH',
                    confidence: 0.85,
                    importance: 'STRONG',
                    value: differences.join(' | '),
                    details: 'Platform should be identical across all contexts'
                }
            };
        }

        return { suspicious: false };
    }

    /**
     * Analyze Language consistency
     */
    _analyzeLanguages(main, iframe, worker) {
        const differences = [];
        const mainLang = JSON.stringify(main.lang);
        const iframeLang = JSON.stringify(iframe.lang);

        if (mainLang !== iframeLang) {
            differences.push(`Main: ${mainLang} vs Iframe: ${iframeLang}`);
        }

        if (worker && worker.ok && worker.worker.success) {
            const workerData = worker.worker.data;
            const workerLang = JSON.stringify(workerData.lang);
            if (mainLang !== workerLang) {
                differences.push(`Main: ${mainLang} vs Worker: ${workerLang}`);
            }
        }

        if (differences.length > 0) {
            return {
                suspicious: true,
                indicator: {
                    name: 'Language preferences inconsistency',
                    description: 'Different language arrays detected across execution contexts',
                    category: 'Context Inconsistency',
                    riskLevel: 'MEDIUM',
                    confidence: 0.7,
                    importance: 'STRONG',
                    value: differences.join(' | '),
                    details: 'Language preferences should be consistent across contexts'
                }
            };
        }

        return { suspicious: false };
    }

    /**
     * Analyze Hardware Concurrency consistency
     */
    _analyzeHardwareConcurrency(main, iframe, worker) {
        const differences = [];

        if (main.hw !== iframe.hw) {
            differences.push(`Main: ${main.hw} vs Iframe: ${iframe.hw}`);
        }

        if (worker && worker.ok && worker.worker.success) {
            const workerData = worker.worker.data;
            if (main.hw !== workerData.hw) {
                differences.push(`Main: ${main.hw} vs Worker: ${workerData.hw}`);
            }
        }

        if (differences.length > 0) {
            return {
                suspicious: true,
                indicator: {
                    name: 'Hardware concurrency mismatch',
                    description: 'Different CPU core counts reported across execution contexts',
                    category: 'Context Inconsistency',
                    riskLevel: 'MEDIUM',
                    confidence: 0.8,
                    importance: 'STRONG',
                    value: differences.join(' | '),
                    details: 'Hardware concurrency should be identical across all contexts'
                }
            };
        }

        return { suspicious: false };
    }

    /**
     * Analyze Function Signature consistency (most critical)
     */
    _analyzeFunctionSignatures(main, iframe, worker) {
        const differences = [];

        // Check Function.toString consistency
        if (main.funcToString !== iframe.funcToString) {
            differences.push(`Function.toString differs between main and iframe contexts`);
        }

        // Check JSON.stringify consistency
        if (main.JSONStringify !== iframe.JSONStringify) {
            differences.push(`JSON.stringify differs between main and iframe contexts`);
        }

        // Check Math.random consistency
        if (main.mathRandom !== iframe.mathRandom) {
            differences.push(`Math.random differs between main and iframe contexts`);
        }

        // Check Date.now consistency
        if (main.dateNow !== iframe.dateNow) {
            differences.push(`Date.now differs between main and iframe contexts`);
        }

        // Worker checks
        if (worker && worker.ok && worker.worker.success) {
            const workerData = worker.worker.data;
            
            if (main.funcToString !== workerData.funcToString) {
                differences.push(`Function.toString differs between main and worker contexts`);
            }
            if (main.JSONStringify !== workerData.JSONStringify) {
                differences.push(`JSON.stringify differs between main and worker contexts`);
            }
            if (main.mathRandom !== workerData.mathRandom) {
                differences.push(`Math.random differs between main and worker contexts`);
            }
            if (main.dateNow !== workerData.dateNow) {
                differences.push(`Date.now differs between main and worker contexts`);
            }
        }

        if (differences.length > 0) {
            return {
                suspicious: true,
                indicator: {
                    name: 'Core function signature tampering detected',
                    description: 'Critical JavaScript functions have been modified differently across contexts',
                    category: 'Context Inconsistency',
                    riskLevel: 'HIGH',
                    confidence: 0.95,
                    importance: 'CRITICAL',
                    value: differences.join('; '),
                    details: 'Core JavaScript function signatures should be identical across all execution contexts'
                }
            };
        }

        return { suspicious: false };
    }

    /**
     * Analyze Timezone consistency
     */
    _analyzeTimezone(main, iframe, worker) {
        const differences = [];

        if (main.timezoneOffset !== iframe.timezoneOffset) {
            differences.push(`Main: ${main.timezoneOffset} vs Iframe: ${iframe.timezoneOffset}`);
        }

        if (worker && worker.ok && worker.worker.success) {
            const workerData = worker.worker.data;
            if (main.timezoneOffset !== workerData.timezoneOffset) {
                differences.push(`Main: ${main.timezoneOffset} vs Worker: ${workerData.timezoneOffset}`);
            }
        }

        if (differences.length > 0) {
            return {
                suspicious: true,
                indicator: {
                    name: 'Timezone offset inconsistency',
                    description: 'Different timezone offsets detected across execution contexts',
                    category: 'Context Inconsistency',
                    riskLevel: 'MEDIUM',
                    confidence: 0.7,
                    importance: 'WEAK',
                    value: differences.join(' | '),
                    details: 'Timezone should be consistent across contexts (may indicate spoofing)'
                }
            };
        }

        return { suspicious: false };
    }

    /**
     * Analyze Connection Status consistency
     */
    _analyzeConnectionStatus(main, iframe, worker) {
        const differences = [];

        if (main.onLine !== iframe.onLine) {
            differences.push(`Main: ${main.onLine} vs Iframe: ${iframe.onLine}`);
        }

        if (worker && worker.ok && worker.worker.success) {
            const workerData = worker.worker.data;
            if (main.onLine !== workerData.onLine) {
                differences.push(`Main: ${main.onLine} vs Worker: ${workerData.onLine}`);
            }
        }

        if (differences.length > 0) {
            // This is usually not very suspicious as network status can change
            return {
                suspicious: true,
                indicator: {
                    name: 'Connection status inconsistency',
                    description: 'Different online status detected across execution contexts',
                    category: 'Context Inconsistency',
                    riskLevel: 'LOW',
                    confidence: 0.4,
                    importance: 'WEAK',
                    value: differences.join(' | '),
                    details: 'Connection status differences may indicate context isolation (low confidence)'
                }
            };
        }

        return { suspicious: false };
    }

    /**
     * Elevate risk level based on new findings
     */
    _elevateRisk(currentRisk, newRisk) {
        const riskLevels = { 'low': 1, 'medium': 2, 'high': 3 };
        const currentLevel = riskLevels[currentRisk.toLowerCase()] || 1;
        const newLevel = riskLevels[newRisk.toLowerCase()] || 1;
        
        if (newLevel > currentLevel) {
            return newRisk.toLowerCase();
        }
        return currentRisk;
    }

    /**
     * Get summary of context analysis
     */
    getSummary() {
        return {
            totalIndicators: this.suspiciousIndicators.length,
            riskCounts: {
                HIGH: this.suspiciousIndicators.filter(i => i.riskLevel === 'HIGH').length,
                MEDIUM: this.suspiciousIndicators.filter(i => i.riskLevel === 'MEDIUM').length,
                LOW: this.suspiciousIndicators.filter(i => i.riskLevel === 'LOW').length
            }
        };
    }
}
