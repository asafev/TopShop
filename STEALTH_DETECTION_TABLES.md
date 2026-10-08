# Stealth Plugin Detection Comparison Tables

## Quick Reference: Evasion vs Detection Matrix

### Table A: Complete Evasion Mapping

| Evasion Module | What Stealth Does | Our Detection Method | File Location | Status |
|----------------|-------------------|---------------------|---------------|--------|
| **chrome.app** | Mocks entire chrome.app object with static data | `window.chrome.app` existence check | `browserFingerprint.js:2390` | ⚠️ PARTIAL |
| **chrome.csi** | Implements chrome.csi() using Performance API | `window.chrome.csi` existence check | `browserFingerprint.js:2394` | ⚠️ PARTIAL |
| **chrome.loadTimes** | Implements chrome.loadTimes() with timing data | **NOT DETECTED** | N/A | ❌ GAP |
| **chrome.runtime** | Full chrome.runtime mock with connect/sendMessage | Multiple checks in agentDetector | `agentDetector.js:594-657`, `browserFingerprint.js:2012` | ✅ GOOD |
| **defaultArgs** | Removes --disable-extensions, --disable-default-apps | Indirect effect detection | N/A | ⚠️ MINIMAL |
| **iframe.contentWindow** | Proxies contentWindow for srcdoc iframes | **NOT DETECTED** | N/A | ❌ GAP |
| **media.codecs** | Spoofs canPlayType for proprietary codecs | Comprehensive codec testing | `detectors/codecSupport.js` | ✅ GOOD |
| **navigator.hardwareConcurrency** | Sets to 4 (configurable) | Odd number detection | `browserFingerprint.js:138` | ✅ GOOD |
| **navigator.languages** | Sets ['en-US', 'en'] | Language consistency checks | `detectors/languageDetector.js` | ✅ GOOD |
| **navigator.permissions** | Fixes Notification.permission quirks | Permission state testing | `detectors/permissionsDetector.js` | ✅ GOOD |
| **navigator.plugins** | Full PluginArray/MimeTypeArray mocks | Length check, existence | `browserFingerprint.js` | ⚠️ PARTIAL |
| **navigator.vendor** | Sets "Google Inc." | Vendor string check | `browserFingerprint.js` | ✅ GOOD |
| **navigator.webdriver** | Deletes webdriver, adds --disable-blink-features | Multiple detection methods | `browserFingerprint.js:1858-1861`, `browserFingerprint.js:2445-2448` | ✅ EXCELLENT |
| **sourceurl** | Strips __puppeteer_evaluation_script__ from CDP | Stack trace analysis, global checks | `detectors/stackTraceFingerprint.js:62`, `browserFingerprint.js:2472` | ⚠️ PARTIAL |
| **user-agent-override** | Full UA override including Client Hints | UA parsing, platform checks | Multiple files | ✅ GOOD |
| **webgl.vendor** | Spoofs getParameter for 37445/37446 | WebGL renderer/vendor detection | `detectors/webGLfingerprint.js` | ✅ EXCELLENT |
| **window.outerdimensions** | Sets outerWidth/Height based on inner | Zero dimension detection | `browserFingerprint.js:523-531`, `browserFingerprint.js:2323-2331` | ✅ GOOD |

---

## Table B: Detection Techniques Deep Dive

### Chrome API Mocking Detection

| API | Stealth Implementation | Detection Strategy | Implementation Difficulty |
|-----|----------------------|-------------------|--------------------------|
| `chrome.app.isInstalled` | Returns false | Check if always returns false | Low |
| `chrome.app.getDetails()` | Returns null | Validate return type | Low |
| `chrome.csi().pageT` | Uses Date.now() - navigationStart | Cross-validate with performance.now() | Medium |
| `chrome.csi().tran` | Always returns 15 | Statistical analysis across users | Medium |
| `chrome.loadTimes().requestTime` | timing.navigationStart / 1000 | Validate precision and correlation | Medium |
| `chrome.loadTimes().connectionInfo` | From Navigation Timing API | Check consistency with Resource Timing | High |
| `chrome.runtime.id` | Returns undefined | Same as real, not useful | N/A |
| `chrome.runtime.sendMessage` | Proxied function with validation | Check prototype existence | Medium |
| `chrome.runtime.connect` | Proxied function with validation | Behavior testing | Medium |

### Navigator Property Detection

| Property | Stealth Value | Real Chrome Value | Detection Method |
|----------|--------------|-------------------|------------------|
| `navigator.webdriver` | undefined/false | undefined in real | Prototype check, flag testing |
| `navigator.vendor` | "Google Inc." | "Google Inc." | Same - not useful alone |
| `navigator.hardwareConcurrency` | 4 (default) | System-specific | Cross-check with Worker timing |
| `navigator.languages` | ['en-US', 'en'] | User-configured | Consistency with Accept-Language |
| `navigator.platform` | Platform string | System-specific | Consistency with UA |
| `navigator.plugins.length` | 3 (PDF, PDF Viewer, NaCl) | Varies | Content validation, not just length |
| `navigator.mimeTypes.length` | 4 | Varies | Cross-reference with plugins |

### Plugin Mock Validation Points

| Check | Expected Value (Stealth) | Expected Value (Real Chrome) | Detection Viable? |
|-------|--------------------------|------------------------------|-------------------|
| `plugins[0].name` | "Chrome PDF Plugin" | Same | ❌ No |
| `plugins[0].filename` | "internal-pdf-viewer" | Same | ❌ No |
| `plugins.namedItem('Chrome PDF Plugin')` | Returns plugin | Same | ❌ No |
| `plugins.refresh()` | Returns undefined | Same | ❌ No |
| `JSON.stringify(navigator.plugins)` | Correct output | Same | ❌ No |
| `Object.getOwnPropertyNames(plugins)` | No 'length' | Same | ❌ No |
| `plugins[0][0].enabledPlugin === plugins[0]` | true | true | ❌ No |
| **PDF actual functionality** | N/A | Works | ✅ Yes - behavioral |

---

## Table C: Function Integrity Analysis

### Functions Modified by Stealth

| Function | Modification Type | toString Output | Detection Method |
|----------|------------------|-----------------|------------------|
| `chrome.csi` | Full implementation | `function csi() { [native code] }` | Compare with fresh iframe |
| `chrome.loadTimes` | Full implementation | `function loadTimes() { [native code] }` | Compare with fresh iframe |
| `chrome.app.getDetails` | Full implementation | `function getDetails() { [native code] }` | Stack trace analysis |
| `HTMLMediaElement.canPlayType` | Proxy wrapper | `function canPlayType() { [native code] }` | Behavioral testing |
| `WebGLRenderingContext.getParameter` | Proxy wrapper | `function getParameter() { [native code] }` | Specific param testing |
| `Permissions.prototype.query` | Proxy wrapper | `function query() { [native code] }` | Response validation |
| `document.createElement` | Proxy wrapper | `function createElement() { [native code] }` | iframe behavior |
| `navigator.plugins.item` | Custom implementation | `function item() { [native code] }` | Behavior testing |
| `navigator.plugins.namedItem` | Custom implementation | `function namedItem() { [native code] }` | Behavior testing |

### Detection via toString Chain Analysis

```javascript
// Stealth patches Function.prototype.toString globally
// Detection approach:

function detectToStringTampering() {
    const results = {};
    
    // 1. Check toString chain depth
    let fn = navigator.permissions.query;
    let depth = 0;
    let current = fn.toString;
    while (current && depth < 10) {
        try {
            current = current.toString;
            depth++;
        } catch (e) { break; }
    }
    results.toStringDepth = depth;
    
    // 2. Check for Proxy indicators in errors
    try {
        // Force an error that reveals Proxy
        Reflect.setPrototypeOf(fn.toString, null);
    } catch (e) {
        results.errorMessage = e.message;
        results.hasProxyIndicator = e.message.includes('Proxy') || 
                                     e.stack?.includes('newHandler');
    }
    
    // 3. Compare with fresh context
    const iframe = document.createElement('iframe');
    document.body.appendChild(iframe);
    const freshFn = iframe.contentWindow.navigator.permissions.query;
    results.matchesFreshContext = fn.toString() === freshFn.toString();
    document.body.removeChild(iframe);
    
    return results;
}
```

---

## Table D: CDP Layer Detection

### CDP Commands Used by Stealth

| CDP Command | Purpose | What Gets Sent | Detection Opportunity |
|-------------|---------|----------------|----------------------|
| `Network.setUserAgentOverride` | Override UA and hints | Full UA metadata | Request interception on server |
| `Runtime.evaluate` (intercepted) | Strip sourceURL | Expression without sourceURL | Stack trace analysis |
| `Runtime.callFunctionOn` (intercepted) | Strip sourceURL | Function declaration cleaned | Error stack inspection |

### Server-Side Detection Opportunities

| Check | What to Look For | Why It Works |
|-------|------------------|--------------|
| Accept-Language header case | CDP uses exact case "Accept-Language" | `setExtraHTTPHeaders` lowercases everything |
| Header ordering | CDP may order headers differently | Browser fingerprinting |
| TLS fingerprint | Different TLS handshake | JA3 fingerprinting |
| HTTP/2 fingerprint | Different frame ordering | Akamai/Cloudflare detection |

---

## Table E: Recommended New Detectors

### Priority 1: Critical Gaps

| Detector Name | Purpose | Implementation Approach |
|---------------|---------|------------------------|
| `chromeLoadTimesDetector` | Detect chrome.loadTimes mock | Validate structure and timing correlation |
| `iframeFreshWindowDetector` | Detect srcdoc proxy evasion | Create srcdoc iframe, compare environments |
| `proxyChainDetector` | Detect Proxy-wrapped functions | Error analysis, toString chain inspection |

### Priority 2: Enhanced Coverage

| Detector Name | Purpose | Implementation Approach |
|---------------|---------|------------------------|
| `pluginStructureValidator` | Deep plugin validation | Property enumeration, cross-reference checks |
| `csiTimingCorrelator` | Validate CSI timing | Cross-check with Performance API |
| `clientHintsValidator` | Check UA Client Hints | navigator.userAgentData analysis |

### Priority 3: Behavioral Detection

| Detector Name | Purpose | Implementation Approach |
|---------------|---------|------------------------|
| `pdfHandlerTester` | Test PDF plugin functionality | Attempt PDF operations |
| `extensionBehaviorDetector` | Check for default extension behavior | Test chrome.runtime edge cases |
| `codecBehaviorTester` | Test actual codec playback | Attempt media playback |

---

## Table F: Implementation Checklist

### New Metrics to Add to browserFingerprint.js

| Metric Path | What to Collect | Risk Assessment |
|-------------|-----------------|-----------------|
| `chromeAPI.loadTimes.exists` | `typeof chrome?.loadTimes === 'function'` | Missing = suspicious in Chrome |
| `chromeAPI.loadTimes.structure` | Validate return object properties | Invalid structure = spoofed |
| `chromeAPI.loadTimes.timingCorrelation` | Compare with Performance API | Discrepancy = spoofed |
| `iframeAnalysis.srcdocPlugins` | Plugins in srcdoc iframe | Empty = headless, Mismatch = proxy |
| `iframeAnalysis.freshWindowCompare` | Compare key properties | Differences = manipulation |
| `functionIntegrity.toStringChainDepth` | How deep is toString chain | Deep = proxied |
| `functionIntegrity.errorProxyIndicator` | Check error messages for Proxy | Present = proxied |
| `userAgentData.available` | `typeof navigator.userAgentData` | Modern browser indicator |
| `userAgentData.brands` | Client Hints brands array | Inconsistency = spoofed |
| `userAgentData.platformMatch` | Compare platform sources | Mismatch = spoofed |

### Detection Score Adjustments

| Current Metric | Current Weight | Proposed Weight | Reasoning |
|----------------|----------------|-----------------|-----------|
| `navigator.webdriver === true` | HIGH (1.0) | HIGH (1.0) | Still critical |
| `plugins.length === 0` | HIGH (1.0) | MEDIUM (0.7) | Stealth mocks this well |
| `WebGL SwiftShader` | HIGH (1.0) | HIGH (1.0) | Stealth spoofs this |
| `outerWidth === 0` | HIGH (1.0) | MEDIUM (0.7) | Stealth spoofs this |
| **NEW: loadTimes missing** | N/A | HIGH (0.9) | Critical indicator |
| **NEW: iframe plugins mismatch** | N/A | CRITICAL (1.0) | Bypasses stealth |
| **NEW: Proxy detected in toString** | N/A | CRITICAL (1.0) | Detects all proxies |

---

## Summary Statistics

| Metric | Value |
|--------|-------|
| Total Stealth Evasions | 17 |
| Fully Detected | 8 (47%) |
| Partially Detected | 6 (35%) |
| Not Detected | 3 (18%) |
| Critical Gaps | 3 |
| Recommended New Detectors | 9 |
| Implementation Effort | Medium (1-2 weeks) |

---

*Last Updated: January 28, 2026*
