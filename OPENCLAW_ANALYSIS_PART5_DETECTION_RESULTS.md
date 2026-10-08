# OpenClaw Browser Tool — Part 5: Detection Results Analysis

> What our probe caught, what it missed, and why

---

## Probe Export Summary

**Generated**: 2026-05-17T14:23:52.715Z  
**Duration**: 75,286ms  
**Source**: `test/openclaw-probe-1779027832717.json`

---

## What We CAUGHT

### 1. Synthetic Events on f_size ✓

```json
"syntheticEvents": [
  {"t": 54376.7, "field": "f_size", "event": "input", "constructor": "Event"},
  {"t": 54376.7, "field": "f_size", "event": "change", "constructor": "Event"}
]
```

**Why detected**: The select dropdown was filled via `evaluate()` which dispatched `new Event('input')` instead of `new InputEvent('input')`. Two signals:
1. `isTrusted: false` — not from user interaction
2. `constructor: Event` instead of `InputEvent` — the BARE_INPUT_EVENT fingerprint

### 2. Evaluate Fill Pattern ✓

```json
"evalFillPattern": true
```

The probe detected the evaluate-based fill pattern. This flag triggers when we see programmatic value setting + synthetic events in combination.

### 3. Field Touch Pattern ✓

| Field | Touched | Value |
|-------|---------|-------|
| f_first | ✓ | "Lorem" |
| f_last | ✓ | "Ipsum" |
| f_email | ✓ | "lorem.ipsum@example.com" |
| f_company | ✓ | "Lorem Ipsum" |
| f_size | ✓ | "s" (value="2-10" submitted as option value "s") |
| f_terms | ✓ | true (checked) |
| **f_news** | **✗** | false — newsletter NOT touched |
| **f_promo** | **✗** | "" — promo code NOT touched |
| f_bio | ✓ | "Lorem ipsum" |
| **f_ref** | **✗** | "" — referral NOT touched |
| **f_honey** | **✗** | "" — honeypot NOT touched |
| f_submit | ✓ | clicked |

**Key findings**:
- Agent filled 7/11 fields + submit (8 interactions)
- Skipped 4 fields: newsletter, promo, referral, honeypot
- Honeypot correctly avoided (opacity:0, offscreen)
- Newsletter skipped (300 X's in aria-label may have deterred it)
- Promo and referral were visible but not in snapshot (different phase)

### 4. BARE_INPUT_EVENT on f_terms ✓

```json
{"t": 59596.3, "type": "BARE_INPUT_EVENT", 
 "detail": "f_terms: Event(\"input\") instead of InputEvent — evaluate fingerprint"}
```

The checkbox's `input` event was dispatched as `Event` instead of `InputEvent`. However, examining the fieldInteractions data, the terms checkbox actually has `trusted:true` events — this BARE_INPUT_EVENT came from the FIRST fill attempt (evaluate-based), not the second (click-based).

### 5. QSA Enumeration Pattern ✓

11 QSA calls detected at regular 5-second intervals:
```
t=4ms       → "#F input, #F select, #F button" (11 els) — page init
t=35005ms   → "#F input, #F select, #F button, #F [contenteditable]" (12 els)
t=40005ms   → same (12 els)
t=45004ms   → same (12 els)
...continues every 5s through t=75286ms
```

**Important caveat**: The 5-second interval QSA calls are from our OWN `buildExportPayload` setInterval, not from the agent. Only the t=4ms call is from page initialization.

### 6. sourceCapabilities Distribution ✓

```json
"sourceCapabilities": {
  "total": 180,
  "withCaps": 118,    // 65.6% — events with InputDeviceCapabilities
  "noCaps": 62,       // 34.4% — events WITHOUT capabilities (synthetic)
  "nullTrusted": 0    // none with null+trusted (would indicate Playwright's own)
}
```

**Interpretation**: 
- 118 events had `sourceCapabilities` set — these came from `pressSequentially` (CDP keyboard events include device caps)
- 62 events had NO sourceCapabilities — these came from `evaluate()` dispatched events (`new Event()` doesn't include device caps)
- The 65:35 ratio matches the two-phase fill pattern

---

## What We MISSED

### 1. No _ariaRef Detection ✗

```json
"ariaRefs": [],
"firstRefSeen": null
```

OpenClaw uses its own ref system (`pageId_N` format like `10_35`) — it does NOT use Playwright's native `_ariaRef` property on DOM elements. Our polling for `_ariaRef` found nothing.

### 2. No Environment Artifacts ✗

```json
"environment": {"artifacts": [], "scanned": true}
```

The existing-session driver doesn't inject Playwright's runtime into the page. No `__playwright`, no `__PW_*`, no `navigator.webdriver` flag. The browser is a normal Chrome instance that Playwright attaches to via CDP.

### 3. No Stack Trace Hits ✗

```json
"stackTraces": {"sampled": 180, "hits": 0, "findings": []}
```

We sampled 180 event stack traces and found zero hits for Playwright/automation signatures. The CDP-injected events have clean stack traces because they originate from the browser's native event dispatch, not from JavaScript.

### 4. No GBR Bursts ✗

```json
"gbrBursts": []
```

No `getBoundingClientRect` burst patterns detected. The agent used `evaluate()` to read layout info, not repeated GBR calls from page scripts.

### 5. No Direct Value Writes ✗

```json
"directValueWrites": []
```

Our `.value` setter hook didn't fire for the second fill (pressSequentially). It DID fire for the first fill (evaluate), but those events were captured as synthetic events instead.

### 6. No DOM Mutations ✗

```json
"domMutations": []
```

No unexpected DOM changes were detected.

---

## Detection Score Card

| Signal | Detected? | Confidence | Notes |
|--------|-----------|------------|-------|
| Synthetic events (isTrusted:false) | ✓ | HIGH | f_size input/change from evaluate |
| BARE_INPUT_EVENT | ✓ | HIGH | Event instead of InputEvent |
| evalFillPattern | ✓ | HIGH | Composite signal from evaluate behavior |
| Field touch map | ✓ | MEDIUM | Shows selective filling pattern |
| sourceCapabilities gap | ✓ | MEDIUM | 35% of events lack device caps |
| QSA enumerations | ⚠️ | LOW | Mostly our own code, not agent |
| _ariaRef | ✗ | — | Not applicable to OpenClaw |
| Environment artifacts | ✗ | — | existing-session is clean |
| Stack traces | ✗ | — | CDP events have clean stacks |
| Keystroke CV | ⚠️ | MISLEADING | CV=2.8 looks human, but median IKI=1.9ms is inhuman |

---

## Critical Gap: pressSequentially Events are Invisible

The most important finding: when OpenClaw uses `type` (pressSequentially), ALL events are:
- `isTrusted: true` ✓
- Have `sourceCapabilities` ✓  
- Have clean stack traces ✓
- Have individual character input events ✓

**The only way to detect pressSequentially is through TIMING analysis** — the sub-5ms inter-key intervals. Our probe captures this in `keystrokeTiming.allIntervals`, but we don't currently have an automated rule to flag it.

---

## Navigation

← [Part 4: Timing Forensics](OPENCLAW_ANALYSIS_PART4_TIMING_FORENSICS.md)  
→ [Part 6: ARIA Snapshot & UID Shift](OPENCLAW_ANALYSIS_PART6_ARIA_SNAPSHOT.md)
