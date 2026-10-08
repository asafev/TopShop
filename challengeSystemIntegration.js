/**
 * Challenge System Integration Module
 * Integrates the challenge manager with the main lab application
 * Handles event listeners and coordination between detection and challenge systems
 */

import { challengeManager } from './challengeManager.js';
import { AIAgentDetector } from './agentDetector.js';

export class ChallengeSystemIntegration {
    constructor() {
        this.isInitialized = false;
        this.eventListeners = [];
    }

    initialize() {
        if (this.isInitialized) {
            console.warn('⚠️ Challenge System Integration already initialized');
            return;
        }

        console.log('🚀 Initializing Challenge System Integration...');

        // Reset challenge state on page load (fresh start for each page visit)
        challengeManager.reset();
        console.log('✅ Challenge manager reset on page load - ready for new challenges');

        // Set up all event listeners
        this.setupEventListeners();

        // Make challengeManager available globally for debugging
        window.challengeManager = challengeManager;

        this.isInitialized = true;
        console.log('✅ Challenge System Integration initialized');
        console.log('💡 Tip: Use ChallengeSystemDebugger.help() in console for testing commands');
    }

    setupEventListeners() {
        // Listen for detection completion events from the lab
        this.addEventListener('agent-detection-complete', (event) => {
            console.log('📡 [CHALLENGE] Received agent-detection-complete event', event.detail);

            if (event.detail && event.detail.results) {
                challengeManager.processAIAgentDetection(event.detail.results);
            }
        });

        // Listen for behavioral detection events from the lab
        this.addEventListener('behavioral-analysis-update', (event) => {
            console.log('📡 [CHALLENGE] Received behavioral-analysis-update event');
            console.log('   → Indicators:', event.detail?.indicators);

            if (event.detail && event.detail.indicators) {
                // Log specific click count for debugging
                const clickIndicator = event.detail.indicators.clicksWithoutMouseMovement;
                if (clickIndicator) {
                    console.log(`   → Clicks without movement: ${clickIndicator.count}/${clickIndicator.threshold}`);
                }

                challengeManager.processBehavioralDetection(event.detail);
            }
        });

        // Listen for challenge completion (application can act on this)
        this.addEventListener('challenge-completed', (event) => {
            console.log('✅ [CHALLENGE] Challenge completed by agent:', event.detail);

            // Custom handling for challenge completion
            this.onChallengeCompleted(event.detail);
        });

        // Listen for challenge dismissal
        this.addEventListener('challenge-dismissed', (event) => {
            console.log('❌ [CHALLENGE] Challenge dismissed without completion:', event.detail);

            // Custom handling for challenge dismissal
            this.onChallengeDismissed(event.detail);
        });

        // Listen for getBoundingClientRect detections
        this.addEventListener('getBoundingClientRect-detected', (event) => {
            console.log('🔍 [DETECTION] getBoundingClientRect detected:', event.detail);
            
            // You can integrate this with your challenge system if needed
            // For example, track as an automation signal
        });
    }

    addEventListener(eventName, handler) {
        const wrappedHandler = (event) => {
            try {
                handler(event);
            } catch (error) {
                console.error(`Error in ${eventName} handler:`, error);
            }
        };

        document.addEventListener(eventName, wrappedHandler);
        this.eventListeners.push({ eventName, handler: wrappedHandler });
    }

    onChallengeCompleted(detail) {
        // You can add custom handling here, e.g.:
        // - Update UI to show agent info
        // - Enable/disable certain features
        // - Send to analytics
        
        // Example: Update page title
        if (detail.agentInfo) {
            document.title = `🤖 ${detail.agentInfo.name || 'AI Agent'} - Behavioral Lab`;
        }
    }

    onChallengeDismissed(detail) {
        // You can add custom handling here, e.g.:
        // - Show warning message
        // - Restrict page functionality
        // - Log the dismissal
        
        console.warn('Challenge was dismissed without completion', detail);
    }

    destroy() {
        // Clean up all event listeners
        this.eventListeners.forEach(({ eventName, handler }) => {
            document.removeEventListener(eventName, handler);
        });
        this.eventListeners = [];
        this.isInitialized = false;
        console.log('🗑️ Challenge System Integration destroyed');
    }

    getStatus() {
        return {
            isInitialized: this.isInitialized,
            listenerCount: this.eventListeners.length,
            challengeState: challengeManager.getState()
        };
    }
}

// Create singleton instance
const challengeSystemIntegration = new ChallengeSystemIntegration();

// Auto-initialize when module loads
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => {
        challengeSystemIntegration.initialize();
    });
} else {
    // DOM already loaded
    challengeSystemIntegration.initialize();
}

export default challengeSystemIntegration;
