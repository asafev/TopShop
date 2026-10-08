/**
 * Copilot Actions Detector
 * ========================
 * 
 * Detects Microsoft Edge Copilot Actions based on behavioral fingerprints.
 * 
 * Based on reverse engineering analysis of:
 * - edge_copilot_tools.mojom-webui.js
 * - chunk-NR4VEW4J.js (Vision Service)
 * - context.mojom-webui.js
 * 
 * Key Detection Vectors:
 * 1. No mouse movement before clicks (IPC-triggered actions)
 * 2. Perfect mouse paths without human jitter
 * 3. Exact center element clicks
 * 4. Focus changes without prior input
 * 5. Uniform scroll patterns
 * 6. Regular timing intervals (IPC latency signatures)
 * 
 * @author Security Research Analysis
 * @version 1.0.0
 */

(function(window) {
    'use strict';
    
    // ========================================================================
    // CONFIGURATION
    // ========================================================================
    
    const CONFIG = {
        // Detection thresholds
        thresholds: {
            perfectPathDeviation: 2,        // Max px deviation for "perfect" path
            centerClickDistance: 3,         // Max px from center to count as center click
            focusJumpWindow: 500,           // Ms window to check for prior input
            minMovesBeforeClick: 3,         // Minimum mouse moves expected before click
            scrollVarianceThreshold: 0.15,  // Max CV for uniform scroll detection
            ipcTimingSignature: {
                min: 40,                    // Minimum expected IPC delay (ms)
                max: 120                    // Maximum expected IPC delay (ms)
            },
            // TYPING DETECTION THRESHOLDS
            typing: {
                maxHumanCPS: 12,            // Max human chars per second (~70 WPM good typist)
                suspiciousCPS: 15,          // Clearly superhuman typing speed (lowered based on sample)
                roboticCPS: 30,             // Definitely automated (was 50, Copilot showed 16 CPS)
                minKeyInterval: 10,         // Minimum ms between keystrokes (human ~50-150ms)
                maxKeyIntervalVariance: 0.3,// Human has high variance, bot has low
                burstThreshold: 10,         // Chars in rapid succession = burst
                burstWindowMs: 100,         // Window to detect burst typing
                keyUpDelayMin: 20,          // Minimum expected keyup delay (human ~50-100ms)
                inputWithoutKeyRatio: 0.3   // Suspicious if >30% input events lack keydown
            }
        },
        
        // Scoring weights (rebalanced to include typing)
        weights: {
            noMovementClick: 0.20,
            centerClickBias: 0.15,
            perfectPath: 0.15,
            focusJump: 0.10,
            scrollUniformity: 0.05,
            timingRegularity: 0.05,
            // NEW: Typing-related weights
            typingSpeed: 0.15,              // Superhuman typing speed
            typingUniformity: 0.10,         // Uniform inter-key timing
            inputInjection: 0.05            // Input events without keydown
        },
        
        // Buffer sizes
        buffers: {
            mouseTrail: 100,
            clicks: 50,
            scrolls: 50,
            focusEvents: 30,
            timingIntervals: 50,
            keyEvents: 200,                 // Track last 200 key events
            inputEvents: 100,               // Track input events
            typingBursts: 20                // Track typing bursts
        }
    };
    
    // ========================================================================
    // UTILITIES
    // ========================================================================
    
    const now = () => performance.now();
    
    const mean = (arr) => {
        if (!arr.length) return 0;
        return arr.reduce((sum, val) => sum + val, 0) / arr.length;
    };
    
    const variance = (arr) => {
        if (arr.length < 2) return 0;
        const avg = mean(arr);
        return arr.reduce((sum, val) => sum + Math.pow(val - avg, 2), 0) / arr.length;
    };
    
    const coefficientOfVariation = (arr) => {
        const avg = mean(arr);
        if (avg === 0) return 0;
        return Math.sqrt(variance(arr)) / avg;
    };
    
    const distance = (p1, p2) => {
        return Math.sqrt(Math.pow(p2.x - p1.x, 2) + Math.pow(p2.y - p1.y, 2));
    };
    
    const clamp = (val, min, max) => Math.max(min, Math.min(max, val));
    
    // ========================================================================
    // COPILOT ACTIONS DETECTOR CLASS
    // ========================================================================
    
    class CopilotActionsDetector {
        constructor(options = {}) {
            this.config = { ...CONFIG, ...options };
            
            this.state = {
                mouseTrail: [],
                clicks: [],
                scrolls: [],
                focusEvents: [],
                timingIntervals: [],
                lastPointerTime: 0,
                lastKeyTime: 0,
                lastClickTime: 0,
                startTime: now(),
                eventCount: 0,
                
                // NEW: Typing analysis state
                keyEvents: [],              // All keydown/keyup events
                keyDownTimes: new Map(),    // Track keydown -> keyup pairs
                inputEvents: [],            // Input events (value changes)
                typingBursts: [],           // Detected rapid typing bursts
                lastKeyDownTime: 0,
                lastKeyUpTime: 0,
                lastInputTime: 0,
                totalCharsTyped: 0,
                typingSessionStart: 0,
                inputsWithoutKeydown: 0,
                totalInputEvents: 0
            };
            
            this.listeners = [];
            this.isRunning = false;
            
            // Bind methods
            this.onPointerMove = this.onPointerMove.bind(this);
            this.onClick = this.onClick.bind(this);
            this.onWheel = this.onWheel.bind(this);
            this.onFocusIn = this.onFocusIn.bind(this);
            this.onKeyDown = this.onKeyDown.bind(this);
            this.onKeyUp = this.onKeyUp.bind(this);
            this.onInput = this.onInput.bind(this);
            this.onBeforeInput = this.onBeforeInput.bind(this);
        }
        
        // --------------------------------------------------------------------
        // LIFECYCLE
        // --------------------------------------------------------------------
        
        start() {
            if (this.isRunning) return;
            
            const events = [
                ['pointermove', this.onPointerMove],
                ['click', this.onClick],
                ['wheel', this.onWheel],
                ['focusin', this.onFocusIn],
                ['keydown', this.onKeyDown],
                ['keyup', this.onKeyUp],
                ['input', this.onInput],
                ['beforeinput', this.onBeforeInput]
            ];
            
            events.forEach(([event, handler]) => {
                document.addEventListener(event, handler, { passive: true, capture: true });
                this.listeners.push({ event, handler });
            });
            
            this.isRunning = true;
            console.log('🔍 Copilot Actions Detector: Started (with typing analysis)');
        }
        
        stop() {
            if (!this.isRunning) return;
            
            this.listeners.forEach(({ event, handler }) => {
                document.removeEventListener(event, handler, { capture: true });
            });
            this.listeners = [];
            this.isRunning = false;
            console.log('🛑 Copilot Actions Detector: Stopped');
        }
        
        reset() {
            this.state = {
                mouseTrail: [],
                clicks: [],
                scrolls: [],
                focusEvents: [],
                timingIntervals: [],
                lastPointerTime: 0,
                lastKeyTime: 0,
                lastClickTime: 0,
                startTime: now(),
                eventCount: 0,
                
                // Typing analysis state
                keyEvents: [],
                keyDownTimes: new Map(),
                inputEvents: [],
                typingBursts: [],
                lastKeyDownTime: 0,
                lastKeyUpTime: 0,
                lastInputTime: 0,
                totalCharsTyped: 0,
                typingSessionStart: 0,
                inputsWithoutKeydown: 0,
                totalInputEvents: 0,
                lastPasteTime: 0
            };
        }
        
        // --------------------------------------------------------------------
        // EVENT HANDLERS
        // --------------------------------------------------------------------
        
        onPointerMove(e) {
            const t = now();
            this.state.lastPointerTime = t;
            this.state.eventCount++;
            
            this.state.mouseTrail.push({
                t,
                x: e.clientX,
                y: e.clientY
            });
            
            // Trim buffer
            while (this.state.mouseTrail.length > this.config.buffers.mouseTrail) {
                this.state.mouseTrail.shift();
            }
        }
        
        onClick(e) {
            const t = now();
            this.state.eventCount++;
            
            // Get element bounds
            const rect = e.target.getBoundingClientRect();
            const centerX = rect.left + rect.width / 2;
            const centerY = rect.top + rect.height / 2;
            
            // Get recent mouse trail (last 500ms)
            const recentTrail = this.state.mouseTrail.filter(p => t - p.t < 500);
            
            // Calculate click data
            const clickData = {
                t,
                x: e.clientX,
                y: e.clientY,
                centerX,
                centerY,
                distFromCenter: distance(
                    { x: e.clientX, y: e.clientY },
                    { x: centerX, y: centerY }
                ),
                hadPriorMovement: recentTrail.length >= this.config.thresholds.minMovesBeforeClick,
                trailDeviation: this.calculatePathDeviation(recentTrail, e.clientX, e.clientY),
                isTrusted: e.isTrusted,
                timeSinceLastClick: t - this.state.lastClickTime,
                timeSinceLastMove: t - this.state.lastPointerTime
            };
            
            this.state.clicks.push(clickData);
            
            // Track timing intervals
            if (this.state.lastClickTime > 0) {
                this.state.timingIntervals.push(clickData.timeSinceLastClick);
            }
            
            this.state.lastClickTime = t;
            
            // Trim buffers
            while (this.state.clicks.length > this.config.buffers.clicks) {
                this.state.clicks.shift();
            }
            while (this.state.timingIntervals.length > this.config.buffers.timingIntervals) {
                this.state.timingIntervals.shift();
            }
        }
        
        onWheel(e) {
            const t = now();
            this.state.eventCount++;
            
            this.state.scrolls.push({
                t,
                deltaY: e.deltaY,
                deltaX: e.deltaX
            });
            
            while (this.state.scrolls.length > this.config.buffers.scrolls) {
                this.state.scrolls.shift();
            }
        }
        
        onFocusIn(e) {
            const t = now();
            this.state.eventCount++;
            
            const timeSincePointer = t - this.state.lastPointerTime;
            const timeSinceKey = t - this.state.lastKeyTime;
            const threshold = this.config.thresholds.focusJumpWindow;
            
            this.state.focusEvents.push({
                t,
                hadPriorInput: timeSincePointer < threshold || timeSinceKey < threshold,
                element: e.target.tagName
            });
            
            while (this.state.focusEvents.length > this.config.buffers.focusEvents) {
                this.state.focusEvents.shift();
            }
        }
        
        onKeyDown(e) {
            const t = now();
            this.state.lastKeyTime = t;
            this.state.eventCount++;
            
            // Calculate inter-key interval
            const interval = this.state.lastKeyDownTime > 0 ? t - this.state.lastKeyDownTime : 0;
            
            // Start typing session if new
            if (this.state.typingSessionStart === 0 || t - this.state.lastKeyDownTime > 2000) {
                this.state.typingSessionStart = t;
            }
            
            const keyEvent = {
                t,
                type: 'keydown',
                key: e.key,
                code: e.code,
                interval,
                isTrusted: e.isTrusted,
                repeat: e.repeat
            };
            
            this.state.keyEvents.push(keyEvent);
            this.state.keyDownTimes.set(e.code, t);
            this.state.lastKeyDownTime = t;
            
            // Detect Ctrl+V / Cmd+V paste to avoid false positives
            if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'v') {
                this.state.lastPasteTime = t;
            }
            
            // Detect burst typing (many keys in short window)
            this.detectTypingBurst(t);
            
            // Trim buffer
            while (this.state.keyEvents.length > this.config.buffers.keyEvents) {
                this.state.keyEvents.shift();
            }
        }
        
        onKeyUp(e) {
            const t = now();
            this.state.eventCount++;
            
            const keyDownTime = this.state.keyDownTimes.get(e.code);
            const holdDuration = keyDownTime ? t - keyDownTime : 0;
            
            const keyEvent = {
                t,
                type: 'keyup',
                key: e.key,
                code: e.code,
                holdDuration,
                isTrusted: e.isTrusted
            };
            
            this.state.keyEvents.push(keyEvent);
            this.state.keyDownTimes.delete(e.code);
            this.state.lastKeyUpTime = t;
            
            // Trim buffer
            while (this.state.keyEvents.length > this.config.buffers.keyEvents) {
                this.state.keyEvents.shift();
            }
        }
        
        onInput(e) {
            const t = now();
            this.state.eventCount++;
            this.state.totalInputEvents++;
            
            // Check if this input was preceded by a keydown
            const timeSinceKeydown = t - this.state.lastKeyDownTime;
            const hadRecentKeydown = timeSinceKeydown < 100; // 100ms window
            
            if (!hadRecentKeydown) {
                this.state.inputsWithoutKeydown++;
            }
            
            // Track input data length for typing speed analysis
            const dataLength = e.data ? e.data.length : 0;
            this.state.totalCharsTyped += dataLength;
            
            const inputEvent = {
                t,
                type: e.inputType,
                dataLength,
                hadRecentKeydown,
                timeSinceKeydown,
                isTrusted: e.isTrusted,
                // Multi-char input is suspicious (paste-like behavior from typeOnTab)
                isMultiChar: dataLength > 1
            };
            
            this.state.inputEvents.push(inputEvent);
            this.state.lastInputTime = t;
            
            // Trim buffer
            while (this.state.inputEvents.length > this.config.buffers.inputEvents) {
                this.state.inputEvents.shift();
            }
        }
        
        onBeforeInput(e) {
            // beforeinput gives us the data BEFORE it's inserted
            // Copilot's typeOnTab may insert large chunks at once
            const t = now();
            
            if (e.data && e.data.length > 5) {
                // Large text insertion - check if it's paste or injection
                const timeSinceLastKey = t - this.state.lastKeyDownTime;
                const timeSincePaste = t - this.state.lastPasteTime;
                
                // Check if this is a legitimate paste (Ctrl+V within last 200ms)
                const isPaste = timeSincePaste < 200 && this.state.lastPasteTime > 0;
                
                if (timeSinceLastKey > 50 || this.state.lastKeyDownTime === 0) {
                    // Large insertion without recent keydown
                    this.state.inputEvents.push({
                        t,
                        type: isPaste ? 'pasteInsertion' : 'suspiciousInsertion',
                        dataLength: e.data.length,
                        data: e.data.substring(0, 50), // First 50 chars for analysis
                        timeSinceLastKey,
                        timeSincePaste,
                        isPaste,
                        isTrusted: e.isTrusted
                    });
                }
            }
        }
        
        detectTypingBurst(currentTime) {
            const burstWindow = this.config.thresholds.typing.burstWindowMs;
            const burstThreshold = this.config.thresholds.typing.burstThreshold;
            
            // Count keydowns in the last burstWindow ms
            const recentKeys = this.state.keyEvents.filter(
                k => k.type === 'keydown' && currentTime - k.t < burstWindow
            );
            
            if (recentKeys.length >= burstThreshold) {
                const burst = {
                    t: currentTime,
                    count: recentKeys.length,
                    windowMs: burstWindow,
                    charsPerSecond: (recentKeys.length / burstWindow) * 1000
                };
                
                this.state.typingBursts.push(burst);
                
                while (this.state.typingBursts.length > this.config.buffers.typingBursts) {
                    this.state.typingBursts.shift();
                }
            }
        }
        
        // --------------------------------------------------------------------
        // ANALYSIS METHODS
        // --------------------------------------------------------------------
        
        /**
         * Calculate deviation from a straight line path
         */
        calculatePathDeviation(trail, endX, endY) {
            if (trail.length < 2) return 10; // Default to human-like
            
            const start = trail[0];
            const dx = endX - start.x;
            const dy = endY - start.y;
            const lineLength = Math.sqrt(dx * dx + dy * dy);
            
            if (lineLength < 5) return 10; // Too short to analyze
            
            let totalDeviation = 0;
            
            for (const point of trail) {
                // Calculate perpendicular distance to the line
                const t = clamp(
                    ((point.x - start.x) * dx + (point.y - start.y) * dy) / (lineLength * lineLength),
                    0, 1
                );
                const projX = start.x + t * dx;
                const projY = start.y + t * dy;
                const dist = distance(point, { x: projX, y: projY });
                totalDeviation += dist;
            }
            
            return totalDeviation / trail.length;
        }
        
        /**
         * Compute all detection metrics
         */
        computeMetrics() {
            const thresholds = this.config.thresholds;
            
            return {
                // 1. Clicks without prior movement
                noMovementClickRatio: this.computeNoMovementRatio(),
                
                // 2. Center click ratio
                centerClickRatio: this.computeCenterClickRatio(),
                
                // 3. Path deviation (jitter)
                avgPathDeviation: this.computeAvgPathDeviation(),
                
                // 4. Focus jump ratio
                focusJumpRatio: this.computeFocusJumpRatio(),
                
                // 5. Scroll uniformity
                scrollUniformity: this.computeScrollUniformity(),
                
                // 6. Click timing regularity
                clickTimingRegularity: this.computeClickTimingRegularity(),
                
                // 7. IPC timing signature detection
                ipcTimingSignature: this.detectIPCTimingSignature(),
                
                // NEW: TYPING METRICS
                // 8. Typing speed (chars per second)
                typingSpeed: this.computeTypingSpeed(),
                
                // 9. Typing uniformity (low variance = robotic)
                typingUniformity: this.computeTypingUniformity(),
                
                // 10. Key hold duration analysis
                avgKeyHoldDuration: this.computeAvgKeyHoldDuration(),
                
                // 11. Input injection detection (input without keydown)
                inputInjectionRatio: this.computeInputInjectionRatio(),
                
                // 12. Burst typing detection
                burstTypingScore: this.computeBurstTypingScore(),
                
                // 13. Multi-char input ratio (paste-like behavior)
                multiCharInputRatio: this.computeMultiCharInputRatio(),
                
                // 14. Suspicious insertion count (excludes paste)
                suspiciousInsertions: this.countSuspiciousInsertions(),
                
                // 15. Paste insertions (Ctrl+V - not suspicious)
                pasteInsertions: this.countPasteInsertions(),
                
                // 16. Keydown/Keyup ratio (should be ~1.0 for humans)
                keyEventRatio: this.computeKeyEventRatio(),
                
                // 17. Effective typing analysis (detects injection)
                effectiveTyping: this.computeEffectiveTypingSpeed(),
                
                // Raw counts
                totalEvents: this.state.eventCount,
                totalKeyEvents: this.state.keyEvents.length,
                totalCharsTyped: this.state.totalCharsTyped,
                typingBurstCount: this.state.typingBursts.length,
                
                // 18. Session duration
                sessionDurationMs: now() - this.state.startTime
            };
        }
        
        computeNoMovementRatio() {
            if (this.state.clicks.length === 0) return 0;
            const noMove = this.state.clicks.filter(c => !c.hadPriorMovement).length;
            return noMove / this.state.clicks.length;
        }
        
        computeCenterClickRatio() {
            if (this.state.clicks.length === 0) return 0;
            const threshold = this.config.thresholds.centerClickDistance;
            const center = this.state.clicks.filter(c => c.distFromCenter < threshold).length;
            return center / this.state.clicks.length;
        }
        
        computeAvgPathDeviation() {
            if (this.state.clicks.length === 0) return 10;
            return mean(this.state.clicks.map(c => c.trailDeviation));
        }
        
        computeFocusJumpRatio() {
            if (this.state.focusEvents.length === 0) return 0;
            const jumps = this.state.focusEvents.filter(f => !f.hadPriorInput).length;
            return jumps / this.state.focusEvents.length;
        }
        
        computeScrollUniformity() {
            if (this.state.scrolls.length < 3) return 0;
            
            const velocities = [];
            for (let i = 1; i < this.state.scrolls.length; i++) {
                const dt = this.state.scrolls[i].t - this.state.scrolls[i - 1].t;
                if (dt > 0) {
                    velocities.push(Math.abs(this.state.scrolls[i].deltaY) / dt);
                }
            }
            
            if (velocities.length === 0) return 0;
            
            const cv = coefficientOfVariation(velocities);
            
            // High uniformity (low CV) = suspicious
            // Return 0-1 where 1 = highly uniform (suspicious)
            return 1 - clamp(cv, 0, 1);
        }
        
        computeClickTimingRegularity() {
            if (this.state.timingIntervals.length < 3) return 0;
            
            const cv = coefficientOfVariation(this.state.timingIntervals);
            
            // High regularity (low CV) = suspicious
            return 1 - clamp(cv, 0, 1);
        }
        
        detectIPCTimingSignature() {
            if (this.state.timingIntervals.length < 3) return 0;
            
            const { min, max } = this.config.thresholds.ipcTimingSignature;
            const avg = mean(this.state.timingIntervals);
            const v = variance(this.state.timingIntervals);
            
            // IPC timing creates clustered intervals around 50-100ms
            if (avg >= min && avg <= max && v < 500) {
                return 1;
            }
            
            return 0;
        }
        
        // ====================================================================
        // TYPING ANALYSIS METHODS
        // ====================================================================
        
        /**
         * Compute typing speed in characters per second
         * Copilot's typeOnTab injects text extremely fast
         * 
         * NOTE: This measures KEYDOWN-based CPS. For input injection detection,
         * see computeEffectiveTypingSpeed() which considers chars typed vs keydowns.
         */
        computeTypingSpeed() {
            const keydowns = this.state.keyEvents.filter(k => k.type === 'keydown' && !k.repeat);
            
            if (keydowns.length < 2) return { cps: 0, verdict: 'INSUFFICIENT_DATA' };
            
            // Calculate time span of typing
            const firstKey = keydowns[0].t;
            const lastKey = keydowns[keydowns.length - 1].t;
            const durationSec = (lastKey - firstKey) / 1000;
            
            if (durationSec < 0.1) return { cps: 0, verdict: 'INSUFFICIENT_DATA' };
            
            const cps = keydowns.length / durationSec;
            const thresholds = this.config.thresholds.typing;
            
            let verdict;
            if (cps >= thresholds.roboticCPS) {
                verdict = 'ROBOTIC';
            } else if (cps >= thresholds.suspiciousCPS) {
                verdict = 'SUSPICIOUS';
            } else if (cps >= thresholds.maxHumanCPS) {
                verdict = 'FAST';
            } else {
                verdict = 'HUMAN';
            }
            
            return { cps, verdict };
        }
        
        /**
         * Compute effective typing analysis - detects input injection
         * When chars typed >> keydowns, it indicates text injection (typeOnTab)
         * 
         * This is a KEY detection signal for Copilot Actions!
         */
        computeEffectiveTypingSpeed() {
            const keydowns = this.state.keyEvents.filter(k => k.type === 'keydown' && !k.repeat).length;
            const charsTyped = this.state.totalCharsTyped;
            const inputs = this.state.inputEvents.filter(i => 
                i.type !== 'suspiciousInsertion' && i.type !== 'pasteInsertion'
            );
            
            // Calculate chars per keydown ratio
            // Human: ~1.0 (one char per keydown)
            // Copilot injection: >>1.0 (many chars, few keydowns)
            const charsPerKeydown = keydowns > 0 ? charsTyped / keydowns : 
                                    charsTyped > 0 ? Infinity : 0;
            
            // Calculate multi-char input ratio
            const multiCharInputs = inputs.filter(i => i.dataLength > 1).length;
            const multiCharRatio = inputs.length > 0 ? multiCharInputs / inputs.length : 0;
            
            let verdict;
            if (charsPerKeydown === Infinity || charsPerKeydown > 10) {
                verdict = 'INJECTION_DETECTED';
            } else if (charsPerKeydown > 3) {
                verdict = 'SUSPICIOUS_RATIO';
            } else if (multiCharRatio > 0.3) {
                verdict = 'MULTI_CHAR_INJECTION';
            } else {
                verdict = 'NORMAL';
            }
            
            return {
                charsTyped,
                keydowns,
                charsPerKeydown: charsPerKeydown === Infinity ? '∞' : charsPerKeydown.toFixed(1),
                multiCharRatio: (multiCharRatio * 100).toFixed(0) + '%',
                verdict
            };
        }
        
        /**
         * Compute typing uniformity (how regular are the inter-key intervals)
         * Humans have high variance, bots have low variance
         */
        computeTypingUniformity() {
            const keydowns = this.state.keyEvents.filter(k => k.type === 'keydown' && k.interval > 0);
            
            if (keydowns.length < 3) return 0;
            
            const intervals = keydowns.map(k => k.interval);
            const cv = coefficientOfVariation(intervals);
            
            // Human typing: CV > 0.3-0.5 (high variance)
            // Bot typing: CV < 0.2 (low variance, uniform timing)
            // Return 0-1 where 1 = highly uniform (suspicious)
            return 1 - clamp(cv / 0.5, 0, 1);
        }
        
        /**
         * Compute average key hold duration
         * Synthetic events often have very short or uniform hold times
         */
        computeAvgKeyHoldDuration() {
            const keyups = this.state.keyEvents.filter(k => k.type === 'keyup' && k.holdDuration > 0);
            
            if (keyups.length === 0) return { avg: 0, variance: 0, verdict: 'NO_KEYUPS' };
            
            const durations = keyups.map(k => k.holdDuration);
            const avg = mean(durations);
            const v = variance(durations);
            const cv = Math.sqrt(v) / (avg || 1);
            
            // Human: avg 70-150ms, high variance
            // Bot: avg <50ms or very uniform
            let verdict;
            if (avg < 20) {
                verdict = 'TOO_SHORT';
            } else if (cv < 0.2 && keyups.length > 5) {
                verdict = 'TOO_UNIFORM';
            } else {
                verdict = 'NORMAL';
            }
            
            return { avg, variance: v, cv, verdict };
        }
        
        /**
         * Detect input events that occurred without a preceding keydown
         * Copilot's typeOnTab may inject values directly
         */
        computeInputInjectionRatio() {
            if (this.state.totalInputEvents === 0) return 0;
            return this.state.inputsWithoutKeydown / this.state.totalInputEvents;
        }
        
        /**
         * Detect burst typing patterns (many chars in very short time)
         */
        computeBurstTypingScore() {
            if (this.state.typingBursts.length === 0) return 0;
            
            const thresholds = this.config.thresholds.typing;
            const suspiciousBursts = this.state.typingBursts.filter(
                b => b.charsPerSecond > thresholds.suspiciousCPS
            );
            
            return suspiciousBursts.length / this.state.typingBursts.length;
        }
        
        /**
         * Compute ratio of multi-character input events
         * Normal typing: 1 char per input event
         * typeOnTab injection: multiple chars at once
         */
        computeMultiCharInputRatio() {
            const inputs = this.state.inputEvents.filter(i => i.type !== 'suspiciousInsertion');
            
            if (inputs.length === 0) return 0;
            
            const multiChar = inputs.filter(i => i.isMultiChar).length;
            return multiChar / inputs.length;
        }
        
        /**
         * Count suspicious text insertions (large chunks without keydown)
         * Excludes legitimate paste operations (Ctrl+V)
         */
        countSuspiciousInsertions() {
            return this.state.inputEvents.filter(i => i.type === 'suspiciousInsertion').length;
        }
        
        /**
         * Count paste insertions (legitimate Ctrl+V)
         */
        countPasteInsertions() {
            return this.state.inputEvents.filter(i => i.type === 'pasteInsertion').length;
        }
        
        /**
         * Compute keydown/keyup ratio
         * Should be ~1.0 for normal typing
         * Synthetic events might have mismatched counts
         */
        computeKeyEventRatio() {
            const keydowns = this.state.keyEvents.filter(k => k.type === 'keydown').length;
            const keyups = this.state.keyEvents.filter(k => k.type === 'keyup').length;
            
            if (keydowns === 0) return { ratio: 0, verdict: 'NO_KEYDOWNS' };
            
            const ratio = keyups / keydowns;
            
            let verdict;
            if (ratio === 0) {
                verdict = 'NO_KEYUPS'; // Suspicious: keydowns without keyups
            } else if (ratio <= 0.5) {
                // BUG FIX: was < 0.5, but Copilot had exactly 0.5 ratio
                verdict = 'MISSING_KEYUPS';
            } else if (ratio > 1.5) {
                verdict = 'EXTRA_KEYUPS';
            } else {
                verdict = 'NORMAL';
            }
            
            return { ratio, keydowns, keyups, verdict };
        }
        
        // --------------------------------------------------------------------
        // SCORING
        // --------------------------------------------------------------------
        
        computeCopilotLikelihood() {
            const metrics = this.computeMetrics();
            const w = this.config.weights;
            const t = this.config.thresholds;
            
            // Calculate weighted score
            let score = 0;
            
            // 1. No movement before clicks
            score += w.noMovementClick * metrics.noMovementClickRatio;
            
            // 2. Center click bias
            score += w.centerClickBias * metrics.centerClickRatio;
            
            // 3. Perfect path (no jitter)
            if (metrics.avgPathDeviation < t.perfectPathDeviation) {
                score += w.perfectPath;
            }
            
            // 4. Focus jumps
            score += w.focusJump * metrics.focusJumpRatio;
            
            // 5. Scroll uniformity
            score += w.scrollUniformity * metrics.scrollUniformity;
            
            // 6. Timing regularity
            score += w.timingRegularity * metrics.clickTimingRegularity;
            
            // Bonus for IPC timing signature
            if (metrics.ipcTimingSignature > 0) {
                score += 0.05;
            }
            
            // ================================================================
            // NEW: TYPING-BASED SCORING
            // ================================================================
            
            // 7. Typing speed analysis
            if (metrics.typingSpeed.verdict === 'ROBOTIC') {
                score += w.typingSpeed;
            } else if (metrics.typingSpeed.verdict === 'SUSPICIOUS') {
                score += w.typingSpeed * 0.7;
            } else if (metrics.typingSpeed.verdict === 'FAST') {
                score += w.typingSpeed * 0.3;
            }
            
            // 7b. Effective typing analysis (detects injection even with low keydown CPS)
            if (metrics.effectiveTyping.verdict === 'INJECTION_DETECTED') {
                score += 0.15; // Strong signal
            } else if (metrics.effectiveTyping.verdict === 'SUSPICIOUS_RATIO') {
                score += 0.10;
            } else if (metrics.effectiveTyping.verdict === 'MULTI_CHAR_INJECTION') {
                score += 0.08;
            }
            
            // 8. Typing uniformity (robotic typing has low variance)
            score += w.typingUniformity * metrics.typingUniformity;
            
            // 9. Input injection (input events without keydown)
            if (metrics.inputInjectionRatio > t.typing.inputWithoutKeyRatio) {
                score += w.inputInjection;
            }
            
            // 10. Suspicious insertions (large text blocks injected)
            if (metrics.suspiciousInsertions > 0) {
                score += 0.1 * Math.min(metrics.suspiciousInsertions, 3);
            }
            
            // 11. Multi-char input ratio (paste-like injections)
            if (metrics.multiCharInputRatio > 0.2) {
                score += 0.05;
            }
            
            // 12. Key event ratio anomalies
            if (metrics.keyEventRatio.verdict === 'NO_KEYUPS' || 
                metrics.keyEventRatio.verdict === 'MISSING_KEYUPS') {
                score += 0.1;
            }
            
            // 13. Burst typing bonus
            score += 0.05 * metrics.burstTypingScore;
            
            // 14. Key hold duration anomalies
            if (metrics.avgKeyHoldDuration.verdict === 'TOO_SHORT' ||
                metrics.avgKeyHoldDuration.verdict === 'TOO_UNIFORM') {
                score += 0.05;
            }
            
            // Normalize to 0-100
            const finalScore = clamp(score * 100, 0, 100);
            
            // Determine verdict
            let verdict;
            if (finalScore >= 60) {
                verdict = 'LIKELY_COPILOT';
            } else if (finalScore >= 35) {
                verdict = 'SUSPICIOUS';
            } else if (finalScore >= 15) {
                verdict = 'UNCERTAIN';
            } else {
                verdict = 'LIKELY_HUMAN';
            }
            
            return {
                score: finalScore,
                verdict,
                confidence: this.calculateConfidence(metrics),
                metrics,
                timestamp: Date.now()
            };
        }
        
        calculateConfidence(metrics) {
            // Confidence based on sample size
            const sampleScore = clamp(
                (this.state.clicks.length / 10) +
                (this.state.mouseTrail.length / 50) +
                (this.state.scrolls.length / 20) +
                (this.state.keyEvents.length / 30) +
                (this.state.inputEvents.length / 20),
                0, 1
            );
            
            // Minimum events needed for reliable detection
            const hasTypingData = this.state.keyEvents.length > 5 || this.state.inputEvents.length > 3;
            
            if (this.state.eventCount < 10 && !hasTypingData) {
                return 'LOW';
            } else if (this.state.eventCount < 50 && !hasTypingData) {
                return 'MEDIUM';
            } else {
                return 'HIGH';
            }
        }
        
        // --------------------------------------------------------------------
        // PUBLIC API
        // --------------------------------------------------------------------
        
        /**
         * Get current detection report
         */
        getReport() {
            return this.computeCopilotLikelihood();
        }
        
        /**
         * Get detailed typing analysis report
         */
        getTypingReport() {
            const keydowns = this.state.keyEvents.filter(k => k.type === 'keydown');
            const keyups = this.state.keyEvents.filter(k => k.type === 'keyup');
            
            return {
                totalKeydowns: keydowns.length,
                totalKeyups: keyups.length,
                totalCharsTyped: this.state.totalCharsTyped,
                inputEvents: this.state.inputEvents.length,
                inputsWithoutKeydown: this.state.inputsWithoutKeydown,
                typingBursts: this.state.typingBursts,
                typingSpeed: this.computeTypingSpeed(),
                effectiveTyping: this.computeEffectiveTypingSpeed(),
                typingUniformity: this.computeTypingUniformity(),
                keyHoldDuration: this.computeAvgKeyHoldDuration(),
                keyEventRatio: this.computeKeyEventRatio(),
                suspiciousInsertions: this.state.inputEvents.filter(
                    i => i.type === 'suspiciousInsertion'
                ),
                pasteInsertions: this.state.inputEvents.filter(
                    i => i.type === 'pasteInsertion'
                )
            };
        }
        
        /**
         * Get raw metrics without scoring
         */
        getMetrics() {
            return this.computeMetrics();
        }
        
        /**
         * Get current state (for debugging)
         */
        getState() {
            return { ...this.state };
        }
    }
    
    // ========================================================================
    // QUICK DETECTION (Lightweight)
    // ========================================================================
    
    function createQuickDetector() {
        const data = {
            moves: [],
            clicks: [],
            focusJumps: 0,
            lastMove: 0,
            lastKey: 0,
            // NEW: Typing tracking
            keydowns: [],
            keyups: [],
            inputs: [],
            lastKeydownTime: 0,
            charsTyped: 0
        };
        
        document.addEventListener('pointermove', (e) => {
            data.lastMove = performance.now();
            data.moves.push({ t: data.lastMove, x: e.clientX, y: e.clientY });
            if (data.moves.length > 50) data.moves.shift();
        }, { passive: true });
        
        document.addEventListener('click', (e) => {
            const now = performance.now();
            const recentMoves = data.moves.filter(m => now - m.t < 500);
            const rect = e.target.getBoundingClientRect();
            const centerDist = Math.hypot(
                e.clientX - (rect.left + rect.width / 2),
                e.clientY - (rect.top + rect.height / 2)
            );
            
            data.clicks.push({
                noMovement: recentMoves.length < 3,
                centerClick: centerDist < 3,
                t: now
            });
            
            if (data.clicks.length > 20) data.clicks.shift();
        }, { passive: true });
        
        document.addEventListener('focusin', () => {
            const now = performance.now();
            if (now - data.lastMove > 500 && now - data.lastKey > 500) {
                data.focusJumps++;
            }
        }, { passive: true });
        
        document.addEventListener('keydown', (e) => {
            const now = performance.now();
            data.lastKey = now;
            const interval = data.lastKeydownTime > 0 ? now - data.lastKeydownTime : 0;
            data.keydowns.push({ t: now, interval, key: e.key });
            data.lastKeydownTime = now;
            if (data.keydowns.length > 50) data.keydowns.shift();
        }, { passive: true });
        
        document.addEventListener('keyup', () => {
            data.keyups.push({ t: performance.now() });
            if (data.keyups.length > 50) data.keyups.shift();
        }, { passive: true });
        
        document.addEventListener('input', (e) => {
            const now = performance.now();
            const timeSinceKey = now - data.lastKeydownTime;
            const len = e.data ? e.data.length : 0;
            data.charsTyped += len;
            data.inputs.push({
                t: now,
                hadKeydown: timeSinceKey < 100,
                dataLength: len
            });
            if (data.inputs.length > 50) data.inputs.shift();
        }, { passive: true });
        
        return {
            getScore: () => {
                if (data.clicks.length === 0 && data.keydowns.length === 0) return 0;
                
                let score = 0;
                let factors = 0;
                
                // Click-based scoring
                if (data.clicks.length > 0) {
                    const noMoveRatio = data.clicks.filter(c => c.noMovement).length / data.clicks.length;
                    const centerRatio = data.clicks.filter(c => c.centerClick).length / data.clicks.length;
                    score += noMoveRatio * 0.2 + centerRatio * 0.2;
                    factors += 0.4;
                }
                
                // Focus jump scoring
                if (data.clicks.length > 0) {
                    const focusRatio = data.focusJumps / Math.max(data.clicks.length, 1);
                    score += Math.min(focusRatio, 1) * 0.1;
                    factors += 0.1;
                }
                
                // TYPING-BASED SCORING
                if (data.keydowns.length >= 5) {
                    // Typing speed (chars per second)
                    const first = data.keydowns[0].t;
                    const last = data.keydowns[data.keydowns.length - 1].t;
                    const durationSec = (last - first) / 1000;
                    if (durationSec > 0.1) {
                        const cps = data.keydowns.length / durationSec;
                        // Superhuman typing
                        if (cps > 50) score += 0.25;
                        else if (cps > 25) score += 0.15;
                        else if (cps > 15) score += 0.05;
                        factors += 0.25;
                    }
                    
                    // Typing uniformity
                    const intervals = data.keydowns.filter(k => k.interval > 0).map(k => k.interval);
                    if (intervals.length >= 3) {
                        const avg = intervals.reduce((a, b) => a + b, 0) / intervals.length;
                        const variance = intervals.reduce((s, v) => s + Math.pow(v - avg, 2), 0) / intervals.length;
                        const cv = Math.sqrt(variance) / (avg || 1);
                        // Low variance = robotic
                        if (cv < 0.15) score += 0.15;
                        else if (cv < 0.25) score += 0.08;
                        factors += 0.15;
                    }
                }
                
                // Input injection detection
                if (data.inputs.length > 0) {
                    const noKeydown = data.inputs.filter(i => !i.hadKeydown).length;
                    const injectionRatio = noKeydown / data.inputs.length;
                    if (injectionRatio > 0.3) score += 0.1;
                    factors += 0.1;
                }
                
                // Keydown/keyup ratio
                if (data.keydowns.length > 5) {
                    const ratio = data.keyups.length / data.keydowns.length;
                    if (ratio < 0.5) score += 0.05; // Missing keyups
                    factors += 0.05;
                }
                
                // Normalize
                const normalizedScore = factors > 0 ? (score / factors) * 100 : 0;
                return parseFloat(normalizedScore.toFixed(1));
            },
            
            getTypingSpeed: () => {
                if (data.keydowns.length < 2) return 0;
                const first = data.keydowns[0].t;
                const last = data.keydowns[data.keydowns.length - 1].t;
                const durationSec = (last - first) / 1000;
                return durationSec > 0 ? (data.keydowns.length / durationSec).toFixed(1) : 0;
            },
            
            getData: () => ({ ...data }),
            
            reset: () => {
                data.moves = [];
                data.clicks = [];
                data.focusJumps = 0;
                data.keydowns = [];
                data.keyups = [];
                data.inputs = [];
                data.lastKeydownTime = 0;
                data.charsTyped = 0;
            }
        };
    }
    
    // ========================================================================
    // EXPORTS
    // ========================================================================
    
    // Export to window
    window.CopilotActionsDetector = CopilotActionsDetector;
    window.createQuickCopilotDetector = createQuickDetector;
    
    // ========================================================================
    // EXPERIMENTAL PLUGIN SYSTEM v1.1
    // ========================================================================
    // Easy to enable/disable experimental detection features
    // All experimental data is collected separately for research
    // 
    // v1.1 ADDITIONS (from competitor analysis):
    //   - Click Duration (mousedown → mouseup)
    //   - Stroke-Based Mouse Analysis (DataDome style)
    //   - Untrusted Event Counter
    //   - Clipboard Event Tracking
    
    const ExperimentalDetector = {
        enabled: true,  // Master switch - set to false to disable all experiments
        
        // ====================================================================
        // EXPERIMENTAL STATE
        // ====================================================================
        state: {
            // 1. Event Sequence Analysis
            eventSequences: [],          // Track actual event order per input
            currentSequence: null,       // Current input sequence being built
            sequenceTimeout: null,       // Timeout to close sequence
            
            // 2. Dwell Time Tracking
            dwellTimes: [],              // Time between hover and click
            lastHoverElement: null,
            lastHoverTime: 0,
            
            // 3. Float Coordinate Detection
            floatCoordinates: [],        // Clicks with sub-pixel precision
            
            // 4. Performance Timing Artifacts
            frameTimes: [],              // Animation frame gaps
            renderPauses: [],            // Detected pauses (potential screenshots)
            lastFrameTime: 0,
            frameMonitorActive: false,
            
            // 5. PostMessage Monitoring
            copilotMessages: [],         // Messages from copilot origins
            
            // 6. Event Sequence Mismatches
            sequenceMismatches: [],      // Input events without proper sequence
            
            // ================================================================
            // v1.1 NEW PLUGINS (from competitor behavioral analysis)
            // ================================================================
            
            // 7. Click Duration (mousedown → mouseup timing)
            // Human: 50-200ms hold, Copilot: 0ms or perfectly uniform
            clickDurations: [],
            pendingMousedowns: new Map(), // Track mousedown start times per target
            
            // 8. Stroke-Based Mouse Analysis (DataDome inspired)
            // Groups mouse moves into strokes separated by 499ms pauses
            mouseStrokes: [],
            currentStroke: null,
            strokeTimeout: null,
            lastStrokeTime: 0,
            
            // 9. Untrusted Event Counter
            // Tracks isTrusted=false events by type (forensic evidence)
            untrustedEvents: {},
            totalUntrusted: 0,
            untrustedHistory: [],  // v1.1.1: detailed forensic history
            
            // 10. Clipboard Event Tracking
            // Bots often paste content - track copy/cut/paste patterns
            clipboardEvents: [],
            lastClipboardContent: null
        },
        
        // ====================================================================
        // INITIALIZATION
        // ====================================================================
        init() {
            if (!this.enabled) return;
            
            this.installEventSequenceTracking();
            this.installDwellTimeTracking();
            this.installFloatCoordinateTracking();
            this.installPerformanceMonitoring();
            this.installPostMessageMonitoring();
            
            // v1.1 NEW PLUGINS
            this.installClickDurationTracking();
            this.installStrokeAnalysis();
            this.installUntrustedEventCounter();
            this.installClipboardTracking();
            
            console.log('%c🧪 Experimental Detector v1.1: ACTIVE', 'color: #9b59b6; font-weight: bold');
            console.log('%c   Plugins: Seq|Dwell|Float|Perf|PostMsg|ClickDur|Stroke|Untrust|Clipboard', 'color: #9b59b6');
        },
        
        // ====================================================================
        // 1. EVENT SEQUENCE ANALYSIS
        // ====================================================================
        // Correct sequence: keydown → beforeinput → input → keyup
        // Copilot may produce: [beforeinput → input] or just [input]
        
        installEventSequenceTracking() {
            const self = this;
            const startSequence = () => {
                if (self.state.currentSequence) {
                    self.finalizeSequence();
                }
                self.state.currentSequence = {
                    started: performance.now(),
                    events: []
                };
                // Auto-close sequence after 200ms of no events
                clearTimeout(self.state.sequenceTimeout);
                self.state.sequenceTimeout = setTimeout(() => self.finalizeSequence(), 200);
            };
            
            const addToSequence = (eventType, data = {}) => {
                if (!self.state.currentSequence) {
                    startSequence();
                }
                self.state.currentSequence.events.push({
                    type: eventType,
                    t: performance.now(),
                    ...data
                });
                // Reset timeout
                clearTimeout(self.state.sequenceTimeout);
                self.state.sequenceTimeout = setTimeout(() => self.finalizeSequence(), 200);
            };
            
            document.addEventListener('keydown', (e) => {
                addToSequence('keydown', { key: e.key, isTrusted: e.isTrusted });
            }, { capture: true, passive: true });
            
            document.addEventListener('beforeinput', (e) => {
                addToSequence('beforeinput', { 
                    inputType: e.inputType, 
                    dataLen: e.data?.length || 0,
                    isTrusted: e.isTrusted 
                });
            }, { capture: true, passive: true });
            
            document.addEventListener('input', (e) => {
                addToSequence('input', { 
                    inputType: e.inputType, 
                    dataLen: e.data?.length || 0,
                    isTrusted: e.isTrusted 
                });
            }, { capture: true, passive: true });
            
            document.addEventListener('keyup', (e) => {
                addToSequence('keyup', { key: e.key, isTrusted: e.isTrusted });
            }, { capture: true, passive: true });
        },
        
        finalizeSequence() {
            if (!this.state.currentSequence || this.state.currentSequence.events.length === 0) {
                this.state.currentSequence = null;
                return;
            }
            
            const seq = this.state.currentSequence;
            const types = seq.events.map(e => e.type);
            
            // Analyze sequence correctness
            const hasKeydown = types.includes('keydown');
            const hasKeyup = types.includes('keyup');
            const hasInput = types.includes('input');
            const hasBeforeInput = types.includes('beforeinput');
            
            // Expected: keydown → (beforeinput) → input → keyup
            // Suspicious patterns:
            const analysis = {
                sequence: types,
                duration: seq.events.length > 1 ? 
                    seq.events[seq.events.length - 1].t - seq.events[0].t : 0,
                hasKeydown,
                hasKeyup,
                hasInput,
                hasBeforeInput,
                // SUSPICIOUS FLAGS
                inputWithoutKeydown: hasInput && !hasKeydown,
                inputWithoutKeyup: hasInput && hasKeydown && !hasKeyup,
                suspiciousOrder: false,
                multiCharInput: seq.events.some(e => e.dataLen > 1),
                allTrusted: seq.events.every(e => e.isTrusted !== false)
            };
            
            // Check order (input should come after keydown)
            if (hasKeydown && hasInput) {
                const keydownIdx = types.indexOf('keydown');
                const inputIdx = types.indexOf('input');
                analysis.suspiciousOrder = inputIdx < keydownIdx;
            }
            
            // Calculate suspicion score for this sequence
            analysis.suspicionScore = 0;
            if (analysis.inputWithoutKeydown) analysis.suspicionScore += 40;
            if (analysis.inputWithoutKeyup) analysis.suspicionScore += 20;
            if (analysis.suspiciousOrder) analysis.suspicionScore += 30;
            if (analysis.multiCharInput) analysis.suspicionScore += 30;
            
            this.state.eventSequences.push(analysis);
            
            // Track mismatches separately
            if (analysis.suspicionScore > 0) {
                this.state.sequenceMismatches.push(analysis);
            }
            
            // Keep buffer reasonable
            if (this.state.eventSequences.length > 100) {
                this.state.eventSequences.shift();
            }
            if (this.state.sequenceMismatches.length > 50) {
                this.state.sequenceMismatches.shift();
            }
            
            this.state.currentSequence = null;
        },
        
        // ====================================================================
        // 2. DWELL TIME TRACKING
        // ====================================================================
        // Human: hover 50-500ms before click
        // Copilot: immediate click (0-20ms dwell)
        
        installDwellTimeTracking() {
            const self = this;
            
            document.addEventListener('pointerover', (e) => {
                self.state.lastHoverElement = e.target;
                self.state.lastHoverTime = performance.now();
            }, { capture: true, passive: true });
            
            document.addEventListener('click', (e) => {
                const now = performance.now();
                const dwellTime = now - self.state.lastHoverTime;
                const sameElement = e.target === self.state.lastHoverElement;
                
                self.state.dwellTimes.push({
                    t: now,
                    dwellMs: dwellTime,
                    sameElement,
                    // Suspicious if very short dwell or different element
                    suspicious: dwellTime < 30 || !sameElement,
                    element: e.target.tagName
                });
                
                if (self.state.dwellTimes.length > 50) {
                    self.state.dwellTimes.shift();
                }
            }, { capture: true, passive: true });
        },
        
        // ====================================================================
        // 3. FLOAT COORDINATE DETECTION
        // ====================================================================
        // Mojo API uses Float for coordinates, humans have integer pixels
        
        installFloatCoordinateTracking() {
            const self = this;
            
            document.addEventListener('click', (e) => {
                const x = e.clientX;
                const y = e.clientY;
                const hasFloatX = x !== Math.floor(x);
                const hasFloatY = y !== Math.floor(y);
                
                if (hasFloatX || hasFloatY) {
                    self.state.floatCoordinates.push({
                        t: performance.now(),
                        x, y,
                        floatX: hasFloatX,
                        floatY: hasFloatY,
                        decimalX: x - Math.floor(x),
                        decimalY: y - Math.floor(y)
                    });
                    
                    if (self.state.floatCoordinates.length > 50) {
                        self.state.floatCoordinates.shift();
                    }
                }
            }, { capture: true, passive: true });
        },
        
        // ====================================================================
        // 4. PERFORMANCE TIMING ARTIFACTS
        // ====================================================================
        // Screenshot capture causes rendering pauses
        
        installPerformanceMonitoring() {
            const self = this;
            
            // Only start monitoring if not already active
            if (self.state.frameMonitorActive) return;
            self.state.frameMonitorActive = true;
            
            const PAUSE_THRESHOLD = 100; // ms - suspicious pause
            
            const checkFrame = (timestamp) => {
                if (self.state.lastFrameTime > 0) {
                    const gap = timestamp - self.state.lastFrameTime;
                    
                    self.state.frameTimes.push({ t: timestamp, gap });
                    
                    // Detect suspicious pauses
                    if (gap > PAUSE_THRESHOLD) {
                        self.state.renderPauses.push({
                            t: timestamp,
                            duration: gap,
                            suspicious: gap > 150 && gap < 500 // Screenshot-like pause
                        });
                        
                        if (self.state.renderPauses.length > 30) {
                            self.state.renderPauses.shift();
                        }
                    }
                    
                    // Keep frame buffer small
                    if (self.state.frameTimes.length > 100) {
                        self.state.frameTimes.shift();
                    }
                }
                
                self.state.lastFrameTime = timestamp;
                requestAnimationFrame(checkFrame);
            };
            
            requestAnimationFrame(checkFrame);
        },
        
        // ====================================================================
        // 5. POSTMESSAGE MONITORING
        // ====================================================================
        // Copilot communicates via postMessage to copilot.microsoft.com
        
        installPostMessageMonitoring() {
            const self = this;
            
            window.addEventListener('message', (e) => {
                const origin = e.origin || '';
                const isCopilot = origin.includes('copilot.microsoft.com') ||
                                  origin.includes('bing.com/chat') ||
                                  origin.includes('edge://');
                
                if (isCopilot) {
                    self.state.copilotMessages.push({
                        t: performance.now(),
                        origin,
                        dataType: typeof e.data,
                        hasData: !!e.data
                    });
                    
                    if (self.state.copilotMessages.length > 30) {
                        self.state.copilotMessages.shift();
                    }
                }
            }, { passive: true });
        },
        
        // ====================================================================
        // 7. CLICK DURATION TRACKING (v1.1)
        // ====================================================================
        // Human: holds click for 50-200ms
        // Copilot: 0ms duration (programmatic) or perfectly uniform
        
        installClickDurationTracking() {
            const self = this;
            
            document.addEventListener('mousedown', (e) => {
                const now = performance.now();
                // Use unique key for element + button
                const key = `${e.clientX},${e.clientY},${e.button}`;
                self.state.pendingMousedowns.set(key, {
                    t: now,
                    x: e.clientX,
                    y: e.clientY,
                    button: e.button,
                    target: e.target.tagName,
                    isTrusted: e.isTrusted
                });
            }, { capture: true, passive: true });
            
            document.addEventListener('mouseup', (e) => {
                const now = performance.now();
                const key = `${e.clientX},${e.clientY},${e.button}`;
                const downData = self.state.pendingMousedowns.get(key);
                
                if (downData) {
                    const duration = now - downData.t;
                    
                    self.state.clickDurations.push({
                        t: now,
                        duration,
                        x: e.clientX,
                        y: e.clientY,
                        target: downData.target,
                        // Suspicious patterns:
                        zeroDuration: duration < 5,          // Instant click
                        tooShort: duration < 30,             // Very fast
                        tooLong: duration > 2000,            // Held too long
                        isTrusted: e.isTrusted && downData.isTrusted
                    });
                    
                    self.state.pendingMousedowns.delete(key);
                    
                    // Keep buffer reasonable
                    if (self.state.clickDurations.length > 50) {
                        self.state.clickDurations.shift();
                    }
                }
            }, { capture: true, passive: true });
        },
        
        // ====================================================================
        // 8. STROKE-BASED MOUSE ANALYSIS (v1.1)
        // ====================================================================
        // DataDome-inspired: Groups mouse moves into "strokes"
        // Strokes are separated by pauses > 499ms
        // Human: natural stroke patterns (pause → move → pause)
        // Copilot: isolated single movements without stroke context
        
        installStrokeAnalysis() {
            const self = this;
            const STROKE_GAP = 499; // ms - gap that ends a stroke
            
            const finalizeStroke = () => {
                const stroke = self.state.currentStroke;
                if (!stroke || stroke.points.length < 2) {
                    self.state.currentStroke = null;
                    return;
                }
                
                // Calculate stroke metrics
                const points = stroke.points;
                const first = points[0];
                const last = points[points.length - 1];
                
                // Total distance traveled
                let totalDist = 0;
                for (let i = 1; i < points.length; i++) {
                    const dx = points[i].x - points[i-1].x;
                    const dy = points[i].y - points[i-1].y;
                    totalDist += Math.sqrt(dx * dx + dy * dy);
                }
                
                // Direct distance (start to end)
                const directDist = Math.sqrt(
                    Math.pow(last.x - first.x, 2) + 
                    Math.pow(last.y - first.y, 2)
                );
                
                // Curvature ratio (1.0 = straight line, >1 = curved)
                const curvature = directDist > 0 ? totalDist / directDist : 0;
                
                // Duration
                const duration = last.t - first.t;
                
                // Average velocity
                const avgVelocity = duration > 0 ? totalDist / duration : 0;
                
                // Start and end angles
                const startAngle = points.length >= 3 ? 
                    Math.atan2(points[2].y - first.y, points[2].x - first.x) : 0;
                const endAngle = points.length >= 3 ?
                    Math.atan2(last.y - points[points.length - 3].y, 
                               last.x - points[points.length - 3].x) : 0;
                
                self.state.mouseStrokes.push({
                    t: first.t,
                    pointCount: points.length,
                    totalDistance: Math.round(totalDist),
                    directDistance: Math.round(directDist),
                    curvature: curvature.toFixed(2),
                    duration: Math.round(duration),
                    avgVelocity: avgVelocity.toFixed(2),
                    startAngle: (startAngle * 180 / Math.PI).toFixed(0),
                    endAngle: (endAngle * 180 / Math.PI).toFixed(0),
                    // Suspicious: very straight line (curvature ~1.0)
                    // or very short stroke
                    suspicious: curvature < 1.05 && points.length > 5
                });
                
                // Keep buffer reasonable
                if (self.state.mouseStrokes.length > 30) {
                    self.state.mouseStrokes.shift();
                }
                
                self.state.currentStroke = null;
            };
            
            document.addEventListener('mousemove', (e) => {
                const now = performance.now();
                
                // Check if we need to start new stroke (gap > 499ms)
                if (self.state.lastStrokeTime > 0 && 
                    now - self.state.lastStrokeTime > STROKE_GAP) {
                    finalizeStroke();
                }
                
                // Start new stroke if needed
                if (!self.state.currentStroke) {
                    self.state.currentStroke = {
                        started: now,
                        points: []
                    };
                }
                
                // Add point to current stroke
                self.state.currentStroke.points.push({
                    t: now,
                    x: e.clientX,
                    y: e.clientY
                });
                
                self.state.lastStrokeTime = now;
                
                // Set timeout to finalize stroke after gap
                clearTimeout(self.state.strokeTimeout);
                self.state.strokeTimeout = setTimeout(finalizeStroke, STROKE_GAP + 50);
                
            }, { capture: true, passive: true });
        },
        
        // ====================================================================
        // 9. UNTRUSTED EVENT COUNTER (v1.1)
        // ====================================================================
        // Tracks isTrusted=false events separately by type
        // Provides forensic evidence of synthetic events
        // v1.1.1: Added real-time logging for research visibility
        
        installUntrustedEventCounter() {
            const self = this;
            
            // Store recent untrusted events for forensics
            self.state.untrustedHistory = [];
            
            const trackEvent = (eventType) => (e) => {
                if (e.isTrusted === false) {
                    if (!self.state.untrustedEvents[eventType]) {
                        self.state.untrustedEvents[eventType] = 0;
                    }
                    self.state.untrustedEvents[eventType]++;
                    self.state.totalUntrusted++;
                    
                    // Build event details for logging
                    const details = {
                        type: eventType,
                        t: performance.now(),
                        timestamp: new Date().toISOString().substr(11, 12),
                        target: e.target?.tagName || 'UNKNOWN',
                        id: e.target?.id || '',
                        className: e.target?.className?.split?.(' ')?.[0] || ''
                    };
                    
                    // Add coordinates for mouse events
                    if (e.clientX !== undefined) {
                        details.x = e.clientX;
                        details.y = e.clientY;
                    }
                    
                    // Add key info for keyboard events (anonymized)
                    if (e.key !== undefined) {
                        details.key = e.key.length === 1 ? '[char]' : e.key;
                    }
                    
                    // Store in history
                    self.state.untrustedHistory.push(details);
                    if (self.state.untrustedHistory.length > 50) {
                        self.state.untrustedHistory.shift();
                    }
                    
                    // REAL-TIME LOGGING for research visibility
                    const targetStr = details.id ? `#${details.id}` : 
                                     details.className ? `.${details.className}` : 
                                     details.target;
                    const coordStr = details.x !== undefined ? ` at (${details.x}, ${details.y})` : '';
                    const keyStr = details.key ? ` [${details.key}]` : '';
                    
                    console.warn(
                        `%c⚠️ UNTRUSTED EVENT: ${eventType}${keyStr}${coordStr} on ${targetStr} @ ${details.timestamp}`,
                        'color: #e74c3c; font-weight: bold; background: #ffeaa7; padding: 2px 6px; border-radius: 3px;'
                    );
                    console.log('%c   Event details:', 'color: #e74c3c', details);
                }
            };
            
            // Track untrusted events across all major event types
            const eventsToTrack = [
                'click', 'mousedown', 'mouseup', 'mousemove',
                'keydown', 'keyup', 'keypress',
                'input', 'change', 'focus', 'blur',
                'touchstart', 'touchmove', 'touchend',
                'scroll', 'wheel'
            ];
            
            eventsToTrack.forEach(eventType => {
                document.addEventListener(eventType, trackEvent(eventType), 
                    { capture: true, passive: true });
            });
        },
        
        // ====================================================================
        // 10. CLIPBOARD EVENT TRACKING (v1.1)
        // ====================================================================
        // Bots often paste content - track copy/cut/paste patterns
        // Useful for detecting automated form filling
        
        installClipboardTracking() {
            const self = this;
            
            const handleClipboard = (type) => (e) => {
                const now = performance.now();
                let contentInfo = null;
                
                try {
                    if (e.clipboardData) {
                        const text = e.clipboardData.getData('text/plain');
                        const html = e.clipboardData.getData('text/html');
                        contentInfo = {
                            hasText: text.length > 0,
                            textLength: text.length,
                            hasHtml: html.length > 0,
                            // Check if content changed (for paste tracking)
                            isNewContent: text !== self.state.lastClipboardContent
                        };
                        if (type === 'paste') {
                            self.state.lastClipboardContent = text;
                        }
                    }
                } catch (err) {
                    // Clipboard access may be restricted
                    contentInfo = { error: 'access_denied' };
                }
                
                self.state.clipboardEvents.push({
                    t: now,
                    type,
                    target: e.target?.tagName || 'UNKNOWN',
                    isTrusted: e.isTrusted,
                    content: contentInfo
                });
                
                // Keep buffer reasonable
                if (self.state.clipboardEvents.length > 30) {
                    self.state.clipboardEvents.shift();
                }
            };
            
            document.addEventListener('copy', handleClipboard('copy'), 
                { capture: true, passive: true });
            document.addEventListener('cut', handleClipboard('cut'), 
                { capture: true, passive: true });
            document.addEventListener('paste', handleClipboard('paste'), 
                { capture: true, passive: true });
        },
        
        // ====================================================================
        // ANALYSIS & REPORTING
        // ====================================================================
        
        getReport() {
            const state = this.state;
            
            // 1. Event Sequence Analysis
            const totalSequences = state.eventSequences.length;
            const mismatchCount = state.sequenceMismatches.length;
            const mismatchRatio = totalSequences > 0 ? mismatchCount / totalSequences : 0;
            const avgSequenceSuspicion = mismatchCount > 0 ?
                state.sequenceMismatches.reduce((s, m) => s + m.suspicionScore, 0) / mismatchCount : 0;
            
            // 2. Dwell Time Analysis
            const dwells = state.dwellTimes;
            const shortDwells = dwells.filter(d => d.dwellMs < 30).length;
            const shortDwellRatio = dwells.length > 0 ? shortDwells / dwells.length : 0;
            const avgDwellTime = dwells.length > 0 ?
                dwells.reduce((s, d) => s + d.dwellMs, 0) / dwells.length : 0;
            
            // 3. Float Coordinate Analysis
            const floatClicks = state.floatCoordinates.length;
            
            // 4. Performance Analysis
            const pauses = state.renderPauses;
            const suspiciousPauses = pauses.filter(p => p.suspicious).length;
            const avgFrameGap = state.frameTimes.length > 0 ?
                state.frameTimes.reduce((s, f) => s + f.gap, 0) / state.frameTimes.length : 0;
            
            // 5. PostMessage Analysis
            const copilotMsgCount = state.copilotMessages.length;
            
            // ================================================================
            // v1.1 NEW PLUGIN ANALYSIS
            // ================================================================
            
            // 7. Click Duration Analysis
            const clicks = state.clickDurations;
            const zeroClicks = clicks.filter(c => c.zeroDuration).length;
            const shortClicks = clicks.filter(c => c.tooShort).length;
            const zeroClickRatio = clicks.length > 0 ? zeroClicks / clicks.length : 0;
            const shortClickRatio = clicks.length > 0 ? shortClicks / clicks.length : 0;
            const avgClickDuration = clicks.length > 0 ?
                clicks.reduce((s, c) => s + c.duration, 0) / clicks.length : 0;
            // Uniformity check - low variance = suspicious
            const clickDurVariance = clicks.length > 2 ? (() => {
                const avg = avgClickDuration;
                const v = clicks.reduce((s, c) => s + Math.pow(c.duration - avg, 2), 0) / clicks.length;
                return Math.sqrt(v);
            })() : 0;
            const clickUniformity = avgClickDuration > 0 ? clickDurVariance / avgClickDuration : 0;
            
            // 8. Stroke Analysis
            const strokes = state.mouseStrokes;
            const straightStrokes = strokes.filter(s => parseFloat(s.curvature) < 1.05 && s.pointCount > 5).length;
            const shortStrokes = strokes.filter(s => s.pointCount < 3).length;
            const straightStrokeRatio = strokes.length > 0 ? straightStrokes / strokes.length : 0;
            const avgStrokePoints = strokes.length > 0 ?
                strokes.reduce((s, st) => s + st.pointCount, 0) / strokes.length : 0;
            const avgStrokeCurvature = strokes.length > 0 ?
                strokes.reduce((s, st) => s + parseFloat(st.curvature), 0) / strokes.length : 0;
            
            // 9. Untrusted Event Analysis
            const untrustedTotal = state.totalUntrusted;
            const untrustedTypes = Object.keys(state.untrustedEvents).length;
            
            // 10. Clipboard Analysis
            const clipEvents = state.clipboardEvents;
            const pasteCount = clipEvents.filter(c => c.type === 'paste').length;
            const untrustedClipboard = clipEvents.filter(c => !c.isTrusted).length;
            
            // Calculate experimental score (now includes v1.1 plugins)
            let expScore = 0;
            
            // Original scoring
            if (mismatchRatio > 0.3) expScore += 20;
            else if (mismatchRatio > 0.1) expScore += 8;
            
            if (shortDwellRatio > 0.5) expScore += 20;
            else if (shortDwellRatio > 0.2) expScore += 8;
            
            if (floatClicks > 3) expScore += 10;
            else if (floatClicks > 0) expScore += 4;
            
            if (suspiciousPauses > 5) expScore += 10;
            else if (suspiciousPauses > 2) expScore += 4;
            
            if (copilotMsgCount > 0) expScore += 15;
            
            // v1.1 NEW SCORING
            // Click Duration
            if (zeroClickRatio > 0.5) expScore += 15;       // Mostly instant clicks
            else if (zeroClickRatio > 0.2) expScore += 8;
            if (clickUniformity < 0.2 && clicks.length > 3) expScore += 10; // Very uniform durations
            
            // Stroke Analysis
            if (straightStrokeRatio > 0.5) expScore += 10;  // Mostly straight strokes
            else if (straightStrokeRatio > 0.2) expScore += 5;
            if (strokes.length > 0 && avgStrokePoints < 5) expScore += 8; // Very short strokes
            
            // Untrusted Events
            if (untrustedTotal > 10) expScore += 15;
            else if (untrustedTotal > 3) expScore += 8;
            
            // Clipboard
            if (untrustedClipboard > 0) expScore += 10;     // Programmatic clipboard
            
            return {
                enabled: this.enabled,
                experimentalScore: Math.min(expScore, 100),
                
                // 1. Event Sequences
                eventSequence: {
                    totalSequences,
                    mismatchCount,
                    mismatchRatio: (mismatchRatio * 100).toFixed(1) + '%',
                    avgSuspicionScore: avgSequenceSuspicion.toFixed(1),
                    verdict: mismatchRatio > 0.3 ? 'SUSPICIOUS' : 
                            mismatchRatio > 0.1 ? 'ELEVATED' : 'NORMAL',
                    recentMismatches: state.sequenceMismatches.slice(-5)
                },
                
                // 2. Dwell Time
                dwellTime: {
                    totalClicks: dwells.length,
                    shortDwellCount: shortDwells,
                    shortDwellRatio: (shortDwellRatio * 100).toFixed(1) + '%',
                    avgDwellMs: avgDwellTime.toFixed(1),
                    verdict: shortDwellRatio > 0.5 ? 'SUSPICIOUS' :
                            shortDwellRatio > 0.2 ? 'ELEVATED' : 'NORMAL'
                },
                
                // 3. Float Coordinates
                floatCoordinates: {
                    count: floatClicks,
                    verdict: floatClicks > 3 ? 'SUSPICIOUS' :
                            floatClicks > 0 ? 'DETECTED' : 'NONE',
                    samples: state.floatCoordinates.slice(-5)
                },
                
                // 4. Performance
                performance: {
                    pauseCount: pauses.length,
                    suspiciousPauses,
                    avgFrameGap: avgFrameGap.toFixed(1) + 'ms',
                    verdict: suspiciousPauses > 5 ? 'SUSPICIOUS' :
                            suspiciousPauses > 2 ? 'ELEVATED' : 'NORMAL'
                },
                
                // 5. PostMessage
                postMessage: {
                    copilotDetected: copilotMsgCount > 0,
                    messageCount: copilotMsgCount,
                    recentMessages: state.copilotMessages.slice(-5)
                },
                
                // ============================================================
                // v1.1 NEW PLUGINS
                // ============================================================
                
                // 7. Click Duration (v1.1)
                clickDuration: {
                    totalClicks: clicks.length,
                    zeroClicks,
                    shortClicks,
                    zeroClickRatio: (zeroClickRatio * 100).toFixed(1) + '%',
                    avgDurationMs: avgClickDuration.toFixed(1),
                    uniformity: clickUniformity.toFixed(2),
                    verdict: zeroClickRatio > 0.5 ? 'SUSPICIOUS' :
                            zeroClickRatio > 0.2 ? 'ELEVATED' :
                            clickUniformity < 0.2 && clicks.length > 3 ? 'UNIFORM' : 'NORMAL',
                    recentClicks: clicks.slice(-5).map(c => ({
                        dur: c.duration.toFixed(0) + 'ms',
                        target: c.target
                    }))
                },
                
                // 8. Stroke Analysis (v1.1)
                strokeAnalysis: {
                    totalStrokes: strokes.length,
                    straightStrokes,
                    shortStrokes,
                    straightRatio: (straightStrokeRatio * 100).toFixed(1) + '%',
                    avgPoints: avgStrokePoints.toFixed(1),
                    avgCurvature: avgStrokeCurvature.toFixed(2),
                    verdict: straightStrokeRatio > 0.5 ? 'SUSPICIOUS' :
                            straightStrokeRatio > 0.2 ? 'ELEVATED' :
                            avgStrokePoints < 5 && strokes.length > 3 ? 'SHORT' : 'NORMAL',
                    recentStrokes: strokes.slice(-5).map(s => ({
                        pts: s.pointCount,
                        curve: s.curvature,
                        dist: s.totalDistance + 'px'
                    }))
                },
                
                // 9. Untrusted Events (v1.1)
                untrustedEvents: {
                    total: untrustedTotal,
                    typeCount: untrustedTypes,
                    byType: { ...state.untrustedEvents },
                    verdict: untrustedTotal > 10 ? 'SUSPICIOUS' :
                            untrustedTotal > 3 ? 'ELEVATED' :
                            untrustedTotal > 0 ? 'DETECTED' : 'NONE',
                    // v1.1.1: Include recent history for forensics
                    recentHistory: (state.untrustedHistory || []).slice(-5)
                },
                
                // 10. Clipboard (v1.1)
                clipboard: {
                    totalEvents: clipEvents.length,
                    pasteCount,
                    untrustedCount: untrustedClipboard,
                    verdict: untrustedClipboard > 0 ? 'SUSPICIOUS' :
                            pasteCount > 5 ? 'ELEVATED' : 'NORMAL',
                    recentEvents: clipEvents.slice(-5)
                }
            };
        },
        
        // Pretty print report to console
        printReport() {
            const report = this.getReport();
            
            console.log('%c\n═══════════════════════════════════════════════════════════', 'color: #9b59b6');
            console.log('%c  🧪 EXPERIMENTAL DETECTION REPORT v1.1', 'color: #9b59b6; font-weight: bold; font-size: 14px');
            console.log('%c═══════════════════════════════════════════════════════════', 'color: #9b59b6');
            
            const scoreColor = report.experimentalScore >= 50 ? 'color: red; font-weight: bold' :
                              report.experimentalScore >= 25 ? 'color: orange; font-weight: bold' :
                              'color: green';
            console.log(`%c  Experimental Score: ${report.experimentalScore}/100`, scoreColor);
            
            console.log('\n%c  ══ ORIGINAL PLUGINS ══', 'color: #9b59b6; font-weight: bold');
            
            console.log('\n%c  1️⃣ Event Sequence Analysis:', 'color: #9b59b6; font-weight: bold');
            console.table({
                'Total Sequences': report.eventSequence.totalSequences,
                'Mismatch Count': report.eventSequence.mismatchCount,
                'Mismatch Ratio': report.eventSequence.mismatchRatio,
                'Avg Suspicion': report.eventSequence.avgSuspicionScore,
                'Verdict': report.eventSequence.verdict
            });
            
            console.log('\n%c  2️⃣ Dwell Time Analysis:', 'color: #9b59b6; font-weight: bold');
            console.table({
                'Total Clicks': report.dwellTime.totalClicks,
                'Short Dwells (<30ms)': report.dwellTime.shortDwellCount,
                'Short Dwell Ratio': report.dwellTime.shortDwellRatio,
                'Avg Dwell Time': report.dwellTime.avgDwellMs + 'ms',
                'Verdict': report.dwellTime.verdict
            });
            
            console.log('\n%c  3️⃣ Float Coordinate Detection:', 'color: #9b59b6; font-weight: bold');
            console.table({
                'Float Clicks Detected': report.floatCoordinates.count,
                'Verdict': report.floatCoordinates.verdict
            });
            if (report.floatCoordinates.samples.length > 0) {
                console.log('    Samples:', report.floatCoordinates.samples);
            }
            
            console.log('\n%c  4️⃣ Performance Timing:', 'color: #9b59b6; font-weight: bold');
            console.table({
                'Render Pauses': report.performance.pauseCount,
                'Suspicious Pauses': report.performance.suspiciousPauses,
                'Avg Frame Gap': report.performance.avgFrameGap,
                'Verdict': report.performance.verdict
            });
            
            console.log('\n%c  5️⃣ PostMessage Monitoring:', 'color: #9b59b6; font-weight: bold');
            console.table({
                'Copilot Detected': report.postMessage.copilotDetected ? 'YES' : 'NO',
                'Message Count': report.postMessage.messageCount
            });
            
            // ================================================================
            // v1.1 NEW PLUGINS
            // ================================================================
            console.log('\n%c  ══ v1.1 NEW PLUGINS ══', 'color: #e67e22; font-weight: bold');
            
            // 7. Click Duration
            const clickColor = report.clickDuration.verdict === 'SUSPICIOUS' ? 'color: red; font-weight: bold' :
                              report.clickDuration.verdict === 'ELEVATED' ? 'color: orange' :
                              report.clickDuration.verdict === 'UNIFORM' ? 'color: orange' :
                              'color: green';
            console.log('\n%c  7️⃣ Click Duration (mousedown→mouseup):', 'color: #e67e22; font-weight: bold');
            console.table({
                'Total Clicks': report.clickDuration.totalClicks,
                'Zero Duration (<5ms)': report.clickDuration.zeroClicks,
                'Short Duration (<30ms)': report.clickDuration.shortClicks,
                'Zero Ratio': report.clickDuration.zeroClickRatio,
                'Avg Duration': report.clickDuration.avgDurationMs + 'ms',
                'Uniformity (CV)': report.clickDuration.uniformity,
                'Verdict': report.clickDuration.verdict
            });
            if (report.clickDuration.recentClicks.length > 0) {
                console.log('%c    Recent:', 'color: gray', report.clickDuration.recentClicks);
            }
            
            // 8. Stroke Analysis
            const strokeColor = report.strokeAnalysis.verdict === 'SUSPICIOUS' ? 'color: red; font-weight: bold' :
                               report.strokeAnalysis.verdict === 'ELEVATED' ? 'color: orange' :
                               report.strokeAnalysis.verdict === 'SHORT' ? 'color: orange' :
                               'color: green';
            console.log('\n%c  8️⃣ Stroke-Based Mouse Analysis:', 'color: #e67e22; font-weight: bold');
            console.table({
                'Total Strokes': report.strokeAnalysis.totalStrokes,
                'Straight Strokes': report.strokeAnalysis.straightStrokes,
                'Short Strokes (<3pts)': report.strokeAnalysis.shortStrokes,
                'Straight Ratio': report.strokeAnalysis.straightRatio,
                'Avg Points/Stroke': report.strokeAnalysis.avgPoints,
                'Avg Curvature': report.strokeAnalysis.avgCurvature + ' (1.0=straight)',
                'Verdict': report.strokeAnalysis.verdict
            });
            if (report.strokeAnalysis.recentStrokes.length > 0) {
                console.log('%c    Recent:', 'color: gray', report.strokeAnalysis.recentStrokes);
            }
            
            // 9. Untrusted Events
            const untrustedColor = report.untrustedEvents.verdict === 'SUSPICIOUS' ? 'color: red; font-weight: bold' :
                                  report.untrustedEvents.verdict === 'ELEVATED' ? 'color: orange' :
                                  report.untrustedEvents.verdict === 'DETECTED' ? 'color: yellow' :
                                  'color: green';
            console.log('\n%c  9️⃣ Untrusted Event Counter:', 'color: #e67e22; font-weight: bold');
            console.table({
                'Total Untrusted': report.untrustedEvents.total,
                'Event Types': report.untrustedEvents.typeCount,
                'Verdict': report.untrustedEvents.verdict
            });
            if (Object.keys(report.untrustedEvents.byType).length > 0) {
                console.log('%c    By Type:', 'color: gray', report.untrustedEvents.byType);
            }
            
            // 10. Clipboard
            const clipColor = report.clipboard.verdict === 'SUSPICIOUS' ? 'color: red; font-weight: bold' :
                             report.clipboard.verdict === 'ELEVATED' ? 'color: orange' :
                             'color: green';
            console.log('\n%c  🔟 Clipboard Events:', 'color: #e67e22; font-weight: bold');
            console.table({
                'Total Events': report.clipboard.totalEvents,
                'Paste Count': report.clipboard.pasteCount,
                'Untrusted': report.clipboard.untrustedCount,
                'Verdict': report.clipboard.verdict
            });
            if (report.clipboard.recentEvents.length > 0) {
                console.log('%c    Recent:', 'color: gray', report.clipboard.recentEvents.map(e => ({
                    type: e.type,
                    target: e.target,
                    trusted: e.isTrusted ? 'yes' : 'NO'
                })));
            }
            
            console.log('%c═══════════════════════════════════════════════════════════\n', 'color: #9b59b6');
            
            return report;
        },
        
        // Reset experimental state
        reset() {
            this.state = {
                // Original plugins
                eventSequences: [],
                currentSequence: null,
                sequenceTimeout: null,
                dwellTimes: [],
                lastHoverElement: null,
                lastHoverTime: 0,
                floatCoordinates: [],
                frameTimes: [],
                renderPauses: [],
                lastFrameTime: 0,
                frameMonitorActive: false,
                copilotMessages: [],
                sequenceMismatches: [],
                
                // v1.1 NEW PLUGINS
                clickDurations: [],
                pendingMousedowns: new Map(),
                mouseStrokes: [],
                currentStroke: null,
                strokeTimeout: null,
                lastStrokeTime: 0,
                untrustedEvents: {},
                totalUntrusted: 0,
                untrustedHistory: [],  // v1.1.1: forensic history
                clipboardEvents: [],
                lastClipboardContent: null
            };
            console.log('%c🧪 Experimental detector v1.1 reset', 'color: #9b59b6');
        },
        
        // Toggle on/off
        toggle() {
            this.enabled = !this.enabled;
            console.log(`%c🧪 Experimental detector: ${this.enabled ? 'ENABLED' : 'DISABLED'}`, 
                       `color: ${this.enabled ? '#9b59b6' : 'gray'}; font-weight: bold`);
            return this.enabled;
        }
    };
    
    // Initialize experimental detector
    ExperimentalDetector.init();
    
    // Export experimental detector
    window.experimentalDetector = ExperimentalDetector;
    
    // ========================================================================
    // AUTO-INITIALIZE FOR CONSOLE USE
    // ========================================================================
    // When pasted into browser console, automatically start detection
    
    // Create and start detector instance
    window.copilotDetector = new CopilotActionsDetector();
    window.copilotDetector.start();
    
    // Create quick detector as well
    window.quickDetector = createQuickDetector();
    
    // Set up periodic reporting
    window._copilotDetectorInterval = setInterval(() => {
        const report = window.copilotDetector.getReport();
        const typingReport = window.copilotDetector.getTypingReport();
        
        // Color-coded console output
        const scoreColor = report.score >= 60 ? 'color: red; font-weight: bold' :
                          report.score >= 35 ? 'color: orange; font-weight: bold' :
                          'color: green';
        
        console.log(
            `%c🤖 Copilot Detection: ${report.verdict} (${report.score.toFixed(1)}%)`,
            scoreColor
        );
        console.log('  Metrics:', report.metrics);
        
        // Log typing-specific info if there was typing activity
        if (typingReport.totalKeydowns > 0 || typingReport.totalCharsTyped > 0) {
            const typingColor = typingReport.typingSpeed.verdict === 'ROBOTIC' ? 'color: red' :
                               typingReport.typingSpeed.verdict === 'SUSPICIOUS' ? 'color: orange' :
                               'color: gray';
            console.log(
                `%c  ⌨️ Typing: ${typingReport.typingSpeed.cps.toFixed(1)} CPS (${typingReport.typingSpeed.verdict})`,
                typingColor
            );
            console.log(`    Keydowns: ${typingReport.totalKeydowns}, Keyups: ${typingReport.totalKeyups}, Chars: ${typingReport.totalCharsTyped}`);
            
            // Show effective typing verdict (key for injection detection)
            if (typingReport.effectiveTyping.verdict !== 'NORMAL') {
                const injColor = typingReport.effectiveTyping.verdict === 'INJECTION_DETECTED' ? 'color: red; font-weight: bold' :
                               'color: orange';
                console.log(`%c    💉 Effective: ${typingReport.effectiveTyping.verdict} (${typingReport.effectiveTyping.charsPerKeydown} chars/key)`, injColor);
            }
            
            if (typingReport.suspiciousInsertions.length > 0) {
                console.log('%c    ⚠️ Suspicious insertions detected! (non-paste injection)', 'color: red');
            }
            if (typingReport.pasteInsertions.length > 0) {
                console.log(`%c    📋 Paste events: ${typingReport.pasteInsertions.length} (Ctrl+V - not suspicious)`, 'color: gray');
            }
        }
        
        // Experimental highlights (compact)
        if (window.experimentalDetector && window.experimentalDetector.enabled) {
            const exp = window.experimentalDetector.getReport();
            if (exp.experimentalScore > 0) {
                const expColor = exp.experimentalScore >= 50 ? 'color: #9b59b6; font-weight: bold' :
                                exp.experimentalScore >= 25 ? 'color: #9b59b6' : 'color: gray';
                console.log(`%c  🧪 Experimental: ${exp.experimentalScore}/100`, expColor);
                
                // Show notable findings (original plugins)
                const findings = [];
                if (exp.eventSequence.verdict !== 'NORMAL') 
                    findings.push(`Seq:${exp.eventSequence.mismatchRatio}`);
                if (exp.dwellTime.verdict !== 'NORMAL') 
                    findings.push(`Dwell:${exp.dwellTime.shortDwellRatio}`);
                if (exp.floatCoordinates.count > 0) 
                    findings.push(`Float:${exp.floatCoordinates.count}`);
                if (exp.performance.suspiciousPauses > 0) 
                    findings.push(`Pause:${exp.performance.suspiciousPauses}`);
                if (exp.postMessage.copilotDetected) 
                    findings.push('PostMsg:YES');
                
                // v1.1 NEW PLUGINS
                if (exp.clickDuration.verdict !== 'NORMAL')
                    findings.push(`ClickDur:${exp.clickDuration.zeroClickRatio}`);
                if (exp.strokeAnalysis.verdict !== 'NORMAL')
                    findings.push(`Stroke:${exp.strokeAnalysis.straightRatio}`);
                if (exp.untrustedEvents.total > 0) {
                    // Show breakdown by type
                    const types = Object.entries(exp.untrustedEvents.byType)
                        .map(([k,v]) => `${k}:${v}`).join(',');
                    findings.push(`Untrust:${exp.untrustedEvents.total}(${types})`);
                }
                if (exp.clipboard.verdict !== 'NORMAL')
                    findings.push(`Clip:${exp.clipboard.pasteCount}`);
                
                if (findings.length > 0) {
                    console.log(`%c    ${findings.join(' | ')}`, 'color: #9b59b6');
                }
            }
        }
    }, 5000);
    
    // ========================================================================
    // BEHAVIOR FINGERPRINT GENERATOR
    // ========================================================================
    // Generates a compact, comparable fingerprint of agent behavior
    
    window.getBehaviorFingerprint = () => {
        const m = window.copilotDetector.getMetrics();
        const t = window.copilotDetector.getTypingReport();
        const exp = window.experimentalDetector.getReport();
        const main = window.copilotDetector.getReport();
        
        // Tier 1: EXCELLENT signals (clear separation)
        const tier1 = {
            keyUpRatio: t.keyEventRatio.ratio?.toFixed(2) || 0,
            keyUpVerdict: t.keyEventRatio.verdict,
            inputInjection: (m.inputInjectionRatio * 100).toFixed(0) + '%',
            effectiveTyping: m.effectiveTyping.verdict,
            charsPerKeydown: m.effectiveTyping.charsPerKeydown,
            noMoveClicks: (m.noMovementClickRatio * 100).toFixed(0) + '%',
            suspiciousInsert: m.suspiciousInsertions,
            multiCharInput: (m.multiCharInputRatio * 100).toFixed(0) + '%',
            focusJumps: (m.focusJumpRatio * 100).toFixed(0) + '%',
            keyHoldVerdict: m.avgKeyHoldDuration.verdict
        };
        
        // Tier 2: GOOD signals
        const tier2 = {
            seqMismatch: exp.eventSequence.mismatchRatio,
            shortDwell: exp.dwellTime.shortDwellRatio,
            centerClicks: (m.centerClickRatio * 100).toFixed(0) + '%',
            pathDeviation: m.avgPathDeviation.toFixed(1) + 'px',
            // v1.1 NEW
            clickDuration: exp.clickDuration.verdict,
            strokeAnalysis: exp.strokeAnalysis.verdict
        };
        
        // Tier 3: Experimental/Research signals
        const tier3 = {
            floatCoords: exp.floatCoordinates.count,
            renderPauses: exp.performance.suspiciousPauses,
            copilotPostMsg: exp.postMessage.copilotDetected,
            typingCPS: m.typingSpeed.cps?.toFixed(1) || 0,
            typingUniformity: m.typingUniformity.toFixed(2),
            burstScore: m.burstTypingScore.toFixed(2),
            // v1.1 NEW
            untrustedEvents: exp.untrustedEvents.total,
            clipboardPastes: exp.clipboard.pasteCount,
            zeroClickRatio: exp.clickDuration.zeroClickRatio,
            straightStrokes: exp.strokeAnalysis.straightRatio
        };
        
        // Counts for context
        const counts = {
            clicks: window.copilotDetector.state.clicks.length,
            keydowns: t.totalKeydowns,
            keyups: t.totalKeyups,
            inputs: window.copilotDetector.state.inputEvents.length,
            chars: m.totalCharsTyped,
            duration: (m.sessionDurationMs / 1000).toFixed(0) + 's'
        };
        
        // Generate compact hash-like ID for comparison
        // Format: K=keyup, I=injection, E=effectiveTyping, M=movement, S=suspicious, F=focus, C=center
        const sig = [
            tier1.keyUpVerdict === 'NO_KEYUPS' ? 'K0' : tier1.keyUpVerdict === 'MISSING_KEYUPS' ? 'KM' : 'KN',
            m.inputInjectionRatio > 0.5 ? 'I+' : 'I-',
            m.effectiveTyping.verdict === 'INJECTION_DETECTED' ? 'E!' : 
                m.effectiveTyping.verdict === 'SUSPICIOUS_RATIO' ? 'E?' : 'E-',
            m.noMovementClickRatio > 0.5 ? 'M+' : 'M-',
            m.suspiciousInsertions > 0 ? 'S' + m.suspiciousInsertions : 'S0',
            m.focusJumpRatio > 0.5 ? 'F+' : 'F-',
            m.centerClickRatio > 0.3 ? 'C+' : 'C-'
        ].join('');
        
        const fingerprint = {
            signature: sig,
            score: main.score.toFixed(1) + '%',
            verdict: main.verdict,
            tier1_excellent: tier1,
            tier2_good: tier2,
            tier3_research: tier3,
            counts,
            timestamp: new Date().toISOString()
        };
        
        return fingerprint;
    };
    
    window.exportFingerprint = () => {
        const fp = window.getBehaviorFingerprint();
        
        console.log('%c\n╔═══════════════════════════════════════════════════════════╗', 'color: #e67e22');
        console.log('%c║           🔖 AGENT BEHAVIOR FINGERPRINT                    ║', 'color: #e67e22; font-weight: bold');
        console.log('%c╚═══════════════════════════════════════════════════════════╝', 'color: #e67e22');
        
        console.log(`%c\n  Signature: ${fp.signature}`, 'color: #e67e22; font-weight: bold; font-size: 14px');
        console.log(`  Score: ${fp.score} (${fp.verdict})`);
        console.log(`  Duration: ${fp.counts.duration}`);
        
        console.log('\n%c  ═══ TIER 1: EXCELLENT SIGNALS ═══', 'color: #27ae60; font-weight: bold');
        console.table(fp.tier1_excellent);
        
        console.log('\n%c  ═══ TIER 2: GOOD SIGNALS ═══', 'color: #3498db; font-weight: bold');
        console.table(fp.tier2_good);
        
        console.log('\n%c  ═══ TIER 3: RESEARCH SIGNALS ═══', 'color: #9b59b6; font-weight: bold');
        console.table(fp.tier3_research);
        
        console.log('\n%c  ═══ SESSION COUNTS ═══', 'color: gray');
        console.table(fp.counts);
        
        // Copyable JSON
        console.log('\n%c  📋 Copy this JSON for comparison:', 'color: #e67e22; font-weight: bold');
        console.log(JSON.stringify(fp, null, 2));
        
        console.log('%c\n═══════════════════════════════════════════════════════════\n', 'color: #e67e22');
        
        return fp;
    };
    
    // Compact one-liner for quick comparison
    window.getSignature = () => {
        const fp = window.getBehaviorFingerprint();
        const line = `[${fp.signature}] ${fp.score} ${fp.verdict} | T1: inj=${fp.tier1_excellent.inputInjection} noMove=${fp.tier1_excellent.noMoveClicks} keyUp=${fp.tier1_excellent.keyUpVerdict} | T2: seq=${fp.tier2_good.seqMismatch} dwell=${fp.tier2_good.shortDwell}`;
        console.log(`%c${line}`, 'color: #e67e22; font-weight: bold');
        return line;
    };
    
    // Provide helper functions for console use
    window.stopCopilotDetector = () => {
        clearInterval(window._copilotDetectorInterval);
        window.copilotDetector.stop();
        
        console.log('%c\n🛑 Copilot detector stopped', 'color: red; font-weight: bold');
        console.log('%c   Generating final fingerprint...', 'color: gray');
        
        // Auto-export fingerprint on stop
        window.exportFingerprint();
    };
    
    window.getCopilotReport = () => {
        const report = window.copilotDetector.getReport();
        console.table({
            'Score': report.score.toFixed(1) + '%',
            'Verdict': report.verdict,
            'Confidence': report.confidence,
            'Typing Speed': report.metrics.typingSpeed.cps?.toFixed(1) + ' CPS' || 'N/A',
            'Typing Verdict': report.metrics.typingSpeed.verdict || 'N/A',
            'Center Clicks': (report.metrics.centerClickRatio * 100).toFixed(0) + '%',
            'No-Move Clicks': (report.metrics.noMovementClickRatio * 100).toFixed(0) + '%',
            'Focus Jumps': (report.metrics.focusJumpRatio * 100).toFixed(0) + '%',
            'Key Event Ratio': report.metrics.keyEventRatio.verdict || 'N/A',
            'Suspicious Insertions': report.metrics.suspiciousInsertions,
            'Paste Events (OK)': report.metrics.pasteInsertions
        });
        return report;
    };
    
    window.getTypingReport = () => {
        const report = window.copilotDetector.getTypingReport();
        console.table({
            'Typing Speed': report.typingSpeed.cps?.toFixed(1) + ' CPS' || 'N/A',
            'Typing Verdict': report.typingSpeed.verdict,
            'Total Keydowns': report.totalKeydowns,
            'Total Keyups': report.totalKeyups,
            'Keydown/Keyup Ratio': report.keyEventRatio.ratio?.toFixed(2) || 'N/A',
            'Ratio Verdict': report.keyEventRatio.verdict,
            'Typing Uniformity': report.typingUniformity?.toFixed(2) || 'N/A',
            'Inputs Without Keydown': report.inputsWithoutKeydown,
            'Suspicious Insertions': report.suspiciousInsertions.length,
            'Paste Events (OK)': report.pasteInsertions.length
        });
        return report;
    };
    
    window.resetCopilotDetector = () => {
        window.copilotDetector.reset();
        window.quickDetector.reset();
        window.experimentalDetector.reset();
        console.log('🔄 All detectors reset');
    };
    
    // Experimental detector console shortcuts
    window.getExperimentalReport = () => window.experimentalDetector.printReport();
    window.toggleExperimental = () => window.experimentalDetector.toggle();
    
    // NEW: Untrusted event forensics
    window.getUntrustedHistory = () => {
        const history = window.experimentalDetector.state.untrustedHistory || [];
        const byType = window.experimentalDetector.state.untrustedEvents || {};
        
        console.log('%c\n══════════════════════════════════════════════════════', 'color: #e74c3c');
        console.log('%c  ⚠️ UNTRUSTED EVENT FORENSICS', 'color: #e74c3c; font-weight: bold; font-size: 14px');
        console.log('%c══════════════════════════════════════════════════════', 'color: #e74c3c');
        
        console.log(`\n%c  Total Untrusted: ${window.experimentalDetector.state.totalUntrusted}`, 
            'color: #e74c3c; font-weight: bold');
        
        if (Object.keys(byType).length > 0) {
            console.log('\n%c  By Event Type:', 'color: #e67e22; font-weight: bold');
            console.table(byType);
        }
        
        if (history.length > 0) {
            console.log('\n%c  Event History (most recent):', 'color: #e67e22; font-weight: bold');
            console.table(history.slice(-10).map(h => ({
                Time: h.timestamp,
                Type: h.type,
                Target: `${h.target}${h.id ? '#'+h.id : ''}`,
                Coords: h.x !== undefined ? `(${h.x},${h.y})` : '-',
                Key: h.key || '-'
            })));
        } else {
            console.log('\n%c  No untrusted events recorded yet.', 'color: gray');
        }
        
        console.log('%c══════════════════════════════════════════════════════\n', 'color: #e74c3c');
        
        return { total: window.experimentalDetector.state.totalUntrusted, byType, history };
    };
    
    // Combined full report
    window.getFullReport = () => {
        const main = window.copilotDetector.getReport();
        const typing = window.copilotDetector.getTypingReport();
        const exp = window.experimentalDetector.getReport();
        
        // Calculate combined score
        const combinedScore = Math.min(
            main.score * 0.7 + exp.experimentalScore * 0.3,
            100
        );
        
        console.log('%c\n╔═══════════════════════════════════════════════════════════╗', 'color: #e74c3c');
        console.log('%c║           FULL COPILOT DETECTION REPORT                    ║', 'color: #e74c3c; font-weight: bold');
        console.log('%c╚═══════════════════════════════════════════════════════════╝', 'color: #e74c3c');
        
        const scoreColor = combinedScore >= 60 ? 'color: red; font-weight: bold; font-size: 16px' :
                          combinedScore >= 35 ? 'color: orange; font-weight: bold; font-size: 16px' :
                          'color: green; font-weight: bold; font-size: 16px';
        
        console.log(`%c\n  COMBINED SCORE: ${combinedScore.toFixed(1)}%\n`, scoreColor);
        console.log(`  Main Score: ${main.score.toFixed(1)}% (${main.verdict})`);
        console.log(`  Experimental Score: ${exp.experimentalScore}%`);
        console.log(`  Confidence: ${main.confidence}`);
        
        console.log('\n%c── MAIN METRICS ──', 'color: #3498db; font-weight: bold');
        console.table({
            'No-Move Click Ratio': (main.metrics.noMovementClickRatio * 100).toFixed(0) + '%',
            'Center Click Ratio': (main.metrics.centerClickRatio * 100).toFixed(0) + '%',
            'Focus Jump Ratio': (main.metrics.focusJumpRatio * 100).toFixed(0) + '%',
            'Input Injection Ratio': (main.metrics.inputInjectionRatio * 100).toFixed(0) + '%',
            'Multi-Char Input Ratio': (main.metrics.multiCharInputRatio * 100).toFixed(0) + '%',
            'Suspicious Insertions': main.metrics.suspiciousInsertions,
            'Paste Events': main.metrics.pasteInsertions
        });
        
        console.log('\n%c── TYPING ANALYSIS ──', 'color: #3498db; font-weight: bold');
        console.table({
            'Typing Speed': typing.typingSpeed.cps?.toFixed(1) + ' CPS',
            'Speed Verdict': typing.typingSpeed.verdict,
            'Keydown/Keyup Ratio': typing.keyEventRatio.ratio?.toFixed(2),
            'Ratio Verdict': typing.keyEventRatio.verdict,
            'Key Hold Duration': typing.keyHoldDuration.avg?.toFixed(0) + 'ms',
            'Hold Verdict': typing.keyHoldDuration.verdict
        });
        
        console.log('\n%c── EXPERIMENTAL ──', 'color: #9b59b6; font-weight: bold');
        console.table({
            'Event Seq Mismatch': exp.eventSequence.mismatchRatio,
            'Seq Verdict': exp.eventSequence.verdict,
            'Short Dwell Ratio': exp.dwellTime.shortDwellRatio,
            'Dwell Verdict': exp.dwellTime.verdict,
            'Float Coordinates': exp.floatCoordinates.count,
            'Suspicious Pauses': exp.performance.suspiciousPauses,
            'Copilot PostMsg': exp.postMessage.copilotDetected ? 'YES' : 'NO'
        });
        
        // v1.1 NEW PLUGINS
        console.log('\n%c── v1.1 PLUGINS ──', 'color: #e67e22; font-weight: bold');
        console.table({
            'Click Duration': exp.clickDuration.verdict,
            'Zero Clicks': exp.clickDuration.zeroClickRatio,
            'Stroke Analysis': exp.strokeAnalysis.verdict,
            'Straight Strokes': exp.strokeAnalysis.straightRatio,
            'Untrusted Events': exp.untrustedEvents.total,
            'Clipboard Pastes': exp.clipboard.pasteCount
        });
        
        console.log('%c\n═══════════════════════════════════════════════════════════\n', 'color: #e74c3c');
        
        return { main, typing, experimental: exp, combinedScore };
    };
    
    // Print welcome message
    console.log('%c═══════════════════════════════════════════════════════════', 'color: #4a90d9');
    console.log('%c  🔍 COPILOT ACTIONS DETECTOR v1.4 - ACTIVE', 'color: #4a90d9; font-weight: bold; font-size: 14px');
    console.log('%c═══════════════════════════════════════════════════════════', 'color: #4a90d9');
    console.log('%c  Detecting: Mouse, Clicks, Typing, Focus, Scroll patterns', 'color: gray');
    console.log('%c  🧪 Experimental v1.1: Seq|Dwell|Float|Perf|PostMsg', 'color: #9b59b6');
    console.log('%c  🆕 v1.1 Plugins: ClickDur|Stroke|Untrust|Clipboard', 'color: #e67e22');
    console.log('%c  Reports every 5 seconds automatically', 'color: gray');
    console.log('');
    console.log('%c  Core commands:', 'color: #4a90d9; font-weight: bold');
    console.log('    getCopilotReport()    - Main detection report');
    console.log('    getTypingReport()     - Typing analysis');
    console.log('    getFullReport()       - Combined full report');
    console.log('');
    console.log('%c  Fingerprint commands:', 'color: #e67e22; font-weight: bold');
    console.log('    exportFingerprint()   - Full fingerprint with tiers');
    console.log('    getSignature()        - One-line signature');
    console.log('    getBehaviorFingerprint() - Raw fingerprint object');
    console.log('');
    console.log('%c  Experimental commands:', 'color: #9b59b6; font-weight: bold');
    console.log('    getExperimentalReport() - All experimental metrics');
    console.log('    toggleExperimental()    - Enable/disable experiments');
    console.log('    getUntrustedHistory()   - 🆕 Forensic untrusted events');
    console.log('');
    console.log('%c  Control:', 'color: gray');
    console.log('    stopCopilotDetector() - Stop & export fingerprint');
    console.log('    resetCopilotDetector()- Reset all data');
    console.log('%c═══════════════════════════════════════════════════════════', 'color: #4a90d9');
    
})(typeof window !== 'undefined' ? window : this);
