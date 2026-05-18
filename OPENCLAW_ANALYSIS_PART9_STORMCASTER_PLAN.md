# OpenClaw Browser Tool — Part 9: Stormcaster Integration Plan

> How to detect OpenClaw (and similar AI agents) on customer sites

---

## Stormcaster's Mission

Detect when AI agents — specifically OpenClaw Browser Tool, Playwright-based AI agents, and LLM-driven automation — interact with our customers' web applications, without disrupting legitimate users.

---

## Detection Architecture

### Deployment Model

```
Customer Website
  ├── <script src="stormcaster.js">     ← injected via tag manager or inline
  │     ├── Event Monitors (passive)
  │     ├── Timing Analyzer (passive)
  │     ├── Behavioral Profiler (passive)
  │     └── Reporter (beacons to Stormcaster API)
  │
  └── Stormcaster API
        ├── Score Engine (real-time)
        ├── Session Forensics (batch)
        └── Alert Pipeline
```

### Key Constraint: Client-Side Only

Stormcaster runs in the customer's browser. It cannot:
- Monitor CDP traffic directly
- See the OpenClaw gateway process
- Access Chrome DevTools internals
- Read AX tree queries

It CAN:
- Listen to all DOM events
- Measure event timing with sub-ms precision
- Check event properties (isTrusted, sourceCapabilities, constructor)
- Monitor navigation and page lifecycle
- Detect side-effects of CDP operations

---

## Detection Modules

### Module 1: Keystroke Timing Analyzer

**Target**: pressSequentially sub-5ms intervals

```javascript
// Core detection logic
class KeystrokeAnalyzer {
  constructor() {
    this.fieldTimings = new Map(); // fieldId → [timestamps]
  }
  
  onKeydown(e) {
    const field = e.target.id || e.target.name;
    if (!this.fieldTimings.has(field)) {
      this.fieldTimings.set(field, []);
    }
    this.fieldTimings.get(field).push(performance.now());
  }
  
  analyze(field) {
    const times = this.fieldTimings.get(field);
    if (times.length < 5) return null;
    
    const intervals = [];
    for (let i = 1; i < times.length; i++) {
      intervals.push(times[i] - times[i-1]);
    }
    
    const median = sortedMedian(intervals);
    const min = Math.min(...intervals);
    
    return {
      signal: 'KEYSTROKE_TIMING',
      score: median < 5 ? 40 : median < 15 ? 20 : 0,
      data: { median, min, count: intervals.length }
    };
  }
}
```

**Thresholds**:
- Median IKI < 5ms → score 40 (definitive)
- Median IKI < 15ms → score 20 (suspicious)
- Median IKI < 30ms → score 10 (unusual but possible with some devices)

**False positive mitigation**: Ignore paste events, ignore autofill, require minimum 5 keystrokes per field.

---

### Module 2: Event Trust Monitor

**Target**: evaluate() synthetic events

```javascript
class EventTrustMonitor {
  constructor() {
    this.untrustedInputs = [];
    this.bareInputEvents = [];
  }
  
  onInput(e) {
    if (!e.isTrusted) {
      this.untrustedInputs.push({
        field: e.target.id,
        time: performance.now(),
        constructor: e.constructor.name
      });
    }
    
    // BARE_INPUT_EVENT: Event instead of InputEvent
    if (e.constructor === Event && e.type === 'input') {
      this.bareInputEvents.push({
        field: e.target.id,
        time: performance.now()
      });
    }
  }
  
  analyze() {
    return {
      signal: 'EVENT_TRUST',
      score: this.untrustedInputs.length > 0 ? 35 : 0,
      bareScore: this.bareInputEvents.length > 0 ? 35 : 0,
      data: {
        untrusted: this.untrustedInputs.length,
        bare: this.bareInputEvents.length
      }
    };
  }
}
```

**Caveats**:
- Some React/Angular frameworks dispatch synthetic events internally
- Need allowlist for known framework patterns
- Only flag on FORM input fields, not on framework-managed state

---

### Module 3: Inter-Field Timing Profiler

**Target**: LLM round-trip metronomic gaps

```javascript
class InterFieldProfiler {
  constructor() {
    this.fieldFocusTimes = []; // [{field, time}]
  }
  
  onFocus(e) {
    if (e.target.matches('input, select, textarea')) {
      this.fieldFocusTimes.push({
        field: e.target.id,
        time: performance.now()
      });
    }
  }
  
  analyze() {
    if (this.fieldFocusTimes.length < 4) return null;
    
    const gaps = [];
    for (let i = 1; i < this.fieldFocusTimes.length; i++) {
      gaps.push(this.fieldFocusTimes[i].time - this.fieldFocusTimes[i-1].time);
    }
    
    const mean = avg(gaps);
    const cv = stdev(gaps) / mean;
    const allAbove2s = gaps.every(g => g > 2000);
    
    return {
      signal: 'INTER_FIELD_TIMING',
      score: (cv < 0.5 && mean > 3000 && allAbove2s) ? 20 : 0,
      data: { mean, cv, gaps, allAbove2s }
    };
  }
}
```

**Note**: This specifically targets the LLM inference signature. Different LLMs will have different base times:
- GPT-5.4: ~4-6s per round-trip
- GPT-4o: ~2-4s per round-trip
- Claude: ~3-8s per round-trip
- Local LLMs: ~1-15s (highly variable)

**The constant is**: all gaps are similar because the LLM's inference time is consistent across fields.

---

### Module 4: sourceCapabilities Checker

**Target**: Mixed event provenance (CDP + evaluate)

```javascript
class CapabilitiesChecker {
  constructor() {
    this.withCaps = 0;
    this.withoutCaps = 0;
  }
  
  onEvent(e) {
    if (e.sourceCapabilities) {
      this.withCaps++;
    } else if (e.isTrusted) {
      // Trusted event WITHOUT sourceCapabilities is suspicious
      this.withoutCaps++;
    }
  }
  
  analyze() {
    const total = this.withCaps + this.withoutCaps;
    if (total < 10) return null;
    
    const ratio = this.withoutCaps / total;
    
    return {
      signal: 'SOURCE_CAPABILITIES',
      score: ratio > 0.2 ? 10 : 0,  // >20% missing is suspicious
      data: { withCaps: this.withCaps, withoutCaps: this.withoutCaps, ratio }
    };
  }
}
```

---

### Module 5: Navigation Pattern Detector

**Target**: Same-URL reload + refill

```javascript
class NavigationDetector {
  constructor() {
    this.lastUrl = location.href;
    this.formFillCount = 0;
  }
  
  onPageShow() {
    if (location.href === this.lastUrl && this.formFillCount > 0) {
      // Same URL, already filled before → reload+refill pattern
      this.sameUrlReload = true;
    }
    this.lastUrl = location.href;
  }
  
  onFormChange() {
    this.formFillCount++;
  }
  
  analyze() {
    return {
      signal: 'NAVIGATION_PATTERN',
      score: this.sameUrlReload ? 15 : 0,
      data: { sameUrlReload: this.sameUrlReload, fillCount: this.formFillCount }
    };
  }
}
```

---

### Module 6: Mouse Trajectory Analyzer

**Target**: CDP clicks without mouse movement

```javascript
class MouseAnalyzer {
  constructor() {
    this.lastMoveTime = 0;
    this.clicksWithoutMove = 0;
    this.totalClicks = 0;
  }
  
  onMouseMove() {
    this.lastMoveTime = performance.now();
  }
  
  onClick(e) {
    this.totalClicks++;
    const timeSinceMove = performance.now() - this.lastMoveTime;
    
    // Click without any mousemove in last 500ms
    if (timeSinceMove > 500 || this.lastMoveTime === 0) {
      this.clicksWithoutMove++;
    }
  }
  
  analyze() {
    if (this.totalClicks < 2) return null;
    
    const ratio = this.clicksWithoutMove / this.totalClicks;
    
    return {
      signal: 'MOUSE_TRAJECTORY',
      score: ratio > 0.5 ? 10 : 0,
      data: { clicksWithoutMove: this.clicksWithoutMove, total: this.totalClicks }
    };
  }
}
```

---

## Scoring & Reporting

### Real-Time Score Engine

```javascript
class StormcasterScorer {
  computeScore(modules) {
    let total = 0;
    const signals = [];
    
    for (const mod of modules) {
      const result = mod.analyze();
      if (result && result.score > 0) {
        total += result.score;
        signals.push(result);
      }
    }
    
    return {
      score: total,
      verdict: total >= 100 ? 'CONFIRMED_BOT' :
               total >= 70  ? 'HIGH_CONFIDENCE_BOT' :
               total >= 40  ? 'SUSPECTED_BOT' : 'HUMAN',
      signals,
      timestamp: Date.now(),
      sessionId: getSessionId()
    };
  }
}
```

### Beacon Strategy

```javascript
// Report on form submit
form.addEventListener('submit', () => {
  const result = scorer.computeScore(modules);
  navigator.sendBeacon('/stormcaster/report', JSON.stringify(result));
});

// Also report on suspicious threshold crossing
setInterval(() => {
  const result = scorer.computeScore(modules);
  if (result.score >= 40 && !reported) {
    navigator.sendBeacon('/stormcaster/alert', JSON.stringify(result));
    reported = true;
  }
}, 5000);
```

---

## Deployment Considerations

### Performance Budget

| Module | CPU Cost | Memory | Event Listeners |
|--------|----------|--------|-----------------|
| Keystroke Timing | Negligible | ~1KB/field | keydown |
| Event Trust | Negligible | ~100B/event | input, change |
| Inter-Field | Negligible | ~200B | focus |
| sourceCapabilities | Negligible | 8B (two counters) | all events |
| Navigation | Negligible | ~100B | pageshow |
| Mouse Trajectory | Low | 16B | mousemove, click |
| **Total** | **<1ms per event** | **<50KB** | **6 listeners** |

### Anti-Evasion

1. **Obfuscate detector code**: OpenClaw's LLM reads page source. Minify + obfuscate Stormcaster's code so the LLM can't identify and avoid detection.

2. **Event listener protection**: Use `Object.defineProperty` to prevent enumeration of our listeners via `getEventListeners()`.

3. **Timing measurement protection**: Use `performance.now()` with offset so the agent can't predict our timing windows.

4. **Report integrity**: Sign beacons with HMAC so the agent can't forge clean reports.

---

## What Stormcaster CANNOT Detect

| Gap | Reason | Mitigation |
|-----|--------|------------|
| CDP attachment | No client-side API | Server-side header analysis |
| AX tree queries | AX API is internal | Detect side-effects (focus events from AX traversal) |
| LLM inference | Happens off-browser | Timing is a proxy signal |
| OpenClaw gateway | Separate process | Network-level detection |
| Agent decision-making | Encrypted thinking | Behavioral analysis |

---

## Recommended Rollout

### Phase 1: Passive Collection (Week 1-2)
- Deploy all modules in logging mode (no blocking)
- Collect baseline data from real users
- Calibrate thresholds to minimize false positives

### Phase 2: Alerting (Week 3-4)
- Enable real-time alerts at score ≥ 70
- Human review of flagged sessions
- Tune scoring weights based on alert quality

### Phase 3: Active Response (Week 5+)
- Optional: challenge-response for suspected bots
- Optional: CAPTCHA injection at score ≥ 40
- Optional: form submission delay/rejection at score ≥ 100

---

## Navigation

← [Part 8: Composite Behavioral Fingerprint](OPENCLAW_ANALYSIS_PART8_BEHAVIORAL_FINGERPRINT.md)  
→ [Part 10: Probe Enhancement Roadmap](OPENCLAW_ANALYSIS_PART10_PROBE_ROADMAP.md)
