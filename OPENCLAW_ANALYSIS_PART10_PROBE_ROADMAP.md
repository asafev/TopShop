# OpenClaw Browser Tool — Part 10: Probe Enhancement Roadmap

> Improvements for openclaw-probe.html based on session forensics

---

## Current Probe Capabilities (Baseline)

What `openclaw-probe.html` currently detects:

| Module | Status | Effectiveness vs OpenClaw |
|--------|--------|--------------------------|
| Synthetic event monitor | ✓ Working | Caught f_size evaluate events |
| BARE_INPUT_EVENT | ✓ Working | Caught Event vs InputEvent |
| Field interaction tracker | ✓ Working | Mapped all 8 interactions |
| Keystroke timing | ✓ Working | Captured 50 intervals |
| sourceCapabilities | ✓ Working | Counted 118/62 split |
| QSA enumeration | ⚠️ Self-contaminating | Our own setInterval triggers it |
| _ariaRef detection | ✗ Not applicable | OpenClaw uses pageId_N format |
| Environment scan | ✗ Nothing found | existing-session is clean |
| Stack trace sampling | ✗ No hits | CDP events have clean stacks |
| Honeypot | ✓ Working | Correctly untouched |

---

## Priority Enhancements

### P0: Fix QSA Self-Detection (Bug Fix)

**Problem**: Our `buildExportPayload` uses a 5-second `setInterval` that calls `querySelectorAll` to enumerate form elements. This pollutes our own QSA detection data.

**Fix**:
```javascript
// Before: QSA monitor catches our own enumeration
const observer = new MutationObserver(() => { /* ... */ });

// After: Exclude our own calls using a flag
let _probeQSA = false;

const originalQSA = document.querySelectorAll;
document.querySelectorAll = function(selector) {
  if (!_probeQSA) {
    recordQSACall(selector, performance.now());
  }
  return originalQSA.call(this, selector);
};

// In buildExportPayload:
_probeQSA = true;
const elements = document.querySelectorAll('#F input, #F select...');
_probeQSA = false;
```

**Impact**: Eliminates false QSA enumeration data. The only remaining QSA calls would be from the agent's evaluate code (if any).

---

### P0: Automated Keystroke Timing Verdict

**Problem**: We collect keystroke timing data but don't produce an automated verdict. The analyst must manually check if median IKI < 5ms.

**Enhancement**:
```javascript
function analyzeKeystrokeTimings(intervals) {
  if (intervals.length < 5) return { verdict: 'INSUFFICIENT_DATA' };
  
  const sorted = [...intervals].sort((a, b) => a - b);
  const median = sorted[Math.floor(sorted.length / 2)];
  const min = sorted[0];
  const p95 = sorted[Math.floor(sorted.length * 0.95)];
  
  if (median < 5) {
    return { 
      verdict: 'MECHANICAL_TYPING',
      confidence: 'VERY_HIGH',
      detail: `Median IKI ${median.toFixed(1)}ms — physically impossible for humans`,
      median, min, p95
    };
  }
  if (median < 15) {
    return {
      verdict: 'SUSPICIOUS_TYPING',
      confidence: 'HIGH',
      detail: `Median IKI ${median.toFixed(1)}ms — faster than fastest known typists`,
      median, min, p95
    };
  }
  return { verdict: 'HUMAN_RANGE', confidence: 'LOW', median, min, p95 };
}
```

**Add to export payload**: `keystrokeTiming.verdict` field.

---

### P0: Inter-Field Timing Analysis

**Problem**: We capture field focus times but don't analyze the inter-field gap pattern.

**Enhancement**:
```javascript
function analyzeInterFieldGaps(fieldFocusTimes) {
  if (fieldFocusTimes.length < 4) return null;
  
  const gaps = [];
  for (let i = 1; i < fieldFocusTimes.length; i++) {
    gaps.push(fieldFocusTimes[i].time - fieldFocusTimes[i-1].time);
  }
  
  const mean = gaps.reduce((a, b) => a + b) / gaps.length;
  const stdev = Math.sqrt(gaps.reduce((a, b) => a + (b - mean) ** 2, 0) / gaps.length);
  const cv = stdev / mean;
  const allAbove2s = gaps.every(g => g > 2000);
  
  if (cv < 0.5 && mean > 3000 && allAbove2s) {
    return {
      verdict: 'LLM_METRONOMIC',
      confidence: 'HIGH',
      detail: `Inter-field gaps: mean=${(mean/1000).toFixed(1)}s, CV=${cv.toFixed(2)} — consistent with LLM round-trip`,
      mean, cv, gaps
    };
  }
  return { verdict: 'HUMAN_PATTERN', mean, cv, gaps };
}
```

**Add to export payload**: `interFieldTiming` section.

---

### P1: Replace _ariaRef with pageId_N Detection

**Problem**: We poll for `_ariaRef` which is Playwright-specific. OpenClaw uses its own ref format.

**Enhancement**: Instead of looking for `_ariaRef` properties, detect the SIDE EFFECTS of AX tree queries:

```javascript
// Detect Accessibility.getFullAXTree side effects
// When Chrome builds the AX tree, it may trigger:
// 1. getComputedStyle calls (for visibility checks)
// 2. Layout recalculations
// 3. Role computations

// Monitor for getComputedStyle bursts
let gcsCallCount = 0;
let gcsBurstStart = 0;
const GCS_BURST_THRESHOLD = 50; // 50+ calls in 100ms

const origGCS = window.getComputedStyle;
window.getComputedStyle = function(...args) {
  const now = performance.now();
  if (now - gcsBurstStart > 100) {
    if (gcsCallCount > GCS_BURST_THRESHOLD) {
      recordAXTreeQuery(gcsBurstStart, gcsCallCount);
    }
    gcsCallCount = 0;
    gcsBurstStart = now;
  }
  gcsCallCount++;
  return origGCS.apply(this, args);
};
```

**Note**: This is speculative — needs testing to confirm AX tree queries trigger getComputedStyle bursts.

---

### P1: Evaluate Detection via Property Descriptors

**Problem**: When OpenClaw uses `evaluate()` to set field values, we catch the events but not the value assignment itself.

**Enhancement**: Intercept `.value` setter on form elements:

```javascript
function hookValueSetter(element) {
  const descriptor = Object.getOwnPropertyDescriptor(
    HTMLInputElement.prototype, 'value'
  );
  
  Object.defineProperty(element, 'value', {
    get() { return descriptor.get.call(this); },
    set(v) {
      recordDirectValueWrite({
        field: this.id,
        value: v,
        time: performance.now(),
        stack: new Error().stack
      });
      return descriptor.set.call(this, v);
    }
  });
}

// Apply to all form inputs
document.querySelectorAll('#F input, #F select, #F textarea')
  .forEach(hookValueSetter);
```

**Why this helps**: The stack trace from the `.value` setter will show `evaluate` context, which is different from a user typing.

---

### P1: Enhanced Honeypot Design

**Problem**: GPT-5.4 detected our current honeypot by inspecting CSS with `getComputedStyle()`.

**Enhancement**: Multi-layer honeypot that's harder to detect programmatically:

```html
<!-- Honeypot v2: No CSS hiding. Instead, use visual context -->
<div class="form-section" id="admin-section">
  <label for="f_admin_code">
    Internal admin code 
    <span class="sublabel">(leave blank if not staff)</span>
  </label>
  <input type="text" id="f_admin_code" name="admin_code" 
         placeholder="Staff only"
         style="opacity:1; width:100%; height:auto;">
</div>
```

**Strategy changes**:
1. **No CSS hiding**: opacity:1, full size, normal position
2. **Contextual trap**: "Internal admin code" — a human knows to skip it, an AI might fill it
3. **Explicit skip instruction**: "leave blank if not staff"
4. **Multiple honeypots**: Add 2-3 with different contexts (admin, internal, debug)

**Advanced honeypot**: A field that's visually hidden using a CSS class that requires traversing stylesheets (not inline style), making `getComputedStyle` analysis harder:

```css
/* In a separate stylesheet, not inline */
.form-section:nth-child(7) > input { 
  clip-path: inset(50%);
  position: absolute;
}
```

---

### P1: Mouse Movement Trajectory Capture

**Problem**: We don't capture mouse movement data. CDP clicks lack preceding mouse trajectories.

**Enhancement**:
```javascript
class MouseTrajectoryCapture {
  constructor() {
    this.movements = [];
    this.clicks = [];
    this.MAX_MOVEMENTS = 500;
  }
  
  onMouseMove(e) {
    if (this.movements.length < this.MAX_MOVEMENTS) {
      this.movements.push({
        x: e.clientX, y: e.clientY,
        t: performance.now()
      });
    }
  }
  
  onClick(e) {
    const recentMoves = this.movements.filter(
      m => performance.now() - m.t < 1000
    );
    
    this.clicks.push({
      x: e.clientX, y: e.clientY,
      t: performance.now(),
      target: e.target.id,
      precedingMoves: recentMoves.length,
      isTrusted: e.isTrusted
    });
  }
  
  analyze() {
    const noMoveBefore = this.clicks.filter(c => c.precedingMoves === 0);
    return {
      totalClicks: this.clicks.length,
      clicksWithoutMove: noMoveBefore.length,
      ratio: noMoveBefore.length / (this.clicks.length || 1)
    };
  }
}
```

---

### P2: Event Sequence Validator

**Problem**: We check individual events but not the sequence. Real keystrokes produce `keydown → keypress → input → keyup`. CDP keyboard events produce the same sequence, but evaluate-based fills skip keydown/keypress/keyup entirely.

**Enhancement**:
```javascript
class EventSequenceValidator {
  constructor() {
    this.sequences = new Map(); // field → [event types in order]
  }
  
  onEvent(e) {
    const field = e.target.id;
    if (!this.sequences.has(field)) {
      this.sequences.set(field, []);
    }
    this.sequences.get(field).push({
      type: e.type,
      time: performance.now(),
      trusted: e.isTrusted
    });
  }
  
  analyze(field) {
    const seq = this.sequences.get(field);
    if (!seq) return null;
    
    // Check for input events without preceding keydown
    const inputsWithoutKeydown = seq.filter((ev, i) => {
      if (ev.type !== 'input') return false;
      const prev = seq.slice(Math.max(0, i-3), i);
      return !prev.some(p => p.type === 'keydown');
    });
    
    return {
      field,
      totalEvents: seq.length,
      orphanInputs: inputsWithoutKeydown.length,
      verdict: inputsWithoutKeydown.length > 0 ? 
        'MISSING_KEY_EVENTS' : 'NORMAL_SEQUENCE'
    };
  }
}
```

---

### P2: CDP Detection via Performance API

**Problem**: We can't directly detect CDP attachment.

**Speculative Enhancement**: Chrome's Performance API may expose CDP overhead:

```javascript
// Check for CDP-related performance entries
function checkCDPSideEffects() {
  // 1. Check for unusual task durations (CDP evaluate causes main-thread tasks)
  const entries = performance.getEntriesByType('longtask');
  const shortBursts = entries.filter(e => 
    e.duration > 10 && e.duration < 50 && 
    e.name === 'self'
  );
  
  // 2. Check if DevTools protocol is attaching debugger
  // This is speculative — needs validation
  const hasDebugger = (() => {
    const start = performance.now();
    debugger; // If CDP debugger is attached, this pauses
    return performance.now() - start > 100;
  })();
  
  return { shortBursts: shortBursts.length, hasDebugger };
}
```

**Warning**: The `debugger` statement approach would also pause for human DevTools users. Needs careful handling.

---

## Summary: Enhancement Priority Matrix

| ID | Enhancement | Priority | Effort | Impact |
|----|------------|----------|--------|--------|
| E1 | Fix QSA self-detection | P0 | Low | Eliminates false data |
| E2 | Automated keystroke verdict | P0 | Low | Instant mechanical typing flag |
| E3 | Inter-field timing analysis | P0 | Low | LLM round-trip detection |
| E4 | pageId_N / AX tree side-effects | P1 | Medium | OpenClaw-specific signal |
| E5 | Evaluate property descriptor hook | P1 | Medium | Catches value injection + stack |
| E6 | Enhanced honeypot (no CSS hiding) | P1 | Medium | Defeats CSS inspection |
| E7 | Mouse trajectory capture | P1 | Low | CDP click fingerprint |
| E8 | Event sequence validator | P2 | Medium | Evaluate fill fingerprint |
| E9 | CDP performance API detection | P2 | High | Speculative, needs testing |

---

## Implementation Order

1. **Quick wins** (E1, E2, E3): Fix bugs and add automated verdicts. Can be done in one session.
2. **New signals** (E5, E6, E7): Add property hooks, better honeypots, mouse tracking. One session each.
3. **Research items** (E4, E8, E9): Need testing against live OpenClaw to validate. Research sprints.

---

## Navigation

← [Part 9: Stormcaster Integration Plan](OPENCLAW_ANALYSIS_PART9_STORMCASTER_PLAN.md)  
→ [Part 1: Session Flow Reconstruction](OPENCLAW_ANALYSIS_PART1_SESSION_FLOW.md) (back to start)

---

## Full Series Index

1. [Session Flow Reconstruction](OPENCLAW_ANALYSIS_PART1_SESSION_FLOW.md)
2. [LLM Decision Analysis](OPENCLAW_ANALYSIS_PART2_LLM_DECISIONS.md)
3. [Browser Mechanics & Architecture](OPENCLAW_ANALYSIS_PART3_BROWSER_MECHANICS.md)
4. [Typing & Timing Forensics](OPENCLAW_ANALYSIS_PART4_TIMING_FORENSICS.md)
5. [Detection Results Analysis](OPENCLAW_ANALYSIS_PART5_DETECTION_RESULTS.md)
6. [ARIA Snapshot & UID Shift](OPENCLAW_ANALYSIS_PART6_ARIA_SNAPSHOT.md)
7. [Self-Healing & Fallback Patterns](OPENCLAW_ANALYSIS_PART7_SELF_HEALING.md)
8. [Composite Behavioral Fingerprint](OPENCLAW_ANALYSIS_PART8_BEHAVIORAL_FINGERPRINT.md)
9. [Stormcaster Integration Plan](OPENCLAW_ANALYSIS_PART9_STORMCASTER_PLAN.md)
10. [Probe Enhancement Roadmap](OPENCLAW_ANALYSIS_PART10_PROBE_ROADMAP.md) ← you are here
