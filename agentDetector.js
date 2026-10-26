/**
 * AI Agent Detection Module
 * Detects various AI agents and browser extensions that might be automating the page
 */

import { isNativeFunction } from './utils/functionUtils.js';
import { evaluateBrowserUse, evaluateInstinct, getEngineRecord, collectEngineRecord, provideEngineRecord } from './detectors/browserUseEngine.js';

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
    // ---- Builds <= 1.0.101: light DOM, reachable by getElementById ----
    // DOM element IDs injected by Claude agent when operating
    CLAUDE_GLOW_BORDER_ID: "claude-agent-glow-border",
    CLAUDE_STOP_BUTTON_ID: "claude-agent-stop-button",
    // Additional IDs observed in commercial anti-bot vendors' agent modules:
    // - animation styles <style> element (DataDome 5.10.8, report code "cld")
    // - stop container div (PerimeterX 2026 FB(), signal PX12729)
    CLAUDE_ANIMATION_STYLES_ID: "claude-agent-animation-styles",
    CLAUDE_STOP_CONTAINER_ID: "claude-agent-stop-container",

    // ---- Build 1.0.102 (released 2026-10-22): all of the above moved into a
    // single CLOSED shadow root, where getElementById / querySelector /
    // MutationObserver on document cannot reach them. Verified by diffing the two
    // shipped bundles (assets/agent-visual-indicator.js):
    //     document.body.appendChild call sites   5 -> 0
    //     "claude-agent-animation-styles" string 2 -> 0
    //     attachShadow call sites                2 -> 3
    // Every id above still exists in the code; only its location changed. The ONLY
    // thing left in the light DOM is the shadow HOST, which the extension itself
    // forces into a very specific shape (see isClaudeShadowHost).
    EXTENSION_ID: "fcoeoabgfenejglbffodgkkbkcdhcgfn",
    // Web-accessible to <all_urls> with use_dynamic_url:false. The hash changes per
    // build - keep old entries and append new ones. A miss is INCONCLUSIVE, never a
    // negative: a renamed resource and an absent extension reject identically.
    WAR_PATHS: ["assets/accessibility-tree.js-B-oUarrX.js"]
};

/**
 * Is this element the Claude 1.0.102+ overlay shadow host?
 *
 * The extension's own code forces every one of these properties:
 *   for (const a of host.getAttributeNames()) host.removeAttribute(a)  -> 0 attributes
 *   everything is appended to the shadow root, never the host          -> 0 childNodes
 *   attachShadow({mode:'closed'})                                      -> shadowRoot null
 *   :host { all:initial !important; display:contents !important }      -> display contents
 *   display:contents generates no box                                  -> 0 client rects
 *
 * Measured false-positive rate of this shape: 0 matches across 1,210 body-level
 * elements on 37 real sites in a clean browser, and 0 across 7 installed extensions.
 * `display:contents` is the discriminator - it scored 0/1,210 on its own, while
 * "bare div" alone appears on ~11% of sites and open shadow roots on ~14%.
 *
 * Cross-agent safety: every other agent overlay tracked in this file is excluded by
 * the zero-attribute clause alone, because each one names its host -
 * Manus (id manus-action-mask-host), Codex (id codex-agent-overlay-root), SIGMA
 * (id __gradient_border_wrapper__), Thunderbit (ids), browser-use (data-* attributes),
 * Playwright (custom element <x-pw-glass>, attributes, real client rects).
 * So this must never be relaxed to "bare div at the end of body": Dark Reader also
 * keeps a container as body's last element child, via its own MutationObserver.
 */
function isClaudeShadowHost(el) {
    if (!el || el.nodeType !== 1 || el.tagName !== 'DIV') return false;
    if (el.attributes.length !== 0) return false;
    if (el.childNodes.length !== 0) return false;
    if (el.shadowRoot !== null) return false;          // an OPEN root would be visible here
    let cs;
    try { cs = getComputedStyle(el); } catch (e) { return false; }
    if (cs.display !== 'contents') return false;
    if (el.getClientRects().length !== 0) return false;
    return true;
}

/**
 * Find the Claude overlay shadow host, or null.
 * The extension re-appends it whenever anything follows it, so scan from the end.
 * The overlay content script is all_frames:false, so only the top frame can have one.
 */
function findClaudeShadowHost() {
    if (typeof document === 'undefined' || !document.body) return null;
    try { if (window.top !== window) return null; } catch (e) { return null; }
    const kids = document.body.children;
    for (let i = kids.length - 1; i >= 0; i--) {
        if (isClaudeShadowHost(kids[i])) return kids[i];
    }
    return null;
}

/**
 * Is the host intercepting hit-testing anywhere on screen?
 *
 * Hit-testing retargets through a closed shadow root to its host, so a point
 * resolving to the host means something with pointer-events:auto is rendered inside
 * the root. In 1.0.102 that is only the Stop button, which is .remove()d when the
 * task ends - making this a true start/stop edge rather than a latch.
 *
 * It is also the strongest anti-false-positive clause available: an element with no
 * children and no client rects that nevertheless intercepts the pointer is impossible
 * unless it owns a shadow root with rendered content.
 *
 * Position-independent by design - the overlay sits at bottom centre today, but that
 * is cosmetic. Costs ~1-2ms per sweep and is only ever called once a host exists.
 */
function claudeHostIsHitTestable(host) {
    if (!host || typeof document === 'undefined') return false;
    const w = window.innerWidth, h = window.innerHeight;
    const pts = [];
    for (let i = 1; i <= 11; i++) {                     // dense band along the bottom
        for (let j = 0; j < 3; j++) pts.push([Math.round(w * i / 12), h - 12 - j * 18]);
    }
    for (let i = 1; i <= 5; i++) {                      // coarse full-viewport net
        for (let j = 1; j <= 5; j++) pts.push([Math.round(w * i / 6), Math.round(h * j / 6)]);
    }
    for (const [x, y] of pts) {
        try { if (document.elementFromPoint(x, y) === host) return true; } catch (e) { /* ignore */ }
    }
    return false;
}

/**
 * Confirm the extension is installed, by fetching a web-accessible resource.
 *
 * GATED ON PURPOSE - call this only once a host has been found. In a browser WITHOUT
 * the extension the request prints
 *     "Failed to load resource: net::ERR_BLOCKED_BY_CLIENT"
 * to the DevTools console, and that line is browser-generated: it cannot be caught or
 * suppressed from page JS. Gating means users who do not have the extension never
 * issue the request and so never see the error.
 *
 * fetch() only. <link rel=preload>, <img> and <script> all fire a window-captured
 * 'error' event that error-reporting SDKs collect; fetch's rejection is invisible to
 * window 'error', unhandledrejection and the console API.
 */
async function claudeExtensionResourceServed() {
    const base = 'chrome-extension://' + CLAUDE_AGENT_SIGNATURES.EXTENSION_ID + '/';
    for (const path of CLAUDE_AGENT_SIGNATURES.WAR_PATHS) {
        try {
            const r = await fetch(base + path);
            if (r && r.status === 200) return true;
        } catch (e) { /* absent, renamed or blocked - indistinguishable */ }
    }
    return false;
}

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
    PATCHED_WEBGL_EXT_MARKER: "// Ensure WEBGL_debug_renderer_info is always included",
    // Grok Bot (xAI). The internal names in its canvas patches are what identify it; the hashes pin the exact
    // build we measured, and structure matching still fires when a new build rewrites the body.
    GROK_TODATAURL_IDENTS: ["exportImage", "htmlScratch", "origToDataURL"],
    GROK_GETIMAGEDATA_IDENTS: ["applyNoise", "tcSet", "readAccessor", "imageDataGet"],
    GROK_TODATAURL_HASH: "e0027aaa",
    GROK_GETIMAGEDATA_HASH: "d722d222",
    GROK_WEBGL_IDENTS: ["UNMASKED_VENDOR", "UNMASKED_RENDERER"],
    GROK_HARDWARE_CONCURRENCY: 8,
};

// ============================================================
// MUSE (META) AGENT DETECTION CONSTANTS
//
// Every other entry in this file keys off something the agent leaves in the
// page: a DOM id, an attribute, a global, a patched native. None of them fire
// on Muse. Meta states the agent reads an accessibility tree and cannot run
// JavaScript in the page, and three captured sessions agree -- the page is
// untouched. What is identifiable is the container it runs in.
//
// Read-only by design: no console call, no AudioContext (which logs "The
// AudioContext was not allowed to start"), no fetch (which logs CORS failures).
// An operator watching the console of a page carrying this sees nothing.
//
// Measured 2026-10-11 to 2026-10-22 across three sessions.
// ============================================================
const MUSE_AGENT_SIGNATURES = {
    // The software rasteriser a container falls back to with no GPU. Muse
    // reports it honestly instead of spoofing a GPU. The renderer string is
    // what gets matched: the render hash is not stable, it moved between
    // captured sessions (8b328194 -> 81c179d8) while the string did not.
    SWIFTSHADER_MARKER: "SwiftShader",

    // A second route to the same fact that never touches WebGL, so a page or a
    // policy that blocks WebGL cannot blind the gate. decodingInfo reports
    // powerEfficient false for all three of these when there is no hardware
    // decoder; a control machine with an Intel iGPU answers hw to all three.
    //
    // The codec strings have to be fully specified. A loose "vp9" makes Chrome
    // log 'Invalid (ambiguous) video codec string', which would break the
    // silence this detector exists to keep. Measured 2026-10-25: the three
    // below produce zero console writes.
    SOFTWARE_DECODE_CODECS: [
        'video/mp4; codecs="avc1.42E01E"',
        'video/webm; codecs="vp09.00.10.08"',
        'video/mp4; codecs="av01.0.05M.08"'
    ],

    // Virtual-display furniture. A real desktop reserves a strip for a taskbar
    // (Windows: bottom), a menu bar and dock (macOS: top and bottom) or a top
    // bar (GNOME: top). Muse reserves exactly 40px at the top and nothing on
    // the other three edges, in 4/4 sessions. These are properties of the
    // display rather than the window, so they survive a resize. A Windows
    // control on this hardware reads T0 R0 B48 L0.
    WORKAREA: { top: 40, right: 0, bottom: 0, left: 0 },

    // Blink features this image launches with switched off. Not anything a
    // user chose: these three have no UI that turns them off together.
    DISABLED_FEATURES: ["bluetooth", "joinAdInterestGroup", "browsingTopics"],

    // Build-ID maps a bundler leaves on window. Weak on its own: a stock
    // browser carrying the same extension produces an identical map, measured
    // on an ordinary Chrome 2026-10-22.
    DEBUG_ID_MAPS: ["_sentryDebugIds", "__sentry_debug_ids__", "_debugIds"],

    // Signals that MUST fire. The score decides nothing until every name here
    // is present, so a browser missing any of them is never reported no matter
    // how much else lines up. This buys precision at the cost of fragility, and
    // the fragility is not spread evenly:
    //
    //   museSoftwareGPU is structural. The container has no GPU, which is a
    //   property of how the fleet is provisioned rather than of any one image,
    //   and it is now proven by either of two independent routes.
    //
    //   museBuildIdMap is a third party artefact. It is present only while this
    //   image keeps shipping that extension, and a re-cut image, an extension
    //   update or a bundler change removes it with no warning at all.
    //
    // A mandatory gate that quietly stops firing is worse than no gate, because
    // detection drops to zero and nothing says why. So a gate that fails while
    // everything else still adds up is reported as museGateFailed rather than
    // swallowed -- that is the difference between "this is not Muse" and "this
    // detector has gone blind".
    REQUIRED: ["museSoftwareGPU", "museBuildIdMap"],

    // Applied on top of the gates, which are worth 19 together. The threshold
    // sits above that on purpose, so the gates alone can never convict, and
    // above gates plus the two weakest corroborators (28) as well: reaching 30
    // needs the work area, or the disabled-feature set plus one other.
    WEIGHTS: { swiftshader: 16, workarea: 14, features: 8, brands: 5, soloExtension: 4, debugIds: 3 },
    THRESHOLD: 30

    // Measured against a real Chrome and dropped rather than shipped, recorded
    // here so they do not get proposed again:
    //
    //   CPU family (Infinity-Infinity, byte 3: 0xFF x86, 0x7F ARM). Muse reads
    //   ARM under a user agent claiming x86_64 and that byte cannot be spoofed,
    //   which made it look like the strongest signal available. It is not a
    //   Muse signal: Chrome freezes the Linux platform token at
    //   "X11; Linux x86_64" under UA reduction, so every genuine ARM Linux
    //   Chrome shows the same contradiction. It identifies ARM Linux, and ARM
    //   Linux is mostly CI runners.
    //
    //   Storage quota. Muse reports exactly 10 GiB, which looked like a fixed
    //   container filesystem beside the messy 8460289901 a used profile gives.
    //   It is not: a headed, fresh-profile Chrome on real hardware with a real
    //   GPU returns exactly 10737418240 as well. That is simply what Chrome
    //   hands a new profile, shared with every incognito window.
    //
    //   deviceMemory (a control reports 32, so there is no clamp to read),
    //   jsHeapSizeLimit and the Intl timezone count (both identical to a
    //   Windows control), speechSynthesis voice count (0 on the control too,
    //   because getVoices populates asynchronously), SharedArrayBuffer (gated
    //   on cross-origin isolation, so it measures the page and not the
    //   browser) and Web Share (absent on ordinary desktop builds).
};

// ============================================================
// DEBUG OUTPUT
//
// Detection is silent by default. An operator watching the console of a page
// that carries this file sees nothing from it: no banner, no per-detector
// line, no results object. That is the same requirement detectMuse is built
// around -- and it was being defeated here, because a full runAllDetections
// wrote 28 lines, 26 of them console.log, naming every detector and dumping
// the whole result set.
//
// Nothing is lost by the silence: a detector that throws still returns its
// error in the result object, which is where a caller should be reading it.
//
// Turn the trace back on with either of
//
//     window.__agentDetectorDebug = true     // before running
//     ?agentDetectorDebug=1                  // in the URL
//
// The URL form matters for containers where devtools cannot be opened and the
// page is all there is to work with.
//
// Writes go through the ORIGINAL console methods the hook below captures, not
// through the live ones. That hook wraps console.log so the ChatGPT and
// HyperBrowser detectors can read what wrapped it; sending our own output
// through that wrapper would feed the detector its own logging. Resolution is
// lazy, so this does not depend on being defined after the hook.
// ============================================================
const detectorLog = (() => {
    let fromUrl = null;
    const isOn = () => {
        try {
            if (window.__agentDetectorDebug === true) return true;
            if (fromUrl === null) {
                try {
                    fromUrl = new URLSearchParams(window.location.search).get('agentDetectorDebug') === '1';
                } catch (e) { fromUrl = false; }
            }
            return fromUrl;
        } catch (e) { return false; }   // no window: stay off
    };
    const write = (kind) => function () {
        if (!isOn()) return;
        let fn;
        try { fn = (window.__nativeConsoleMethods && window.__nativeConsoleMethods[kind]) || console[kind]; }
        catch (e) { fn = console[kind]; }
        try { fn.apply(console, arguments); } catch (e) { /* logging never breaks detection */ }
    };
    return {
        log: write('log'), info: write('info'), warn: write('warn'),
        error: write('error'), debug: write('debug')
    };
})();

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
                    detectionMethod: 'Console Message + Stack Classification (Browser Use highlight log)',
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

            // Build 1.0.102+: the ids above sit inside a closed shadow root and are
            // unreachable from here, so watch for the host instead. It is appended to
            // <body> the first time the agent acts on the page - which makes this
            // observer, not a poll, the thing that timestamps the start of the session.
            const shadowHost = findClaudeShadowHost();
            if (shadowHost) {
                foundElements.push({
                    id: '(closed-shadow-host)',
                    tagName: shadowHost.tagName,
                    outerHTML: shadowHost.outerHTML.substring(0, 150)
                });
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

                            // 1.0.102+ adds no id we can match on, so also wake up for a
                            // bare attribute-less DIV landing directly in <body>. The
                            // full shape test runs inside checkForClaudeElements().
                            const looksLikeShadowHost = node.tagName === 'DIV' &&
                                node.attributes.length === 0 &&
                                node.parentNode === document.body;

                            if (hasTargetId || looksLikeShadowHost) {
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
        detectorLog.log('🕵️ Starting AI Agent Detection...');
        
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
            { name: 'SpoofedPersona', detector: this.detectSpoofedPersona },
            { name: 'Instinct', detector: this.detectInstinct },
            { name: 'ClaudeAgent', detector: this.detectClaudeAgent },
            // Agent artefacts recovered from DataDome 5.10.8 / PerimeterX 2026
            { name: 'CodexAgent', detector: this.detectCodexAgent },
            { name: 'SigmaAgent', detector: this.detectSigmaAgent },
            { name: 'CursorAgent', detector: this.detectCursorAgent },
            { name: 'JetskiAgent', detector: this.detectJetskiAgent },
            { name: 'Thunderbit', detector: this.detectThunderbit },
            { name: 'PatchedNativeFunctions', detector: this.detectPatchedNativeFunctions },
            { name: 'GrokBot', detector: this.detectGrokBot },
            { name: 'Muse', detector: this.detectMuse },
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
                let detected, indicators = [], confidence = 0.0, primarySignal = null, engine = null;
                if (typeof detectionResult === 'boolean') {
                    detected = detectionResult;
                } else if (detectionResult && typeof detectionResult === 'object') {
                    detected = detectionResult.detected;
                    indicators = detectionResult.indicators || [];
                    // Use returned confidence if available, otherwise calculate based on agent type
                    confidence = detectionResult.confidence || 0.0;
                    primarySignal = detectionResult.primarySignal || null;
                    engine = detectionResult.engine || null;
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
                        case 'SpoofedPersona':
                            confidence = 0.85; // a strong engine contradiction of the claimed OS / GPU
                            break;
                        case 'Instinct':
                            confidence = 0.85; // its own infrastructure under an honest Linux claim
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
                        case 'GrokBot':
                            confidence = 0.95; // canvas patch internals unique to Grok's browser
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
                if (engine) result.engine = engine;
                
                if (detected) {
                    this.detectedAgents.add(name);
                    const indicatorNames = indicators.map(ind => ind.name).join(', ');
                    const signalInfo = primarySignal ? ` [${primarySignal}]` : '';
                    detectorLog.log(`✅ ${name} agent detected with ${(confidence * 100).toFixed(1)}% confidence${signalInfo}${indicatorNames ? ` (indicators: ${indicatorNames})` : ''}`);
                    
                    // Dispatch agentDetected event for the overlay and UI updates
                    try {
                        window.dispatchEvent(new CustomEvent('agentDetected', {
                            detail: result
                        }));
                    } catch (e) {
                        // Silent fail if event dispatch fails
                    }
                } else {
                    detectorLog.log(`❌ ${name} agent not detected`);
                }
                
                return result;
            } catch (error) {
                detectorLog.warn(`⚠️ Error detecting ${name}:`, error);
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
        
        detectorLog.log('🕵️ AI Agent Detection complete:', this.detectionResults);
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
                detectorLog.log("Manus helper detected");
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
                detectorLog.log("Manus Browser detected via DOM element/attribute");
                
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
            detectorLog.debug('Error in Manus Browser detection:', error);
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
                detectorLog.debug(`Manus extension check skipped - Chrome ${majorVersion} (only runs on 128)`);
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
                detectorLog.log("Manus extension detected via resource fetch");
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

            // Everything above only fires on builds <= 1.0.101. From 1.0.102 the same
            // elements live inside a closed shadow root and getElementById returns null
            // for all four, so the light-DOM path goes quiet against a current build.
            // The host is what remains reachable.
            const legacyHit = indicators.length > 0;
            let confidence = legacyHit ? 0.95 : 0.0;

            const shadowHost = findClaudeShadowHost();
            if (shadowHost) {
                confidence = Math.max(confidence, 0.80);
                indicators.push({
                    name: 'Claude_Agent_Shadow_Host',
                    description: 'Claude agent closed-shadow-root overlay host detected in DOM (build 1.0.102+)',
                    value: 'DIV, 0 attributes, 0 children, display:contents, 0 client rects'
                });

                // Upgrades the claim from "an odd empty div exists" to "an odd empty div
                // is intercepting the pointer", which also means a task is live right now.
                if (claudeHostIsHitTestable(shadowHost)) {
                    confidence = Math.max(confidence, 0.90);
                    indicators.push({
                        name: 'Claude_Agent_Overlay_Interactive',
                        description: 'Claude agent overlay is intercepting hit-testing (a task is running now)',
                        value: 'elementFromPoint retargets to the shadow host'
                    });
                }

                // Only probed once a host exists - see claudeExtensionResourceServed().
                if (await claudeExtensionResourceServed()) {
                    confidence = Math.max(confidence, 0.99);
                    indicators.push({
                        name: 'Claude_Extension_Resource',
                        description: 'Claude extension served a web-accessible resource (extension id confirmed)',
                        value: CLAUDE_AGENT_SIGNATURES.EXTENSION_ID
                    });
                }
            }

            if (indicators.length > 0) {
                detectorLog.log("Claude Agent detected via DOM element(s)");

                // Mark as detected for the early observer
                window.__claudeAgentAlreadyDetected = true;

                const result = {
                    detected: true,
                    confidence,
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
            detectorLog.debug('Error in Claude Agent detection:', error);
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
                detectorLog.log('OpenAI Codex agent detected via DOM element(s)');
                return { detected: true, confidence: 0.96, indicators, primarySignal: indicators[0].name };
            }
            return { detected: false, confidence: 0.0, indicators: [], primarySignal: null };
        } catch (error) {
            detectorLog.debug('Error in Codex agent detection:', error);
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
                detectorLog.log('SIGMA agent detected (global + element)');
                return { detected: true, confidence: 0.96, indicators, primarySignal: indicators[0].name };
            }
            return { detected: false, confidence: 0.0, indicators: [], primarySignal: null };
        } catch (error) {
            detectorLog.debug('Error in SIGMA agent detection:', error);
            return { detected: false, confidence: 0.0, indicators: [], error: error.message };
        }
    }

    /**
     * Detect Cursor IDE agent (PerimeterX PX12732) via window.__cursorDialogConfig
     */
    async detectCursorAgent() {
        try {
            if (typeof window[VENDOR_AGENT_SIGNATURES.CURSOR_GLOBAL] !== 'undefined') {
                detectorLog.log('Cursor agent detected via window property');
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
            detectorLog.debug('Error in Cursor agent detection:', error);
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
                detectorLog.log('Jetski agent detected via documentElement attribute');
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
            detectorLog.debug('Error in Jetski agent detection:', error);
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
                detectorLog.log('Thunderbit agent detected via DOM element(s)');
                return { detected: true, confidence: 0.94, indicators, primarySignal: indicators[0].name };
            }
            return { detected: false, confidence: 0.0, indicators: [], primarySignal: null };
        } catch (error) {
            detectorLog.debug('Error in Thunderbit detection:', error);
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
                detectorLog.log('Patched native function(s) detected');
                return { detected: true, confidence: 0.9, indicators, primarySignal: indicators[0].name };
            }
            return { detected: false, confidence: 0.0, indicators: [], primarySignal: null };
        } catch (error) {
            detectorLog.debug('Error in patched-native-function detection:', error);
            return { detected: false, confidence: 0.0, indicators: [], error: error.message };
        }
    }

    /**
     * Detect Grok Bot (xAI) by the shape of its fingerprint-normalisation patches.
     *
     * Grok's cloud browser patches five natives to present itself as an ordinary desktop rather than a
     * Linux VM without a GPU -- not to hide
     * that it is an agent, so none of this overlaps the DOM-marker detectors above.
     *
     * Only the canvas patches identify it. toDataURL re-renders through a scratch canvas and getImageData
     * noises a copy and writes it back through a saved TypedArray.set; the internal names those two use
     * (exportImage, htmlScratch, origToDataURL; readAccessor, imageDataGet, applyNoise, tcSet) appear in no
     * published library found so far. Replacing the WebGL vendor and renderer strings, the platform getter
     * and the pinned core count are all common and only corroborate -- hardwareConcurrency especially,
     * since its value follows VM sizing and can change on any deploy.
     *
     * One of the two canvas patches is required. Without it there is no detection however many of the generic
     * signals are present, because the generic signals describe a whole industry.
     */
    async detectGrokBot() {
        const indicators = [];
        const S = VENDOR_AGENT_SIGNATURES;
        let frame = null;
        try {
            const isNative = (s) => /\{\s*\[native code\]\s*\}/.test(s);
            const norm = (s) => String(s).replace(/\s+/g, ' ').trim();
            const fnv1a = (s) => {
                let h = 0x811c9dc5;
                for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619) >>> 0; }
                return ('0000000' + (h >>> 0).toString(16)).slice(-8);
            };

            // A main-realm read is free. It can only lie by reporting [native code] for something patched,
            // so that is the single case worth paying for a pristine realm to re-check.
            const shallow = (fn) => {
                if (typeof fn !== 'function') return '';
                try { return Function.prototype.toString.call(fn); } catch (e) { return ''; }
            };
            let pristine;
            const deep = (fn) => {
                if (typeof fn !== 'function') return '';
                if (pristine === undefined) {
                    pristine = null;
                    try {
                        frame = document.createElement('iframe');
                        frame.style.display = 'none';
                        (document.body || document.documentElement).appendChild(frame);
                        pristine = frame.contentWindow.Function.prototype.toString;
                    } catch (e) { pristine = null; }
                }
                if (!pristine) return '';
                try { return pristine.call(fn); } catch (e) { return ''; }
            };
            // The reading we trust: whatever is not [native code], preferring the cheap one.
            const src = (fn) => {
                const s = shallow(fn);
                if (s && !isNative(s)) return s;
                const d = deep(fn);
                return (d && !isNative(d)) ? d : s;
            };
            const getterSrc = (obj, prop) => {
                try {
                    const d = Object.getOwnPropertyDescriptor(obj, prop);
                    return d && d.get ? src(d.get) : '';
                } catch (e) { return ''; }
            };

            // ---- Primary. One of these is required.
            const primary = [];
            const hashes = {};
            const nearMiss = [];
            const canvasCheck = (fn, idents, knownHash, key, label, how) => {
                const s = src(fn);
                if (!s || isNative(s)) return;
                const found = idents.filter((n) => s.indexOf(n) > -1);
                if (found.length !== idents.length) {
                    // Overridden, but not in a shape we know. Worth recording rather than dropping: this is
                    // what a renamed build, or another browser doing the same job, looks like on the way past.
                    nearMiss.push({
                        name: 'Canvas_Override_Unrecognised',
                        description: key + ' is overridden but does not carry the known shape; matched ' +
                            (found.length ? found.join(', ') : 'none') + ' of ' + idents.join(', '),
                        value: 'hash=' + fnv1a(norm(s)) + ' len=' + norm(s).length
                    });
                    return;
                }
                const h = fnv1a(norm(s));
                primary.push(key);
                hashes[key] = h;
                indicators.push({
                    name: label,
                    description: how + ' (' + idents.join(', ') + ')',
                    value: 'hash=' + h + (h === knownHash ? ' known build' : ' structure matched, hash drifted'),
                    knownBuild: h === knownHash
                });
            };
            canvasCheck(HTMLCanvasElement.prototype.toDataURL, S.GROK_TODATAURL_IDENTS,
                S.GROK_TODATAURL_HASH, 'toDataURL', 'Grok_Canvas_toDataURL',
                'toDataURL re-renders through a scratch canvas');
            canvasCheck(CanvasRenderingContext2D.prototype.getImageData, S.GROK_GETIMAGEDATA_IDENTS,
                S.GROK_GETIMAGEDATA_HASH, 'getImageData', 'Grok_Canvas_getImageData',
                'getImageData noises a copy and writes it back through a saved TypedArray.set');

            if (primary.length === 0) {
                // Not a detection -- a hit needs the known shape -- but the evidence travels with the run.
                return {
                    detected: false,
                    confidence: 0.0,
                    indicators: nearMiss,
                    primarySignal: nearMiss.length ? nearMiss[0].name : null
                };
            }

            // ---- Supportive. Only reached once a canvas patch has matched, so the generic work and the GL
            // context are never paid for on an ordinary browser.
            const supportive = [];

            const hwcSrc = getterSrc(Navigator.prototype, 'hardwareConcurrency');
            const pinned = /\{\s*return\s+(\d+)\s*;?\s*\}/.exec(hwcSrc || '');
            if (hwcSrc && !isNative(hwcSrc) && pinned) {
                supportive.push('hardwareConcurrency');
                indicators.push({
                    name: 'Grok_HardwareConcurrency_Pinned',
                    description: 'hardwareConcurrency getter returns a hardcoded ' + pinned[1] +
                        (Number(pinned[1]) === S.GROK_HARDWARE_CONCURRENCY ? ', the value measured on Grok Bot' : ''),
                    value: norm(hwcSrc).substring(0, 120)
                });
            }

            const platformSrc = getterSrc(Navigator.prototype, 'platform');
            if (platformSrc && !isNative(platformSrc) && /return\s+[A-Z_][A-Z0-9_]{2,}\s*;?\s*\}/.test(platformSrc)) {
                supportive.push('platform');
                indicators.push({
                    name: 'Grok_Platform_Substituted',
                    description: 'navigator.platform getter returns a captured constant rather than a literal',
                    value: norm(platformSrc).substring(0, 120)
                });
            }

            try {
                const c = document.createElement('canvas');
                const gl = c.getContext('webgl') || c.getContext('experimental-webgl');
                const glSrc = gl ? src(gl.getParameter) : '';
                if (glSrc && !isNative(glSrc) &&
                    S.GROK_WEBGL_IDENTS.every((n) => glSrc.indexOf(n) > -1) && glSrc.indexOf('37445') === -1) {
                    supportive.push('webglGetParameter');
                    indicators.push({
                        name: 'Grok_WebGL_NamedConstants',
                        description: 'WebGL getParameter returns vendor and renderer from named constants ' +
                            'rather than the numeric 37445/37446 form',
                        value: norm(glSrc).substring(0, 160)
                    });
                }
            } catch (e) { /* no GL context available; supportive only */ }

            // The patches stop at GPU, CPU and canvas. Broader toolkits also replace the automation
            // surface, and Grok leaves it alone.
            try {
                const quiet = ['webdriver', 'plugins', 'mimeTypes'].every((p) => {
                    const s = getterSrc(Navigator.prototype, p);
                    return !s || isNative(s);
                });
                if (quiet) {
                    supportive.push('automationSurfaceUntouched');
                    indicators.push({
                        name: 'Grok_Automation_Surface_Clean',
                        description: 'webdriver, plugins and mimeTypes getters are all native: the patches are ' +
                            'confined to GPU, CPU and canvas rather than reaching the automation surface',
                        value: 'webdriver/plugins/mimeTypes native'
                    });
                }
            } catch (e) { /* supportive only */ }

            const confidence = primary.length >= 2
                ? (supportive.length ? 0.97 : 0.95)
                : (supportive.length >= 2 ? 0.90 : 0.80);

            detectorLog.log('Grok Bot patch signature detected');
            return {
                detected: true,
                confidence,
                indicators,
                primarySignal: indicators[0].name,
                signature: {
                    primary,
                    supportive,
                    hashes,
                    knownBuild: primary.every((k) => hashes[k] === (k === 'toDataURL'
                        ? S.GROK_TODATAURL_HASH : S.GROK_GETIMAGEDATA_HASH))
                }
            };
        } catch (error) {
            detectorLog.debug('Error in Grok Bot detection:', error);
            return { detected: false, confidence: 0.0, indicators: [], error: error.message };
        } finally {
            if (frame && frame.parentNode) {
                try { frame.parentNode.removeChild(frame); } catch (e) { /* ignore */ }
            }
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
                detectorLog.log('Genspark AI Agent detected via DOM element(s)');
                return { detected: true, confidence: 0.95, indicators, primarySignal: indicators[0].name };
            }
            return { detected: false, confidence: 0.0, indicators: [], primarySignal: null };
        } catch (error) {
            detectorLog.warn('Error during Genspark detection:', error);
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
                detectorLog.log('Comet AI Agent detected via CSS variable fingerprinting:', {
                    detectedSentinels: detectedSentinels.length,
                    threshold: DETECTION_THRESHOLD,
                    matches: detectedSentinels
                });
            } else {
                detectorLog.log('Comet AI Agent not detected - insufficient CSS sentinel matches:', {
                    detectedSentinels: detectedSentinels.length,
                    required: DETECTION_THRESHOLD
                });
            }

            return isDetected;
        } catch (error) {
            detectorLog.warn('Error during Comet AI Agent detection:', error);
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
                detectorLog.debug(`Failed to check CSS sentinel ${sentinel}:`, error);
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
            detectorLog.debug('Error in Selenium detection:', error);
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
            detectorLog.debug('Error in Puppeteer detection:', error);
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
            detectorLog.debug('Error in Skyvern detection:', error);
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
            detectorLog.debug('Error in ChatGPT Browser detection:', error);
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
            detectorLog.debug('Error in Fellou Browser detection:', error);
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
            detectorLog.debug('Error in HyperBrowser detection:', error);
            return {
                detected: false,
                confidence: 0.0,
                indicators: [],
                error: error.message
            };
        }
    }

    /**
     * Detect Browser Use: its page-side traces (console hook installed at module load, highlight attributes and DOM,
     * window properties) and its cloud's engine (detectors/browserUseEngine.js: the persona-aware rule set, routed by
     * the claimed platform, plus the backend build markers every persona carries).
     *
     * The engine part needs the browser-data record. It is read when one is ready (collectEngineRecord() or
     * provideEngineRecord() was called); this method never waits for one, so until then the page traces decide
     * alone. A periodic re-run picks the record up once it exists.
     *
     * @returns {Object} Detection result with status, confidence, indicators and the engine evaluation
     */
    async detectBrowserUse() {
        try {
            const indicators = [];
            const hook = window.__botSignals?.browserUseDetection;
            if (hook?.detected) indicators.push(...(hook.indicators || []));

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
                        description: 'Browser Use highlight attribute "' + attr + '" found on page elements',
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

            const pageTraces = !!hook?.detected || indicators.length > 0;
            const engine = this.getBrowserUseEngine();
            const engineMatch = engine?.verdict === 'browser-use';
            if (engineMatch) indicators.push(...this._engineIndicators(engine));

            const detected = pageTraces || engineMatch;
            let primarySignal = null;
            if (hook?.detected) primarySignal = hook.primarySignal || 'BrowserUse_Console_Hook';
            else if (pageTraces) primarySignal = 'BrowserUse_Detection';
            else if (engineMatch) primarySignal = indicators[0]?.name || null;
            return {
                detected,
                confidence: detected ? Math.max(pageTraces ? (hook?.confidence || 0.85) : 0, engineMatch ? engine.confidence : 0) : 0.0,
                indicators,
                primarySignal,
                engine
            };
        } catch (error) {
            detectorLog.debug('Error in browser-use detection:', error);
            return {
                detected: false,
                confidence: 0.0,
                indicators: [],
                error: error.message
            };
        }
    }

    /**
     * A claimed platform or GPU the engine contradicts, with nothing tying it to Browser Use: another agent cloud's
     * persona (or a heavily spoofed browser). Reported on its own so it never reads as Browser Use.
     */
    async detectSpoofedPersona() {
        const engine = this.getBrowserUseEngine();
        if (!engine || engine.verdict !== 'agent-persona') {
            return { detected: false, confidence: 0.0, indicators: [], primarySignal: null };
        }
        const indicators = this._engineIndicators(engine);
        return { detected: true, confidence: engine.confidence, indicators, primarySignal: indicators[0]?.name || null, engine };
    }

    /**
     * Detect Instinct: an agent cloud whose browser does not pretend to be anything else, so the persona rules find
     * nothing. It is identified instead by a Linux-build gate plus its own infrastructure (see evaluateInstinct).
     *
     * Needs the browser-data record, like detectBrowserUse, and never waits for one.
     */
    async detectInstinct() {
        const record = getEngineRecord();
        if (!record) return { detected: false, confidence: 0.0, indicators: [], primarySignal: null };
        const engine = evaluateInstinct(record);
        if (engine.verdict !== 'instinct' && engine.verdict !== 'instinct-like') {
            return { detected: false, confidence: 0.0, indicators: [], primarySignal: null, engine };
        }
        const indicators = engine.rules
            .filter((r) => r.result === true && r.level !== 'context')
            .map((r) => ({
                name: 'Instinct_' + r.id,
                description: `${r.name} (${r.level}, ${r.family} family)`,
                value: JSON.stringify(r.values),
            }));
        return {
            detected: engine.verdict === 'instinct',
            confidence: engine.confidence,
            indicators,
            primarySignal: indicators[0]?.name || null,
            engine,
        };
    }

    /**
     * The engine evaluation of the browser-data record, or null while there is none. Cheap: rules on a record.
     */
    /**
     * Muse (Meta) agent browser.
     *
     * Scores the container rather than the page, because Muse leaves the page
     * alone: Meta states the agent reads an accessibility tree and cannot run
     * JavaScript in the page, and four captured sessions agree.
     *
     * Two gates must fire before anything is reported; see
     * MUSE_AGENT_SIGNATURES.REQUIRED for what each one is worth and how it can
     * fail. Every read below is a property read, a WebGL context released
     * immediately, or a decodingInfo query with a fully specified codec string.
     * Nothing writes to the console and nothing goes out on the network.
     */
    async detectMuse() {
        const S = MUSE_AGENT_SIGNATURES;
        const indicators = [];
        let score = 0;
        const add = (name, weight, description, value) => {
            score += weight;
            indicators.push({ name, description, value });
        };

        // --- Gate: no GPU, proven by either of two independent routes -------
        // WebGL first, because the renderer string says which rasteriser it is.
        // Codec support is the fallback, so a page that blocks WebGL, or a
        // build that stops reporting the renderer, does not blind the gate.
        let noGpuEvidence = null;

        try {
            const canvas = document.createElement('canvas');
            const gl = canvas.getContext('webgl') || canvas.getContext('experimental-webgl');
            if (gl) {
                const dbg = gl.getExtension('WEBGL_debug_renderer_info');
                const renderer = dbg
                    ? String(gl.getParameter(dbg.UNMASKED_RENDERER_WEBGL))
                    : String(gl.getParameter(gl.RENDERER));
                if (renderer.indexOf(S.SWIFTSHADER_MARKER) !== -1) {
                    noGpuEvidence = renderer.slice(0, 110);
                }
                // Release it rather than leaving a live context on the page.
                const lose = gl.getExtension('WEBGL_lose_context');
                if (lose) lose.loseContext();
            }
        } catch (e) { /* context refused: fall through to the codec route */ }

        if (!noGpuEvidence && navigator.mediaCapabilities) {
            try {
                const decode = await Promise.all(S.SOFTWARE_DECODE_CODECS.map(contentType =>
                    navigator.mediaCapabilities.decodingInfo({
                        type: 'file',
                        video: { contentType, width: 1920, height: 1080, bitrate: 3000000, framerate: 30 }
                    })
                ));
                if (decode.length && decode.every(d => d.supported && !d.powerEfficient)) {
                    noGpuEvidence = 'every codec decodes in software';
                }
            } catch (e) { /* leave the gate unproven */ }
        }

        if (noGpuEvidence) {
            add('museSoftwareGPU', S.WEIGHTS.swiftshader,
                'There is no GPU behind this browser and the build does not pretend otherwise: either the renderer is SwiftShader or every codec decodes in software',
                noGpuEvidence);
        }

        // --- Work-area insets reserved by the display -----------------------
        try {
            const s = window.screen || {};
            // On more than one display the insets can fold in a monitor offset,
            // so only a single-display reading is attributable.
            const multiDisplay = (typeof s.isExtended === 'boolean') ? s.isExtended : false;
            const left = (typeof s.availLeft === 'number') ? s.availLeft : null;
            const top = (typeof s.availTop === 'number') ? s.availTop : null;
            if (!multiDisplay && left !== null && top !== null) {
                const right = s.width - s.availWidth - left;
                const bottom = s.height - s.availHeight - top;
                const W = S.WORKAREA;
                if (top === W.top && right === W.right && bottom === W.bottom && left === W.left) {
                    add('museWorkArea', S.WEIGHTS.workarea,
                        'Display reserves a top-only 40px strip with nothing on the other three edges; a property of the display rather than the window, so it survives a resize',
                        'T ' + top + ' R ' + right + ' B ' + bottom + ' L ' + left);
                }
            }
        } catch (e) { /* screen metrics unavailable: leave unscored */ }

        // --- Blink features the image launched with disabled ----------------
        try {
            const absent = S.DISABLED_FEATURES.filter(name => (name === 'browsingTopics')
                ? !(name in document)
                : !(name in navigator));
            if (absent.length === S.DISABLED_FEATURES.length) {
                add('museDisabledFeatures', S.WEIGHTS.features,
                    'Web Bluetooth and both Privacy Sandbox entry points are absent together, which is a launch configuration rather than anything a user chose',
                    absent.join(', '));
            }
        } catch (e) { /* leave unscored */ }

        // --- Chromium brands with no Google Chrome entry --------------------
        // Deliberately light. A branded Chrome does carry a "Google Chrome"
        // brand, so this separates Muse from Chrome, but plenty of embedded
        // Chromium builds look the same -- the Claude desktop browser pane
        // among them, measured 2026-10-25.
        try {
            const uaData = navigator.userAgentData;
            const brands = (uaData && uaData.brands) ? uaData.brands.map(b => b.brand) : [];
            if (brands.length && /\bChrome\/\d/.test(navigator.userAgent || '')) {
                const hasGoogleChrome = brands.some(b => /google chrome/i.test(b));
                const hasChromium = brands.some(b => /^chromium$/i.test(b));
                if (hasChromium && !hasGoogleChrome) {
                    add('museUnbrandedChromium', S.WEIGHTS.brands,
                        'User agent says Chrome while the client hints list Chromium with no Google Chrome brand',
                        brands.join(', '));
                }
            }
        } catch (e) { /* client hints unavailable: leave unscored */ }

        // --- Gate: a build-ID map naming an extension inside the image ------
        // The capture that motivated the second half of this had the map as the
        // only foreign global on the page, 1 of 1227. Testing that directly
        // needs a baseline of known globals that drifts with every Chrome
        // release, so the baseline stays in the research probe and what ships
        // is the cheap half: how many distinct extensions the map names. A
        // person accumulates extensions over time; a fleet image does not.
        try {
            for (const key of S.DEBUG_ID_MAPS) {
                const map = window[key];
                if (!map || typeof map !== 'object') continue;

                const mapKeys = Object.keys(map);
                const ids = new Set();
                for (const stack of mapKeys) {
                    const found = String(stack).match(/chrome-extension:\/\/([a-z]{32})/g) || [];
                    for (const url of found) ids.add(url.slice('chrome-extension://'.length));
                }
                if (!ids.size) continue;

                add('museBuildIdMap', S.WEIGHTS.debugIds,
                    'A bundler build-ID map on window names an extension inside the image; a stock browser carrying the same extension produces this too, so it only ever corroborates',
                    key + ' ' + Array.from(ids).join(' '));

                if (ids.size === 1) {
                    add('museSoloExtension', S.WEIGHTS.soloExtension,
                        'That map names exactly one extension, which is what a fleet image looks like: it carries the extensions it was built with and no others',
                        '1 extension across ' + mapKeys.length + ' map key(s)');
                }
                break;
            }
        } catch (e) { /* leave unscored */ }

        // Mandatory gates, evaluated after every signal has had its say so the
        // report can show what did fire next to what was missing.
        const fired = indicators.map(i => i.name);
        const missing = S.REQUIRED.filter(name => fired.indexOf(name) === -1);

        if (missing.length) {
            // Only worth raising when everything else already crossed the line.
            // That combination is what a re-cut image looks like from outside,
            // and it is the signal that a gate needs revisiting.
            if (score >= S.THRESHOLD) {
                indicators.push({
                    name: 'museGateFailed',
                    description: 'Every other signal lines up but a mandatory gate did not fire; recurring, this means the image changed and the gate needs revisiting rather than that the visitor is human',
                    value: 'missing=' + missing.join(',') + ' score=' + score + '/' + S.THRESHOLD
                });
            }
            return {
                detected: false,
                confidence: 0.0,
                indicators,
                primarySignal: null
            };
        }

        const detected = score >= S.THRESHOLD;
        return {
            detected,
            confidence: detected ? Math.min(0.95, score / 50) : 0.0,
            indicators,
            primarySignal: indicators.length ? indicators[0].name : null
        };
    }

    getBrowserUseEngine() {
        const record = getEngineRecord();
        return record ? evaluateBrowserUse(record) : null;
    }

    /**
     * The Instinct evaluation of the browser-data record, or null while there is none.
     */
    getInstinctEngine() {
        const record = getEngineRecord();
        return record ? evaluateInstinct(record) : null;
    }

    /**
     * Collect the browser-data record the engine rules read (about 5-10 s, once per page; later calls share it).
     * Run it on an idle page: its capacity stage times a GPU fill against a CPU loop.
     * @returns {Promise<Object>} the record
     */
    collectEngineRecord(options) {
        return collectEngineRecord(options);
    }

    /**
     * Use a record the page already collected ({ device, page }, as fingerprint-data.json.html builds it).
     */
    provideEngineRecord(record) {
        return provideEngineRecord(record);
    }

    /**
     * Fired engine rules (BU-L3-1 and strong first) and matched markers, as detector indicators.
     * @private
     */
    _engineIndicators(engine) {
        const out = [];
        for (const r of engine.rules) {
            if (!r.inPlan || r.result !== true || r.level === 'context') continue;
            out.push({
                name: 'Engine_' + r.id,
                description: `${r.name} (${r.level}, ${engine.persona.label} persona)`,
                value: JSON.stringify(r.values)
            });
        }
        for (const m of engine.markers) {
            if (!m.matched) continue;
            out.push({
                name: (m.kind === 'attribution' ? 'BrowserUse_Marker_' : 'Engine_Marker_') + m.id,
                description: `${m.name} (${m.kind === 'attribution' ? 'Browser Use build marker' : 'engine marker'})`,
                value: String(m.value)
            });
        }
        return out;
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
            detectorLog.debug('Error in Playwright detection:', error);
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
            detectorLog.debug(testError);
            
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
            detectorLog.debug('Error in DevTools detection:', error);
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
            'BrowserUse': 'Console Message + Stack Classification (Browser Use highlight log); engine rules per claimed persona + backend build markers',
            'SpoofedPersona': 'Engine rules per claimed persona (WebGL/WebGPU limits, GPU speed, OS-built audio and text) without Browser Use markers',
            'Instinct': 'Linux-build gate (line endings, keyboard, fonts, codecs) + its own infrastructure: injected captcha hook, VM shape, GPU slice',
            'ClaudeAgent': 'Build <=1.0.101: DOM element ids via MutationObserver (claude-agent-glow-border, claude-agent-stop-button, claude-agent-animation-styles, claude-agent-stop-container). Build 1.0.102+: those ids moved into a closed shadow root, so detection is the overlay shadow host (bare DIV, 0 attributes, 0 children, display:contents, 0 client rects), plus hit-test retargeting for liveness and a gated web-accessible-resource fetch for extension identity',
            'CodexAgent': 'DOM Element Detection (codex-agent-overlay-root, codex-browser-sidebar-comments-root)',
            'SigmaAgent': 'Window Global + DOM Element Detection (__SIGMA__ AND __gradient_border_wrapper__)',
            'CursorAgent': 'Window Property Detection (__cursorDialogConfig)',
            'JetskiAgent': 'documentElement Attribute Detection (data-jetski-tab-id)',
            'Thunderbit': 'DOM Element Detection (thunderbit-crx-scout-overlay, thunderbit-crx-side-bar)',
            'PatchedNativeFunctions': 'Native Function Source Inspection (addEventListener / getSupportedExtensions patch markers)',
            'GrokBot': 'Canvas Patch Internals (toDataURL scratch re-render, getImageData noise write-back), hashed per build',
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
