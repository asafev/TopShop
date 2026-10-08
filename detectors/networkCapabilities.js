/**
 * Network Capabilities Detector Module
 * Analyzes network connection information and capabilities
 * Based on Network Information API and related browser APIs
 * 
 * @module detectors/networkCapabilities
 * @see https://developer.mozilla.org/en-US/docs/Web/API/Network_Information_API
 */

/**
 * Network Capabilities Detector
 * Collects network-related fingerprint data from navigator.connection
 */
class NetworkCapabilitiesDetector {
    constructor() {
        this.connection = navigator.connection || navigator.mozConnection || navigator.webkitConnection;
        this.metrics = {};
    }

    /**
     * Analyze all network capabilities
     * @returns {Object} Network capability metrics
     */
    analyze() {
        this.metrics = {
            // API Availability
            ...this._analyzeAPIAvailability(),
            
            // Connection Properties (if available)
            ...this._analyzeConnectionProperties(),
            
            // Network Quality Estimation
            ...this._analyzeNetworkQuality()
        };

        return this.metrics;
    }

    /**
     * Analyze Network Information API availability
     * @private
     */
    _analyzeAPIAvailability() {
        return {
            hasNetworkInformationAPI: {
                value: !!this.connection,
                description: 'Network Information API availability',
                risk: 'N/A'
            },
            connectionType: {
                value: this.connection ? 'Available' : 'Not supported',
                description: 'navigator.connection object status',
                risk: 'N/A'
            }
        };
    }

    /**
     * Analyze connection properties from Network Information API
     * @private
     */
    _analyzeConnectionProperties() {
        if (!this.connection) {
            return {
                rtt: {
                    value: 'Not available',
                    description: 'Round-trip time in milliseconds',
                    risk: 'N/A'
                },
                downlink: {
                    value: 'Not available',
                    description: 'Downlink speed in Mbps',
                    risk: 'N/A'
                },
                effectiveType: {
                    value: 'Not available',
                    description: 'Effective connection type (slow-2g, 2g, 3g, 4g)',
                    risk: 'N/A'
                },
                saveData: {
                    value: 'Not available',
                    description: 'Data saver mode status',
                    risk: 'N/A'
                },
                type: {
                    value: 'Not available',
                    description: 'Connection type (wifi, cellular, ethernet, etc.)',
                    risk: 'N/A'
                },
                downlinkMax: {
                    value: 'Not available',
                    description: 'Maximum downlink speed in Mbps',
                    risk: 'N/A'
                }
            };
        }

        return {
            rtt: {
                value: this.connection.rtt ?? 'Not available',
                description: 'Round-trip time in milliseconds (estimated)',
                risk: this._assessRttRisk(this.connection.rtt)
            },
            downlink: {
                value: this.connection.downlink ?? 'Not available',
                description: 'Effective bandwidth in Mbps (estimated)',
                risk: this._assessDownlinkRisk(this.connection.downlink)
            },
            effectiveType: {
                value: this.connection.effectiveType ?? 'Not available',
                description: 'Effective connection type (slow-2g, 2g, 3g, 4g)',
                risk: 'N/A'
            },
            saveData: {
                value: this.connection.saveData ?? false,
                description: 'Data saver mode enabled by user',
                risk: 'N/A'
            },
            type: {
                value: this.connection.type ?? 'Not available',
                description: 'Physical connection type (wifi, cellular, ethernet, bluetooth, etc.)',
                risk: 'N/A'
            },
            downlinkMax: {
                value: this.connection.downlinkMax ?? 'Not available',
                description: 'Maximum downlink speed for current connection type in Mbps',
                risk: 'N/A'
            }
        };
    }

    /**
     * Analyze network quality indicators for fingerprinting
     * @private
     */
    _analyzeNetworkQuality() {
        const metrics = {};

        if (this.connection) {
            // Connection quality score (0-100)
            const qualityScore = this._calculateQualityScore();
            metrics.connectionQualityScore = {
                value: qualityScore,
                description: 'Computed network quality score (0-100)',
                risk: 'N/A'
            };

            // Network stability indicator
            metrics.networkProfile = {
                value: this._determineNetworkProfile(),
                description: 'Network profile classification for fingerprinting',
                risk: 'N/A'
            };

            // Potential automation indicators
            metrics.connectionAnomalies = {
                value: this._detectConnectionAnomalies(),
                description: 'Detected connection anomalies that may indicate automation',
                risk: this._hasAnomalies() ? 'MEDIUM' : 'LOW'
            };
        }

        return metrics;
    }

    /**
     * Assess RTT risk level for automation detection
     * Very low RTT might indicate localhost/mock connections
     * @private
     */
    _assessRttRisk(rtt) {
        if (rtt === undefined || rtt === null) return 'N/A';
        if (rtt === 0) return 'MEDIUM'; // Suspicious - usually indicates mocked API
        if (rtt < 5) return 'LOW'; // Very fast but possible for local/fast connections
        return 'LOW';
    }

    /**
     * Assess downlink risk level for automation detection
     * @private
     */
    _assessDownlinkRisk(downlink) {
        if (downlink === undefined || downlink === null) return 'N/A';
        if (downlink === 0) return 'MEDIUM'; // Suspicious
        if (downlink === 10 && this.connection?.rtt === 0) return 'MEDIUM'; // Common mock values
        return 'LOW';
    }

    /**
     * Calculate overall connection quality score
     * @private
     */
    _calculateQualityScore() {
        if (!this.connection) return 0;

        let score = 50; // Base score

        // Adjust based on effective type
        const typeScores = {
            '4g': 40,
            '3g': 25,
            '2g': 10,
            'slow-2g': 0
        };
        score += typeScores[this.connection.effectiveType] ?? 0;

        // Adjust based on RTT (lower is better)
        if (typeof this.connection.rtt === 'number') {
            if (this.connection.rtt < 50) score += 10;
            else if (this.connection.rtt < 100) score += 5;
            else if (this.connection.rtt > 300) score -= 10;
        }

        // Adjust based on downlink
        if (typeof this.connection.downlink === 'number') {
            if (this.connection.downlink > 10) score += 5;
            else if (this.connection.downlink < 1) score -= 5;
        }

        return Math.max(0, Math.min(100, score));
    }

    /**
     * Determine network profile for fingerprinting
     * @private
     */
    _determineNetworkProfile() {
        if (!this.connection) return 'unknown';

        const rtt = this.connection.rtt;
        const downlink = this.connection.downlink;
        const effectiveType = this.connection.effectiveType;

        if (rtt === 0 && downlink === 10) return 'likely-mocked';
        if (effectiveType === '4g' && rtt < 50 && downlink > 5) return 'high-quality';
        if (effectiveType === '4g') return 'good';
        if (effectiveType === '3g') return 'moderate';
        if (effectiveType === '2g' || effectiveType === 'slow-2g') return 'poor';
        
        return 'standard';
    }

    /**
     * Detect connection anomalies that might indicate automation
     * @private
     */
    _detectConnectionAnomalies() {
        const anomalies = [];

        if (!this.connection) {
            return anomalies;
        }

        // Check for common mocked/default values
        if (this.connection.rtt === 0) {
            anomalies.push('zero_rtt');
        }

        if (this.connection.downlink === 0) {
            anomalies.push('zero_downlink');
        }

        // Check for suspiciously perfect values (often mocked)
        if (this.connection.rtt === 50 && this.connection.downlink === 10) {
            anomalies.push('nqe_default_or_clamped_values');
        }

        // Check for impossible combinations
        if (this.connection.effectiveType === '4g' && this.connection.rtt > 500) {
            anomalies.push('inconsistent_type_rtt');
        }

        if (this.connection.effectiveType === 'slow-2g' && this.connection.downlink > 5) {
            anomalies.push('inconsistent_type_downlink');
        }

        return anomalies;
    }

    /**
     * Check if any anomalies were detected
     * @private
     */
    _hasAnomalies() {
        const anomalies = this._detectConnectionAnomalies();
        return anomalies.length > 0;
    }

    /**
     * Get formatted results for inclusion in fingerprint
     * @returns {Object} Formatted network metrics
     */
    getFormattedResults() {
        return {
            networkCapabilities: this.metrics
        };
    }

    /**
     * Get suspicious indicators related to network
     * @returns {Array} Array of suspicious indicator objects
     */
    getSuspiciousIndicators() {
        const indicators = [];
        const anomalies = this._detectConnectionAnomalies();

        anomalies.forEach(anomaly => {
            indicators.push({
                category: 'network',
                name: anomaly,
                description: this._getAnomalyDescription(anomaly),
                severity: 'MEDIUM',
                confidence: 0.6,
                details: `Network anomaly detected: ${anomaly}`
            });
        });

        return indicators;
    }

    /**
     * Get description for anomaly type
     * @private
     */
    _getAnomalyDescription(anomaly) {
        const descriptions = {
            'zero_rtt': 'RTT value is zero, indicating possible mocked Network Information API',
            'zero_downlink': 'Downlink value is zero, indicating possible mocked connection data',
            'default_mock_values': 'Network values match common mock defaults (RTT: 50, Downlink: 10)',
            'inconsistent_type_rtt': 'Effective type (4g) inconsistent with high RTT value',
            'inconsistent_type_downlink': 'Effective type (slow-2g) inconsistent with high downlink value'
        };
        return descriptions[anomaly] || `Unknown network anomaly: ${anomaly}`;
    }

    /**
     * Subscribe to connection changes (for real-time monitoring)
     * @param {Function} callback - Function to call when connection changes
     * @returns {Function} Unsubscribe function
     */
    onConnectionChange(callback) {
        if (!this.connection) {
            return () => {}; // No-op unsubscribe
        }

        const handler = () => {
            this.analyze(); // Re-analyze
            callback(this.metrics);
        };

        this.connection.addEventListener('change', handler);
        
        return () => {
            this.connection.removeEventListener('change', handler);
        };
    }
}

export { NetworkCapabilitiesDetector };
