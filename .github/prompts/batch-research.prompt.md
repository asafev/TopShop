---
description: "Run a batch of detection vectors through the full research pipeline. Good for exploring multiple signals in a session."
tools: [read, search, edit, execute, web, agent, todo]
argument-hint: "'batch auto 3' to research top 3 from backlog, or list vectors: 'WebRTC, ServiceWorker, SharedWorker'"
---

# Batch Research Workflow

Research and test multiple detection vectors in a single session.

## Workflow

1. **Select vectors** — from user input or top N from research backlog
2. **For each vector**, run the lightweight pipeline:
   a. Quick hypothesis + live test (browser tool)
   b. Record: detected/not-detected, FP risk, signal strength
3. **Rank results** — sort by signal strength and low FP risk
4. **CTO summary** — present all findings for batch review
5. **Implement winners** — only the approved ones get added

## Usage

```
/batch-research auto 3          → pick top 3 from backlog
/batch-research WebRTC, SharedWorker, PaymentRequest
/batch-research tier1-hunt      → focus on finding definitive signals
```

## Output Format

```
## Batch Research Results

| # | Vector | Detected? | Tier | FP Risk | Verdict |
|---|--------|-----------|------|---------|---------|
| 1 | [name] | Yes/No    | 1-3  | L/M/H   | ✅/❌/🔄 |
| 2 | [name] | Yes/No    | 1-3  | L/M/H   | ✅/❌/🔄 |
| 3 | [name] | Yes/No    | 1-3  | L/M/H   | ✅/❌/🔄 |

### Approved for Implementation:
- [Signal 1]: Tier X, Weight Y
- [Signal 2]: Tier X, Weight Y

### Rejected:
- [Signal 3]: [reason]

### Needs More Testing:
- [Signal 4]: [what to investigate next]
```

## Quick Test Template

For each vector, run this pattern in the browser tool:
```javascript
return page.evaluate(() => {
  const results = {};
  
  // Vector-specific test code
  results.vectorName = { /* test */ };
  
  return results;
});
```

Keep tests fast (<2s each) for batch mode. Detailed investigation comes after batch screening.
