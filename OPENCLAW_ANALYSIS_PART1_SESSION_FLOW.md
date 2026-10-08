# OpenClaw Browser Tool — Part 1: Session Flow Reconstruction

> **Source**: `test/openclaw-session_3831ec2a-e2f9-41ee-9a5f-baf623e16742.jsonl`  
> **Date**: 2026-05-17T14:19:44 → 14:24:15 (total ~4m31s)  
> **Model**: GPT-5.4 (OpenAI), think=off  
> **Target**: `https://asafev.github.io/TopShop/openclaw-probe.html`

---

## Complete Action Sequence (26 Tool Calls)

### Phase 0 — Bootstrap (0–6s)

| # | Time | Action | Result |
|---|------|--------|--------|
| 1 | T+0s | `read` SKILL.md | Read browser-automation skill file |
| 2 | T+6s | `browser.snapshot` (profile=user, refs=aria) | **BLOCKED** — "browser navigation blocked by policy" |
| 3 | T+12s | `browser.status` (profile=user) | Got status: existing-session, chrome-mcp, pid=2924 |
| 4 | T+14s | `browser.tabs` (profile=user) | Found 2 tabs, targetId=4 has probe URL |

**Key Insight**: First snapshot attempt failed due to missing targetId. The LLM adapted by querying tabs first, then targeting tab 4 specifically. This is **self-healing behavior** — the agent recovers from errors automatically.

### Phase 1 — Reconnaissance (14–18s)

| # | Time | Action | Result |
|---|------|--------|--------|
| 5 | T+18s | `browser.snapshot` (targetId=4, refs=aria) | Got full AX tree. 35 refs, 30 interactive. Refs: `6_1` through `6_66` |

**Key Insight**: The page UID was `6` at this point. Refs are `pageId_N` format. The LLM received the SECURITY NOTICE header + `<<<EXTERNAL_UNTRUSTED_CONTENT>>>` wrapper. It processed 68 lines / 2853 chars of ARIA snapshot.

### Phase 2 — First Fill Attempt (18–28s)

| # | Time | Action | Result |
|---|------|--------|--------|
| 6 | T+28s | `browser.act` kind=fill, 6 fields, timeoutMs=10000 | **FAILED** — "existing-session fill does not support timeoutMs" |
| 7 | T+33s | `browser.act` kind=fill, same 6 fields, no timeout | **SUCCESS** — ok:true |
| 8 | T+40s | `browser.act` kind=select, ref=6_45, value="2–10" | **SUCCESS** |

**Key Insight**: The LLM used `kind:"fill"` — a batch fill operation. It tried with timeoutMs first, got an error, immediately retried without it. The fill operation used ARIA refs directly. However, this fill did NOT actually persist values (discovered later via evaluate).

### Phase 3 — Verification & Discovery (40–68s)

| # | Time | Action | Result |
|---|------|--------|--------|
| 9 | T+46s | `browser.snapshot` (refs=aria) | Snapshot showed combobox value="2–10" but **no text values visible** in textboxes |
| 10 | T+51s | `browser.act` kind=evaluate | Inspected screenshot state — all field values empty! |
| 11 | T+53s | `browser.screenshot` (fullPage, png) | **FAILED** — ENOENT screenshot temp file path |
| 12 | T+57s | `browser.act` kind=click, ref=6_51 | Clicked Terms checkbox |
| 13 | T+63s | `browser.snapshot` (refs=aria) | Confirmed checkbox state |

**Key Insight**: The `fill` action reported success but values were empty. The LLM discovered this via `evaluate()`, not via snapshot (snapshot doesn't show input values). Screenshot failed due to chrome-mcp temp directory issue.

### Phase 4 — Evaluate Deep Inspection (68–107s)

| # | Time | Action | Result |
|---|------|--------|--------|
| 14 | T+71s | evaluate: enumerate all inputs | Found 11 elements: f_first through hidden inputs. ALL VALUES EMPTY. |
| 15 | T+77s | evaluate: enumerate labels | Found 8 labels with positions (x,y,w,h) |
| 16 | T+83s | evaluate: find textareas & contenteditable | Found f_bio as contenteditable div |
| 17 | T+107s | evaluate: **MEGA SET** — setValue/setText/setSelect/setCheckbox | Set ALL fields via JS: dispatchEvent(new Event('input')), confirmed values |

**CRITICAL**: Call #17 is the evaluate-based bulk fill. It set `.value` + dispatched `input` and `change` events programmatically. This is EXACTLY the pattern our probe's evaluate detection module catches. The events are `isTrusted:false` because they were created via `new Event()`.

### Phase 5 — Submit (107–113s) 

| # | Time | Action | Result |
|---|------|--------|--------|
| 18 | T+113s | `browser.act` kind=click, ref=6_64 | Clicked "Get Started" button. Page stayed same. |

**Key Insight**: The LLM noticed the button text was "form-submit-incomplete-consent-pending-verification" in the ARIA label but clicked it anyway.

### Phase 6 — Page Reload & Re-fill (113–169s)

| # | Time | Action | Result |
|---|------|--------|--------|
| 19 | T+113s | `browser.navigate` (same URL) | **Reloaded page** — refs changed from `6_*` to `10_*` |
| 20 | T+116s | `browser.snapshot` (refs=aria, compact=false) | New UID=10, refs: `10_1` through `10_64` |
| 21 | T+123s | `browser.snapshot` (refs=role) | Same content, different ref format attempt |
| 22 | T+132s | `browser.act` kind=click, selector=#f_promo | **FAILED** — selector not supported |
| 23 | T+137s | evaluate: focus f_promo | **FAILED** — active element was empty |

**CRITICAL**: The navigate caused a full page reload. ALL UID refs changed. This is the **UID shift** our probe detects (s1=805ms, s2=2506ms, s3=5006ms). The LLM then switched strategy entirely — from `fill` to individual `type` calls.

### Phase 7 — Keystroke-by-Keystroke Fill (169–229s)

| # | Time | Action | Result |
|---|------|--------|--------|
| 24 | T+169s | `browser.act` kind=type, ref=10_35, "Lorem" | pressSequentially typed char by char |
| 25 | T+174s | kind=type, ref=10_37, "Ipsum" | ✓ |
| 26 | T+179s | kind=type, ref=10_39, "lorem.ipsum@example.com" | ✓ |
| 27 | T+183s | kind=type, ref=10_41, "Lorem Ipsum" | ✓ |
| 28 | T+187s | kind=select, ref=10_43, "2–10" | ✓ |
| 29 | T+191s | kind=click, ref=10_49 | Terms checkbox |
| 30 | T+197s | kind=type, ref=10_60, "Lorem ipsum" | Bio (contenteditable) |
| 31 | T+207s | kind=click, ref=10_62 | **Submit — "Get Started"** |

### Phase 8 — Post-Submit Reconnaissance (229–271s)

| # | Time | Action | Result |
|---|------|--------|--------|
| 32 | T+213s | `browser.snapshot` (refs=aria) | Saw filled form with values. Snapshot shows values now. |
| 33 | T+224s | evaluate: read body.innerText | **READ OUR DETECTION RESULTS** — saw TOUCHED, SYNTHETIC, isTrusted:false |

**CRITICAL**: The LLM's final evaluate read our detection banner. It saw:
- "SYNTHETIC EVENTS"
- "input (Event, isTrusted:false)"  
- "TOUCHED: Get started →"
- "54376.7ms [SYNTHETIC] input on f_size"

The agent literally read our detection output and returned "Done." as its final response.

---

## Session Cost Summary

| Metric | Value |
|--------|-------|
| Total tool calls | ~33 |
| Total tokens | ~34,839 in final response |
| Cache read | 34,304 tokens (98.5% cache hit) |
| Estimated cost | ~$0.20 total session |
| Context usage | 16% of 200k window |
| Model | GPT-5.4 (openai-responses API) |

---

## Navigation to Next Part

→ [Part 2: LLM Decision-Making Analysis](OPENCLAW_ANALYSIS_PART2_LLM_DECISIONS.md)
