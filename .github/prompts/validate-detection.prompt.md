---
description: "Run a full validation of copilot-detector.html — reload the page, verify all signals, check for regressions, and report the detection score."
agent: fingerprint-researcher
tools: [read, search, execute]
argument-hint: "Optional: specific signal to focus on"
---

# Validate Detection Page

Reload `copilot-detector.html` in the Copilot browser tool and verify all signals.

## Steps

1. Reload the page: `await page.reload({ waitUntil: 'networkidle' })`
2. Wait for results: `await page.waitForSelector('#results', { state: 'visible' })`
3. Extract the score and any not-detected signals
4. For each not-detected signal, investigate WHY it failed
5. Report results

## Expected Output

```
## Validation Report
- **Score**: X / Y points (Z%)
- **Signals Triggered**: N of M
- **Tier 1**: X/Y detected
- **Tier 2**: X/Y detected  
- **Tier 3**: X/Y detected

### Failed Signals (if any):
- [Signal Name]: [Why it failed] → [Suggested fix]

### Regressions (compared to last known good):
- None / [Description of regression]
```
