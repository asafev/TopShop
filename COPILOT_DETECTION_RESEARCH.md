# Copilot Browser Tool Detection — Research Guide

## Environment Under Test

| Property | Value |
|----------|-------|
| Shell | VS Code 1.117.0 |
| Electron | 39.8.7 |
| Chromium | 142.0.7444.265 |
| Control | Playwright CDP (via `run_playwright_code` tool) |
| Platform | Windows 10 x64 |
| Context | Copilot's embedded browser tool — an Electron BrowserWindow controlled via CDP |

## Architecture

```
VS Code (Electron main process)
  └── Copilot Extension
        └── Playwright CDP client
              └── BrowserWindow (webContents)
                    └── Page context ← where detection JS runs
```

Playwright connects to the Electron BrowserWindow via Chrome DevTools Protocol. The page is a standard Chromium renderer but inherits Electron's restricted feature set.

---

## Detection Methodology

### Core Principle
**Combine CDP serialization artifacts (proves automation) with Electron-specific deficiencies (proves VS Code shell)**. Neither alone is definitive:
- CDP alone → could be DevTools open
- Electron markers alone → could be any Electron app
- Both together → uniquely identifies Copilot browser tool

### How to Discover New Signals

#### 1. CDP Serialization Side-Effects
The most powerful technique. When Playwright connects, it calls `Runtime.enable`, which makes V8 serialize all objects passed to `console.*` methods for the `Runtime.consoleAPICalled` CDP event.

**Test template:**
```javascript
let trapCount = 0;
const trap = new Proxy({}, {
  ownKeys() { trapCount++; return []; },
  get(t, p) { return undefined; },
  getOwnPropertyDescriptor() { return undefined; }
});
const obj = Object.create(trap);

// Use console methods that NORMALLY ignore arguments:
console.groupEnd(obj);  // Best: docs say it ignores args
console.timeLog('x', obj);  // Also works
console.log(obj);  // Works but noisier

// If trapCount > 0 → CDP Runtime.enable is active
```

**Key insight:** `console.groupEnd()` is ideal because its spec says arguments are ignored. The ONLY reason the Proxy would fire is CDP serialization.

**Stack leak technique:** Capture `new Error().stack` INSIDE the Proxy trap to reveal the CDP call chain:
```javascript
ownKeys() {
  const stack = new Error().stack;
  // Stack reveals: at Object.ownKeys → at console.groupEnd → page script
  return [];
}
```

**What fires per console call:**
- `ownKeys`: 2x (serialization + preview)
- `Symbol.toStringTag` getter: 1x (type classification)
- `get` traps: multiple (property enumeration)

**Caveat:** ALL CDP signals also fire when Chrome DevTools is open (same mechanism). This is a known industry limitation confirmed by DataDome/deviceandbrowserinfo.com research.

#### 2. Electron Feature Gaps
Electron strips or stubs many Chrome-specific APIs:

| API | Real Chrome | Electron |
|-----|-------------|----------|
| `window.chrome` | Has `runtime`, `app`, `loadTimes`, `csi` | Empty object (0 own properties) |
| `chrome.loadTimes()` | Function (deprecated but present) | undefined |
| `chrome.csi()` | Function (deprecated but present) | undefined |
| `chrome.runtime` | Object with connect, sendMessage, etc. | undefined |
| `chrome.app` | Object with isInstalled, getDetails, etc. | undefined |
| `navigator.plugins` | 5 PDF-related plugins | 0 plugins |
| `navigator.pdfViewerEnabled` | true | false |
| `navigator.share` | Function | undefined |
| `speechSynthesis.getVoices()` | 20+ voices (Windows) | 3 SAPI5 voices |

#### 3. Client Hints / UA Differences

| Signal | Real Chrome | Electron/Copilot |
|--------|-------------|------------------|
| `navigator.userAgent` | Chrome/xxx | Code/1.117.0 Chrome/xxx Electron/39.8.7 |
| `navigator.userAgentData.brands` | 3 brands (Google Chrome + Chromium + Not_A Brand) | 2 brands (Chromium + Not_A Brand) |
| `getHighEntropyValues(['fullVersionList'])` | Includes "Google Chrome" | Only "Chromium" |

#### 4. Permission/Policy Anomalies

| Permission | Real Chrome (fresh) | Electron/Copilot |
|------------|--------------------|--------------------|
| notifications | "prompt" | "granted" |
| geolocation | "prompt" | "denied" |
| camera | "prompt" | "denied" |
| microphone | "prompt" | "denied" |

**Key pattern:** No permission is EVER "prompt" in Electron. Real Chrome fresh profile: ALL are "prompt".

#### 5. Hardware/OS Mismatch Detection

**Touch inconsistency:**
- Electron: `maxTouchPoints=10` (from OS digitizer) but `'ontouchstart' in window === false`
- Real Chrome: if `maxTouchPoints > 0` then `ontouchstart` is always present

**Audio:**
- `AudioContext.outputLatency`: 0 in Electron (no real audio routing), positive in real Chrome
- `OfflineAudioContext.destination.maxChannelCount`: Always 1 by spec — NOT useful (FP!)
- `AudioContext.destination.maxChannelCount`: 2 in both (not differential)

---

## Confirmed False Positives (Do NOT Use)

| Signal | Why It's FP |
|--------|-------------|
| `OfflineAudioContext.destination.maxChannelCount === 1` | Spec mandates 1 for offline context in ALL browsers |
| `Error.prepareStackTrace !== undefined` | Some Chrome extensions and Node.js set this |
| Stack contains "UtilityScript" or "eval at evaluate" | Only visible from `page.evaluate()`, NOT from inline `<script>` |
| Property access monitoring (monkey-patch then test) | Self-triggering: your own patch fires your own trap |
| `navigator.webdriver === true` | Copilot sets it to `false` via `--disable-blink-features=AutomationControlled` |
| `window.outerWidth === window.innerWidth` | Varies by window state; not reliable |
| Timer coarsening / `performance.now()` precision | Same between Electron and Chrome |

---

## Validated Signals (Current Implementation)

### Tier 1 — Definitive (unique to Copilot)
1. **CDP Stack Leak via console.groupEnd Proxy** (w:50) — Proxy ownKeys fires 2x, stack captured inside trap
2. **CDP Serialization Depth ≥2x** (w:30) — confirms full CDP pipeline active
3. **User-Agent: Code/ + Electron/** (w:40) — UA string identification
4. **Client Hints: Missing "Google Chrome" Brand** (w:25) — only 2 brands vs 3

### Tier 2 — Strong Supporting
5. **Zero Plugins + PDF Viewer Disabled** (w:20)
6. **Empty chrome Object** (w:15) — exists but 0 own properties
7. **chrome.loadTimes / chrome.csi Missing** (w:15)
8. **CDP Symbol.toStringTag Getter Triggered** (w:10) — also fires with DevTools open
9. **Permissions Pattern: no "prompt" state** (w:15) — granted+denied only
10. **Touch Mismatch: maxTouchPoints > 0 but no ontouchstart** (w:15)

### Tier 3 — Weak/Supporting
11. **Notification.permission = "granted"** (w:10)
12. **Limited Speech Synthesis Voices ≤5** (w:5)
13. **Web Share API Unavailable** (w:5)
14. **Audio outputLatency = 0** (w:10)

---

## Research Vectors for New Signals

### High Priority (untested or partially tested)

1. **WebGL context in sandboxed iframes** — sannysoft showed "Canvas has no webgl context" for some iframe tests in Electron. Needs deeper investigation with cross-origin iframes.

2. **Network Information API stability** — `navigator.connection.rtt` reports quantized synthetic values (50/100/150) that may not change with actual network conditions in Electron. Monitor over time to see if they're truly static.

3. **ServiceWorker registration behavior** — Electron supports it but may have different lifecycle or scope behavior compared to real Chrome.

4. **WebRTC candidate gathering** — ICE candidates may differ (no STUN/TURN server responses in Electron automation context). Test `RTCPeerConnection.createOffer()` and candidate events.

5. **Credential Management API** — `PublicKeyCredential.isConditionalMediationAvailable()` returns true in Electron but actual WebAuthn flows may fail differently.

6. **Performance Observer `longtask` entries** — Electron's main process IPC may create observable longtask patterns not seen in real Chrome.

7. **`document.featurePolicy.allowedFeatures()`** — Returns 77 features in Electron. Compare list against real Chrome (may differ).

8. **IndexedDB default databases** — Electron may have different pre-existing databases.

### Medium Priority

9. **Canvas/WebGL rendering differences** — Electron's GPU settings (hardware acceleration on/off) may produce different canvas fingerprints. Test with complex gradient/text/emoji rendering.

10. **`window.screen.isExtended`** — Multi-monitor API behavior in Electron.

11. **File System Access API** — `showOpenFilePicker()` exists but may behave differently when called.

12. **`navigator.getBattery()` values** — Electron may report different charging patterns.

13. **CSS `-webkit-app-region: drag`** — Electron-specific property. While `CSS.supports()` returns true in both, actual computed style behavior may differ.

14. **`performance.memory.jsHeapSizeLimit`** — Both report 4096MB currently, but custom `--max-old-space-size` flags in VS Code's Electron could change this.

15. **Media Devices enumeration** — `navigator.mediaDevices.enumerateDevices()` returns devices in Electron but without labels (no permission granted for label access).

### Low Priority / Speculative

16. **BroadcastChannel cross-tab communication** — Electron BrowserWindows may not share BroadcastChannel scope the way Chrome tabs do.

17. **SharedWorker availability** — May be restricted in Electron's multi-process architecture.

18. **`navigation.entries()` API** — Modern Navigation API behavior in Electron.

19. **Payment Request API** — `new PaymentRequest()` may throw differently.

20. **Web Serial / WebHID / WebNFC APIs** — Present in both but permission/access patterns may differ.

---

## Testing Methodology

### Using Playwright `page.evaluate()`
```javascript
// From the Copilot browser tool:
return page.evaluate(() => {
  // Your detection code runs in the PAGE context
  // Stacks will show "eval at evaluate" — this is NOT visible from inline <script>!
  return { result: 'data' };
});
```

**Critical distinction:** Code injected via `page.evaluate()` runs in a different execution context than inline `<script>` tags. Stack traces differ. Any signal that relies on stack analysis must work from INLINE script context.

### Inline Script Testing
To validate signals work from inline `<script>`:
1. Add the signal to `copilot-detector.html`
2. Reload the page (`page.reload()`)
3. Check results via DOM queries

### Comparing with Real Chrome
Open the same page in regular Chrome:
- With DevTools CLOSED → baseline (no CDP)
- With DevTools OPEN → CDP active but not Electron

### Key sannysoft.com Findings (from Copilot browser)
- `navigator.plugins instanceof PluginArray`: **failed** (important!)
- `screen.width=0, screen.height=0` in their test context
- `iframeChrome: "undefined"` — chrome object in iframe was undefined
- `touchScreen: [10, false, false]` — the mismatch we detect
- All `detailChrome` properties throw TypeError (runtime, app, etc. undefined)

---

## External Resources

- **DataDome CDP research**: https://datadome.co/threat-research/how-new-headless-chrome-the-cdp-signal-are-impacting-bot-detection/
- **deviceandbrowserinfo.com**: https://deviceandbrowserinfo.com/learning_zone/articles/detecting-headless-chrome-puppeteer-2024
- **sannysoft bot detection**: https://bot.sannysoft.com/
- **CreepJS fingerprinting**: https://abrahamjuliot.github.io/creepjs/
- **fpscanner library**: https://github.com/nicedoc/nicedoc.io (Antoine Vastel)
- **Playwright stealth**: https://github.com/nicedoc/nicedoc.io (no longer available — check forks)
- **nodriver (CDP bypass)**: https://github.com/ultrafunkamsterdam/nodriver — bypasses Runtime.enable detection

---

## Key Findings Summary

1. **CDP `Runtime.enable` is the fundamental differentiator** — it causes V8 to serialize console args. Detectable via Proxy traps on `console.groupEnd()`.

2. **Electron creates an empty `window.chrome` stub** — real Chrome always has `runtime`, `app`, and legacy methods.

3. **The permission pattern is highly distinctive** — no "prompt" state ever exists in Electron/automation.

4. **Touch event mismatch is hardware-dependent** — only works on touch-capable machines. On non-touch hardware, `maxTouchPoints=0` in both.

5. **All CDP signals fire with DevTools open** — this is industry-acknowledged, not a bug. The compound scoring approach handles it correctly.

6. **`OfflineAudioContext` maxChannelCount is always 1** — spec behavior, not Electron-specific. Use regular `AudioContext` for audio-based detection.

7. **`navigator.webdriver = false`** in Copilot — they use `--disable-blink-features=AutomationControlled`. Don't rely on webdriver flag.

---

## File Location
- Detection page: `copilot-detector.html`
- Served at: `http://localhost:8000/copilot-detector.html` (python -m http.server)
- Tests run inline from `<script>` tag (NOT injected via page.evaluate)
