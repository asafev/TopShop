/**
 * AI Agent Challenge System - Testing & Debugging Helper
 * 
 * This file provides utilities to test and debug the challenge system.
 * Import this in the browser console or add to index.html for testing.
 */

// Make this available globally for testing
window.ChallengeSystemDebugger = {
    
    /**
     * Test behavioral detection trigger
     * Simulates detecting clicks without mouse movement
     */
    testBehavioralTrigger(clickCount = 3) {
        console.log(`🧪 Testing behavioral trigger with ${clickCount} clicks...`);
        
        // Simulate the exact data structure from lab.js
        const mockBehavioralData = {
            indicators: {
                clicksWithoutMouseMovement: {
                    count: clickCount,
                    detected: clickCount >= 2,
                    threshold: 3,
                    confidence: 0.85,
                    details: [
                        { timestamp: Date.now(), scenario: 'test_trigger' }
                    ]
                },
                centralButtonClicks: {
                    count: 0,
                    detected: false
                },
                nonHumanScrolling: {
                    count: 0,
                    detected: false
                },
                artificialTiming: {
                    count: 0,
                    detected: false
                },
                missingMouseTrails: {
                    count: 0,
                    detected: false
                }
            },
            summary: {
                riskLevel: 'Medium',
                detectedCount: 1,
                maxConfidence: 0.85
            },
            timestamp: Date.now()
        };
        
        // Trigger the challenge manager
        if (window.challengeManager) {
            window.challengeManager.processBehavioralDetection(mockBehavioralData);
        } else {
            console.error('❌ challengeManager not found on window object');
        }
    },
    
    /**
     * Test AI agent detection trigger
     * Simulates detecting a high-confidence AI agent
     */
    testAIAgentTrigger(agentName = 'Playwright', confidence = 0.95) {
        console.log(`🧪 Testing AI agent trigger with ${agentName} at ${confidence * 100}% confidence...`);
        
        const mockDetectionResults = [
            {
                name: agentName,
                detected: true,
                confidence: confidence,
                timestamp: Date.now(),
                detectionMethod: 'Test Simulation',
                indicators: [
                    {
                        name: 'Test_Indicator',
                        description: 'Simulated detection for testing',
                        value: 'test_value'
                    }
                ]
            }
        ];
        
        // Trigger the challenge manager
        if (window.challengeManager) {
            window.challengeManager.processAIAgentDetection(mockDetectionResults);
        } else {
            console.error('❌ challengeManager not found on window object');
        }
    },
    
    /**
     * Check current challenge state
     */
    checkState() {
        if (!window.challengeManager) {
            console.error('❌ challengeManager not found');
            return null;
        }
        
        const state = window.challengeManager.getState();
        console.log('📊 Current Challenge State:', state);
        console.table({
            'Already Challenged': state.challenged,
            'Has Response': state.hasResponse,
            'AI Agents Detected': state.detectionData.aiAgents.length,
            'Has Behavioral Data': !!state.detectionData.behavioralIndicators
        });
        
        return state;
    },
    
    /**
     * Reset challenge state (for testing)
     */
    resetChallenge() {
        console.log('🔄 Resetting challenge state...');
        
        if (window.challengeManager) {
            window.challengeManager.reset();
            console.log('✅ Challenge state reset successfully');
        } else {
            console.error('❌ challengeManager not found');
        }
    },
    
    /**
     * View challenge log
     */
    viewLog() {
        if (!window.challengeManager) {
            console.error('❌ challengeManager not found');
            return [];
        }
        
        const log = window.challengeManager.getChallengeLog();
        console.log('📜 Challenge Log (' + log.length + ' entries):');
        console.table(log);
        
        return log;
    },
    
    /**
     * Get current configuration
     */
    viewConfig() {
        if (!window.challengeManager) {
            console.error('❌ challengeManager not found');
            return null;
        }
        
        const config = window.challengeManager.getConfig();
        console.log('⚙️ Current Configuration:');
        console.table(config);
        
        return config;
    },
    
    /**
     * Update configuration
     */
    updateConfig(newConfig) {
        console.log('⚙️ Updating configuration:', newConfig);
        
        if (window.challengeManager) {
            window.challengeManager.updateConfig(newConfig);
            console.log('✅ Configuration updated');
            this.viewConfig();
        } else {
            console.error('❌ challengeManager not found');
        }
    },
    
    /**
     * Test the full flow - simulates detection and shows modal
     */
    testFullFlow() {
        console.log('🧪 Testing full challenge flow...');
        
        // Reset first
        this.resetChallenge();
        
        // Wait a bit then trigger
        setTimeout(() => {
            console.log('Step 1: Triggering behavioral detection...');
            this.testBehavioralTrigger(4);
        }, 500);
    },
    
    /**
     * Monitor behavioral events in real-time
     */
    monitorBehavioralEvents() {
        console.log('👀 Monitoring behavioral analysis events...');
        
        document.addEventListener('behavioral-analysis-update', (event) => {
            console.log('📡 Behavioral Analysis Update:', event.detail);
            
            if (event.detail.indicators) {
                const clicks = event.detail.indicators.clicksWithoutMouseMovement;
                if (clicks && clicks.count > 0) {
                    console.log(`🖱️ Clicks without movement: ${clicks.count}/${clicks.threshold}`);
                }
            }
        });
        
        console.log('✅ Now listening for behavioral-analysis-update events');
    },
    
    /**
     * Monitor AI agent detection events
     */
    monitorAgentEvents() {
        console.log('👀 Monitoring AI agent detection events...');
        
        document.addEventListener('agent-detection-complete', (event) => {
            console.log('📡 Agent Detection Complete:', event.detail);
        });
        
        console.log('✅ Now listening for agent-detection-complete events');
    },
    
    /**
     * Monitor challenge events
     */
    monitorChallengeEvents() {
        console.log('👀 Monitoring challenge events...');
        
        document.addEventListener('challenge-completed', (event) => {
            console.log('✅ Challenge Completed:', event.detail);
        });
        
        document.addEventListener('challenge-dismissed', (event) => {
            console.log('❌ Challenge Dismissed:', event.detail);
        });
        
        console.log('✅ Now listening for challenge events');
    },
    
    /**
     * Enable all monitoring
     */
    monitorAll() {
        this.monitorBehavioralEvents();
        this.monitorAgentEvents();
        this.monitorChallengeEvents();
        console.log('🎯 All monitoring enabled');
    },
    
    /**
     * Print help
     */
    help() {
        console.log(`
╔════════════════════════════════════════════════════════════╗
║         AI Agent Challenge System - Debug Helper          ║
╚════════════════════════════════════════════════════════════╝

Available Commands:
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Testing:
  testBehavioralTrigger(count)  - Simulate behavioral detection
  testAIAgentTrigger(name, conf) - Simulate AI agent detection
  testFullFlow()                 - Test complete flow
  
State Management:
  checkState()                   - View current state
  resetChallenge()               - Reset challenge state
  viewLog()                      - View challenge log
  
Configuration:
  viewConfig()                   - View current config
  updateConfig({...})            - Update configuration
  
Monitoring:
  monitorBehavioralEvents()      - Listen for behavioral events
  monitorAgentEvents()           - Listen for AI detection events
  monitorChallengeEvents()       - Listen for challenge events
  monitorAll()                   - Enable all monitoring
  
Examples:
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  // Test with 5 clicks without movement
  ChallengeSystemDebugger.testBehavioralTrigger(5);
  
  // Test AI agent detection
  ChallengeSystemDebugger.testAIAgentTrigger('Puppeteer', 0.9);
  
  // Check current state
  ChallengeSystemDebugger.checkState();
  
  // Reset and test again
  ChallengeSystemDebugger.resetChallenge();
  ChallengeSystemDebugger.testFullFlow();
  
  // Lower threshold for testing
  ChallengeSystemDebugger.updateConfig({
      MIN_CLICKS_WITHOUT_MOVEMENT: 1
  });
  
  // Enable real-time monitoring
  ChallengeSystemDebugger.monitorAll();

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
        `);
    }
};

// Auto-print help when loaded
console.log('🛠️ Challenge System Debugger loaded!');
console.log('💡 Type: ChallengeSystemDebugger.help() for available commands');

// Export for module usage
export default window.ChallengeSystemDebugger;
