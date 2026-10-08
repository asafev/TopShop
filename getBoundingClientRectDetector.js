/**
 * Automation Detection Suite
 * Comprehensive detection system for AI agents and automation tools
 * Monitors multiple DOM APIs commonly used by automation frameworks
 * This must load BEFORE any automation starts interacting with the page
 */

export class AutomationDetectionSuite {
    constructor() {
        this.detectionCounts = {
            getBoundingClientRect: 0,
            scrollIntoView: 0,
            scrollTo: 0,
            scrollBy: 0,
            elementFromPoint: 0,
            directValueSet: 0,
            programmaticClick: 0,
            domTreeWalker: 0,
            nodeIterator: 0,
            getComputedStyle: 0,
            syntheticEvents: 0,
            confidence: 0
        };
        
        this.detectionLog = [];
        this.isEnabled = true;
        this.originals = {};
        this.maxLogSize = 1000; // Prevent memory overflow
        
        this.init();
    }

    init() {
        console.log('🔍 Initializing Automation Detection Suite...');
        
        this.setupGetBoundingClientRectDetection();
        this.setupScrollDetection();
        this.setupElementFromPointDetection();
        this.setupClickDetection();
        this.setupDOMTreeWalkerDetection();
        this.setupGetComputedStyleDetection();
        // this.setupSyntheticEventDetection(); // Disabled - too many false positives
        this.setupDirectValueSetDetection();
        
        // Set up real-time counter display
        this.setupCounterDisplay();
        
        console.log('✅ Automation Detection Suite initialized');
        console.log('💡 Access via: window.automationDetector');
    }

    // ============================================
    // DETECTION: getBoundingClientRect
    // ============================================
    setupGetBoundingClientRectDetection() {
        this.originals.getBoundingClientRect = Element.prototype.getBoundingClientRect;
        const self = this;
        
        Element.prototype.getBoundingClientRect = function() {
            if (self.isEnabled) {
                self.recordDetection('getBoundingClientRect', {
                    element: this.tagName,
                    id: this.id,
                    className: this.className
                });
            }
            return self.originals.getBoundingClientRect.call(this);
        };
    }

    // ============================================
    // DETECTION: Scroll Methods
    // ============================================
    setupScrollDetection() {
        this.originals.scrollIntoView = Element.prototype.scrollIntoView;
        this.originals.scrollTo = Window.prototype.scrollTo;
        this.originals.scrollBy = Window.prototype.scrollBy;
        const self = this;
        
        Element.prototype.scrollIntoView = function(arg) {
            if (self.isEnabled) {
                self.recordDetection('scrollIntoView', {
                    element: this.tagName,
                    options: arg
                });
            }
            return self.originals.scrollIntoView.call(this, arg);
        };
        
        Window.prototype.scrollTo = function(x, y) {
            if (self.isEnabled) {
                self.recordDetection('scrollTo', { x, y });
            }
            return self.originals.scrollTo.call(this, x, y);
        };
        
        Window.prototype.scrollBy = function(x, y) {
            if (self.isEnabled) {
                self.recordDetection('scrollBy', { x, y });
            }
            return self.originals.scrollBy.call(this, x, y);
        };
    }

    // ============================================
    // DETECTION: elementFromPoint
    // ============================================
    setupElementFromPointDetection() {
        this.originals.elementFromPoint = Document.prototype.elementFromPoint;
        const self = this;
        
        Document.prototype.elementFromPoint = function(x, y) {
            if (self.isEnabled) {
                self.recordDetection('elementFromPoint', { x, y });
            }
            return self.originals.elementFromPoint.call(this, x, y);
        };
    }

    // ============================================
    // DETECTION: Programmatic Clicks
    // ============================================
    setupClickDetection() {
        this.originals.click = HTMLElement.prototype.click;
        const self = this;
        
        HTMLElement.prototype.click = function() {
            if (self.isEnabled) {
                self.recordDetection('programmaticClick', {
                    element: this.tagName,
                    id: this.id,
                    className: this.className
                });
            }
            return self.originals.click.call(this);
        };
    }

    // ============================================
    // DETECTION: DOM Tree Walker & Node Iterator
    // ============================================
    setupDOMTreeWalkerDetection() {
        this.originals.createTreeWalker = Document.prototype.createTreeWalker;
        this.originals.createNodeIterator = Document.prototype.createNodeIterator;
        const self = this;
        
        Document.prototype.createTreeWalker = function(root, whatToShow, filter) {
            if (self.isEnabled) {
                self.recordDetection('domTreeWalker', { 
                    root: root.tagName || root.nodeName,
                    whatToShow 
                });
            }
            return self.originals.createTreeWalker.call(this, root, whatToShow, filter);
        };
        
        Document.prototype.createNodeIterator = function(root, whatToShow, filter) {
            if (self.isEnabled) {
                self.recordDetection('nodeIterator', { 
                    root: root.tagName || root.nodeName,
                    whatToShow 
                });
            }
            return self.originals.createNodeIterator.call(this, root, whatToShow, filter);
        };
    }

    // ============================================
    // DETECTION: getComputedStyle
    // ============================================
    setupGetComputedStyleDetection() {
        this.originals.getComputedStyle = Window.prototype.getComputedStyle;
        const self = this;
        
        Window.prototype.getComputedStyle = function(element, pseudoElt) {
            if (self.isEnabled) {
                self.recordDetection('getComputedStyle', {
                    element: element.tagName,
                    pseudoElement: pseudoElt
                });
            }
            return self.originals.getComputedStyle.call(this, element, pseudoElt);
        };
    }

    // ============================================
    // DETECTION: Synthetic Events (dispatchEvent)
    // ============================================
    // DISABLED: Causes too many false positives from legitimate framework usage
    // setupSyntheticEventDetection() {
    //     this.originals.dispatchEvent = EventTarget.prototype.dispatchEvent;
    //     const self = this;
    //     
    //     EventTarget.prototype.dispatchEvent = function(event) {
    //         if (self.isEnabled) {
    //             // Only track synthetic/programmatic events, not native browser events
    //             if (!event.isTrusted) {
    //                 self.recordDetection('syntheticEvents', {
    //                     eventType: event.type,
    //                     target: this.tagName || this.nodeName,
    //                     isTrusted: event.isTrusted
    //                 });
    //             }
    //         }
    //         return self.originals.dispatchEvent.call(this, event);
    //     };
    // }

    // ============================================
    // DETECTION: Direct Value Setting
    // ============================================
    setupDirectValueSetDetection() {
        const self = this;
        
        // Monitor input value changes
        const originalValueDescriptor = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value');
        Object.defineProperty(HTMLInputElement.prototype, 'value', {
            get() {
                return originalValueDescriptor.get.call(this);
            },
            set(newValue) {
                if (self.isEnabled) {
                    // Detect if value was set programmatically (no focus/input event)
                    const hasRecentUserInteraction = Date.now() - (this._lastUserInteraction || 0) < 100;
                    if (!hasRecentUserInteraction) {
                        self.recordDetection('directValueSet', {
                            element: this.tagName,
                            id: this.id,
                            type: this.type,
                            valueLength: String(newValue).length
                        });
                    }
                }
                return originalValueDescriptor.set.call(this, newValue);
            }
        });
        
        // Track user interactions to distinguish from programmatic changes
        document.addEventListener('focus', (e) => {
            if (e.target instanceof HTMLInputElement) {
                e.target._lastUserInteraction = Date.now();
            }
        }, true);
        
        document.addEventListener('input', (e) => {
            if (e.target instanceof HTMLInputElement) {
                e.target._lastUserInteraction = Date.now();
            }
        }, true);
    }

    // ============================================
    // CORE DETECTION RECORDING
    // ============================================
    recordDetection(type, details) {
        this.detectionCounts[type]++;
        
        const logEntry = {
            timestamp: Date.now(),
            type,
            details,
            stackTrace: this.shouldCaptureStack() ? new Error().stack : null
        };
        
        this.detectionLog.push(logEntry);
        
        // Trim log if too large
        if (this.detectionLog.length > this.maxLogSize) {
            this.detectionLog.shift();
        }
        
        // Update confidence score
        this.updateConfidence();
        
        // Log to console (skip high-frequency low-value detections)
        if (this.shouldLogToConsole(type)) {
            console.log(`[AUTOMATION] ${type} detected:`, details);
        }
        
        // Trigger debugger if enabled
        if (this.shouldTriggerDebugger()) {
            debugger;
        }
        
        // Update counter display
        this.updateCounterDisplay();
        
        // Dispatch event
        this.dispatchDetectionEvent(type, logEntry);
        
        // Set global flag
        window.__automationDetected = true;
    }

    // ============================================
    // CONFIDENCE CALCULATION
    // ============================================
    updateConfidence() {
        // Calculate automation confidence based on detection patterns
        let confidence = 0;
        
        // High weight indicators
        if (this.detectionCounts.getBoundingClientRect > 5) confidence += 20;
        if (this.detectionCounts.elementFromPoint > 3) confidence += 15;
        if (this.detectionCounts.programmaticClick > 3) confidence += 15;
        // syntheticEvents detection disabled due to false positives
        
        // Medium weight indicators
        if (this.detectionCounts.scrollIntoView > 2) confidence += 10;
        if (this.detectionCounts.directValueSet > 2) confidence += 10;
        
        // Low weight indicators
        if (this.detectionCounts.getComputedStyle > 5) confidence += 5;
        if (this.detectionCounts.domTreeWalker > 0) confidence += 5;
        if (this.detectionCounts.nodeIterator > 0) confidence += 5;
        
        this.detectionCounts.confidence = Math.min(100, confidence);
    }

    // ============================================
    // COUNTER DISPLAY (Floating Panel)
    // ============================================
    setupCounterDisplay() {
        const style = document.createElement('style');
        style.textContent = `
            #automation-detector-panel {
                position: fixed;
                top: 10px;
                right: 10px;
                background: rgba(0, 0, 0, 0.9);
                color: #00ff00;
                padding: 15px;
                border-radius: 8px;
                font-family: 'Courier New', monospace;
                font-size: 12px;
                z-index: 999999;
                min-width: 280px;
                box-shadow: 0 4px 12px rgba(0, 255, 0, 0.3);
                border: 2px solid #00ff00;
            }
            #automation-detector-panel.hidden {
                display: none;
            }
            #automation-detector-panel h3 {
                margin: 0 0 10px 0;
                font-size: 14px;
                color: #00ff00;
                border-bottom: 1px solid #00ff00;
                padding-bottom: 5px;
            }
            #automation-detector-panel .counter-row {
                display: flex;
                justify-content: space-between;
                padding: 3px 0;
                font-size: 11px;
            }
            #automation-detector-panel .counter-label {
                color: #88ff88;
            }
            #automation-detector-panel .counter-value {
                color: #ffff00;
                font-weight: bold;
            }
            #automation-detector-panel .counter-value.high {
                color: #ff4444;
            }
            #automation-detector-panel .confidence {
                margin-top: 10px;
                padding-top: 10px;
                border-top: 1px solid #00ff00;
                font-size: 13px;
                font-weight: bold;
                text-align: center;
            }
            #automation-detector-panel .controls {
                margin-top: 10px;
                display: flex;
                gap: 5px;
            }
            #automation-detector-panel button {
                flex: 1;
                padding: 5px;
                background: #00ff00;
                color: #000;
                border: none;
                border-radius: 3px;
                cursor: pointer;
                font-size: 10px;
                font-weight: bold;
            }
            #automation-detector-panel button:hover {
                background: #88ff88;
            }
        `;
        document.head.appendChild(style);
        
        const panel = document.createElement('div');
        panel.id = 'automation-detector-panel';
        panel.innerHTML = `
            <h3>🤖 AUTOMATION DETECTOR</h3>
            <div id="automation-counters"></div>
            <div class="confidence">
                Confidence: <span id="automation-confidence">0%</span>
            </div>
            <div class="controls">
                <button id="automation-reset">Reset</button>
                <button id="automation-toggle">Hide</button>
            </div>
        `;
        document.body.appendChild(panel);
        
        // Add event listeners
        document.getElementById('automation-reset').addEventListener('click', () => this.reset());
        document.getElementById('automation-toggle').addEventListener('click', () => {
            panel.classList.toggle('hidden');
        });
        
        this.updateCounterDisplay();
    }

    updateCounterDisplay() {
        const countersDiv = document.getElementById('automation-counters');
        if (!countersDiv) return;
        
        const counterLabels = {
            getBoundingClientRect: 'getBoundingClientRect',
            scrollIntoView: 'scrollIntoView',
            scrollTo: 'scrollTo',
            scrollBy: 'scrollBy',
            elementFromPoint: 'elementFromPoint',
            programmaticClick: 'element.click()',
            directValueSet: 'Direct Value Set',
            domTreeWalker: 'TreeWalker',
            nodeIterator: 'NodeIterator',
            getComputedStyle: 'getComputedStyle'
            // syntheticEvents: 'dispatchEvent' // Disabled - too many FPs
        };
        
        let html = '';
        for (const [key, label] of Object.entries(counterLabels)) {
            const count = this.detectionCounts[key];
            const highClass = count > 5 ? ' high' : '';
            html += `
                <div class="counter-row">
                    <span class="counter-label">${label}:</span>
                    <span class="counter-value${highClass}">${count}</span>
                </div>
            `;
        }
        countersDiv.innerHTML = html;
        
        // Update confidence
        const confidenceSpan = document.getElementById('automation-confidence');
        if (confidenceSpan) {
            const confidence = this.detectionCounts.confidence;
            confidenceSpan.textContent = `${confidence}%`;
            confidenceSpan.style.color = confidence > 70 ? '#ff4444' : confidence > 40 ? '#ffff00' : '#00ff00';
        }
    }

    // ============================================
    // CONFIGURATION
    // ============================================
    shouldShowAlert() {
        return localStorage.getItem('automation-detector-alerts') === 'true';
    }

    shouldTriggerDebugger() {
        return localStorage.getItem('automation-detector-debugger') === 'true';
    }

    shouldCaptureStack() {
        return localStorage.getItem('automation-detector-stack') !== 'false';
    }

    /**
     * Determine if a detection type should be logged to console
     * Filters out high-frequency, low-value detections to reduce noise
     * @param {string} type - The detection type
     * @returns {boolean} True if should log to console
     */
    shouldLogToConsole(type) {
        // Check if console logging is globally disabled
        if (localStorage.getItem('automation-detector-console') === 'false') {
            return false;
        }
        
        // High-frequency detection types that cause excessive noise (deprecated from console logging)
        const deprecatedFromConsole = [
            'getComputedStyle'
        ];
        
        // Skip logging for deprecated types unless explicitly enabled
        if (deprecatedFromConsole.includes(type)) {
            return localStorage.getItem('automation-detector-verbose') === 'true';
        }
        
        return true;
    }

    // ============================================
    // EVENTS
    // ============================================
    dispatchDetectionEvent(type, logEntry) {
        const event = new CustomEvent('automation-detected', {
            detail: {
                type,
                logEntry,
                counts: { ...this.detectionCounts },
                confidence: this.detectionCounts.confidence
            }
        });
        document.dispatchEvent(event);
    }

    // ============================================
    // PUBLIC API
    // ============================================
    getCounts() {
        return { ...this.detectionCounts };
    }

    getLog() {
        return [...this.detectionLog];
    }

    getReport() {
        return {
            counts: this.getCounts(),
            log: this.getLog(),
            confidence: this.detectionCounts.confidence,
            isEnabled: this.isEnabled,
            timestamp: Date.now()
        };
    }

    reset() {
        for (const key in this.detectionCounts) {
            this.detectionCounts[key] = 0;
        }
        this.detectionLog = [];
        this.updateCounterDisplay();
        console.log('� Automation detector reset');
    }

    enable() {
        this.isEnabled = true;
        console.log('✅ Automation detector enabled');
    }

    disable() {
        this.isEnabled = false;
        console.log('⏸️ Automation detector disabled');
    }

    hidePanel() {
        const panel = document.getElementById('automation-detector-panel');
        if (panel) panel.classList.add('hidden');
    }

    showPanel() {
        const panel = document.getElementById('automation-detector-panel');
        if (panel) panel.classList.remove('hidden');
    }

    destroy() {
        // Restore all original methods
        if (this.originals.getBoundingClientRect) {
            Element.prototype.getBoundingClientRect = this.originals.getBoundingClientRect;
        }
        if (this.originals.scrollIntoView) {
            Element.prototype.scrollIntoView = this.originals.scrollIntoView;
        }
        if (this.originals.scrollTo) {
            Window.prototype.scrollTo = this.originals.scrollTo;
            Window.prototype.scrollBy = this.originals.scrollBy;
        }
        if (this.originals.elementFromPoint) {
            Document.prototype.elementFromPoint = this.originals.elementFromPoint;
        }
        if (this.originals.click) {
            HTMLElement.prototype.click = this.originals.click;
        }
        if (this.originals.createTreeWalker) {
            Document.prototype.createTreeWalker = this.originals.createTreeWalker;
            Document.prototype.createNodeIterator = this.originals.createNodeIterator;
        }
        if (this.originals.getComputedStyle) {
            Window.prototype.getComputedStyle = this.originals.getComputedStyle;
        }
        // dispatchEvent hook disabled (not in use)
        
        // Remove panel
        const panel = document.getElementById('automation-detector-panel');
        if (panel) panel.remove();
        
        console.log('♻️ Automation detector destroyed and all hooks removed');
    }
}

// Auto-initialize on load (must run early!)
const detector = new AutomationDetectionSuite();

// Make available globally for debugging
window.automationDetector = detector;

// Legacy compatibility
window.getBoundingClientRectDetector = detector;

export default detector;
