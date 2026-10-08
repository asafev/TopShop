# OpenClaw Browser Tool — Part 7: Self-Healing & Fallback Patterns

> How OpenClaw recovers from failures and what each recovery reveals

---

## Overview

OpenClaw's session hit **4 distinct failure types** and recovered from each using a predictable fallback chain. These recovery patterns are themselves detectable because they create characteristic sequences of CDP operations.

---

## Failure 1: Snapshot Blocked → Status → Tabs Check

### The Failure
**Call #1** — `browser.snapshot` returned an error or timeout on the first attempt.

### The Recovery Chain
```
browser.snapshot (fail)
  → browser.status             // "Is the browser alive?"
  → browser.tabs               // "Which pages are open?"
  → browser.navigate(url)      // Navigate to the target page
  → browser.snapshot           // Try snapshot again (success)
```

### What This Reveals
- OpenClaw's first instinct on snapshot failure is **health check**, not retry
- The `status → tabs` sequence is a diagnostic pattern — it confirms the browser is responsive before retrying
- This suggests a built-in error-handling protocol in the OpenClaw gateway

### Detection Signal
A `status → tabs → navigate` sequence within 2 seconds is strong evidence of programmatic recovery. No human performs these operations.

---

## Failure 2: Fill Failed → Evaluate Fallback

### The Failure
**Call #9** — `browser.fill` using refs failed to populate all fields correctly.

**Evidence**: Post-fill snapshot (call #10) showed fields still empty or incorrect.

### The Recovery Chain
```
browser.fill(ref="6_37", value="Lorem")      // tried ref-based fill
  → browser.snapshot                          // verify — FAILED, fields empty
  → browser.evaluate(js_fill_all_fields)      // fallback: inject JS
```

### The Evaluate Payload
```javascript
// Reconstructed from session behavior:
document.querySelector('#f_first').value = 'Lorem';
document.querySelector('#f_first').dispatchEvent(new Event('input'));
document.querySelector('#f_last').value = 'Ipsum';
// ... all fields set simultaneously
```

### What This Reveals
- OpenClaw's `fill` command (likely Playwright's `locator.fill()`) doesn't work reliably in existing-session mode
- The LLM recognized the failure from the snapshot diff and chose evaluate as fallback
- The evaluate approach fills ALL fields in one call rather than one-at-a-time

### Detection Signal
The pattern of `fill → verify → evaluate(set values + dispatch events)` is detectable because:
1. The evaluate creates `isTrusted:false` events
2. All fields change simultaneously (zero inter-field delay)
3. `Event` constructor used instead of `InputEvent`

---

## Failure 3: Type by Selector → Type by Ref

### The Failure
**Call #24** — First `browser.type` attempt may have used a CSS selector that didn't resolve, or a stale ref from before the page reload.

### The Recovery Chain
```
browser.type(selector="#f_first", text="Lorem")  // selector-based (uncertain)
  → browser.type(ref="10_35", text="Lorem")       // ref-based (confirmed working)
```

After the page reload assigned new UID 10, the LLM took a fresh snapshot and switched to using the new refs (`10_35` instead of `6_37`).

### What This Reveals
- The UID shift broke all cached refs from the previous page load
- The LLM correctly identified that refs changed after reload
- It adapted by re-snapshotting and extracting new refs

### Detection Signal
Taking a snapshot immediately after a page load, extracting refs, and using them within seconds is an automation pattern. Humans don't know about accessibility refs.

---

## Failure 4: Screenshot Failed → Evaluate CSS Inspection

### The Failure
**Call #13** — `browser.screenshot` was either unavailable or failed in existing-session mode.

### The Recovery Chain
```
browser.screenshot(ref="10_61")    // wanted visual of honeypot
  → browser.evaluate(              // fallback: inspect CSS programmatically
      "getComputedStyle(el).opacity + position + dimensions"
    )
```

### The Evaluate Payload
```javascript
// Approximate reconstruction:
const el = document.querySelector('[aria-labelledby]'); // or by ref
const style = getComputedStyle(el);
return {
  opacity: style.opacity,        // "0"
  position: style.position,      // "absolute" 
  width: el.offsetWidth,         // 4
  height: el.offsetHeight,       // 4
  left: style.left,              // "-9999px"
  overflow: style.overflow       // "hidden"
};
```

### What This Reveals
- Screenshot is broken in existing-session/Chrome-MCP mode
- The LLM is sophisticated enough to replace visual inspection with programmatic CSS analysis
- It correctly identified the honeypot from CSS properties alone

### Detection Signal
A `getComputedStyle()` call targeting a specific hidden element, immediately after a failed screenshot, reveals an agent doing anti-honeypot analysis. This is detectable via:
- `evaluate` calls reading specific CSS properties
- Targeting elements with suspicious characteristics (small size, opacity:0)

---

## Complete Fallback Chain

```
Primary Action          → Fallback 1          → Fallback 2
─────────────────────────────────────────────────────────────
snapshot                → status + tabs       → navigate + snapshot
fill(ref)               → evaluate(setValue)  → type(ref)
type(selector)          → type(ref)           → (none needed)
screenshot              → evaluate(CSS)       → (none needed)
click(ref) expired      → snapshot + click(newRef)
```

---

## Self-Healing Behavioral Fingerprint

The recovery patterns create a composite behavioral signature:

### Pattern 1: "Verify-Retry Loop"
```
action → snapshot → action(different method) → snapshot
```
The agent ALWAYS takes a snapshot after an action to verify it worked. If verification fails, it tries a different method. This creates:
- **Double the CDP traffic** compared to confident automation
- **Snapshot pairs** bracketing every fill action
- **Method variation** within a single form-fill session

### Pattern 2: "Progressive Escalation"
```
browser.fill (gentle) → browser.evaluate (invasive) → browser.type (CDP keyboard)
```
Methods escalate from least to most invasive. Each escalation level has different detection characteristics:
- `fill`: May or may not trigger events (implementation-dependent)
- `evaluate`: Creates `isTrusted:false` events, `Event` constructors
- `type`: Creates `isTrusted:true` events, sub-5ms keystroke intervals

### Pattern 3: "Reload Reset"
```
fill_attempt_1 → fails → navigate(same_url) → snapshot(new_refs) → fill_attempt_2
```
The nuclear option: reload the entire page and start over. This is detectable because:
- Navigation to the SAME URL within a session
- Complete re-fill of all fields after reload
- Different UID in snapshot refs

---

## Detection Rules

### Rule: "Method Switching"
```
IF same_field_targeted_by_multiple_methods
   AND methods ∈ {fill, evaluate, type}
   AND time_between_attempts < 30s
THEN flag as "AI agent fallback pattern"
```

### Rule: "Snapshot Bracketing"
```
IF snapshot_count > 3
   AND snapshots alternate with fill/type actions
   AND session_duration < 120s
THEN flag as "verification-driven automation"
```

### Rule: "Same-URL Reload + Refill"
```
IF navigation_to_same_url
   AND all_fields_refilled_after_navigation
   AND refill_uses_different_method
THEN flag as "AI agent recovery — form refill"
```

---

## Navigation

← [Part 6: ARIA Snapshot & UID Shift](OPENCLAW_ANALYSIS_PART6_ARIA_SNAPSHOT.md)  
→ [Part 8: Composite Behavioral Fingerprint](OPENCLAW_ANALYSIS_PART8_BEHAVIORAL_FINGERPRINT.md)
