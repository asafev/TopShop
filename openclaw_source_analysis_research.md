# OpenClaw Source-Level Detection Research
## A Deep Technical Analysis of web_fetch, Browser Automation & Detection Viability

**Classification:** Internal Research — Standalone Analysis  
**Date:** April 21, 2026  
**Scope:** OpenClaw GitHub source code, official issues, PRs, and community evidence  
**Methodology:** Source-code referenced analysis correlated with GitHub issue field reports

---

## 1. Research Objective

This document is a standalone, source-code-referenced analysis of OpenClaw's two primary web access tools — **web_fetch** and the **browser tool** — with the goal of identifying every technically viable detection signal. Each claim is backed by a direct GitHub source link or issue reference. No community documentation (e.g., centminmod/explain-openclaw) is used — only the official `openclaw/openclaw` repository and its issue tracker.

---

## 2. web_fetch — Deep Source Analysis

### 2.1 Source Location

The web_fetch tool is implemented in:
- **`src/agents/tools/web-fetch.ts`** ([GitHub link](https://github.com/openclaw/openclaw/blob/main/src/agents/tools/web-fetch.ts))

### 2.2 Hardcoded User-Agent (Source-Confirmed)

From the source file, the default User-Agent is hardcoded as:

```typescript
const DEFAULT_FETCH_USER_AGENT =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 14_7_2) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36";
```

**Source:** [web-fetch.ts on GitHub](https://github.com/openclaw/openclaw/blob/main/src/agents/tools/web-fetch.ts)

**Detection Analysis:**
- The UA claims to be **Chrome 122.0.0.0 on macOS 14.7.2** (Sonoma). As of April 2026, the current Chrome version is **147.x**. This makes the UA string approximately **25 major versions behind** the current release.
- This is a detectable anomaly, but it is NOT OpenClaw-specific — any scraper could use the same stale UA.
- **Important:** The UA is a configurable parameter (`params.userAgent`), meaning agents can override it. But the *default* is this stale string.

### 2.3 Hardcoded HTTP Headers (Source-Confirmed)

The fetch call sends exactly three headers:

```typescript
const result = await fetchWithSsrFGuard({
  url: params.url,
  maxRedirects: params.maxRedirects,
  timeoutMs: params.timeoutSeconds * 1000,
  init: {
    headers: {
      Accept: "text/markdown, text/html;q=0.9, */*;q=0.1",
      "User-Agent": params.userAgent,
      "Accept-Language": "en-US,en;q=0.9",
    },
  },
});
```

**Source:** [web-fetch.ts on GitHub](https://github.com/openclaw/openclaw/blob/main/src/agents/tools/web-fetch.ts)

**What is sent:**
| Header | Value | Notes |
|--------|-------|-------|
| `Accept` | `text/markdown, text/html;q=0.9, */*;q=0.1` | Markdown preference was merged in PR #15376 (commit 54bf5d0, Feb 22, 2026). Previously was `Accept: */*`. |
| `User-Agent` | `Mozilla/5.0 (Macintosh; Intel Mac OS X 14_7_2)...Chrome/122.0.0.0...` | Stale version, macOS-only claim |
| `Accept-Language` | `en-US,en;q=0.9` | Standard |

**What is NOT sent (and real Chrome would send):**
| Missing Header | Chrome Behavior |
|----------------|-----------------|
| `Sec-Fetch-Mode` | Chrome always sends (`navigate`, `cors`, `no-cors`) |
| `Sec-Fetch-Site` | Chrome always sends (`none`, `same-origin`, `cross-site`) |
| `Sec-Fetch-Dest` | Chrome always sends (`document`, `empty`, `image`, etc.) |
| `Sec-Ch-Ua` | Chrome 89+ always sends Client Hints |
| `Sec-Ch-Ua-Mobile` | Chrome always sends |
| `Sec-Ch-Ua-Platform` | Chrome always sends |
| `Accept-Encoding` | Not explicitly set; may be added by Node.js runtime |
| `Cookie` | No cookie jar — stateless |
| `Referer` | Not set |
| `Connection` | Not explicitly set |

**Detection Assessment:**
The combination of `Accept: text/markdown` + stale Chrome 122 UA + missing Sec-Fetch-* headers is a detectable fingerprint. However, each individual signal is generic (any bot could have them). The *combination* of all three increases specificity but is still not definitively OpenClaw.

### 2.4 Accept Header Evolution (Git History)

The Accept header was changed from `Accept: */*` to `Accept: text/markdown, text/html;q=0.9, */*;q=0.1` in **February 2026** via:
- **Issue #14999** — "web_fetch currently sends `Accept: */*` (hardcoded in `dist/reply-DptDUVRg.js`)" ([link](https://github.com/openclaw/openclaw/issues/14999))
- **Merge commit 54bf5d0** — Added markdown preference ([link](https://github.com/openclaw/openclaw/commit/54bf5d0))
- **Issue #30348** — Follow-up requesting custom header configuration (still open) ([link](https://github.com/openclaw/openclaw/issues/30348))

**Detection Note:** The `text/markdown` preference in Accept header is becoming a standard AI agent signal. Cloudflare's "Markdown for Agents" feature responds to this header. Claude Code and OpenCode also send it. So this is an *AI agent class* signal, not OpenClaw-specific.

### 2.5 SSRF Guard & Fetch Mechanism

web_fetch uses `fetchWithSsrFGuard()` — an SSRF (Server-Side Request Forgery) protection wrapper that:
- Validates URLs against private/internal network ranges
- Follows redirects up to `maxRedirects`
- Uses Node.js `undici` under the hood (the built-in `fetch` in modern Node.js)

**Detection Relevance:** The underlying HTTP client is **Node.js undici**, not a browser. This means:
- **TLS fingerprint (JA3/JA4)** will be Node.js, NOT Chrome — this is the primary detection vector confirmed in Issue #67670
- **HTTP/2 SETTINGS frames** will be Node.js defaults, NOT Chrome's specific frame sequence

### 2.6 No JS Execution — Source Confirmed

The tool description in source code explicitly states:

```
"Fetch and extract readable content from a URL (HTML → markdown/text).
Use for lightweight page access without browser automation."
```

There is no DOM parsing, no JS engine, no headless browser. It is a plain HTTP fetch with Readability-based text extraction.

### 2.7 Firecrawl Fallback

web_fetch supports Firecrawl as a fallback provider when configured:
- If the default fetch fails or returns a bot challenge page, Firecrawl can be used as an alternative
- However, Issue #27373 reports that the Firecrawl fallback **fails to trigger** in practice even when configured

### 2.8 No Cloudflare Challenge Bypass — Confirmed

**Issue #20375** ([link](https://github.com/openclaw/openclaw/issues/20375)) — The foundational issue documenting that web_fetch returns Cloudflare challenge pages ("Just a moment...") with:
- No detection that the response is a challenge page
- No automatic fallback to browser-based fetch
- No retry logic
- User must manually switch to the browser tool

The issue proposes a `isChallengeResponse()` detection function but it was **never merged** (status: stale). This means web_fetch as of April 2026 has **zero bot challenge bypass capability**.

### 2.9 TLS Fingerprint — The Fundamental Detection Gap

**Issue #67670** ([link](https://github.com/openclaw/openclaw/issues/67670)) — The most technically important issue for detection:

> "Cloudflare detects Node.js native fetch TLS fingerprint (JA3/JA4) as non-browser traffic and triggers a JS Challenge. This happens regardless of: Request headers (even with full browser User-Agent and Sec-CH-UA headers). Key evidence: Using Python `cloudscraper` library (which mimics Chrome TLS fingerprint) with the same proxy and same OAuth token returns 200 OK successfully. This confirms the issue is purely TLS fingerprint-based detection."

**Significance:** Even if OpenClaw fixed all its header problems (added Sec-Fetch-*, updated the UA, added cookies), the TLS fingerprint of Node.js undici would STILL be detectable by Cloudflare Bot Management and similar systems. This is an architectural limitation that cannot be solved without replacing the entire HTTP stack.

---

## 3. Browser Tool — Deep Source Analysis

### 3.1 Architecture Overview

The browser tool is implemented across multiple files:
- **`src/browser/chrome.ts`** — Chrome launch logic, including hardcoded flags
- **`src/browser/pw-tools-core.interactions.ts`** — Playwright-based interactions (click, type, fill, etc.)
- **`src/browser/pw-tools-core.snapshot.ts`** — Accessibility tree snapshots
- **`src/browser/pw-session.ts`** — Session and ref management

**Official docs:** [docs.openclaw.ai/tools/browser](https://docs.openclaw.ai/tools/browser)

### 3.2 Browser Launch — Real Chrome, Not Emulated

From the official documentation and Issue #26897:

> "OpenClaw launches Chrome (via clawd driver) and always adds `--disable-blink-features=AutomationControlled` to the Chrome args (src/browser/chrome.ts:218)"

**Key launch characteristics:**
- Uses the user's **real installed Chrome/Brave/Edge/Chromium** binary — NOT a bundled Chromium
- Creates an isolated user data directory (`~/.openclaw/browser/openclaw/user-data/`)
- Connects via **CDP (Chrome DevTools Protocol)** on ports 18800-18899
- Uses **Playwright-on-CDP** for advanced actions (click, type, snapshot, PDF)
- Default: `headless: false` (full GUI mode)

**Source-confirmed launch flags:**
```
--disable-blink-features=AutomationControlled  (src/browser/chrome.ts:218)
```

This flag specifically **suppresses `navigator.webdriver = true`**, which is the primary JS-based automation detection mechanism.

**Issue #26897** ([link](https://github.com/openclaw/openclaw/issues/26897)):
> "The flag is useful for web scraping scenarios where sites check `navigator.webdriver`. For personal browser profiles (Facebook, Gmail, etc.), this detection bypass is unnecessary and the warning banner is annoying."

### 3.3 Browser Detection Profile

Since the browser tool launches the user's **real Chrome binary** with an isolated profile:

| Property | Value | Detectable? |
|----------|-------|-------------|
| User-Agent | Real Chrome UA (matches installed version) | NO — genuine |
| TLS fingerprint | Real Chrome TLS stack | NO — genuine |
| `navigator.webdriver` | `false` (suppressed by `--disable-blink-features=AutomationControlled`) | NO — suppressed |
| Sec-Fetch-* headers | Sent normally by Chrome | NO — genuine |
| Sec-Ch-Ua headers | Sent normally by Chrome | NO — genuine |
| Cookies | Managed by Chrome profile (isolated but functional) | NO — genuine |
| JS execution | Full V8 engine (it IS Chrome) | NO — genuine |
| CDP connection | WebSocket on port 18800 | Not visible to target site |
| Playwright layer | Controls Chrome via CDP | Not visible to target site |

### 3.4 Stealth Direction — Patchright & Anti-Detection

**Issue #52190** — Feature request to support **Patchright** as a drop-in browser backend:
- Patchright is a Playwright fork specifically designed for stealth/anti-detection
- It patches Playwright at the library level to avoid leaving automation fingerprints
- Referenced in Issue #53763

**Issue #14803** ([link](https://github.com/openclaw/openclaw/issues/14803)) — Request for `browser.args` config field to pass custom Chrome launch flags, indicating the community wants fine-grained control over Chrome's launch behavior for anti-detection purposes.

### 3.5 Browser Automation Maturity — Still Lacking

**Issue #44431** ([link](https://github.com/openclaw/openclaw/issues/44431)) — "Browser Tool: 7 improvements from real-world automation field test":

This field report from automating email provider signups across 9+ providers reveals critical gaps:

1. **No CSS selector support** — forces verbose snapshot→ref workflow, doubling API calls
2. **Refs go stale after any page mutation** — requires re-snapshot after every interaction
3. **`evaluate()` can't access DevTools APIs** — limits debugging capability
4. **No batch/compound actions** — each step is a separate round-trip
5. **Form values clearing on React/Vue apps** — synthetic `fill()` doesn't match framework event handling
6. **No CAPTCHA detection/signaling** — agent wastes calls trying to interact past CAPTCHAs
7. **No "wait for element" with ref** — only blind waits or text-based waits

**PR #44934** addressed items 1, 4, and partially 5 (CSS selector support, batch actions, click delayMs).

**Detection Relevance:** These limitations mean that OpenClaw's browser interactions may exhibit distinctive behavioral patterns:
- Frequent snapshot calls (accessibility tree dumps) between every action
- No mouse movement events (CDP-based actions don't generate mouse trajectories)
- Synthetic input events that may not match human input patterns
- Rapid tab-opening without navigation flow

### 3.6 Chrome Extension Relay — Deprecated & Unstable

The Chrome Extension Relay (ID: `nglingapjinhecnfejdcpihlpneeadjp`) is being phased out:

**Issue #12317** ([link](https://github.com/openclaw/openclaw/issues/12317)) — Extension detaches on every full-page navigation:
> "Cannot automate any multi-page workflow on sites with full page reloads. Each navigation requires manual user intervention to re-attach the relay."

**Issue #31907** ([link](https://github.com/openclaw/openclaw/issues/31907)) — 71% failure rate on default path:
> "25 out of 35 'no profile specified' calls failed. Each failure wastes ~10 minutes of wall-clock time."

**Issue #32532** ([link](https://github.com/openclaw/openclaw/issues/32532)) — Startup deadlock:
> "Chrome Extension Browser Relay has a startup deadlock: `openclaw browser start` fails because no tab is connected, but the relay service is never started to allow the extension to connect."

**Issue #52430** ([link](https://github.com/openclaw/openclaw/issues/52430)) — Auth failures after upgrades:
> "Extension shows red ! badge and fails to connect with 'HTTP Authentication failed; no valid credentials available.'"

### 3.7 Headless Mode — Feature Request Pending

**Issue #41019** ([link](https://github.com/openclaw/openclaw/issues/41019)) — Browser tool headless mode support:
- Currently defaults to `headless: false` (full GUI mode)
- Headless mode requested for background automation, server-side scraping
- PR #45207 and PR #51038 were opened but not yet merged into stable

### 3.8 Native Browser Integration — Competitive Pressure

**Issue #24996** ([link](https://github.com/openclaw/openclaw/issues/24996)) — "Native AI Browser Integration (like ChatGPT Atlas / Perplexity Comet)":

This issue explicitly lists the competitive landscape and OpenClaw's position:
- **ChatGPT Atlas** — native browser with Operator built-in
- **Perplexity Comet** — Chromium fork with AI search + browsing
- **Dia Browser** — Arc successor with agentic features

User pain points:
> "Chrome relay disconnects every 10-15 minutes. Instagram web blocks all programmatic uploads. LinkedIn detects automation even with stealth settings."

Proposed solution includes "Anti-detection built-in — humanized browsing patterns" — confirming the community's explicit interest in evading detection.

### 3.9 Built-in Headless Browser — Issue #53763

**Issue #53763** ([link](https://github.com/openclaw/openclaw/issues/53763)) — Request to bundle headless Chromium:
- Current stack is "borrowing someone else's eyes" — no tool gives the agent direct, reliable web access
- References Patchright (#52190) for stealth mode
- Failure rate: "~30% of the time on dynamic pages"
- Every session involving web search hits at least one failure

---

## 4. Correlation Matrix — What Is Actually Detectable?

### 4.1 web_fetch Detection Signals

| Signal | Source Evidence | OpenClaw-Specific? | Reliability |
|--------|---------------|-------------------|-------------|
| Stale Chrome 122 UA on macOS 14.7.2 | `web-fetch.ts` — hardcoded `DEFAULT_FETCH_USER_AGENT` | NO — any bot could use this, and it's overridable | LOW |
| `Accept: text/markdown, text/html;q=0.9, */*;q=0.1` | `web-fetch.ts` — hardcoded after PR #15376 | NO — Claude Code, OpenCode also send this | LOW |
| Missing Sec-Fetch-* headers | Not in `web-fetch.ts` headers block | NO — any non-browser HTTP client | LOW |
| Node.js undici TLS fingerprint (JA3/JA4) | Issue #67670 — confirmed as detection vector | NO — any Node.js app | MEDIUM |
| No cookie continuity | Stateless fetch, no cookie jar | NO — any stateless HTTP client | LOW |
| `Accept-Language: en-US,en;q=0.9` | `web-fetch.ts` — hardcoded | NO — common default | LOW |
| **Combination of ALL above** | Source-confirmed header set | **MEDIUM** — the specific combination is distinctive | MEDIUM |

### 4.2 Browser Tool Detection Signals

| Signal | Source Evidence | OpenClaw-Specific? | Reliability |
|--------|---------------|-------------------|-------------|
| `navigator.webdriver` | Suppressed via `--disable-blink-features=AutomationControlled` (chrome.ts:218) | N/A — suppressed | NONE |
| Chrome UA string | Real Chrome binary — genuine UA | N/A — genuine | NONE |
| TLS fingerprint | Real Chrome TLS stack | N/A — genuine | NONE |
| Sec-Fetch-* headers | Sent by real Chrome | N/A — genuine | NONE |
| CDP window artifacts | Possible residual from Playwright-on-CDP | POSSIBLE — needs testing | UNKNOWN |
| Mouse movement patterns | CDP actions don't generate mouse trajectories | POSSIBLE — behavioral | WEAK |
| Snapshot-heavy interaction pattern | Accessibility tree dumps between every action (#44431) | POSSIBLE — behavioral | WEAK |
| Rapid multi-tab opening | Agent opens many tabs via CDP at once | POSSIBLE — behavioral | WEAK |
| Chrome extension ID | `nglingapjinhecnfejdcpihlpneeadjp` — but extension is deprecated | IMPRACTICAL — phasing out | VERY LOW |

---

## 5. Key Takeaways

### 5.1 web_fetch Is Detectable but Not Uniquely Identifiable

The header fingerprint (`Chrome/122.0.0.0 + text/markdown Accept + missing Sec-Fetch-* + en-US Accept-Language`) is a distinctive combination, but each component is shared with other tools. The strongest signal is the **TLS fingerprint** (JA3/JA4 of Node.js undici vs. real Chrome), which is an architectural limitation OpenClaw cannot fix without replacing the HTTP client.

### 5.2 Browser Tool Is Architecturally Invisible

The browser tool uses the user's **real Chrome binary** with:
- `--disable-blink-features=AutomationControlled` (suppresses `navigator.webdriver`)
- Real Chrome UA, TLS, headers, cookies
- CDP connection is invisible to the target site

Detection must rely on **behavioral signals** (mouse patterns, interaction timing, snapshot-heavy workflows) which are inherently weak, model-dependent, and not reliably attributable to OpenClaw.

### 5.3 The Platform vs. Browser Distinction

OpenClaw is an **orchestration platform**, not a browser. It delegates browsing to the user's real Chrome installation. This is fundamentally different from agents like:
- **Comet** — a Chromium fork with identifiable modifications
- **Skyvern** — uses its own headless browser with distinctive fingerprints
- **Browser-use** — Python Playwright with default automation flags

OpenClaw's architecture makes it the **hardest to detect** of the major AI agent frameworks because it generates no browser-level fingerprint of its own.

### 5.4 Browser Automation Still Immature

Despite being architecturally invisible, OpenClaw's browser automation has significant gaps (#44431) that produce distinctive behavioral patterns:
- Excessive snapshot calls
- No batch actions (many round-trips for simple forms)
- No CAPTCHA detection
- Form clearing issues with React/Vue apps

These gaps mean that **for now**, OpenClaw browser sessions may exhibit unusual interaction patterns that advanced behavioral analysis could flag. However, these are being actively fixed (PR #44934 for batch actions and CSS selectors), and the community is pursuing stealth-first browsing (Patchright #52190).

### 5.5 Recommended Research Directions

1. **JA3/JA4 TLS fingerprinting for web_fetch** — Most reliable detection for the HTTP-only path. Source-confirmed as the gap OpenClaw cannot fix.
2. **Behavioral analysis for browser tool** — Mouse movement absence, snapshot-heavy interaction patterns, rapid tab creation. Inherently weak but currently viable.
3. **Accept header profiling** — `text/markdown` as first preference is an AI agent class signal. Not OpenClaw-specific but useful for agent-vs-human classification.
4. **CDP artifact hunting** — Research whether Playwright-on-CDP leaves any detectable DOM or window properties. The `--disable-blink-features=AutomationControlled` flag suppresses `navigator.webdriver` but there may be other CDP residuals.

---

## 6. Source References Index

| Resource | URL |
|----------|-----|
| web-fetch.ts source | https://github.com/openclaw/openclaw/blob/main/src/agents/tools/web-fetch.ts |
| Browser docs | https://docs.openclaw.ai/tools/browser |
| Issue #20375 — Cloudflare bypass | https://github.com/openclaw/openclaw/issues/20375 |
| Issue #67670 — TLS fingerprint detection | https://github.com/openclaw/openclaw/issues/67670 |
| Issue #26897 — AutomationControlled flag | https://github.com/openclaw/openclaw/issues/26897 |
| Issue #52190 — Patchright stealth | https://github.com/openclaw/openclaw/issues/52190 |
| Issue #14803 — Custom Chrome launch flags | https://github.com/openclaw/openclaw/issues/14803 |
| Issue #44431 — Browser automation field test | https://github.com/openclaw/openclaw/issues/44431 |
| Issue #53763 — Built-in headless browser | https://github.com/openclaw/openclaw/issues/53763 |
| Issue #24996 — Native AI browser request | https://github.com/openclaw/openclaw/issues/24996 |
| Issue #41019 — Headless mode request | https://github.com/openclaw/openclaw/issues/41019 |
| Issue #14999 — Accept markdown header | https://github.com/openclaw/openclaw/issues/14999 |
| Issue #30348 — Custom headers request | https://github.com/openclaw/openclaw/issues/30348 |
| Issue #27373 — Firecrawl fallback broken | https://github.com/openclaw/openclaw/issues/27373 |
| Issue #12317 — Extension navigation detach | https://github.com/openclaw/openclaw/issues/12317 |
| Issue #31907 — Extension 71% failure rate | https://github.com/openclaw/openclaw/issues/31907 |
| Issue #32532 — Extension startup deadlock | https://github.com/openclaw/openclaw/issues/32532 |
| Issue #52430 — Extension auth failure | https://github.com/openclaw/openclaw/issues/52430 |
| PR #15376 — Accept markdown merge | https://github.com/openclaw/openclaw/commit/54bf5d0 |
| PR #44934 — Batch actions & CSS selectors | https://github.com/openclaw/openclaw/issues/44934 |

---

*End of standalone research document.*
