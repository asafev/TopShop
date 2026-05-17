# OpenClaw Detection V2 — JavaScript Detection Methods
## Client-Side Detection of OpenClaw's Browser Tool via JS

**Date:** May 14, 2026  
**Scope:** Detection methods that work from inline page JavaScript when OpenClaw's browser tool visits your page  
**Important:** These methods ONLY apply to the **browser tool** — web_fetch does NOT execute JavaScript.

---

## 1. Context: OpenClaw's Browser Tool Architecture

When OpenClaw uses its browser tool:
- Launches the user's **real Chrome binary** (not bundled Chromium)
- Adds `--disable-blink-features=AutomationControlled` (suppresses `navigator.webdriver`)
- Creates isolated user data dir at `~/.openclaw/browser/openclaw/user-data/`
- Connects via **CDP (Chrome DevTools Protocol)** on ports 18800-18899
- Uses **Playwright-on-CDP** for interactions (click, type, snapshot, fill)
- Default: `headless: false` (full GUI mode)
- Takes accessibility tree snapshots between actions

**This means:** The browser IS real Chrome. No UA spoofing, no TLS mismatch, no header anomalies. Detection must rely on CDP side-effects, behavioral patterns, and profile characteristics.

---

## 2. PROVEN Detection Methods (from Our Existing Research)

### 2.1 CDP Proxy Trap (console.groupEnd) — HIGH CONFIDENCE

**Status:** PROVEN in copilot-detector.html, applies to ALL CDP-controlled browsers including OpenClaw.

```javascript
function detectCDP() {
  return new Promise((resolve) => {
    let trapCount = 0;
    const proxy = new Proxy({}, {
      ownKeys() {
        trapCount++;
        return [];
      }
    });
    console.groupEnd(proxy);
    // CDP Runtime.enable causes V8 to serialize console args
    // This triggers Proxy.ownKeys 2x per call
    setTimeout(() => {
      resolve(trapCount >= 2); // 0 = normal Chrome, 2+ = CDP active
    }, 50);
  });
}
```

**Why it works for OpenClaw:** OpenClaw connects to Chrome via CDP WebSocket. `Runtime.enable` is called by Playwright, which causes V8 to serialize all console arguments, triggering the Proxy trap.

**False positive:** Also fires with Chrome DevTools open (same CDP mechanism).

### 2.2 Navigator Properties — Partial Profile

Since OpenClaw uses the real Chrome binary with an isolated profile:

```javascript
function checkCleanProfile() {
  const signals = {};
  
  // Fresh profile = no extensions (plugins may still be present)
  signals.extensionCount = (window.chrome?.runtime?.id) ? 1 : 0;
  
  // Fresh profile = no saved passwords, no autofill
  // This is behavioral, not a hard signal
  
  // navigator.webdriver is suppressed by --disable-blink-features
  signals.webdriver = navigator.webdriver; // false (suppressed)
  
  return signals;
}
```

**Limited value:** Since `navigator.webdriver` is suppressed and it's real Chrome, most navigator property checks pass.

---

## 3. NEW Detection Vectors (From V2 Analysis)

### 3.1 Isolated User Profile Detection — MEDIUM CONFIDENCE

OpenClaw creates a fresh, isolated Chrome profile. A real user's Chrome has:
- Browsing history
- Saved passwords
- Extensions
- Bookmarks
- Cookie stores

**Detection approach:**

```javascript
async function detectFreshProfile() {
  const signals = {};
  
  // 1. Check for Credential Management API
  if (navigator.credentials) {
    try {
      // Fresh profile = no stored credentials
      const cred = await navigator.credentials.get({ 
        password: true,
        mediation: 'silent' 
      });
      signals.hasCredentials = !!cred;
    } catch(e) {
      signals.credentialError = true;
    }
  }
  
  // 2. Check localStorage/sessionStorage emptiness
  signals.localStorageEmpty = localStorage.length === 0;
  signals.sessionStorageEmpty = sessionStorage.length === 0;
  
  // 3. Check for lack of IndexedDB databases
  if (indexedDB.databases) {
    const dbs = await indexedDB.databases();
    signals.noIndexedDB = dbs.length === 0;
  }
  
  // 4. Check cookie count (fresh profile = minimal cookies)
  signals.cookieCount = document.cookie.split(';').filter(c => c.trim()).length;
  
  // 5. ServiceWorker registrations (fresh profile = none)
  if (navigator.serviceWorker) {
    const regs = await navigator.serviceWorker.getRegistrations();
    signals.noServiceWorkers = regs.length === 0;
  }
  
  return signals;
}
```

**Weakness:** First-time visitors also have empty profiles for your site. This only works if combined with other signals.

### 3.2 Accessibility Tree Snapshot Detection — NEW, MEDIUM CONFIDENCE

OpenClaw takes **accessibility tree snapshots between every action** (Issue #44431). This is its primary way of "seeing" the page. The Playwright `page.accessibility.snapshot()` call queries the accessibility tree via CDP's `Accessibility.getFullAXTree`.

**Detection approach — aria-live mutation trap:**

```javascript
function detectAccessibilitySnapshotting() {
  return new Promise((resolve) => {
    let snapshotDetected = false;
    
    // Create an aria-live region that monitors for AX tree queries
    const trap = document.createElement('div');
    trap.setAttribute('aria-live', 'polite');
    trap.setAttribute('role', 'status');
    trap.style.position = 'absolute';
    trap.style.left = '-9999px';
    document.body.appendChild(trap);
    
    // Monitor for getComputedRole / getComputedLabel calls
    // These CDP methods are used by Playwright's snapshot
    const originalGetComputedRole = Element.prototype.computedRole;
    
    // Watch for rapid aria attribute queries (snapshot pattern)
    let ariaQueryCount = 0;
    const observer = new MutationObserver(() => {
      ariaQueryCount++;
      if (ariaQueryCount > 10) {
        snapshotDetected = true;
      }
    });
    
    observer.observe(document.body, {
      attributes: true,
      attributeFilter: ['aria-label', 'aria-describedby', 'role'],
      subtree: true
    });
    
    setTimeout(() => {
      observer.disconnect();
      trap.remove();
      resolve(snapshotDetected);
    }, 3000);
  });
}
```

**Note:** This is speculative — the actual CDP accessibility tree query may not trigger DOM-level observations. Needs testing.

### 3.3 Input Event Forensics — MEDIUM CONFIDENCE

OpenClaw uses CDP `Input.dispatchMouseEvent` and `Input.dispatchKeyEvent` for interactions. These produce subtly different events from real user input:

```javascript
function monitorInputEvents() {
  const events = [];
  
  document.addEventListener('click', (e) => {
    events.push({
      type: 'click',
      isTrusted: e.isTrusted,
      // CDP dispatched events have sourceCapabilities = null
      sourceCapabilities: e.sourceCapabilities,
      // CDP clicks may have fractional/integer coords
      screenX: e.screenX,
      screenY: e.screenY,
      clientX: e.clientX,
      clientY: e.clientY,
      // CDP clicks lack preceding mousemove events
      timestamp: e.timeStamp
    });
  });
  
  document.addEventListener('mousemove', (e) => {
    events.push({
      type: 'mousemove',
      timestamp: e.timeStamp
    });
  });
  
  // After some time, analyze patterns:
  // - Click without preceding mousemove = CDP
  // - sourceCapabilities === null = CDP
  // - Perfect integer coordinates = likely CDP
  // - Uniform timing between keystrokes = CDP
  
  return events;
}

function analyzeInputPattern(events) {
  const clicks = events.filter(e => e.type === 'click');
  const moves = events.filter(e => e.type === 'mousemove');
  
  const signals = {};
  
  // Signal 1: Clicks without preceding mouse movement
  signals.clicksWithoutMovement = clicks.filter(click => {
    const precedingMoves = moves.filter(m => 
      m.timestamp < click.timestamp && 
      m.timestamp > click.timestamp - 200
    );
    return precedingMoves.length === 0;
  }).length;
  
  // Signal 2: null sourceCapabilities
  signals.nullSourceCapabilities = clicks.filter(c => 
    c.sourceCapabilities === null
  ).length;
  
  // Signal 3: Perfect integer coordinates (humans produce subpixel)
  signals.integerCoords = clicks.filter(c => 
    c.clientX === Math.floor(c.clientX) && 
    c.clientY === Math.floor(c.clientY)
  ).length;
  
  return signals;
}
```

### 3.4 CDP Port Detection — LOW CONFIDENCE (localhost only)

OpenClaw's CDP connection uses ports 18800-18899. If you're running detection on the same machine:

```javascript
// Only works from localhost context (same machine as the browser)
async function probeLocalCDPPorts() {
  const openClawPorts = [];
  for (let port = 18800; port <= 18810; port++) {
    try {
      const res = await fetch(`http://127.0.0.1:${port}/json/version`, {
        signal: AbortSignal.timeout(500)
      });
      if (res.ok) {
        const data = await res.json();
        if (data.webSocketDebuggerUrl) {
          openClawPorts.push({ port, data });
        }
      }
    } catch(e) {
      // Port not open or blocked
    }
  }
  return openClawPorts;
}
```

**Warning:** This requires the page to be running on the same machine. Cross-origin restrictions may block this. Also, this is a network probe and could be considered invasive.

### 3.5 Gateway Port Probe — LOW CONFIDENCE (localhost only)

OpenClaw's gateway daemon listens on port 18789:

```javascript
async function probeOpenClawGateway() {
  try {
    const res = await fetch('http://127.0.0.1:18789/health', {
      signal: AbortSignal.timeout(500)
    });
    return res.ok;
  } catch(e) {
    return false;
  }
}
```

### 3.6 Process/Binary Detection — NOT VIABLE FROM JS

The `openclaw` CLI binary and `@earendil-works/pi-agent-core` package names are NOT detectable from page JavaScript. These are server-side artifacts.

---

## 4. Detection Methods That DON'T Work

### 4.1 navigator.webdriver — SUPPRESSED
```javascript
navigator.webdriver // false — suppressed by --disable-blink-features=AutomationControlled
```

### 4.2 User-Agent String — GENUINE
```javascript
navigator.userAgent // Real Chrome UA — matches installed version
```

### 4.3 Sec-Ch-Ua Client Hints — GENUINE
```javascript
navigator.userAgentData.brands // Real Chrome brands
```

### 4.4 TLS Fingerprint — GENUINE
The browser tool uses real Chrome's TLS stack. No mismatch.

### 4.5 window.chrome Properties — PRESENT
```javascript
window.chrome // Full Chrome object with runtime, app, loadTimes, csi
```
(Unlike Electron/Copilot which has 0 own properties)

### 4.6 Plugins — PRESENT
```javascript
navigator.plugins.length // > 0 (real Chrome has PDF viewer etc.)
```

### 4.7 Error Stack Traces — NO UtilityScript
OpenClaw's Playwright connects via CDP, not page.evaluate. No "UtilityScript" in stack traces from inline scripts.

---

## 5. Composite Detection Strategy

### 5.1 Tier 1: CDP Detection (Best Signal)

```javascript
// Primary detection — CDP Proxy trap
async function tier1_CDPDetection() {
  return new Promise((resolve) => {
    let count = 0;
    const p = new Proxy({}, { ownKeys() { count++; return []; } });
    console.groupEnd(p);
    setTimeout(() => resolve(count >= 2), 100);
  });
}
```

### 5.2 Tier 2: Input Behavioral Analysis

```javascript
// Secondary — analyze first user interaction
function tier2_InputAnalysis(clickEvent) {
  const signals = [];
  if (clickEvent.sourceCapabilities === null) signals.push('null-caps');
  if (!clickEvent.isTrusted) signals.push('untrusted');
  // Check for preceding mousemove
  return signals;
}
```

### 5.3 Tier 3: Fresh Profile Indicators

```javascript
// Tertiary — combine profile emptiness signals
async function tier3_FreshProfile() {
  const score = 0;
  if (localStorage.length === 0) score++;
  if (document.cookie === '') score++;
  // ... more checks
  return score;
}
```

### 5.4 Scoring

| Signal | Weight | Notes |
|--------|--------|-------|
| CDP proxy trap fires | +50 | Also fires with DevTools open |
| sourceCapabilities === null on click | +30 | Strong CDP indicator |
| No mousemove before click | +20 | CDP dispatched events |
| Fresh profile (no cookies/storage) | +10 | First-time visitors also match |
| Integer click coordinates | +10 | CDP default behavior |
| Gateway port 18789 open (localhost) | +40 | OpenClaw-specific |
| CDP port 18800-18899 open (localhost) | +30 | OpenClaw-specific |

**Thresholds:**
- Score >= 80: High confidence OpenClaw browser tool
- Score 50-79: Likely automated browser (could be OpenClaw, Playwright, Puppeteer)
- Score 30-49: Suspicious — may be automated
- Score < 30: Likely normal user

---

## 6. Distinguishing OpenClaw from Other CDP-Controlled Browsers

The CDP proxy trap and input forensics detect ANY CDP-controlled browser (Playwright, Puppeteer, etc.). To distinguish OpenClaw specifically:

| Signal | OpenClaw | Copilot (Electron) | Comet (Chromium fork) | Generic Playwright |
|--------|----------|--------------------|-----------------------|-------------------|
| `navigator.webdriver` | `false` (suppressed) | `false` (suppressed) | `false` | `true` (default) |
| `window.chrome` props | Full (real Chrome) | 0 own props (Electron) | Full | Full |
| CDP proxy trap | YES | YES | YES (when agent active) | YES |
| Gateway port 18789 | YES (if localhost) | NO | NO | NO |
| CDP port range | 18800-18899 | Varies | Varies | Varies |
| UA string | Real Chrome current | Electron/Code UA | Chrome with Brave? | Chromium |
| Profile path | `~/.openclaw/browser/` | N/A | Extension profile | temp profile |
| `navigator.plugins` | >0 | 0 | >0 | >0 |

**Key differentiator:** If CDP trap fires AND `window.chrome` has full properties AND `navigator.plugins.length > 0` AND `navigator.userAgent` matches current Chrome → it's either OpenClaw or another Playwright-on-real-Chrome setup. The gateway port probe (18789) is the only OpenClaw-specific signal available from localhost.

---

## 7. Practical Implementation Recommendations

### For Our copilot-detector.html / atlas-detector

1. **Add OpenClaw as a detection target** alongside Copilot and Comet
2. **CDP proxy trap** already works — it detects OpenClaw's browser tool too
3. **Add gateway port probe** (18789) for OpenClaw-specific identification
4. **Add input event forensics** as a supporting signal
5. **Add server-side header detection** endpoint for web_fetch detection

### For Server-Side Detection (web_fetch)

1. Check `Accept` header for `text/markdown` as first preference
2. Verify `Sec-Fetch-Mode` header presence (absent = not a real browser)
3. Check HTTP protocol version (HTTP/1.1 from a Chrome 122 UA = mismatch)
4. JA3/JA4 TLS fingerprint (if available)
5. Check `User-Agent` staleness (Chrome 122 vs current ~148)

---

*End of JS detection methods. See OPENCLAW_DETECTION_V2_OVERVIEW.md for the complete index.*
