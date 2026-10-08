/**
 * AI Agent Detection Module
 * Detects various AI agents and browser extensions that might be automating the page
 */

import { isNativeFunction } from './utils/functionUtils.js';

// ============================================================
// MANUS AGENT DETECTION CONSTANTS
// Used for extension detection
// ============================================================
const MANUS_AGENT_SIGNATURES = {
    // Chrome extension ID for Manus agent
    MANUS_EXTENSION_ID: "mljmkmodkfigdopcpgboaalildgijkoc",
    // Known web-accessible resource in the extension
    MANUS_KNOWN_RESOURCE: "content.ts.js",
    // DOM element ID injected by Manus Browser/Cloud agent
    MANUS_DOM_ELEMENT_ID: "manus-action-mask-host",
    // Attribute on document.head injected by Manus Cloud helper
    MANUS_HELPER_READY_ATTR: "manus-helper-ready"
};

// ============================================================
// CLAUDE AGENT DETECTION CONSTANTS
// Used for detecting Claude browser extension/agent
// ============================================================
const CLAUDE_AGENT_SIGNATURES = {
    // DOM element IDs injected by Claude agent when operating
    CLAUDE_GLOW_BORDER_ID: "claude-agent-glow-border",
    CLAUDE_STOP_BUTTON_ID: "claude-agent-stop-button",
    // Additional IDs observed in commercial anti-bot vendors' agent modules:
    // - animation styles <style> element (DataDome 5.10.8, report code "cld")
    // - stop container div (PerimeterX 2026 FB(), signal PX12729)
    CLAUDE_ANIMATION_STYLES_ID: "claude-agent-animation-styles",
    CLAUDE_STOP_CONTAINER_ID: "claude-agent-stop-container"
};

/**
 * Agent artefacts recovered by reverse-engineering the client bundles of two
 * commercial anti-bot vendors (DataDome 5.10.8, PerimeterX 2026). Each entry is
 * a DOM id / attribute / window global that only the named agent injects.
 */
const VENDOR_AGENT_SIGNATURES = {
    // OpenAI Codex agent - PerimeterX PX12818 / PX12812, DataDome ct[454]
    CODEX_IDS: ["codex-agent-overlay-root", "codex-browser-sidebar-comments-root"],
    // SIGMA agent - PerimeterX PX12735 requires BOTH global and element
    SIGMA_GLOBAL: "__SIGMA__",
    SIGMA_ELEMENT_ID: "__gradient_border_wrapper__",
    // Cursor IDE agent - PerimeterX PX12732
    CURSOR_GLOBAL: "__cursorDialogConfig",
    // Jetski - PerimeterX PX12731 (attribute on <html>)
    JETSKI_ATTR: "data-jetski-tab-id",
    // Thunderbit extension - DataDome (report code "tbov")
    THUNDERBIT_IDS: ["thunderbit-crx-scout-overlay", "thunderbit-crx-side-bar"],
    // browser-use DOM highlights - DataDome (report code "busH")
    BROWSER_USE_ATTRS: [
        "data-browser-use-highlight",
        "data-browser-use-interaction-highlight",
        "data-browser-use-coordinate-highlight"
    ],
    // Genspark overlay cursor style - PerimeterX PX12760
    GENSPARK_CURSOR_STYLE_ID: "gs-overlay-cursor-style",
    // Manus - PerimeterX PX12683
    MANUS_POSTMESSAGE_GLOBAL: "__manusOriginalPostMessage",
    // Skyvern auxiliary globals - PerimeterX PX12696
    SKYVERN_GLOBALS: ["globalOneTimeIncrementElements", "globalDomDepthMap"],
    // Patched-native-function source markers (PerimeterX PX12694 / PX12705).
    // A stealth patch that re-implements a native function leaves its own
    // source - including comments - visible to Function.prototype.toString.
    PATCHED_LISTENER_MARKER: "data-has-interactive-listener",
    PATCHED_WEBGL_EXT_MARKER: "// Ensure WEBGL_debug_renderer_info is always included"
};

// ============================================================
// EARLY CONSOLE HOOK FOR BROWSER-USE DETECTION
// This must run immediately at module load to capture console
// messages before any agent detection runs.
// 
// IMPORTANT: We store original native console methods BEFORE hooking
// so that FunctionIntegrityDetector can access them and not
// flag our own hooks as tampering.
// ============================================================
(function installBrowserUseConsoleHookEarly() {
    if (typeof window === 'undefined') return;
    if (window.__browserUseDetectorInstalled) return;
    
    try {
        // Store ORIGINAL native console methods before any modification
        const orig = {
            log: console.log,
            info: console.info,
            warn: console.warn,
            error: console.error,
            debug: console.debug,
            trace: console.trace,
        };
        
        // Expose original methods for FunctionIntegrityDetector
        window.__nativeConsoleMethods = orig;
        
        // Signature marker to identify our own hook
        const OUR_HOOK_SIGNATURE = '__agentDetectorConsoleHook__';

        const capture = (kind, args) => {
            // Skip if already detected to avoid spam
            if (window.__browserUseAlreadyDetected) return;
            
            let stack = "";
            try {
                stack = new Error().stack || "";
            } catch {}

            const text = args.map(a => {
                try { 
                    return typeof a === "string" ? a : JSON.stringify(a); 
                } catch { 
                    return String(a); 
                }
            }).join(" ");

            // Heuristics for browser-use detection
            const looksLikeBrowserUse =
                /browser-use highlight/i.test(text) ||
                /browser-use-debug-highlights/i.test(text) ||
                /\bRemoving\b.*\bbrowser-use\b/i.test(text);

            const looksLikeEvaluatedCode =
                /\bVM\d+:\d+\b/.test(stack) ||
                /<anonymous>/.test(stack) ||
                /eval/.test(stack);

            if (looksLikeBrowserUse && looksLikeEvaluatedCode) {
                // Mark as detected to prevent duplicate events
                window.__browserUseAlreadyDetected = true;
                
                // Build detection result in same format as other detectors
                const detectionResult = {
                    name: 'BrowserUse',
                    detected: true,
                    timestamp: Date.now(),
                    confidence: 0.95,
                    detectionMethod: 'Console Message + Stack Classification (browser-use highlight)',
                    primarySignal: 'BrowserUse_Console_Hook',
                    indicators: [
                        {
                            name: 'BrowserUse_Console_Signal',
                            description: 'browser-use console message captured',
                            value: text.substring(0, 100) + (text.length > 100 ? '...' : '')
                        },
                        {
                            name: 'BrowserUse_Eval_Stack',
                            description: 'Console message from evaluated/VM code',
                            value: /\bVM\d+:\d+\b/.test(stack) ? 'VM context' : 
                                   (/eval/.test(stack) ? 'eval context' : 'anonymous context')
                        }
                    ]
                };
                
                // Store for later access
                window.__botSignals = window.__botSignals || {};
                window.__botSignals.browserUseDetection = detectionResult;
                
                // Dispatch event with full detection result
                try {
                    window.dispatchEvent(new CustomEvent('agentDetected', {
                        detail: detectionResult
                    }));
                } catch {}
            }
        };

        // Install hooks
        for (const kind of ["log", "info", "warn", "error"]) {
            const hookedFn = function (...args) {
                try { capture(kind, args); } catch {}
                return orig[kind].apply(this, args);
            };
            hookedFn[OUR_HOOK_SIGNATURE] = true;
            hookedFn.__originalNativeMethod = orig[kind];
            console[kind] = hookedFn;
        }
        
        window.__browserUseDetectorInstalled = true;
        window.__agentDetectorHookSignature = OUR_HOOK_SIGNATURE;
    } catch (error) {
        // Silent fail
    }
})();

// ============================================================
// EARLY DOM OBSERVER FOR CLAUDE AGENT DETECTION
// This must run immediately at module load to detect Claude agent
// elements that may be injected at any time (not just page load).
// Uses MutationObserver to watch for specific element IDs.
// ============================================================
(function installClaudeAgentDOMObserverEarly() {
    if (typeof window === 'undefined') return;
    if (typeof document === 'undefined') return;
    if (window.__claudeAgentDetectorInstalled) return;
    
    try {
        const CLAUDE_ELEMENT_IDS = [
            'claude-agent-glow-border',
            'claude-agent-stop-button'
        ];
        
        // Function to check for Claude agent elements
        const checkForClaudeElements = () => {
            // Skip if already detected to avoid duplicate events
            if (window.__claudeAgentAlreadyDetected) return null;
            
            const foundElements = [];
            for (const elementId of CLAUDE_ELEMENT_IDS) {
                const element = document.getElementById(elementId);
                if (element) {
                    foundElements.push({
                        id: elementId,
                        tagName: element.tagName,
                        outerHTML: element.outerHTML.substring(0, 150) + (element.outerHTML.length > 150 ? '...' : '')
                    });
                }
            }
            
            if (foundElements.length > 0) {
                // Mark as detected to prevent duplicate events
                window.__claudeAgentAlreadyDetected = true;
                
                // Build detection result in same format as other detectors
                const detectionResult = {
                    name: 'ClaudeAgent',
                    detected: true,
                    timestamp: Date.now(),
                    confidence: 0.95,
                    detectionMethod: 'DOM Element Detection via MutationObserver',
                    primarySignal: 'Claude_DOM_Element',
                    indicators: foundElements.map(el => ({
                        name: `Claude_${el.id.replace(/-/g, '_')}`,
                        description: `Claude agent element detected: ${el.id}`,
                        value: el.outerHTML
                    }))
                };
                
                // Store for later access
                window.__botSignals = window.__botSignals || {};
                window.__botSignals.claudeAgentDetection = detectionResult;
                
                // Dispatch event with full detection result
                try {
                    window.dispatchEvent(new CustomEvent('agentDetected', {
                        detail: detectionResult
                    }));
                } catch {}
                
                return detectionResult;
            }
            
            return null;
        };
        
        // Check immediately in case elements already exist
        checkForClaudeElements();
        
        // Set up MutationObserver to watch for future DOM changes
        const observer = new MutationObserver((mutations) => {
            // Skip if already detected
            if (window.__claudeAgentAlreadyDetected) return;
            
            // Check if any mutation might have added our target elements
            for (const mutation of mutations) {
                if (mutation.type === 'childList' && mutation.addedNodes.length > 0) {
                    for (const node of mutation.addedNodes) {
                        if (node.nodeType === Node.ELEMENT_NODE) {
                            // Check if this node or any descendant has our target IDs
                            const hasTargetId = CLAUDE_ELEMENT_IDS.some(id => 
                                node.id === id || (node.querySelector && node.querySelector(`#${id}`))
                            );
                            
                            if (hasTargetId) {
                                checkForClaudeElements();
                                return;
                            }
                        }
                    }
                }
            }
        });
        
        // Start observing once document is ready
        const startObserving = () => {
            if (document.body) {
                observer.observe(document.body, {
                    childList: true,
                    subtree: true
                });
            } else {
                // Wait for body to be available
                const bodyObserver = new MutationObserver(() => {
                    if (document.body) {
                        bodyObserver.disconnect();
                        observer.observe(document.body, {
                            childList: true,
                            subtree: true
                        });
                    }
                });
                bodyObserver.observe(document.documentElement, { childList: true });
            }
        };
        
        if (document.readyState === 'loading') {
            document.addEventListener('DOMContentLoaded', startObserving);
        } else {
            startObserving();
        }
        
        window.__claudeAgentDetectorInstalled = true;
        window.__checkClaudeAgentElements = checkForClaudeElements; // Expose for manual check
    } catch (error) {
        // Silent fail
    }
})();

class AIAgentDetector {
    constructor() {
        this.detectedAgents = new Set();
        this.detectionResults = [];
        this.isRunning = false;
    }

    /**
     * Run all available agent detectors
     */
    async runAllDetections() {
        if (this.isRunning) return this.detectionResults;
        
        this.isRunning = true;
        console.log('🕵️ Starting AI Agent Detection...');
        
        const detectors = [
            { name: 'ManusBrowser', detector: this.detectManusBrowser },
            { name: 'ManusExtension', detector: this.detectManusExtension },
            { name: 'Comet', detector: this.detectCometAIAgent },
            { name: 'Genspark', detector: this.detectGenspark },
            { name: 'Skyvern', detector: this.detectSkyvern },
            { name: 'ChatGPTBrowser', detector: this.detectChatGPTBrowser },
            { name: 'Fellou', detector: this.detectFellouBrowser },
            { name: 'HyperBrowser', detector: this.detectHyperBrowser },
            { name: 'BrowserUse', detector: this.detectBrowserUse },
            { name: 'ClaudeAgent', detector: this.detectClaudeAgent },
            // Agent artefacts recovered from DataDome 5.10.8 / PerimeterX 2026
            { name: 'CodexAgent', detector: this.detectCodexAgent },
            { name: 'SigmaAgent', detector: this.detectSigmaAgent },
            { name: 'CursorAgent', detector: this.detectCursorAgent },
            { name: 'JetskiAgent', detector: this.detectJetskiAgent },
            { name: 'Thunderbit', detector: this.detectThunderbit },
            { name: 'PatchedNativeFunctions', detector: this.detectPatchedNativeFunctions },
            // Add more detectors here as they're implemented
            { name: 'Selenium', detector: this.detectSelenium },
            { name: 'Puppeteer', detector: this.detectPuppeteer },
            { name: 'Playwright', detector: this.detectPlaywright },
            { name: 'DevTools', detector: this.detectDevTools },
        ];

        const detectionPromises = detectors.map(async ({ name, detector }) => {
            try {
                const detectionResult = await detector.call(this);
                
                // Handle both old format (boolean) and new format (object with indicators)
                let detected, indicators = [], confidence = 0.0, primarySignal = null;
                if (typeof detectionResult === 'boolean') {
                    detected = detectionResult;
                } else if (detectionResult && typeof detectionResult === 'object') {
                    detected = detectionResult.detected;
                    indicators = detectionResult.indicators || [];
                    // Use returned confidence if available, otherwise calculate based on agent type
                    confidence = detectionResult.confidence || 0.0;
                    primarySignal = detectionResult.primarySignal || null;
                } else {
                    detected = false;
                }
                
                // Calculate confidence based on detection method and agent type (only if not already set)
                if (detected && confidence === 0.0) {
                    switch (name) {
                        case 'ManusBrowser':
                            confidence = 0.98; // Very high confidence - unique DOM element
                            break;
                        case 'ManusExtension':
                            confidence = 0.95; // High confidence - extension resource detection
                            break;
                        case 'Comet':
                            confidence = 0.85; // Very high confidence - CSS fingerprinting is robust
                            break;
                        case 'Genspark':
                            confidence = 0.95; // Very high confidence - unique DOM element
                            break;
                        case 'Skyvern':
                            confidence = 0.95; // Very high confidence - unique window property
                            break;
                        case 'ChatGPTBrowser':
                            confidence = 0.95; // Very high confidence - console.log signature analysis
                            break;
                        case 'Fellou':
                            confidence = 0.95; // Very high confidence - unique window property
                            break;
                        case 'HyperBrowser':
                            confidence = 0.90; // High confidence - console.log wrapper signature
                            break;
                        case 'BrowserUse':
                            confidence = 0.92; // High confidence - console message + stack analysis
                            break;
                        case 'ClaudeAgent':
                            confidence = 0.95; // Very high confidence - unique DOM element IDs
                            break;
                        case 'CodexAgent':
                            confidence = 0.96; // Very high confidence - unique DOM element IDs
                            break;
                        case 'SigmaAgent':
                            confidence = 0.96; // Very high confidence - global AND element both required
                            break;
                        case 'CursorAgent':
                            confidence = 0.93; // High confidence - unique window global
                            break;
                        case 'JetskiAgent':
                            confidence = 0.93; // High confidence - unique documentElement attribute
                            break;
                        case 'Thunderbit':
                            confidence = 0.94; // High confidence - unique extension overlay IDs
                            break;
                        case 'PatchedNativeFunctions':
                            confidence = 0.90; // High confidence - native function source rewritten
                            break;
                        case 'Selenium':
                            confidence = 0.95; // Very high confidence - multiple artifact validation
                            break;
                        case 'Puppeteer':
                            confidence = 0.88; // High confidence - comprehensive headless detection
                            break;
                        case 'Playwright':
                            confidence = 0.92; // Very high confidence - specific framework detection
                            break;
                        case 'DevTools':
                            confidence = 0.90; // High confidence - CDP Runtime detection
                            break;
                        default:
                            confidence = 0.8; // Default high confidence for detected agents
                    }
                }
                
                const result = {
                    name,
                    detected,
                    timestamp: Date.now(),
                    confidence: confidence,
                    detectionMethod: this._getDetectionMethod(name),
                    indicators: indicators,
                    primarySignal: primarySignal
                };
                
                if (detected) {
                    this.detectedAgents.add(name);
                    const indicatorNames = indicators.map(ind => ind.name).join(', ');
                    const signalInfo = primarySignal ? ` [${primarySignal}]` : '';
                    console.log(`✅ ${name} agent detected with ${(confidence * 100).toFixed(1)}% confidence${signalInfo}${indicatorNames ? ` (indicators: ${indicatorNames})` : ''}`);
                    
                    // Dispatch agentDetected event for the overlay and UI updates
                    try {
                        window.dispatchEvent(new CustomEvent('agentDetected', {
                            detail: result
                        }));
                    } catch (e) {
                        // Silent fail if event dispatch fails
                    }
                } else {
                    console.log(`❌ ${name} agent not detected`);
                }
                
                return result;
            } catch (error) {
                console.warn(`⚠️ Error detecting ${name}:`, error);
                return {
                    name,
                    detected: false,
                    error: error.message,
                    timestamp: Date.now(),
                    confidence: 0.0,
                    detectionMethod: this._getDetectionMethod(name),
                    indicators: []
                };
            }
        });

        this.detectionResults = await Promise.all(detectionPromises);
        this.isRunning = false;
        
        console.log('🕵️ AI Agent Detection complete:', this.detectionResults);
        return this.detectionResults;
    }

    /**
     * Detect Manus Browser/Cloud Agent via DOM element
     * 
     * Manus injects a div with id="manus-action-mask-host" into the page
     * and/or adds "manus-helper-ready" attribute to document.head
     * This is a very reliable detection method for the cloud agent.
     * 
     * @returns {Object} Detection result with status and indicators
     */
    async detectManusBrowser() {
        const indicators = [];
        
        try {
            // Check for manus-action-mask-host DOM element
            const manusElement = document.getElementById(MANUS_AGENT_SIGNATURES.MANUS_DOM_ELEMENT_ID);
            
            if (manusElement) {
                indicators.push({
                    name: 'Manus_Action_Mask_Host',
                    description: 'Manus action mask host element detected in DOM',
                    value: manusElement.outerHTML.substring(0, 150) + '...'
                });
            }
            
            // Check for manus-helper-ready attribute on document.head (Manus Cloud)
            if (document.head && document.head.hasAttribute(MANUS_AGENT_SIGNATURES.MANUS_HELPER_READY_ATTR)) {
                indicators.push({
                    name: 'Manus_Helper_Ready',
                    description: 'Manus Cloud helper attribute detected on document.head',
                    value: document.head.getAttribute(MANUS_AGENT_SIGNATURES.MANUS_HELPER_READY_ATTR) || 'present'
                });
                console.log("Manus helper detected");
            }

            // Manus patches window.postMessage and keeps the original on a global
            // (PerimeterX PX12683) - present even when no Manus DOM element exists.
            if (typeof window[VENDOR_AGENT_SIGNATURES.MANUS_POSTMESSAGE_GLOBAL] !== 'undefined') {
                indicators.push({
                    name: 'Manus_Original_PostMessage',
                    description: 'Manus global window.' + VENDOR_AGENT_SIGNATURES.MANUS_POSTMESSAGE_GLOBAL +
                        ' present (postMessage patched by Manus)',
                    value: typeof window[VENDOR_AGENT_SIGNATURES.MANUS_POSTMESSAGE_GLOBAL]
                });
            }

            if (indicators.length > 0) {
                console.log("Manus Browser detected via DOM element/attribute");
                
                return {
                    detected: true,
                    confidence: 0.98,
                    indicators,
                    primarySignal: indicators[0].name
                };
            }
            
            return {
                detected: false,
                confidence: 0.0,
                indicators: [],
                primarySignal: null
            };
        } catch (error) {
            console.debug('Error in Manus Browser detection:', error);
            return {
                detected: false,
                confidence: 0.0,
                indicators: [],
                error: error.message
            };
        }
    }

    /**
     * Detect Manus Extension via resource fetch
     * 
     * Only runs on Chrome 128.x.x where extension resources may be accessible
     * without triggering console errors. On other versions, this detection
     * is skipped to avoid noisy console errors.
     * 
     * @returns {Object} Detection result with status and indicators
     */
    async detectManusExtension() {
        const indicators = [];
        
        // ============================================================
        // OLD IMPLEMENTATION - COMMENTED OUT FOR ROLLBACK PURPOSES
        // ============================================================
        // const extensionID = "mljmkmodkfigdopcpgboaalildgijkoc";
        // const knownResource = "content.ts.js";
        // const url = `chrome-extension://${extensionID}/${knownResource}`;
        // 
        // try {
        //     const response = await fetch(url, { method: "GET" });
        //     if (response.status === 200) {
        //         console.log("Manus extension detected via fetch");
        //         return true;
        //     } else {
        //         console.log("Manus extension not detected");
        //         return false;
        //     }
        // } catch (err) {
        //     console.log("Manus extension not detected (fetch error):", err.message);
        //     return false;
        // }
        // ============================================================
        // END OLD IMPLEMENTATION
        // ============================================================

        try {
            // Only run in Chrome-based browsers
            if (!navigator.userAgentData) {
                return {
                    detected: false,
                    confidence: 0.0,
                    indicators: [],
                    primarySignal: null
                };
            }

            // Check Chrome version - only run on 128.x.x to avoid console errors
            const uaData = navigator.userAgent;
            const chromeVersionMatch = uaData.match(/Chrome\/(\d+)\./);
            
            if (!chromeVersionMatch) {
                return {
                    detected: false,
                    confidence: 0.0,
                    indicators: [],
                    primarySignal: null
                };
            }
            
            const majorVersion = parseInt(chromeVersionMatch[1], 10);
            
            // Only run extension check on Chrome 128
            // Other versions will show console errors when probing extensions
            if (majorVersion !== 128) {
                console.debug(`Manus extension check skipped - Chrome ${majorVersion} (only runs on 128)`);
                return {
                    detected: false,
                    confidence: 0.0,
                    indicators: [],
                    primarySignal: null
                };
            }

            const extensionUrl = `chrome-extension://${MANUS_AGENT_SIGNATURES.MANUS_EXTENSION_ID}/${MANUS_AGENT_SIGNATURES.MANUS_KNOWN_RESOURCE}`;
            
            const response = await fetch(extensionUrl, { method: 'HEAD' });
            
            if (response.ok || response.status === 200) {
                indicators.push({
                    name: 'Manus_Extension_Resource',
                    description: 'Manus extension resource successfully fetched',
                    value: extensionUrl
                });
                console.log("Manus extension detected via resource fetch");
                return {
                    detected: true,
                    confidence: 0.95,
                    indicators,
                    primarySignal: 'Manus_Extension_Fetch'
                };
            }
            
            return {
                detected: false,
                confidence: 0.0,
                indicators: [],
                primarySignal: null
            };
            
        } catch (e) {
            // Extension not found or not accessible
            return {
                detected: false,
                confidence: 0.0,
                indicators: [],
                primarySignal: null
            };
        }
    }

    /**
     * Detect Claude AI Agent via DOM elements
     * 
     * Claude agent injects specific DOM elements when operating:
     * - claude-agent-glow-border: Visual border indicator
     * - claude-agent-stop-button: Control button for stopping agent
     * 
     * This detection works both at runtime and via early MutationObserver
     * hook (installed at module load) to catch elements that appear after
     * page load when user activates the Claude extension.
     * 
     * @returns {Object} Detection result with status and indicators
     */
    async detectClaudeAgent() {
        const indicators = [];
        
        try {
            // Check if early DOM observer already captured Claude agent
            if (window.__botSignals?.claudeAgentDetection) {
                return window.__botSignals.claudeAgentDetection;
            }
            
            // Manual check for Claude agent elements
            const claudeGlowBorder = document.getElementById(CLAUDE_AGENT_SIGNATURES.CLAUDE_GLOW_BORDER_ID);
            const claudeStopButton = document.getElementById(CLAUDE_AGENT_SIGNATURES.CLAUDE_STOP_BUTTON_ID);
            
            if (claudeGlowBorder) {
                indicators.push({
                    name: 'Claude_Agent_Glow_Border',
                    description: 'Claude agent glow border element detected in DOM',
                    value: claudeGlowBorder.outerHTML.substring(0, 150) + (claudeGlowBorder.outerHTML.length > 150 ? '...' : '')
                });
            }
            
            if (claudeStopButton) {
                indicators.push({
                    name: 'Claude_Agent_Stop_Button',
                    description: 'Claude agent stop button element detected in DOM',
                    value: claudeStopButton.outerHTML.substring(0, 150) + (claudeStopButton.outerHTML.length > 150 ? '...' : '')
                });
            }

            // Additional Claude artefacts shipped by commercial anti-bot vendors.
            // The animation-styles <style> persists once injected; the stop
            // container only exists while the agent is actively acting.
            const claudeAnimationStyles = document.getElementById(CLAUDE_AGENT_SIGNATURES.CLAUDE_ANIMATION_STYLES_ID);
            const claudeStopContainer = document.getElementById(CLAUDE_AGENT_SIGNATURES.CLAUDE_STOP_CONTAINER_ID);

            if (claudeAnimationStyles) {
                indicators.push({
                    name: 'Claude_Agent_Animation_Styles',
                    description: 'Claude agent animation <style> element detected in DOM',
                    value: claudeAnimationStyles.outerHTML.substring(0, 150) + (claudeAnimationStyles.outerHTML.length > 150 ? '...' : '')
                });
            }

            if (claudeStopContainer) {
                indicators.push({
                    name: 'Claude_Agent_Stop_Container',
                    description: 'Claude agent stop container element detected in DOM (agent is actively running)',
                    value: claudeStopContainer.outerHTML.substring(0, 150) + (claudeStopContainer.outerHTML.length > 150 ? '...' : '')
                });
            }

            if (indicators.length > 0) {
                console.log("Claude Agent detected via DOM element(s)");
                
                // Mark as detected for the early observer
                window.__claudeAgentAlreadyDetected = true;
                
                const result = {
                    detected: true,
                    confidence: 0.95,
                    indicators,
                    primarySignal: indicators[0].name
                };
                
                // Store for consistency with early observer
                window.__botSignals = window.__botSignals || {};
                window.__botSignals.claudeAgentDetection = result;
                
                return result;
            }
            
            return {
                detected: false,
                confidence: 0.0,
                indicators: [],
                primarySignal: null
            };
        } catch (error) {
            console.debug('Error in Claude Agent detection:', error);
            return {
                detected: false,
                confidence: 0.0,
                indicators: [],
                error: error.message
            };
        }
    }

    /**
     * Detect OpenAI Codex agent.
     * Element IDs shipped by BOTH DataDome 5.10.8 and PerimeterX 2026
     * (PX12818 codex-agent-overlay-root, PX12812 codex-browser-sidebar-comments-root).
     * Vendors delay this check ~500ms because the overlay mounts after load, so the
     * periodic re-run of runAllDetections() is what catches a late mount.
     */
    async detectCodexAgent() {
        const indicators = [];
        try {
            for (const id of VENDOR_AGENT_SIGNATURES.CODEX_IDS) {
                const el = document.getElementById(id);
                if (el) {
                    indicators.push({
                        name: 'Codex_Agent_Element',
                        description: 'OpenAI Codex agent element "' + id + '" detected in DOM',
                        value: el.outerHTML.substring(0, 150) + (el.outerHTML.length > 150 ? '...' : '')
                    });
                }
            }
            if (indicators.length > 0) {
                console.log('OpenAI Codex agent detected via DOM element(s)');
                return { detected: true, confidence: 0.96, indicators, primarySignal: indicators[0].name };
            }
            return { detected: false, confidence: 0.0, indicators: [], primarySignal: null };
        } catch (error) {
            console.debug('Error in Codex agent detection:', error);
            return { detected: false, confidence: 0.0, indicators: [], error: error.message };
        }
    }

    /**
     * Detect SIGMA agent (PerimeterX PX12735).
     * Requires BOTH the window global and the element - the vendor deliberately
     * ANDs them, which keeps the false-positive rate down.
     */
    async detectSigmaAgent() {
        const indicators = [];
        try {
            const hasGlobal = typeof window[VENDOR_AGENT_SIGNATURES.SIGMA_GLOBAL] !== 'undefined';
            const el = document.getElementById(VENDOR_AGENT_SIGNATURES.SIGMA_ELEMENT_ID);

            if (hasGlobal && el) {
                indicators.push({
                    name: 'SIGMA_Global_And_Element',
                    description: 'SIGMA agent detected: window.' + VENDOR_AGENT_SIGNATURES.SIGMA_GLOBAL +
                        ' present AND element "' + VENDOR_AGENT_SIGNATURES.SIGMA_ELEMENT_ID + '" in DOM',
                    value: el.outerHTML.substring(0, 150) + (el.outerHTML.length > 150 ? '...' : '')
                });
                console.log('SIGMA agent detected (global + element)');
                return { detected: true, confidence: 0.96, indicators, primarySignal: indicators[0].name };
            }
            return { detected: false, confidence: 0.0, indicators: [], primarySignal: null };
        } catch (error) {
            console.debug('Error in SIGMA agent detection:', error);
            return { detected: false, confidence: 0.0, indicators: [], error: error.message };
        }
    }

    /**
     * Detect Cursor IDE agent (PerimeterX PX12732) via window.__cursorDialogConfig
     */
    async detectCursorAgent() {
        try {
            if (typeof window[VENDOR_AGENT_SIGNATURES.CURSOR_GLOBAL] !== 'undefined') {
                console.log('Cursor agent detected via window property');
                return {
                    detected: true,
                    confidence: 0.93,
                    indicators: [{
                        name: 'Cursor_Dialog_Config',
                        description: 'Cursor agent global window.' + VENDOR_AGENT_SIGNATURES.CURSOR_GLOBAL + ' present',
                        value: VENDOR_AGENT_SIGNATURES.CURSOR_GLOBAL
                    }],
                    primarySignal: 'Cursor_Dialog_Config'
                };
            }
            return { detected: false, confidence: 0.0, indicators: [], primarySignal: null };
        } catch (error) {
            console.debug('Error in Cursor agent detection:', error);
            return { detected: false, confidence: 0.0, indicators: [], error: error.message };
        }
    }

    /**
     * Detect Jetski agent (PerimeterX PX12731) via a data attribute on <html>
     */
    async detectJetskiAgent() {
        try {
            const attr = VENDOR_AGENT_SIGNATURES.JETSKI_ATTR;
            if (document.documentElement && document.documentElement.hasAttribute(attr)) {
                console.log('Jetski agent detected via documentElement attribute');
                return {
                    detected: true,
                    confidence: 0.93,
                    indicators: [{
                        name: 'Jetski_Tab_Attribute',
                        description: 'Jetski agent attribute "' + attr + '" present on documentElement',
                        value: String(document.documentElement.getAttribute(attr)).substring(0, 100)
                    }],
                    primarySignal: 'Jetski_Tab_Attribute'
                };
            }
            return { detected: false, confidence: 0.0, indicators: [], primarySignal: null };
        } catch (error) {
            console.debug('Error in Jetski agent detection:', error);
            return { detected: false, confidence: 0.0, indicators: [], error: error.message };
        }
    }

    /**
     * Detect Thunderbit extension agent (DataDome report code "tbov")
     */
    async detectThunderbit() {
        const indicators = [];
        try {
            for (const id of VENDOR_AGENT_SIGNATURES.THUNDERBIT_IDS) {
                const el = document.getElementById(id);
                if (el) {
                    indicators.push({
                        name: 'Thunderbit_Element',
                        description: 'Thunderbit agent element "' + id + '" detected in DOM',
                        value: el.outerHTML.substring(0, 150) + (el.outerHTML.length > 150 ? '...' : '')
                    });
                }
            }
            if (indicators.length > 0) {
                console.log('Thunderbit agent detected via DOM element(s)');
                return { detected: true, confidence: 0.94, indicators, primarySignal: indicators[0].name };
            }
            return { detected: false, confidence: 0.0, indicators: [], primarySignal: null };
        } catch (error) {
            console.debug('Error in Thunderbit detection:', error);
            return { detected: false, confidence: 0.0, indicators: [], error: error.message };
        }
    }

    /**
     * Detect stealth patches by reading the SOURCE of native functions.
     * A patch that re-implements a native function leaves its own body - including
     * comments - visible to Function.prototype.toString.
     *   PerimeterX PX12694: addEventListener re-implemented with an interactive-listener tag
     *   PerimeterX PX12705: getSupportedExtensions re-implemented to force WEBGL_debug_renderer_info
     */
    async detectPatchedNativeFunctions() {
        const indicators = [];
        try {
            try {
                const listenerSrc = Function.prototype.toString.call(EventTarget.prototype.addEventListener);
                if (listenerSrc.indexOf(VENDOR_AGENT_SIGNATURES.PATCHED_LISTENER_MARKER) > -1) {
                    indicators.push({
                        name: 'Patched_addEventListener',
                        description: 'addEventListener re-implemented; source contains "' +
                            VENDOR_AGENT_SIGNATURES.PATCHED_LISTENER_MARKER + '"',
                        value: listenerSrc.substring(0, 160)
                    });
                }
            } catch (e) { /* ignore */ }

            try {
                const canvas = document.createElement('canvas');
                const gl = canvas.getContext('webgl') || canvas.getContext('experimental-webgl');
                if (gl && typeof gl.getSupportedExtensions === 'function') {
                    const extSrc = Function.prototype.toString.call(gl.getSupportedExtensions);
                    if (extSrc.indexOf(VENDOR_AGENT_SIGNATURES.PATCHED_WEBGL_EXT_MARKER) > -1) {
                        indicators.push({
                            name: 'Patched_getSupportedExtensions',
                            description: 'WebGL getSupportedExtensions re-implemented by a stealth patch',
                            value: extSrc.substring(0, 160)
                        });
                    }
                }
            } catch (e) { /* ignore */ }

            if (indicators.length > 0) {
                console.log('Patched native function(s) detected');
                return { detected: true, confidence: 0.9, indicators, primarySignal: indicators[0].name };
            }
            return { detected: false, confidence: 0.0, indicators: [], primarySignal: null };
        } catch (error) {
            console.debug('Error in patched-native-function detection:', error);
            return { detected: false, confidence: 0.0, indicators: [], error: error.message };
        }
    }

    /**
     * Detect Genspark AI Agent
     * Checks for the presence of the genspark-float-bar DOM element
     */
    async detectGenspark() {
        const indicators = [];
        try {
            const gensparkElement = document.getElementById('genspark-float-bar');
            if (gensparkElement) {
                indicators.push({
                    name: 'Genspark_Float_Bar',
                    description: 'Genspark agent element "genspark-float-bar" detected in DOM',
                    value: gensparkElement.outerHTML.substring(0, 150)
                });
            }

            // Overlay cursor style element (PerimeterX PX12760) - present while the
            // agent is driving the cursor, even when the float bar is absent.
            const cursorStyle = document.getElementById(VENDOR_AGENT_SIGNATURES.GENSPARK_CURSOR_STYLE_ID);
            if (cursorStyle) {
                indicators.push({
                    name: 'Genspark_Overlay_Cursor_Style',
                    description: 'Genspark overlay cursor style element "' +
                        VENDOR_AGENT_SIGNATURES.GENSPARK_CURSOR_STYLE_ID + '" detected in DOM',
                    value: cursorStyle.outerHTML.substring(0, 150)
                });
            }

            if (indicators.length > 0) {
                console.log('Genspark AI Agent detected via DOM element(s)');
                return { detected: true, confidence: 0.95, indicators, primarySignal: indicators[0].name };
            }
            return { detected: false, confidence: 0.0, indicators: [], primarySignal: null };
        } catch (error) {
            console.warn('Error during Genspark detection:', error);
            return { detected: false, confidence: 0.0, indicators: [], error: error.message };
        }
    }

    /**
     * Detect Comet AI Agent via CSS variable injection fingerprinting
     * Uses a robust sentinel-based approach to detect CSS variable patterns
     */
    async detectCometAIAgent() {
        try {
            // Comet AI Agent CSS variable sentinels - these are unique identifiers
            // injected by the agent's styling system
            const COMET_CSS_SENTINELS = [
                '--pale-yellow-50', '--mint-150', '--pale-cyan-200', '--pale-blue-200',
                '--hydra-350', '--hydra-450', '--umbra-350', '--terra-350',
                '--jenova-450', '--rosa-350', '--costa-400', '--altana-500'
            ];

            // Minimum number of sentinel matches required for positive detection
            // This threshold prevents false positives from accidental CSS collisions
            const DETECTION_THRESHOLD = 6;

            const detectedSentinels = this._scanCSSVariableSentinels(COMET_CSS_SENTINELS);
            const isDetected = this._evaluateDetectionScore(detectedSentinels, DETECTION_THRESHOLD);

            if (isDetected) {
                console.log('Comet AI Agent detected via CSS variable fingerprinting:', {
                    detectedSentinels: detectedSentinels.length,
                    threshold: DETECTION_THRESHOLD,
                    matches: detectedSentinels
                });
            } else {
                console.log('Comet AI Agent not detected - insufficient CSS sentinel matches:', {
                    detectedSentinels: detectedSentinels.length,
                    required: DETECTION_THRESHOLD
                });
            }

            return isDetected;
        } catch (error) {
            console.warn('Error during Comet AI Agent detection:', error);
            return false;
        }
    }

    /**
     * Scan document root for CSS variable sentinels
     * @private
     * @param {string[]} sentinels - Array of CSS variable names to check
     * @returns {Array<{variable: string, value: string}>} Found sentinels with their values
     */
    _scanCSSVariableSentinels(sentinels) {
        if (!document.documentElement) {
            throw new Error('Document element not available for CSS scanning');
        }

        const computedStyles = getComputedStyle(document.documentElement);
        const detectedSentinels = [];

        for (const sentinel of sentinels) {
            try {
                const value = computedStyles.getPropertyValue(sentinel)?.trim();
                if (value && value.length > 0) {
                    detectedSentinels.push({
                        variable: sentinel,
                        value: value
                    });
                }
            } catch (error) {
                // Individual sentinel check failed, continue with others
                console.debug(`Failed to check CSS sentinel ${sentinel}:`, error);
            }
        }

        return detectedSentinels;
    }

    /**
     * Evaluate detection score based on sentinel matches
     * @private
     * @param {Array} detectedSentinels - Array of detected sentinel objects
     * @param {number} threshold - Minimum number of matches required
     * @returns {boolean} True if detection threshold is met
     */
    _evaluateDetectionScore(detectedSentinels, threshold = 6) {
        const score = detectedSentinels.length;
        return score >= threshold;
    }

    /**
     * Detect Selenium WebDriver with proper boolean evaluation
     */
    async detectSelenium() {
        try {
            // Direct property checks with proper boolean evaluation
            if (navigator.webdriver === true) return true;
            if (window.webdriver === true) return true;
            
            // Check for Selenium-specific CDC properties
            if (typeof document.$cdc_asdjflasutopfhvcZLmcfl_ !== 'undefined') return true;
            
            // Check for other common Selenium artifacts
            const seleniumArtifacts = [
                '__webdriver_script_fn',
                '__selenium_unwrapped',
                '__webdriver_unwrapped',
                '__driver_evaluate',
                '__webdriver_evaluate'
            ];
            
            for (const artifact of seleniumArtifacts) {
                if (typeof window[artifact] !== 'undefined') {
                    return true;
                }
            }
            
            // Check Chrome runtime in a safer way
            if (window.chrome && 
                window.chrome.runtime && 
                window.chrome.runtime.onConnect &&
                typeof window.chrome.runtime.onConnect.addListener === 'function') {
                // Additional check to distinguish from normal Chrome extensions
                if (window.chrome.runtime.getManifest === undefined) {
                    return true;
                }
            }
            
            return false;
        } catch (error) {
            console.debug('Error in Selenium detection:', error);
            return false;
        }
    }

    /**
     * Detect Puppeteer automation with comprehensive checks
     * @returns {Object} Detection result with status and triggered indicators
     */
    async detectPuppeteer() {
        const indicators = [];
        
        try {
            // Check for navigator.webdriver being explicitly true
            if (navigator.webdriver === true) {
                indicators.push({
                    name: 'navigator.webdriver',
                    description: 'Navigator webdriver property set to true',
                    value: navigator.webdriver
                });
            }
            
            // Check for Puppeteer-specific properties
            if (window._phantom !== undefined) {
                indicators.push({
                    name: 'window._phantom',
                    description: 'PhantomJS phantom object detected',
                    value: typeof window._phantom
                });
            }
            
            if (window.callPhantom !== undefined) {
                indicators.push({
                    name: 'window.callPhantom',
                    description: 'PhantomJS callPhantom function detected',
                    value: typeof window.callPhantom
                });
            }
            
            // Check for headless browser indicators
            if (window.outerHeight === 0 && window.outerWidth === 0) {
                indicators.push({
                    name: 'zero_window_dimensions',
                    description: 'Window outer dimensions are zero (headless indicator)',
                    value: `${window.outerWidth}x${window.outerHeight}`
                });
            }
            
            // Check for Chrome runtime anomalies specific to Puppeteer
            if (window.chrome && 
                window.chrome.runtime && 
                window.chrome.runtime.onConnect &&
                !window.chrome.runtime.getManifest) {
                indicators.push({
                    name: 'chrome_runtime_anomaly',
                    description: 'Chrome runtime present but getManifest missing',
                    value: 'runtime exists, getManifest missing'
                });
            }
            
            // Check for missing plugins (common in headless)
            if (navigator.plugins.length === 0 && 
                navigator.mimeTypes.length === 0 &&
                navigator.webdriver !== false) {
                indicators.push({
                    name: 'missing_plugins_mimetypes',
                    description: 'No plugins or MIME types detected (headless indicator)',
                    value: `plugins: ${navigator.plugins.length}, mimeTypes: ${navigator.mimeTypes.length}`
                });
            }
            
            // Check for permissions API anomalies
            if (navigator.permissions && 
                !isNativeFunction(navigator.permissions.query.toString(), 'query')) {
                indicators.push({
                    name: 'permissions_api_anomaly',
                    description: 'Permissions API query function signature anomaly - modified/overridden function detected',
                    value: navigator.permissions.query.toString()
                });
            }
            
            return {
                detected: indicators.length > 0,
                indicators: indicators
            };
        } catch (error) {
            console.debug('Error in Puppeteer detection:', error);
            return {
                detected: false,
                indicators: [],
                error: error.message
            };
        }
    }

    /**
     * Detect Skyvern AI automation via window properties
     * Skyvern adds GlobalSkyvernFrameIndex to window object
     * 
     * @see PerimeterX module 14 - Skyvern detection via window property
     * @returns {Object} Detection result with status and indicators
     */
    async detectSkyvern() {
        const indicators = [];
        const SKYVERN_WINDOW_PROP = 'GlobalSkyvernFrameIndex';
        
        try {
            if (SKYVERN_WINDOW_PROP in window) {
                indicators.push({
                    name: 'GlobalSkyvernFrameIndex',
                    description: 'Skyvern AI automation window property detected',
                    value: typeof window[SKYVERN_WINDOW_PROP]
                });
            }

            // Auxiliary Skyvern globals (PerimeterX PX12696)
            for (const prop of VENDOR_AGENT_SIGNATURES.SKYVERN_GLOBALS) {
                if (typeof window[prop] !== 'undefined') {
                    indicators.push({
                        name: 'Skyvern_Auxiliary_Global',
                        description: 'Skyvern auxiliary global window.' + prop + ' detected',
                        value: typeof window[prop]
                    });
                }
            }

            return {
                detected: indicators.length > 0,
                confidence: indicators.length > 0 ? 0.95 : 0.0,
                indicators,
                primarySignal: indicators.length > 0 ? 'Skyvern_Window_Property' : null
            };
        } catch (error) {
            console.debug('Error in Skyvern detection:', error);
            return {
                detected: false,
                confidence: 0.0,
                indicators: [],
                error: error.message
            };
        }
    }

    /**
     * Detect ChatGPT Browser by checking console.log override
     * ChatGPT Browser modifies console.log with captureLogArguments function
     * 
     * @see PerimeterX module 14 - ChatGPT Browser detection via console.log signature
     * @returns {Object} Detection result with status and indicators
     */
    async detectChatGPTBrowser() {
        const indicators = [];
        const CHATGPT_CONSOLE_SIGNATURE_1 = 'captureLogArguments';
        const CHATGPT_CONSOLE_SIGNATURE_2 = 'NodeList.forEach';
        
        try {
            // Check both current console.log and any wrapped method
            // This handles the case where our browser-use hook wraps the agent's hook
            const logStrings = [console.log.toString()];
            
            // If our hook is installed, also check what we wrapped
            if (console.log.__agentDetectorConsoleHook__ && console.log.__originalNativeMethod) {
                logStrings.push(console.log.__originalNativeMethod.toString());
            }
            
            let hasSignature1 = false;
            let hasSignature2 = false;
            
            for (const logString of logStrings) {
                if (logString.indexOf(CHATGPT_CONSOLE_SIGNATURE_1) > -1) hasSignature1 = true;
                if (logString.indexOf(CHATGPT_CONSOLE_SIGNATURE_2) > -1) hasSignature2 = true;
            }
            
            if (hasSignature1 && hasSignature2) {
                indicators.push({
                    name: 'console.log_Override',
                    description: 'ChatGPT Browser console.log override detected with captureLogArguments signature',
                    value: 'captureLogArguments + NodeList.forEach'
                });
            // } else if (hasSignature1 || hasSignature2) {
            //     // Partial match - lower confidence
            //     indicators.push({
            //         name: 'console.log_Partial_Override',
            //         description: `ChatGPT Browser partial signature detected: ${hasSignature1 ? CHATGPT_CONSOLE_SIGNATURE_1 : CHATGPT_CONSOLE_SIGNATURE_2}`,
            //         value: hasSignature1 ? CHATGPT_CONSOLE_SIGNATURE_1 : CHATGPT_CONSOLE_SIGNATURE_2
            //     });
            }
            
            // Determine confidence based on match quality
            let confidence = 0.0;
            if (hasSignature1 && hasSignature2) {
                confidence = 0.95; // High confidence - both signatures match
            } else if (hasSignature1 || hasSignature2) {
                confidence = 0.65; // Medium confidence - partial match
            }
            
            return {
                detected: indicators.length > 0,
                confidence,
                indicators,
                primarySignal: indicators.length > 0 ? 'ChatGPT_Console_Override' : null
            };
        } catch (error) {
            console.debug('Error in ChatGPT Browser detection:', error);
            return {
                detected: false,
                confidence: 0.0,
                indicators: [],
                error: error.message
            };
        }
    }

    /**
     * Detect Fellou AI Browser via window property
     * Fellou adds __FELLOU_TAB_ID__ to window object
     * 
     * @see PerimeterX module 14 - Fellou Browser detection via window property
     * @returns {Object} Detection result with status and indicators
     */
    async detectFellouBrowser() {
        const indicators = [];
        const FELLOU_WINDOW_PROP = '__FELLOU_TAB_ID__';
        
        try {
            if (FELLOU_WINDOW_PROP in window) {
                indicators.push({
                    name: '__FELLOU_TAB_ID__',
                    description: 'Fellou AI Browser window property detected',
                    value: typeof window[FELLOU_WINDOW_PROP]
                });
            }
            
            return {
                detected: indicators.length > 0,
                confidence: indicators.length > 0 ? 0.95 : 0.0,
                indicators,
                primarySignal: indicators.length > 0 ? 'Fellou_Window_Property' : null
            };
        } catch (error) {
            console.debug('Error in Fellou Browser detection:', error);
            return {
                detected: false,
                confidence: 0.0,
                indicators: [],
                error: error.message
            };
        }
    }

    /**
     * Detect HyperBrowser AI Agent via console.log wrapper signature
     * HyperBrowser wraps console.log with a specific pattern including:
     * - captureLogArguments function
     * - logBuffer.push calls  
     * - Math.floor(Math.random() * 251) + 50 pattern (unique magic numbers)
     * - flushTimeoutId with setTimeout
     * - flushBuffer function
     * - randomBatchSize variable
     * - pageId variable
     * - Reflect.apply with originalMethod
     * 
     * Detection requires rand251plus50 (highly unique) AND at least 3 other signals
     * 
     * @returns {Object} Detection result with status, confidence, and indicators
     */
    async detectHyperBrowser() {
        const indicators = [];
        
        try {
            // Get console.log strings to check - both current and any wrapped method
            const consoleLogStrings = [Function.prototype.toString.call(console.log)];
            
            // If our hook is installed, also check what we wrapped
            if (console.log.__agentDetectorConsoleHook__ && console.log.__originalNativeMethod) {
                consoleLogStrings.push(Function.prototype.toString.call(console.log.__originalNativeMethod));
            }
            
            // Check if ALL versions are native (not wrapped by any agent)
            const allNative = consoleLogStrings.every(s => /\{\s*\[native code\]\s*\}/.test(s));
            if (allNative) {
                return {
                    detected: false,
                    confidence: 0.0,
                    indicators: [],
                    primarySignal: null
                };
            }
            
            // Combine all strings for pattern matching (check both current and wrapped)
            const combinedString = consoleLogStrings.join(' ');
            
            // Normalize whitespace for pattern matching
            const normalizedString = combinedString.replace(/\s+/g, ' ');
            const detectedReasons = [];
            
            // ========================================
            // Primary Signal (Required for detection)
            // ========================================
            
            // Check for the specific random pattern: Math.floor(Math.random() * 251) + 50
            // This is the most unique identifier - magic numbers 251 and 50
            if (/Math\.floor\(\s*Math\.random\(\)\s*\*\s*251\s*\)\s*\+\s*50/.test(normalizedString)) {
                detectedReasons.push('rand251plus50');
                indicators.push({
                    name: 'rand251plus50',
                    description: 'HyperBrowser specific random pattern (251+50) detected - unique magic numbers',
                    value: 'Math.floor(Math.random() * 251) + 50'
                });
            }
            
            // ========================================
            // Secondary Signals (Supporting evidence)
            // ========================================
            
            // Check for captureLogArguments signature
            if (normalizedString.includes('captureLogArguments')) {
                detectedReasons.push('captureLogArguments');
                indicators.push({
                    name: 'captureLogArguments',
                    description: 'HyperBrowser captureLogArguments function detected in console.log',
                    value: 'present'
                });
            }
            
            // Check for logBuffer.push pattern
            if (normalizedString.includes('logBuffer.push')) {
                detectedReasons.push('logBuffer');
                indicators.push({
                    name: 'logBuffer',
                    description: 'HyperBrowser logBuffer.push pattern detected',
                    value: 'present'
                });
            }
            
            // Check for flushBuffer function
            if (normalizedString.includes('flushBuffer')) {
                detectedReasons.push('flushBuffer');
                indicators.push({
                    name: 'flushBuffer',
                    description: 'HyperBrowser flushBuffer function detected',
                    value: 'present'
                });
            }
            
            // Check for flushTimeoutId with setTimeout pattern
            if (normalizedString.includes('flushTimeoutId') && normalizedString.includes('setTimeout')) {
                detectedReasons.push('flushTimeout');
                indicators.push({
                    name: 'flushTimeout',
                    description: 'HyperBrowser flush timeout pattern detected',
                    value: 'flushTimeoutId + setTimeout'
                });
            }
            
            // Check for randomBatchSize variable
            if (normalizedString.includes('randomBatchSize')) {
                detectedReasons.push('randomBatchSize');
                indicators.push({
                    name: 'randomBatchSize',
                    description: 'HyperBrowser randomBatchSize batch control detected',
                    value: 'present'
                });
            }
            
            // Check for pageId variable (HyperBrowser tracks page context)
            if (normalizedString.includes('pageId')) {
                detectedReasons.push('pageId');
                indicators.push({
                    name: 'pageId',
                    description: 'HyperBrowser pageId context tracking detected',
                    value: 'present'
                });
            }
            
            // Check for Reflect.apply with originalMethod (proxy pattern)
            if (normalizedString.includes('Reflect.apply') && normalizedString.includes('originalMethod')) {
                detectedReasons.push('reflectApplyOriginal');
                indicators.push({
                    name: 'reflectApplyOriginal',
                    description: 'HyperBrowser Reflect.apply with originalMethod proxy pattern detected',
                    value: 'Reflect.apply + originalMethod'
                });
            } else if (normalizedString.includes('Reflect.apply')) {
                // Partial match - just Reflect.apply
                detectedReasons.push('reflectApply');
                indicators.push({
                    name: 'reflectApply',
                    description: 'Reflect.apply usage detected in console.log wrapper',
                    value: 'present'
                });
            }
            
            // ========================================
            // Detection Logic - Minimize False Positives
            // ========================================
            
            // HyperBrowser is detected if rand251plus50 (unique) is present AND at least 3 other signals
            const hasRequiredSignal = detectedReasons.includes('rand251plus50');
            const supportingSignals = detectedReasons.filter(r => r !== 'rand251plus50').length;
            const isDetected = hasRequiredSignal && supportingSignals >= 3;
            
            // Calculate confidence based on number of matched patterns
            let confidence = 0.0;
            if (isDetected) {
                const totalSignals = detectedReasons.length;
                if (totalSignals >= 8) {
                    confidence = 0.99; // All patterns matched
                } else if (totalSignals >= 6) {
                    confidence = 0.97; // Strong match
                } else if (totalSignals >= 5) {
                    confidence = 0.95; // Good match
                } else {
                    confidence = 0.90; // Minimum threshold met
                }
            }
            
            return {
                detected: isDetected,
                confidence,
                indicators,
                primarySignal: isDetected ? 'HyperBrowser_Console_Wrapper' : null,
                detectedReasons // Include for debugging
            };
        } catch (error) {
            console.debug('Error in HyperBrowser detection:', error);
            return {
                detected: false,
                confidence: 0.0,
                indicators: [],
                error: error.message
            };
        }
    }

    /**
     * Detect browser-use automation framework
     * Uses early console-hook (installed at module load) + stack classification
     * 
     * @returns {Object} Detection result with status, confidence, and indicators
     */
    async detectBrowserUse() {
        try {
            // Check if console hook already captured browser-use
            if (window.__botSignals?.browserUseDetection) {
                return window.__botSignals.browserUseDetection;
            }
            
            // Check for browser-use specific DOM elements
            const indicators = [];
            const browserUseHighlights = document.querySelectorAll(
                '[class*="browser-use"], [id*="browser-use"], [data-browser-use]'
            );
            
            if (browserUseHighlights.length > 0) {
                indicators.push({
                    name: 'BrowserUse_DOM_Elements',
                    description: 'browser-use related DOM elements detected',
                    value: `${browserUseHighlights.length} element(s) found`
                });
            }

            // Exact highlight attributes DataDome keys on (report code "busH").
            // These are set on arbitrary page elements, so the generic selector
            // above can miss them when neither id nor class matches.
            for (const attr of VENDOR_AGENT_SIGNATURES.BROWSER_USE_ATTRS) {
                const tagged = document.querySelectorAll('[' + attr + ']');
                if (tagged.length > 0) {
                    indicators.push({
                        name: 'BrowserUse_Highlight_Attribute',
                        description: 'browser-use highlight attribute "' + attr + '" found on page elements',
                        value: `${tagged.length} element(s) with ${attr}`
                    });
                }
            }

            // Check for browser-use specific window properties
            const browserUseProps = ['__browser_use__', '__browserUse__', 'browserUse', '__bu_context__'];
            for (const prop of browserUseProps) {
                if (typeof window[prop] !== 'undefined') {
                    indicators.push({
                        name: 'BrowserUse_Window_Property',
                        description: `browser-use window property detected: ${prop}`,
                        value: typeof window[prop]
                    });
                    break;
                }
            }
            
            const isDetected = indicators.length > 0;
            return {
                detected: isDetected,
                confidence: isDetected ? 0.85 : 0.0,
                indicators,
                primarySignal: isDetected ? 'BrowserUse_Detection' : null
            };
        } catch (error) {
            console.debug('Error in browser-use detection:', error);
            return {
                detected: false,
                confidence: 0.0,
                indicators: [],
                error: error.message
            };
        }
    }

    /**
     * Install console hook to capture browser-use specific log messages
     * Note: Hook is already installed at module load time (IIFE at top).
     * @private
     */
    _installBrowserUseConsoleHook() {
        // Already installed at module load
    }

    /**
     * Detect Playwright automation with comprehensive signal analysis
     * @returns {Object} Detection result with status, confidence, and detailed signals
     */
    async detectPlaywright() {
        const indicators = [];
        
        try {
            const signals = {
                playwrightGlobals: false,
                webdriver: false,
                fingerprint: false,
                permissions: false,
                initScripts: false
            };
            
            // ========================================
            // 1. Playwright-Specific Global Properties
            // Playwright injects these into the window object
            // ========================================
            
            // Check for Playwright binding functions (most reliable)
            if (typeof window.__playwright__binding__ !== 'undefined') {
                signals.playwrightGlobals = true;
                indicators.push({
                    name: 'Playwright_Binding',
                    description: 'Playwright binding function detected in window object',
                    value: typeof window.__playwright__binding__
                });
            }
            
            // Check for Playwright init scripts marker
            if (typeof window.__pwInitScripts !== 'undefined') {
                signals.initScripts = true;
                indicators.push({
                    name: 'Playwright_Init_Scripts',
                    description: 'Playwright initialization scripts marker detected',
                    value: typeof window.__pwInitScripts
                });
            }
            
            // Check for other Playwright-specific properties
            const playwrightProps = [
                '__playwright__',
                '_playwrightInstance',
                '__pw_manual',
                '__PW_inspect',
                'playwright'
            ];
            
            for (const prop of playwrightProps) {
                if (typeof window[prop] !== 'undefined') {
                    signals.playwrightGlobals = true;
                    indicators.push({
                        name: `Playwright_Global_${prop}`,
                        description: `Playwright-specific global property detected: ${prop}`,
                        value: typeof window[prop]
                    });
                    break; // Only report first match to avoid duplicates
                }
            }
            
            // ========================================
            // 2. Navigator.webdriver Detection
            // Must be explicitly true, not just truthy
            // ========================================
            if (navigator.webdriver === true) {
                signals.webdriver = true;
                indicators.push({
                    name: 'Navigator_WebDriver',
                    description: 'Navigator webdriver property explicitly set to true',
                    value: navigator.webdriver
                });
            }
            
            // ========================================
            // 3. Permissions API Inconsistency
            // Playwright often has permission API issues
            // ========================================
            if (navigator.permissions && navigator.permissions.query) {
                try {
                    const permissionStatus = await navigator.permissions.query({ name: 'notifications' });
                    // Normal browsers should have valid permission states
                    if (!permissionStatus || typeof permissionStatus.state === 'undefined') {
                        signals.permissions = true;
                        indicators.push({
                            name: 'Permissions_API_Anomaly',
                            description: 'Permissions API returned invalid or undefined state',
                            value: permissionStatus ? 'invalid state' : 'null response'
                        });
                    }
                } catch (permErr) {
                    // Some automation tools throw errors on permissions API
                    if (permErr.message && permErr.message.includes('not supported')) {
                        signals.permissions = true;
                        indicators.push({
                            name: 'Permissions_API_Error',
                            description: 'Permissions API query threw "not supported" error',
                            value: permErr.message
                        });
                    }
                }
            }
            
            // ========================================
            // 4. Fingerprint Inconsistency Detection
            // Check for common automation fingerprint mismatches
            // ========================================
            
            // 4a. Chrome Runtime Check (for Chromium-based browsers)
            if (window.chrome && !window.chrome.runtime) {
                // Legitimate Chrome should have chrome.runtime
                const isChrome = /Chrome/.test(navigator.userAgent) && 
                                /Google Inc/.test(navigator.vendor);
                if (isChrome) {
                    signals.fingerprint = true;
                    indicators.push({
                        name: 'Chrome_Runtime_Missing',
                        description: 'Chrome detected in UA but chrome.runtime is missing',
                        value: 'runtime missing'
                    });
                }
            }
            
            // 4b. WebGL Consistency Check
            try {
                const canvas = document.createElement('canvas');
                const gl = canvas.getContext('webgl') || 
                           canvas.getContext('experimental-webgl');
                
                if (gl) {
                    const debugInfo = gl.getExtension('WEBGL_debug_renderer_info');
                    if (debugInfo) {
                        const renderer = gl.getParameter(debugInfo.UNMASKED_RENDERER_WEBGL);
                        
                        // Check for server-grade GPUs (common in data centers)
                        const serverGPUs = [
                            'SwiftShader',
                            'llvmpipe',
                            'Microsoft Basic Render Driver',
                            'Google SwiftShader'
                        ];
                        
                        if (serverGPUs.some(gpu => renderer.includes(gpu))) {
                            // Only flag if combined with other signals
                            if (signals.webdriver || signals.playwrightGlobals) {
                                signals.fingerprint = true;
                                indicators.push({
                                    name: 'WebGL_Server_GPU',
                                    description: 'Server-grade GPU detected in combination with other automation signals',
                                    value: renderer
                                });
                            }
                        }
                    }
                }
            } catch (glError) {
                // Silent fail on WebGL check
            }
            
            // ========================================
            // 5. Decision Logic - Minimize False Positives
            // ========================================
            
            // High confidence detection (any of these alone is sufficient)
            if (signals.playwrightGlobals || signals.initScripts) {
                const reason = signals.playwrightGlobals ? 'Playwright_Globals' :
                              'Playwright_Init_Scripts';
                
                return {
                    detected: true,
                    confidence: 0.95, // High confidence
                    indicators: indicators,
                    primarySignal: reason
                };
            }
            
            // Medium confidence - multiple signals required
            const mediumSignals = [
                signals.webdriver,
                signals.permissions,
                signals.fingerprint
            ].filter(Boolean).length;
            
            if (mediumSignals >= 2) {
                return {
                    detected: true,
                    confidence: 0.75, // Medium confidence
                    indicators: indicators,
                    primarySignal: 'Multiple_Automation_Signals'
                };
            }
            
            // Low confidence - webdriver alone (could be legitimate automation)
            if (signals.webdriver && mediumSignals === 1) {
                return {
                    detected: true,
                    confidence: 0.50, // Low confidence
                    indicators: indicators,
                    primarySignal: 'WebDriver_Only'
                };
            }
            
            // No detection
            return {
                detected: false,
                confidence: 0.0,
                indicators: [],
                primarySignal: 'None'
            };
            
        } catch (error) {
            console.debug('Error in Playwright detection:', error);
            return {
                detected: false,
                confidence: 0.0,
                indicators: [],
                error: error.message
            };
        }
    }

    /**
     * Detect Chrome DevTools being open via CDP Runtime.enable
     * This detects when DevTools is actively connected and inspecting the page
     * 
     * @returns {Object} Detection result with status, confidence, and indicators
     */
    async detectDevTools() {
        const indicators = [];
        
        try {
            let cdpDetected = false;
            const testError = new Error();
            
            Object.defineProperty(testError, 'stack', {
                configurable: true,
                get: function() {
                    cdpDetected = true;
                    return '';
                }
            });
            
            // Trigger serialization only when CDP Runtime.enable is active
            console.debug(testError);
            
            if (cdpDetected) {
                indicators.push({
                    name: 'CDP_Runtime_Active',
                    description: 'Chrome DevTools Protocol Runtime.enable detected via error stack serialization',
                    value: 'CDP active - DevTools open'
                });
            }
            
            return {
                detected: cdpDetected,
                confidence: cdpDetected ? 0.90 : 0.0,
                indicators,
                primarySignal: cdpDetected ? 'CDP_Runtime_Active' : null
            };
        } catch (error) {
            console.debug('Error in DevTools detection:', error);
            return {
                detected: false,
                confidence: 0.0,
                indicators: [],
                error: error.message
            };
        }
    }


    /**
     * Get detection method description for an agent
     * @private
     * @param {string} agentName - Name of the agent
     * @returns {string} Description of detection method used
     */
    _getDetectionMethod(agentName) {
        const methods = {
            'ManusBrowser': 'DOM Element Detection (manus-action-mask-host) OR Head Attribute (manus-helper-ready)',
            'ManusExtension': 'Chrome Extension Resource Fetch (Silent)',
            'Comet': 'CSS Variable Injection Fingerprinting',
            'Genspark': 'DOM Element Detection',
            'Skyvern': 'Window Property Detection (GlobalSkyvernFrameIndex)',
            'ChatGPTBrowser': 'Console.log Override Signature Analysis',
            'Fellou': 'Window Property Detection (__FELLOU_TAB_ID__)',
            'HyperBrowser': 'Console.log Wrapper Signature Detection (rand251plus50)',
            'BrowserUse': 'Console Message + Stack Classification (browser-use highlight)',
            'ClaudeAgent': 'DOM Element Detection via MutationObserver (claude-agent-glow-border, claude-agent-stop-button, claude-agent-animation-styles, claude-agent-stop-container)',
            'CodexAgent': 'DOM Element Detection (codex-agent-overlay-root, codex-browser-sidebar-comments-root)',
            'SigmaAgent': 'Window Global + DOM Element Detection (__SIGMA__ AND __gradient_border_wrapper__)',
            'CursorAgent': 'Window Property Detection (__cursorDialogConfig)',
            'JetskiAgent': 'documentElement Attribute Detection (data-jetski-tab-id)',
            'Thunderbit': 'DOM Element Detection (thunderbit-crx-scout-overlay, thunderbit-crx-side-bar)',
            'PatchedNativeFunctions': 'Native Function Source Inspection (addEventListener / getSupportedExtensions patch markers)',
            'Selenium': 'WebDriver Property & Artifact Detection',
            'Puppeteer': 'Headless Browser & Runtime Analysis',
            'Playwright': 'Framework Signature Detection',
            'DevTools': 'CDP Runtime.enable Detection via Error Stack Serialization'
        };
        return methods[agentName] || 'Unknown Detection Method';
    }

    /**
     * Get summary of detected agents
     */
    getSummary() {
        return {
            detectedAgents: Array.from(this.detectedAgents),
            totalDetected: this.detectedAgents.size,
            detectionResults: this.detectionResults,
            hasAnyAgent: this.detectedAgents.size > 0
        };
    }

    /**
     * Get detection results for reporting
     */
    getDetectionData() {
        return {
            timestamp: Date.now(),
            detected_agents: Array.from(this.detectedAgents),
            detection_results: this.detectionResults,
            total_detected: this.detectedAgents.size
        };
    }
}

// Export for use in other modules
export { AIAgentDetector };
