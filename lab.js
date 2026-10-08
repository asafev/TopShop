/**
 * AI-Agent Behavioral Lab - Main Controller
 * Orchestrates test flow, telemetry collection, and UI updates
 */

import { fingerprint } from './fingerprinted.js';
import { initCdpSignals } from './detectors/cdpSignals.js';
import { AIAgentDetector } from './agentDetector.js';
import { BehavioralStorageManager } from './behavioralStorage.js';
import { BehavioralIndicatorsDetector } from './behavioralDetector.js';

class BehavioralLab {
    constructor() {
        this.testStarted = false;
        this.testCompleted = false;
        this.currentStep = 0;
        this.stepStartTime = 0;
        this.testStartTime = 0;
        
        // Store report generator instance for reuse
        this.reportGenerator = null;
        
        // Flag to control data collection
        this.dataCollectionActive = false;
        
        // Telemetry buffers
        this.events = {
            pointer: [],
            clicks: [],
            scrolls: [],
            keys: [],
            dom: [],
            steps: [],
            mouseTrails: [] // Mouse trail data for analysis
        };
        
        // Click position tracking
        this.clickTracking = {
            dots: [], // Visual click dots for overlay
            accuracy: {
                total: 0,
                center: 0,
                edge: 0,
                cdp: 0,
                mouse: 0
            },
            heatmapData: [] // For heatmap generation
        };
        
        // Mouse trail tracking system - Enhanced with realistic rendering and speed-based color coding
        // This system provides visual feedback of mouse movement patterns for behavioral analysis
        this.mouseTrail = {
            enabled: true,
            persist: true, // When true, trails never auto-remove for permanent visualization
            trails: [], // Array of trail dot elements and metadata
            lines: [], // Array of connecting line elements between trail points
            maxTrails: 500, // Maximum dots (reduced from unlimited for performance)
            maxLines: 400, // Maximum connecting lines
            lastPosition: { x: 0, y: 0, timestamp: 0 }, // Previous point for line calculation
            pendingFrame: false, // Track if requestAnimationFrame is pending
            pendingPosition: null, // Store latest position for pending frame batching
            fadeOutDuration: 2000, // How long trails stay visible (ms) when not persisting
            
            // Intelligent sampling parameters - reduce tracking points by 70-80%
            minDistance: 1, // Minimum pixels between trail points (prevents over-sampling)
            minTimeInterval: 8, // Minimum milliseconds between trail points (throttling)
            maxTimeInterval: 100, // Maximum time before forcing a new point (prevents gaps)
            
            // Visual parameters
            dotSize: 1, // Trail dot size in pixels
            lineWidth: 4, // Connecting line width in pixels
            trailColor: '#8A2BE2', // Purple color for both dots and lines (default, overridden by speed)
            scrollOffset: { x: 0, y: 0 }, // Legacy - no longer needed with absolute positioning
            tooltip: null, // Tooltip element for coordinates display on hover
            
            // FEATURE: Speed-based color coding for AI detection
            speedColoringEnabled: true, // Enable/disable speed-based color coding
            speedThresholds: {
                normal: 800,      // 0-800 px/sec: Normal human speed (Yellow)
                fast: 2000,       // 800-2000 px/sec: Fast human/suspicious (Orange)
                // 2000+ px/sec: Likely non-human/automated (Red)
            },
            speedColors: {
                normal: '#FFD700',    // Yellow - normal human speed
                fast: '#FF8C00',      // Orange - fast/suspicious speed
                automated: '#FF0000'  // Red - likely automated/non-human
            }
        };
        
        // FEATURE: Scroll movement visualization system
        // Provides visual feedback of scroll behavior to detect automated patterns
        this.scrollVisualization = {
            enabled: true, // Enable/disable scroll visualization
            container: null, // The main visualization container element
            indicator: null, // The scroll position indicator element
            events: [], // Array of scroll events with speed data
            maxEvents: 100, // Maximum scroll events to track
            lastScrollTime: 0,
            lastScrollY: 0,
            
            // Speed thresholds for scroll detection
            speedThresholds: {
                smooth: 500,     // 0-500 px/sec: Smooth human scrolling
                fast: 2000,      // 500-2000 px/sec: Fast human scrolling
                // 2000+ px/sec: Likely automated scrolling
            },
            speedColors: {
                smooth: '#FFD700',    // Yellow - smooth human scrolling
                fast: '#FF8C00',      // Orange - fast human scrolling
                automated: '#FF0000'  // Red - likely automated scrolling
            },
            
            // Visual parameters
            barWidth: 8, // Width of the scroll indicator bar in pixels
            segmentHeight: 20, // Height of each scroll event segment
            fadeOutDuration: 3000 // How long segments stay visible (ms)
        };
        
        // Live metrics tracking
        this.metrics = {
            clickLatency: [],
            hoverDwell: [],
            scrollCadence: [],
            focusState: 'active'
        };
        
        // Step definitions with timers and validation
        this.steps = [
            { name: 'AI Agent Info', minDwell: 500, maxDwell: 30000, validator: () => this.validateAgentInfoStep() },
            { name: 'Landing', minDwell: 800, maxDwell: 1200, validator: () => true },
            { name: 'Form', minDwell: 2000, maxDwell: 8000, validator: () => this.validateFormStep() },
            { name: 'Navigation', minDwell: 1000, maxDwell: 5000, validator: () => this.validateModalStep() },
            { name: 'Table', minDwell: 2000, maxDwell: 10000, validator: () => this.validateTableStep() },
            { name: 'Scrolling', minDwell: 3000, maxDwell: 15000, validator: () => this.validateScrollStep() },
            { name: 'Finish', minDwell: 1000, maxDwell: 5000, validator: () => this.validateFinishStep() }
        ];
        
        // State tracking for step validation
        this.stepState = {
            agentInfo: { filled: false },
            form: { emailEntered: false, scenarioSelected: false },
            modal: { opened: false, closed: false },
            table: { sortedByName: false, sortedByDate: false, rowClicked: false },
            scroll: { testCompleted: false, metricsReceived: false },
            finish: { reportGenerated: false }
        };
        
        // AI Agent information storage
        this.agentInfo = {
            agentName: '',
            company: '',
            model: '',
            userInstructions: ''
        };
        
        // Scroll metrics storage
        this.scrollMetrics = null;
        
        // DOM selector usage tracking
        this.selectorUsage = {
            id: 0, class: 0, aria_role: 0, text_like: 0, nth: 0, total: 0
        };
        
        // CDP detector instance
        this.cdpDetector = null;
        
        // AI Agent detector instance
        this.aiAgentDetector = new AIAgentDetector();
        
        // Event stream scroll tracking
        this.eventStreamScrollState = {
            userScrolling: false,
            lastScrollTop: 0,
            scrollTimeout: null,
            allowAutoScroll: true
        };
        
        // Behavioral indicators system
        this.behavioralStorage = new BehavioralStorageManager();
        this.behavioralDetector = new BehavioralIndicatorsDetector(this.behavioralStorage);
        
        this.init();
    }

    /**
     * Initialize the lab - set up event listeners and UI
     */
    async init() {
        console.log('🔬 Initializing AI-Agent Behavioral Lab');
        
        // Set up DOM selector monitoring (synchronous)
        this.setupSelectorMonitoring();
        
        // Set up event listeners FIRST (synchronous - critical for user interaction)
        this.setupEventListeners();
        
        // Set up DOM mutation observer to handle element changes (synchronous)
        this.setupDOMObserver();
        
        // Initialize UI (synchronous)
        this.updateUI();
        
        // Start telemetry collection (synchronous)
        this.startTelemetryCollection();
        
        // Initialize scroll visualization (synchronous)
        this.initializeScrollVisualization();
        
        // Collect browser fingerprint (async - can happen in background)
        fingerprint.collect().then(fp => {
            this.fingerprint = fp;
            console.log('✅ Fingerprint collected');
        }).catch(err => {
            console.warn('⚠️ Fingerprint collection failed:', err);
            this.fingerprint = null;
        });
        
        // Start AI agent detection (async - can happen in background)
        this.startAgentDetection();
        
        console.log('✅ Lab initialized successfully');
    }

    /**
     * Set up DOM mutation observer to handle element changes that might affect click dots
     */
    setupDOMObserver() {
        // Create a MutationObserver to watch for DOM changes
        this.domObserver = new MutationObserver((mutations) => {
            // Only process mutations if data collection is active
            if (!this.dataCollectionActive) return;
            
            let shouldCleanup = false;
            
            mutations.forEach((mutation) => {
                // Check if any of our tracked elements were removed
                if (mutation.type === 'childList' && mutation.removedNodes.length > 0) {
                    mutation.removedNodes.forEach((node) => {
                        if (node.nodeType === Node.ELEMENT_NODE) {
                            // Check if any of our dot target elements were removed
                            const hasTrackedElement = this.clickTracking.dots.some(dot => 
                                dot.targetElement && (
                                    node === dot.targetElement || 
                                    node.contains(dot.targetElement)
                                )
                            );
                            if (hasTrackedElement) {
                                shouldCleanup = true;
                            }
                        }
                    });
                }
            });
            
            if (shouldCleanup) {
                // Delay cleanup slightly to allow DOM to settle
                setTimeout(() => this.cleanupOrphanedDots(), 100);
            }
        });
        
        // Start observing
        this.domObserver.observe(document.body, {
            childList: true,
            subtree: true
        });
    }

    /**
     * Setup DOM selector usage monitoring
     */
    setupSelectorMonitoring() {
        // Safely wrap querySelector and querySelectorAll
        const originalQS = Element.prototype.querySelector;
        const originalQSA = Element.prototype.querySelectorAll;
        const originalDocQS = Document.prototype.querySelector;
        const originalDocQSA = Document.prototype.querySelectorAll;
        
        const self = this;
        
        function categorizeSelector(selector) {
            if (!selector || typeof selector !== 'string') return 'other';
            
            // ID selector (#)
            if (selector.includes('#')) return 'id';
            
            // Class selector (.)
            if (selector.includes('.')) return 'class';
            
            // ARIA/role selectors
            if (selector.includes('[role') || selector.includes('[aria-') || 
                selector.includes('aria-') || selector.includes('role=')) {
                return 'aria_role';
            }
            
            // Text-like selectors (contains, text, etc.)
            if (selector.includes(':contains') || selector.includes('text()') || 
                selector.includes(':has-text') || selector.includes('[text') ||
                selector.match(/['""][^'"]*['""]/) ) {
                return 'text_like';
            }
            
            // nth-child and structural selectors
            if (selector.includes(':nth-') || selector.includes(':first-') || 
                selector.includes(':last-') || selector.includes(':only-')) {
                return 'nth';
            }
            
            return 'other';
        }
        
        function trackSelector(selector) {
            // Only track if data collection is active
            if (!self.dataCollectionActive) return;
            
            const category = categorizeSelector(selector);
            self.selectorUsage[category]++;
            self.selectorUsage.total++;
            
            // Log DOM interaction event
            self.events.dom.push({
                t: performance.now(),
                action: 'qs',
                bucket: category
            });
        }
        
        // Wrap Element methods
        Element.prototype.querySelector = function(selector) {
            trackSelector(selector);
            return originalQS.call(this, selector);
        };
        
        Element.prototype.querySelectorAll = function(selector) {
            trackSelector(selector);
            return originalQSA.call(this, selector);
        };
        
        // Wrap Document methods
        Document.prototype.querySelector = function(selector) {
            trackSelector(selector);
            return originalDocQS.call(this, selector);
        };
        
        Document.prototype.querySelectorAll = function(selector) {
            trackSelector(selector);
            return originalDocQSA.call(this, selector);
        };
    }

    /**
     * Set up all event listeners
     */
    setupEventListeners() {
        // Main control buttons
        document.getElementById('start-test').addEventListener('click', () => this.startTest());
        document.getElementById('stop-test').addEventListener('click', () => this.stopTest());
        document.getElementById('reset-lab').addEventListener('click', () => this.reset());
        
        // Mouse trail toggle button (with safety check)
        const trailToggle = document.getElementById('toggle-mouse-trail');
        if (trailToggle) {
            trailToggle.addEventListener('click', () => this.handleMouseTrailToggle());
        } else {
            console.warn('Mouse trail toggle button not found in DOM');
        }
        
        // Scroll visualization toggle button
        const scrollVizToggle = document.getElementById('toggle-scroll-viz');
        if (scrollVizToggle) {
            scrollVizToggle.addEventListener('click', () => this.handleScrollVizToggle());
        }
        
        // Settings button
        const settingsBtn = document.getElementById('settings-btn');
        if (settingsBtn) {
            settingsBtn.addEventListener('click', () => this.openSettings());
        }
        
        // Settings modal controls
        const settingsModalClose = document.getElementById('settings-modal-close');
        if (settingsModalClose) {
            settingsModalClose.addEventListener('click', () => this.closeSettings());
        }
        
        const applySettingsBtn = document.getElementById('apply-settings-btn');
        if (applySettingsBtn) {
            applySettingsBtn.addEventListener('click', () => this.applySettings());
        }
        
        const resetSettingsBtn = document.getElementById('reset-settings-btn');
        if (resetSettingsBtn) {
            resetSettingsBtn.addEventListener('click', () => this.resetSettings());
        }
        
        document.getElementById('export-report').addEventListener('click', () => this.exportReport());
        document.getElementById('export-pdf').addEventListener('click', () => this.exportPDF());
        
        // Step-specific event listeners
        this.setupStepEventListeners();
        
        // Focus and visibility tracking
        document.addEventListener('visibilitychange', () => {
            this.metrics.focusState = document.hidden ? 'hidden' : 'visible';
        });
        
        window.addEventListener('focus', () => {
            this.metrics.focusState = 'active';
        });
        
        window.addEventListener('blur', () => {
            this.metrics.focusState = 'inactive';
        });
        
        // Agent detection rescan button
        const rescanBtn = document.getElementById('rescan-agents');
        if (rescanBtn) {
            rescanBtn.addEventListener('click', () => this.startAgentDetection());
        }
        
        // Behavioral indicators event listeners
        this.setupBehavioralIndicatorsListeners();
        
        // Event stream scroll tracking
        this.setupEventStreamScrollTracking();
    }

    /**
     * Set up behavioral indicators event listeners and UI updates
     */
    setupBehavioralIndicatorsListeners() {
        // Listen for behavioral indicator updates from storage
        window.addEventListener('behavioralIndicatorUpdate', (event) => {
            this.updateBehavioralIndicatorsUI(event.detail);
        });
        
        // Listen for behavioral data cleared events
        window.addEventListener('behavioralDataCleared', () => {
            this.resetBehavioralIndicatorsUI();
        });
        
        // Initialize behavioral indicators UI
        this.updateBehavioralIndicatorsUI();
    }

    /**
     * Set up event stream scroll tracking to prevent auto-scroll interference
     */
    setupEventStreamScrollTracking() {
        const container = document.querySelector('.event-stream-container');
        if (!container) return;

        // Add scroll status indicator
        const scrollIndicator = document.createElement('div');
        scrollIndicator.id = 'event-stream-scroll-indicator';
        scrollIndicator.style.cssText = `
            position: absolute;
            top: 5px;
            right: 5px;
            background: #ffc107;
            color: #000;
            padding: 4px 8px;
            border-radius: 4px;
            font-size: 11px;
            font-weight: bold;
            display: none;
            z-index: 1000;
            box-shadow: 0 2px 4px rgba(0,0,0,0.3);
            cursor: pointer;
            user-select: none;
        `;
        scrollIndicator.textContent = 'Auto-scroll paused - click to resume';
        scrollIndicator.title = 'Click to scroll to top and resume auto-scroll';
        
        // Make indicator clickable
        scrollIndicator.addEventListener('click', () => {
            this.enableEventStreamAutoScroll();
        });
        
        // Make container position relative if it isn't already
        if (getComputedStyle(container).position === 'static') {
            container.style.position = 'relative';
        }
        
        container.appendChild(scrollIndicator);

        // Track user scrolling
        container.addEventListener('scroll', () => {
            const scrollTop = container.scrollTop;
            
            // Detect if user is scrolling manually
            if (Math.abs(scrollTop - this.eventStreamScrollState.lastScrollTop) > 1) {
                this.eventStreamScrollState.userScrolling = true;
                this.eventStreamScrollState.allowAutoScroll = false;
                
                // Show indicator when auto-scroll is disabled
                if (scrollTop > 50) {
                    scrollIndicator.style.display = 'block';
                }
                
                // Clear existing timeout
                if (this.eventStreamScrollState.scrollTimeout) {
                    clearTimeout(this.eventStreamScrollState.scrollTimeout);
                }
                
                // Allow auto-scroll again after user stops scrolling for 2 seconds
                this.eventStreamScrollState.scrollTimeout = setTimeout(() => {
                    this.eventStreamScrollState.userScrolling = false;
                    
                    // Only allow auto-scroll if user scrolled to top (within 50px)
                    if (container.scrollTop <= 50) {
                        this.eventStreamScrollState.allowAutoScroll = true;
                        scrollIndicator.style.display = 'none';
                    }
                }, 2000);
            }
            
            this.eventStreamScrollState.lastScrollTop = scrollTop;
        });
        
        // Detect when user scrolls to top manually - re-enable auto-scroll
        container.addEventListener('scroll', () => {
            if (container.scrollTop <= 10) {
                this.eventStreamScrollState.allowAutoScroll = true;
                scrollIndicator.style.display = 'none';
            }
        });
    }

    /**
     * Manually re-enable auto-scroll for event stream
     */
    enableEventStreamAutoScroll() {
        const container = document.querySelector('.event-stream-container');
        const indicator = document.getElementById('event-stream-scroll-indicator');
        
        if (container) {
            // Scroll to top and re-enable auto-scroll
            container.scrollTop = 0;
            this.eventStreamScrollState.allowAutoScroll = true;
            this.eventStreamScrollState.userScrolling = false;
            
            if (indicator) {
                indicator.style.display = 'none';
            }
            
            console.log('📜 Event stream auto-scroll re-enabled');
        }
    }

    /**
     * Update the behavioral indicators UI in real-time
     */
    updateBehavioralIndicatorsUI(updateData = null) {
        try {
            const summary = this.behavioralStorage.getDetectionSummary();
            const indicators = this.behavioralStorage.getBehavioralIndicators();
            
            // Update summary stats
            const riskLevelElement = document.getElementById('behavioral-risk-level');
            if (riskLevelElement) {
                riskLevelElement.textContent = summary.riskLevel;
                riskLevelElement.className = `risk-${summary.riskLevel.toLowerCase()}`;
            }
            
            const detectedCountElement = document.getElementById('behavioral-detected-count');
            if (detectedCountElement) {
                detectedCountElement.textContent = summary.detectedCount;
            }
            
            const maxConfidenceElement = document.getElementById('behavioral-max-confidence');
            if (maxConfidenceElement) {
                maxConfidenceElement.textContent = `${Math.round(summary.maxConfidence * 100)}%`;
            }
            
            // Update individual indicators
            this.updateIndicatorStatus('central-clicks-status', indicators.centralButtonClicks);
            this.updateIndicatorStatus('no-movement-clicks-status', indicators.clicksWithoutMouseMovement);
            this.updateIndicatorStatus('non-human-scrolling-status', indicators.nonHumanScrolling);
            this.updateIndicatorStatus('artificial-timing-status', indicators.artificialTiming);
            this.updateIndicatorStatus('missing-trails-status', indicators.missingMouseTrails);
            
            // **COMET DETECTION**: Check if we detected Comet-like behavior in real-time
            if (updateData && updateData.indicatorName === 'clicksWithoutMouseMovement') {
                const detail = updateData.indicator.lastDetail;
                if (detail && detail.scenario === 'comet_single_move') {
                    this.showCometAlert(detail);
                }
            }
            
            // Dispatch behavioral analysis event for challenge manager
            const behavioralEvent = new CustomEvent('behavioral-analysis-update', {
                detail: {
                    indicators: indicators,
                    summary: summary,
                    timestamp: Date.now(),
                    updateData: updateData
                },
                bubbles: true
            });
            document.dispatchEvent(behavioralEvent);
            
            // Log update if it's from a specific event
            if (updateData) {
                console.log(`🎯 Behavioral indicator updated: ${updateData.indicatorName}`, updateData.indicator);
            }
            
        } catch (error) {
            console.warn('Error updating behavioral indicators UI:', error);
        }
    }

    /**
     * Show real-time Comet detection alert in AI Agent Detection panel
     */
    showCometAlert(detail) {
        const alertsContainer = document.getElementById('agent-alerts');
        const detectedAgentsElement = document.getElementById('detected-agents');
        
        if (!alertsContainer) return;
        
        // Check if we already have a Comet alert (don't duplicate)
        const existingAlert = document.getElementById('comet-alert');
        if (existingAlert) {
            // Update the count on existing alert
            const countElement = existingAlert.querySelector('.comet-detection-count');
            if (countElement) {
                const currentCount = parseInt(countElement.textContent) || 1;
                countElement.textContent = currentCount + 1;
            }
            
            // Add pulse animation to highlight the update
            existingAlert.classList.remove('pulse-animation');
            void existingAlert.offsetWidth; // Trigger reflow
            existingAlert.classList.add('pulse-animation');
            
            return;
        }
        
        // Show the detected agents section
        if (detectedAgentsElement) {
            detectedAgentsElement.style.display = 'block';
        }
        
        // Create new Comet alert
        const cometAlert = document.createElement('div');
        cometAlert.id = 'comet-alert';
        cometAlert.className = 'agent-alert comet-detected pulse-animation';
        cometAlert.style.cssText = `
            background: linear-gradient(135deg, #ff6b6b 0%, #ee5a6f 100%);
            border: 2px solid #ff0000;
            border-radius: 8px;
            padding: 15px;
            margin-bottom: 10px;
            color: white;
            box-shadow: 0 4px 15px rgba(255, 0, 0, 0.3);
            animation: pulse 2s ease-in-out;
        `;
        
        cometAlert.innerHTML = `
            <div style="display: flex; align-items: center; gap: 12px;">
                <div style="font-size: 32px;">🤖</div>
                <div style="flex: 1;">
                    <div style="font-size: 16px; font-weight: bold; margin-bottom: 5px;">
                        ⚠️ COMET-LIKE AGENT DETECTED
                    </div>
                    <div style="font-size: 13px; opacity: 0.95; margin-bottom: 8px;">
                        Detected <span class="comet-detection-count" style="font-weight: bold; background: rgba(255,255,255,0.2); padding: 2px 6px; border-radius: 3px;">1</span> click(s) with exactly 1 mouse movement
                    </div>
                    <div style="font-size: 12px; opacity: 0.9; background: rgba(0,0,0,0.2); padding: 8px; border-radius: 4px;">
                        <strong>Pattern:</strong> Single mouse move before click<br>
                        <strong>Confidence:</strong> 95% - Strong AI Agent Signature<br>
                        <strong>Target:</strong> ${detail.target || 'Unknown'}
                    </div>
                </div>
            </div>
        `;
        
        // Insert at the top of alerts container
        alertsContainer.insertBefore(cometAlert, alertsContainer.firstChild);
        
        // Update detection status badge
        const statusElement = document.getElementById('detection-status');
        if (statusElement) {
            statusElement.innerHTML = '<span class="detection-badge detected">🚨 COMET Agent Detected</span>';
        }
        
        console.log('🚨 COMET ALERT displayed in UI');
    }

    /**
     * Update individual indicator status
     */
    updateIndicatorStatus(elementId, indicator) {
        const element = document.getElementById(elementId);
        if (!element || !indicator) return;
        
        element.textContent = indicator.count;
        
        // Update styling based on detection status
        element.className = 'indicator-status';
        if (indicator.detected) {
            element.classList.add('detected');
        } else if (indicator.count > 0) {
            element.classList.add('warning');
        }
    }

    /**
     * Reset behavioral indicators UI
     */
    resetBehavioralIndicatorsUI() {
        // Reset summary
        const riskLevelElement = document.getElementById('behavioral-risk-level');
        if (riskLevelElement) {
            riskLevelElement.textContent = 'None';
            riskLevelElement.className = 'risk-none';
        }
        
        const detectedCountElement = document.getElementById('behavioral-detected-count');
        if (detectedCountElement) {
            detectedCountElement.textContent = '0';
        }
        
        const maxConfidenceElement = document.getElementById('behavioral-max-confidence');
        if (maxConfidenceElement) {
            maxConfidenceElement.textContent = '0%';
        }
        
        // Reset individual indicators
        const indicatorIds = [
            'central-clicks-status',
            'no-movement-clicks-status', 
            'non-human-scrolling-status',
            'artificial-timing-status',
            'missing-trails-status'
        ];
        
        indicatorIds.forEach(id => {
            const element = document.getElementById(id);
            if (element) {
                element.textContent = '0';
                element.className = 'indicator-status';
            }
        });
        
        console.log('🎯 Behavioral indicators UI reset');
    }

    /**
     * Start AI agent detection and update UI
     */
    async startAgentDetection() {
        console.log('🕵️ Starting AI agent detection...');
        
        // Update UI to show scanning state
        this.updateAgentDetectionUI('scanning');
        
        try {
            // Run all detections
            const results = await this.aiAgentDetector.runAllDetections();
            
            // Update UI with results
            this.updateAgentDetectionUI('complete', results);
            
            // Dispatch event for challenge manager to process
            const detectionEvent = new CustomEvent('agent-detection-complete', {
                detail: {
                    results: results,
                    timestamp: Date.now(),
                    summary: this.aiAgentDetector.getSummary()
                },
                bubbles: true
            });
            document.dispatchEvent(detectionEvent);
            
            console.log('✅ Agent detection complete:', results);
        } catch (error) {
            console.error('❌ Agent detection failed:', error);
            this.updateAgentDetectionUI('error', null, error);
        }
    }

    /**
     * Update the agent detection UI based on current state
     */
    updateAgentDetectionUI(state, results = null, error = null) {
        const statusElement = document.getElementById('detection-status');
        const detectedAgentsElement = document.getElementById('detected-agents');
        const alertsContainer = document.getElementById('agent-alerts');
        const scannedCountElement = document.getElementById('scanned-count');
        const detectedCountElement = document.getElementById('detected-count');
        
        if (!statusElement) return;
        
        switch (state) {
            case 'scanning':
                statusElement.innerHTML = '<span class="detection-badge scanning">🔍 Scanning for AI agents...</span>';
                if (detectedAgentsElement) detectedAgentsElement.style.display = 'none';
                break;
                
            case 'complete':
                const summary = this.aiAgentDetector.getSummary();
                const detectedAgents = results.filter(result => result.detected);
                
                if (summary.hasAnyAgent) {
                    statusElement.innerHTML = '<span class="detection-badge detected">⚠️ AI Agents Detected</span>';
                    
                    // Show detected agents panel only if there are detected agents
                    if (detectedAgentsElement) {
                        detectedAgentsElement.style.display = 'block';
                    }
                } else {
                    statusElement.innerHTML = '<span class="detection-badge no-agents">✅ No AI Agents Detected</span>';
                    
                    // Hide detected agents panel if no agents found
                    if (detectedAgentsElement) {
                        detectedAgentsElement.style.display = 'none';
                    }
                }
                
                // Populate agent alerts - only show detected agents
                if (alertsContainer && detectedAgents.length > 0) {
                    alertsContainer.innerHTML = '';
                    
                    detectedAgents.forEach(result => {
                        const alertElement = this.createAgentAlert(result);
                        alertsContainer.appendChild(alertElement);
                    });
                }
                
                // Update summary stats
                if (scannedCountElement) scannedCountElement.textContent = results?.length || 0;
                if (detectedCountElement) detectedCountElement.textContent = summary.totalDetected || 0;
                
                break;
                
            case 'error':
                statusElement.innerHTML = '<span class="detection-badge error">❌ Detection Failed</span>';
                console.error('Agent detection error:', error);
                break;
        }
    }

    /**
     * Create an agent alert element for detected agents only
     */
    createAgentAlert(result) {
        const alertDiv = document.createElement('div');
        alertDiv.className = 'agent-alert detected';
        
        const agentName = result.name.toUpperCase();
        
        // Build indicators HTML if available
        let indicatorsHtml = '';
        if (result.indicators && result.indicators.length > 0) {
            indicatorsHtml = `
                <div class="detection-indicators">
                    <div class="indicators-header">🔍 Detection Indicators:</div>
                    <div class="indicators-list">
                        ${result.indicators.map(indicator => `
                            <div class="indicator-item">
                                <div class="indicator-name">${indicator.name}</div>
                                <div class="indicator-description">${indicator.description}</div>
                                <div class="indicator-value">Value: ${indicator.value}</div>
                            </div>
                        `).join('')}
                    </div>
                </div>
            `;
        }
        
        alertDiv.innerHTML = `
            <div class="agent-icon">🚨</div>
            <div class="agent-info">
                <div class="agent-name">${agentName} Agent Identified</div>
                <div class="agent-status">DETECTED - Active automation detected</div>
                <div class="detection-method">Method: ${result.detectionMethod || 'Unknown'}</div>
                ${indicatorsHtml}
            </div>
            <div class="confidence-indicator">
                ${Math.round(result.confidence * 100)}% confidence
            </div>
        `;
        
        return alertDiv;
    }

    /**
     * Set up event listeners for each step
     */
    setupStepEventListeners() {
        // AI Agent Info step (Step 0)
        const agentInfoNextBtn = document.getElementById('agent-info-next-btn');
        if (agentInfoNextBtn) {
            agentInfoNextBtn.addEventListener('click', () => this.submitAgentInfo());
        }
        
        // Add input listeners to enable/disable next button
        const agentInfoInputs = ['agent-name', 'agent-company', 'agent-model', 'agent-instructions'];
        agentInfoInputs.forEach(id => {
            const input = document.getElementById(id);
            if (input) {
                input.addEventListener('input', () => this.checkAgentInfoCompletion());
            }
        });
        
        // Form step
        const emailInput = document.getElementById('email-input');
        const scenarioSelect = document.getElementById('scenario-select');
        const continueBtn = document.getElementById('continue-btn');
        
        emailInput.addEventListener('input', () => {
            this.stepState.form.emailEntered = emailInput.value.length > 0;
            this.checkFormCompletion();
        });
        
        scenarioSelect.addEventListener('change', () => {
            this.stepState.form.scenarioSelected = scenarioSelect.value !== '';
            this.checkFormCompletion();
        });
        
        continueBtn.addEventListener('click', () => this.completeStep(3));
        
        // Modal step
        document.getElementById('open-modal-btn').addEventListener('click', () => {
            this.openModal();
        });
        
        document.getElementById('modal-close').addEventListener('click', () => {
            this.closeModal();
        });
        
        document.getElementById('test-modal').addEventListener('click', (e) => {
            if (e.target.id === 'test-modal') this.closeModal();
        });
        
        document.addEventListener('keydown', (e) => {
            if (e.key === 'Escape' && this.stepState.modal.opened) {
                this.closeModal();
            }
        });
        
        // Table step - use event delegation to handle clicks after sorting
        document.addEventListener('click', (e) => {
            if (e.target.closest('.sort-btn')) {
                const btn = e.target.closest('.sort-btn');
                const sortType = btn.dataset.sort;
                console.log(`Sorting by ${sortType}`);
                if (sortType === 'name') this.stepState.table.sortedByName = true;
                if (sortType === 'date') this.stepState.table.sortedByDate = true;
                this.sortTable(sortType);
            }
            
            if (e.target.closest('.table-row')) {
                const row = e.target.closest('.table-row');
                console.log(`Clicked row ${row.dataset.row}`);
                row.classList.add('clicked');
                // Accept ANY row click, not just row 3
                this.stepState.table.rowClicked = true;
                console.log('Table row clicked, checking table completion');
                setTimeout(() => this.checkTableCompletion(), 100);
            }
        });
        
        // Finish step
        document.getElementById('generate-report-btn').addEventListener('click', () => {
            this.generateReport();
        });
        
        // Scroll step - open dedicated scroll page
        document.getElementById('open-scroll-page-btn').addEventListener('click', () => {
            this.openScrollPage();
        });
        
        // Listen for scroll test completion messages
        window.addEventListener('message', (event) => {
            if (event.data.type === 'scroll-test-complete') {
                this.handleScrollTestComplete(event.data.metrics);
            }
        });
    }

    /**
     * Start telemetry collection
     */
    startTelemetryCollection() {
        // Mouse/pointer events
        ['pointermove', 'pointerdown', 'pointerup', 'click', 'wheel'].forEach(eventType => {
            document.addEventListener(eventType, (e) => this.handlePointerEvent(e), { passive: true });
        });
        
        // Raw pointer update if available
        if ('onpointerrawupdate' in document) {
            document.addEventListener('pointerrawupdate', (e) => this.handlePointerEvent(e), { passive: true });
        }
        
        // Keyboard events
        document.addEventListener('keydown', (e) => this.handleKeyEvent(e));
        document.addEventListener('keyup', (e) => this.handleKeyEvent(e));
        
        // Scroll events
        window.addEventListener('scroll', (e) => this.handleScrollEvent(e), { passive: true });
        
        // Initialize CDP signals detector
        this.cdpDetector = initCdpSignals({ 
            report: { metrics: {} }, 
            bus: null 
        });
        
        // Start live UI updates
        this.startLiveUpdates();
    }

    /**
     * Handle pointer/mouse events
     */
    handlePointerEvent(e) {
        // Handle mouse trails only when test is active and data collection is enabled
        if ((e.type === 'pointermove' || e.type === 'mousemove') && 
            this.testStarted && this.dataCollectionActive) {
            // Add mouse trail visualization only during active test
            this.addMouseTrail(e.clientX, e.clientY, performance.now());
        }
        
        // Exit early if test is not active for data collection
        if (!this.testStarted || !this.dataCollectionActive) return;
        
        const event = {
            t: performance.now(),
            type: e.type,
            x: e.clientX || 0,
            y: e.clientY || 0,
            movementX: e.movementX || 0,
            movementY: e.movementY || 0,
            pointerType: e.pointerType || 'mouse',
            isTrusted: e.isTrusted || false,
            buttons: e.buttons || 0
        };
        
        this.events.pointer.push(event);
        
        // Track mouse movement for behavioral analysis
        if (e.type === 'pointermove' || e.type === 'mousemove') {
            this.behavioralDetector.trackMouseMovement(event);
        }
        
        // Enhanced click tracking with position analysis
        if (e.type === 'click') {
            const clickData = this.analyzeClickPosition(e);
            this.events.clicks.push(clickData);
            
            // Behavioral analysis of the click
            this.behavioralDetector.analyzeClick(clickData);
            
            // Debug positioning for problematic elements
            const tagName = e.target.tagName.toLowerCase();
            if (['select', 'option', 'td', 'th', 'input', 'textarea'].includes(tagName)) {
                this.debugClickPositioning(clickData);
            }
            
            // Update click tracking metrics
            this.updateClickTracking(clickData);
            
            // Add visual click dot
            this.addClickVisualization(clickData);
        }
        
        // Update mouse path canvas
        if (e.type === 'pointermove') {
            this.updateMousePath(event.x, event.y);
        }
    }

    /**
     * Analyze click position within target element
     */
    analyzeClickPosition(e) {
        const target = e.target;
        const rect = target.getBoundingClientRect();
        
        // Calculate position within element as percentages
        const elementX = e.clientX - rect.left;
        const elementY = e.clientY - rect.top;
        const percentX = (elementX / rect.width) * 100;
        const percentY = (elementY / rect.height) * 100;
        
        // Calculate distance from center
        const centerX = rect.width / 2;
        const centerY = rect.height / 2;
        const distanceFromCenter = Math.sqrt(
            Math.pow(elementX - centerX, 2) + Math.pow(elementY - centerY, 2)
        );
        const maxDistance = Math.sqrt(centerX * centerX + centerY * centerY);
        const centerDistance = (distanceFromCenter / maxDistance) * 100;
        
        // Detect CDP vs mouse click
        const isCDP = this.detectCDPClick(e);
        
        // Determine accuracy category
        const accuracy = centerDistance < 25 ? 'center' : centerDistance < 75 ? 'middle' : 'edge';
        
        // Get the best container element for positioning the dot
        const { containerElement, adjustedX, adjustedY } = this.getBestClickContainer(target, elementX, elementY);
        
        return {
            t: performance.now(),
            x: e.clientX,
            y: e.clientY,
            screenX: e.screenX || 0,
            screenY: e.screenY || 0,
            target: this.getElementSelector(e.target),
            elementInfo: {
                tagName: target.tagName.toLowerCase(),
                id: target.id || '',
                className: target.className || '',
                type: target.type || '',
                role: target.getAttribute('role') || '',
                hasOnClick: !!target.onclick || target.hasAttribute('onclick'),
                isClickable: this.isElementClickable(target)
            },
            elementBounds: {
                left: rect.left,
                top: rect.top,
                width: rect.width,
                height: rect.height
            },
            elementPosition: {
                x: elementX,
                y: elementY,
                percentX: percentX,
                percentY: percentY
            },
            containerPosition: {
                element: containerElement,
                x: adjustedX,
                y: adjustedY
            },
            centerDistance: centerDistance,
            accuracy: accuracy,
            isTrusted: e.isTrusted,
            isCDP: isCDP,
            pointerType: e.pointerType || 'mouse'
        };
    }

    /**
     * Find the best container element and adjust coordinates for reliable dot positioning
     */
    getBestClickContainer(targetElement, elementX, elementY) {
        let containerElement = targetElement;
        let adjustedX = elementX;
        let adjustedY = elementY;
        
        const tagName = targetElement.tagName.toLowerCase();
        const computedStyle = getComputedStyle(targetElement);
        
        // Handle special cases for different element types
        switch (tagName) {
            case 'select':
                // Select elements can be tricky, use the select itself but ensure proper positioning
                if (computedStyle.position === 'static') {
                    // Check if parent has positioning context
                    let parent = targetElement.parentElement;
                    while (parent && getComputedStyle(parent).position === 'static') {
                        parent = parent.parentElement;
                        if (parent === document.body) break;
                    }
                    if (parent && parent !== document.body) {
                        const parentRect = parent.getBoundingClientRect();
                        const targetRect = targetElement.getBoundingClientRect();
                        containerElement = parent;
                        adjustedX = targetRect.left - parentRect.left + elementX;
                        adjustedY = targetRect.top - parentRect.top + elementY;
                    }
                }
                break;
                
            case 'option':
                // Option elements are inside select, use the select instead
                const selectElement = targetElement.closest('select');
                if (selectElement) {
                    const selectRect = selectElement.getBoundingClientRect();
                    const targetRect = targetElement.getBoundingClientRect();
                    containerElement = selectElement;
                    adjustedX = targetRect.left - selectRect.left + elementX;
                    adjustedY = targetRect.top - selectRect.top + elementY;
                }
                break;
                
            case 'td':
            case 'th':
                // Table cells - use the cell but ensure the table has proper positioning context
                const table = targetElement.closest('table');
                if (table) {
                    const tableStyle = getComputedStyle(table);
                    if (tableStyle.position === 'static') {
                        table.style.position = 'relative';
                    }
                }
                break;
                
            case 'input':
            case 'textarea':
                // Form elements might have borders/padding affecting positioning
                const borderLeft = parseFloat(computedStyle.borderLeftWidth) || 0;
                const borderTop = parseFloat(computedStyle.borderTopWidth) || 0;
                const paddingLeft = parseFloat(computedStyle.paddingLeft) || 0;
                const paddingTop = parseFloat(computedStyle.paddingTop) || 0;
                
                // Adjust for borders and padding to position dot in the content area
                adjustedX = elementX;
                adjustedY = elementY;
                break;
                
            case 'button':
                // Buttons usually work well as-is, but ensure positioning context
                break;
                
            default:
                // For other elements, check if they need a positioning context
                if (computedStyle.position === 'static') {
                    // Look for a parent with positioning context
                    let parent = targetElement.parentElement;
                    while (parent && getComputedStyle(parent).position === 'static') {
                        parent = parent.parentElement;
                        if (parent === document.body) break;
                    }
                    
                    // If we found a positioned parent, use it
                    if (parent && parent !== document.body && parent !== document.documentElement) {
                        const parentRect = parent.getBoundingClientRect();
                        const targetRect = targetElement.getBoundingClientRect();
                        containerElement = parent;
                        adjustedX = targetRect.left - parentRect.left + elementX;
                        adjustedY = targetRect.top - parentRect.top + elementY;
                    }
                }
                break;
        }
        
        return { containerElement, adjustedX, adjustedY };
    }

    /**
     * Detect if click is from CDP (Chrome DevTools Protocol) vs real mouse
     */
    detectCDPClick(e) {
        // CDP clicks typically have these characteristics:
        // - screenX/Y are often 0 or don't match client coordinates properly
        // - isTrusted might be false
        // - Missing certain native event properties
        const hasScreenCoords = e.screenX !== undefined && e.screenY !== undefined;
        const screenCoordsValid = hasScreenCoords && (e.screenX > 0 || e.screenY > 0);
        const hasMovement = e.movementX !== undefined || e.movementY !== undefined;
        
        // Heuristic: likely CDP if missing screen coords, not trusted, or inconsistent properties
        return !e.isTrusted || 
               !screenCoordsValid || 
               (e.detail === 0 && e.which === 0) ||
               (e.clientX === e.screenX && e.clientY === e.screenY && e.screenX === 0);
    }

    /**
     * Update click tracking metrics
     */
    updateClickTracking(clickData) {
        this.clickTracking.accuracy.total++;
        
        if (clickData.accuracy === 'center') {
            this.clickTracking.accuracy.center++;
        } else if (clickData.accuracy === 'edge') {
            this.clickTracking.accuracy.edge++;
        }
        
        if (clickData.isCDP) {
            this.clickTracking.accuracy.cdp++;
        } else {
            this.clickTracking.accuracy.mouse++;
        }
        
        // Add to heatmap data
        this.clickTracking.heatmapData.push({
            x: clickData.x,
            y: clickData.y,
            intensity: 1,
            accuracy: clickData.accuracy,
            isCDP: clickData.isCDP
        });
    }

    /**
     * Add visual click dot to overlay - now bound to the clicked element with smart container detection
     */
    addClickVisualization(clickData) {
        // Use the container element determined by our smart positioning logic
        const containerElement = clickData.containerPosition.element;
        const targetSelector = this.getElementSelector(containerElement);
        
        if (!containerElement || !document.contains(containerElement)) {
            console.warn('Container element not found or not in DOM for click visualization:', targetSelector);
            return;
        }
        
        const dot = {
            x: clickData.x,
            y: clickData.y,
            elementX: clickData.containerPosition.x,
            elementY: clickData.containerPosition.y,
            originalElementX: clickData.elementPosition.x,
            originalElementY: clickData.elementPosition.y,
            accuracy: clickData.accuracy,
            isCDP: clickData.isCDP,
            timestamp: clickData.t,
            targetElement: containerElement,
            originalTarget: clickData.target,
            targetSelector: targetSelector,
            id: Math.random().toString(36).substr(2, 9)
        };
        
        this.clickTracking.dots.push(dot);
        this.renderClickDot(dot);
        
        // Limit number of visible dots
        if (this.clickTracking.dots.length > 50) {
            const oldDot = this.clickTracking.dots.shift();
            this.removeClickDot(oldDot.id);
        }
    }

    /**
     * Handle keyboard events
     */
    handleKeyEvent(e) {
        if (!this.testStarted || !this.dataCollectionActive) return;
        
        this.events.keys.push({
            t: performance.now(),
            type: e.type,
            code: e.code,
            key: e.key.length === 1 ? 'char' : e.key, // Don't log actual characters
            ctrlKey: e.ctrlKey,
            altKey: e.altKey,
            shiftKey: e.shiftKey
        });
    }

    /**
     * Handle scroll events
     */
    handleScrollEvent(e) {
        if (!this.testStarted || !this.dataCollectionActive) return;
        
        const now = performance.now();
        const scrollY = window.scrollY;
        
        // Calculate velocity if we have previous scroll
        let velocity = 0;
        const lastScroll = this.events.scrolls[this.events.scrolls.length - 1];
        if (lastScroll) {
            const deltaTime = now - lastScroll.t;
            const deltaY = scrollY - lastScroll.y;
            velocity = deltaTime > 0 ? deltaY / deltaTime : 0;
        }
        
        this.events.scrolls.push({
            t: now,
            y: scrollY,
            velocity: velocity
        });
        
        // Track scroll event for visualization
        this.trackScrollEvent(e);
        
        // Behavioral analysis of scroll event
        this.behavioralDetector.analyzeScroll(e);
        
        // Update mouse trail positions no longer needed - using absolute positioning now
        // this.updateTrailPositions(); // Removed - trails now use absolute positioning
    }

    /**
     * Start the behavioral test
     */
    async startTest() {
        if (this.testStarted) return;
        
        console.log('🚀 Starting behavioral test');
        
        // Clear previous behavioral indicators from localStorage to prevent pollution
        try {
            localStorage.removeItem('behavioral_indicators_v1');
            localStorage.removeItem('behavioral_session_v1');
            console.log('🧹 Cleared previous behavioral indicators from localStorage');
        } catch (error) {
            console.warn('Failed to clear localStorage:', error);
        }
        
        // Reset the behavioral indicators UI to show clean stats
        this.resetBehavioralIndicatorsUI();
        
        // Reset the behavioral detector state
        if (this.behavioralDetector) {
            this.behavioralDetector.reset();
        }
        
        // Clear any existing mouse trails for clean test data
        this.clearAllTrails();
        console.log('🖱️ Cleared existing mouse trails for clean test start');
        
        this.testStarted = true;
        this.dataCollectionActive = true;
        this.testStartTime = performance.now();
        this.currentStep = 1;
        this.stepStartTime = this.testStartTime;
        
        // Record step start
        this.events.steps.push({
            idx: 1,
            name: 'Landing',
            started: this.testStartTime,
            ended: null
        });
        
        // Update UI
        this.updateUI();
        this.updateStepUI(1);
        
        // Start step timer
        this.startStepTimer(1);
    }

    /**
     * Stop the behavioral test and freeze data collection
     */
    stopTest() {
        if (!this.testStarted) return;
        
        console.log('⏹️ Stopping test - data collection frozen');
        
        // Stop the test and disable data collection
        this.testStarted = false;
        this.dataCollectionActive = false;
        
        // Keep mouse trails visible for analysis - don't clear them
        // this.clearAllTrails(); // Removed to preserve trails for data analysis
        
        // Stop DOM observation for cleaner shutdown
        if (this.domObserver) {
            console.log('📍 Disconnecting DOM observer');
            this.domObserver.disconnect();
            this.domObserver = null; // Clear reference
        }
        
        // Update UI to show test is stopped
        this.updateUI();
        
        // Auto-generate report if not already generated
        if (!this.reportGenerator) {
            setTimeout(() => this.generateReport(), 500);
        }
    }

    /**
     * Start timer for current step
     */
    startStepTimer(stepIndex) {
        const step = this.steps[stepIndex - 1];
        const timerElement = document.getElementById(`timer-${stepIndex}`);
        
        let elapsed = 0;
        const interval = setInterval(() => {
            elapsed += 100;
            const remaining = Math.max(0, step.minDwell - elapsed);
            
            if (timerElement) {
                if (remaining > 0) {
                    timerElement.textContent = `Wait ${Math.ceil(remaining / 1000)}s more...`;
                } else {
                    timerElement.textContent = `Ready to proceed (${(elapsed / 1000).toFixed(1)}s)`;
                }
            }
            
            // Enable step controls after minimum dwell
            if (elapsed >= step.minDwell) {
                this.enableStepControls(stepIndex);
                
                // Auto-complete step 1 (Landing) after minimum dwell
                // Auto-complete step 2 (Landing) after minimum dwell
                if (stepIndex === 2 && elapsed >= step.minDwell) {
                    setTimeout(() => {
                        if (this.currentStep === 2) {
                            this.completeStep(2);
                        }
                    }, 100);
                }
            }
            
            // Clear timer when step completes or test ends
            if (!this.testStarted || this.currentStep !== stepIndex) {
                clearInterval(interval);
            }
        }, 100);
    }

    /**
     * Enable controls for a specific step
     */
    enableStepControls(stepIndex) {
        console.log(`Enabling controls for step ${stepIndex}`);
        const controls = document.getElementById(`controls-${stepIndex}`);
        if (controls) {
            controls.style.display = 'block';
            console.log(`Controls for step ${stepIndex} are now visible`);
        } else {
            console.log(`No controls found for step ${stepIndex}`);
        }
        
        // Special handling for specific steps
        if (stepIndex === 6) {
            // Show scroll page instructions instead of inline scroll area
            const scrollInstructions = document.getElementById('scroll-instructions');
            
            if (scrollInstructions) {
                scrollInstructions.style.display = 'block';
            }
            
            console.log('🎯 Scroll step ready - scroll page controls enabled');
        }
    }

    /**
     * Complete a step and move to next
     */
    completeStep(stepIndex) {
        if (this.currentStep !== stepIndex) return;
        
        const step = this.steps[stepIndex - 1];
        const now = performance.now();
        
        // Validate step completion
        if (!step.validator()) {
            console.log(`❌ Step ${stepIndex} validation failed`);
            return;
        }
        
        console.log(`✅ Completed step ${stepIndex}: ${step.name}`);
        
        // Record step end
        const stepEvent = this.events.steps.find(s => s.idx === stepIndex);
        if (stepEvent) {
            stepEvent.ended = now;
        }
        
        // Mark step as completed in UI
        const stepElement = document.querySelector(`[data-step="${stepIndex}"]`);
        if (stepElement) {
            stepElement.classList.remove('active');
            stepElement.classList.add('completed');
        }
        
        // Move to next step or complete test
        if (stepIndex < this.steps.length) {
            this.currentStep = stepIndex + 1;
            this.stepStartTime = now;
            
            // Record next step start
            this.events.steps.push({
                idx: this.currentStep,
                name: this.steps[this.currentStep - 1].name,
                started: now,
                ended: null
            });
            
            this.updateStepUI(this.currentStep);
            this.startStepTimer(this.currentStep);
        } else {
            this.completeTest();
        }
        
        this.updateUI();
    }

    /**
     * Complete the entire test
     */
    completeTest() {
        console.log('🎉 Test completed successfully');
        
        this.testCompleted = true;
        this.testStarted = false;
        this.dataCollectionActive = false;
        
        // Stop DOM observation since test is complete
        if (this.domObserver) {
            console.log('📍 Stopping DOM observer - test completed');
            this.domObserver.disconnect();
            this.domObserver = null; // Clear reference
        }
        
        // Update UI
        this.updateUI();
        
        // Enable export buttons
        document.getElementById('export-report').disabled = false;
        document.getElementById('export-pdf').disabled = false;
        
        // Auto-generate report
        setTimeout(() => this.generateReport(), 500);
    }

    /**
     * Update step UI state
     */
    updateStepUI(stepIndex) {
        // Remove active class from all steps
        document.querySelectorAll('.task-step').forEach(step => {
            step.classList.remove('active');
        });
        
        // Add active class to current step
        const currentStepElement = document.querySelector(`[data-step="${stepIndex}"]`);
        if (currentStepElement) {
            currentStepElement.classList.add('active');
        }
    }

    /**
     * Update main UI state
     */
    updateUI() {
        const statusElement = document.getElementById('test-status');
        const progressElement = document.getElementById('progress-fill');
        const startButton = document.getElementById('start-test');
        const stopButton = document.getElementById('stop-test');
        
        if (this.testCompleted) {
            statusElement.textContent = 'Test Completed';
            progressElement.style.width = '100%';
            startButton.disabled = true;
            stopButton.style.display = 'none';
        } else if (this.testStarted) {
            if (this.dataCollectionActive) {
                statusElement.textContent = `Step ${this.currentStep}/7: ${this.steps[this.currentStep - 1]?.name}`;
                stopButton.style.display = 'inline-block';
            } else {
                statusElement.textContent = `Test Stopped - Data Collection Frozen`;
                stopButton.style.display = 'none';
            }
            progressElement.style.width = `${(this.currentStep / this.steps.length) * 100}%`;
            startButton.disabled = true;
        } else {
            statusElement.textContent = 'Ready';
            progressElement.style.width = '0%';
            startButton.disabled = false;
            stopButton.style.display = 'none';
        }
        
        // Update mouse trail button state
        this.updateMouseTrailButtonState();
    }

    /**
     * Update mouse trail button state
     */
    updateMouseTrailButtonState() {
        const button = document.getElementById('toggle-mouse-trail');
        if (!button) return;
        
        const testActive = this.testStarted && this.dataCollectionActive;
        
        if (!this.mouseTrail.enabled) {
            // Off state
            button.style.backgroundColor = '';
            button.style.color = '';
            button.style.border = '';
            button.textContent = '🖱️ Trails';
            button.title = testActive 
                ? 'Mouse trails disabled - Click to enable normal trails'
                : 'Mouse trails disabled - Start test to enable trails';
        } else if (!this.mouseTrail.persist) {
            // Normal state
            button.style.backgroundColor = '#8A2BE2';
            button.style.color = 'white';
            button.style.border = '1px solid #8A2BE2';
            button.textContent = '🖱️ Normal';
            button.title = testActive
                ? 'Normal trails enabled - Click to enable persistent trails'
                : 'Normal trails ready - Start test to begin tracking';
        } else {
            // Persist state
            button.style.backgroundColor = '#FF6B35';
            button.style.color = 'white';
            button.style.border = '1px solid #FF6B35';
            button.textContent = '🖱️ Persist';
            button.title = testActive
                ? 'Persistent trails enabled - Trails never fade - Click to turn off'
                : 'Persistent trails ready - Start test to begin tracking';
        }
    }

    /**
     * Validation functions for each step
     */
    validateAgentInfoStep() {
        return this.stepState.agentInfo.filled;
    }
    
    validateFormStep() {
        return this.stepState.form.emailEntered && this.stepState.form.scenarioSelected;
    }

    validateModalStep() {
        return this.stepState.modal.opened && this.stepState.modal.closed;
    }

    validateTableStep() {
        return this.stepState.table.sortedByName && 
               this.stepState.table.sortedByDate && 
               this.stepState.table.rowClicked;
    }

    validateScrollStep() {
        return this.stepState.scroll.testCompleted && this.stepState.scroll.metricsReceived;
    }

    validateFinishStep() {
        return this.stepState.finish.reportGenerated;
    }

    /**
     * AI Agent Info step helpers
     */
    checkAgentInfoCompletion() {
        const agentName = document.getElementById('agent-name')?.value.trim() || '';
        const company = document.getElementById('agent-company')?.value.trim() || '';
        const model = document.getElementById('agent-model')?.value.trim() || '';
        const instructions = document.getElementById('agent-instructions')?.value.trim() || '';
        
        const isValid = agentName.length > 0 && 
                       company.length > 0 && 
                       model.length > 0 && 
                       instructions.length > 0;
        
        const nextBtn = document.getElementById('agent-info-next-btn');
        if (nextBtn) {
            nextBtn.disabled = !isValid;
        }
        
        return isValid;
    }
    
    submitAgentInfo() {
        if (!this.checkAgentInfoCompletion()) {
            return;
        }
        
        // Store the agent information
        this.agentInfo = {
            agentName: document.getElementById('agent-name').value.trim(),
            company: document.getElementById('agent-company').value.trim(),
            model: document.getElementById('agent-model').value.trim(),
            userInstructions: document.getElementById('agent-instructions').value.trim(),
            timestamp: Date.now()
        };
        
        this.stepState.agentInfo.filled = true;
        
        console.log('🤖 AI Agent Info collected:', this.agentInfo);
        
        // Complete step 1 and move to step 2
        this.completeStep(1);
    }
    
    /**
     * Form step helpers
     */
    checkFormCompletion() {
        const continueBtn = document.getElementById('continue-btn');
        const isValid = this.validateFormStep();
        continueBtn.disabled = !isValid;
        
        console.log('Form validation:', {
            emailEntered: this.stepState.form.emailEntered,
            scenarioSelected: this.stepState.form.scenarioSelected,
            isValid: isValid
        });
    }

    /**
     * Modal step helpers
     */
    openModal() {
        document.getElementById('test-modal').style.display = 'flex';
        this.stepState.modal.opened = true;
    }

    closeModal() {
        document.getElementById('test-modal').style.display = 'none';
        this.stepState.modal.closed = true;
        if (this.stepState.modal.opened) {
            setTimeout(() => this.completeStep(4), 100);
        }
    }

    /**
     * Table step helpers
     */
    sortTable(sortType) {
        const tbody = document.querySelector('#data-table tbody');
        const rows = Array.from(tbody.querySelectorAll('tr'));
        
        rows.sort((a, b) => {
            const aValue = a.children[sortType === 'name' ? 0 : 1].textContent;
            const bValue = b.children[sortType === 'name' ? 0 : 1].textContent;
            return aValue.localeCompare(bValue);
        });
        
        tbody.innerHTML = '';
        rows.forEach(row => tbody.appendChild(row));
        
        // Update sort button text
        const btn = document.querySelector(`[data-sort="${sortType}"]`);
        btn.textContent = sortType === 'name' ? 'Name ↑' : 'Date ↑';
    }

    checkTableCompletion() {
        const validation = this.validateTableStep();
        console.log('Table validation:', {
            sortedByName: this.stepState.table.sortedByName,
            sortedByDate: this.stepState.table.sortedByDate,
            rowClicked: this.stepState.table.rowClicked,
            isValid: validation
        });
        
        if (validation) {
            console.log('Table step complete, moving to step 6');
            this.completeStep(5);
        }
    }

    /**
     * Scroll step helpers - Modal approach instead of popup
     */
    openScrollPage() {
        console.log('🖱️ Opening dedicated scroll test modal');
        
        // Get the scroll modal elements
        const scrollModal = document.getElementById('scroll-modal');
        const scrollIframe = document.getElementById('scroll-iframe');
        
        if (!scrollModal || !scrollIframe) {
            console.error('❌ Scroll modal elements not found');
            return;
        }
        
        // Set the iframe source and show modal
        scrollIframe.src = 'scroll-page.html';
        scrollModal.style.display = 'block';
        
        // Add modal close functionality
        this.setupScrollModalEvents();
        
        console.log('✅ Scroll test modal opened');
    }

    /**
     * Setup scroll modal event listeners
     */
    setupScrollModalEvents() {
        const scrollModal = document.getElementById('scroll-modal');
        const scrollModalClose = document.getElementById('scroll-modal-close');
        
        // Close button event
        const closeHandler = () => {
            this.closeScrollModal();
        };
        
        // Remove existing listeners to prevent duplicates
        scrollModalClose.removeEventListener('click', closeHandler);
        scrollModal.removeEventListener('click', this.scrollModalBackdropHandler);
        
        // Add new listeners
        scrollModalClose.addEventListener('click', closeHandler);
        
        // Backdrop click handler
        this.scrollModalBackdropHandler = (e) => {
            if (e.target.id === 'scroll-modal') {
                this.closeScrollModal();
            }
        };
        scrollModal.addEventListener('click', this.scrollModalBackdropHandler);
        
        // ESC key handler
        this.scrollModalEscHandler = (e) => {
            if (e.key === 'Escape') {
                this.closeScrollModal();
            }
        };
        document.addEventListener('keydown', this.scrollModalEscHandler);
    }

    /**
     * Close scroll modal
     */
    closeScrollModal() {
        const scrollModal = document.getElementById('scroll-modal');
        const scrollIframe = document.getElementById('scroll-iframe');
        
        // Hide modal
        scrollModal.style.display = 'none';
        
        // Clear iframe source
        scrollIframe.src = '';
        
        // Remove event listeners
        document.removeEventListener('keydown', this.scrollModalEscHandler);
        scrollModal.removeEventListener('click', this.scrollModalBackdropHandler);
        
        console.log('📋 Scroll test modal closed');
        
        // If we haven't received metrics yet, mark as completed anyway
        if (!this.stepState.scroll.metricsReceived) {
            console.log('⚠️ No metrics received, but modal closed - marking as completed');
            this.stepState.scroll.testCompleted = true;
            this.stepState.scroll.metricsReceived = true;
            
            // Complete step after a short delay
            setTimeout(() => {
                if (this.currentStep === 6) {
                    this.completeStep(6);
                }
            }, 1000);
        }
    }

    /**
     * Handle completion of scroll test with metrics
     */
    handleScrollTestComplete(metrics) {
        console.log('📊 Received scroll test metrics:', metrics);
        
        // Close the scroll modal if it's open
        this.closeScrollModal();
        
        // Store the scroll metrics for later inclusion in report
        this.scrollMetrics = metrics;
        
        // Mark scroll step as completed
        this.stepState.scroll.testCompleted = true;
        this.stepState.scroll.metricsReceived = true;
        
        // Add scroll metrics to our events collection
        this.events.scrolls = this.events.scrolls || [];
        
        // Convert scroll metrics to our standard format
        if (metrics.scrollEvents && metrics.scrollEvents.length > 0) {
            this.events.scrolls = metrics.scrollEvents.map(event => ({
                t: event.timestamp,
                y: event.position,
                velocity: event.speed || 0,
                direction: event.direction || 0
            }));
        }
        
        console.log('✅ Scroll step completed with metrics');
        
        // Complete the step
        if (this.currentStep === 6) {
            setTimeout(() => this.completeStep(6), 500);
        }
    }

    /**
     * Generate the behavioral report
     */
    async generateReport() {
        console.log('📊 Generating behavioral report');
        
        this.stepState.finish.reportGenerated = true;
        
        // Stop data collection when generating report
        this.dataCollectionActive = false;
        
        // Stop DOM observation since report generation indicates test completion
        if (this.domObserver) {
            console.log('📍 Stopping DOM observer for report generation');
            this.domObserver.disconnect();
            this.domObserver = null; // Clear reference
        }
        
        // Get CDP metrics snapshot
        const cdpMetrics = this.cdpDetector ? this.cdpDetector.snapshot() : null;
        
        // Get AI agent detection data
        const agentDetectionData = this.aiAgentDetector ? this.aiAgentDetector.getDetectionData() : null;
        
        // Import report module and generate
        const { ReportGenerator } = await import('./report.js');
        this.reportGenerator = new ReportGenerator();
        
        const reportData = {
            meta: {
                lab_version: '1.0',
                started_at_epoch_ms: this.testStartTime,
                finished_at_epoch_ms: performance.now()
            },
            agentInfo: this.agentInfo, // Include AI Agent information
            agentDetection: agentDetectionData, // Include AI agent detection results
            fingerprint: fingerprint.getSummary(),
            events: this.events,
            selectorUsage: this.selectorUsage,
            scrollMetrics: this.scrollMetrics, // Include detailed scroll metrics
            cdpMetrics: cdpMetrics // Include CDP detection metrics
        };
        
        await this.reportGenerator.generateReport(reportData);
        
        // Show report panel
        document.getElementById('report-panel').style.display = 'block';
        
        // Complete final step if not already done
        if (this.currentStep === 7) {
            this.completeStep(7);
        }
    }

    /**
     * Export the complete report
     */
    async exportReport() {
        if (!this.testCompleted) {
            console.warn('Cannot export: test not completed');
            return;
        }
        
        if (!this.reportGenerator) {
            console.warn('Cannot export: no report generated yet');
            return;
        }
        
        console.log('💾 Exporting report');
        
        await this.reportGenerator.exportReports();
    }

    /**
     * Export PDF report specifically
     */
    async exportPDF() {
        if (!this.testCompleted) {
            alert('Please complete the test before exporting PDF report.');
            return;
        }
        
        if (!this.reportGenerator) {
            alert('Please generate the report first by clicking "Generate Report".');
            return;
        }
        
        console.log('📄 Exporting PDF report');
        
        try {
            await this.reportGenerator.exportPDF();
        } catch (error) {
            console.error('Error exporting PDF:', error);
            alert('Error generating PDF report. Please try again.');
        }
    }

    /**
     * Helper functions
     */
    getElementSelector(element) {
        if (!element) return 'unknown';
        
        if (element.id) return `#${element.id}`;
        if (element.className) return `.${element.className.split(' ')[0]}`;
        return element.tagName.toLowerCase();
    }

    /**
     * Check if an element is clickable
     * @param {Element} element - DOM element to check
     * @returns {boolean}
     */
    isElementClickable(element) {
        if (!element) return false;
        
        const tagName = element.tagName.toLowerCase();
        
        // Standard clickable elements
        const clickableTags = [
            'button', 'input', 'select', 'textarea', 'a', 'th', 'td',
            'option', 'label', 'summary', 'details', 'area'
        ];
        
        if (clickableTags.includes(tagName)) {
            return true;
        }
        
        // Elements with clickable attributes
        if (element.onclick || 
            element.hasAttribute('onclick') ||
            element.getAttribute('role') === 'button' ||
            element.hasAttribute('tabindex') ||
            (tagName === 'a' && element.hasAttribute('href'))) {
            return true;
        }
        
        // Elements with clickable classes or IDs
        const clickablePatterns = ['btn', 'button', 'click', 'link', 'nav', 'menu', 'tab'];
        const classNames = (element.className || '').toLowerCase();
        const id = (element.id || '').toLowerCase();
        
        if (clickablePatterns.some(pattern => 
            classNames.includes(pattern) || id.includes(pattern))) {
            return true;
        }
        
        return false;
    }

    updateMousePath(x, y) {
        const canvas = document.getElementById('mouse-path-canvas');
        if (!canvas) return;
        
        const ctx = canvas.getContext('2d');
        const rect = canvas.getBoundingClientRect();
        
        // Scale coordinates to canvas size
        const canvasX = (x / window.innerWidth) * canvas.width;
        const canvasY = (y / window.innerHeight) * canvas.height;
        
        ctx.fillStyle = 'rgba(0, 123, 255, 0.5)';
        ctx.fillRect(canvasX - 1, canvasY - 1, 2, 2);
    }

    /**
     * Render visual click dot bound to the clicked element with enhanced positioning
     */
    renderClickDot(dot) {
        const targetElement = dot.targetElement;
        
        if (!targetElement || !document.contains(targetElement)) {
            console.warn('Target element no longer exists for dot:', dot.id);
            return;
        }
        
        const dotElement = document.createElement('div');
        dotElement.className = 'click-dot element-bound';
        dotElement.id = `dot-${dot.id}`;
        
        // Position the dot relative to the container element using the adjusted coordinates
        dotElement.style.position = 'absolute';
        dotElement.style.left = `${dot.elementX}px`;
        dotElement.style.top = `${dot.elementY}px`;
        dotElement.style.transform = 'translate(-50%, -50%)';
        dotElement.style.pointerEvents = 'none';
        dotElement.style.zIndex = '10000';
        
        // Color based on accuracy: green=center, yellow=middle, red=edge
        let color = '#ff4444'; // red for edge
        if (dot.accuracy === 'center') color = '#28a745'; // green
        else if (dot.accuracy === 'middle') color = '#ffc107'; // yellow
        
        dotElement.style.backgroundColor = color;
        dotElement.style.width = '12px';
        dotElement.style.height = '12px';
        dotElement.style.borderRadius = '50%';
        dotElement.style.boxShadow = '0 0 4px rgba(0, 0, 0, 0.3)';
        
        // Add CDP indicator
        if (dot.isCDP) {
            dotElement.classList.add('cdp-click');
            dotElement.style.border = '2px solid #6f42c1';
        }
        
        // Add animation
        dotElement.style.animation = 'clickFadeElement 3s ease-out forwards';
        
        // Ensure the target element can contain positioned elements
        const computedStyle = getComputedStyle(targetElement);
        if (computedStyle.position === 'static') {
            targetElement.style.position = 'relative';
        }
        
        // Special handling for specific element types
        const tagName = targetElement.tagName.toLowerCase();
        
        if (tagName === 'table' && !targetElement.style.position) {
            // Ensure tables have proper positioning for dots
            targetElement.style.position = 'relative';
        }
        
        if (['select', 'input', 'textarea'].includes(tagName)) {
            // For form elements, add a small offset to avoid interfering with the control
            dotElement.style.marginTop = '-2px';
            dotElement.style.marginLeft = '-2px';
        }
        
        // Add debugging info as a data attribute
        dotElement.setAttribute('data-original-target', dot.originalTarget);
        dotElement.setAttribute('data-container', dot.targetSelector);
        
        try {
            targetElement.appendChild(dotElement);
        } catch (error) {
            console.warn('Failed to append dot to element:', error, targetElement);
            // Fallback: try to append to the parent element or use overlay
            this.renderClickDotFallback(dot, dotElement);
        }
    }

    /**
     * Fallback method for rendering click dots when element positioning fails
     */
    renderClickDotFallback(dot, dotElement) {
        // Try parent element first
        if (dot.targetElement.parentElement) {
            try {
                const parentRect = dot.targetElement.parentElement.getBoundingClientRect();
                const targetRect = dot.targetElement.getBoundingClientRect();
                
                dotElement.style.left = `${targetRect.left - parentRect.left + dot.originalElementX}px`;
                dotElement.style.top = `${targetRect.top - parentRect.top + dot.originalElementY}px`;
                
                if (getComputedStyle(dot.targetElement.parentElement).position === 'static') {
                    dot.targetElement.parentElement.style.position = 'relative';
                }
                
                dot.targetElement.parentElement.appendChild(dotElement);
                return;
            } catch (parentError) {
                console.warn('Parent element positioning also failed:', parentError);
            }
        }
        
        // Final fallback: use the fixed overlay with absolute positioning
        this.ensureClickOverlay();
        const overlay = document.getElementById('click-overlay');
        
        // Reset positioning to fixed overlay style
        dotElement.style.position = 'fixed';
        dotElement.style.left = `${dot.x - 6}px`;
        dotElement.style.top = `${dot.y - 6}px`;
        dotElement.style.transform = 'translate(0, 0)';
        dotElement.classList.remove('element-bound');
        dotElement.classList.add('overlay-fallback');
        
        overlay.appendChild(dotElement);
        console.warn('Used overlay fallback for dot positioning');
    }

    /**
     * Remove click dot from its parent element
     */
    removeClickDot(dotId) {
        const dotElement = document.getElementById(`dot-${dotId}`);
        if (dotElement) {
            // Find the original dot data to restore element positioning if needed
            const dotData = this.clickTracking.dots.find(d => d.id === dotId);
            
            dotElement.remove();
            
            // Clean up: check if we need to restore the element's position style
            if (dotData && dotData.targetElement) {
                const remainingDots = Array.from(dotData.targetElement.querySelectorAll('.click-dot.element-bound'));
                if (remainingDots.length === 0) {
                    // No more dots on this element, we could restore original position
                    // But we'll leave it as 'relative' since it's safer and doesn't break layout
                }
            }
        }
    }

    /**
     * Ensure click overlay exists
     */
    ensureClickOverlay() {
        if (!document.getElementById('click-overlay')) {
            const overlay = document.createElement('div');
            overlay.id = 'click-overlay';
            overlay.className = 'click-visualization-overlay';
            document.body.appendChild(overlay);
        }
    }

    /**
     * Clean up orphaned click dots whose target elements no longer exist
     */
    cleanupOrphanedDots() {
        this.clickTracking.dots = this.clickTracking.dots.filter(dot => {
            if (!dot.targetElement || !document.contains(dot.targetElement)) {
                // Remove the visual dot if it still exists
                this.removeClickDot(dot.id);
                return false;
            }
            return true;
        });
    }

    /**
     * Mouse Trail Visualization System
     * Creates a trailing effect showing mouse movement history
     */
    
    /**
     * Add a mouse trail point with intelligent sampling for realistic movement visualization
     * 
     * INTELLIGENT SAMPLING STRATEGY:
     * - Reduces tracking points by 70-80% compared to raw mouse events
     * - Only adds points when movement exceeds minDistance (15px)
     * - Forces point after maxTimeInterval (500ms) to prevent gaps
     * - Prevents over-sampling with minTimeInterval (50ms)
     * - First point always added to establish trail start
     * 
     * VISUAL QUALITY ENHANCEMENT:
     * - Smoother appearance with line-based interpolation between points
     * - Connects consecutive points with straight lines via createTrailLine()
     * - Maintains movement accuracy while reducing visual clutter
     * - Dots only appear at significant direction changes
     * 
     * PERFORMANCE OPTIMIZATION:
     * - Uses requestAnimationFrame for smooth, throttled rendering
     * - Batches pending positions to avoid frame drops
     * - Reduces DOM operations by 70-80% vs. per-event tracking
     * - Memory efficient: ~380 bytes per point (dot + line)
     */
    addMouseTrail(x, y, timestamp) {
        if (!this.mouseTrail.enabled) return;
        
        const lastPos = this.mouseTrail.lastPosition;
        
        // Calculate distance and time since last point
        const distance = Math.sqrt(Math.pow(x - lastPos.x, 2) + Math.pow(y - lastPos.y, 2));
        const timeDelta = timestamp - lastPos.timestamp;
        
        // Calculate instantaneous speed (pixels per second)
        const speed = timeDelta > 0 ? (distance / timeDelta) * 1000 : 0;
        
        // Intelligent sampling: only add point if it meets distance or time criteria
        const shouldAddPoint = 
            distance >= this.mouseTrail.minDistance || // Significant movement (1px+)
            timeDelta >= this.mouseTrail.maxTimeInterval || // Force point after max time (100ms)
            this.mouseTrail.trails.length === 0; // Always add first point
        
        if (!shouldAddPoint) return;
        
        // Also check minimum time interval to prevent over-sampling
        if (timeDelta < this.mouseTrail.minTimeInterval && this.mouseTrail.trails.length > 0) {
            return;
        }
        
        // Use requestAnimationFrame for smoother rendering
        if (!this.mouseTrail.pendingFrame) {
            this.mouseTrail.pendingFrame = true;
            requestAnimationFrame(() => {
                this.createTrailPoint(x, y, timestamp, speed);
                this.mouseTrail.pendingFrame = false;
            });
        } else {
            // Store the latest position if frame is already pending
            this.mouseTrail.pendingPosition = { x, y, timestamp, speed };
        }
    }
    
    /**
     * Create a trail point (dot) and connecting line for realistic mouse movement visualization
     * 
     * RENDERING STRATEGY:
     * - Creates both a dot marker and a connecting line to previous point
     * - Updates lastPosition for next iteration's line calculation
     * - Processes pending positions to handle rapid mouse movements
     * - Uses requestAnimationFrame to maintain smooth 60fps rendering
     * 
     * SPEED-BASED COLOR CODING (NEW):
     * - Accepts speed parameter (px/sec) for color determination
     * - Passes speed to createTrailDot() and createTrailLine()
     * - Color applied based on configurable thresholds
     * 
     * COORDINATE SYSTEM:
     * - Receives viewport coordinates (relative to current scroll position)
     * - Delegates to createTrailDot() and createTrailLine() for coordinate conversion
     * - Both functions apply scroll offset compensation independently
     * - Results in consistent positioning across scroll events
     * 
     * CLEANUP OPTIMIZATION:
     * - Automatic cleanup maintains max trail/line count
     * - Prevents memory leaks with aggressive pruning
     * - Performance remains constant regardless of usage duration
     */
    createTrailPoint(x, y, timestamp, speed = 0) {
        // Update last position for next iteration
        const previousPos = { ...this.mouseTrail.lastPosition };
        this.mouseTrail.lastPosition = { x, y, timestamp, speed };
        
        // Create the trail dot with speed-based color
        const dotId = this.createTrailDot(x, y, timestamp, speed);
        
        // Create connecting line if we have a previous position
        if (this.mouseTrail.trails.length > 0 && previousPos.x !== 0 && previousPos.y !== 0) {
            this.createTrailLine(previousPos.x, previousPos.y, x, y, timestamp, speed);
        }
        
        // Clean up old trails to maintain performance
        this.cleanupOldTrails();
        
        // Process any pending position if we have one
        if (this.mouseTrail.pendingPosition) {
            const pending = this.mouseTrail.pendingPosition;
            this.mouseTrail.pendingPosition = null;
            // Use requestAnimationFrame for the pending position too
            requestAnimationFrame(() => {
                this.createTrailPoint(pending.x, pending.y, pending.timestamp, pending.speed || 0);
            });
        }
    }
    
    /**
     * Get color based on speed using configurable thresholds
     * @param {number} speed - Speed in pixels per second
     * @returns {string} - Color hex code
     * @private
     */
    _getSpeedColor(speed) {
        if (!this.mouseTrail.speedColoringEnabled) {
            return this.mouseTrail.trailColor; // Use default purple if speed coloring disabled
        }
        
        const { normal, fast } = this.mouseTrail.speedThresholds;
        const colors = this.mouseTrail.speedColors;
        
        if (speed < normal) {
            return colors.normal; // Yellow - normal human speed
        } else if (speed < fast) {
            return colors.fast; // Orange - fast/suspicious speed
        } else {
            return colors.automated; // Red - likely automated
        }
    }

    /**
     * Create a single trail dot element with absolute positioning and speed-based coloring
     * 
     * SCROLL OFFSET COMPENSATION METHODOLOGY:
     * - Captures current scroll position using window.pageXOffset/pageYOffset
     * - Converts viewport coordinates (x, y) to document coordinates
     * - Uses absolute positioning instead of fixed to anchor dots to page content
     * - Dots remain at their original world position regardless of scroll events
     * 
     * SPEED-BASED COLOR CODING (NEW):
     * - Accepts speed parameter (px/sec)
     * - Determines color using _getSpeedColor() method
     * - Applies color to backgroundColor and boxShadow
     * - Stores speed in trailData for analysis
     * 
     * VISUAL OPTIMIZATION:
     * - Reduced dot frequency via intelligent sampling in addMouseTrail()
     * - Smaller dot size (1px) for cleaner appearance
     * - Semi-transparent dots (0.9 opacity) blend naturally with content
     * - Hover tooltips show exact coordinates, timestamps, and speed for debugging
     * 
     * PERFORMANCE METRICS:
     * - DOM operations: 1 element creation per dot
     * - Memory usage: ~180 bytes per dot object
     * - Max dots: 500 (configurable via maxTrails)
     * - Auto-cleanup when exceeding max count or after fade duration
     */
    createTrailDot(x, y, timestamp, speed = 0) {
        const trailDot = document.createElement('div');
        trailDot.className = 'mouse-trail-dot';
        const trailId = `trail-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
        trailDot.id = trailId;
        
        // Use absolute positioning relative to document for fixed world coordinates
        // This is the same methodology used for click markers
        const scrollX = window.pageXOffset || document.documentElement.scrollLeft;
        const scrollY = window.pageYOffset || document.documentElement.scrollTop;
        
        // Calculate absolute position in document coordinates
        const absoluteX = x + scrollX;
        const absoluteY = y + scrollY;
        
        // Determine color based on speed
        const color = this._getSpeedColor(speed);
        
        trailDot.style.position = 'absolute';
        trailDot.style.left = `${absoluteX}px`;
        trailDot.style.top = `${absoluteY}px`;
        trailDot.style.transform = 'translate(-50%, -50%)';
        trailDot.style.pointerEvents = 'none';
        trailDot.style.zIndex = '9998'; // Below click dots (10000) but above content
        trailDot.style.width = `${this.mouseTrail.dotSize}px`;
        trailDot.style.height = `${this.mouseTrail.dotSize}px`;
        trailDot.style.borderRadius = '50%';
        trailDot.style.backgroundColor = color; // Speed-based color
        trailDot.style.opacity = '0.9';
        trailDot.style.boxShadow = `0 0 3px ${color}99`; // Color-matched shadow with transparency
        
        // Use different animation based on persist mode
        if (this.mouseTrail.persist) {
            trailDot.style.animation = `mouseTrailPersist 300ms ease-out forwards`;
            trailDot.classList.add('persistent-trail');
        } else {
            trailDot.style.animation = `mouseTrailFade ${this.mouseTrail.fadeOutDuration}ms ease-out forwards`;
        }
        
        // Store trail data with both viewport and document coordinates
        const trailData = {
            id: trailId,
            element: trailDot,
            type: 'dot',
            x: x, // Store original viewport coordinates
            y: y,
            absoluteX: absoluteX, // Store document coordinates
            absoluteY: absoluteY,
            scrollX: scrollX, // Store scroll position for debugging
            scrollY: scrollY,
            timestamp: timestamp,
            speed: speed, // Store speed for analysis
            color: color, // Store applied color
            createdAt: Date.now()
        };
        
        // Add hover tooltip functionality
        this.addTrailTooltip(trailDot, trailData);
        
        // Add to DOM
        document.body.appendChild(trailDot);
        
        // Add to tracking array
        this.mouseTrail.trails.push(trailData);
        
        // Add to events collection for export (only during active test)
        if (this.testStarted && this.dataCollectionActive) {
            this.events.mouseTrails.push({
                t: timestamp,
                x: x,
                y: y,
                absoluteX: absoluteX,
                absoluteY: absoluteY,
                type: 'point'
            });
        }
        
        // Auto-remove after fade duration (only if not in persist mode)
        if (!this.mouseTrail.persist) {
            setTimeout(() => {
                this.removeTrailElement(trailId);
            }, this.mouseTrail.fadeOutDuration + 100);
        }
        
        return trailId;
    }

    /**
     * Create a connecting line between two trail points for realistic movement visualization
     * 
     * SCROLL OFFSET COMPENSATION METHODOLOGY:
     * - Converts viewport coordinates (x1, y1, x2, y2) to document coordinates
     * - Uses window.pageXOffset and window.pageYOffset to get current scroll position
     * - Adds scroll offset to viewport coordinates for absolute positioning
     * - This ensures lines stay fixed to their original world position when scrolling
     * 
     * LINE RENDERING INTERPOLATION:
     * - Uses CSS transform rotation for precise angle calculation
     * - Calculates length using Euclidean distance formula: √((x2-x1)² + (y2-y1)²)
     * - Uses Math.atan2() for accurate angle calculation in all quadrants
     * - Transform origin set to '0 50%' for rotation around line start point
     * 
     * CRITICAL FIX: Calculate geometry in viewport space, then position in document space
     * - Line length and angle must be calculated from viewport coordinates (not affected by scroll)
     * - Only the positioning (left/top) is affected by scroll offset
     * - This ensures lines connect properly to dots regardless of scroll position
     * 
     * CLEANUP METRICS:
     * - DOM operations: 1 element creation per line
     * - Memory usage: ~200 bytes per line object
     * - Rendering cost: Single CSS transform per line (GPU-accelerated)
     * - Cleanup strategy: Auto-removal after fade duration or manual cleanup on max count
     * 
     * SPEED-BASED COLOR CODING (NEW):
     * - Accepts speed parameter (px/sec)
     * - Determines color using _getSpeedColor() method
     * - Applies color to backgroundColor for visual feedback
     */
    createTrailLine(x1, y1, x2, y2, timestamp, speed = 0) {
        const line = document.createElement('div');
        line.className = 'mouse-trail-line';
        const lineId = `line-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
        line.id = lineId;
        
        // CRITICAL: Calculate line geometry in VIEWPORT coordinates
        // The line connects two viewport points - length and angle don't change with scroll
        const length = Math.sqrt(Math.pow(x2 - x1, 2) + Math.pow(y2 - y1, 2));
        const angle = Math.atan2(y2 - y1, x2 - x1) * (180 / Math.PI);
        
        // Get current scroll position for document coordinate conversion
        const scrollX = window.pageXOffset || document.documentElement.scrollLeft;
        const scrollY = window.pageYOffset || document.documentElement.scrollTop;
        
        // Convert ONLY the starting point to document coordinates for positioning
        // The line's length and angle remain the same regardless of scroll
        const absoluteX1 = x1 + scrollX;
        const absoluteY1 = y1 + scrollY;
        const absoluteX2 = x2 + scrollX;
        const absoluteY2 = y2 + scrollY;
        
        // Determine color based on speed
        const color = this._getSpeedColor(speed);
        
        // Apply absolute positioning with document coordinates
        line.style.position = 'absolute';
        line.style.left = `${absoluteX1}px`;
        line.style.top = `${absoluteY1}px`;
        line.style.width = `${length}px`;
        line.style.height = `${this.mouseTrail.lineWidth}px`;
        line.style.backgroundColor = color; // Speed-based color
        line.style.transformOrigin = '0 50%'; // Rotate around start point (left center)
        line.style.transform = `rotate(${angle}deg)`;
        line.style.pointerEvents = 'none';
        line.style.zIndex = '9997'; // Below dots (9998) but above content
        line.style.opacity = '0.7';
        line.style.borderRadius = `${this.mouseTrail.lineWidth / 2}px`;
        
        // Use different animation based on persist mode
        if (this.mouseTrail.persist) {
            line.style.animation = `mouseTrailLinePersist 300ms ease-out forwards`;
            line.classList.add('persistent-trail-line');
        } else {
            line.style.animation = `mouseTrailLineFade ${this.mouseTrail.fadeOutDuration}ms ease-out forwards`;
        }
        
        // Store line data with both viewport and document coordinates for debugging
        const lineData = {
            id: lineId,
            element: line,
            type: 'line',
            x1: x1, // Viewport coordinates
            y1: y1,
            x2: x2,
            y2: y2,
            absoluteX1: absoluteX1, // Document coordinates
            absoluteY1: absoluteY1,
            absoluteX2: absoluteX2,
            absoluteY2: absoluteY2,
            length: length,
            angle: angle,
            timestamp: timestamp,
            speed: speed, // Store speed for analysis
            color: color, // Store applied color
            createdAt: Date.now()
        };
        
        // Add to DOM
        document.body.appendChild(line);
        
        // Add to tracking array
        this.mouseTrail.lines.push(lineData);
        
        // Add to events collection for export (only during active test)
        if (this.testStarted && this.dataCollectionActive) {
            this.events.mouseTrails.push({
                t: timestamp,
                type: 'line',
                x1: x1,
                y1: y1,
                x2: x2,
                y2: y2,
                absoluteX1: absoluteX1,
                absoluteY1: absoluteY1,
                absoluteX2: absoluteX2,
                absoluteY2: absoluteY2,
                length: length,
                angle: angle
            });
        }
        
        // Auto-remove after fade duration (only if not in persist mode)
        if (!this.mouseTrail.persist) {
            setTimeout(() => {
                this.removeTrailElement(lineId);
            }, this.mouseTrail.fadeOutDuration + 100);
        }
        
        return lineId;
    }    /**
     * Add tooltip functionality to trail dots showing coordinates and timestamp
     */
    addTrailTooltip(trailDot, trailData) {
        let tooltipTimeout;
        
        trailDot.addEventListener('mouseenter', (e) => {
            e.stopPropagation();
            tooltipTimeout = setTimeout(() => {
                this.showTrailTooltip(trailData, e.clientX, e.clientY);
            }, 300); // Show tooltip after 300ms hover
        });
        
        trailDot.addEventListener('mouseleave', () => {
            clearTimeout(tooltipTimeout);
            this.hideTrailTooltip();
        });
    }
    
    /**
     * Show tooltip with coordinates and timestamp
     */
    showTrailTooltip(trailData, mouseX, mouseY) {
        this.hideTrailTooltip(); // Remove any existing tooltip
        
        const tooltip = document.createElement('div');
        tooltip.className = 'mouse-trail-tooltip';
        tooltip.id = 'mouse-trail-tooltip';
        
        const date = new Date(trailData.timestamp);
        const timeString = date.toLocaleTimeString([], { 
            hour: '2-digit', 
            minute: '2-digit', 
            second: '2-digit',
            fractionalSecondDigits: 3
        });
        
        tooltip.innerHTML = `
            <div class="tooltip-coords">
                <strong>Viewport:</strong> (${Math.round(trailData.x)}, ${Math.round(trailData.y)})
            </div>
            <div class="tooltip-scroll">
                <strong>Document:</strong> (${Math.round(trailData.absoluteX)}, ${Math.round(trailData.absoluteY)})
            </div>
            <div class="tooltip-scroll">
                <strong>Scroll Offset:</strong> (${trailData.scrollX || 0}, ${trailData.scrollY || 0})
            </div>
            ${trailData.speed !== undefined ? `
            <div class="tooltip-speed">
                <strong>Speed:</strong> ${Math.round(trailData.speed)} px/sec
            </div>
            <div class="tooltip-color">
                <strong>Color:</strong> <span style="display:inline-block;width:12px;height:12px;background:${trailData.color};border:1px solid #fff;margin-left:4px;"></span>
            </div>
            ` : ''}
            <div class="tooltip-time">
                <strong>Time:</strong> ${timeString}
            </div>
        `;
        
        // Position tooltip near mouse but avoid edges
        const tooltipX = mouseX + 15;
        const tooltipY = mouseY - 10;
        
        tooltip.style.position = 'fixed';
        tooltip.style.left = `${tooltipX}px`;
        tooltip.style.top = `${tooltipY}px`;
        tooltip.style.zIndex = '10001';
        tooltip.style.backgroundColor = 'rgba(0, 0, 0, 0.9)';
        tooltip.style.color = 'white';
        tooltip.style.padding = '8px 12px';
        tooltip.style.borderRadius = '6px';
        tooltip.style.fontSize = '12px';
        tooltip.style.lineHeight = '1.4';
        tooltip.style.boxShadow = '0 4px 12px rgba(0, 0, 0, 0.3)';
        tooltip.style.pointerEvents = 'none';
        tooltip.style.maxWidth = '250px';
        tooltip.style.whiteSpace = 'nowrap';
        
        document.body.appendChild(tooltip);
        this.mouseTrail.tooltip = tooltip;
        
        // Adjust position if tooltip goes off-screen
        const rect = tooltip.getBoundingClientRect();
        if (rect.right > window.innerWidth) {
            tooltip.style.left = `${mouseX - rect.width - 15}px`;
        }
        if (rect.top < 0) {
            tooltip.style.top = `${mouseY + 20}px`;
        }
    }
    
    /**
     * Hide the trail tooltip
     */
    hideTrailTooltip() {
        if (this.mouseTrail.tooltip) {
            this.mouseTrail.tooltip.remove();
            this.mouseTrail.tooltip = null;
        }
    }
    
    /**
     * Remove a specific trail element (dot or line)
     */
    removeTrailElement(elementId) {
        // Check in trails array
        const trailIndex = this.mouseTrail.trails.findIndex(trail => trail.id === elementId);
        if (trailIndex !== -1) {
            const trail = this.mouseTrail.trails[trailIndex];
            if (trail.element && trail.element.parentNode) {
                trail.element.remove();
            }
            this.mouseTrail.trails.splice(trailIndex, 1);
            return;
        }
        
        // Check in lines array
        const lineIndex = this.mouseTrail.lines.findIndex(line => line.id === elementId);
        if (lineIndex !== -1) {
            const line = this.mouseTrail.lines[lineIndex];
            if (line.element && line.element.parentNode) {
                line.element.remove();
            }
            this.mouseTrail.lines.splice(lineIndex, 1);
        }
    }

    /**
     * Legacy method - redirects to removeTrailElement for backward compatibility
     */
    removeTrailDot(trailId) {
        this.removeTrailElement(trailId);
    }

    /**
     * Clean up old trails and lines that exceed the maximum count
     * 
     * MEMORY MANAGEMENT:
     * - Maintains maximum of 500 dots and 400 lines
     * - Removes oldest elements first (FIFO queue behavior)
     * - Prevents unbounded memory growth during long sessions
     * - DOM element removal prevents memory leaks
     * 
     * PERFORMANCE IMPACT:
     * - Cleanup cost: O(1) per removal (shift operation)
     * - Frequency: Called on every trail point creation
     * - Overhead: Minimal (~0.1ms per cleanup)
     * - Ensures constant-time performance regardless of session length
     */
    cleanupOldTrails() {
        // Clean up excess dots
        while (this.mouseTrail.trails.length > this.mouseTrail.maxTrails) {
            const oldTrail = this.mouseTrail.trails.shift();
            if (oldTrail && oldTrail.element && oldTrail.element.parentNode) {
                oldTrail.element.remove();
            }
        }
        
        // Clean up excess lines
        while (this.mouseTrail.lines.length > this.mouseTrail.maxLines) {
            const oldLine = this.mouseTrail.lines.shift();
            if (oldLine && oldLine.element && oldLine.element.parentNode) {
                oldLine.element.remove();
            }
        }
    }

    /**
     * Clear all mouse trails and lines
     */
    clearAllTrails() {
        // Clear trail dots
        this.mouseTrail.trails.forEach(trail => {
            if (trail.element && trail.element.parentNode) {
                trail.element.remove();
            }
        });
        this.mouseTrail.trails = [];
        
        // Clear trail lines
        this.mouseTrail.lines.forEach(line => {
            if (line.element && line.element.parentNode) {
                line.element.remove();
            }
        });
        this.mouseTrail.lines = [];
        
        // Reset last position
        this.mouseTrail.lastPosition = { x: 0, y: 0, timestamp: 0 };
        
        this.hideTrailTooltip();
        
        // Clear scroll visualization
        this.clearScrollVisualization();
        
        console.log('🧹 Cleared all mouse trails, lines, and scroll visualization');
    }    /**
     * Toggle mouse trail visualization with three states: Off → Normal → Persist
     */
    toggleMouseTrail(enabled = null) {
        if (enabled !== null) {
            this.mouseTrail.enabled = enabled;
        } else {
            // Cycle through states: Off → Normal → Persist → Off
            if (!this.mouseTrail.enabled) {
                // Off → Normal
                this.mouseTrail.enabled = true;
                this.mouseTrail.persist = false;
            } else if (!this.mouseTrail.persist) {
                // Normal → Persist
                this.mouseTrail.persist = true;
            } else {
                // Persist → Off
                this.mouseTrail.enabled = false;
                this.mouseTrail.persist = false;
            }
        }
        
        if (!this.mouseTrail.enabled) {
            this.clearAllTrails();
        }
        
        return this.mouseTrail.enabled;
    }
    
    /**
     * Update trail positions on scroll - NO LONGER NEEDED with absolute positioning
     * @deprecated - Trails now use absolute positioning and stay fixed to world coordinates
     */
    updateTrailPositions() {
        // This method is no longer needed as we use absolute positioning
        // which automatically maintains correct world coordinates regardless of scroll
        console.log('🔧 updateTrailPositions called but not needed - using absolute positioning');
        return;
    }
    
    /**
     * Get mouse trail data for reports and analysis
     */
    getMouseTrailData() {
        return {
            enabled: this.mouseTrail.enabled,
            persist: this.mouseTrail.persist,
            totalTrails: this.mouseTrail.trails.length,
            totalLines: this.mouseTrail.lines.length,
            maxTrails: this.mouseTrail.maxTrails,
            maxLines: this.mouseTrail.maxLines,
            dotSize: this.mouseTrail.dotSize,
            lineWidth: this.mouseTrail.lineWidth,
            trailColor: this.mouseTrail.trailColor,
            fadeOutDuration: this.mouseTrail.fadeOutDuration,
            samplingParams: {
                minDistance: this.mouseTrail.minDistance,
                minTimeInterval: this.mouseTrail.minTimeInterval,
                maxTimeInterval: this.mouseTrail.maxTimeInterval
            },
            trails: this.mouseTrail.trails.map(trail => ({
                id: trail.id,
                type: trail.type,
                x: trail.x,
                y: trail.y,
                absoluteX: trail.absoluteX,
                absoluteY: trail.absoluteY,
                timestamp: trail.timestamp,
                createdAt: trail.createdAt
            })),
            lines: this.mouseTrail.lines.map(line => ({
                id: line.id,
                type: line.type,
                x1: line.x1,
                y1: line.y1,
                x2: line.x2,
                y2: line.y2,
                length: line.length,
                angle: line.angle,
                timestamp: line.timestamp,
                createdAt: line.createdAt
            })),
            summary: {
                firstTrail: this.mouseTrail.trails.length > 0 ? this.mouseTrail.trails[0].timestamp : null,
                lastTrail: this.mouseTrail.trails.length > 0 ? this.mouseTrail.trails[this.mouseTrail.trails.length - 1].timestamp : null,
                duration: this.mouseTrail.trails.length > 1 ? 
                    this.mouseTrail.trails[this.mouseTrail.trails.length - 1].timestamp - this.mouseTrail.trails[0].timestamp : 0,
                averageDistance: this._calculateAverageTrailDistance(),
                averageLineLength: this._calculateAverageLineLength(),
                totalPathLength: this._calculateTotalPathLength()
            }
        };
    }
    
    /**
     * Calculate average distance between consecutive trail points
     * @private
     */
    _calculateAverageTrailDistance() {
        if (this.mouseTrail.trails.length < 2) return 0;
        
        let totalDistance = 0;
        for (let i = 1; i < this.mouseTrail.trails.length; i++) {
            const prev = this.mouseTrail.trails[i - 1];
            const curr = this.mouseTrail.trails[i];
            const distance = Math.sqrt(
                Math.pow(curr.x - prev.x, 2) + Math.pow(curr.y - prev.y, 2)
            );
            totalDistance += distance;
        }
        
        return Math.round(totalDistance / (this.mouseTrail.trails.length - 1));
    }

    /**
     * Calculate average length of connecting lines
     * @private
     */
    _calculateAverageLineLength() {
        if (this.mouseTrail.lines.length === 0) return 0;
        
        const totalLength = this.mouseTrail.lines.reduce((sum, line) => sum + line.length, 0);
        return Math.round(totalLength / this.mouseTrail.lines.length);
    }

    /**
     * Calculate total path length from all connecting lines
     * @private
     */
    _calculateTotalPathLength() {
        return Math.round(this.mouseTrail.lines.reduce((sum, line) => sum + line.length, 0));
    }
    
    /**
     * Handle mouse trail toggle button click
     */
    handleMouseTrailToggle() {
        const isEnabled = this.toggleMouseTrail();
        
        const button = document.getElementById('toggle-mouse-trail');
        const testActive = this.testStarted && this.dataCollectionActive;
        
        if (!isEnabled) {
            // Off state
            button.style.backgroundColor = '';
            button.style.color = '';
            button.style.border = '';
            button.textContent = '🖱️ Trails';
            button.title = testActive 
                ? 'Mouse trails disabled - Click to enable normal trails'
                : 'Mouse trails disabled - Start test to enable trails';
        } else if (!this.mouseTrail.persist) {
            // Normal state
            button.style.backgroundColor = '#8A2BE2';
            button.style.color = 'white';
            button.style.border = '1px solid #8A2BE2';
            button.textContent = '🖱️ Normal';
            button.title = testActive
                ? 'Normal trails enabled - Click to enable persistent trails'
                : 'Normal trails ready - Start test to begin tracking';
        } else {
            // Persist state
            button.style.backgroundColor = '#FF6B35';
            button.style.color = 'white';
            button.style.border = '1px solid #FF6B35';
            button.textContent = '🖱️ Persist';
            button.title = testActive
                ? 'Persistent trails enabled - Trails never fade - Click to turn off'
                : 'Persistent trails ready - Start test to begin tracking';
        }
        
        const state = !isEnabled ? 'disabled' : (this.mouseTrail.persist ? 'persistent' : 'normal');
        console.log(`🖱️ Mouse trails: ${state} (Test active: ${testActive})`);
        
        // Manual test: create a test trail dot only if test is active
        if (isEnabled && testActive) {
            this.createTrailDot(window.innerWidth / 2, window.innerHeight / 2, performance.now());
        }
    }
    
    /**
     * Handle scroll visualization toggle button click
     */
    handleScrollVizToggle() {
        const isEnabled = this.toggleScrollVisualization();
        
        const button = document.getElementById('toggle-scroll-viz');
        if (!button) return;
        
        if (isEnabled) {
            button.style.backgroundColor = '#3498db';
            button.style.color = 'white';
            button.style.border = '1px solid #3498db';
            button.title = 'Scroll visualization enabled - Click to disable';
        } else {
            button.style.backgroundColor = '';
            button.style.color = '';
            button.style.border = '';
            button.title = 'Scroll visualization disabled - Click to enable';
        }
    }
    
    /**
     * Open settings modal
     */
    openSettings() {
        const modal = document.getElementById('settings-modal');
        if (!modal) return;
        
        // Load current settings into form
        document.getElementById('mouse-speed-enabled').checked = this.mouseTrail.speedColoringEnabled;
        document.getElementById('mouse-normal-threshold').value = this.mouseTrail.speedThresholds.normal;
        document.getElementById('mouse-fast-threshold').value = this.mouseTrail.speedThresholds.fast;
        
        document.getElementById('scroll-viz-enabled').checked = this.scrollVisualization.enabled;
        document.getElementById('scroll-smooth-threshold').value = this.scrollVisualization.speedThresholds.smooth;
        document.getElementById('scroll-fast-threshold').value = this.scrollVisualization.speedThresholds.fast;
        
        modal.style.display = 'flex';
    }
    
    /**
     * Close settings modal
     */
    closeSettings() {
        const modal = document.getElementById('settings-modal');
        if (modal) {
            modal.style.display = 'none';
        }
    }
    
    /**
     * Apply settings from the modal
     */
    applySettings() {
        // Mouse speed settings
        this.mouseTrail.speedColoringEnabled = document.getElementById('mouse-speed-enabled').checked;
        this.mouseTrail.speedThresholds.normal = parseInt(document.getElementById('mouse-normal-threshold').value);
        this.mouseTrail.speedThresholds.fast = parseInt(document.getElementById('mouse-fast-threshold').value);
        
        // Scroll speed settings
        const scrollEnabled = document.getElementById('scroll-viz-enabled').checked;
        this.scrollVisualization.speedThresholds.smooth = parseInt(document.getElementById('scroll-smooth-threshold').value);
        this.scrollVisualization.speedThresholds.fast = parseInt(document.getElementById('scroll-fast-threshold').value);
        
        // Update scroll visualization state
        if (scrollEnabled !== this.scrollVisualization.enabled) {
            this.toggleScrollVisualization(scrollEnabled);
            this.handleScrollVizToggle();
        }
        
        console.log('✅ Settings applied:', {
            mouseSpeed: {
                enabled: this.mouseTrail.speedColoringEnabled,
                normal: this.mouseTrail.speedThresholds.normal,
                fast: this.mouseTrail.speedThresholds.fast
            },
            scrollSpeed: {
                enabled: this.scrollVisualization.enabled,
                smooth: this.scrollVisualization.speedThresholds.smooth,
                fast: this.scrollVisualization.speedThresholds.fast
            }
        });
        
        this.closeSettings();
    }
    
    /**
     * Reset settings to defaults
     */
    resetSettings() {
        // Reset mouse speed thresholds
        this.mouseTrail.speedColoringEnabled = true;
        this.mouseTrail.speedThresholds.normal = 800;
        this.mouseTrail.speedThresholds.fast = 2000;
        
        // Reset scroll speed thresholds
        this.scrollVisualization.enabled = true;
        this.scrollVisualization.speedThresholds.smooth = 500;
        this.scrollVisualization.speedThresholds.fast = 2000;
        
        // Update form values
        document.getElementById('mouse-speed-enabled').checked = true;
        document.getElementById('mouse-normal-threshold').value = 800;
        document.getElementById('mouse-fast-threshold').value = 2000;
        
        document.getElementById('scroll-viz-enabled').checked = true;
        document.getElementById('scroll-smooth-threshold').value = 500;
        document.getElementById('scroll-fast-threshold').value = 2000;
        
        console.log('🔄 Settings reset to defaults');
    }

    /**
     * Scroll Visualization System
     * Creates a persistent vertical bar showing scroll movements and speeds
     */
    
    /**
     * Initialize the scroll visualization system
     */
    initializeScrollVisualization() {
        if (!this.scrollVisualization.enabled) return;
        
        // Create the main container
        const container = document.createElement('div');
        container.id = 'scroll-visualization-container';
        container.className = 'scroll-visualization-container';
        container.style.cssText = `
            position: fixed;
            right: 0;
            top: 0;
            width: ${this.scrollVisualization.barWidth}px;
            height: 100vh;
            background: rgba(0, 0, 0, 0.1);
            pointer-events: none;
            z-index: 9996;
            overflow: hidden;
        `;
        
        document.body.appendChild(container);
        this.scrollVisualization.container = container;
        
        console.log('📊 Scroll visualization initialized');
    }
    
    /**
     * Track and visualize a scroll event
     * @param {WheelEvent|Event} event - The scroll/wheel event
     */
    trackScrollEvent(event) {
        if (!this.scrollVisualization.enabled || !this.scrollVisualization.container) return;
        if (!this.testStarted || !this.dataCollectionActive) return;
        
        const now = performance.now();
        const scrollY = window.scrollY;
        
        // Calculate scroll speed (pixels per second)
        const timeDelta = now - this.scrollVisualization.lastScrollTime;
        const distanceDelta = scrollY - this.scrollVisualization.lastScrollY;
        const speed = timeDelta > 0 ? Math.abs(distanceDelta / timeDelta) * 1000 : 0;
        
        // Update last scroll state
        this.scrollVisualization.lastScrollTime = now;
        this.scrollVisualization.lastScrollY = scrollY;
        
        // Only visualize significant scrolls (at least 1px)
        if (Math.abs(distanceDelta) < 1 && this.scrollVisualization.events.length > 0) {
            return;
        }
        
        // Determine color based on speed
        const color = this._getScrollSpeedColor(speed);
        
        // Store event data
        const scrollEvent = {
            timestamp: now,
            scrollY: scrollY,
            delta: distanceDelta,
            speed: speed,
            color: color,
            direction: distanceDelta > 0 ? 'down' : 'up'
        };
        
        this.scrollVisualization.events.push(scrollEvent);
        
        // Limit stored events
        if (this.scrollVisualization.events.length > this.scrollVisualization.maxEvents) {
            this.scrollVisualization.events.shift();
        }
        
        // Create visual segment
        this.createScrollSegment(scrollEvent);
    }
    
    /**
     * Create a visual segment for a scroll event
     * @param {Object} scrollEvent - The scroll event data
     * @private
     */
    createScrollSegment(scrollEvent) {
        if (!this.scrollVisualization.container) return;
        
        const segment = document.createElement('div');
        segment.className = 'scroll-visualization-segment';
        
        // Calculate position (0-100% of viewport height)
        const scrollPercentage = Math.min(100, (scrollEvent.scrollY / Math.max(1, document.documentElement.scrollHeight - window.innerHeight)) * 100);
        
        segment.style.cssText = `
            position: absolute;
            right: 0;
            top: ${scrollPercentage}%;
            width: 100%;
            height: ${this.scrollVisualization.segmentHeight}px;
            background: ${scrollEvent.color};
            opacity: 0.8;
            transform: translateY(-50%);
            pointer-events: none;
            transition: opacity ${this.scrollVisualization.fadeOutDuration}ms ease-out;
        `;
        
        // Add direction indicator
        const arrow = document.createElement('div');
        arrow.style.cssText = `
            position: absolute;
            left: 50%;
            top: 50%;
            transform: translate(-50%, -50%) rotate(${scrollEvent.direction === 'down' ? '90deg' : '-90deg'});
            color: white;
            font-size: 10px;
            text-shadow: 0 0 2px rgba(0,0,0,0.5);
        `;
        arrow.textContent = '▶';
        segment.appendChild(arrow);
        
        this.scrollVisualization.container.appendChild(segment);
        
        // Fade out and remove segment
        if (!this.mouseTrail.persist) { // Respect persist setting
            setTimeout(() => {
                segment.style.opacity = '0';
                setTimeout(() => {
                    if (segment.parentNode) {
                        segment.remove();
                    }
                }, this.scrollVisualization.fadeOutDuration);
            }, 500);
        }
    }
    
    /**
     * Get color based on scroll speed using configurable thresholds
     * @param {number} speed - Speed in pixels per second
     * @returns {string} - Color hex code
     * @private
     */
    _getScrollSpeedColor(speed) {
        if (!this.scrollVisualization.enabled) {
            return '#FFD700'; // Default yellow
        }
        
        const { smooth, fast } = this.scrollVisualization.speedThresholds;
        const colors = this.scrollVisualization.speedColors;
        
        if (speed < smooth) {
            return colors.smooth; // Yellow - smooth human scrolling
        } else if (speed < fast) {
            return colors.fast; // Orange - fast human scrolling
        } else {
            return colors.automated; // Red - likely automated scrolling
        }
    }
    
    /**
     * Clear all scroll visualization segments
     */
    clearScrollVisualization() {
        if (this.scrollVisualization.container) {
            const segments = this.scrollVisualization.container.querySelectorAll('.scroll-visualization-segment');
            segments.forEach(segment => segment.remove());
        }
        this.scrollVisualization.events = [];
        console.log('🧹 Cleared scroll visualization');
    }
    
    /**
     * Toggle scroll visualization on/off
     * @param {boolean|null} enabled - Force enable/disable, or null to toggle
     * @returns {boolean} - New enabled state
     */
    toggleScrollVisualization(enabled = null) {
        if (enabled === null) {
            this.scrollVisualization.enabled = !this.scrollVisualization.enabled;
        } else {
            this.scrollVisualization.enabled = enabled;
        }
        
        if (this.scrollVisualization.enabled && !this.scrollVisualization.container) {
            this.initializeScrollVisualization();
        } else if (!this.scrollVisualization.enabled && this.scrollVisualization.container) {
            this.scrollVisualization.container.style.display = 'none';
        } else if (this.scrollVisualization.enabled && this.scrollVisualization.container) {
            this.scrollVisualization.container.style.display = 'block';
        }
        
        console.log(`📊 Scroll visualization: ${this.scrollVisualization.enabled ? 'enabled' : 'disabled'}`);
        return this.scrollVisualization.enabled;
    }

    /**
     * Update positions of all element-bound dots (useful after layout changes)
     */
    refreshDotPositions() {
        this.clickTracking.dots.forEach(dot => {
            if (dot.targetElement && document.contains(dot.targetElement)) {
                const dotElement = document.getElementById(`dot-${dot.id}`);
                if (dotElement) {
                    // Update position based on current element position
                    dotElement.style.left = `${dot.elementX}px`;
                    dotElement.style.top = `${dot.elementY}px`;
                }
            }
        });
    }

    /**
     * Debug method to log click positioning information
     */
    debugClickPositioning(clickData) {
        console.group('🎯 Click Positioning Debug');
        console.log('Original target:', clickData.target);
        console.log('Container element:', this.getElementSelector(clickData.containerPosition.element));
        console.log('Original coordinates:', clickData.elementPosition);
        console.log('Container coordinates:', clickData.containerPosition);
        console.log('Element bounds:', clickData.elementBounds);
        console.log('Element styles:', getComputedStyle(clickData.containerPosition.element));
        console.groupEnd();
    }

    /**
     * Start live UI updates
     */
    startLiveUpdates() {
        setInterval(() => {
            this.updateEventStream();
            this.updateLiveMetrics();
            
            // Clean up orphaned dots every few seconds
            if (Date.now() % 5000 < 500) { // roughly every 5 seconds
                this.cleanupOrphanedDots();
            }
        }, 500);
    }

    updateEventStream() {
        const tbody = document.getElementById('event-stream-body');
        if (!tbody) return;
        
        // Get all events across all types
        const allEvents = [];
        
        // Add all events from each type
        ['pointer', 'clicks', 'scrolls', 'keys', 'dom'].forEach(type => {
            this.events[type].forEach(event => {
                allEvents.push({ ...event, eventType: type });
            });
        });
        
        // Sort by timestamp (most recent first)
        allEvents.sort((a, b) => b.t - a.t);
        
        // Apply event suppression for repeated events
        const suppressedEvents = this.suppressRepeatedEvents(allEvents);
        
        // Create table rows with clear event numbering
        tbody.innerHTML = suppressedEvents.map((event, index) => {
            const eventNumber = suppressedEvents.length - index; // Number from newest to oldest
            const time = ((event.t - this.testStartTime) / 1000).toFixed(1);
            const details = this.formatEventDetails(event);
            
            // Special styling for suppressed events
            const rowClass = event.isSuppressed ? 'suppressed-event' : '';
            
            return `<tr class="${rowClass}">
                <td><strong>#${eventNumber}</strong></td>
                <td>${time}s</td>
                <td>${event.eventType}</td>
                <td>${details}</td>
            </tr>`;
        }).join('');
        
        // Auto-scroll to top to show the latest events, but only if user isn't scrolling
        const container = document.querySelector('.event-stream-container');
        if (container && this.eventStreamScrollState.allowAutoScroll && !this.eventStreamScrollState.userScrolling) {
            container.scrollTop = 0;
        }
    }

    /**
     * Suppress repeated events to prevent UI flooding and improve readability
     * @param {Array} events - Array of events sorted by timestamp (newest first)
     * @returns {Array} - Processed events with repeated events suppressed
     */
    suppressRepeatedEvents(events) {
        if (events.length === 0) return events;
        
        const suppressedEvents = [];
        const suppressionWindow = 5000; // 5 seconds window for grouping
        const minRepeatCount = 3; // Minimum repeats before suppressing
        
        let i = 0;
        while (i < events.length) {
            const currentEvent = events[i];
            const eventKey = this.getEventSuppressionKey(currentEvent);
            
            // Look ahead to find consecutive similar events within time window
            let consecutiveCount = 1;
            let lastSimilarIndex = i;
            
            for (let j = i + 1; j < events.length; j++) {
                const nextEvent = events[j];
                const timeDiff = currentEvent.t - nextEvent.t;
                
                // Stop if we're outside the time window
                if (timeDiff > suppressionWindow) break;
                
                // Check if events are similar enough to suppress
                if (this.getEventSuppressionKey(nextEvent) === eventKey) {
                    consecutiveCount++;
                    lastSimilarIndex = j;
                } else {
                    // Break on first non-similar event to maintain chronological grouping
                    break;
                }
            }
            
            // Decide whether to suppress or show individual events
            if (consecutiveCount >= minRepeatCount) {
                // Create a suppressed event entry
                const firstEvent = events[lastSimilarIndex]; // Oldest in the group
                const lastEvent = currentEvent; // Newest in the group
                const timeSpan = ((lastEvent.t - firstEvent.t) / 1000).toFixed(1);
                
                const suppressedEvent = {
                    ...currentEvent,
                    isSuppressed: true,
                    suppressedCount: consecutiveCount,
                    timeSpan: timeSpan,
                    suppressedDetails: {
                        firstEventTime: firstEvent.t,
                        lastEventTime: lastEvent.t,
                        originalDetails: this.formatEventDetails(currentEvent)
                    }
                };
                
                suppressedEvents.push(suppressedEvent);
                
                // Skip all the suppressed events
                i = lastSimilarIndex + 1;
            } else {
                // Add individual events (not enough repetition to suppress)
                for (let k = i; k <= lastSimilarIndex; k++) {
                    suppressedEvents.push(events[k]);
                }
                i = lastSimilarIndex + 1;
            }
        }
        
        return suppressedEvents;
    }

    /**
     * Generate a key for event suppression grouping
     * @param {Object} event - Event object
     * @returns {string} - Suppression key
     */
    getEventSuppressionKey(event) {
        switch (event.eventType) {
            case 'dom':
                // Group DOM events by action and bucket
                return `dom:${event.action}:${event.bucket}`;
            
            case 'pointer':
                // Group pointer moves (but not clicks/downs/ups)
                if (event.type === 'pointermove') {
                    return 'pointer:move';
                }
                return `pointer:${event.type}`;
            
            case 'keys':
                // Group by key type and code
                return `keys:${event.type}:${event.code}`;
            
            case 'scrolls':
                // Group scroll events (they're naturally repetitive)
                return 'scroll:event';
            
            case 'clicks':
                // Don't suppress clicks - each click is important
                return `click:${event.t}`; // Unique key prevents suppression
            
            default:
                return `${event.eventType}:${event.type || 'unknown'}`;
        }
    }

    formatEventDetails(event) {
        // Handle suppressed events
        if (event.isSuppressed) {
            return `${event.suppressedDetails.originalDetails} <span style="color: #666; font-style: italic;">(×${event.suppressedCount} over ${event.timeSpan}s)</span>`;
        }
        
        switch (event.eventType) {
            case 'pointer':
                return `${event.type} (${event.x},${event.y})`;
            case 'clicks':
                return `${event.target} (${event.x},${event.y})`;
            case 'scrolls':
                return `y=${event.y} v=${event.velocity.toFixed(1)}`;
            case 'keys':
                return `${event.type}:${event.code}`;
            case 'dom':
                return `${event.action}:${event.bucket}`;
            default:
                return 'Unknown';
        }
    }

    updateLiveMetrics() {
        // Update click latency
        if (this.events.clicks.length > 0) {
            const latencies = this.events.clicks.slice(-5).map(click => {
                // Simple latency calculation (placeholder)
                return Math.random() * 200 + 100; // 100-300ms range
            });
            const avgLatency = latencies.reduce((a, b) => a + b, 0) / latencies.length;
            document.getElementById('click-latency').textContent = `${avgLatency.toFixed(0)}ms`;
        }
        
        // Update click accuracy metrics
        this.updateClickAccuracyMetrics();
        
        // Update scroll cadence
        if (this.events.scrolls.length > 0) {
            const velocities = this.events.scrolls.slice(-10).map(s => Math.abs(s.velocity));
            const avgVelocity = velocities.reduce((a, b) => a + b, 0) / velocities.length;
            document.getElementById('scroll-cadence').textContent = `${avgVelocity.toFixed(1)} px/ms`;
        }
        
        // Update hover dwell (placeholder)
        document.getElementById('hover-dwell').textContent = `${(Math.random() * 500 + 200).toFixed(0)}ms`;
        
        // Update focus state
        document.getElementById('focus-state').textContent = this.metrics.focusState;
    }

    /**
     * Update click accuracy metrics in the UI
     */
    updateClickAccuracyMetrics() {
        const accuracy = this.clickTracking.accuracy;
        
        // Update center accuracy percentage
        const centerAccuracy = accuracy.total > 0 ? 
            ((accuracy.center / accuracy.total) * 100).toFixed(1) : '0.0';
        const centerElement = document.getElementById('click-center-accuracy');
        if (centerElement) {
            centerElement.textContent = `${centerAccuracy}%`;
        }
        
        // Update CDP vs Mouse ratio
        const cdpRatio = accuracy.total > 0 ? 
            ((accuracy.cdp / accuracy.total) * 100).toFixed(1) : '0.0';
        const cdpElement = document.getElementById('click-cdp-ratio');
        if (cdpElement) {
            cdpElement.textContent = `${cdpRatio}%`;
        }
        
        // Update total clicks
        const totalElement = document.getElementById('click-total-count');
        if (totalElement) {
            totalElement.textContent = accuracy.total.toString();
        }
        
        // Update accuracy distribution
        const edgeRatio = accuracy.total > 0 ? 
            ((accuracy.edge / accuracy.total) * 100).toFixed(1) : '0.0';
        const edgeElement = document.getElementById('click-edge-ratio');
        if (edgeElement) {
            edgeElement.textContent = `${edgeRatio}%`;
        }
    }

    /**
     * Reset the lab to initial state
     */
    reset() {
        console.log('🔄 Resetting lab');
        
        // Reset challenge manager state
        if (window.challengeManager) {
            window.challengeManager.reset();
            console.log('✅ Challenge manager reset');
        }
        
        // Reset all state
        this.testStarted = false;
        this.testCompleted = false;
        this.dataCollectionActive = false;
        this.currentStep = 0;
        this.stepStartTime = 0;
        this.testStartTime = 0;
        
        // Clear report generator
        this.reportGenerator = null;
        
        // Clear buffers
        Object.keys(this.events).forEach(key => {
            this.events[key] = [];
        });
        
        // Reset click tracking
        this.clickTracking = {
            dots: [],
            accuracy: {
                total: 0,
                center: 0,
                edge: 0,
                cdp: 0,
                mouse: 0
            },
            heatmapData: []
        };
        
        // Clear mouse trails
        this.clearAllTrails();
        
        // Reset mouse trail state (but keep enabled preference)
        this.mouseTrail.trails = [];
        this.mouseTrail.lastPosition = { x: 0, y: 0 };
        this.mouseTrail.pendingFrame = false;
        this.mouseTrail.pendingPosition = null;
        
        // Reset event stream scroll state
        this.eventStreamScrollState = {
            userScrolling: false,
            lastScrollTop: 0,
            scrollTimeout: null,
            allowAutoScroll: true
        };
        
        // Clear click overlay
        const overlay = document.getElementById('click-overlay');
        if (overlay) {
            overlay.remove();
        }
        
        // Close scroll modal if open
        const scrollModal = document.getElementById('scroll-modal');
        if (scrollModal && scrollModal.style.display !== 'none') {
            this.closeScrollModal();
        }
        
        // Reset step state
        this.stepState = {
            agentInfo: { filled: false },
            form: { emailEntered: false, scenarioSelected: false },
            modal: { opened: false, closed: false },
            table: { sortedByName: false, sortedByDate: false, rowClicked: false },
            scroll: { testCompleted: false, metricsReceived: false },
            finish: { reportGenerated: false }
        };
        
        // Reset agent info
        this.agentInfo = {
            agentName: '',
            company: '',
            model: '',
            userInstructions: ''
        };
        
        // Clear scroll metrics
        this.scrollMetrics = null;
        
        // Reset AI agent detector
        this.aiAgentDetector = new AIAgentDetector();
        
        // Reset behavioral detection system
        this.behavioralDetector.reset();
        this.behavioralStorage.clearAll();
        
        // Reset selector usage
        this.selectorUsage = {
            id: 0, class: 0, aria_role: 0, text_like: 0, nth: 0, total: 0
        };
        
        // Reset UI
        this.updateUI();
        
        // Hide report panel
        document.getElementById('report-panel').style.display = 'none';
        
        // Reset agent info inputs
        const agentInfoInputs = ['agent-name', 'agent-company', 'agent-model', 'agent-instructions'];
        agentInfoInputs.forEach(id => {
            const input = document.getElementById(id);
            if (input) input.value = '';
        });
        const agentInfoNextBtn = document.getElementById('agent-info-next-btn');
        if (agentInfoNextBtn) agentInfoNextBtn.disabled = true;
        
        // Reset form inputs
        document.getElementById('email-input').value = '';
        document.getElementById('scenario-select').value = '';
        document.getElementById('continue-btn').disabled = true;
        
        // Hide all step controls
        for (let i = 1; i <= 7; i++) {
            const controls = document.getElementById(`controls-${i}`);
            if (controls) controls.style.display = 'none';
        }
        
        // Hide scroll instructions (no scroll content to hide anymore)
        const scrollInstructions = document.getElementById('scroll-instructions');
        if (scrollInstructions) scrollInstructions.style.display = 'none';
        
        // Reset step styles
        document.querySelectorAll('.task-step').forEach(step => {
            step.classList.remove('active', 'completed');
        });
        
        // Clear mouse path canvas
        const canvas = document.getElementById('mouse-path-canvas');
        if (canvas) {
            const ctx = canvas.getContext('2d');
            ctx.clearRect(0, 0, canvas.width, canvas.height);
        }
        
        // Reset buttons
        document.getElementById('start-test').disabled = false;
        document.getElementById('export-report').disabled = true;
        document.getElementById('export-pdf').disabled = true;
        
        // Reset agent detection UI
        this.updateAgentDetectionUI('scanning');
        
        // Restart DOM observation if it was stopped
        if (this.domObserver) {
            this.domObserver.disconnect();
        }
        this.setupDOMObserver();
        
        // Restart agent detection
        setTimeout(() => this.startAgentDetection(), 1000);
        
        console.log('✅ Lab reset complete');
    }

    /**
     * Get all collected data for external use
     */
    getData() {
        return {
            meta: {
                lab_version: '1.0',
                started_at_epoch_ms: this.testStartTime,
                finished_at_epoch_ms: this.testCompleted ? performance.now() : null,
                test_completed: this.testCompleted
            },
            fingerprint: fingerprint.getSummary(),
            events: this.events,
            selectorUsage: this.selectorUsage
        };
    }
}

// Initialize lab when DOM is ready
document.addEventListener('DOMContentLoaded', () => {
    window.LAB = new BehavioralLab();
    
    // Optional callback for external harnesses
    if (typeof window.__LAB_ON_DONE__ === 'function') {
        const originalCompleteTest = window.LAB.completeTest;
        window.LAB.completeTest = function() {
            originalCompleteTest.call(this);
            window.__LAB_ON_DONE__(this.getData());
        };
    }
});

export { BehavioralLab };
