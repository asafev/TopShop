# OpenClaw Detection V2 — Browser Snapshot Deep Dive
## How OpenClaw's Browser Tool Sees and Interacts with Web Pages

**Date:** May 17, 2026  
**Scope:** Source-level analysis of Playwright's aria snapshot mechanism as used by OpenClaw's browser tool  
**Source:** `microsoft/playwright` repo (`packages/playwright-core/src/tools/backend/`), `packages/injected/src/ariaSnapshot.ts`

---

## 1. The Snapshot-Action Loop — How the Agent "Sees" a Page

OpenClaw's browser tool does **NOT** see screenshots or raw HTML. It sees an **accessibility tree snapshot** — a YAML representation of the page's ARIA structure. This is fundamental to understanding both how it works and how to detect it.

### 1.1 The Core Loop

Every browser interaction follows this cycle:

```
┌─────────────────────────────────────────────────────┐
│  1. Agent calls browser_navigate(url)               │
│     └─→ Chrome navigates to URL                     │
│     └─→ Waits for domcontentloaded + load (5s cap)  │
│     └─→ Returns: page URL, title, aria snapshot     │
│                                                     │
│  2. Agent reads the snapshot (YAML text)             │
│     └─→ Identifies elements by role + name           │
│     └─→ Notes ref IDs (e2, e5, e31...)              │
│                                                     │
│  3. Agent calls browser_click(target="e5")          │
│     └─→ Playwright resolves ref → DOM element        │
│     └─→ Executes locator.click()                    │
│     └─→ Waits for completion (network idle, etc.)   │
│     └─→ Returns: NEW aria snapshot automatically    │
│                                                     │
│  4. Agent reads updated snapshot                     │
│     └─→ Decides next action based on new state       │
│     └─→ Repeat from step 3...                       │
└─────────────────────────────────────────────────────┘
```

### 1.2 Key Architectural Insight

The agent **never has direct DOM access**. It cannot:
- Run arbitrary JavaScript (unless using `browser_run_code_unsafe`)
- Inspect CSS styles or computed properties
- Read network requests/responses directly
- See visual rendering, colors, or layout (unless `boxes: true`)

It operates **entirely through the accessibility tree** — the same tree screen readers use. This means:
- Only elements with ARIA roles are visible to the agent
- Elements hidden via `aria-hidden="true"` or `display: none` are invisible
- The agent identifies interactive elements by their `[ref=eN]` tags
- Between **every action**, a fresh snapshot is captured and returned

### 1.3 Source: `captureSnapshot()` in `tab.ts`

```typescript
// From packages/playwright-core/src/tools/backend/tab.ts
async captureSnapshot(root, depth, boxes, relativeTo) {
    await this._initializedPromise;
    let tabSnapshot;
    
    const modalStates = await this._raceAgainstModalStates(async () => {
      const ariaSnapshot = root
        ? await root.ariaSnapshot({ mode: 'ai', depth, boxes })
        : await this.page.ariaSnapshot({ mode: 'ai', depth, boxes });
      tabSnapshot = {
        ariaSnapshot,
        modalStates: [],
        events: [],
      };
    });
    
    // Also captures console log entries and recent events
    if (tabSnapshot) {
      tabSnapshot.consoleLink = await this._consoleLog.take(relativeTo);
      tabSnapshot.events = this._recentEventEntries;
      this._recentEventEntries = [];  // Reset after capture
    }
    
    return tabSnapshot ?? { ariaSnapshot: '', modalStates, events: [] };
}
```

**Detection relevance:** Every call to `captureSnapshot()` triggers `page.ariaSnapshot({ mode: 'ai' })`, which internally:
1. Traverses the entire DOM tree
2. Computes ARIA roles for every element
3. Calls `getElementAccessibleName()` on each
4. Calls `getBoundingClientRect()` on elements when `boxes: true`
5. Stores `_ariaRef` property directly on DOM elements

---

## 2. The Aria Snapshot Format — What the Agent Actually Sees

### 2.1 YAML Syntax

The snapshot is a **YAML-like indented text** representation of the accessibility tree. Each line represents one accessible element:

```
- role "name" [attribute=value] [ref=eN]
```

Components:
- **role** — ARIA role: `heading`, `button`, `textbox`, `link`, `list`, `listitem`, `checkbox`, `radio`, `combobox`, `generic`, etc.
- **"name"** — Accessible name (from `aria-label`, `<label>`, text content, `alt`, `title`, etc.)
- **[attribute=value]** — State: `[checked]`, `[disabled]`, `[expanded]`, `[level=N]`, `[pressed]`, `[selected]`, `[active]`, `[cursor=pointer]`
- **[ref=eN]** — Unique element reference for interaction (only on interactable elements)

### 2.2 Real-World Example

When the agent visits our `cpMapper.html`, it sees something like this:

```yaml
- generic [active] [ref=e1]:
  - heading "🔬 AI Agent Behavioral Mapper v2.0" [level=1] [ref=e2]
  - paragraph [ref=e3]: copilotActionsDetector + Trust Matrix...
  - generic [ref=e4]:
    - button "🔄 Reset All" [ref=e5] [cursor=pointer]
    - button "📊 Export Report" [ref=e6] [cursor=pointer]
    - button "📋 Copy Signature" [ref=e7] [cursor=pointer]
  - generic [ref=e23]:
    - generic [ref=e24]:
      - heading "📝 Test Controls" [level=2] [ref=e25]
      - generic [ref=e26]:
        - generic [ref=e27]: Text
        - textbox "Type here..." [ref=e28]
      - generic [ref=e29]:
        - generic [ref=e30]: Email
        - textbox "email@example.com" [ref=e31]
      - generic [ref=e32]:
        - generic [ref=e33]: Password
        - textbox "Password..." [ref=e34]
      - generic [ref=e35]:
        - generic [ref=e36]: Number
        - spinbutton [ref=e37]
      - generic [ref=e44]:
        - generic [ref=e45]: Select
        - combobox [ref=e46]:
          - option "-- Select --" [selected]
          - option "Option 1"
          - option "Option 2"
          - option "Option 3"
      - generic [ref=e47]:
        - generic [ref=e48]: Checkbox
        - generic [ref=e49]:
          - generic [ref=e50]:
            - checkbox "A" [ref=e51]
            - text: A
          - generic [ref=e52]:
            - checkbox "B" [ref=e53]
            - text: B
      - generic [ref=e54]:
        - generic [ref=e55]: Radio
        - generic [ref=e56]:
          - generic [ref=e57]:
            - radio "1" [ref=e58]
            - text: "1"
          - generic [ref=e59]:
            - radio "2" [ref=e60]
            - text: "2"
```

### 2.3 What's Included vs Excluded

| Included | Excluded |
|----------|----------|
| All ARIA roles (button, textbox, heading, link, etc.) | Elements with `role="presentation"` or `role="none"` |
| `generic` role (for divs/spans in AI mode) | Hidden elements (`display:none`, `aria-hidden="true"`) |
| Text content (inlined for single-text children) | Elements that don't receive pointer events (no ref) |
| Link URLs as `/url` property | Inline generic with single text child (collapsed) |
| Textbox placeholder as `/placeholder` | Text that duplicates parent's accessible name |
| CSS `::before`/`::after` pseudo-element content | CSS styles, colors, dimensions (unless `boxes: true`) |
| Shadow DOM content | JavaScript state, variables, event listeners |
| Iframe contents (recursively, with `f<N>e<M>` ref prefix) | Network requests, cookies, storage |
| Current values of form fields | History of interactions |

### 2.4 AI Mode Specifics

When called with `mode: 'ai'` (which is what OpenClaw always uses), Playwright applies these specific settings:

```typescript
// From packages/injected/src/ariaSnapshot.ts
if (options.mode === 'ai') {
    return {
        visibility: 'ariaOrVisible',      // Include aria-visible OR CSS-visible
        refs: 'interactable',             // Only ref elements that are visible + clickable
        includeGenericRole: true,         // Include generic/div roles
        renderActive: true,               // Show [active] for focused elements
        renderCursorPointer: true,        // Show [cursor=pointer] for clickable
        renderBoxes: options.boxes,       // Optional bounding boxes
    };
}
```

**Key takeaway:** Only **interactable** elements get `[ref=eN]` tags. An element must be both visible and receive pointer events to get a ref. Non-interactable elements appear in the tree but cannot be targeted by the agent.

---

## 3. How Refs Work — The Agent's Element Addressing System

### 3.1 Ref Assignment

Refs are the **only way** the agent can target specific elements. They are assigned by Playwright's injected script during snapshot generation.

```typescript
// From packages/injected/src/ariaSnapshot.ts — computeAriaRef()
function computeAriaRef(ariaNode, options) {
    if (options.refs === 'none') return;
    
    // Only assign refs to INTERACTABLE elements
    if (options.refs === 'interactable' && 
        (!ariaNode.box.visible || !ariaNode.receivesPointerEvents))
        return;
    
    // Refs are STABLE: persisted on the DOM element as _ariaRef
    // Only regenerated if role or name changes
    let ariaRef = element._ariaRef;
    if (!ariaRef || ariaRef.role !== ariaNode.role || ariaRef.name !== ariaNode.name) {
        ariaRef = { 
            role: ariaNode.role, 
            name: ariaNode.name, 
            ref: prefix + 'e' + (++lastRef)  // Sequential counter: e1, e2, e3...
        };
        element._ariaRef = ariaRef;  // STORED DIRECTLY ON THE DOM ELEMENT
    }
    ariaNode.ref = ariaRef.ref;
}
```

### 3.2 Critical Detection Signal: `_ariaRef` Property

**Playwright stores a `_ariaRef` property directly on DOM elements.** This is a JavaScript object with `{ role, name, ref }` that persists across snapshots.

```javascript
// DETECTION: Check if any element has _ariaRef (Playwright snapshot artifact)
function detectAriaRefProperty() {
    const allElements = document.querySelectorAll('*');
    for (const el of allElements) {
        if (el._ariaRef) {
            return {
                detected: true,
                ref: el._ariaRef.ref,      // e.g. "e5"
                role: el._ariaRef.role,     // e.g. "textbox"
                name: el._ariaRef.name      // e.g. "Type here..."
            };
        }
    }
    return { detected: false };
}
```

**This only fires AFTER a snapshot has been taken** — meaning after the agent has started interacting with the page.

### 3.3 Ref Resolution — How `target: "e5"` Becomes a DOM Element

When the agent calls a tool with `target: "e5"`, the resolution happens in `tab.targetLocator()`:

```typescript
// From packages/playwright-core/src/tools/backend/tab.ts
async targetLocator(params) {
    // Check if target is a ref pattern (e.g., "e5", "f1e3")
    if (!params.target.match(/^(f\d+)?e\d+$/)) {
        // It's a CSS selector or locator string
        const selector = locatorOrSelectorAsSelector('javascript', params.target);
        const handle = await this.page.$(selector);
        if (!handle)
            throw new Error(`"${params.target}" does not match any elements.`);
        return { locator: this.page.locator(selector), resolved: ... };
    } else {
        // It's a ref — use the aria-ref selector engine
        try {
            let locator = this.page.locator(`aria-ref=${params.target}`);
            const resolved = await locator.normalize();
            return { locator, resolved: resolved.toString() };
        } catch (e) {
            throw new Error(
                `Ref ${params.target} not found in the current page snapshot. ` +
                `Try capturing new snapshot.`
            );
        }
    }
}
```

The `aria-ref` selector engine is a **custom Playwright selector** registered in the injected script:

```typescript
// From injectedScript.ts
_createAriaRefEngine() {
    const queryAll = (root, selector) => {
        // Looks up the ref in the last captured snapshot's element map
        const result = this._lastAriaSnapshotForQuery?.elements?.get(selector);
        return result && result.isConnected ? [result] : [];
    };
    return { queryAll };
}
```

### 3.4 Ref Patterns

| Pattern | Meaning | Example |
|---------|---------|---------|
| `eN` | Main page element, sequential | `e1`, `e2`, `e31` |
| `fNeM` | Element inside iframe N | `f1e2` = element 2 inside first iframe |
| Sequential gaps | Skipped non-interactable elements | `e1, e3, e5` (e2, e4 were non-interactable) |

### 3.5 Ref Stability

- Refs **persist** across snapshots as long as the element's role and name don't change
- If an element is removed from DOM and re-added, it gets a **new ref**
- If a page reloads, **all refs are invalidated** — the agent must take a new snapshot
- The `_ariaRef` property survives DOM mutations that don't change role/name

---

## 4. The Complete Tool Flow — Every Tool Available to the Agent

### 4.1 Tool Inventory

OpenClaw's browser tool exposes these Playwright-based tools to the agent. Each tool is defined in `packages/playwright-core/src/tools/backend/`:

| Tool | Source File | Type | Auto-Snapshot After? | Description |
|------|-----------|------|---------------------|-------------|
| `browser_snapshot` | `snapshot.ts` | readOnly | N/A (IS the snapshot) | Capture accessibility snapshot of current page |
| `browser_click` | `snapshot.ts` | input | **YES** | Click an element by ref or selector |
| `browser_drag` | `snapshot.ts` | input | YES | Drag and drop between two elements |
| `browser_hover` | `snapshot.ts` | input | YES | Hover over element |
| `browser_select_option` | `snapshot.ts` | input | YES | Select option in dropdown |
| `browser_check` | `snapshot.ts` | input | — | Check checkbox/radio (skill-only) |
| `browser_uncheck` | `snapshot.ts` | input | — | Uncheck checkbox/radio (skill-only) |
| `browser_type` | `keyboard.ts` | input | Depends | Type text into element (fill or pressSequentially) |
| `browser_press_key` | `keyboard.ts` | input | Only for Enter | Press single key |
| `browser_press_sequentially` | `keyboard.ts` | input | — | Type text key by key (skill-only) |
| `browser_fill_form` | `form.ts` | input | — | Fill multiple form fields at once |
| `browser_navigate` | `navigate.ts` | — | YES | Navigate to URL |
| `browser_run_code_unsafe` | `runCode.ts` | — | — | Execute arbitrary JS on page |

### 4.2 Tool Response Structure

Every tool response follows a structured markdown format with sections:

```markdown
### Error
(only if something went wrong)

### Result
(text output from the tool)

### Ran Playwright code
```js
await page.locator('#email').fill('test@example.com');
```

### Open tabs
(only if multiple tabs)
- 0: (current) [Page Title](https://example.com)
- 1: [Other Tab](https://other.com)

### Page
- Page URL: https://example.com
- Page Title: Example Page
- Console: 2 errors, 0 warnings

### Snapshot
```yaml
- generic [active] [ref=e1]:
  - heading "Example Page" [level=1] [ref=e2]
  - textbox "Email" [ref=e3]: test@example.com
  ...
```

### Events
- New console entries: ./console-12345.log
- Downloaded file report.pdf to "./downloads/report.pdf"
```

### 4.3 Auto-Snapshot Behavior — The Key Detection Pattern

Most interaction tools automatically include a fresh snapshot in their response via `response.setIncludeSnapshot()`. This means:

```
Agent calls browser_click(target="e5")
  └─→ Playwright executes click
  └─→ Waits for completion (network idle, navigation, etc.)
  └─→ Captures FRESH snapshot automatically     ← THIS is a second AX tree traversal
  └─→ Returns: code + snapshot + events + page info
```

**From `snapshot.ts` — click handler:**
```typescript
handle: async (tab, params, response) => {
    response.setIncludeSnapshot();  // ← Tells response to capture snapshot after action
    
    const { locator, resolved } = await tab.targetLocator(params);
    
    await tab.waitForCompletion(async () => {
        await locator.click(options);
    });
},
```

**From `response.ts` — serialization:**
```typescript
// During response.serialize(), if includeSnapshot is set:
const tabSnapshot = await this._context.currentTabOrDie().captureSnapshot(
    this._includeSnapshotRoot, 
    this._includeSnapshotDepth,
    this._includeSnapshotBoxes, 
    this._clientWorkspace
);
// → This calls page.ariaSnapshot({ mode: 'ai' }) → full AX tree traversal
```

**Detection implication:** For a typical form fill, the page will experience:
1. Snapshot on initial load
2. Snapshot after navigating to page
3. Snapshot after each click/type/fill action
4. Explicit snapshot calls if agent needs to re-examine

A **5-field form** triggers **~6-10 full accessibility tree traversals** in rapid succession.

### 4.4 The `browser_type` Tool — Two Modes

The type tool has a critical behavioral distinction:

```typescript
// From keyboard.ts — type handler
handle: async (tab, params, response) => {
    const { locator, resolved } = await tab.targetLocator(params);
    
    if (params.slowly) {
        // pressSequentially: types ONE CHARACTER AT A TIME
        // Generates individual keydown/keypress/keyup events per char
        await locator.pressSequentially(secret.value);
    } else {
        // fill: SETS THE VALUE ALL AT ONCE
        // Internally: focus → selectAll → delete → type via Input.dispatchKeyEvent
        // Much faster, but produces synthetic input pattern
        await locator.fill(secret.value);
    }
},
```

**Default behavior is `fill()` (not `slowly`).** This means:
- No individual keystroke events for each character
- Value appears instantly
- `input` and `change` events fire, but without matching `keydown`/`keyup` per character
- **This is the #1 detectable behavioral signal**

### 4.5 The `browser_fill_form` Tool — Batch Form Fill

This is the most efficient tool for forms — fills multiple fields in one call:

```typescript
// From form.ts
handle: async (tab, params, response) => {
    for (const field of params.fields) {
        const { locator } = await tab.targetLocator({ 
            element: field.name, target: field.target 
        });
        
        if (field.type === 'textbox' || field.type === 'slider') {
            await locator.fill(secret.value);          // fill() — instant value set
        } else if (field.type === 'checkbox' || field.type === 'radio') {
            await locator.setChecked(field.value === 'true');  // setChecked()
        } else if (field.type === 'combobox') {
            await locator.selectOption({ label: field.value }); // selectOption()
        }
    }
},
```

**Agent call example:**
```json
{
  "tool": "browser_fill_form",
  "fields": [
    { "name": "Email", "target": "e31", "type": "textbox", "value": "test@example.com" },
    { "name": "Password", "target": "e34", "type": "textbox", "value": "SecurePass123!" },
    { "name": "Country", "target": "e46", "type": "combobox", "value": "Option 2" },
    { "name": "Terms", "target": "e51", "type": "checkbox", "value": "true" }
  ]
}
```

**Detection pattern:** All fields filled in rapid machine-speed succession, no mouse movement between fields, no human-like tab/click transitions.

---

## 5. What the Agent Actually Receives — Full Response Anatomy

### 5.1 Example: After `browser_navigate("http://localhost:9999/cpMapper.html")`

The agent receives this structured response:

```
### Page
- Page URL: http://localhost:9999/cpMapper.html
- Page Title: AI Agent Behavioral Mapper v2.0

### Snapshot
- [Snapshot](./page-abc123.yml)
```

The snapshot file contains the full YAML tree (as shown in Section 2.2).

### 5.2 Example: After `browser_click(target="e51")` (clicking checkbox A)

```
### Ran Playwright code
```js
await page.getByRole('checkbox', { name: 'A' }).click();
```

### Page
- Page URL: http://localhost:9999/cpMapper.html
- Page Title: AI Agent Behavioral Mapper v2.0

### Snapshot
```yaml
- generic [active] [ref=e1]:
  ...
  - checkbox "A" [checked] [ref=e51]    ← NOW SHOWS [checked]
  ...
```
```

### 5.3 Example: After `browser_type(target="e28", text="Hello World")`

```
### Ran Playwright code
```js
await page.getByRole('textbox', { name: 'Type here...' }).fill('Hello World');
```

### Page
- Page URL: http://localhost:9999/cpMapper.html  
- Page Title: AI Agent Behavioral Mapper v2.0

### Snapshot  
```yaml
  ...
  - textbox "Type here..." [ref=e28]: Hello World    ← VALUE NOW SHOWN
  ...
```
```

### 5.4 Snapshot Delivery Modes

The snapshot can be delivered two ways based on configuration:

| Mode | Behavior | Agent sees |
|------|----------|-----------|
| **File** (default) | Snapshot saved to `.yml` file, link returned | `- [Snapshot](./page-abc123.yml)` — agent reads file |
| **Inline** | Snapshot embedded directly in response | YAML text in ` ```yaml ``` ` code block |

```typescript
// From response.ts — snapshot serialization logic
if (this._includeSnapshotFileName) {
    // Save to file and return link
    const resolvedFile = await this.resolveClientFile({ prefix: 'page', ext: 'yml' });
    await this._writeFile(resolvedFile, tabSnapshot.ariaSnapshot);
    addSection('Snapshot', [resolvedFile.printableLink]);
} else {
    // Return inline
    addSection('Snapshot', [tabSnapshot.ariaSnapshot], 'yaml');
}
```

### 5.5 Modal State Handling

If a dialog (alert/confirm/prompt) appears, the snapshot includes:

```
### Modal state
- ["confirm" dialog with message "Are you sure?"]: can be handled by browser_handle_dialog
```

The agent **cannot take a snapshot or interact with the page** until the dialog is handled. This blocks the entire interaction loop.

---

## 6. Detection Vectors Arising from the Snapshot Mechanism

### 6.1 `_ariaRef` Property on DOM Elements — HIGH CONFIDENCE

**Source:** `packages/injected/src/ariaSnapshot.ts` — `computeAriaRef()`

After any snapshot, Playwright stores `_ariaRef` objects directly on DOM elements. This is a **definitive Playwright artifact**.

```javascript
// Detection code
function detectPlaywrightAriaRefs() {
    let refsFound = 0;
    const elements = document.querySelectorAll('input, button, select, textarea, a, [role]');
    for (const el of elements) {
        if (el._ariaRef && typeof el._ariaRef === 'object' && el._ariaRef.ref) {
            refsFound++;
        }
    }
    return refsFound > 0;  // Any ref = Playwright snapshot was taken
}
```

**Strength:** Definitive — only Playwright sets this property.  
**Weakness:** Only present AFTER first snapshot. Must poll or check after a delay.  
**False positive:** None — no other library uses `_ariaRef`.  
**Applies to:** OpenClaw, Copilot browser tools, Playwright MCP, any Playwright-based agent.

### 6.2 `aria-ref` Selector Engine Registration — HIGH CONFIDENCE

Playwright registers a custom `aria-ref` selector engine in the injected script. This can be detected:

```javascript
// Detection: Check if the aria-ref selector engine exists
function detectAriaRefEngine() {
    try {
        // Playwright's aria-ref engine is registered on document
        const result = document.querySelector('::-p-aria-ref(e1)');
        return true;
    } catch {
        // Engine not registered — not Playwright
        return false;
    }
}
```

**Note:** The exact selector syntax depends on how Playwright registers its engines. The `_ariaRef` property check (6.1) is more reliable.

### 6.3 Repeated Accessibility Tree Traversals — MEDIUM CONFIDENCE

Each snapshot triggers a full DOM traversal computing:
- `getAriaRole()` for every element
- `getElementAccessibleName()` for every element  
- `isElementHiddenForAria()` visibility checks
- `getBoundingClientRect()` when `boxes: true`
- `receivesPointerEvents()` hit-testing

**Detection approach — Performance Observer:**

```javascript
function detectSnapshotTraversals() {
    let traversalCount = 0;
    
    // Trap getComputedStyle calls (used by visibility checks)
    const originalGetComputedStyle = window.getComputedStyle;
    let rapidCalls = 0;
    let lastCallTime = 0;
    
    window.getComputedStyle = function(...args) {
        const now = performance.now();
        if (now - lastCallTime < 1) rapidCalls++;  // <1ms between calls = traversal
        else rapidCalls = 0;
        lastCallTime = now;
        
        if (rapidCalls > 50) {  // 50+ rapid getComputedStyle = tree traversal
            traversalCount++;
            rapidCalls = 0;
        }
        return originalGetComputedStyle.apply(this, args);
    };
    
    return () => traversalCount;  // Call later to get count
}
```

**Strength:** Catches the actual traversal behavior.  
**Weakness:** Other tools (browser extensions, DevTools) can also trigger rapid style computations.

### 6.4 `getBoundingClientRect()` Burst Pattern — MEDIUM CONFIDENCE

When `boxes: true` is enabled, Playwright calls `getBoundingClientRect()` on every visible element during snapshot. This creates a distinctive burst pattern:

```javascript
function detectBBoxBurst() {
    let bboxCalls = [];
    const original = Element.prototype.getBoundingClientRect;
    
    Element.prototype.getBoundingClientRect = function() {
        bboxCalls.push(performance.now());
        return original.call(this);
    };
    
    // Check periodically for burst patterns
    setInterval(() => {
        const now = performance.now();
        const recentCalls = bboxCalls.filter(t => now - t < 100);  // Last 100ms
        
        if (recentCalls.length > 30) {
            // 30+ getBoundingClientRect calls in 100ms = snapshot with boxes
            console.log('Snapshot burst detected:', recentCalls.length, 'calls');
        }
        
        // Clean old entries
        bboxCalls = bboxCalls.filter(t => now - t < 5000);
    }, 200);
}
```

### 6.5 No Mouse Movement Between Actions — BEHAVIORAL

The snapshot-action loop means the agent:
1. Reads snapshot text
2. Calls `browser_click(target="e5")` or `browser_type(target="e28", text="...")`
3. Playwright resolves ref → DOM element → executes action

**No mouse movement is generated between actions.** The mouse teleports to each element center. Our cpMapper.html detected this as:
- **No-Move Clicks: 100%** — every click had no preceding mouse movement
- **Center Clicks: 100%** — every click hit exact element center

### 6.6 Value-Without-Keystrokes Pattern — BEHAVIORAL

The default `fill()` behavior:
1. Focuses the element
2. Selects all existing text (Ctrl+A)
3. Deletes selection
4. Types the full text via `Input.dispatchKeyEvent` in rapid succession

But critically, the **individual character timing is machine-perfect** — no human-like variation in keystroke intervals. Our cpMapper.html detected:
- **Input Injection: 56%** — chars appeared without matching natural keydown patterns
- **Focus Jumps: 40%** — focus changed without prior pointer/keyboard input

### 6.7 Stale Ref Error Pattern — INFORMATIONAL

When the agent tries to use a ref that's been invalidated (e.g., page content changed), Playwright throws:

```
Ref e3 not found in the current page snapshot. Try capturing new snapshot.
```

The agent then calls `browser_snapshot` again. This **retry-after-stale-ref** pattern creates a distinctive sequence:
- Action attempt → fail → snapshot → retry action
- This doubles the number of AX tree traversals

---

## 7. Pros and Cons of the Snapshot Mechanism

### 7.1 Pros (From the Agent's Perspective)

| Pro | Explanation |
|-----|-------------|
| **Structured understanding** | Agent sees semantic roles, not raw HTML soup |
| **Efficient** | YAML is much smaller than full HTML/DOM |
| **Accessible** | Same tree screen readers use — semantically meaningful |
| **Ref stability** | Refs persist across snapshots (until role/name changes) |
| **Cross-framework** | Works regardless of React/Vue/Angular — it's the final AX tree |
| **No visual parsing** | No need for screenshot → vision model → interpretation pipeline |
| **Incremental updates** | Supports diffing for changed elements only |

### 7.2 Cons (From the Agent's Perspective)

| Con | Explanation |
|-----|-------------|
| **No visual context** | Can't see colors, layout, visual prominence, images |
| **Ref staleness** | Any DOM mutation can invalidate refs, requiring re-snapshot |
| **No CSS/style info** | Can't determine if element is styled as primary button vs link |
| **Hidden content blind spot** | `display:none` or `aria-hidden` elements are invisible |
| **No network awareness** | Can't see XHR requests, WebSocket messages, etc. |
| **Snapshot overhead** | Each snapshot = full AX tree traversal (expensive for large pages) |
| **Single-page focus** | Can't see across tabs simultaneously |
| **Form framework issues** | React/Vue controlled inputs may not reflect state in AX tree |

### 7.3 Pros (From the Detector's Perspective)

| Pro | Explanation |
|-----|-------------|
| **Predictable interaction pattern** | Always: snapshot → action → snapshot → action |
| **`_ariaRef` artifact** | Definitive Playwright fingerprint on DOM elements |
| **No mouse trajectories** | Agent never generates natural mouse movement |
| **Machine-speed transitions** | Field-to-field timing is inhuman |
| **Fill pattern detectable** | `fill()` creates value-without-keystrokes signal |
| **Center-clicking** | All clicks target computed element center |
| **AX tree traversal bursts** | Rapid getComputedStyle/getBoundingClientRect calls |

### 7.4 Cons (From the Detector's Perspective)

| Con | Explanation |
|-----|-------------|
| **Real Chrome browser** | All browser-level fingerprints (UA, TLS, headers) are genuine |
| **`navigator.webdriver` suppressed** | `--disable-blink-features=AutomationControlled` hides the flag |
| **Events are `isTrusted: true`** | Playwright's CDP-dispatched events are trusted by the browser |
| **No unique OpenClaw identifier** | `_ariaRef` is Playwright-generic, not OpenClaw-specific |
| **Snapshot artifacts only post-interaction** | `_ariaRef` doesn't exist until first snapshot is taken |
| **`slowly: true` option** | If agent uses `pressSequentially`, keystroke pattern mimics human better |
| **Improving rapidly** | Playwright team actively fixing behavioral tells |

---

## 8. Practical Detection Strategy Summary

### 8.1 Detection Timeline During a Typical Form Fill

```
T+0ms     Page loads
          └─→ No artifacts yet

T+100ms   Agent calls browser_navigate or browser_snapshot
          └─→ FIRST AX tree traversal
          └─→ _ariaRef properties appear on DOM elements  ← DETECTABLE
          └─→ getBoundingClientRect burst (if boxes:true)  ← DETECTABLE

T+200ms   Agent reads snapshot, decides to fill first field
          └─→ browser_type(target="e28", text="Hello World")
          └─→ Ref resolved via aria-ref engine
          └─→ locator.fill() executes:
              • focus event (no prior mouse move)  ← DETECTABLE
              • selectAll + delete
              • Rapid key dispatch  ← DETECTABLE (machine timing)
          └─→ Auto-snapshot: SECOND AX tree traversal

T+350ms   Agent fills second field
          └─→ browser_type(target="e31", text="test@example.com")
          └─→ Same pattern: focus jump, no mouse, machine timing
          └─→ Auto-snapshot: THIRD AX tree traversal

T+500ms   Agent clicks checkbox
          └─→ browser_click(target="e51")
          └─→ Click at exact center, no prior mouse movement
          └─→ Auto-snapshot: FOURTH AX tree traversal

...and so on
```

### 8.2 Layered Detection Approach

```
Layer 1: Definitive artifacts (HIGH confidence)
  ├─ _ariaRef property on DOM elements
  ├─ CDP proxy trap (console.groupEnd)
  └─ aria-ref selector engine registration

Layer 2: Behavioral signals (MEDIUM confidence)  
  ├─ No mouse movement before clicks
  ├─ All clicks at element centers
  ├─ Focus jumps without pointer/keyboard input
  ├─ Value injection without matching keystroke events
  └─ Machine-speed field transitions (<50ms between fields)

Layer 3: Timing patterns (LOW confidence, supporting)
  ├─ getBoundingClientRect burst pattern
  ├─ Rapid getComputedStyle calls
  ├─ Snapshot-action-snapshot cadence
  └─ Total form fill time (seconds vs minutes for humans)
```

### 8.3 What's OpenClaw-Specific vs Playwright-Generic?

| Signal | OpenClaw-Specific? | Also fires for... |
|--------|-------------------|-------------------|
| `_ariaRef` | NO — Playwright generic | Copilot, Playwright MCP, any Playwright agent |
| CDP proxy trap | NO — any CDP connection | DevTools open, Puppeteer, chrome-devtools-mcp |
| Gateway port 18789 | **YES — OpenClaw only** | Nothing else uses this port |
| `~/.openclaw/` directory | **YES — OpenClaw only** | — |
| Behavioral patterns | NO — any automation | Puppeteer, Selenium, etc. |

**Bottom line:** To specifically identify OpenClaw (vs other Playwright-based agents), you need the gateway port probe (18789) or identity probing via the system prompt.

---

*See [OPENCLAW_DETECTION_V2_OVERVIEW.md](OPENCLAW_DETECTION_V2_OVERVIEW.md) for the complete document index.*
