# OpenClaw Detection V2 — Network Communication Analysis
## web_fetch, fetch-guard, SSRF, TLS Fingerprint

**Date:** May 14, 2026  
**Source Files Analyzed:**
- `src/agents/tools/web-fetch.ts` (709 LOC, 23.7 KB)
- `src/agents/tools/web-guarded-fetch.ts` (102 LOC, 2.91 KB)
- `src/agents/tools/web-shared.ts` (291 LOC, 8.12 KB)
- `src/infra/net/fetch-guard.ts` (537 LOC, 17.2 KB)
- `src/infra/net/ssrf.ts` (616 LOC, 18.1 KB)
- `src/security/external-content.ts` (426 LOC, 13.2 KB)
- `src/web-fetch/runtime.ts`, `content-extractors.runtime.ts`

---

## 1. web_fetch HTTP Header Fingerprint (Source-Confirmed May 2026)

### 1.1 Hardcoded Constants (Still Present)

```typescript
// src/agents/tools/web-fetch.ts
const DEFAULT_FETCH_USER_AGENT =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 14_7_2) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36";

const DEFAULT_FETCH_MAX_CHARS = 20_000;
const DEFAULT_FETCH_MAX_RESPONSE_BYTES = 750_000;
const DEFAULT_FETCH_MAX_REDIRECTS = 3;
const DEFAULT_TIMEOUT_SECONDS = 30;
const DEFAULT_CACHE_TTL_MINUTES = 15;
```

**Key observation:** The User-Agent is still Chrome 122 on macOS 14.7.2 (Sonoma). As of May 2026, current Chrome is ~148.x. This is now **~26 major versions stale**. However, it IS configurable via `executionFetch.userAgent` in the config.

### 1.2 Headers Actually Sent

From `web-fetch.ts` source, the fetch call passes through `fetchWithWebToolsNetworkGuard()` which calls `fetchWithSsrFGuard()`. The headers are set by:

```typescript
// In the execute() function of web-fetch.ts:
const userAgent =
  (executionFetch &&
    "userAgent" in executionFetch &&
    typeof executionFetch.userAgent === "string" &&
    executionFetch.userAgent) ||
  DEFAULT_FETCH_USER_AGENT;
```

The actual HTTP request init does NOT explicitly set headers — the headers come from the caller chain. The `web-guarded-fetch.ts` passes through to `fetchWithSsrFGuard()` which does:

```typescript
// fetch-guard.ts
const init: DispatcherAwareRequestInit = {
  ...(currentInit ? { ...currentInit } : {}),
  redirect: "manual",  // Manual redirect handling
  ...(dispatcher ? { dispatcher } : {}),
  ...(signal ? { signal } : {}),
};
```

**What this means:** The headers sent on the wire are ONLY what's explicitly passed. No browser-like header injection happens. The fetch-guard adds NO additional headers (no Sec-Fetch-*, no Sec-Ch-Ua-*).

### 1.3 Complete Header Profile (web_fetch)

| Header | Value | Source |
|--------|-------|--------|
| `User-Agent` | `Mozilla/5.0 (Macintosh; Intel Mac OS X 14_7_2) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36` | `DEFAULT_FETCH_USER_AGENT` in web-fetch.ts |
| `Accept` | `text/markdown, text/html;q=0.9, */*;q=0.1` | Set by caller (confirmed from V1 research, PR #15376) |
| `Accept-Language` | `en-US,en;q=0.9` | Set by caller |
| `Accept-Encoding` | Varies — added by Node.js undici automatically | Runtime behavior |

**Headers NOT sent (that real Chrome would send):**

| Missing Header | Chrome Behavior | Detection Value |
|----------------|-----------------|-----------------|
| `Sec-Fetch-Mode` | Always: `navigate`, `cors`, `no-cors` | HIGH |
| `Sec-Fetch-Site` | Always: `none`, `same-origin`, `cross-site` | HIGH |
| `Sec-Fetch-Dest` | Always: `document`, `empty`, `image` | HIGH |
| `Sec-Fetch-User` | For navigations: `?1` | MEDIUM |
| `Sec-Ch-Ua` | Chrome 89+: `"Chromium";v="148", "Google Chrome";v="148"` | HIGH |
| `Sec-Ch-Ua-Mobile` | `?0` | HIGH |
| `Sec-Ch-Ua-Platform` | `"macOS"` (matching the UA) | HIGH |
| `Cookie` | Session cookies from prior visits | MEDIUM |
| `Referer` | Previous page URL | LOW |
| `Connection` | `keep-alive` | LOW |
| `DNT` | Optional | LOW |

---

## 2. fetch-guard.ts — The Network Layer (NEW Analysis)

### 2.1 Architecture

The fetch-guard is the central network security layer. ALL outbound HTTP requests pass through it.

```
web-fetch.ts → web-guarded-fetch.ts → fetch-guard.ts (fetchWithSsrFGuard) → undici
```

### 2.2 Key Properties

1. **Uses Node.js undici** — NOT a browser HTTP stack. This means:
   - TLS fingerprint = Node.js (JA3/JA4), NOT Chrome
   - HTTP/2 SETTINGS frames = Node.js defaults, NOT Chrome's
   - HTTP/1.1 via explicit `createHttp1Agent()` — not even HTTP/2 by default!

2. **Manual redirect handling** — `redirect: "manual"` with loop detection:
   ```typescript
   const visited = new Set<string>([params.url]);
   // ... redirect loop detection
   if (visited.has(nextUrl)) {
     throw new Error("Redirect loop detected");
   }
   ```

3. **DNS pinning for SSRF protection** — Resolves DNS, pins the IP, then connects. This is a security feature that also creates a detectable fingerprint: the DNS-to-connection timing pattern differs from browsers.

4. **Cross-origin redirect header stripping** — On cross-origin redirects, sensitive headers (Authorization, Cookie) are stripped. This is standard but the specific implementation may leave behavioral traces.

### 2.3 HTTP/1.1 Forced Mode

Critical finding: `createHttp1Agent()` is used throughout. This means web_fetch requests use **HTTP/1.1**, not HTTP/2.

```typescript
// undici-runtime.ts imports used by fetch-guard.ts:
createHttp1Agent,
createHttp1EnvHttpProxyAgent,
createHttp1ProxyAgent,
```

**Detection relevance:** Real Chrome uses HTTP/2 for HTTPS connections. A "Chrome 122" User-Agent arriving over HTTP/1.1 is a strong mismatch signal for any server doing protocol-level analysis.

---

## 3. SSRF Protection (ssrf.ts) — Detection Implications

### 3.1 DNS Pinning Behavior

```typescript
export async function resolvePinnedHostnameWithPolicy(
  hostname: string,
  params: { lookupFn?: LookupFn; policy?: SsrFPolicy }
): Promise<PinnedHostname>
```

The SSRF guard:
1. Resolves hostname to IP addresses via DNS
2. Validates IPs are not private/internal
3. Creates a "pinned lookup" that bypasses system DNS for the actual connection
4. Prefers IPv4 over IPv6 (`dedupeAndPreferIpv4`)

**Detection note:** This DNS-then-connect pattern means the target server sees a connection from the resolved IP with a pre-resolved DNS. The timing between DNS lookup and TCP connection may differ from a browser (which does DNS lazily via the socket layer).

### 3.2 Blocked Hostnames

```typescript
const BLOCKED_HOSTNAMES = // Set of localhost, .local, .internal variants
// Also blocks:
// - Private IP ranges (10.x, 172.16-31.x, 192.168.x)
// - Loopback (127.x, ::1)
// - Link-local (169.254.x, fe80::)
```

---

## 4. External Content Wrapping (Security Layer)

### 4.1 How OpenClaw Wraps Web Content

When web_fetch retrieves page content, it gets wrapped in security markers:

```typescript
// external-content.ts
export function wrapWebContent(
  content: string,
  source: "web_search" | "web_fetch" = "web_search",
): string {
  const includeWarning = source === "web_fetch";
  return wrapExternalContent(content, { source, includeWarning });
}
```

The wrapping produces:
```
⚠️ IMPORTANT: This is UNTRUSTED external content...
<<<EXTERNAL UNTRUSTED CONTENT id="<random_hex>">>>
Source: Web Fetch
---
[page content here]
<<<END EXTERNAL UNTRUSTED CONTENT id="<random_hex>">>>
```

### 4.2 Prompt Injection Detection

OpenClaw scans external content for suspicious patterns:

```typescript
const SUSPICIOUS_PATTERNS = [
  /ignore\s+(all\s+)?(previous|prior|above)\s+(instructions?|prompts?)/i,
  /disregard\s+(all\s+)?(previous|prior|above)/i,
  /you\s+are\s+now\s+(a|an)\s+/i,
  /new\s+instructions?:/i,
  /system\s*:?\s*(prompt|override|command)/i,
  /\bexec\b.*command\s*=/i,
  /elevated\s*=\s*true/i,
  /rm\s+-rf/i,
  /<\/?system>/i,
  // ... more patterns
];
```

**Detection relevance:** These are LOGGED but content is still processed. However, the markers (`<<<EXTERNAL UNTRUSTED CONTENT>>>`) and the `SPECIAL_TOKEN_REPLACEMENT = "[REMOVED_SPECIAL_TOKEN]"` sanitization create a distinctive processing fingerprint.

### 4.3 LLM Special Token Sanitization

OpenClaw strips LLM-specific tokens from external content:
- `<|endoftext|>`, `<|im_start|>`, `<|im_end|>` → `[REMOVED_SPECIAL_TOKEN]`
- `<|reserved_special_token_\d+|>` variants
- Unicode angle bracket homoglyphs are normalized

---

## 5. Detection Signal Matrix — Network Layer

### 5.1 Server-Side Detection (HTTP Request Analysis)

| Signal | How to Detect | Specificity | Reliability |
|--------|--------------|-------------|-------------|
| **Chrome 122 UA on HTTP/1.1** | Protocol version check — Chrome 122 should use H2 | HIGH | HIGH |
| **Missing Sec-Fetch-* headers** | Check for absence of all 4 Sec-Fetch headers | MEDIUM | HIGH |
| **Missing Sec-Ch-Ua-* headers** | Chrome 89+ always sends these | MEDIUM | HIGH |
| **`Accept: text/markdown` first** | Unusual priority — AI agent class signal | LOW | HIGH |
| **Node.js undici TLS (JA3/JA4)** | TLS fingerprint mismatch vs Chrome 122 claim | HIGH | HIGH |
| **HTTP/1.1 for HTTPS** | Chrome uses H2; this uses H1 agents | HIGH | HIGH |
| **No cookies** | Stateless — no cookie jar | MEDIUM | MEDIUM |
| **DNS-then-connect timing** | SSRF pinning creates distinct timing | LOW | LOW |
| **3 redirect max** | `DEFAULT_FETCH_MAX_REDIRECTS = 3` (Chrome allows 20) | LOW | MEDIUM |

### 5.2 Combined Fingerprint Score

A server receiving a request with ALL of these:
1. Chrome 122 UA
2. HTTP/1.1 connection
3. No Sec-Fetch-* headers
4. No Sec-Ch-Ua-* headers
5. `Accept: text/markdown, text/html;q=0.9, */*;q=0.1`
6. Node.js TLS fingerprint
7. No cookies

**Can be ~95% confident this is OpenClaw web_fetch** (or a very similar AI agent tool). The combination is distinctive even though individual signals are shared with other bots.

### 5.3 What CAN'T Be Detected (Browser Tool)

When OpenClaw uses the browser tool (real Chrome):
- Real Chrome TLS, HTTP/2, Sec-Fetch-*, Sec-Ch-Ua-*
- Real cookie handling
- `navigator.webdriver = false` (suppressed)
- Real Chrome user-agent

The browser tool is **architecturally invisible** at the network level. Only behavioral analysis (CDP side-effects, mouse patterns, interaction timing) can detect it.

---

## 6. Recommended JS Detection for web_fetch

Since web_fetch is a server-side HTTP fetch (not a browser), JavaScript on the page **never executes**. JS detection is ONLY relevant for the browser tool case.

For web_fetch detection, implement **server-side** checks:
1. Check `Accept` header for `text/markdown` as first preference
2. Verify `Sec-Fetch-Mode` header exists (absent = not a browser)
3. Check TLS fingerprint if you have access (JA3/JA4 mismatch)
4. Verify HTTP/2 protocol (OpenClaw sends HTTP/1.1)
5. Check User-Agent staleness (Chrome 122 vs current ~148)

---

*End of network analysis. See OPENCLAW_DETECTION_V2_IDENTITY.md for self-identification analysis.*
