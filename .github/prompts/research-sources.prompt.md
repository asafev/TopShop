---
description: "Fetch and analyze external detection research resources, extract new techniques, and identify signals to test."
agent: fingerprint-researcher
tools: [read, search, web, todo]
argument-hint: "URL or topic to research, e.g. 'latest CDP detection bypasses' or a specific blog URL"
---

# Research External Sources

Gather intelligence from external resources about browser fingerprinting and automation detection.

## Workflow

1. **Fetch** the provided URL(s) or search for the topic in known research sources
2. **Extract** detection techniques mentioned (especially new/novel ones)
3. **Compare** against our current signal list — what are we missing?
4. **Assess** each technique for applicability to Copilot/Electron detection
5. **Prioritize** by expected signal strength and FP risk

## Key Sources to Check
- https://deviceandbrowserinfo.com/learning_zone
- https://antoinevastel.com/
- https://bot.sannysoft.com/
- https://bot.incolumitas.com/
- GitHub: nicedoc/nicedoc.io, nicedoc/nicedoc.io, nicedoc/nicedoc.io
- Stack Overflow: [playwright] detection, [puppeteer] bot detection

## Output Format

```
## Source: [URL/Name]
### Techniques Found:
1. **[Technique Name]** — [Brief description]
   - Applicable to Copilot: Yes/No/Maybe
   - Already implemented: Yes/No
   - Priority: High/Medium/Low

### New Research Vectors Identified:
- [Vector 1]: [Why worth investigating]
- [Vector 2]: [Why worth investigating]

### Action Items:
- [ ] Test [specific technique] via probe-signal
- [ ] Fetch [additional URL] for more details
```
