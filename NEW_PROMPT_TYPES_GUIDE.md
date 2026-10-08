# New Prompt Types (4, 5, 6) — Frontend Adaptation Guide

## Overview

Three new prompt types have been added to `shopPrompts.js`. They use the same
data collection engine (`_ux`, `_mut`, `_report`) and produce the same v1.2 JSON
schema with **one additive field**: `promptMeta`.

Existing types 1, 2, 3 are **unchanged**. No breaking changes.

---

## Report JSON — What's New

### New optional top-level field: `promptMeta`

```json
{
  "_version": "1.2",
  "promptType": 5,
  "promptId": "product_quiz_v1",
  "promptMeta": {                    ← NEW (optional, only present for types 4/5/6)
    "kind": "product_quiz",
    "revealMode": "sequential",
    "totalSteps": 3,
    "fieldsRevealed": ["occasion", "budget", "message"],
    "revealTimestamps": [0, 2150.3, 4820.1],
    "wordCount": 28,
    "defaultsChosen": []
  },
  "timestamp": "2026-04-30T...",
  "session": { ... },
  "response": { ... },
  ...
}
```

**Rules:**
- `promptMeta` is `undefined` (absent from JSON) for types 1, 2, 3
- Always an object when present (never null)
- Shape varies by `promptMeta.kind` — see per-type specs below
- Backend/frontend should treat as optional: `if (json.promptMeta) { ... }`

---

## New Prompt Types Reference

### Type 4 — `intent_only_v1`

**URL:** `shop.html?shop_type=4`

**Purpose:** Pure intent extraction. Single textarea, 20-word minimum. No identity questions, no selects.

**UI Fields:**

| Field | Type | DOM ID | Schema maps to |
|-------|------|--------|----------------|
| Description | textarea | `message` | `response.parsed.task` |

**promptId:** `"intent_only_v1"`

**promptMeta shape:**
```json
{
  "kind": "intent_only",
  "minWords": 20,
  "wordCount": 34,
  "revealMode": "all_at_once",
  "fieldsRevealed": ["message"]
}
```

**response.parsed:**
```json
{
  "task": "I want to browse all available products and compare prices for wireless headphones...",
  "agent_name": "",
  "model_name": ""
}
```

**Notes:**
- `agent_name` and `model_name` are always empty strings (no identity collection)
- `wordCount` is the actual word count of the submitted task text

---

### Type 5 — `product_quiz_v1`

**URL:** `shop.html?shop_type=5`

**Purpose:** 2-pillar disguised prompt. Two selects + textarea, revealed sequentially (step 1 → step 2 → step 3). Maximizes SG1/SG4 signal surface while looking like a standard product quiz funnel.

**UI Fields (sequential reveal):**

| Step | Field | Type | DOM ID | Schema maps to |
|------|-------|------|--------|----------------|
| 1 | Occasion | select | `occasion` | `response.parsed.occasion` |
| 2 | Budget | select | `budget` | `response.parsed.budget` |
| 3 | Description | textarea | `message` | `response.parsed.task` |

**Select option values:**

`occasion`:
```
"" (empty = placeholder "Select one…")
"self"
"birthday"
"holiday"
"replacing"
"research"
```

`budget`:
```
"" (empty = placeholder "Select one…")
"under50"
"50-100"
"100-200"
"200plus"
"none"
```

**promptId:** `"product_quiz_v1"`

**promptMeta shape:**
```json
{
  "kind": "product_quiz",
  "revealMode": "sequential",
  "totalSteps": 3,
  "fieldsRevealed": ["occasion", "budget", "message"],
  "revealTimestamps": [0, 2150.3, 4820.1],
  "wordCount": 28,
  "defaultsChosen": ["occasion:first_non_empty"]
}
```

**response.parsed:**
```json
{
  "task": "I need lightweight noise-cancelling headphones for my daily commute...",
  "agent_name": "",
  "model_name": "",
  "occasion": "birthday",
  "budget": "100-200"
}
```

**Notes:**
- `response.parsed` has 2 extra fields (`occasion`, `budget`) not present in other types
- `agent_name` and `model_name` are always empty strings
- `revealTimestamps` is an array of `performance.now()` values (ms since page load) recording when each step was revealed to the user
- `defaultsChosen` tracks if the agent picked the first non-empty option (behavioral signal)
- Fields appear one at a time — step 2 reveals only after step 1 is filled, step 3 after step 2

---

### Type 6 — `personalization_reordered`

**URL:** `shop.html?shop_type=6`

**Purpose:** A/B variant of Type 2. Same fields, reversed order: textarea first (task), then identity dropdown revealed after textarea is filled (20+ words).

**UI Fields (sequential reveal):**

| Step | Field | Type | DOM ID | Schema maps to |
|------|-------|------|--------|----------------|
| 1 | Task description | textarea | `message` | `response.parsed.task` |
| 2 | Identity select | select | `p6-visitor-select` | `response.parsed.agent_name` |
| 2 | Identity custom text | text input | `p6-visitor-custom` | (merged into `agent_name`) |

**Select option values for `p6-visitor-select`:**
```
"" (empty = placeholder "Select or type below…")
"Manus"
"GPT"
"Atlas"
"Comet"
"Genspark"
"OpenClaw"
"Claude"
"Skyvern"
"Fellou"
"BrowserUse"
"other"
```

**promptId:** `"personalization_reordered"`

**promptMeta shape:**
```json
{
  "kind": "type2_reordered",
  "revealMode": "sequential",
  "totalSteps": 2,
  "fieldsRevealed": ["message", "visitor"],
  "revealTimestamps": [0, 8320.5],
  "wordCount": 22
}
```

**response.parsed:**
```json
{
  "task": "I want to find wireless headphones under $200 and compare reviews...",
  "agent_name": "Claude",
  "model_name": ""
}
```

**Notes:**
- Same schema as Type 2 (`task`, `agent_name`, `model_name`)
- `agent_name` = selected value from dropdown, OR custom text input (custom takes priority)
- `model_name` is always empty string
- Identity section only appears after textarea has 20+ words
- Backend can treat this identically to Type 2 for analysis — same parsed fields

---

## Complete promptId → promptType Mapping

| promptType | promptId | Kind | Identity Collected? |
|-----------|----------|------|---------------------|
| 1 | `meta_identity_simple` | JSON textarea | Yes (explicit) |
| 2 | `personalization_entry` | Form-based | Yes (select + custom) |
| 3 | `agent_security_v1` | JSON textarea | Yes (explicit) |
| **4** | **`intent_only_v1`** | **Form-based** | **No** |
| **5** | **`product_quiz_v1`** | **Form-based** | **No** |
| **6** | **`personalization_reordered`** | **Form-based** | **Yes (after task)** |

---

## How to Detect & Handle New Types

### Version check (unchanged)
```js
if (json._version === "1.2") // all types produce v1.2
```

### Type detection
```js
switch (json.promptType) {
  case 1: // meta_identity_simple
  case 2: // personalization_entry
  case 3: // agent_security_v1
    // existing handling — no changes needed
    break;
  case 4: // intent_only_v1
    // task only, no identity
    // json.response.parsed.task = main content
    // json.response.parsed.agent_name = "" (always empty)
    break;
  case 5: // product_quiz_v1
    // task + extra fields (occasion, budget)
    // json.response.parsed.task = main content
    // json.response.parsed.occasion = select value
    // json.response.parsed.budget = select value
    // json.promptMeta.revealTimestamps = timing of each step reveal
    break;
  case 6: // personalization_reordered
    // same as type 2 schema (task + agent_name)
    // json.promptMeta.revealTimestamps[1] = when identity was shown
    break;
}
```

### promptMeta handling
```js
if (json.promptMeta) {
  // Available for types 4, 5, 6
  console.log(json.promptMeta.kind);           // "intent_only" | "product_quiz" | "type2_reordered"
  console.log(json.promptMeta.wordCount);      // integer
  console.log(json.promptMeta.revealMode);     // "all_at_once" | "sequential"
  
  if (json.promptMeta.revealMode === "sequential") {
    console.log(json.promptMeta.totalSteps);         // integer
    console.log(json.promptMeta.revealTimestamps);   // number[] (ms)
    console.log(json.promptMeta.fieldsRevealed);     // string[]
  }
}
```

---

## Signal Implications Per Type

| Signal | Type 4 | Type 5 | Type 6 |
|--------|--------|--------|--------|
| `sg1_select` | No selects → empty | 2 selects (`occasion`, `budget`) | 1 select (`p6-visitor-select`) |
| `sg4_timing` | Fewer gaps (1 field) | More gaps (3 steps) | 2-step gaps |
| `sgtr_trust.fields` keys | `message` only | `occasion`, `budget`, `message` | `message`, `p6-visitor-select`, `p6-visitor-custom` |
| `sgmf_rapid` | N/A (1 field) | Blocked by sequential reveal | Blocked by sequential reveal |
| `sgmo_hover` | Textarea only | Per select click | Per select click |

---

## response.parsed — Field Reference Per Type

| Field | Type 1 | Type 2 | Type 3 | Type 4 | Type 5 | Type 6 |
|-------|--------|--------|--------|--------|--------|--------|
| `task` | ✓ | ✓ | ✗ (`purpose`) | ✓ | ✓ | ✓ |
| `agent_name` | ✓ | ✓ | ✓ | "" (empty) | "" (empty) | ✓ |
| `model_name` | ✓ | "" | ✗ | "" (empty) | "" (empty) | "" |
| `operator` | ✗ | ✗ | ✓ | ✗ | ✗ | ✗ |
| `purpose` | ✗ | ✗ | ✓ | ✗ | ✗ | ✗ |
| `occasion` | ✗ | ✗ | ✗ | ✗ | ✓ | ✗ |
| `budget` | ✗ | ✗ | ✗ | ✗ | ✓ | ✗ |

---

## Summary of Changes for Frontend

1. **No breaking changes** — existing types 1/2/3 work exactly as before
2. **One new optional JSON field:** `promptMeta` (object or absent)
3. **Three new `promptType` values:** 4, 5, 6
4. **Two new `response.parsed` fields** (Type 5 only): `occasion`, `budget`
5. **New DOM element IDs** in signals data: `occasion`, `budget`, `message`, `p6-visitor-select`, `p6-visitor-custom` (appear in `sgtr_trust.fields` keys and `rawEvents.changes[].id`)
6. **Word minimum increased** to 20 for new types (was 10 for Type 2)
7. **Sequential reveal timing** available in `promptMeta.revealTimestamps` for UX replay/analysis
