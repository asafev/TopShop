import { log as _log } from './utils/log.js';
/**
 * Behavioral Storage Manager
 * Enterprise-grade behavioral indicators persistence and analysis system
 * Maintains state across pages using localStorage with robust error handling
 */

class BehavioralStorageManager {
    constructor() {
        this.storageKey = 'behavioral_indicators_v1';
        this.sessionKey = 'behavioral_session_v1';
        this.maxStorageAge = 24 * 60 * 60 * 1000; // 24 hours
        this.initialized = false;
        
        // Initialize storage structure
        this.init();
    }

    /**
     * Initialize the storage manager
     */
    init() {
        try {
            // Test localStorage availability
            if (!this.isStorageAvailable()) {
                _log.warn('BehavioralStorage: localStorage not available, using memory fallback');
                this.memoryStorage = {};
                this.memorySession = {};
            }
            
            // Clean old data
            this.cleanOldData();
            
            // Initialize session if needed
            this.initializeSession();
            
            this.initialized = true;
            _log.log('🧠 BehavioralStorageManager initialized successfully');
        } catch (error) {
            _log.error('BehavioralStorage initialization error:', error);
            this.memoryStorage = {};
            this.memorySession = {};
        }
    }

    /**
     * Test if localStorage is available
     * @returns {boolean}
     */
    isStorageAvailable() {
        try {
            const test = '__behavioral_storage_test__';
            localStorage.setItem(test, test);
            localStorage.removeItem(test);
            return true;
        } catch (e) {
            return false;
        }
    }

    /**
     * Clean old data from storage
     */
    cleanOldData() {
        try {
            const stored = this.getRawData();
            if (stored && stored.timestamp) {
                const age = Date.now() - stored.timestamp;
                if (age > this.maxStorageAge) {
                    this.clearAll();
                    _log.log('BehavioralStorage: Cleaned old data');
                }
            }
        } catch (error) {
            _log.warn('BehavioralStorage: Error cleaning old data:', error);
        }
    }

    /**
     * Initialize session data
     */
    initializeSession() {
        const sessionId = this.generateSessionId();
        const sessionData = {
            sessionId,
            startTime: Date.now(),
            userAgent: navigator.userAgent,
            viewportSize: {
                width: window.innerWidth,
                height: window.innerHeight
            }
        };
        
        this.setSessionData(sessionData);
    }

    /**
     * Generate unique session ID
     * @returns {string}
     */
    generateSessionId() {
        return `session_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    }

    /**
     * Get raw data from storage
     * @returns {Object|null}
     */
    getRawData() {
        try {
            if (this.isStorageAvailable()) {
                const data = localStorage.getItem(this.storageKey);
                return data ? JSON.parse(data) : null;
            } else {
                return this.memoryStorage || null;
            }
        } catch (error) {
            _log.warn('BehavioralStorage: Error reading data:', error);
            return null;
        }
    }

    /**
     * Set raw data to storage
     * @param {Object} data 
     */
    setRawData(data) {
        try {
            data.timestamp = Date.now();
            
            if (this.isStorageAvailable()) {
                localStorage.setItem(this.storageKey, JSON.stringify(data));
            } else {
                this.memoryStorage = { ...data };
            }
        } catch (error) {
            _log.error('BehavioralStorage: Error saving data:', error);
        }
    }

    /**
     * Get session data
     * @returns {Object}
     */
    getSessionData() {
        try {
            if (this.isStorageAvailable()) {
                const data = sessionStorage.getItem(this.sessionKey);
                return data ? JSON.parse(data) : {};
            } else {
                return this.memorySession || {};
            }
        } catch (error) {
            _log.warn('BehavioralStorage: Error reading session data:', error);
            return {};
        }
    }

    /**
     * Set session data
     * @param {Object} sessionData 
     */
    setSessionData(sessionData) {
        try {
            if (this.isStorageAvailable()) {
                sessionStorage.setItem(this.sessionKey, JSON.stringify(sessionData));
            } else {
                this.memorySession = { ...sessionData };
            }
        } catch (error) {
            _log.error('BehavioralStorage: Error saving session data:', error);
        }
    }

    /**
     * Get all behavioral indicators
     * @returns {Object}
     */
    getBehavioralIndicators() {
        const data = this.getRawData();
        return data?.indicators || this.getDefaultIndicators();
    }

    /**
     * Get default indicators structure
     * @returns {Object}
     */
    getDefaultIndicators() {
        return {
            centralButtonClicks: {
                detected: false,
                count: 0,
                threshold: 5,
                description: 'Clicks consistently hitting exact center of buttons',
                details: [],
                confidence: 0
            },
            clicksWithoutMouseMovement: {
                detected: false,
                count: 0,
                threshold: 3,
                description: 'Clicks occurring without prior mouse movement',
                details: [],
                confidence: 0
            },
            nonHumanScrolling: {
                detected: false,
                count: 0,
                threshold: 2,
                description: 'Scrolling patterns inconsistent with human behavior',
                details: [],
                confidence: 0
            },
            artificialTiming: {
                detected: false,
                count: 0,
                threshold: 3,
                description: 'Timing patterns too regular or mechanical',
                details: [],
                confidence: 0
            },
            missingMouseTrails: {
                detected: false,
                count: 0,
                threshold: 2,
                description: 'Missing intermediate mouse position data',
                details: [],
                confidence: 0
            }
        };
    }

    /**
     * Update behavioral indicator
     * @param {string} indicatorName 
     * @param {Object} data 
     */
    updateIndicator(indicatorName, data) {
        try {
            const current = this.getRawData() || { indicators: this.getDefaultIndicators() };
            
            if (!current.indicators) {
                current.indicators = this.getDefaultIndicators();
            }

            if (!current.indicators[indicatorName]) {
                _log.warn(`Unknown indicator: ${indicatorName}`);
                return;
            }

            const indicator = current.indicators[indicatorName];
            
            // Update count and detection status
            if (data.increment) {
                indicator.count += 1;
                indicator.detected = indicator.count >= indicator.threshold;
            }

            // Add detail if provided
            if (data.detail) {
                indicator.details.push({
                    timestamp: Date.now(),
                    ...data.detail
                });
                
                // Keep only last 20 details to prevent storage bloat
                if (indicator.details.length > 20) {
                    indicator.details = indicator.details.slice(-20);
                }
            }

            // Update confidence score
            if (data.confidence !== undefined) {
                indicator.confidence = Math.max(indicator.confidence, data.confidence);
            }

            // Force detection if confidence is high enough
            if (indicator.confidence >= 0.8) {
                indicator.detected = true;
            }

            this.setRawData(current);
            
            // Dispatch custom event for real-time updates
            this.dispatchIndicatorUpdate(indicatorName, indicator);
            
        } catch (error) {
            _log.error(`BehavioralStorage: Error updating ${indicatorName}:`, error);
        }
    }

    /**
     * Dispatch custom event for indicator updates
     * @param {string} indicatorName 
     * @param {Object} indicator 
     */
    dispatchIndicatorUpdate(indicatorName, indicator) {
        try {
            // Get the most recent detail for real-time analysis
            const lastDetail = indicator.details && indicator.details.length > 0 
                ? indicator.details[indicator.details.length - 1] 
                : null;
            
            const event = new CustomEvent('behavioralIndicatorUpdate', {
                detail: {
                    indicatorName,
                    indicator: {
                        ...indicator,
                        lastDetail: lastDetail
                    },
                    timestamp: Date.now()
                }
            });
            window.dispatchEvent(event);
        } catch (error) {
            _log.warn('BehavioralStorage: Error dispatching event:', error);
        }
    }

    /**
     * Get detection summary
     * @returns {Object}
     */
    getDetectionSummary() {
        const indicators = this.getBehavioralIndicators();
        
        const detected = Object.keys(indicators).filter(key => indicators[key].detected);
        const totalCount = Object.values(indicators).reduce((sum, ind) => sum + ind.count, 0);
        const maxConfidence = Math.max(...Object.values(indicators).map(ind => ind.confidence));
        
        const riskLevel = this.calculateRiskLevel(detected.length, maxConfidence);
        
        return {
            detectedCount: detected.length,
            totalIndicators: Object.keys(indicators).length,
            detectedTypes: detected,
            totalEvents: totalCount,
            maxConfidence,
            riskLevel,
            summary: this.generateSummaryText(detected.length, riskLevel)
        };
    }

    /**
     * Calculate risk level based on detected indicators
     * @param {number} detectedCount 
     * @param {number} maxConfidence 
     * @returns {string}
     */
    calculateRiskLevel(detectedCount, maxConfidence) {
        if (detectedCount >= 3 || maxConfidence >= 0.9) {
            return 'HIGH';
        } else if (detectedCount >= 2 || maxConfidence >= 0.7) {
            return 'MEDIUM';
        } else if (detectedCount >= 1 || maxConfidence >= 0.5) {
            return 'LOW';
        }
        return 'NONE';
    }

    /**
     * Generate summary text
     * @param {number} detectedCount 
     * @param {string} riskLevel 
     * @returns {string}
     */
    generateSummaryText(detectedCount, riskLevel) {
        if (riskLevel === 'HIGH') {
            return `Strong evidence of automated behavior (${detectedCount} indicators detected)`;
        } else if (riskLevel === 'MEDIUM') {
            return `Moderate signs of automated behavior (${detectedCount} indicators detected)`;
        } else if (riskLevel === 'LOW') {
            return `Weak signs of automated behavior (${detectedCount} indicators detected)`;
        }
        return 'No clear signs of automated behavior detected';
    }

    /**
     * Reset specific indicator
     * @param {string} indicatorName 
     */
    resetIndicator(indicatorName) {
        try {
            const current = this.getRawData() || { indicators: this.getDefaultIndicators() };
            
            if (current.indicators && current.indicators[indicatorName]) {
                current.indicators[indicatorName] = {
                    ...this.getDefaultIndicators()[indicatorName],
                    threshold: current.indicators[indicatorName].threshold
                };
                
                this.setRawData(current);
                this.dispatchIndicatorUpdate(indicatorName, current.indicators[indicatorName]);
            }
        } catch (error) {
            _log.error(`BehavioralStorage: Error resetting ${indicatorName}:`, error);
        }
    }

    /**
     * Clear all behavioral data
     */
    clearAll() {
        try {
            if (this.isStorageAvailable()) {
                localStorage.removeItem(this.storageKey);
                sessionStorage.removeItem(this.sessionKey);
            } else {
                this.memoryStorage = {};
                this.memorySession = {};
            }
            
            // Dispatch clear event
            const event = new CustomEvent('behavioralDataCleared', {
                detail: { timestamp: Date.now() }
            });
            window.dispatchEvent(event);
            
            _log.log('BehavioralStorage: All data cleared');
        } catch (error) {
            _log.error('BehavioralStorage: Error clearing data:', error);
        }
    }

    /**
     * Export behavioral data for analysis
     * @returns {Object}
     */
    exportData() {
        try {
            return {
                indicators: this.getBehavioralIndicators(),
                session: this.getSessionData(),
                summary: this.getDetectionSummary(),
                timestamp: Date.now(),
                version: 1
            };
        } catch (error) {
            _log.error('BehavioralStorage: Error exporting data:', error);
            return null;
        }
    }

    /**
     * Import behavioral data
     * @param {Object} data 
     */
    importData(data) {
        try {
            if (data && data.indicators) {
                this.setRawData({ indicators: data.indicators });
                if (data.session) {
                    this.setSessionData(data.session);
                }
                _log.log('BehavioralStorage: Data imported successfully');
                return true;
            }
            return false;
        } catch (error) {
            _log.error('BehavioralStorage: Error importing data:', error);
            return false;
        }
    }
}

// Create global instance
window.BehavioralStorage = window.BehavioralStorage || new BehavioralStorageManager();

// Export for ES6 modules
export { BehavioralStorageManager };
export default window.BehavioralStorage;
