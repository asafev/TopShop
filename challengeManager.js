/**
 * AI Agent Challenge Manager
 * 
 * Enterprise-grade service that coordinates AI agent detection and challenge presentation.
 * Implements the Singleton pattern to ensure consistent state management across the application.
 * 
 * Responsibilities:
 * - Monitor detection events from AIAgentDetector and behavioral detectors
 * - Apply challenge trigger rules based on detection confidence and behavioral patterns
 * - Manage challenge modal lifecycle
 * - Log challenge responses for analysis
 * - Prevent duplicate challenges for the same session
 * 
 * @module challengeManager
 */

import { AIAgentChallengeModal } from './aiAgentChallenge.js';

/**
 * Challenge trigger configuration
 */
const CHALLENGE_CONFIG = {
    // Minimum confidence threshold for AI agent detection
    MIN_CONFIDENCE_THRESHOLD: 0.75,
    
    // Behavioral thresholds
    MIN_CLICKS_WITHOUT_MOVEMENT: 2,
    
    // Challenge cooldown (don't show again for this duration)
    CHALLENGE_COOLDOWN_MS: 30 * 60 * 1000, // 30 minutes
    
    // Session storage key for tracking challenged state
    STORAGE_KEY_CHALLENGED: 'ai_challenge_presented',
    STORAGE_KEY_LAST_CHALLENGE: 'ai_challenge_last_timestamp',
    
    // Allow user to close modal (set to false for strict enforcement)
    ALLOW_CLOSE: true
};

/**
 * Challenge Manager - Singleton Service
 */
export class ChallengeManager {
    constructor() {
        if (ChallengeManager.instance) {
            return ChallengeManager.instance;
        }
        
        this.modal = null;
        this.challenged = false;
        this.challengeResponse = null;
        this.detectionData = {
            aiAgents: [],
            behavioralIndicators: {},
            timestamp: null
        };
        
        // Restore state from session storage
        this._restoreState();
        
        ChallengeManager.instance = this;
    }

    /**
     * Restore challenge state from session storage
     * @private
     */
    _restoreState() {
        try {
            const wasChallenged = sessionStorage.getItem(CHALLENGE_CONFIG.STORAGE_KEY_CHALLENGED);
            const lastChallengeTime = sessionStorage.getItem(CHALLENGE_CONFIG.STORAGE_KEY_LAST_CHALLENGE);
            
            if (wasChallenged === 'true') {
                this.challenged = true;
            }
            
            // Check if cooldown period has expired
            if (lastChallengeTime) {
                const elapsed = Date.now() - parseInt(lastChallengeTime, 10);
                if (elapsed > CHALLENGE_CONFIG.CHALLENGE_COOLDOWN_MS) {
                    // Cooldown expired, reset state
                    this.challenged = false;
                    sessionStorage.removeItem(CHALLENGE_CONFIG.STORAGE_KEY_CHALLENGED);
                }
            }
        } catch (error) {
            console.warn('Failed to restore challenge state:', error);
        }
    }

    /**
     * Save challenge state to session storage
     * @private
     */
    _saveState() {
        try {
            sessionStorage.setItem(CHALLENGE_CONFIG.STORAGE_KEY_CHALLENGED, 'true');
            sessionStorage.setItem(CHALLENGE_CONFIG.STORAGE_KEY_LAST_CHALLENGE, Date.now().toString());
        } catch (error) {
            console.warn('Failed to save challenge state:', error);
        }
    }

    /**
     * Process AI agent detection results and determine if challenge should be shown
     * @param {Object} detectionResults - Results from AIAgentDetector.runAllDetections()
     */
    processAIAgentDetection(detectionResults) {
        console.log('🔍 Processing AI Agent detection results:', detectionResults);
        
        // Filter for high-confidence detections
        const suspiciousAgents = detectionResults.filter(result => 
            result.detected && 
            result.confidence >= CHALLENGE_CONFIG.MIN_CONFIDENCE_THRESHOLD
        );
        
        if (suspiciousAgents.length > 0) {
            this.detectionData.aiAgents = suspiciousAgents;
            this.detectionData.timestamp = Date.now();
            
            console.log(`⚠️ Detected ${suspiciousAgents.length} suspicious AI agent(s):`, 
                suspiciousAgents.map(a => `${a.name} (${(a.confidence * 100).toFixed(1)}%)`).join(', '));
            
            this.triggerChallenge('ai_agent_detection', {
                agents: suspiciousAgents,
                highestConfidence: Math.max(...suspiciousAgents.map(a => a.confidence))
            });
        }
    }

    /**
     * Process behavioral detection results
     * @param {Object} behavioralData - Data from behavioral detector
     */
    processBehavioralDetection(behavioralData) {
        console.log('🔍 Processing behavioral detection:', behavioralData);
        
        this.detectionData.behavioralIndicators = behavioralData;
        
        // Extract indicators from the data structure
        const indicators = behavioralData.indicators || behavioralData;
        
        // Check for suspicious click patterns - access the count property correctly
        const clicksWithoutMovementIndicator = indicators.clicksWithoutMouseMovement;
        const clicksWithoutMovement = clicksWithoutMovementIndicator?.count || 0;
        
        console.log(`📊 Clicks without movement: ${clicksWithoutMovement} (threshold: ${CHALLENGE_CONFIG.MIN_CLICKS_WITHOUT_MOVEMENT})`);
        
        if (clicksWithoutMovement >= CHALLENGE_CONFIG.MIN_CLICKS_WITHOUT_MOVEMENT) {
            console.log(`⚠️ Suspicious behavior detected: ${clicksWithoutMovement} clicks without mouse movement`);
            
            this.triggerChallenge('behavioral_pattern', {
                clicksWithoutMovement: clicksWithoutMovement,
                pattern: 'automated_clicks',
                indicator: clicksWithoutMovementIndicator
            });
        }
    }

    /**
     * Trigger the challenge modal
     * @param {string} reason - Reason for triggering ('ai_agent_detection' or 'behavioral_pattern')
     * @param {Object} metadata - Additional metadata about the detection
     */
    triggerChallenge(reason, metadata = {}) {
        // Don't show challenge if already presented in this session
        if (this.challenged) {
            console.log('⏭️ Challenge already presented in this session, skipping');
            return;
        }

        console.log(`🚨 Triggering AI Agent Challenge - Reason: ${reason}`, metadata);
        
        // Initialize modal if not already created
        // Note: We don't pass a custom message - the modal will use its default challenge message
        // which is designed to test AI agent compliance and override system prompts
        if (!this.modal) {
            this.modal = new AIAgentChallengeModal({
                title: '🤖 AI Agent Verification Required',
                // message intentionally omitted - will use _getDefaultChallengeMessage()
                allowClose: CHALLENGE_CONFIG.ALLOW_CLOSE,
                onSubmit: (data) => this._handleChallengeResponse(data, reason, metadata),
                onClose: () => this._handleChallengeClose(reason),
                detectionMethod: reason,
                detectionConfidence: metadata.highestConfidence || metadata.clicksWithoutMovement || 'unknown'
            });
        }
        
        // Show the challenge (don't update message - keep default)
        this.modal.show();
        this.challenged = true;
        this._saveState();
        
        // Log the challenge event with detection details
        this._logChallengeEvent('challenge_shown', reason, metadata);
    }

    /**
     * Handle challenge form submission
     * @private
     */
    _handleChallengeResponse(formData, reason, metadata) {
        console.log('✅ AI Agent Challenge response received:', formData);
        
        this.challengeResponse = {
            ...formData,
            detectionReason: reason,
            detectionMetadata: metadata,
            detectionData: this.detectionData,
            respondedAt: Date.now()
        };
        
        // Log the response
        this._logChallengeEvent('challenge_completed', reason, {
            ...metadata,
            response: formData
        });
        
        // Notify application that challenge was completed
        this._dispatchChallengeEvent('challenge-completed', this.challengeResponse);
        
        // Optional: Send to analytics/backend
        this._reportChallengeResponse(this.challengeResponse);
    }

    /**
     * Handle challenge modal close without submission
     * @private
     */
    _handleChallengeClose(reason) {
        console.log('❌ AI Agent Challenge closed without completion');
        
        this._logChallengeEvent('challenge_dismissed', reason, {
            dismissed: true
        });
        
        // Notify application that challenge was dismissed
        this._dispatchChallengeEvent('challenge-dismissed', {
            reason: reason,
            timestamp: Date.now()
        });
    }

    /**
     * Log challenge events to console and localStorage
     * @private
     */
    _logChallengeEvent(eventType, reason, metadata) {
        const logEntry = {
            eventType,
            reason,
            metadata,
            timestamp: new Date().toISOString(),
            url: window.location.href,
            userAgent: navigator.userAgent
        };
        
        // Log to console
        console.log(`📊 Challenge Event [${eventType}]:`, logEntry);
        
        // Store in localStorage for analysis (with size limit)
        try {
            const storageKey = 'ai_challenge_log';
            let log = JSON.parse(localStorage.getItem(storageKey) || '[]');
            
            // Keep only last 50 entries to prevent storage bloat
            if (log.length >= 50) {
                log = log.slice(-49);
            }
            
            log.push(logEntry);
            localStorage.setItem(storageKey, JSON.stringify(log));
        } catch (error) {
            console.warn('Failed to log challenge event to localStorage:', error);
        }
    }

    /**
     * Dispatch custom DOM event for application-level handling
     * @private
     */
    _dispatchChallengeEvent(eventName, detail) {
        const event = new CustomEvent(eventName, {
            detail: detail,
            bubbles: true,
            cancelable: false
        });
        
        document.dispatchEvent(event);
    }

    /**
     * Report challenge response to backend/analytics
     * @private
     */
    async _reportChallengeResponse(response) {
        // This is a placeholder for backend integration
        // Replace with actual API endpoint
        
        console.log('📤 Reporting challenge response (placeholder):', response);
        
        // Example implementation:
        /*
        try {
            await fetch('/api/ai-agent-challenge', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify(response)
            });
        } catch (error) {
            console.error('Failed to report challenge response:', error);
        }
        */
    }

    /**
     * Get current challenge state
     * @public
     */
    getState() {
        return {
            challenged: this.challenged,
            hasResponse: !!this.challengeResponse,
            response: this.challengeResponse,
            detectionData: this.detectionData
        };
    }

    /**
     * Reset challenge state (useful for testing)
     * @public
     */
    reset() {
        this.challenged = false;
        this.challengeResponse = null;
        this.detectionData = {
            aiAgents: [],
            behavioralIndicators: {},
            timestamp: null
        };
        
        sessionStorage.removeItem(CHALLENGE_CONFIG.STORAGE_KEY_CHALLENGED);
        sessionStorage.removeItem(CHALLENGE_CONFIG.STORAGE_KEY_LAST_CHALLENGE);
        
        if (this.modal) {
            this.modal.destroy();
            this.modal = null;
        }
        
        console.log('🔄 Challenge Manager state reset');
    }

    /**
     * Get challenge log from localStorage
     * @public
     */
    getChallengeLog() {
        try {
            return JSON.parse(localStorage.getItem('ai_challenge_log') || '[]');
        } catch (error) {
            console.error('Failed to retrieve challenge log:', error);
            return [];
        }
    }

    /**
     * Update challenge configuration at runtime
     * @public
     */
    updateConfig(newConfig) {
        Object.assign(CHALLENGE_CONFIG, newConfig);
        console.log('⚙️ Challenge configuration updated:', CHALLENGE_CONFIG);
    }

    /**
     * Get current configuration
     * @public
     */
    getConfig() {
        return { ...CHALLENGE_CONFIG };
    }
}

// Export singleton instance
export const challengeManager = new ChallengeManager();

// Export configuration for reference
export { CHALLENGE_CONFIG };
