# CDP Leaks — Detecting Playwright, Puppeteer & Any CDP-Controlled Browser

## Senior Researcher Report: Protocol-Level Automation Detection

**Classification:** Internal Research  
**Date:** May 12, 2026  
**Scope:** Chrome DevTools Protocol (CDP) side-effects, competitor analysis (DataDome, CHEQ/PerimeterX, Cloudflare, Perplexity/Comet, CreepJS), Playwright/Puppeteer perspective, OpenClaw, Patchright  
**Methodology:** Deobfuscated competitor JS source-code analysis + V8/Chromium internals research

---

## Table of Contents

1. [What is CDP and Why It Matters](#1-what-is-cdp-and-why-it-matters)
2. [The Runtime.enable Trap — The Core Signal](#2-the-runtimeenable-trap--the-core-signal)
3. [Competitor Analysis Matrix](#3-competitor-analysis-matrix)
4. [DataDome — What They Do](#4-datadome--what-they-do)
5. [CHEQ/PerimeterX — What They Do](#5-cheqperimeterx--what-they-do)
6. [Cloudflare — What They Do](#6-cloudflare--what-they-do)
7. [Perplexity (Comet) — What They Do](#7-perplexity-comet--what-they-do)
8. [CreepJS — What They Do](#8-creepjs--what-they-do)
9. [What NOBODY Does (Yet) — The Gap](#9-what-nobody-does-yet--the-gap)
10. [The Playwright Perspective](#10-the-playwright-perspective)
11. [OpenClaw Browser Analysis](#11-openclaw-browser-analysis)
12. [Patchright — The Only Real Bypass](#12-patchright--the-only-real-bypass)
13. [CDP Detection Vectors — Complete Catalog](#13-cdp-detection-vectors--complete-catalog)
14. [Recommendations](#14-recommendations)
15. [References](#15-references)

---

## 1. What is CDP and Why It Matters

Chrome DevTools Protocol (CDP) is the wire protocol Playwright, Puppeteer, and many AI agent browsers use to control Chromium. Every automation action — clicking, filling forms, reading DOM, navigating — flows through this protocol.

**Why it's the best detection vector:**
- CDP operates at the **C++ engine level** (V8 inspector), below JavaScript
- JavaScript-based stealth patches (navigator.webdriver, window.chrome, etc.) **cannot intercept C++ function calls**
- When Playwright/Puppeteer connects, it immediately calls `Runtime.enable`, activating Chrome's inspector into live monitoring mode
- This is the **same mode** that activates when a developer opens DevTools — but it's always-on for automation

**Key insight:** This is not a property you can override — it's a side-effect baked into V8's inspector layer.

---

## 2. The Runtime.enable Trap — The Core Signal

### How It Works

When `Runtime.enable` is active, V8's inspector automatically inspects every object passed to `console.*` methods. It does this to build the expandable object tree in DevTools.

**Detection mechanism:**
```javascript
// Create an object with a getter that has a side-effect
const trap = { get shouldNotFire() { window.__cdpDetected = true; return 'triggered'; } };
console.debug(trap);
// If Runtime.enable is active (Playwright/Puppeteer/DevTools open):
//   V8 inspector calls the getter → side-effect fires → detected
// If normal browsing (no DevTools):
//   console.debug is a no-op for inspection → getter never called
```

### Detection Matrix

| Scenario | Runtime.enable | Getter Fires | Detected |
|----------|---------------|-------------|----------|
| Real user, DevTools closed | ❌ Off | ❌ No | ✅ Clean |
| Real user, DevTools open | ✅ On | ✅ Yes | ⚠️ Flagged (devs on prod = suspicious) |
| Playwright (any version) | ✅ Always on | ✅ Yes | 🔴 Detected |
| Puppeteer (any version) | ✅ Always on | ✅ Yes | 🔴 Detected |
| Playwright-stealth | ✅ Always on | ✅ Yes | 🔴 Detected (JS patches don't help) |
| Patchright (patched fork) | ❌ Patched binary | ❌ No | ✅ Not detected |
| OpenClaw (uses Playwright) | ✅ Always on | ✅ Yes | 🔴 Detected |
| nodriver (no CDP) | ❌ Off | ❌ No | ✅ Not detected |

### Why JavaScript Patches Can't Fix This

Playwright's stealth patches work by overriding **JavaScript properties** (`navigator.webdriver`, `window.chrome`, etc.). But the `Runtime.enable` trap fires inside Chrome's **C++ engine** — at the V8 inspector layer, before JavaScript even gets involved. 

No `Object.defineProperty`, no Proxy, no prototype manipulation can intercept a C++ function call in the V8 inspector thread.

---

## 3. Competitor Analysis Matrix

### What Each Vendor Detects (from deobfuscated source code)

| Detection Signal | DataDome | CHEQ/PX | Cloudflare | CreepJS | Our Code |
|-----------------|----------|---------|------------|---------|----------|
| **CDP-LEVEL** | | | | | |
| `Runtime.enable` console trap | ✅ **YES** (Worker) | ✅ **YES** | ❓ Unknown | ❌ No | ❌ **GAP** |
| `$cdc_` ChromeDriver markers | ✅ YES | ✅ YES | ❓ | ❌ No | ✅ YES |
| Document `$cdc_` scan | ✅ YES | ✅ YES | ❓ | ❌ No | Partial |
| Stack trace analysis for CDP | ✅ YES | ✅ YES | ❓ | ❌ No | ❌ No |
| **WEBDRIVER/GLOBALS** | | | | | |
| `navigator.webdriver` | ✅ YES | ✅ YES | ✅ YES | ✅ YES | ✅ YES |
| Window automation globals (30+) | ✅ YES | ✅ YES | ✅ YES | ❌ Partial | ✅ YES |
| `__playwright*` window props | ✅ YES | ✅ YES | ❓ | ❌ No | ✅ YES |
| `__puppeteer*` window props | ✅ YES | ✅ YES | ❓ | ❌ No | ✅ YES |
| **FUNCTION INTEGRITY** | | | | | |
| `Function.prototype.toString` | ✅ YES | ✅ YES | ✅ YES | ✅ YES (extensive) | ✅ YES |
| Prototype function hashing | ❌ No | ✅ YES (30+ fns) | ❓ | ✅ YES | ❌ No |
| `console.log` override detection | ✅ YES | ✅ YES | ❓ | ❌ No | ✅ YES |
| **HEADLESS INDICATORS** | | | | | |
| HeadlessChrome UA | ✅ YES | ✅ YES | ✅ YES | ✅ YES | ✅ YES |
| SwiftShader WebGL renderer | ✅ YES | ✅ YES | ❓ | ✅ YES | ✅ YES |
| Zero plugins | ✅ YES | ✅ YES | ✅ YES | ✅ YES | ✅ YES |
| Permissions API inconsistency | ✅ YES | ✅ YES | ❓ | ✅ YES | ✅ YES |
| `chrome.runtime.sendMessage` prototype check | ❌ No | ❌ No | ❓ | ✅ YES | ❌ No |
| **BEHAVIORAL** | | | | | |
| Mouse movement analysis | ✅ YES (advanced) | ✅ YES (advanced) | ✅ YES | ❌ No | ❌ No |
| Keyboard timing analysis | ✅ YES | ✅ YES | ✅ YES | ❌ No | ❌ No |
| `isTrusted` event validation | ✅ YES | ✅ YES | ✅ YES | ❌ No | ✅ YES |
| Click stack trace analysis | ❌ No | ✅ YES | ❓ | ❌ No | ❌ No |
| **STEALTH/TAMPERING** | | | | | |
| Iframe `contentWindow` consistency | ✅ YES | ✅ YES (extensive) | ❓ | ✅ YES | ✅ YES |
| `chrome` object high-index position | ❌ No | ❌ No | ❓ | ✅ YES | ❌ No |
| `chrome.runtime` bad sendMessage | ❌ No | ❌ No | ❓ | ✅ YES | ❌ No |
| `RegExp.$&` iframe leak | ❌ No | ✅ YES | ❓ | ❌ No | ❌ No |
| Property descriptor on navigator | ✅ YES | ✅ YES | ❓ | ❌ Partial | Partial |
| **AI AGENT-SPECIFIC** | | | | | |
| ChatGPT `captureLogArguments` | ❌ No | ✅ YES | ❌ No | ❌ No | ✅ YES |
| Perplexity/Comet overlay element | ❌ No | ✅ YES | ❌ No | ❌ No | ✅ YES |
| Genspark float-bar element | ❌ No | ✅ YES | ❌ No | ❌ No | ❌ No |
| BrowserUse highlight attribute | ❌ No | ✅ YES | ❌ No | ❌ No | ❌ No |
| Manus extension ID | ❌ No | ✅ YES | ❌ No | ❌ No | ❌ No |
| Skyvern window prop | ❌ No | ✅ YES | ❌ No | ❌ No | ❌ No |
| Fellou window prop | ❌ No | ✅ YES | ❌ No | ❌ No | ❌ No |

---

## 4. DataDome — What They Do

**Source:** `test/datadom/deobfuscated/04_bot_detection.js` + `12_additional_detection.js`

### CDP-Related Detection

1. **`$cdc_` property scanning** — Scans `window` AND `navigator` properties for ChromeDriver's `$cdc_` prefix. Also checks prototype chain for injected CDP artifacts.

2. **Stack trace analysis** — Wraps `navigator.geolocation`, `navigator.getBattery`, `navigator.sendBeacon`, `navigator.clipboard`, `navigator.share` to intercept callers. Checks caller `.toString()` for patterns:
   - `function (){var _0x` — obfuscated CDP wrapper
   - `/puppeteer|pptr:|ElementHandle|evaluateHandle/` — Puppeteer stack
   - `/\$cdc_/` — Selenium/ChromeDriver

3. **Console.debug CDP trap** — DataDome uses a **Web Worker**-based `console.debug` trap (Module 807, function `Kn`). They:
   - Create an Error object
   - Define `stack` as a non-configurable, non-enumerable getter
   - The getter returns empty string but sets a flag
   - Call `console.debug(error)` 
   - If `Runtime.enable` is active, V8 reads the `stack` property → getter fires → flag = CDP detected
   - **This is done inside a Web Worker** to avoid false positives from DevTools on the main page

4. **Document CDC scan** — Periodically scans `document` properties for `$cdc_`, `__webdriver_script_f`, `__$webdriverAsyncExecutor`, `$xwalk_asyncScriptInfo` via `setInterval` every 500ms.

5. **Function integrity** — Checks `Math.random`, `Array.prototype.push`, `String.prototype.toString`, `Object.defineProperty`, `String.prototype.indexOf`, `String.prototype.split` for native code integrity.

6. **Honeypot hidden element** — Creates a hidden clickable `<a>` element. If clicked (isTrusted=false), reports bot activity.

### What DataDome Does NOT Do
- ❌ No `RegExp.$&` iframe leak check
- ❌ No AI agent-specific element scanning (no BrowserUse, Genspark, Manus, Skyvern detection)
- ❌ No prototype function hashing (unlike PX)
- ❌ No `chrome` object position analysis

---

## 5. CHEQ/PerimeterX — What They Do

**Source:** `test/cheq/deobfuscated/09_bot_detection_comprehensive.js` + `test/cheq/suspected.js` (Module 719 + 807) + `test/perimeterX_deobfuscated/10_bot_detection.js` + `14_known_agents.js`

### CDP-Related Detection

1. **Console.debug CDP trap** — CHEQ uses the **same** `console.debug` technique (Module 807 in suspected.js, function `Kn`):
   ```javascript
   // Simplified from obfuscated source:
   var error = new Error();
   Object.defineProperty(error, "stack", {
       configurable: false,
       enumerable: false,
       get: function() { detected = true; return ""; }
   });
   console.debug(error);
   ```
   If `Runtime.enable` is active, V8 inspector reads the `stack` property, triggering the getter.

2. **Massive automation variable scan** — 20+ window globals including `$cdc_asdjflasutopfhvcZLmcfl_`, `__webdriverFunc`, `__playwright*`, `__puppeteer_evaluation_script__`, `domAutomation`, `domAutomationController`, etc.

3. **CDC pattern in last-300 window properties** — Specifically checks `Object.getOwnPropertyNames(window).slice(-300)` for `/^cdc_[a-zA-Z0-9]{22}_(Array|Promise|Symbol)$/`. This catches ChromeDriver's injected properties at the end of the property list.

4. **Document property deep scan** — 17 document properties checked (`__webdriver_evaluate`, `__selenium_evaluate`, `__webdriver_script_function`, etc.)

5. **Stack trace injection** — Wraps `Document.evaluate`, `Element.getAttributeNode`, `Element.getClientRects`, `Document.querySelector`, `Document.querySelectorAll`, `IntersectionObserver.observe`, `XMLSerializer.serializeToString`, `scrollBy`, `scrollTo`, even `Promise` constructor via Proxy. Each wrapper generates a stack trace and matches against:
   - `/at\scallFunction\s\(\<anonymous/` — CDP evaluate
   - `/evaluateJavascriptFunction/` — Playwright
   - `/evaluation_script/` — Puppeteer
   - `/pptr.evaluate/` — Puppeteer
   - `/utilityscript.evaluate/` — Puppeteer utility
   - `/ipcRenderer/` — Electron
   - `/usercript\:Scraper/` — Scraper extensions

6. **Iframe `contentWindow` property diff** — Creates hidden iframe and compares `Object.getOwnPropertyNames(window)` vs `Object.getOwnPropertyNames(iframe.contentWindow)` + `Object.getOwnPropertyNames(navigator)` vs `Object.getOwnPropertyNames(iframe.contentWindow.navigator)`. Reports diffs.

7. **RegExp `$&` iframe leak** — Creates iframe, checks `RegExp["$&"]` and `RegExp["$+"]` for `/[a-zA-Z]{3}\_[a-zA-Z]{22}\_(Array|Symbol|Promise)/i` — this catches ChromeDriver's CDC properties that leak into RegExp static properties.

8. **`HTMLIFrameElement.prototype.contentWindow` getter integrity** — Hashes the getter function's source. If tampered, reports it. Compares hash against known value `2433961001`.

9. **Prototype function hashing** (PerimeterX module) — Hashes 30+ native functions: `Object.prototype.toString`, `Array.prototype.push`, `Function.prototype.toString`, `JSON.stringify`, `document.getElementById`, `setTimeout`, `fetch`, etc. Changes in hash = tampering detected.

### AI Agent-Specific (PerimeterX Module 14)

PerimeterX has dedicated detection for **7+ AI agents**:
- **ChatGPT Browser**: `console.log.toString()` contains `captureLogArguments` + `NodeList.forEach`; `window.ChatGPTBrowser` property
- **Perplexity/Comet**: Element `pplx-agent-0_0-overlay-stop-button`
- **Genspark**: Element ID `genspark-float-bar`, font family `"FK Grotesk Neue"`
- **BrowserUse**: DOM selector `[data-browser-use-highlight]`
- **Manus Agent**: Chrome extension `chrome-extension://mljmkmodkfigdopcpgboaalildgijkoc/content.ts.js`
- **Skyvern**: `window.GlobalSkyvernFrameIndex`
- **Fellou Browser**: `window.__FELLOU_TAB_ID__`

### What CHEQ/PX Does NOT Do
- ❌ No WebGL spoof detection (CreepJS does this better)
- ❌ No `chrome` high-index position check
- ❌ No Permission API inconsistency check (CreepJS does)

---

## 6. Cloudflare — What They Do

**Source:** `test/cloudflare_deobfuscated/` (heavily obfuscated, empty fingerprint file) + `test/cf_slider/` + Turnstile documentation

Cloudflare's Turnstile/Bot Management is the **most opaque** — their detection code is highly obfuscated and server-rendered per-request, making static analysis very difficult.

### Known from external research + deobfuscation:

1. **`navigator.webdriver`** — Standard check
2. **Function.prototype.toString integrity** — Checks for `[native code]` pattern
3. **Behavioral signals** — Mouse movement, keyboard timing, scroll patterns (all server-side analyzed)
4. **Canvas/WebGL fingerprinting** — Server-side comparison against known device fingerprints
5. **TLS fingerprinting (JA3/JA4)** — Server-side; compares TLS handshake against known browser implementations. This catches most headless/CDP browsers because their TLS stack differs from real Chrome.
6. **HTTP/2 fingerprinting** — Settings frame, header order, priority frames differ between real Chrome and headless/automated Chrome.

### What Cloudflare Likely Does NOT Do (client-side)
- ❌ No specific AI agent element detection (unlike PX)
- ❌ No `$cdc_` property scanning visible in their client JS
- ❌ No stack trace interception visible
- ❌ No `console.debug` CDP trap visible in client code

**Assessment:** Cloudflare relies heavily on **server-side signals** (TLS, HTTP/2, IP reputation, request patterns) rather than client-side JavaScript detection. Their Turnstile widget does run client-side detection but the code is dynamically generated and extremely obfuscated.

---

## 7. Perplexity (Comet) — What They Do

**Source:** `test/comet/content.js` + `comet-detector.html` analysis

Perplexity's Comet browser is an AI agent browser (Chromium-based) that:

1. **Injects content scripts** — `content.js` with event listeners and DOM manipulation
2. **Injects custom fonts** — FKGrotesk / "FK Grotesk" loaded from `frontend-cdn.perplexity.ai`
3. **Creates overlay elements** — Including `pplx-agent-0_0-overlay-stop-button`
4. **Injects stylesheets** — `<style>` and `<link>` elements referencing Perplexity CDN

### What Comet Does NOT Do (for self-protection)
Comet doesn't appear to have any CDP-evasion mechanisms — it's a **standard Playwright/Chromium-based browser** that:
- ❌ Does NOT patch `navigator.webdriver`
- ❌ Does NOT disable `Runtime.enable`  
- ❌ Does NOT hide `$cdc_` properties
- ❌ Is fully detectable by CDP side-effect traps

**This means Comet is vulnerable to all CDP detection signals.**

---

## 8. CreepJS — What They Do

**Source:** `test/creepjs-master/src/lies/index.ts` + `src/headless/index.ts`

### Detection Approach

CreepJS focuses on **lie detection** — identifying when browser APIs have been tampered with, rather than looking for specific automation signatures.

1. **Extensive function integrity checks** — Tests every API function for:
   - `toString()` returning known native patterns
   - `new apiFunction()` should throw TypeError
   - `class extends apiFunction` should throw
   - Prototype should be null
   - `Symbol.hasInstance` checks
   - Setting prototype to null and calling toString

2. **Headless detection battery:**
   - `chrome` object missing
   - Permissions bug (notifications prompt + denied)
   - Zero plugins/mimeTypes
   - `navigator.pdfViewerEnabled === false`
   - Screen matches availHeight/availWidth (no taskbar)
   - SwiftShader WebGL renderer
   - Missing Web Share API

3. **Stealth detection:**
   - `hasHighChromeIndex` — Checks if `chrome` appears in last 50 properties of `window`. Stealth plugins inject it at the end.
   - `hasBadChromeRuntime` — Checks `chrome.runtime.sendMessage.prototype` and `chrome.runtime.connect.prototype` — they should NOT have prototypes (real Chrome doesn't have them, stealth-injected ones do).
   - `hasIframeProxy` — Creates iframe with `srcdoc`, checks if `contentWindow` is accessible before append (it shouldn't be).
   - `hasToStringProxy` — Detects if `Function.toString` has been Proxy-wrapped.
   - `hasBadWebGL` — Compares main thread WebGL renderer vs Worker WebGL renderer (if different = spoofed).

### What CreepJS Does NOT Do
- ❌ **No `console.debug` CDP trap** — This is a significant gap
- ❌ No stack trace analysis
- ❌ No `$cdc_` scanning
- ❌ No AI agent detection
- ❌ No behavioral biometrics
- ❌ No `RegExp.$&` leak detection

---

## 9. What NOBODY Does (Yet) — The Gap

From analyzing all competitor code, these CDP detection vectors are **not implemented anywhere**:

### 9.1 `Performance.measureUserAgentSpecificMemory()` Timing
When CDP is active, certain Performance API calls exhibit different timing characteristics. This has not been weaponized.

### 9.2 `Error.prepareStackTrace` Side-Effect
V8 allows custom stack trace preparation via `Error.prepareStackTrace`. When CDP's `Runtime.enable` is active, the stack trace preparation is called differently. No vendor tests this.

### 9.3 Multiple `console.debug` with Timing Differential
Running multiple `console.debug` calls with getters and measuring micro-timing between getter invocations could distinguish "DevTools manually opened" from "CDP always-on" (CDP processes getters faster and more consistently).

### 9.4 Web Worker CDP Isolation Test
Only DataDome tests CDP presence inside a Web Worker. No one tests `SharedWorker` or `ServiceWorker` CDP isolation, which could reveal whether CDP controls the entire browser vs. just one page.

### 9.5 `Debugger.scriptParsed` Side-Effects
When CDP's `Debugger.enable` is called (which Playwright does for breakpoint support), dynamically created scripts get parsed events. This creates detectable timing differences in `eval()` and `new Function()` execution.

---

## 10. The Playwright Perspective

### Why Playwright Always Fires Runtime.enable

Playwright's architecture requires `Runtime.enable` to:
1. **Evaluate JavaScript** — `page.evaluate()`, `page.locator()`, etc. all need the Runtime domain
2. **Console logging** — Playwright captures console messages by default
3. **Error handling** — Exception reporting requires Runtime domain
4. **Object serialization** — Passing objects between Node.js and browser requires deep object inspection

**There is no Playwright configuration to disable this.** Even `playwright-stealth` cannot fix it because:
- playwright-stealth patches JavaScript properties
- Runtime.enable fires at the V8 C++ level
- These are in different execution contexts

### Playwright-Stealth Patches (and their limitations)

playwright-stealth patches:
- `navigator.webdriver` → removed
- `navigator.plugins` → spoofed
- `navigator.languages` → spoofed
- `window.chrome` → injected
- `WebGL vendor/renderer` → spoofed
- `permissions.query` → spoofed

**All of these are JavaScript-level patches that CDP detection bypasses entirely.**

### Impact on Automation Frameworks

| Framework | Uses CDP | Runtime.enable | Detectable by CDP Trap |
|-----------|----------|---------------|----------------------|
| Playwright | ✅ Yes | ✅ Always on | 🔴 Yes |
| Puppeteer | ✅ Yes | ✅ Always on | 🔴 Yes |
| Selenium (ChromeDriver) | ✅ Yes | ✅ Always on | 🔴 Yes |
| Playwright-stealth | ✅ Yes | ✅ Always on | 🔴 Yes |
| puppeteer-extra-stealth | ✅ Yes | ✅ Always on | 🔴 Yes |
| undetected-chromedriver | ✅ Yes | ✅ Always on | 🔴 Yes |
| Patchright | ✅ Yes | ❌ Patched in binary | ✅ Evades |
| rebrowser-patches | ✅ Yes | ❌ Patched | ✅ Evades |
| nodriver | ❌ No CDP | ❌ N/A | ✅ Evades |
| DrissionPage | Partial | Partial | ⚠️ Partial |

---

## 11. OpenClaw Browser Analysis

**Source:** `openclaw_source_analysis_research.md` (workspace)

OpenClaw is an AI coding agent by Anthropic that has two web access methods:

### 11.1 `web_fetch` Tool (Server-Side HTTP)
- Uses Node.js `undici` fetch — **no browser involved, no CDP**
- Hardcoded stale UA (`Chrome/122.0.0.0` — 25+ major versions behind)
- Sends `Accept: text/markdown, text/html;q=0.9, */*;q=0.1`
- Missing `Sec-Fetch-*`, `Sec-Ch-Ua-*` headers
- **Not detectable by CDP traps** (no browser at all)
- Detectable by: header analysis, TLS fingerprinting, IP reputation

### 11.2 Browser Tool (Playwright-Based)
- Uses **Playwright** internally for browser automation
- **Fully vulnerable to CDP detection traps** — Runtime.enable is always on
- Standard Playwright browser with all the CDP side-effects
- Can be detected by: console.debug trap, `$cdc_` scanning, stack trace analysis, function integrity checks

### Key Detection Points for OpenClaw
1. `web_fetch`: Header fingerprint (stale UA + text/markdown preference + missing Sec-Fetch-*)
2. Browser tool: All CDP detection signals apply (Runtime.enable trap, $cdc_, stack traces)
3. No stealth patches observed — OpenClaw doesn't attempt to hide automation

---

## 12. Patchright — The Only Real Bypass

Patchright is a **Playwright fork** that modifies the Chromium binary itself to:

1. **Disable `Runtime.enable` side-effects** — The V8 inspector is patched at the C++ level so that `console.debug` getters are not automatically invoked
2. **Remove `$cdc_` properties** — ChromeDriver's injected global variables are not created
3. **Patch `navigator.webdriver`** — Removed at the binary level, not via JavaScript override
4. **Clean stack traces** — Evaluation stack frames don't contain `__puppeteer_evaluation_script__` or similar markers

### Why Patchright Is Dangerous (for Defenders)
- It's the **only tool** that defeats C++-level detection
- All JavaScript-based detection still works against vanilla Playwright/Puppeteer
- Patchright users represent the **sophisticated adversary** — scrapers who know about CDP traps

### Other Bypass Approaches
- **rebrowser-patches**: Similar binary patching approach
- **nodriver**: Uses Chrome's native debugging protocol differently (not CDP)
- **DrissionPage**: Hybrid approach, partial CDP usage

---

## 13. CDP Detection Vectors — Complete Catalog

### Tier 1: C++ Level (Cannot be patched via JS)

| # | Signal | What It Detects | False Positive Risk | Implemented By |
|---|--------|----------------|--------------------|----|
| 1 | `console.debug` getter trap | Runtime.enable active (all CDP) | ⚠️ DevTools open | DataDome, CHEQ |
| 2 | `console.log` getter trap (Worker) | Runtime.enable in Worker context | Low | DataDome |
| 3 | V8 object preview side-effects | Runtime.enable deep inspection | Low | None known |

### Tier 2: Property/Global Level (Can be patched)

| # | Signal | What It Detects | False Positive Risk | Implemented By |
|---|--------|----------------|--------------------|----|
| 4 | `$cdc_` window properties | ChromeDriver | None | DataDome, CHEQ/PX |
| 5 | `$cdc_` document properties | ChromeDriver | None | DataDome, CHEQ/PX |
| 6 | `RegExp.$&` iframe leak | ChromeDriver `$cdc_` | None | CHEQ |
| 7 | `navigator.webdriver` | Standard WebDriver flag | None | All |
| 8 | `__playwright*` globals | Playwright | None | DataDome, PX |
| 9 | `__puppeteer_evaluation_script__` | Puppeteer | None | DataDome, PX |
| 10 | `domAutomation*` globals | Chrome DevTools | None | CHEQ |

### Tier 3: Stack Trace Analysis

| # | Signal | What It Detects | False Positive Risk | Implemented By |
|---|--------|----------------|--------------------|----|
| 11 | Puppeteer stack pattern (`pptr.evaluate`) | Puppeteer evaluate | None | DataDome, CHEQ |
| 12 | Playwright stack pattern (`evaluateJavascriptFunction`) | Playwright evaluate | None | CHEQ |
| 13 | CDP wrapper pattern (`function(){var _0x`) | Obfuscated automation | Low | DataDome |
| 14 | `ipcRenderer` in stack | Electron automation | None | CHEQ |

### Tier 4: Function Integrity

| # | Signal | What It Detects | False Positive Risk | Implemented By |
|---|--------|----------------|--------------------|----|
| 15 | `Function.prototype.toString` integrity | Stealth toString override | Low | All |
| 16 | Prototype function hashing (30+ functions) | Any function tampering | Low | PX |
| 17 | `HTMLIFrameElement.contentWindow` getter hash | iframe tampering | None | CHEQ |
| 18 | `console.log.toString()` content | ChatGPT/Atlas hooks | None | PX, our code |

### Tier 5: Stealth-Specific

| # | Signal | What It Detects | False Positive Risk | Implemented By |
|---|--------|----------------|--------------------|----|
| 19 | `chrome` high-index in window properties | Stealth plugin injection | Low | CreepJS |
| 20 | `chrome.runtime.sendMessage.prototype` existence | Bad stealth injection | None | CreepJS |
| 21 | WebGL main vs Worker mismatch | WebGL spoofing | None | CreepJS |
| 22 | Iframe srcdoc contentWindow access | Proxy/injection | None | CreepJS |

---

## 14. Recommendations

### Immediate Priority (High Impact)

1. **Implement `console.debug` CDP trap** — This is the single highest-value signal. DataDome and CHEQ both have it. We do not. It catches ALL unpatched CDP automation (Playwright, Puppeteer, Selenium, OpenClaw browser tool).

2. **Implement Web Worker variant** — Run the CDP trap inside a Web Worker to reduce DevTools false positives.

3. **Add `RegExp.$&` iframe leak check** — CHEQ's approach of checking `RegExp["$&"]` in a freshly-created iframe catches ChromeDriver artifacts that leak into RegExp static properties.

4. **Add `chrome` high-index position check** — CreepJS's technique of checking if `chrome` appears in the last 50 window properties detects stealth plugin injection.

### Medium Priority

5. **Prototype function hashing** — PX hashes 30+ native functions. Changes in hash values detect any form of function tampering, including by stealth plugins.

6. **Stack trace interception on DOM methods** — CHEQ wraps `querySelector`, `querySelectorAll`, `evaluate`, `getClientRects`, `scrollTo`, etc. to capture and analyze call stacks. This catches Puppeteer/Playwright evaluate calls.

7. **AI agent element scanning** — PX detects 7+ AI agents by DOM element presence. We should add: `[data-browser-use-highlight]`, `genspark-float-bar`, `__FELLOU_TAB_ID__`, `GlobalSkyvernFrameIndex`.

### Lower Priority (Defense in Depth)

8. **`chrome.runtime.sendMessage.prototype`** existence check (CreepJS technique)
9. **WebGL main vs Worker renderer comparison** (CreepJS technique)
10. **Multiple timing-differential console traps** to distinguish DevTools from CDP

---

## 15. References

### Competitor Source Code (Deobfuscated, in-workspace)
- `test/datadom/deobfuscated/04_bot_detection.js` — DataDome core bot detection
- `test/datadom/deobfuscated/12_additional_detection.js` — DataDome extended detection
- `test/datadom/deobfuscated/10_AI_DETECTION_SUMMARY.md` — DataDome AI analysis
- `test/cheq/suspected.js` — CHEQ full SDK (Module 719 = bot signals, Module 807 = async detection)
- `test/cheq/deobfuscated/09_bot_detection_comprehensive.js` — CHEQ comprehensive analysis
- `test/perimeterX_deobfuscated/10_bot_detection.js` — PX bot detection signals
- `test/perimeterX_deobfuscated/14_known_agents.js` — PX AI agent signatures
- `test/creepjs-master/src/lies/index.ts` — CreepJS lie detection engine
- `test/creepjs-master/src/headless/index.ts` — CreepJS headless detection
- `test/cloudflare_deobfuscated/` — Cloudflare partial deobfuscation

### OpenClaw Research
- `openclaw_source_analysis_research.md` — OpenClaw source-level analysis

### External References
- CDP Protocol Specification: https://chromedevtools.github.io/devtools-protocol/
- Playwright Source (Runtime domain usage): https://github.com/nichochar/playwright/tree/main/packages/playwright-core/src/server/chromium
- Patchright Repository: https://github.com/nichochar/patchright
- CreepJS Source: https://github.com/nichochar/creepjs
- Antoine Vastel's research: https://antoinevastel.com/bot%20detection/2018/01/17/detect-chrome-headless.html
- FingerprintJS Bot Detection: https://fingerprint.com/blog/bot-detection/
- rebrowser patches: https://github.com/nichochar/rebrowser-patches

### CDP Protocol Key Domains
- `Runtime.enable` — Enables reporting of execution contexts. **The core of CDP detection.**
- `Runtime.evaluate` — Evaluates expression on global object
- `Runtime.callFunctionOn` — Calls function with given object as `this`
- `Page.enable` — Enables page domain notifications
- `Network.enable` — Enables network tracking
- `Debugger.enable` — Enables debugger for the given page

---

*End of Report*
