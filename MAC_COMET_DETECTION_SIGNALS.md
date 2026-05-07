# Mac-Specific Comet (Perplexity Browser) Detection Signals

## Executive Summary

On macOS, the FK Grotesk Neue font may not be installed system-wide (it could be bundled inside `Comet.app/Contents/Resources/` and only accessible to the browser process). However, we have a **confirmed observation** that Comet makes requests to `frontend-cdn.perplexity.ai/agi/assets/fonts/FKGroteskNeue.woff2` **initiated from our page** — meaning Comet **injects CSS/@font-face rules into the page DOM**. This gives us multiple high-confidence detection vectors that work on Mac regardless of system font installation.

---

## Signal 1: CSP Violation Detection (HIGHEST CONFIDENCE — Mac+Windows)

**Mechanism:** Set a strict Content-Security-Policy that blocks font loading from external domains. When Comet injects its `@font-face` CSS pointing to `frontend-cdn.perplexity.ai`, the browser will fire a `securitypolicyviolation` event that our page can catch.

**Why it works:** CSP applies to ALL resources loaded in the page context, including those triggered by injected stylesheets from content scripts. The browser cannot bypass its own CSP enforcement even for extension-injected CSS (unless the extension uses `chrome.declarativeNetRequest` to modify CSP headers, which Comet doesn't do).

**Detection Code:**
```javascript
// Must be in <head> BEFORE any content script CSS loads
// Option A: via meta tag
// <meta http-equiv="Content-Security-Policy" content="font-src 'self' data:; style-src 'self' 'unsafe-inline';">

// Option B: via programmatic listener (works even without meta CSP if server sends CSP header)
const cspViolations = [];
let cometFontBlocked = false;

document.addEventListener('securitypolicyviolation', (e) => {
    const violation = {
        blockedURI: e.blockedURI,
        violatedDirective: e.violatedDirective,
        effectiveDirective: e.effectiveDirective,
        originalPolicy: e.originalPolicy,
        sourceFile: e.sourceFile,
        sample: e.sample,
        timestamp: Date.now()
    };
    cspViolations.push(violation);
    
    // Check for Perplexity-specific font loading
    if (e.blockedURI && (
        e.blockedURI.includes('perplexity.ai') ||
        e.blockedURI.includes('FKGrotesk') ||
        e.blockedURI.includes('fkgrotesk')
    )) {
        cometFontBlocked = true;
    }
    
    // Also check for font-src violations even without domain match
    // (Comet might proxy through different CDN in future)
    if (e.effectiveDirective === 'font-src' && e.blockedURI && 
        !e.blockedURI.startsWith(location.origin)) {
        // External font load we didn't request
        cspViolations.push({ ...violation, suspicious: true });
    }
});
```

**Expected Results:**
- **Comet (Mac/Win):** `securitypolicyviolation` fires with `blockedURI` containing `frontend-cdn.perplexity.ai` and `effectiveDirective: "font-src"`
- **Normal Chrome:** No violation events (no external font requests we didn't make)
- **Chrome with extensions:** Possible FP from extensions that load web fonts (e.g., Grammarly, custom font extensions)

**FP Risk:** LOW — The `blockedURI` domain check (`perplexity.ai`) is highly specific. Only fires if something tries to load from Perplexity's CDN.

**Platform:** Cross-platform (Windows + Mac)

**Important:** The CSP must be delivered via `<meta>` tag or HTTP header. A `<meta>` CSP tag MUST appear before any content that could trigger loads. Place it as the first element in `<head>`.

---

## Signal 2: FontFaceSet Enumeration (HIGH CONFIDENCE — Mac+Windows)

**Mechanism:** When Comet injects a `<style>` element with `@font-face` rules into the page DOM, those font faces become part of `document.fonts` (the FontFaceSet). We can iterate this set and look for FontFace objects we didn't declare.

**Why it works:** CSS `@font-face` rules in DOM `<style>` elements are "CSS-connected" fonts that appear in `document.fonts`. Since content scripts share the DOM (just not the JS execution context), their injected styles create observable FontFace entries.

**Detection Code:**
```javascript
async function detectInjectedFonts() {
    // Wait for fonts to be ready (Comet's @font-face might still be loading)
    await document.fonts.ready;
    
    const injectedFonts = [];
    const knownFonts = new Set(); // fonts WE declared
    
    // Collect our own @font-face declarations
    for (const sheet of document.styleSheets) {
        try {
            if (sheet.ownerNode && sheet.ownerNode.id) {
                // Only count sheets we explicitly created
                for (const rule of sheet.cssRules) {
                    if (rule instanceof CSSFontFaceRule) {
                        knownFonts.add(rule.style.getPropertyValue('font-family').replace(/['"]/g, ''));
                    }
                }
            }
        } catch(e) {} // CORS stylesheet — skip
    }
    
    // Enumerate all fonts in the FontFaceSet
    for (const fontFace of document.fonts) {
        const family = fontFace.family.replace(/['"]/g, '');
        
        // Check for Perplexity-specific font families
        if (family.toLowerCase().includes('fkgrotesk') ||
            family.toLowerCase().includes('fk grotesk') ||
            family.toLowerCase().includes('perplexity')) {
            injectedFonts.push({
                family: family,
                status: fontFace.status,
                weight: fontFace.weight,
                style: fontFace.style,
                unicodeRange: fontFace.unicodeRange,
                // Try to get the source URL (may be opaque)
                src: fontFace.src || null
            });
        }
        
        // Also flag any font we didn't declare
        if (!knownFonts.has(family)) {
            // Unknown font face in our document
            injectedFonts.push({
                family: family,
                status: fontFace.status,
                isUnknown: true,
                weight: fontFace.weight
            });
        }
    }
    
    return {
        hit: injectedFonts.some(f => f.family.toLowerCase().includes('fkgrotesk') || 
                                      f.family.toLowerCase().includes('fk grotesk')),
        totalFontsInSet: document.fonts.size,
        injectedFonts: injectedFonts,
        detail: injectedFonts.length > 0 
            ? `Found ${injectedFonts.length} unexpected fonts: ${injectedFonts.map(f => f.family).join(', ')}`
            : 'No injected fonts found'
    };
}
```

**Expected Results:**
- **Comet:** FontFace objects with family "FKGroteskNeue" or similar, with src pointing to perplexity CDN
- **Normal Chrome:** `document.fonts.size` matches only our own @font-face declarations (typically 0 if we declare none)

**FP Risk:** LOW-MEDIUM — Other extensions may inject fonts. The family name check (`fkgrotesk`) makes it specific to Comet.

**Platform:** Cross-platform (Windows + Mac)

---

## Signal 3: Document.fonts.size Baseline Comparison (MEDIUM CONFIDENCE)

**Mechanism:** If our page declares ZERO `@font-face` rules, then `document.fonts.size` should be 0 in normal Chrome. If Comet injects @font-face CSS, the size will be > 0.

**Detection Code:**
```javascript
function detectUnexpectedFontFaces() {
    // We deliberately declare NO @font-face rules in our page
    // Any fonts in document.fonts were injected by something else
    const size = document.fonts.size;
    const fonts = [];
    
    for (const face of document.fonts) {
        fonts.push({
            family: face.family,
            status: face.status,
            weight: face.weight,
            stretch: face.stretch,
            style: face.style
        });
    }
    
    return {
        hit: size > 0,
        size: size,
        fonts: fonts,
        detail: size > 0 
            ? `document.fonts.size = ${size} (expected 0). Fonts: ${fonts.map(f => f.family).join(', ')}`
            : 'document.fonts.size = 0 (expected)'
    };
}
```

**FP Risk:** MEDIUM — Any extension that injects @font-face rules will trigger this. Use as a supporting signal, not primary.

**Platform:** Cross-platform

---

## Signal 4: PerformanceObserver Resource Timing (HIGH CONFIDENCE — Mac+Windows)

**Mechanism:** Use the Resource Timing API to detect network requests to Perplexity domains that we didn't initiate.

**Why it works:** When Comet's injected CSS triggers font downloads, those appear as resource timing entries visible to the page (unless blocked by CSP first). Even if CSP blocks them, the *attempt* may still be logged.

**Detection Code:**
```javascript
function detectPerplexityResources() {
    const entries = performance.getEntriesByType('resource');
    const perplexityEntries = entries.filter(e => 
        e.name.includes('perplexity.ai') ||
        e.name.includes('FKGrotesk') ||
        e.name.includes('fkgrotesk')
    );
    
    return {
        hit: perplexityEntries.length > 0,
        entries: perplexityEntries.map(e => ({
            name: e.name,
            initiatorType: e.initiatorType,
            duration: e.duration,
            transferSize: e.transferSize,
            startTime: e.startTime
        })),
        detail: perplexityEntries.length > 0
            ? `Found ${perplexityEntries.length} resource(s) from Perplexity: ${perplexityEntries.map(e => e.name).join(', ')}`
            : 'No Perplexity resources in performance timeline'
    };
}

// Also set up continuous monitoring
function monitorPerplexityResources(callback) {
    const observer = new PerformanceObserver((list) => {
        for (const entry of list.getEntries()) {
            if (entry.name.includes('perplexity.ai') || 
                entry.name.includes('FKGrotesk')) {
                callback({
                    hit: true,
                    resource: entry.name,
                    initiator: entry.initiatorType,
                    time: entry.startTime
                });
            }
        }
    });
    observer.observe({ type: 'resource', buffered: true });
    return observer;
}
```

**Expected Results:**
- **Comet (without CSP):** Resource entries for `frontend-cdn.perplexity.ai/agi/assets/fonts/FKGroteskNeue.woff2`
- **Comet (with CSP):** May not appear (blocked before completing), but CSP violation will fire instead
- **Normal Chrome:** Zero perplexity entries

**FP Risk:** VERY LOW — Only fires if actual network requests are made to perplexity.ai domains.

**Platform:** Cross-platform

**Note:** Use this in conjunction with Signal 1 (CSP). If CSP is active, font loads are blocked and won't appear here — use CSP violations instead. If CSP is NOT active, this catches successful loads.

---

## Signal 5: Stylesheet Injection Detection (HIGH CONFIDENCE — Mac+Windows)

**Mechanism:** Iterate all stylesheets in `document.styleSheets` and their CSS rules. Look for `@font-face` rules with perplexity CDN URLs or FK Grotesk family names.

**Why it works:** Content scripts that inject `<style>` elements into the page DOM create CSSStyleSheet objects accessible via `document.styleSheets`. We can read their cssRules.

**Detection Code:**
```javascript
function detectInjectedStylesheets() {
    const findings = [];
    
    // Method 1: Check document.styleSheets for injected rules
    for (let i = 0; i < document.styleSheets.length; i++) {
        const sheet = document.styleSheets[i];
        try {
            // Check the ownerNode — is it a <style> we didn't create?
            const owner = sheet.ownerNode;
            const isOurs = owner && (owner.id || owner.dataset?.ours);
            
            if (!isOurs && sheet.cssRules) {
                for (const rule of sheet.cssRules) {
                    const ruleText = rule.cssText || '';
                    
                    // Look for @font-face with perplexity references
                    if (rule instanceof CSSFontFaceRule) {
                        const src = rule.style.getPropertyValue('src') || '';
                        const family = rule.style.getPropertyValue('font-family') || '';
                        
                        if (src.includes('perplexity') || 
                            family.toLowerCase().includes('fkgrotesk') ||
                            family.toLowerCase().includes('fk grotesk')) {
                            findings.push({
                                type: 'font-face',
                                family: family,
                                src: src,
                                sheetIndex: i,
                                ownerTag: owner?.tagName,
                                ownerHref: sheet.href
                            });
                        }
                    }
                    
                    // Also check for any rule referencing perplexity domains
                    if (ruleText.includes('perplexity.ai') || 
                        ruleText.includes('FKGrotesk')) {
                        findings.push({
                            type: 'css-rule',
                            ruleText: ruleText.substring(0, 200),
                            sheetIndex: i
                        });
                    }
                }
            }
        } catch(e) {
            // CORS-blocked stylesheet — can't read rules
            // But we can still check if it's from perplexity domain
            if (sheet.href && sheet.href.includes('perplexity.ai')) {
                findings.push({
                    type: 'external-sheet',
                    href: sheet.href,
                    corsBlocked: true
                });
            }
        }
    }
    
    // Method 2: Check all <style> elements in the DOM for FK Grotesk references
    const styleElements = document.querySelectorAll('style');
    for (const el of styleElements) {
        const text = el.textContent || '';
        if (text.includes('FKGrotesk') || 
            text.includes('FK Grotesk') ||
            text.includes('perplexity.ai') ||
            text.includes('frontend-cdn.perplexity')) {
            findings.push({
                type: 'style-element',
                content: text.substring(0, 300),
                parentTag: el.parentElement?.tagName
            });
        }
    }
    
    // Method 3: Check <link> elements pointing to perplexity
    const linkElements = document.querySelectorAll('link[rel="stylesheet"]');
    for (const el of linkElements) {
        if (el.href && (el.href.includes('perplexity.ai') || el.href.includes('perplexity'))) {
            findings.push({
                type: 'link-element',
                href: el.href
            });
        }
    }
    
    return {
        hit: findings.length > 0,
        findings: findings,
        totalStylesheets: document.styleSheets.length,
        detail: findings.length > 0
            ? `Found ${findings.length} Perplexity CSS injections: ${findings.map(f => f.type).join(', ')}`
            : 'No injected Perplexity stylesheets detected'
    };
}
```

**Expected Results:**
- **Comet:** Finds `@font-face` rules with family "FKGroteskNeue" and src URL from `frontend-cdn.perplexity.ai`
- **Normal Chrome:** Zero findings

**FP Risk:** VERY LOW — Domain-specific checks (`perplexity.ai`) virtually eliminate false positives.

**Platform:** Cross-platform

---

## Signal 6: MutationObserver for CSS Injection (HIGH CONFIDENCE — realtime)

**Mechanism:** Set up a MutationObserver ASAP (in `<head>`) to catch `<style>` or `<link>` elements being added to the DOM by Comet's content scripts.

**Why it works:** Content scripts share the DOM. When they `document.head.appendChild(styleElement)` or similar, our MutationObserver fires.

**Detection Code:**
```javascript
// Place this in <head> as early as possible!
const cometInjections = [];
let cometStyleDetected = false;

const injectionObserver = new MutationObserver((mutations) => {
    for (const mutation of mutations) {
        for (const node of mutation.addedNodes) {
            if (node.nodeType !== 1) continue; // only elements
            
            // Detect <style> injection
            if (node.tagName === 'STYLE') {
                const text = node.textContent || '';
                if (text.includes('FKGrotesk') || 
                    text.includes('FK Grotesk') ||
                    text.includes('perplexity') ||
                    text.includes('frontend-cdn')) {
                    cometStyleDetected = true;
                    cometInjections.push({
                        type: 'style',
                        content: text.substring(0, 500),
                        time: performance.now()
                    });
                }
            }
            
            // Detect <link rel="stylesheet"> injection
            if (node.tagName === 'LINK' && node.rel === 'stylesheet') {
                if (node.href && node.href.includes('perplexity')) {
                    cometStyleDetected = true;
                    cometInjections.push({
                        type: 'link',
                        href: node.href,
                        time: performance.now()
                    });
                }
            }
            
            // Also check subtree for nested injections
            if (node.querySelectorAll) {
                const nested = node.querySelectorAll('style, link[rel="stylesheet"]');
                for (const el of nested) {
                    const text = el.textContent || el.href || '';
                    if (text.includes('FKGrotesk') || text.includes('perplexity')) {
                        cometStyleDetected = true;
                        cometInjections.push({
                            type: el.tagName.toLowerCase(),
                            content: text.substring(0, 300),
                            time: performance.now()
                        });
                    }
                }
            }
        }
    }
});

// Start observing immediately
injectionObserver.observe(document.documentElement, {
    childList: true,
    subtree: true
});
```

**FP Risk:** VERY LOW — Only triggers on perplexity-specific content.

**Platform:** Cross-platform

**Timing Note:** Comet content scripts likely run at `document_idle` (default) or `document_end`. A MutationObserver set up in a `<head>` `<script>` block will be active before these run.

---

## Signal 7: document.fonts "loading" Event (MEDIUM-HIGH CONFIDENCE)

**Mechanism:** Listen for `loading` and `loadingdone` events on `document.fonts`. If we declare no @font-face rules, any loading event means something else triggered a font load.

**Detection Code:**
```javascript
// We declare NO @font-face in our page
let unexpectedFontLoading = false;
const fontLoadEvents = [];

document.fonts.addEventListener('loading', (e) => {
    unexpectedFontLoading = true;
    fontLoadEvents.push({
        type: 'loading',
        time: performance.now()
    });
});

document.fonts.addEventListener('loadingdone', (e) => {
    // Check what fonts finished loading
    const loaded = [];
    for (const face of document.fonts) {
        if (face.status === 'loaded') {
            loaded.push(face.family);
        }
    }
    fontLoadEvents.push({
        type: 'loadingdone',
        time: performance.now(),
        fonts: loaded
    });
});

document.fonts.addEventListener('loadingerror', (e) => {
    // CSP might block the font load, causing an error
    fontLoadEvents.push({
        type: 'loadingerror',
        time: performance.now()
    });
});
```

**Expected Results:**
- **Comet (no CSP):** `loading` fires, then `loadingdone` with FK Grotesk fonts
- **Comet (with CSP):** `loading` fires, then `loadingerror`
- **Normal Chrome:** No font loading events (we declared none)

**FP Risk:** MEDIUM — Extensions like Grammarly, custom themes, or reader-mode extensions may trigger font loads.

**Platform:** Cross-platform

---

## Signal 8: Font Canvas Rendering Test (MEDIUM for Mac, HIGH for Windows)

**Mechanism:** Our current approach — use canvas text measurement to detect if FK Grotesk is available for rendering.

**Mac Concern:** If fonts are bundled in `Comet.app/Contents/Resources/` but NOT installed system-wide, they won't be available to canvas unless they're also loaded via @font-face. However, if Comet injects @font-face CSS (which we've confirmed), those fonts WILL be renderable once loaded.

**Detection Code (improved for Mac — waits for font load):**
```javascript
async function detectFKGroteskCanvas() {
    // Wait for any injected fonts to finish loading
    await document.fonts.ready;
    
    // Small delay to ensure content script injection has occurred
    await new Promise(r => setTimeout(r, 500));
    await document.fonts.ready; // re-check after delay
    
    const testString = 'mmmmmmmmmmlli10OoQq@#$%';
    const testSize = '72px';
    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d');

    ctx.font = `${testSize} monospace`;
    const monoWidth = ctx.measureText(testString).width;
    ctx.font = `${testSize} serif`;
    const serifWidth = ctx.measureText(testString).width;

    const fontNames = [
        'FK Grotesk Neue', 'FK Grotesk', 'FKGroteskNeue', 'FKGrotesk'
    ];

    const detected = [];
    for (const fontName of fontNames) {
        ctx.font = `${testSize} "${fontName}", monospace`;
        const wMono = ctx.measureText(testString).width;
        ctx.font = `${testSize} "${fontName}", serif`;
        const wSerif = ctx.measureText(testString).width;

        const deltaM = Math.abs(wMono - monoWidth);
        const deltaS = Math.abs(wSerif - serifWidth);

        if (deltaM > 0.1 || deltaS > 0.1) {
            detected.push({ name: fontName, deltaMono: deltaM, deltaSerif: deltaS });
        }
    }

    return {
        hit: detected.length > 0,
        detected: detected,
        detail: detected.length > 0
            ? `FK Grotesk fonts render differently: ${detected.map(d => `${d.name} (Δ${d.deltaMono.toFixed(2)})`).join(', ')}`
            : 'FK Grotesk fonts not available for rendering'
    };
}
```

**Mac Behavior Analysis:**
- **Scenario A (system-wide install):** Works identically to Windows ✓
- **Scenario B (app-bundled only, no @font-face injection):** Canvas CANNOT render the font → signal misses ✗
- **Scenario C (app-bundled + @font-face injection):** After `document.fonts.ready`, the font IS renderable via canvas → works ✓

Since we confirmed Comet injects @font-face CSS, **Scenario C is likely on Mac**. The delay + `fonts.ready` ensures we test after the font loads.

**FP Risk:** LOW — FK Grotesk is Perplexity's proprietary font.

**Platform:** Cross-platform (with the caveat that on Mac, it requires waiting for @font-face loading)

---

## Signal 9: Computed Style Font Override Detection (MEDIUM CONFIDENCE)

**Mechanism:** Comet may inject CSS that overrides the default font-family for the page. Create elements with no explicit font and check what they resolve to.

**Detection Code:**
```javascript
function detectFontOverride() {
    // Create a clean element with no explicit font
    const el = document.createElement('div');
    el.style.cssText = 'position:absolute;visibility:hidden;';
    el.textContent = 'test';
    document.body.appendChild(el);
    
    const computed = getComputedStyle(el).fontFamily;
    document.body.removeChild(el);
    
    // Check if computed font contains FK Grotesk (Comet might set it as default)
    const hasFKGrotesk = computed.toLowerCase().includes('fkgrotesk') || 
                          computed.toLowerCase().includes('fk grotesk');
    
    // Also check body's computed font
    const bodyFont = getComputedStyle(document.body).fontFamily;
    const bodyHasFK = bodyFont.toLowerCase().includes('fkgrotesk') || 
                       bodyFont.toLowerCase().includes('fk grotesk');
    
    // Check if our explicitly-set font got overridden
    const testEl = document.createElement('span');
    testEl.style.fontFamily = 'Arial, sans-serif';
    testEl.textContent = 'test';
    document.body.appendChild(testEl);
    const testComputed = getComputedStyle(testEl).fontFamily;
    document.body.removeChild(testEl);
    
    const fontOverridden = testComputed !== '"Arial", sans-serif' && 
                           testComputed !== 'Arial, sans-serif';
    
    return {
        hit: hasFKGrotesk || bodyHasFK,
        computedDefault: computed,
        bodyFont: bodyFont,
        overridden: fontOverridden,
        testFontResult: testComputed,
        detail: hasFKGrotesk 
            ? `Default font includes FK Grotesk: ${computed}`
            : `Default font: ${computed} (no FK Grotesk override)`
    };
}
```

**FP Risk:** MEDIUM-HIGH — If Comet doesn't globally override fonts (just injects @font-face definitions), this won't trigger. More useful as a supplementary signal.

**Platform:** Cross-platform

---

## Signal 10: document.fonts.check() for FK Grotesk (MEDIUM CONFIDENCE)

**Mechanism:** `document.fonts.check()` returns `true` if text can be rendered with the given font spec without triggering a font load from the FontFaceSet. If FK Grotesk is either: (a) a system font, or (b) not in the FontFaceSet at all, check returns `true`. If it's in the FontFaceSet and loaded, it returns `true`. If it's in the FontFaceSet but not yet loaded, it returns `false`.

**Key insight:** `document.fonts.check("16px FKGroteskNeue")` behavior:
- Normal Chrome (font not installed, not in set): returns `true` (will fall through to fallback)
- Comet after font loaded via @font-face: returns `true` (it's loaded)
- Comet before font loaded: returns `false` (it's in the set, still loading)

This is tricky — the `false` case (font still loading) is actually the DETECTION signal! In normal Chrome, a non-existent font always returns `true`.

**Detection Code:**
```javascript
function detectFKGroteskInFontFaceSet() {
    // In normal Chrome with no FK Grotesk anywhere, check() returns true
    // (non-existent fonts don't trigger swap, so check says "safe to render")
    
    // But if FK Grotesk is in the FontFaceSet (from Comet injection)
    // and hasn't finished loading yet, check() returns false
    
    // Strategy: check BEFORE fonts.ready resolves
    const checkResult = document.fonts.check('16px "FKGroteskNeue"');
    const checkResult2 = document.fonts.check('16px "FK Grotesk Neue"');
    const checkResult3 = document.fonts.check('16px "FK Grotesk"');
    
    // A `false` result means the font IS in document.fonts but not yet loaded
    // This is a strong signal — it means someone added a @font-face for this font
    const inSet = !checkResult || !checkResult2 || !checkResult3;
    
    return {
        hit: inSet,
        checks: {
            'FKGroteskNeue': checkResult,
            'FK Grotesk Neue': checkResult2,
            'FK Grotesk': checkResult3
        },
        detail: inSet 
            ? `FK Grotesk found in FontFaceSet (still loading): check()=${checkResult},${checkResult2},${checkResult3}`
            : 'FK Grotesk not in FontFaceSet (check returns true = not present)'
    };
}
```

**IMPORTANT TIMING:** This test must run BEFORE `document.fonts.ready` resolves. Once fonts are loaded, `check()` returns `true` regardless. Run this synchronously in early page load.

**Alternative approach — run check, then explicitly load:**
```javascript
async function detectFKGroteskLoadable() {
    // If we call document.fonts.load() for FK Grotesk and it actually loads something,
    // that means a @font-face for it was declared (by Comet)
    const beforeSize = document.fonts.size;
    
    try {
        const loaded = await document.fonts.load('16px "FKGroteskNeue"');
        // If loaded.length > 0, the font was in the FontFaceSet and loaded successfully
        return {
            hit: loaded.length > 0,
            loadedCount: loaded.length,
            detail: loaded.length > 0 
                ? `document.fonts.load("FKGroteskNeue") returned ${loaded.length} font(s) — @font-face exists!`
                : 'No FK Grotesk in FontFaceSet to load'
        };
    } catch(e) {
        return { hit: false, detail: `Error: ${e.message}` };
    }
}
```

**FP Risk:** LOW — FK Grotesk is Perplexity-proprietary; no other source would inject it.

**Platform:** Cross-platform

---

## Signal 11: Network Request via Fetch/XHR Interception (SPECULATIVE)

**Mechanism:** Override `fetch` or `XMLHttpRequest` to intercept font loading requests initiated by Comet's CSS.

**Why it might NOT work:** Fonts loaded via CSS `@font-face` use the browser's internal resource loader, not `fetch()` or `XHR`. So monkey-patching these won't catch font loads. However, if Comet uses programmatic font loading via the FontFace API (e.g., `new FontFace(...).load()`), and that code runs in the MAIN world, it might use fetch internally.

**Verdict:** Likely useless for CSS-driven font loads. Skip this.

---

## Signal 12: Service Worker Interception (LOW CONFIDENCE)

**Mechanism:** Register a service worker that intercepts fetch events. Font loads via @font-face DO go through service workers.

**Detection Code:**
```javascript
// sw.js (service worker)
self.addEventListener('fetch', (event) => {
    const url = event.request.url;
    if (url.includes('perplexity.ai') || url.includes('FKGrotesk')) {
        // Report back to page
        self.clients.matchAll().then(clients => {
            clients.forEach(client => {
                client.postMessage({
                    type: 'comet-font-detected',
                    url: url
                });
            });
        });
    }
});

// Main page
navigator.serviceWorker.register('/sw.js').then(() => {
    navigator.serviceWorker.addEventListener('message', (e) => {
        if (e.data.type === 'comet-font-detected') {
            console.log('Comet font load intercepted:', e.data.url);
        }
    });
});
```

**FP Risk:** LOW (domain-specific), but **COMPLEXITY: HIGH** — requires separate SW file, HTTPS, and may not intercept if CSP blocks before reaching SW.

**Platform:** Cross-platform

**Recommendation:** Too complex for inline detection. Prefer Signals 1, 2, 4, 5.

---

## Signal 13: Navigator/UserAgent Brand Detection (ALREADY CONFIRMED USELESS)

Per our deep dive document: Comet uses stock Chrome UA strings. No "Comet" or "Perplexity" in brands. SKIP.

---

## Signal 14: Extension Resource Probing via Timing (LOW CONFIDENCE)

**Mechanism:** Try to load a known Comet extension resource and measure timing. Even though Chrome blocks it, the error timing might differ based on whether the extension exists.

**Verdict:** Already confirmed dead in our deep dive (VECTOR 6). Chrome blocks all `chrome-extension://` requests from page context without `web_accessible_resources`. SKIP.

---

## Signal 15: Comet-Specific Global Variables (SPECULATIVE — needs testing)

**Mechanism:** Comet might expose APIs or globals for its AI agent integration.

**Detection Code:**
```javascript
function detectCometGlobals() {
    const suspiciousGlobals = [
        '__COMET__', '__PERPLEXITY__', '__PPLX__',
        'comet', 'perplexity', 'pplx',
        '__cometAgent', '__pplxAgent',
        // Brave-specific (Comet is Brave-based)
        'brave', 'ethereum' // Brave wallet
    ];
    
    const found = [];
    for (const name of suspiciousGlobals) {
        if (name in window) {
            found.push({ name, type: typeof window[name], value: String(window[name]).substring(0, 100) });
        }
    }
    
    // Check navigator.brave (Brave-specific)
    if ('brave' in navigator) {
        found.push({ name: 'navigator.brave', type: typeof navigator.brave });
    }
    
    return {
        hit: found.length > 0,
        found: found,
        detail: found.length > 0
            ? `Found globals: ${found.map(f => f.name).join(', ')}`
            : 'No Comet-specific globals detected'
    };
}
```

**Note:** Our deep dive already confirmed `navigator.brave` is NOT exposed by Comet. But new versions might add page-visible APIs for their AI agent. Worth re-testing periodically.

**FP Risk:** HIGH for `brave`/`ethereum` (real Brave users), LOW for perplexity-specific names.

**Platform:** Cross-platform

---

## Signal 16: StyleSheet Count Anomaly (WEAK SUPPORTING SIGNAL)

**Mechanism:** Count stylesheets and compare to what we expect. If our page has exactly 1 `<style>` block, but `document.styleSheets.length` is 2+, something injected a stylesheet.

**Detection Code:**
```javascript
function detectStylesheetCountAnomaly() {
    // Our page has exactly 1 <style> element (the one we wrote)
    const expectedCount = 1; // adjust based on your page
    const actualCount = document.styleSheets.length;
    
    const injectedSheets = [];
    for (let i = expectedCount; i < actualCount; i++) {
        const sheet = document.styleSheets[i];
        injectedSheets.push({
            index: i,
            href: sheet.href,
            ownerNode: sheet.ownerNode?.tagName,
            media: sheet.media?.mediaText,
            title: sheet.title
        });
    }
    
    return {
        hit: actualCount > expectedCount,
        expected: expectedCount,
        actual: actualCount,
        injected: injectedSheets,
        detail: actualCount > expectedCount
            ? `Expected ${expectedCount} stylesheet(s), found ${actualCount} (+${actualCount - expectedCount} injected)`
            : `Stylesheet count matches expected: ${actualCount}`
    };
}
```

**FP Risk:** HIGH — Many extensions inject stylesheets (dark mode, accessibility, ad blockers). Use only as supporting evidence.

**Platform:** Cross-platform

---

## Signal 17: @font-face src URL Pattern Matching (HIGH CONFIDENCE)

**Mechanism:** If we can read the `src` descriptor of injected @font-face rules, match against known Perplexity CDN patterns.

**Detection Code:**
```javascript
function detectPerplexityFontFaceSrc() {
    const perplexityPatterns = [
        'frontend-cdn.perplexity.ai',
        '/agi/assets/fonts/',
        'FKGroteskNeue.woff2',
        'FKGroteskNeue.woff',
        'FKGrotesk',
        'perplexity.ai/fonts'
    ];
    
    const matches = [];
    
    for (const sheet of document.styleSheets) {
        try {
            for (const rule of sheet.cssRules) {
                if (rule instanceof CSSFontFaceRule) {
                    const src = rule.style.getPropertyValue('src') || '';
                    const family = rule.style.getPropertyValue('font-family') || '';
                    
                    for (const pattern of perplexityPatterns) {
                        if (src.includes(pattern) || family.includes(pattern)) {
                            matches.push({
                                pattern: pattern,
                                family: family,
                                src: src.substring(0, 200),
                                sheetHref: sheet.href
                            });
                        }
                    }
                }
            }
        } catch(e) { /* CORS */ }
    }
    
    return {
        hit: matches.length > 0,
        matches: matches,
        detail: matches.length > 0
            ? `@font-face rules referencing Perplexity CDN: ${matches.map(m => m.pattern).join(', ')}`
            : 'No @font-face rules reference Perplexity CDN'
    };
}
```

**FP Risk:** EXTREMELY LOW — `frontend-cdn.perplexity.ai` is uniquely Perplexity's infrastructure.

**Platform:** Cross-platform

---

## Signal 18: CSP Meta Tag + Violation Combo (DEFINITIVE — recommended primary signal)

**Mechanism:** This is the most reliable approach. We SET a CSP that blocks Perplexity's font CDN, then detect the violation. This works even if fonts aren't installed system-wide (Mac scenario).

**Full Implementation:**
```html
<!-- MUST be first element in <head> -->
<meta http-equiv="Content-Security-Policy" 
      content="font-src 'self' data:; 
               style-src 'self' 'unsafe-inline'; 
               img-src * data: blob:; 
               connect-src *;
               script-src 'self' 'unsafe-inline' 'unsafe-eval';">

<script>
// Immediately start listening
window.__cometDetected = false;
window.__cspViolations = [];

document.addEventListener('securitypolicyviolation', (e) => {
    window.__cspViolations.push({
        blocked: e.blockedURI,
        directive: e.effectiveDirective,
        source: e.sourceFile,
        line: e.lineNumber,
        sample: e.sample,
        time: performance.now()
    });
    
    if (e.effectiveDirective === 'font-src' && 
        e.blockedURI.includes('perplexity.ai')) {
        window.__cometDetected = true;
    }
});
</script>
```

**Expected Results:**
- **Comet:** Within ~100-500ms of page load, fires `securitypolicyviolation` with `blockedURI: "https://frontend-cdn.perplexity.ai/agi/assets/fonts/FKGroteskNeue.woff2"` and `effectiveDirective: "font-src"`
- **Normal Chrome:** Zero violations (nothing tries to load perplexity fonts)

**FP Risk:** VIRTUALLY ZERO — Only fires if something on the page attempts to load fonts from `perplexity.ai`.

**Platform:** Cross-platform (Windows + Mac)

**Why this is the best signal for Mac:** It doesn't depend on fonts being installed system-wide. It detects the *attempt* to load fonts, which happens regardless of OS.

---

## Signal 19: Font Loading Event + CSP Error Combo (BELT + SUSPENDERS)

**Mechanism:** Combine `document.fonts` events with CSP violations. If we see a `loadingerror` on document.fonts AND a CSP violation for font-src, it's extremely strong evidence.

```javascript
let fontLoadError = false;
let cspFontViolation = false;

document.fonts.addEventListener('loadingerror', () => { fontLoadError = true; });
document.addEventListener('securitypolicyviolation', (e) => {
    if (e.effectiveDirective === 'font-src') cspFontViolation = true;
});

// After 1 second, check combined signal
setTimeout(() => {
    if (fontLoadError && cspFontViolation) {
        // Extremely high confidence: something added a @font-face
        // and the font load was blocked by our CSP
        console.log('COMET DETECTED: Font injection + CSP block confirmed');
    }
}, 1000);
```

---

## Recommended Implementation Priority

| Priority | Signal | Confidence | Mac Works | FP Risk |
|----------|--------|-----------|-----------|---------|
| 1 | **#18: CSP + Violation** | DEFINITIVE | ✅ | Virtually zero |
| 2 | **#17: @font-face src URL** | VERY HIGH | ✅ | Extremely low |
| 3 | **#5: Stylesheet inspection** | HIGH | ✅ | Very low |
| 4 | **#2: FontFaceSet enumeration** | HIGH | ✅ | Low-medium |
| 5 | **#4: PerformanceObserver** | HIGH | ✅ | Very low |
| 6 | **#6: MutationObserver** | HIGH | ✅ | Very low |
| 7 | **#8: Canvas font test** | MEDIUM-HIGH | ⚠️ (needs delay) | Low |
| 8 | **#7: Font loading events** | MEDIUM | ✅ | Medium |
| 9 | **#10: fonts.check() timing** | MEDIUM | ✅ | Low |
| 10 | **#3: fonts.size baseline** | MEDIUM | ✅ | Medium |

---

## Combined Detection Strategy for Mac

```javascript
class CometMacDetector {
    constructor() {
        this.signals = {};
        this.score = 0;
        this.maxScore = 100;
    }
    
    async run() {
        // Phase 1: Immediate (synchronous) checks
        this.signals.cspViolation = await this.waitForCSPViolation(2000);
        this.signals.fontFaceSet = await detectInjectedFonts();
        this.signals.stylesheets = detectInjectedStylesheets();
        this.signals.fontFaceSrc = detectPerplexityFontFaceSrc();
        this.signals.performanceResources = detectPerplexityResources();
        
        // Phase 2: Delayed (wait for content script + font loading)
        await new Promise(r => setTimeout(r, 800));
        this.signals.canvasFont = await detectFKGroteskCanvas();
        this.signals.fontsSize = detectUnexpectedFontFaces();
        
        // Score
        if (this.signals.cspViolation.hit) this.score += 40;
        if (this.signals.fontFaceSrc.hit) this.score += 25;
        if (this.signals.stylesheets.hit) this.score += 15;
        if (this.signals.fontFaceSet.hit) this.score += 10;
        if (this.signals.canvasFont.hit) this.score += 5;
        if (this.signals.performanceResources.hit) this.score += 5;
        
        return {
            isComet: this.score >= 30,
            score: this.score,
            signals: this.signals
        };
    }
    
    waitForCSPViolation(timeout) {
        return new Promise(resolve => {
            const timer = setTimeout(() => {
                resolve({ hit: false, detail: 'No CSP violations within timeout' });
            }, timeout);
            
            document.addEventListener('securitypolicyviolation', (e) => {
                if (e.blockedURI.includes('perplexity.ai') ||
                    (e.effectiveDirective === 'font-src' && 
                     !e.blockedURI.startsWith(location.origin))) {
                    clearTimeout(timer);
                    resolve({
                        hit: true,
                        blockedURI: e.blockedURI,
                        directive: e.effectiveDirective,
                        detail: `CSP blocked: ${e.blockedURI} (${e.effectiveDirective})`
                    });
                }
            }, { once: true });
        });
    }
}
```

---

## Key Insight: Why CSP Violation is the Silver Bullet for Mac

On Windows, FK Grotesk gets installed system-wide → canvas detection works immediately.

On Mac, fonts may be bundled in the `.app` package → canvas detection fails **unless** the font is also loaded via @font-face. We've confirmed Comet injects @font-face CSS, which means:

1. **Without CSP:** Font loads from `frontend-cdn.perplexity.ai` → canvas works after load → Signals 2, 4, 5, 8 all work
2. **With CSP:** Font load is BLOCKED → CSP violation fires → Signal 1/18 works immediately, canvas won't work (font never loads)

**Recommended approach:** Use CSP to block fonts, catch the violation (Signal 18). This is fast, definitive, and works on both platforms regardless of font installation method.

If you need the canvas test to also work (for environments where you can't set CSP), DON'T use `font-src: 'none'` — instead use `font-src: 'self' data:` and rely on `PerformanceObserver` (Signal 4) to catch the successful load, then run canvas test after a delay.

---

## Additional Research: How Chromium Extension CSS Injection Works

### Content Script CSS Injection Methods:

1. **`manifest.json` css field:** Extension declares CSS files in `content_scripts[].css` → Chrome injects them into matching pages in the isolated world's stylesheet scope. These are NOT visible in `document.styleSheets` from the page.

2. **`chrome.scripting.insertCSS()`:** Similar to manifest injection → creates an "author-level" stylesheet → IS visible in `document.styleSheets`.

3. **DOM manipulation (appendChild):** Content script creates a `<style>` or `<link>` element and appends it to the page DOM → IS visible in `document.styleSheets` and to MutationObservers.

**Comet's approach (confirmed from source analysis):** Comet uses method 3 (DOM manipulation) for its overlay CSS and likely for its font injection. This is why `document.styleSheets` inspection works.

### Why @font-face from injected <style> triggers page-visible font loads:

When a `<style>` element is added to the page DOM (even by a content script), the browser's CSS parser processes it in the page's rendering context. Any `@font-face` rules become part of the page's font matching algorithm. Font loads triggered by these rules:
- Appear in `document.fonts` (FontFaceSet)
- Trigger `loading`/`loadingdone`/`loadingerror` events
- Are subject to the page's CSP
- Appear in Performance Resource Timing
- Can be blocked by CSP `font-src` directives
