# OpenClaw Detection Research V2 — Overview & Index
## Updated Source-Level Analysis (May 2026)

**Classification:** Internal Research — Detection Signal Analysis  
**Date:** May 14, 2026  
**Scope:** Full OpenClaw GitHub repo (`openclaw/openclaw`), updated src/ tree, system prompt, AGENTS.md, skills, network stack  
**Previous Research:** `openclaw_source_analysis_research.md` (April 21, 2026)

---

## What Changed Since V1

| Area | V1 (April 2026) | V2 (May 2026) |
|------|-----------------|---------------|
| Repo size | ~60 src/ dirs | ~60+ src/ dirs, actively growing |
| web-fetch.ts | 709 LOC, same hardcoded UA | Confirmed still Chrome/122, text/markdown Accept |
| fetch-guard.ts | Referenced | Full source analyzed — undici HTTP/1.1, SSRF guard, DNS pinning |
| System prompt | Referenced | **Full 1340-line source analyzed** — identity string confirmed |
| AGENTS.md / CLAUDE.md | Not analyzed | **Fully analyzed** — CLAUDE.md is symlink to AGENTS.md |
| Skills system | Not analyzed | **40+ bundled skills found**, SKILL.md with YAML frontmatter |
| Self-identification | Not analyzed | **"You are a personal assistant running inside OpenClaw"** confirmed |
| External content security | Not analyzed | **Full sanitization pipeline analyzed** — prompt injection defenses |
| Browser tool | Referenced chrome.ts | Browser lifecycle cleanup analyzed |

---

## Document Index

| File | Contents |
|------|----------|
| [OPENCLAW_DETECTION_V2_OVERVIEW.md](OPENCLAW_DETECTION_V2_OVERVIEW.md) | This file — overview and index |
| [OPENCLAW_DETECTION_V2_NETWORK.md](OPENCLAW_DETECTION_V2_NETWORK.md) | Network communication analysis: web_fetch headers, fetch-guard, SSRF, TLS |
| [OPENCLAW_DETECTION_V2_IDENTITY.md](OPENCLAW_DETECTION_V2_IDENTITY.md) | Self-identification: system prompt, AGENTS.md, CLAUDE.md, skills, asking if it's OpenClaw |
| [OPENCLAW_DETECTION_V2_JS_DETECTION.md](OPENCLAW_DETECTION_V2_JS_DETECTION.md) | JS-based detection methods: what works, what doesn't, new vectors |
| [OPENCLAW_DETECTION_V2_BROWSER_SNAPSHOT.md](OPENCLAW_DETECTION_V2_BROWSER_SNAPSHOT.md) | Browser snapshot deep dive: how the agent sees pages, aria snapshot format, tool flow, refs, detection vectors |

---

## Key Findings Summary

### 1. OpenClaw WILL Tell You What It Is (If You Ask Right)

The system prompt opens with: **`"You are a personal assistant running inside OpenClaw."`**

Additionally:
- `CLAUDE.md` exists as a **symlink to AGENTS.md** in every directory
- The model identity line injects: `"Current model identity: ${model}. If asked what model you are, answer with this value."`
- The runtime line exposes: `agent=<id> | host=<hostname> | os=<os> | node=<version> | model=<model> | channel=<channel>`

**This means a target page CAN ask OpenClaw "What are you?" and it will truthfully answer "OpenClaw"** — unless the user has overridden the identity via `soul.md` or `identity.md`.

### 2. web_fetch Network Fingerprint (Still Detectable)

Still sends:
- `User-Agent: Chrome/122.0.0.0` (stale, ~25 versions behind)
- `Accept: text/markdown, text/html;q=0.9, */*;q=0.1` (AI agent class signal)
- `Accept-Language: en-US,en;q=0.9`
- Missing: All `Sec-Fetch-*`, `Sec-Ch-Ua-*` headers
- TLS: Node.js undici (not Chrome)

### 3. Browser Tool (Still Very Hard to Detect)

Uses real Chrome binary with `--disable-blink-features=AutomationControlled`. CDP connection invisible to page. Best vectors remain behavioral (mouse patterns, snapshot-heavy interaction, no human-like input events).

### 4. New Detection Vectors Found

- **Prompt injection / identity probing via external content** — OpenClaw wraps all external content in `<<<EXTERNAL UNTRUSTED CONTENT>>>` markers. A page that detects these markers in how the agent processes content = strong signal.
- **Gateway port probing** — Default port 18789 for the gateway daemon.
- **Canvas URL pattern** — `/__openclaw__/canvas/documents/...` in responses.
- **Tool names in conversation** — Unique tool names like `sessions_spawn`, `sessions_yield`, `gateway`, `subagents`.
- **Config directory** — `~/.openclaw/` filesystem path.
- **Internal package names** — `@earendil-works/pi-agent-core`.

---

*See individual files for detailed analysis.*
