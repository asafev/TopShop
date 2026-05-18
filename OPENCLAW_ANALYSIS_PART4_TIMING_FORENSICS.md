# OpenClaw Browser Tool — Part 4: Typing & Timing Forensics

> Keystroke-level and field-level timing analysis from probe data

---

## Two Timing Layers

OpenClaw's browser tool produces timing at two distinct scales:

1. **Macro-timing**: Gap between fields (seconds) — controlled by LLM round-trip
2. **Micro-timing**: Gap between keystrokes within a field (milliseconds) — controlled by Playwright's `pressSequentially()`

---

## Field-Level Timeline (Macro-timing)

From `snapshotResearch.agentActions`:

| Field | Focus Time (ms) | Duration | Gap from Previous |
|-------|-----------------|----------|-------------------|
| f_first | 34,543 | 19.6ms (5 chars) | — (first field) |
| f_last | 38,972 | 90.7ms (5 chars) | **4,429ms** |
| f_email | 44,259 | 41.5ms (23 chars) | **5,287ms** |
| f_company | 48,287 | 34.7ms (11 chars) | **4,028ms** |
| f_size | 54,377 | <1ms (select) | **6,090ms** |
| f_terms | 59,596 | <1ms (click) | **5,219ms** |
| f_bio | 64,690 | 21.6ms (11 chars) | **5,094ms** |
| f_submit | 75,284 | <1ms (click) | **10,594ms** |

### Inter-Field Gap Analysis

```
Gaps: 4429, 5287, 4028, 6090, 5219, 5094, 10594 ms

Mean:     5820ms
Median:   5219ms
Stdev:    2136ms
CV:       0.367
Min:      4028ms
Max:      10594ms
```

### Why These Specific Gaps?

Each gap = **LLM inference time + CDP round-trip**:
1. LLM receives tool result from previous action (~4-6s inference on GPT-5.4)
2. LLM decides next action (~50ms)
3. CDP sends type/click command (~20ms)
4. Playwright executes action (~20-100ms)

**The ~4-6 second inter-field gap is a STRONG SIGNAL.**

A human filling a form has irregular gaps: fast for known info, slow for thinking, very slow for unfamiliar fields. OpenClaw's gaps cluster around 5 seconds because **every field requires one LLM round-trip**.

### Detection Rule: "Metronomic Inter-Field Timing"

```
IF inter_field_gaps.length >= 4
   AND stdev(gaps) / mean(gaps) < 0.5    (low relative variance)
   AND mean(gaps) > 3000                  (consistent ~3-6s)
   AND all gaps > 2000                    (no instant fills)
THEN flag as "AI-agent metronomic pacing"
```

This would detect OpenClaw but NOT:
- Human filling (irregular gaps, some <500ms, some >15s)
- Classic bot (all gaps <100ms)
- Autofill (all fields set in <50ms total)

---

## Keystroke-Level Analysis (Micro-timing)

### Raw Inter-Key Intervals (from probe `keystrokeTiming.allIntervals`)

```
f_first "Lorem":     6.0, 2.4, 2.5, 4.9                    → avg 3.95ms
f_last "Ipsum":      4.3, 3.3, 3.3, 77.5                   → avg 22.1ms (outlier!)
f_email (23 chars):  3.2, 1.9, 2.7, 2.1, 1.6, 1.9, 2.5,   → avg ~1.8ms
                     1.7, 1.6, 1.5, 1.7, 1.6, 1.4, 1.5,
                     1.7, 1.7, 1.7, 1.7, 1.6, 1.4, 1.5, 1.5
f_company (11 chars): 2.7, 1.9, 1.8, 1.4, 1.6, 2.0, 5.8,  → avg ~2.5ms
                      4.1, 2.0, 2.1
f_bio (11 chars):     2.6, 1.8, 2.0, 1.6, 1.9, 3.0, 1.9,  → avg ~2.0ms
                      1.5, 1.9, 1.8
```

### Statistical Summary

| Metric | Value |
|--------|-------|
| Overall CV | 2.7956 |
| Mean interval | 3.96ms |
| Median interval | 1.9ms |
| Min interval | **1.4ms** |
| Max interval | **77.5ms** |
| Total keystrokes | 50 measured |

### Why CV=2.7956 Looks "Human"

The coefficient of variation is HIGH (>1.0) because of the 77.5ms outlier in "Ipsum". Without it:
- CV would be ~0.45 (still somewhat varied)
- But the median of 1.9ms is **physically impossible for a human**

### The Dual-Signature Problem

Playwright's `pressSequentially()` creates a timing pattern that is:
- **Macro-realistic**: High variance (CV ~2.8) due to occasional large gaps
- **Micro-inhuman**: Base interval of 1.4-2.0ms is 10-50× faster than human typing

**Human comparison**:
| Typist | Median IKI | Min IKI | CV |
|--------|-----------|---------|-----|
| Fast human (120 WPM) | ~60ms | ~30ms | 0.3-0.5 |
| Average human | ~150ms | ~50ms | 0.5-0.8 |
| Slow human | ~300ms | ~100ms | 0.3-0.6 |
| **OpenClaw** | **1.9ms** | **1.4ms** | **2.8** |

### Detection Rule: "Sub-5ms Keystroke Intervals"

```
IF median_inter_key_interval < 5ms
   AND keystroke_count > 10
THEN flag as "mechanical typing — Playwright pressSequentially"
```

This is an **extremely reliable signal**. No human can type at 1.4ms intervals. Even the fastest gaming macros typically produce 10ms+ intervals.

### The 77.5ms Outlier

The single 77.5ms gap in "Ipsum" (between 'u' and 'm') is caused by Playwright's built-in randomization. But one outlier in 50 keystrokes doesn't change the fundamental: **the base timing is machine-speed**.

---

## Typing vs. Evaluate Comparison

The session had TWO fill strategies. Their timing signatures are completely different:

### Strategy 1: Evaluate-based fill (Phase 4, call #17)
```
All fields set simultaneously in 1 evaluate call
Time: ~1ms total for all 9 fields
Events: isTrusted:false (new Event())
Timing: Zero inter-key intervals (instant)
```

### Strategy 2: pressSequentially (Phase 7, calls #24-30)
```
Each field typed character-by-character
Time: ~40ms per field (typing), ~5s between fields (LLM round-trip)  
Events: isTrusted:true (CDP keyboard events)
Timing: 1.4-77.5ms inter-key intervals
```

**Our probe captured BOTH strategies** because the page was reloaded between them. The first fill (evaluate) left synthetic events. The second fill (type) left the keystroke timing data.

---

## Timing Fingerprint Summary

| Signal | Value | Detection Confidence |
|--------|-------|---------------------|
| Inter-field gaps ~5s | Mean=5.8s, CV=0.37 | **HIGH** — unique to LLM-driven agents |
| Sub-5ms keystroke intervals | Median=1.9ms | **VERY HIGH** — physically impossible for humans |
| First interaction at ~34s | 34,543ms after load | **MEDIUM** — AI processing time before first action |
| Total session ~75s for 8 fields | 9.4s/field average | **MEDIUM** — consistent with LLM round-trip |
| Zero inter-key for evaluate fills | 0ms (all at once) | **HIGH** — evaluate fingerprint |

---

## Navigation

← [Part 3: Browser Mechanics](OPENCLAW_ANALYSIS_PART3_BROWSER_MECHANICS.md)  
→ [Part 5: Detection Results Analysis](OPENCLAW_ANALYSIS_PART5_DETECTION_RESULTS.md)
