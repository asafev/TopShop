# shopReport JSON v1.2 — Backend & UI Adaptation Guide

## Version Detection

```
if (json._version === "1.2") → new signals available
if (json._version === "1.1") → legacy format, no signals section
```

---

## What Changed in Existing Sections

### `mouse` — 2 new fields at end

| Field | Type | Description |
|-------|------|-------------|
| `floatClickRatio` | number (0-1) | Ratio of clicks with sub-pixel (fractional) x/y coordinates |
| `noHoverClickRatio` | number (0-1) | Ratio of clicks where target was NOT hovered before clicking |

### `typing` — 1 new field at end

| Field | Type | Description |
|-------|------|-------------|
| `replacementTextCount` | integer | Count of `input` events with `inputType === "insertReplacementText"` (autofill/voice) |

### `rawEvents` — 2 new arrays at end

| Field | Type | Max items |
|-------|------|-----------|
| `changes` | `Array<{t, tag, id, value, tr}>` | 20 |
| `pasteDetails` | `Array<{t, fieldId, len, tr}>` | 10 |

### `rawEvents.clicks[]` — 4 new fields per click object

| Field | Type | Description |
|-------|------|-------------|
| `hasFloat` | boolean | `true` if clientX or clientY has fractional part |
| `hadHover` | boolean | `true` if target received a mouseover event before this click |
| `tag` | string | Target element's tagName (e.g. `"BUTTON"`, `"SELECT"`) |
| `id` | string | Target element's id (empty string if none) |

---

## New Top-Level Section: `signals`

Always present in v1.2. Contains 8 behavioral signal measurements — **raw data only, no verdicts or scores**.

### `signals.sg1_select` — Select Element Trust Mismatch

Detects trusted click + untrusted change on `<select>` (strongest Copilot-specific signal).

```json
{
  "copilotPattern": false,
  "selects": [
    {
      "id": "p3-visitor-select",
      "trClicks": 1,
      "untrClicks": 0,
      "trChanges": 1,
      "untrChanges": 0,
      "optionClicks": 1,
      "isCopilotPattern": false
    }
  ]
}
```

- `copilotPattern` = `true` when ANY select has `trClicks > 0 AND untrChanges > 0 AND optionClicks === 0`
- `selects` array can be empty (no `<select>` elements on page)

### `signals.sg4_timing` — Inter-Action Gap Analysis

Measures time gaps between significant user actions (click, change, keydown, focusin).

```json
{
  "actionCount": 8,
  "gaps": [3250.1, 1523.0, 845.2, 2100.5, 1980.3, 520.0, 2015.8],
  "twoSecCount": 3,
  "twoSecRatio": 0.429,
  "gapCV": 0.512,
  "summary": "3 of 7 gaps in 1700-2300ms range (ratio: 0.429)"
}
```

- `gaps` = variable-length array (length = `actionCount - 1`), values in ms
- `twoSecCount` = how many gaps fall in 1700-2300ms window
- `twoSecRatio` = twoSecCount / total gaps
- `gapCV` = coefficient of variation (low = robotic uniformity)
- If `actionCount < 3`: returns `{ actionCount, gaps: [], twoSecCount: 0, twoSecRatio: 0, gapCV: null, summary: "insufficient actions" }`

### `signals.sgfl_float` — Float Coordinate Detection

Sub-pixel click coordinates indicate CDP/DevTools coordinate injection.

```json
{
  "floatCount": 0,
  "totalClicks": 3,
  "floatRatio": 0,
  "dpr": 1,
  "dprIsInteger": true
}
```

- `dpr` = `window.devicePixelRatio` — context for interpretation (non-integer DPR can produce legitimate floats)

### `signals.sgtr_trust` — Per-Field Trust Matrix

Per form-field breakdown of trusted vs untrusted events.

```json
{
  "fields": {
    "p3-visitor-select": {
      "click": { "trusted": 1, "untrusted": 0 },
      "change": { "trusted": 1, "untrusted": 0 },
      "focusin": { "trusted": 1, "untrusted": 0 }
    },
    "p3-task": {
      "keydown": { "trusted": 42, "untrusted": 0 },
      "input": { "trusted": 42, "untrusted": 0 },
      "focusin": { "trusted": 1, "untrusted": 0 }
    }
  },
  "combos": [
    "p3-visitor-select: click=T change=T focusin=T",
    "p3-task: keydown=T input=T focusin=T"
  ],
  "anyUntrusted": false,
  "allFieldsTrusted": true
}
```

- `combos[]` uses labels: `T` = all trusted, `U` = all untrusted, `M` = mixed
- `fields` keys are dynamic (whatever form element ids exist on the page)
- Event types tracked per field: `click`, `change`, `keydown`, `input`, `focusin`

### `signals.sgmo_hover` — Mouseover Before Click

Whether clicks were preceded by natural mouse hover.

```json
{
  "total": 3,
  "noHover": 0,
  "noHoverRatio": 0
}
```

### `signals.sgmf_rapid` — Multi-Field Rapid Fill

Consecutive change events on different fields less than 10ms apart.

```json
{
  "pairs": 0,
  "totalFieldEvents": 2
}
```

### `signals.sgrt_replace` — insertReplacementText Count

```json
{
  "count": 0
}
```

### `signals.sgpa_paste` — Paste Events

```json
{
  "count": 0,
  "details": [
    { "t": 5000.1, "fieldId": "p3-task", "len": 42, "tr": 1 }
  ]
}
```

- `details` max 10 entries
- `len` = -1 if clipboard read failed
- `tr` = 1 (trusted) or 0 (untrusted)

---

## Full v1.2 JSON Structure (path reference)

```
root
├── _version: "1.2"
├── promptType: number
├── promptId: string
├── timestamp: ISO string
├── session
│   ├── durationMs, totalEvents, trustedEvents, untrustedEvents
│   ├── untrustedRatio
│   └── untrustedTypes: { [eventType]: count }
├── response
│   ├── raw, parsed, isValidJSON
├── taskHistory: [{ t, value }]
├── mouse
│   ├── noMovementClickRatio, centerClickRatio, avgVelocityPxMs
│   ├── clickCount, clickDurAvgMs, zeroDurationClickPct
│   ├── floatClickRatio          ← NEW
│   └── noHoverClickRatio        ← NEW
├── typing
│   ├── keydowns, keyups, keyupKeydownRatio
│   ├── cps, cpsCV, cpsVerdict
│   ├── avgKeyHoldMs, keyHoldCV, keyHoldVerdict
│   ├── charsTyped, charsInjected, charsPasted
│   ├── effectiveRatio, effectiveVerdict
│   ├── injectionRatio, multiCharRatio
│   └── replacementTextCount     ← NEW
├── focus
│   ├── focusJumpRatio, totalFocusEvents
├── scroll
│   ├── uniformity, totalScrolls
├── intentMutations
│   ├── totalEdits, firstDraft, finalDraft, editPattern, snapshots[]
├── rawEvents
│   ├── clicks: [{ t, x, y, cx, mv, tr, dur, hasFloat←NEW, hadHover←NEW, tag←NEW, id←NEW }]
│   ├── keydowns: [{ t, code, tr }]
│   ├── keyHolds: [{ t, code, dur }]
│   ├── focusEvents: [{ t, had }]
│   ├── changes: [{ t, tag, id, value, tr }]          ← NEW array
│   └── pasteDetails: [{ t, fieldId, len, tr }]       ← NEW array
└── signals                      ← NEW section
    ├── sg1_select:  { copilotPattern, selects[] }
    ├── sg4_timing:  { actionCount, gaps[], twoSecCount, twoSecRatio, gapCV, summary }
    ├── sgfl_float:  { floatCount, totalClicks, floatRatio, dpr, dprIsInteger }
    ├── sgtr_trust:  { fields{}, combos[], anyUntrusted, allFieldsTrusted }
    ├── sgmo_hover:  { total, noHover, noHoverRatio }
    ├── sgmf_rapid:  { pairs, totalFieldEvents }
    ├── sgrt_replace:{ count }
    └── sgpa_paste:  { count, details[] }
```

---

## Notes

- v1.1 JSONs (existing data) will NOT have `signals`, `rawEvents.changes`, `rawEvents.pasteDetails`, or the new fields on click objects. Parse defensively.
- All signal values are raw measurements. No bot/human classification is made.
- `signals` section is always an object (never null/undefined) in v1.2.
- `sgtr_trust.fields` keys are dynamic — different pages/prompt types will have different field ids.
- `sg4_timing.gaps` can be visualized as a bar chart or sparkline to quickly spot 2-second clustering patterns.
