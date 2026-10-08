---
description: "Review the current detection signal inventory — assess overall coverage, identify gaps, and suggest next research priorities."
agent: detection-cto
tools: [read, search, web, todo]
argument-hint: "Optional: focus area like 'CDP signals' or 'Electron gaps'"
---

# Detection Signal Review

As the CTO, perform a strategic review of the current detection system.

## Workflow

1. Read `copilot-detector.html` to understand current signals
2. Read `COPILOT_DETECTION_RESEARCH.md` for the full knowledge base
3. Assess coverage across attack surface:
   - CDP/Runtime behavior
   - Electron API gaps  
   - Permission/policy anomalies
   - Hardware/OS mismatches
   - Network behavior
4. Identify gaps and recommend next research priorities
5. Review signal weights for balance

## Output Format

```
## Detection System Review

### Coverage Assessment
| Category | Signals | Coverage | Notes |
|----------|---------|----------|-------|
| CDP      | N       | Good/Gap | ...   |
| Electron | N       | Good/Gap | ...   |
| Permissions | N    | Good/Gap | ...   |
| Hardware | N       | Good/Gap | ...   |

### Strength Analysis
- Strongest signal: [name] — [why]
- Weakest signal: [name] — [concern]
- Most FP-prone: [name] — [mitigation]

### Recommended Next Steps
1. [Priority action]
2. [Priority action]
3. [Priority action]

### Research Backlog (ordered)
1. [Vector] — Expected: Tier X, Effort: Low/Med/High
2. [Vector] — Expected: Tier X, Effort: Low/Med/High
```
