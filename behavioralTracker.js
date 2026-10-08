/**
 * Standalone Behavioral Tracker for Fingerprinting
 * Runs behavioral analysis independently from the main lab
 * Collects mouse movements, clicks, and scroll patterns for bot detection
 */

import { BehavioralStorageManager } from './behavioralStorage.js';
import { BehavioralIndicatorsDetector } from './behavioralDetector.js';

/**
 * Safe function wrapper - catches errors and returns default value
 * @param {Function} fn - Function to execute
 * @param {*} defaultValue - Default value on error
 * @returns {*} Result or default value
 */
function safeCall(fn, defaultValue = null) {
    try {
        return fn();
    } catch (e) {
        console.warn('⚠️ Safe call failed:', e.message);
        return defaultValue;
    }
}

export class StandaloneBehavioralTracker {
    constructor(options = {}) {
        this.duration = options.duration || 1000; // 1 second default
        this.storagePrefix = options.storagePrefix || 'fp_behavioral_'; // Different from lab's prefix
        this.enabled = false;
        this.startTime = 0;
        this.initializationError = null;
        
        // Create isolated storage manager (won't conflict with lab) - with error handling
        try {
            this.storage = new BehavioralStorageManager();
            
            // Override storage prefix to avoid conflicts
            if (this.storage && this.storage.storagePrefix) {
                this.storage.storagePrefix = this.storagePrefix;
            }
        } catch (error) {
            console.warn('⚠️ Failed to create BehavioralStorageManager:', error.message);
            this.storage = null;
            this.initializationError = error.message;
        }
        
        // Create detector with error handling
        try {
            this.detector = this.storage ? new BehavioralIndicatorsDetector(this.storage) : null;
        } catch (error) {
            console.warn('⚠️ Failed to create BehavioralIndicatorsDetector:', error.message);
            this.detector = null;
            this.initializationError = this.initializationError || error.message;
        }
        
        // Track if we're currently collecting
        this.isCollecting = false;
        
        // Event handlers (stored for cleanup)
        this._mouseMoveHandler = null;
        this._clickHandler = null;
        this._scrollHandler = null;
        
        console.log('🔍 Standalone Behavioral Tracker initialized', {
            duration: this.duration,
            storagePrefix: this.storagePrefix,
            storageAvailable: !!this.storage,
            detectorAvailable: !!this.detector
        });
    }
    
    /**
     * Start behavioral data collection for fingerprinting
     * This method never throws - always returns valid data structure
     * @returns {Promise<Object>} Behavioral indicators after duration
     */
    async collectBehavioralData() {
        // Return default data structure if not properly initialized
        const defaultResult = {
            indicators: {},
            summary: {
                summary: 'Behavioral collection unavailable',
                riskLevel: 'UNKNOWN',
                detectedCount: 0,
                totalEvents: 0,
                maxConfidence: 0
            },
            telemetry: this._getDefaultTelemetry(),
            collectionDuration: 0,
            metadata: {
                startTime: 0,
                endTime: 0,
                storagePrefix: this.storagePrefix,
                error: this.initializationError || 'Unknown error'
            }
        };
        
        if (!this.storage || !this.detector) {
            console.warn('⚠️ Behavioral tracker not properly initialized');
            return defaultResult;
        }
        
        if (this.isCollecting) {
            console.warn('⚠️ Behavioral collection already in progress');
            try {
                return {
                    indicators: this.storage.getBehavioralIndicators() || {},
                    summary: this.storage.getDetectionSummary() || defaultResult.summary,
                    telemetry: this.getTelemetryStats(),
                    collectionDuration: performance.now() - this.startTime,
                    metadata: { inProgress: true }
                };
            } catch (e) {
                return defaultResult;
            }
        }
        
        console.log(`🎯 Starting behavioral collection for ${this.duration}ms`);
        
        try {
            // Clear any previous data to avoid pollution
            this.storage.clearAll();
        } catch (e) {
            console.warn('⚠️ Failed to clear storage:', e.message);
        }
        
        this.isCollecting = true;
        this.enabled = true;
        this.startTime = performance.now();
        
        // Setup event listeners with error handling
        try {
            this._setupEventListeners();
        } catch (e) {
            console.warn('⚠️ Failed to setup event listeners:', e.message);
        }
        
        // Wait for the collection duration
        try {
            await this._waitForDuration();
        } catch (e) {
            console.warn('⚠️ Wait duration failed:', e.message);
            // Wait manually as fallback
            await new Promise(resolve => setTimeout(resolve, this.duration));
        }
        
        // Stop collection
        try {
            this.stop();
        } catch (e) {
            console.warn('⚠️ Failed to stop collection:', e.message);
            this.enabled = false;
            this.isCollecting = false;
        }
        
        // Return collected data with safe accessors
        const indicators = safeCall(() => this.storage.getBehavioralIndicators(), {});
        const summary = safeCall(() => this.storage.getDetectionSummary(), defaultResult.summary);
        const telemetry = safeCall(() => this.getTelemetryStats(), this._getDefaultTelemetry());
        
        console.log('✅ Behavioral collection complete:', {
            duration: performance.now() - this.startTime,
            indicatorsFound: Object.keys(indicators || {}).length,
            telemetry,
            summary
        });
        
        return {
            indicators: indicators || {},
            summary: summary || defaultResult.summary,
            telemetry: telemetry || this._getDefaultTelemetry(),
            collectionDuration: performance.now() - this.startTime,
            metadata: {
                startTime: this.startTime,
                endTime: performance.now(),
                storagePrefix: this.storagePrefix
            }
        };
    }
    
    /**
     * Get default telemetry structure for fallback
     * @private
     */
    _getDefaultTelemetry() {
        return {
            totalMouseMoves: 0,
            totalClicks: 0,
            totalScrolls: 0,
            totalMouseDistance: 0,
            averageMouseVelocity: 0,
            maxMouseVelocity: 0,
            mouseMovementCount: 0,
            averageClickInterval: 0,
            clickRate: 0,
            totalScrollDistance: 0,
            averageScrollDistance: 0,
            averageScrollInterval: 0,
            scrollRate: 0,
            collectionDurationMs: 0,
            collectionDurationSec: 0,
            eventsPerSecond: 0,
            mouseToClickRatio: 0,
            hasMouseActivity: false,
            hasClickActivity: false,
            hasScrollActivity: false
        };
    }
    
    /**
     * Setup event listeners for behavioral tracking
     * @private
     */
    _setupEventListeners() {
        // Mouse movement tracking
        this._mouseMoveHandler = (e) => {
            if (!this.enabled) return;
            
            this.detector.trackMouseMovement({
                x: e.clientX,
                y: e.clientY,
                timestamp: performance.now(),
                isTrusted: e.isTrusted
            });
        };
        
        // Click tracking
        this._clickHandler = (e) => {
            if (!this.enabled) return;
            
            const target = e.target;
            const rect = target.getBoundingClientRect();
            
            const clickData = {
                t: performance.now(),
                x: e.clientX,
                y: e.clientY,
                target: this._getElementSelector(target),
                elementInfo: {
                    tagName: target.tagName.toLowerCase(),
                    id: target.id || '',
                    className: target.className || '',
                    isClickable: this._isElementClickable(target)
                },
                elementBounds: {
                    width: rect.width,
                    height: rect.height
                },
                elementPosition: {
                    x: e.clientX - rect.left,
                    y: e.clientY - rect.top
                },
                isTrusted: e.isTrusted
            };
            
            this.detector.analyzeClick(clickData);
            
            console.log('👆 Click tracked:', {
                target: clickData.target,
                position: `${Math.round(clickData.x)},${Math.round(clickData.y)}`,
                isTrusted: e.isTrusted
            });
        };
        
        // Scroll tracking - use 'wheel' event for deltaY/deltaX data
        this._scrollHandler = (e) => {
            if (!this.enabled) return;
            this.detector.analyzeScroll(e);
            
            console.log('📜 Scroll tracked:', {
                deltaY: e.deltaY,
                deltaX: e.deltaX,
                scrollTop: window.pageYOffset || document.documentElement.scrollTop
            });
        };
        
        // Attach listeners with passive flag for performance
        try {
            document.addEventListener('mousemove', this._mouseMoveHandler, { passive: true });
            document.addEventListener('click', this._clickHandler, { passive: true });
            // Use 'wheel' event instead of 'scroll' to get deltaY/deltaX values
            window.addEventListener('wheel', this._scrollHandler, { passive: true });
            console.log('📡 Behavioral event listeners attached');
        } catch (e) {
            console.warn('⚠️ Failed to attach some event listeners:', e.message);
        }
    }
    
    /**
     * Wait for the collection duration
     * @private
     */
    _waitForDuration() {
        return new Promise(resolve => {
            const checkInterval = 100; // Check every 100ms
            let elapsed = 0;
            
            const interval = setInterval(() => {
                elapsed += checkInterval;
                
                // Emit progress event (can be used by UI) - with error handling
                try {
                    if (window.dispatchEvent) {
                        window.dispatchEvent(new CustomEvent('behavioralProgress', {
                            detail: {
                                elapsed,
                                duration: this.duration,
                                percentage: (elapsed / this.duration) * 100
                            }
                        }));
                    }
                } catch (e) {
                    // Ignore progress event errors
                }
                
                if (elapsed >= this.duration) {
                    clearInterval(interval);
                    resolve();
                }
            }, checkInterval);
        });
    }
    
    /**
     * Get raw telemetry statistics (not anomaly detection, just counts)
     * This method never throws - always returns valid telemetry object
     * @returns {Object} Raw behavioral statistics
     */
    getTelemetryStats() {
        // Return default if detector not available
        if (!this.detector) {
            return this._getDefaultTelemetry();
        }
        
        try {
            const stats = safeCall(() => this.detector.getStats(), {});
            const mouseTrail = this.detector.mouseTrail || [];
            const clickHistory = this.detector.clickHistory || [];
            const scrollHistory = this.detector.scrollHistory || [];
            const mouseMovementHistory = this.detector.mouseMovementHistory || [];
            
            // Calculate mouse movement statistics
            let totalMouseDistance = 0;
            let totalMouseTime = 0;
            let mouseVelocities = [];
            
            if (mouseMovementHistory.length > 0) {
                for (const movement of mouseMovementHistory) {
                    totalMouseDistance += movement.distance || 0;
                    totalMouseTime += movement.timeDelta || 0;
                    if (movement.velocity > 0) {
                        mouseVelocities.push(movement.velocity);
                    }
                }
            }
            
            const avgMouseVelocity = mouseVelocities.length > 0 
                ? mouseVelocities.reduce((a, b) => a + b, 0) / mouseVelocities.length 
                : 0;
            
            const maxMouseVelocity = mouseVelocities.length > 0 
                ? Math.max(...mouseVelocities) 
                : 0;
            
            // Calculate click statistics
            const clickPositions = clickHistory.map(c => ({
                x: c.x,
                y: c.y,
                target: c.target
            }));
            
            const clickTimestamps = clickHistory.map(c => c.t);
            const clickIntervals = [];
            for (let i = 1; i < clickTimestamps.length; i++) {
                clickIntervals.push(clickTimestamps[i] - clickTimestamps[i - 1]);
            }
            
            const avgClickInterval = clickIntervals.length > 0
                ? clickIntervals.reduce((a, b) => a + b, 0) / clickIntervals.length
                : 0;
            
            // Calculate scroll statistics
            const scrollDeltas = scrollHistory.map(s => Math.abs(s.deltaY || 0));
            const totalScrollDistance = scrollDeltas.reduce((a, b) => a + b, 0);
            const avgScrollDistance = scrollDeltas.length > 0
                ? totalScrollDistance / scrollDeltas.length
                : 0;
            
            const scrollTimestamps = scrollHistory.map(s => s.timestamp);
            const scrollIntervals = [];
            for (let i = 1; i < scrollTimestamps.length; i++) {
                scrollIntervals.push(scrollTimestamps[i] - scrollTimestamps[i - 1]);
            }
            
            const avgScrollInterval = scrollIntervals.length > 0
                ? scrollIntervals.reduce((a, b) => a + b, 0) / scrollIntervals.length
                : 0;
            
            // Collection duration
            const collectionDuration = performance.now() - this.startTime;
            
            return {
                // Raw counts
                totalMouseMoves: mouseTrail.length,
                totalClicks: clickHistory.length,
                totalScrolls: scrollHistory.length,
                
                // Mouse movement metrics
                totalMouseDistance: Math.round(totalMouseDistance),
                averageMouseVelocity: Math.round(avgMouseVelocity * 100) / 100,
                maxMouseVelocity: Math.round(maxMouseVelocity * 100) / 100,
                mouseMovementCount: mouseMovementHistory.length,
                
                // Click metrics
                averageClickInterval: Math.round(avgClickInterval),
                clickRate: collectionDuration > 0 
                    ? Math.round((clickHistory.length / collectionDuration) * 1000 * 100) / 100 
                    : 0, // clicks per second
                
                // Scroll metrics
                totalScrollDistance: Math.round(totalScrollDistance),
                averageScrollDistance: Math.round(avgScrollDistance),
                averageScrollInterval: Math.round(avgScrollInterval),
                scrollRate: collectionDuration > 0
                    ? Math.round((scrollHistory.length / collectionDuration) * 1000 * 100) / 100
                    : 0, // scrolls per second
                
                // Time-based metrics
                collectionDurationMs: Math.round(collectionDuration),
                collectionDurationSec: Math.round(collectionDuration / 1000 * 10) / 10,
                
                // Activity density
                eventsPerSecond: collectionDuration > 0
                    ? Math.round(((mouseTrail.length + clickHistory.length + scrollHistory.length) / collectionDuration) * 1000 * 100) / 100
                    : 0,
                
                // Interaction patterns
                mouseToClickRatio: clickHistory.length > 0 
                    ? Math.round((mouseTrail.length / clickHistory.length) * 10) / 10 
                    : mouseTrail.length > 0 ? Infinity : 0,
                
                // Raw data availability
                hasMouseActivity: mouseTrail.length > 0,
                hasClickActivity: clickHistory.length > 0,
                hasScrollActivity: scrollHistory.length > 0
            };
        } catch (error) {
            console.warn('⚠️ Failed to get telemetry stats:', error.message);
            return this._getDefaultTelemetry();
        }
    }
    
    /**
     * Stop behavioral data collection
     */
    stop() {
        console.log('⏹️ Stopping behavioral collection');
        
        this.enabled = false;
        this.isCollecting = false;
        
        // Remove event listeners safely
        try {
            if (this._mouseMoveHandler) {
                document.removeEventListener('mousemove', this._mouseMoveHandler);
            }
            if (this._clickHandler) {
                document.removeEventListener('click', this._clickHandler);
            }
            if (this._scrollHandler) {
                // Remove 'wheel' event (not 'scroll')
                window.removeEventListener('wheel', this._scrollHandler);
            }
        } catch (e) {
            console.warn('⚠️ Error removing event listeners:', e.message);
        }
        
        console.log('✅ Behavioral collection stopped');
    }
    
    /**
     * Get current behavioral indicators (without stopping)
     * @returns {Object}
     */
    getCurrentIndicators() {
        return this.storage.getBehavioralIndicators();
    }
    
    /**
     * Get detection summary
     * @returns {Object}
     */
    getSummary() {
        if (!this.storage) {
            return {
                summary: 'Storage not available',
                riskLevel: 'UNKNOWN',
                detectedCount: 0,
                totalEvents: 0,
                maxConfidence: 0
            };
        }
        try {
            return this.storage.getDetectionSummary() || {};
        } catch (e) {
            console.warn('⚠️ Failed to get detection summary:', e.message);
            return {};
        }
    }
    
    /**
     * Get detector statistics
     * This method never throws - returns default stats on error
     * @returns {Object}
     */
    getStats() {
        const defaultStats = {
            mouseTrailLength: 0,
            clickHistoryLength: 0,
            scrollHistoryLength: 0
        };
        
        if (!this.detector) {
            return defaultStats;
        }
        
        try {
            return this.detector.getStats() || defaultStats;
        } catch (e) {
            console.warn('⚠️ Failed to get detector stats:', e.message);
            return defaultStats;
        }
    }
    
    /**
     * Get current behavioral indicators (without stopping)
     * @returns {Object}
     */
    getCurrentIndicators() {
        if (!this.storage) {
            return {};
        }
        try {
            return this.storage.getBehavioralIndicators() || {};
        } catch (e) {
            console.warn('⚠️ Failed to get current indicators:', e.message);
            return {};
        }
    }
    
    /**
     * Get element selector (helper)
     * @private
     */
    _getElementSelector(element) {
        try {
            if (!element) return 'unknown';
            if (element.id) return `#${element.id}`;
            if (element.className && typeof element.className === 'string') {
                const classes = element.className.split(' ').filter(c => c.trim());
                if (classes.length > 0) return `.${classes[0]}`;
            }
            return element.tagName ? element.tagName.toLowerCase() : 'unknown';
        } catch (e) {
            return 'unknown';
        }
    }
    
    /**
     * Check if element is clickable (helper)
     * @private
     */
    _isElementClickable(element) {
        try {
            if (!element) return false;
            
            const tagName = element.tagName ? element.tagName.toLowerCase() : '';
            const clickableTags = ['button', 'input', 'select', 'a', 'textarea', 'summary', 'label'];
            
            return clickableTags.includes(tagName) || 
                   element.onclick || 
                   element.hasAttribute('onclick') ||
                   element.getAttribute('role') === 'button' ||
                   element.hasAttribute('tabindex');
        } catch (e) {
            return false;
        }
    }
    
    /**
     * Reset all tracking data
     */
    reset() {
        try {
            if (this.detector) {
                this.detector.reset();
            }
            if (this.storage) {
                this.storage.clearAll();
            }
            console.log('🔄 Behavioral tracker reset');
        } catch (e) {
            console.warn('⚠️ Failed to reset behavioral tracker:', e.message);
        }
    }
}

// Export singleton instance factory
export function createBehavioralTracker(options) {
    return new StandaloneBehavioralTracker(options);
}
