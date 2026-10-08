# Comet Browser (Perplexity) — Detection Deep Dive

## Executive Summary

Perplexity's **Comet** browser operates as a **Chromium browser with a built-in extension layer** (based on Brave's engine). The "comet-agent" extension (`npclhjbddhklpbnacpjloidibaggcgon`) injects content scripts into every visited page to provide:
1. **Event interception** — blocks all user input events when the AI agent is active
2. **Visual overlay** — animated border effect indicating agent activity
3. **Screenshot capture** — region/full page capture tool
4. **Selection monitoring** — captures user text selections and sends to extension
5. **Google Docs extraction** — special handling for Google Docs canvas-based content

The **Brave cosmetic filtering engine** also runs separately (for ad blocking), but that's standard Brave behavior, not unique to Comet.

**Key constraint:** Content scripts run in an **isolated world** — they share the DOM but NOT the JavaScript execution context with the page. This means page-level JS cannot directly see content script variables, but CAN detect DOM mutations, event behavioral anomalies, and extension resource probing.

---

## Architecture Analysis

### Extension ID (Hardcoded)
```
npclhjbddhklpbnacpjloidibaggcgon
```
This is the **Comet agent extension ID**, used for `chrome.runtime.sendMessage()` cross-extension communication.

### Content Scripts Injected

| Script | World | Purpose |
|--------|-------|---------|
| `events.js` | Isolated (MAIN possible) | Event blocking layer — intercepts ALL user input |
| `content.js` | Isolated | Overlay UI, screenshot tool, selection monitoring |
| `content_cosmetic.ts` | Isolated | Brave ad-blocking cosmetic filters |
| `procedural_filters.ts` | Isolated | Brave procedural filter engine |

### Sentry Debug IDs (Telemetry)
- `events.js`: `5ebb7c15-cbd2-4771-ab44-9f729f470fde`
- `content.js`: `65991a38-979a-4261-9d08-19bb9e420fe2`

---

## Detection Vectors — Ranked by Feasibility

### 🟢 VECTOR 1: Event Interception Behavioral Detection (HIGH CONFIDENCE)

**How it works:** When Comet's agent is active, `events.js` adds capture-phase listeners for **ALL** input events and calls `stopImmediatePropagation()` + `preventDefault()` on every trusted event.

**Blocked events (complete list from source):**
```
auxclick, click, dblclick, mousedown, mouseenter, mouseleave, mousemove,
mouseout, mouseover, mouseup, mousewheel, wheel, touchcancel, touchend,
touchmove, touchstart, keydown, keyup, keypress, beforeinput, input,
textInput, compositionstart, compositionend, compositionupdate,
pointercancel, pointerdown, pointerenter, pointerleave, pointermove,
pointerout, pointerover, pointerrawupdate, pointerup, drag, dragend,
dragenter, dragleave, dragover, dragstart, drop, selectstart,
contextmenu, change, beforetoggle, submit, reset
```

**Detection technique:**
```javascript
// The extension ONLY blocks `isTrusted: true` events.
// We can detect this by:
// 1. Dispatching a programmatic (untrusted) event — it should pass through
// 2. Creating a real user interaction trap that never fires its handler

// Method A: Timing-based — register a click handler, programmatically
// trigger via element.click() vs waiting for real user click.
// If real user clicks never arrive but synthetic ones do, extension is blocking.

// Method B: The extension skips events where composedPath includes
// the pause button element (id: "pplx-agent-0_0-overlay-stop-button").
// However, that element only exists when overlay is active.

// Method C: Event dispatch ordering detection
function detectEventBlocking() {
    let syntheticFired = false;
    let trustedFired = false;
    
    const el = document.createElement('div');
    document.body.appendChild(el);
    
    el.addEventListener('click', (e) => {
        if (e.isTrusted) trustedFired = true;
        else syntheticFired = true;
    }, { capture: true });
    
    // Synthetic event — will ALWAYS fire (extension ignores non-trusted)
    el.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    
    // If extension is blocking, trusted events from user never arrive
    // Compare after user interaction occurs
    return { syntheticFired, trustedFired };
}
```

**Limitation:** This only works **when the agent is actively running a task** (the `r` flag is `true` in events.js). When the agent is paused or not active, events pass through normally.

**Reliability: MEDIUM** — Only detectable during active agent operation.

---

### 🟢 VECTOR 2: DOM Element Probing (HIGH CONFIDENCE when overlay is active)

**How it works:** When the agent activates, `content.js` injects specific DOM elements with identifiable IDs and class patterns.

**Detectable DOM elements:**

| Element ID | When Present |
|-----------|-------------|
| `pplx-agent-0_0-overlay` | During active agent task |
| `pplx-agent-0_0-overlay-base` | During active agent task |
| `pplx-agent-0_0-overlay-stop-button` | During active agent task (unless simpleMode) |
| `content-script-overlay` | During screenshot capture |
| `content-script-selection-box` | During screenshot capture |
| `content-script-selection-box-outline` | During screenshot capture |
| `content-script-overlay-instructions` | During screenshot capture |

**Detection technique:**
```javascript
function detectCometOverlay() {
    // Direct ID check — most reliable when agent is active
    const overlayIds = [
        'pplx-agent-0_0-overlay',
        'pplx-agent-0_0-overlay-base',
        'pplx-agent-0_0-overlay-stop-button'
    ];
    
    for (const id of overlayIds) {
        if (document.getElementById(id)) return true;
    }
    return false;
}

// Continuous monitoring via MutationObserver
function monitorForComet(callback) {
    const observer = new MutationObserver((mutations) => {
        for (const mutation of mutations) {
            for (const node of mutation.addedNodes) {
                if (node.nodeType === 1) {
                    const el = node;
                    if (el.id?.startsWith('pplx-agent-')) {
                        callback(true);
                        return;
                    }
                }
            }
        }
    });
    observer.observe(document.body || document.documentElement, {
        childList: true, subtree: true
    });
    return observer;
}
```

**User stated:** "We cannot detect when he injects something to the DOM" — this suggests they've already explored this and found it unreliable (perhaps overlay is not always active, or was removed in newer versions).

**Reliability: LOW-MEDIUM** — Only works during active agent tasks. Perplexity could easily randomize IDs.

---

### 🟢 VECTOR 3: CSS Cursor Override Detection (MEDIUM-HIGH CONFIDENCE)

**How it works:** When blocking is active, `events.js` injects a `<style>` element that forces ALL elements to show `cursor: progress`:

```css
html body *,
html body *::before,
html body *::after {
    cursor: progress !important;
}

html body #pplx-agent-0_0-overlay-stop-button,
html body #pplx-agent-0_0-overlay-stop-button * {
    cursor: pointer !important;
}
```

**Detection technique:**
```javascript
function detectCometCursorOverride() {
    // Check computed style of any element
    const el = document.createElement('div');
    el.style.cursor = 'default';
    document.body.appendChild(el);
    
    const computed = getComputedStyle(el).cursor;
    document.body.removeChild(el);
    
    // If cursor is "progress" despite being set to "default",
    // the extension's !important rule is overriding it
    return computed === 'progress';
}
```

**NOTE:** User mentioned "they used to inject some style sheet - but stopped." This may mean the cursor style injection was removed in newer versions. However, from the **current source code** (`events.js`), it is still present and appended to `document.body` when blocking is active.

**Reliability: MEDIUM** — Only during active blocking. Could be removed by Perplexity in future.

---

### ❌ VECTOR 4: `window.__PPLX_CONTENT_SCRIPT__` Global Detection — CONFIRMED DEAD

**Status: DOES NOT WORK.** Tested and confirmed — content scripts run in ISOLATED world. `window.__PPLX_CONTENT_SCRIPT__` is invisible to page JS. Removed from detector.

---

### ❌ VECTOR 5: `_sentryDebugIds` Global Pollution — CONFIRMED DEAD

**Status: DOES NOT WORK.** Tested and confirmed — `_sentryDebugIds` is set in the isolated world's `window`, not the page's. Invisible to page JS. Removed from detector.

---

### ❌ VECTOR 6: Extension Resource Probing — CONFIRMED DEAD

**Status: DOES NOT WORK.** Chrome blocks ALL `chrome-extension://` requests from pages unless resources are explicitly listed in `web_accessible_resources` with matching origin patterns. Comet does not do this. Results in console error spam (`ERR_FAILED`, "Denying load of...") with zero detection value. Removed from detector.

---

### ❌ VECTOR 7: `chrome.runtime.sendMessage` to Known Extension ID — LIKELY DEAD

**Status: Almost certainly does not work.** Requires Comet to declare `externally_connectable.matches` for our origin — they have no reason to do this. Without it, `chrome.runtime.sendMessage` always fails regardless of whether the extension is installed. Not implemented in detector.

---

### 🟡 VECTOR 8: CSS Class Naming Pattern Detection (LOW-MEDIUM)

**How it works:** `content.js` uses distinctive CSS class prefixes:
- `agi-fixed`, `agi-top-0`, `agi-left-0`, `agi-w-full`, `agi-h-full`, `agi-z-[1000]`, `agi-bg-[rgba(0,0,0,0.5)]`
- `agi-relative`, `agi-bg-black`, `agi-p-6`, `agi-rounded-md`, `agi-text-white`, `agi-z-[1001]`

These are Tailwind-style utility classes with the `agi-` prefix.

**Detection technique:**
```javascript
function detectAgiClasses() {
    const elements = document.querySelectorAll('[class*="agi-"]');
    return elements.length > 0;
}
```

**Reliability: LOW** — Only present during screenshot tool activation. Easily changeable.

---

### 🟡 VECTOR 9: CSS Custom Property Detection (`--pplx-overlay-gradient`)

**How it works:** The overlay element uses `borderImage: var(--pplx-overlay-gradient)`.

**Detection technique:**
```javascript
function detectPplxCssVar() {
    // Check if any element uses --pplx-overlay-gradient
    const testEl = document.createElement('div');
    testEl.style.borderImage = 'var(--pplx-overlay-gradient)';
    document.body.appendChild(testEl);
    const computed = getComputedStyle(testEl).borderImage;
    document.body.removeChild(testEl);
    
    // If the CSS variable is defined (by extension's stylesheet), 
    // computed value will be non-empty
    // This is unreliable since CSS vars in isolated stylesheets 
    // may not propagate to page context
    return computed !== '' && computed !== 'none';
}
```

**Reliability: VERY LOW** — CSS custom properties from extension-injected stylesheets may or may not be visible depending on injection method.

---

### 🟡 VECTOR 10: `entropy-content-script` Class on `<html>` (MEDIUM when screenshot tool active)

**How it works:** The screenshot tool adds a class to `document.documentElement`:
```javascript
document.documentElement.classList.add('entropy-content-script');
```

**Detection technique:**
```javascript
function detectEntropyClass() {
    return document.documentElement.classList.contains('entropy-content-script');
}
```

**Reliability: LOW** — Only during screenshot capture. Very brief window.

---

### 🔴 VECTOR 11: Font Family Detection (`FKGroteskNeue`)

**How it works:** The screenshot overlay instructions div uses:
```javascript
e.style.fontFamily = 'FKGroteskNeue';
```

This is Perplexity's custom font. If the extension loads web fonts, the browser may fetch them.

**Detection technique:**
```javascript
async function detectFKGroteskNeue() {
    // Check if FKGroteskNeue font is available
    return document.fonts.check('16px FKGroteskNeue');
}
```

**Reliability: VERY LOW** — The font is likely loaded from extension resources (not accessible to page). The font check would only return true if the font CSS is injected into the page context.

---

### 🔴 VECTOR 12: `@property --a` CSS Registration (SPECULATIVE)

**How it works:** The overlay injects a `<style>` with:
```css
@property --a {
    syntax: '<angle>';
    initial-value: 0deg;
    inherits: false;
}
@keyframes a {
    to { --a: 1turn }
}
```

If this is registered globally (via `CSS.registerProperty` or `@property` in a style element appended to the page DOM), it could be detected.

**Detection technique:**
```javascript
function detectRegisteredProperty() {
    // @property registrations are global and visible to all stylesheets
    // Try to re-register --a and see if it fails (already registered)
    try {
        CSS.registerProperty({
            name: '--a',
            syntax: '<angle>',
            initialValue: '0deg',
            inherits: false
        });
        // If it succeeds, it wasn't registered before
        return false;
    } catch (e) {
        // DOMException: already registered
        return true;
    }
}
```

**However:** `@property` in a `<style>` element appended to the DOM by a content script WILL be visible to the page, because CSS rules affect the shared DOM regardless of JS world isolation!

**CONFIRMED FALSE POSITIVE:** `--a` is far too generic. Many CSS animation libraries, page frameworks, and even our own detector page register `--a`. Additionally, `CSS.registerProperty()` has a side-effect — once you call it to "test," it registers the property, causing self-FP on subsequent scans. **Removed from detector.**

---

### ❌ VECTOR 13: Brave Browser Detection — CONFIRMED USELESS

**Status:** Comet does NOT expose `navigator.brave`. They use a stock Chrome UA string. Even if it did, detecting Brave has massive false positives (millions of Brave users). Removed from detector.

---

### ❌ VECTOR 14: User-Agent / Brand Detection — CONFIRMED USELESS

**Status:** Comet uses a completely stock Chrome UA string. No "Comet", "Perplexity", or "Brave" appears in `navigator.userAgent` or `navigator.userAgentData.brands`. Standard Chrome brands are reported. Removed from detector.

---

### 🟡 VECTOR 15: Selection Change Event Monitoring (BEHAVIORAL)

**How it works:** `content.js` immediately calls `N()` (the selection monitoring function) which:
1. Adds a `selectionchange` listener on `document`
2. Adds a `mouseup` listener on `document`
3. Adds a `keyup` listener on `document`
4. Sends `USER_SELECTION_CAPTURED` messages to the extension on every selection change

**Detection technique:**
```javascript
// The extension's selection listener fires chrome.runtime.sendMessage
// for every selection change. While we can't see the message,
// we MIGHT detect the timing overhead.

function detectSelectionMonitoring() {
    // Method: Rapid selection changes and measure if there's
    // unusual overhead (due to extension's debounced handler)
    // The extension uses 150ms debounce (var M = 150)
    
    // This is extremely speculative and unlikely to be reliable
    return false;
}
```

**Reliability: VERY LOW** — No practical way to detect event listeners added by isolated world scripts.

---

## Advanced / Chromium-Internal Vectors

### 🟡 VECTOR 16: Performance Observer — Script Compilation Entries

**How it works:** Chromium's Performance API may expose script compilation for content scripts.

```javascript
function detectContentScriptPerformance() {
    const entries = performance.getEntriesByType('resource');
    // Content scripts loaded via chrome-extension:// won't appear here
    // But if they fetch resources, those might appear
    
    const extensionEntries = entries.filter(e => 
        e.name.includes('chrome-extension://') ||
        e.name.includes('npclhjbddhklpbnacpjloidibaggcgon')
    );
    
    return extensionEntries.length > 0;
}
```

**Reliability: VERY LOW** — Chrome intentionally hides extension resource loads from page-visible Performance API.

---

### 🟡 VECTOR 17: MutationObserver Race Condition

**How it works:** If we set up a MutationObserver BEFORE the extension's content script runs (via `document_start`), we might catch DOM modifications made by the extension.

```javascript
// This must run at document_start (before content scripts with run_at: document_idle)
// Typically impossible from inline page script if extension runs at document_start

// However, if the extension runs at document_idle or document_end,
// a page script in <head> might beat it:

const earlyObserver = new MutationObserver((mutations) => {
    for (const mutation of mutations) {
        for (const node of mutation.addedNodes) {
            if (node.nodeType === 1) {
                const el = node;
                // Check for Comet-specific elements
                if (el.id?.startsWith('pplx-agent') || 
                    el.tagName === 'STYLE') {
                    console.log('Comet detected via early mutation:', el);
                }
            }
        }
    }
});

earlyObserver.observe(document.documentElement, {
    childList: true, subtree: true, attributes: true
});
```

**Reliability: MEDIUM** — Depends on timing. If extension content scripts run at `document_start`, page scripts can't beat them.

---

### 🟢 VECTOR 18: Style Element Injection Detection (BEST PASSIVE VECTOR)

**How it works:** The `events.js` script appends a `<style>` element to `document.body` when blocking is active. This style element:
1. Is a real DOM node in the shared DOM
2. Has specific CSS content (`cursor: progress !important`)
3. Contains the text `pplx-agent-0_0-overlay-stop-button`

Even though the JS runs in isolated world, **DOM mutations are shared**.

**Detection technique:**
```javascript
function detectCometStyleInjection() {
    // Scan all style elements in body (unusual location for styles)
    const bodyStyles = document.body?.querySelectorAll('style') || [];
    
    for (const style of bodyStyles) {
        const text = style.textContent || style.innerText || '';
        if (text.includes('cursor: progress') && 
            text.includes('pplx-agent')) {
            return true;
        }
        // More general: any style forcing cursor:progress on everything
        if (text.includes('cursor: progress !important') &&
            text.includes('html body *')) {
            return true;
        }
    }
    return false;
}

// Continuous monitoring
function monitorForCometStyles(callback) {
    const observer = new MutationObserver((mutations) => {
        for (const mutation of mutations) {
            for (const node of mutation.addedNodes) {
                if (node.nodeType === 1 && node.tagName === 'STYLE') {
                    const text = node.textContent || '';
                    if (text.includes('cursor: progress') ||
                        text.includes('pplx-agent')) {
                        callback(true, node);
                    }
                }
            }
        }
    });
    observer.observe(document.body || document.documentElement, {
        childList: true, subtree: true
    });
    return observer;
}
```

**USER NOTE:** You mentioned they "used to inject some style sheet - but stopped." If this is true in the latest version, this vector is dead. But the source code you provided STILL contains this behavior in `events.js`. Verify with actual Comet browser.

**Reliability: MEDIUM-HIGH when active** — The style IS in shared DOM. But only during active agent tasks.

---

## Comprehensive Detection Strategy

### Recommended Approach: Multi-Signal Passive Monitor

Since no single vector is reliable at all times, implement a **passive monitoring system** that watches for multiple signals simultaneously:

```javascript
class CometDetector {
    constructor() {
        this.signals = {};
        this.detected = false;
        this.observers = [];
    }
    
    start() {
        // 1. One-time checks
        this.checkUA();
        this.checkBraveEngine();
        this.probeExtensionResources();
        
        // 2. Continuous monitoring
        this.startDOMMonitor();
        this.startEventMonitor();
        this.startStyleMonitor();
    }
    
    checkUA() {
        const ua = navigator.userAgent;
        const brands = navigator.userAgentData?.brands || [];
        this.signals.ua = {
            hasBrave: /Brave/i.test(ua),
            hasComet: /Comet/i.test(ua),
            brands: brands.map(b => b.brand)
        };
    }
    
    checkBraveEngine() {
        this.signals.brave = {
            navigatorBrave: 'brave' in navigator,
            isBrave: navigator.brave?.isBrave?.() // returns Promise
        };
    }
    
    async probeExtensionResources() {
        const id = 'npclhjbddhklpbnacpjloidibaggcgon';
        // Try to load a known resource
        this.signals.extensionProbe = await new Promise(resolve => {
            const img = new Image();
            img.onload = () => resolve('loaded');
            img.onerror = () => resolve('error');
            img.src = `chrome-extension://${id}/icons/icon128.png`;
            setTimeout(() => resolve('timeout'), 3000);
        });
    }
    
    startDOMMonitor() {
        const obs = new MutationObserver((mutations) => {
            for (const m of mutations) {
                for (const node of m.addedNodes) {
                    if (node.nodeType !== 1) continue;
                    const el = node;
                    
                    // Check for known Comet element IDs
                    if (el.id?.startsWith('pplx-agent')) {
                        this.signals.domOverlay = true;
                        this.evaluate();
                    }
                    
                    // Check for injected styles
                    if (el.tagName === 'STYLE') {
                        const text = el.textContent || '';
                        if (text.includes('pplx-agent') || 
                            (text.includes('cursor: progress') && 
                             text.includes('html body'))) {
                            this.signals.styleInjection = true;
                            this.evaluate();
                        }
                    }
                    
                    // Check for agi- prefixed classes
                    if (el.className?.includes?.('agi-')) {
                        this.signals.agiClasses = true;
                        this.evaluate();
                    }
                }
            }
        });
        obs.observe(document.documentElement, { childList: true, subtree: true });
        this.observers.push(obs);
    }
    
    startEventMonitor() {
        // Test if events are being swallowed
        const testEl = document.createElement('div');
        testEl.style.cssText = 'position:fixed;top:-9999px;left:-9999px;width:1px;height:1px;';
        document.body.appendChild(testEl);
        
        let lastTrustedEvent = 0;
        testEl.addEventListener('pointermove', (e) => {
            if (e.isTrusted) lastTrustedEvent = Date.now();
        });
        
        // If user is interacting but no trusted events arrive on our element,
        // something is blocking them
        this.eventTestElement = testEl;
        this.lastTrustedEvent = lastTrustedEvent;
    }
    
    startStyleMonitor() {
        // Periodically check computed cursor
        setInterval(() => {
            const el = document.body;
            if (el && getComputedStyle(el).cursor === 'progress') {
                this.signals.cursorOverride = true;
                this.evaluate();
            }
        }, 2000);
    }
    
    evaluate() {
        // Scoring: multiple weak signals = detection
        let score = 0;
        if (this.signals.domOverlay) score += 40;
        if (this.signals.styleInjection) score += 30;
        if (this.signals.cursorOverride) score += 25;
        if (this.signals.agiClasses) score += 20;
        if (this.signals.brave?.navigatorBrave) score += 10;
        if (this.signals.extensionProbe === 'loaded') score += 50;
        if (this.signals.ua?.hasComet) score += 50;
        
        this.detected = score >= 30;
        return { score, detected: this.detected, signals: this.signals };
    }
    
    destroy() {
        this.observers.forEach(o => o.disconnect());
        if (this.eventTestElement) {
            this.eventTestElement.remove();
        }
    }
}
```

---

## What CANNOT Be Detected (Isolated World Limitations)

| What | Why Not |
|------|---------|
| `window.__PPLX_CONTENT_SCRIPT__` | Set in isolated world, invisible to page |
| `window._sentryDebugIds` from extension | Set in isolated world |
| `chrome.runtime.onMessage` listeners | Isolated world API |
| Content script variables/functions | Isolated world isolation |
| Number of event listeners added by extension | `getEventListeners()` only in DevTools |
| Extension's `chrome.runtime.sendMessage` calls | Not observable from page |
| Extension's MutationObservers | Isolated world |

---

## What CAN Be Detected (Shared DOM Surface)

| What | How |
|------|-----|
| DOM elements injected by extension | `getElementById`, `querySelector`, MutationObserver |
| Style elements appended to DOM | Same as above |
| CSS rules from injected stylesheets | `getComputedStyle()`, `document.styleSheets` |
| CSS `@property` registrations | `CSS.registerProperty()` will throw if already registered |
| Classes/attributes on existing elements | `classList`, `getAttribute` |
| Event blocking behavior | Dispatch trusted vs synthetic events, observe absence |
| Extension resource URLs | Fetch/Image probes to `chrome-extension://ID/` |
| UA string modifications | `navigator.userAgent`, `navigator.userAgentData` |

---

## Timing Considerations

| State | Detectable Signals |
|-------|-------------------|
| **Comet idle** (no agent task) | UA only, extension resource probe, Brave engine checks |
| **Agent task starting** | Overlay elements appear, style injection, cursor change |
| **Agent task active** | All DOM signals visible, event blocking active |
| **Agent task paused** | Overlay hidden, style removed, events pass through |
| **Screenshot tool active** | `entropy-content-script` class, agi- elements, overlay |

---

## Recommendations

### Priority 1: Passive Monitoring (No False Positives)
- MutationObserver watching for `pplx-agent-*` prefixed element IDs
- Style injection monitoring for `cursor: progress !important` patterns
- These have **zero false positive risk** — no legitimate site uses these specific strings

### Priority 2: Active Probing (May Have False Positives)
- Extension resource probing via `chrome-extension://npclhjbddhklpbnacpjloidibaggcgon/`
- `navigator.brave` detection (high false positive — all Brave users)
- UA string analysis

### Priority 3: Behavioral Analysis (Complex, Timing-Dependent)
- Event blocking detection (only during active tasks)
- Cursor style override detection (only during active tasks)
- `@property --a` registration collision (only during overlay animation)

### What NOT To Rely On:
- `window.__PPLX_CONTENT_SCRIPT__` — isolated world, invisible
- `_sentryDebugIds` — isolated world, invisible
- Font detection — extension resources not accessible
- Selection monitoring overhead — unmeasurable

---

## Open Questions Requiring Live Testing

1. **Does Comet expose `navigator.brave`?** — Perplexity may have patched this out
2. **What is Comet's exact UA string?** — Need a Comet browser instance to check
3. **Are any extension resources web-accessible?** — Need to inspect manifest.json
4. **Does `events.js` run in MAIN world or ISOLATED?** — If MAIN world, `_sentryDebugIds` leaks
5. **Does the style injection still exist in latest Comet?** — User says removed, source says present
6. **Does Comet have any `externally_connectable` config?** — Enables page → extension messaging
7. **Does the extension inject any MAIN world scripts?** — Would expose globals to page

---

## Appendix: Extension Identification Data

```
Extension ID:       npclhjbddhklpbnacpjloidibaggcgon
Sentry Debug ID 1:  5ebb7c15-cbd2-4771-ab44-9f729f470fde (events.js)
Sentry Debug ID 2:  65991a38-979a-4261-9d08-19bb9e420fe2 (content.js)
CSS Prefix:         agi-
ID Prefix:          pplx-agent-
Overlay ID:         pplx-agent-0_0-overlay
Base ID:            pplx-agent-0_0-overlay-base
Button ID:          pplx-agent-0_0-overlay-stop-button
HTML Class:         entropy-content-script
Font:               FKGroteskNeue
CSS Variable:       --pplx-overlay-gradient
CSS Property:       --a (angle, for animation)
Message Types:      BROWSER_TASK_PAUSE_RESUME, CAPTURE_FULL_SCREENSHOT,
                    CAPTURE_VISIBLE_TAB, CAPTURE_PARTIAL_SCREENSHOT,
                    USER_SELECTION_CAPTURED, START_OVERLAY, STOP_OVERLAY,
                    START_BLOCKING, STOP_BLOCKING
```
