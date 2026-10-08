---
description: "Probe a new detection vector in the Copilot browser tool. Tests a hypothesis live and reports structured findings."
agent: fingerprint-researcher
tools: [read, search, edit, execute, web, todo]
argument-hint: "Describe detection vector to investigate, e.g. 'WebRTC ICE candidates in Electron vs Chrome'"
---

# Probe Detection Vector

You are investigating a new detection signal. Follow this workflow:

1. **Read** the knowledge base at [COPILOT_DETECTION_RESEARCH.md](../COPILOT_DETECTION_RESEARCH.md) for prior findings and confirmed FPs
2. **Formulate** a hypothesis about what should differ between Electron/Copilot and real Chrome
3. **Write** minimal test code using `page.evaluate()` in the browser tool
4. **Execute** the test and analyze results
5. **Validate** for false positive risk (DevTools open? Extensions? Spec behavior?)
6. **Report** findings in structured format:

```
## Signal: [Name]
- **Tier**: 1/2/3
- **Mechanism**: Why this works
- **Test Result**: What the Copilot browser returned
- **Expected in Chrome**: What real Chrome would return
- **FP Risk**: Low/Medium/High
- **Recommendation**: Implement / Reject / Needs more testing
```

If the user provides a specific vector, research that. Otherwise, pick the highest-priority unexplored vector from the research backlog in the instructions.
