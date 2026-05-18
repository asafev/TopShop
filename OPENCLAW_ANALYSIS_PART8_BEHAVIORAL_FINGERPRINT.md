# OpenClaw Browser Tool — Part 8: Composite Behavioral Fingerprint

> The complete "OpenClaw signature" — combining all signals into a detection identity

---

## The OpenClaw Identity Card

Based on Parts 1-7, here is the composite behavioral fingerprint of OpenClaw's browser tool:

---

## Layer 1: Static Fingerprint (Environment)

| Signal | Value | Detectable? |
|--------|-------|-------------|
| `navigator.webdriver` | `false` (not set) | ✗ |
| Playwright runtime globals | None (`__playwright`, `__PW_*`) | ✗ |
| Chrome DevTools Protocol | Active (attached debugger) | ⚠️ only via CDP detection |
| Browser process | Normal Chrome (pid 2924) | ✗ |
| User profile | Existing user data dir | ✗ |
| CDP port | Gateway.port + 2 (18791) | ✗ (local only) |
| AX tree access | Via `Accessibility.getFullAXTree` | ⚠️ detectable via side-effects |

**Verdict**: Static fingerprint is **clean**. The existing-session driver leaves almost no environmental traces. This is OpenClaw's biggest advantage over headless Playwright.

---

## Layer 2: Event Fingerprint (per interaction method)

### Method A: `evaluate()` — Direct JS Injection

| Signal | Detection | Confidence |
|--------|-----------|------------|
| `isTrusted: false` | ✓ Catchable | **HIGH** |
| `Event` instead of `InputEvent` | ✓ BARE_INPUT_EVENT | **HIGH** |
| No `sourceCapabilities` | ✓ Missing device caps | **MEDIUM** |
| All fields set in ~1ms | ✓ Zero inter-field gap | **HIGH** |
| No keydown/keypress/keyup | ✓ Missing event chain | **HIGH** |
| Clean stack trace | Limited — still from evaluate context | **LOW** |

### Method B: `type()` / `pressSequentially()` — CDP Keyboard

| Signal | Detection | Confidence |
|--------|-----------|------------|
| `isTrusted: true` | ✗ Looks legitimate | — |
| `InputEvent` correctly used | ✗ Correct constructor | — |
| `sourceCapabilities` present | ✗ Has device caps | — |
| Full keydown/input/keyup chain | ✗ Complete event sequence | — |
| Median IKI = 1.9ms | ✓ **Sub-5ms is inhuman** | **VERY HIGH** |
| Clean stack trace | ✗ Native browser dispatch | — |

### Method C: `click()` — CDP Mouse

| Signal | Detection | Confidence |
|--------|-----------|------------|
| `isTrusted: true` | ✗ Looks legitimate | — |
| `sourceCapabilities` present | ✗ Has device caps | — |
| No preceding mousemove chain | ⚠️ Missing hover/enter | **MEDIUM** |
| Click at element center | ⚠️ Precision targeting | **LOW** |

---

## Layer 3: Timing Fingerprint

| Signal | Value | Confidence |
|--------|-------|------------|
| Inter-field gap mean | 5,820ms | **HIGH** |
| Inter-field gap CV | 0.367 (low variance) | **HIGH** |
| All gaps > 2,000ms | true (min=4,028ms) | **HIGH** |
| Keystroke median IKI | 1.9ms | **VERY HIGH** |
| Keystroke min IKI | 1.4ms | **VERY HIGH** |
| First interaction delay | 34.5s after page load | **MEDIUM** |
| Total session | 75.3s for 8 interactions | **MEDIUM** |

**Timing is the strongest detection layer** because:
1. pressSequentially events pass ALL event-level checks
2. But the timing is physically impossible for humans
3. And the inter-field regularity is statistically improbable

---

## Layer 4: Behavioral Fingerprint

| Pattern | Description | Confidence |
|---------|-------------|------------|
| Snapshot-act-snapshot | Every action bracketed by AX tree queries | **HIGH** |
| Method fallback | fill → evaluate → type escalation | **HIGH** |
| Selective field filling | 7/11 fields filled (skips honeypot, newsletter) | **MEDIUM** |
| Same-URL reload | Navigates to same URL after failed fill | **HIGH** |
| CSS honeypot analysis | `getComputedStyle()` on suspicious elements | **MEDIUM** |
| Sequential single-field | One field per LLM round-trip | **HIGH** |
| Lorem ipsum content | Deterministic placeholder text | **LOW** |

---

## Layer 5: Content Fingerprint

| Signal | Value | Confidence |
|--------|-------|------------|
| First name | "Lorem" | **LOW** (could be deliberate) |
| Last name | "Ipsum" | **LOW** |
| Email | "lorem.ipsum@example.com" | **MEDIUM** (formulaic pattern) |
| Company | "Lorem Ipsum" | **LOW** |
| Bio | "Lorem ipsum" | **LOW** |
| All text fields use lorem ipsum | 5/5 text fields | **MEDIUM** (pattern across fields) |

---

## Composite Detection Matrix

### What's RELIABLY Detectable

| # | Signal | False Positive Risk | Implementation |
|---|--------|-------------------|----------------|
| 1 | Sub-5ms keystroke intervals | **NONE** | Keystroke timing monitor |
| 2 | isTrusted:false on form events | **VERY LOW** | Event listener check |
| 3 | Event vs InputEvent constructor | **VERY LOW** | Constructor comparison |
| 4 | Metronomic inter-field gaps (~5s) | **LOW** | Field focus timing |
| 5 | Missing event chain (no keydown before input) | **LOW** | Event sequence validator |

### What's PROBABLY Detectable

| # | Signal | False Positive Risk | Implementation |
|---|--------|-------------------|----------------|
| 6 | Multiple AX tree queries | **MEDIUM** | Side-effect detection |
| 7 | Same-URL reload + refill | **MEDIUM** | Navigation monitor |
| 8 | No mousemove before click | **MEDIUM** | Mouse trajectory analysis |
| 9 | evaluate() stack traces | **MEDIUM** | Stack sampling |
| 10 | sourceCapabilities inconsistency | **MEDIUM** | Event property check |

### What's NOT Reliably Detectable

| # | Signal | Why Not |
|---|--------|---------|
| 11 | Navigator.webdriver | Not set in existing-session |
| 12 | Playwright globals | Not injected in existing-session |
| 13 | CDP attachment | No reliable client-side detection |
| 14 | Content patterns (lorem ipsum) | Could be deliberate, low confidence |
| 15 | Honeypot avoidance | Sophisticated humans also avoid traps |

---

## The "OpenClaw Score"

Proposed composite scoring for production detection:

```
SCORE = 0

// Tier 1: Definitive signals (each alone is sufficient)
IF sub_5ms_keystroke_median      → SCORE += 40
IF isTrusted_false_on_form_input → SCORE += 35
IF bare_input_event              → SCORE += 35

// Tier 2: Strong supporting signals
IF metronomic_inter_field_gaps   → SCORE += 20
IF missing_keydown_before_input  → SCORE += 15
IF same_url_reload_and_refill    → SCORE += 15

// Tier 3: Weak but cumulative signals
IF no_mousemove_before_click     → SCORE += 10
IF source_capabilities_gap       → SCORE += 10
IF evaluate_stack_pattern        → SCORE += 5
IF lorem_ipsum_content_pattern   → SCORE += 5

// Thresholds
IF SCORE >= 40  → FLAG as "AI Agent Detected"
IF SCORE >= 70  → FLAG as "High Confidence AI Agent"
IF SCORE >= 100 → FLAG as "Confirmed Automation"
```

### This Session's Score

```
Sub-5ms keystrokes:    +40 ✓ (median=1.9ms)
isTrusted false:       +35 ✓ (f_size synthetic events)
BARE_INPUT_EVENT:      +35 ✓ (Event instead of InputEvent)
Metronomic gaps:       +20 ✓ (CV=0.37, mean=5.8s)
Same-URL reload:       +15 ✓ (navigate to same URL)
No mousemove:          +10 ✓ (clicks without mouse trajectory)
sourceCapabilities:    +10 ✓ (35% gap)
Lorem ipsum:           +5  ✓ (5/5 text fields)
                       ─────
TOTAL:                 170  → "Confirmed Automation"
```

---

## What Makes OpenClaw Different From Other Agents

| Feature | OpenClaw | Playwright Bot | Puppeteer Bot | Browser Extension |
|---------|----------|---------------|---------------|-------------------|
| webdriver flag | ✗ clean | ✓ set | ✓ set | ✗ clean |
| Runtime globals | ✗ none | ✓ __playwright | ✓ __puppeteer | ✗ none |
| isTrusted events | Mixed | Often false | Often false | ✓ true |
| Keystroke timing | 1.9ms median | 0-5ms | 0ms (instant) | Human-speed |
| Inter-field gaps | ~5s (LLM) | <100ms | <100ms | Human-speed |
| Self-healing | ✓ sophisticated | Basic retry | Basic retry | ✗ none |
| Honeypot avoidance | ✓ CSS inspection | ✗ fills blindly | ✗ fills blindly | Depends on user |
| AX tree queries | ✓ frequent | Rare | Never | Never |

**OpenClaw's unique signature**: Clean environment + mixed event trust + LLM-speed timing + self-healing fallbacks + AX tree navigation.

---

## Navigation

← [Part 7: Self-Healing & Fallback Patterns](OPENCLAW_ANALYSIS_PART7_SELF_HEALING.md)  
→ [Part 9: Stormcaster Integration Plan](OPENCLAW_ANALYSIS_PART9_STORMCASTER_PLAN.md)
