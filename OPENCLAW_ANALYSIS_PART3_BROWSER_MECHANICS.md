# OpenClaw Browser Tool — Part 3: Browser Tool Mechanics (CDP Architecture)

> How OpenClaw's browser tool operates on the wire

---

## Architecture Overview

```
┌─────────────────┐     ┌──────────────────┐     ┌─────────────┐
│   GPT-5.4 LLM   │────▶│  OpenClaw Gateway │────▶│   Chrome     │
│  (openai API)   │◀────│  port 18789       │◀────│   pid 2924   │
└─────────────────┘     │  control: +2      │     │   CDP on MCP │
                        │  = port 18791     │     └─────────────┘
                        └──────────────────┘
```

### Key Properties from `browser.status`

```json
{
  "profile": "user",
  "driver": "existing-session",
  "transport": "chrome-mcp",
  "running": true,
  "cdpReady": true,
  "cdpHttp": true,
  "pid": 2924,
  "detectedBrowser": "chrome",
  "detectedExecutablePath": "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe",
  "headless": false,
  "noSandbox": false,
  "attachOnly": true
}
```

### Two Browser Profiles

1. **"user" profile** (used in this session):
   - `driver: "existing-session"` — attaches to already-running Chrome
   - `transport: "chrome-mcp"` — Chrome MCP relay (not direct CDP)
   - `attachOnly: true` — does NOT launch Chrome
   - `headless: false` — uses the user's visible browser

2. **"openclaw" profile** (not used here):
   - Managed/launched browser
   - Full Playwright control
   - Separate user data directory

---

## Tool Actions Observed

### 1. `snapshot` — Accessibility Tree Dump

**Request**: `{action:"snapshot", profile:"user", target:"host", targetId:"4", refs:"aria"}`

**What it does**: 
- Calls `Page.getAccessibilityTree()` or equivalent via CDP
- Returns YAML-like indented AX tree
- Each interactive element gets a ref: `pageId_N`
- Wrapped in `<<<EXTERNAL_UNTRUSTED_CONTENT>>>` security envelope

**Response metadata**:
```json
{
  "format": "ai",
  "stats": {"lines": 68, "chars": 2853, "refs": 35, "interactive": 30},
  "externalContent": {"untrusted": true, "source": "browser", "kind": "snapshot"}
}
```

**Detection Surface**: Snapshot triggers CDP calls that could be intercepted:
- `Accessibility.getFullAXTree` or `DOM.getDocument` + aria queries
- Happens BEFORE any interaction — pure reconnaissance
- The refs format (`pageId_N`) is unique to OpenClaw

### 2. `fill` — Batch Field Fill

**Request**: `{kind:"fill", fields:[{ref:"6_37", text:"Lorem"}, ...]}`

**What it does**:
- Attempts to set multiple fields in one call
- Uses Playwright's `locator.fill()` under the hood
- Dispatches native-looking events (but may not persist in existing-session mode)

**Critical Finding**: Fill returned `{ok:true}` but values were EMPTY. The existing-session driver's fill implementation is unreliable for attached Chrome sessions. This forces the fallback to `evaluate`.

### 3. `type` — Character-by-Character Input (pressSequentially)

**Request**: `{kind:"type", ref:"10_35", text:"Lorem"}`

**What it does**:
- Calls Playwright's `locator.pressSequentially(text)` 
- Sends individual `keyDown`/`keyPress`/`keyUp` CDP events per character
- Events are `isTrusted:true` — indistinguishable from real keyboard at the event level
- Adds small random delays between keystrokes (Playwright default)

**Timing fingerprint** (from probe data):
```
"Lorem" on f_first:
  L→o: 3.2ms, o→r: 2.2ms, r→e: 2.8ms, e→m: 4.8ms
  
"lorem.ipsum@example.com" on f_email:
  Average inter-key: ~1.6ms (range 1.4–2.7ms)
```

**Detection Surface**: While events are trusted, the **micro-timing** is inhuman — 1.4ms between keystrokes is faster than any human typist. But the **macro-timing** (CV=2.7956) mimics human variance.

### 4. `select` — Dropdown Selection

**Request**: `{kind:"select", ref:"10_43", values:["2–10"]}`

**What it does**:
- Calls `locator.selectOption()`
- Triggers `input` + `change` events on the `<select>`
- Events appear native

### 5. `click` — Element Click

**Request**: `{kind:"click", ref:"10_49"}`

**What it does**:
- Calls `locator.click()`
- Sends `mousedown` → `mouseup` → `click` sequence
- Events are `isTrusted:true`
- For checkboxes: also toggles `checked` state

### 6. `evaluate` — JavaScript Execution

**Request**: `{kind:"evaluate", fn:"() => { ... }"}`

**What it does**:
- Calls `page.evaluate(fn)` — executes arbitrary JS in page context
- Can read DOM, set values, dispatch events
- Returns serialized result

**This is the most dangerous action from a detection perspective**. The evaluate calls:
1. Enumerate ALL inputs: `document.querySelectorAll('input, textarea, select')`
2. Inspect CSS: `getComputedStyle(el)`, `getBoundingClientRect()`
3. Set values: `el.value = "..."` + `dispatchEvent(new Event('input'))`
4. Read detection output: `document.body.innerText`

### 7. `tabs` — List Open Tabs

**Request**: `{action:"tabs", profile:"user"}`

**Response**: Array of `{targetId, title, url, type}` for all open pages.

### 8. `navigate` — URL Navigation

**Request**: `{action:"navigate", url:"..."}`

**What it does**: `page.goto(url)` — full navigation. Causes page UID shift.

---

## CDP Traffic Fingerprint

Based on the actions, the CDP command sequence for a form-fill session is:

```
1. Target.getTargets              → enumerate tabs
2. Accessibility.getFullAXTree    → snapshot #1
3. Input.dispatchKeyEvent ×N      → type characters  
4. DOM.resolveNode + select       → dropdown selection
5. Input.dispatchMouseEvent ×3    → click (down/up/click)
6. Runtime.evaluate               → JS execution
7. Accessibility.getFullAXTree    → snapshot #2 (verification)
8. Runtime.evaluate               → read results
```

**If Stormcaster can intercept CDP on the debug port**, this sequence is a dead giveaway.

---

## Limitations of existing-session Driver

| Feature | Works? | Notes |
|---------|--------|-------|
| snapshot | ✓ | Full AX tree |
| type (pressSequentially) | ✓ | Events are isTrusted:true |
| click | ✓ | By ref only, no selector |
| select | ✓ | By ref only |
| fill (batch) | ⚠️ | Reports success, values may not persist |
| screenshot | ✗ | ENOENT error on temp file |
| type by selector | ✗ | Only ref targeting |
| click by selector | ✗ | Only ref targeting |
| evaluate | ✓ | Full JS execution |

The existing-session driver's limitations force the agent into **detectable workarounds** (evaluate-based fills with isTrusted:false events).

---

## Navigation

← [Part 2: LLM Decisions](OPENCLAW_ANALYSIS_PART2_LLM_DECISIONS.md)  
→ [Part 4: Typing & Timing Forensics](OPENCLAW_ANALYSIS_PART4_TIMING_FORENSICS.md)
