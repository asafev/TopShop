# Puppeteer-Extra-Plugin-Stealth: Comprehensive Analysis

## Executive Summary

This document provides an in-depth analysis of the `puppeteer-extra-plugin-stealth` package, comparing its evasion techniques against our current detection and fingerprinting metrics. The goal is to identify gaps in our detection capabilities and areas for improvement.

---

## Table of Contents

1. [Stealth Plugin Overview](#stealth-plugin-overview)
2. [Evasion Techniques Summary](#evasion-techniques-summary)
3. [Detailed Evasion Analysis](#detailed-evasion-analysis)
4. [Comparison with Our Detectors](#comparison-with-our-detectors)
5. [Gap Analysis](#gap-analysis)
6. [Recommendations](#recommendations)

---

## Stealth Plugin Overview

### Purpose
The `puppeteer-extra-plugin-stealth` is designed to make headless Chromium/Chrome browsers appear as regular browsers by:
- Mocking missing browser APIs present in headful mode
- Overriding properties that reveal automation
- Stripping puppeteer-specific identifiers from stack traces
- Normalizing inconsistencies between headless and headful Chrome

### Architecture
The plugin uses a modular evasion system where each technique is a standalone sub-plugin:

| Evasion Module | Status | Description |
|----------------|--------|-------------|
| `chrome.app` | ✅ Enabled | Mocks chrome.app object |
| `chrome.csi` | ✅ Enabled | Mocks chrome.csi timing API |
| `chrome.loadTimes` | ✅ Enabled | Mocks chrome.loadTimes API |
| `chrome.runtime` | ✅ Enabled | Mocks chrome.runtime object |
| `defaultArgs` | ✅ Enabled | Removes detection-prone Chrome args |
| `iframe.contentWindow` | ✅ Enabled | Fixes iframe detection |
| `media.codecs` | ✅ Enabled | Spoofs codec support |
| `navigator.hardwareConcurrency` | ✅ Enabled | Sets to value 4 |
| `navigator.languages` | ✅ Enabled | Sets proper language array |
| `navigator.permissions` | ✅ Enabled | Fixes permission inconsistencies |
| `navigator.plugins` | ✅ Enabled | Mocks plugins/mimeTypes arrays |
| `navigator.vendor` | ✅ Enabled | Sets "Google Inc." |
| `navigator.webdriver` | ✅ Enabled | Removes webdriver flag |
| `sourceurl` | ✅ Enabled | Strips puppeteer sourceURL |
| `user-agent-override` | ✅ Enabled | Fixes UA string, platform, hints |
| `webgl.vendor` | ✅ Enabled | Spoofs WebGL vendor/renderer |
| `window.outerdimensions` | ✅ Enabled | Fixes outerWidth/outerHeight |

---

## Evasion Techniques Summary

### Table 1: All Stealth Evasions with Technical Details

| # | Evasion | What It Spoofs | Detection Vector Countered | Technical Method |
|---|---------|----------------|---------------------------|------------------|
| 1 | **chrome.app** | `window.chrome.app` object | Missing chrome.app in headless | Object.defineProperty with static data |
| 2 | **chrome.csi** | `window.chrome.csi()` function | Missing CSI timing API in headless | Implements using Performance API |
| 3 | **chrome.loadTimes** | `window.chrome.loadTimes()` function | Missing loadTimes API in headless | Implements using Navigation Timing API |
| 4 | **chrome.runtime** | `window.chrome.runtime` object | Missing/incorrect chrome.runtime | Extensive mocking with connect/sendMessage |
| 5 | **defaultArgs** | Chrome launch arguments | Detection of automation flags | Removes `--disable-extensions`, `--disable-default-apps` |
| 6 | **iframe.contentWindow** | iframe contentWindow proxy | srcdoc iframe fresh window detection | Proxy with Reflect.get trapping |
| 7 | **media.codecs** | `canPlayType()` responses | Missing proprietary codecs in Chromium | Intercepts specific codec queries |
| 8 | **navigator.hardwareConcurrency** | `navigator.hardwareConcurrency` | Odd/unusual core counts | Sets fixed value (default: 4) |
| 9 | **navigator.languages** | `navigator.languages` array | Empty/wrong languages array | Object.freeze with proper array |
| 10 | **navigator.permissions** | Permissions API responses | Inconsistent notification permissions | Fixes headless-specific quirks |
| 11 | **navigator.plugins** | `navigator.plugins` & `mimeTypes` | Empty plugins array in headless | Full functional mock with MagicArray |
| 12 | **navigator.vendor** | `navigator.vendor` string | Incorrect vendor string | Getter proxy with custom value |
| 13 | **navigator.webdriver** | `navigator.webdriver` property | True/exists in automation | Delete from prototype + Chrome flag |
| 14 | **sourceurl** | CDP script injection markers | `__puppeteer_evaluation_script__` in stack | Intercepts CDP commands |
| 15 | **user-agent-override** | Full UA metadata | HeadlessChrome in UA, Linux platform | CDP Network.setUserAgentOverride |
| 16 | **webgl.vendor** | WebGL getParameter results | "Google Inc./SwiftShader" renderer | Proxy on getParameter for 37445/37446 |
| 17 | **window.outerdimensions** | `outerWidth`/`outerHeight` | Zero/missing outer dimensions | Sets based on inner dimensions |

---

## Detailed Evasion Analysis

### 1. chrome.app Evasion

**What it does:**
- Creates `window.chrome.app` object with proper structure
- Implements `isInstalled`, `InstallState`, `RunningState` static data
- Mocks `getDetails()`, `getIsInstalled()`, `runningState()` methods
- Uses `utils.patchToStringNested()` to make functions appear native

**Detection Impact:**
```javascript
// Detectable pattern (before stealth):
window.chrome.app === undefined // true in headless

// After stealth:
window.chrome.app.isInstalled // false (like real Chrome)
window.chrome.app.getDetails() // null (like real Chrome)
```

**Our Current Coverage:** ✅ **PARTIAL**
- We check `!!window.chrome.app` but don't verify the internal structure
- Missing: Method integrity checks, static data validation

---

### 2. chrome.csi Evasion

**What it does:**
- Implements `window.chrome.csi()` using Performance Timing API
- Returns object with: `onloadT`, `startE`, `pageT`, `tran`
- Patches toString to appear native

**Technical Implementation:**
```javascript
window.chrome.csi = function() {
    return {
        onloadT: timing.domContentLoadedEventEnd,
        startE: timing.navigationStart,
        pageT: Date.now() - timing.navigationStart,
        tran: 15 // Transition type
    }
}
```

**Our Current Coverage:** ✅ **PARTIAL**
- We check `!!window.chrome.csi` but don't validate returned values
- Missing: Correlation with actual timing data, consistency checks

---

### 3. chrome.loadTimes Evasion

**What it does:**
- Implements comprehensive `chrome.loadTimes()` mock
- Uses Performance API and Navigation Timing API
- Returns timing info: `requestTime`, `startLoadTime`, `commitLoadTime`, etc.
- Includes connection info: `connectionInfo`, `npnNegotiatedProtocol`, etc.

**Our Current Coverage:** ❌ **NOT DETECTED**
- We don't check `chrome.loadTimes` at all
- Could cross-validate with Performance API data

---

### 4. chrome.runtime Evasion

**What it does:**
- Mocks full `chrome.runtime` object structure
- Static data from JSON (OnInstalledReason, PlatformArch, etc.)
- Implements `sendMessage` and `connect` with proper error handling
- Extension ID validation (32 chars, a-p only)

**Detection Opportunities:**
```javascript
// The mock has subtle differences:
chrome.runtime.id === undefined // Both mock and real return undefined
// But:
chrome.runtime.sendMessage.prototype // Real: undefined, Mock: exists (may vary)
```

**Our Current Coverage:** ✅ **PARTIAL**
- We check `chrome.runtime` existence
- Missing: Deep structure validation, method behavior testing

---

### 5. defaultArgs Evasion

**What it does:**
- Removes automation-revealing Chrome launch arguments:
  - `--disable-extensions`
  - `--disable-default-apps`
  - `--disable-component-extensions-with-background-pages`

**Detection Impact:**
- These flags affect Chrome's behavior in detectable ways
- Extensions presence, default apps, component extensions

**Our Current Coverage:** ❌ **LIMITED**
- We detect some effects indirectly but don't check for extension presence patterns

---

### 6. iframe.contentWindow Evasion

**What it does:**
- Proxies `iframe.contentWindow` to prevent srcdoc detection
- Intercepts `createElement('iframe')` calls
- Fixes the "fresh window object" detection technique
- Handles `.self`, `.frameElement` correctly

**Technical Sophistication:**
```javascript
const contentWindowProxy = {
    get(target, key) {
        if (key === 'self') return this
        if (key === 'frameElement') return iframe
        if (key === '0') return undefined
        return Reflect.get(target, key)
    }
}
```

**Our Current Coverage:** ⚠️ **MINIMAL**
- We don't have comprehensive iframe-based detection
- Missing: srcdoc iframe fresh environment testing

---

### 7. media.codecs Evasion

**What it does:**
- Spoofs `HTMLMediaElement.prototype.canPlayType()` responses
- Makes Chromium report proprietary codec support:
  - `video/mp4; codecs="avc1.42E01E"` → `"probably"`
  - `audio/x-m4a` → `"maybe"`
  - `audio/aac` → `"probably"`

**Our Current Coverage:** ✅ **GOOD**
- We have comprehensive codec detection in `detectors/codecSupport.js`
- We test similar codecs but could add consistency checks

---

### 8. navigator.hardwareConcurrency Evasion

**What it does:**
- Sets `navigator.hardwareConcurrency` to a fixed value (default: 4)
- Uses getter proxy on Navigator prototype

**Detection Opportunity:**
```javascript
// Odd numbers are suspicious (most CPUs have even core counts)
// Default of 4 may not match system capabilities
// Cross-check with Worker-based timing analysis
```

**Our Current Coverage:** ✅ **GOOD**
- We detect odd hardware concurrency as suspicious
- Could add correlation with other system indicators

---

### 9. navigator.languages Evasion

**What it does:**
- Sets `navigator.languages` to `['en-US', 'en']` by default
- Uses `Object.freeze()` for immutability

**Our Current Coverage:** ✅ **GOOD**
- We have `LanguageDetector` in detectors module
- Check language consistency

---

### 10. navigator.permissions Evasion

**What it does:**
- Fixes `Notification.permission` to return `'default'` on secure origins
- Fixes `Permissions.query()` for notifications on insecure origins
- Addresses headless-specific permission quirks

**Our Current Coverage:** ✅ **GOOD**
- We have `PermissionsDetector` in detectors module
- Test various permission states

---

### 11. navigator.plugins Evasion

**What it does:**
- Creates functional `navigator.plugins` and `navigator.mimeTypes` arrays
- Mocks 3 plugins: Chrome PDF Plugin, Chrome PDF Viewer, Native Client
- Mocks 4 mimeTypes: application/pdf, x-google-chrome-pdf, x-nacl, x-pnacl
- Implements `item()`, `namedItem()`, `refresh()` methods
- Uses MagicArray pattern for array-like behavior

**Technical Sophistication:**
- Creates convincing Plugin and MimeType objects
- Cross-references plugins↔mimeTypes (enabledPlugin property)
- Handles edge cases like `JSON.stringify`, `Object.getOwnPropertyNames`

**Detection Opportunities:**
```javascript
// The mock may have detectable patterns:
navigator.plugins[0].name === "Chrome PDF Plugin"
// Real Chrome may have different order or additional plugins
// PDF plugin behavior could be tested with actual PDF handling
```

**Our Current Coverage:** ✅ **PARTIAL**
- We check plugins/mimeTypes existence and length
- Missing: Deep validation of plugin/mimeType structure

---

### 12. navigator.vendor Evasion

**What it does:**
- Sets `navigator.vendor` to `"Google Inc."` (configurable)
- Uses getter proxy on Navigator prototype

**Our Current Coverage:** ✅ **GOOD**
- We check vendor in navigator analysis

---

### 13. navigator.webdriver Evasion

**What it does:**
- Pre Chrome 88: Deletes webdriver from Navigator prototype
- Post Chrome 88: Adds `--disable-blink-features=AutomationControlled` flag
- Handles version-specific behavior

**Our Current Coverage:** ✅ **EXCELLENT**
- Multiple webdriver detection methods
- Prototype inspection, attribute checking
- AutomationControlled flag detection

---

### 14. sourceurl Evasion

**What it does:**
- Intercepts CDP commands: `Runtime.evaluate`, `Runtime.callFunctionOn`
- Strips `//# sourceURL=__puppeteer_evaluation_script__` from injected code
- Operates at CDP layer, not page JavaScript

**Detection Opportunity:**
```javascript
// Stack traces may still reveal patterns
// Error stacks might show pptr-related sources
// CDP interception can't clean all traces
```

**Our Current Coverage:** ⚠️ **PARTIAL**
- We check for `__puppeteer` in globals
- Stack trace analysis in `stackTraceFingerprint.js`
- Could improve: script content scanning

---

### 15. user-agent-override Evasion

**What it does:**
- Removes "HeadlessChrome" from User-Agent
- Masks Linux platform as Windows (configurable)
- Sets proper `Accept-Language` header
- Implements Client Hints API overrides (brands, platform, etc.)

**CDP Command Used:**
```javascript
Network.setUserAgentOverride({
    userAgent: ua,
    platform: 'Win32',
    userAgentMetadata: {
        brands: [...],
        fullVersion: '...',
        platform: 'Windows',
        platformVersion: '...',
        architecture: 'x86',
        model: '',
        mobile: false
    }
})
```

**Our Current Coverage:** ✅ **GOOD**
- UA string analysis
- Platform consistency checks
- Could add: Client Hints validation

---

### 16. webgl.vendor Evasion

**What it does:**
- Intercepts `WebGLRenderingContext.prototype.getParameter()`
- For `UNMASKED_VENDOR_WEBGL` (37445): Returns "Intel Inc."
- For `UNMASKED_RENDERER_WEBGL` (37446): Returns "Intel Iris OpenGL Engine"
- Default headless values: "Google Inc." / "Google SwiftShader"

**Our Current Coverage:** ✅ **EXCELLENT**
- Comprehensive WebGL detection in `webGLfingerprint.js`
- Suspicious renderer detection
- "Google SwiftShader" detection

---

### 17. window.outerdimensions Evasion

**What it does:**
- Sets `window.outerWidth = window.innerWidth`
- Sets `window.outerHeight = window.innerHeight + 85` (window frame)
- Sets `defaultViewport: null` to match window size

**Our Current Coverage:** ✅ **GOOD**
- We detect zero outerWidth/outerHeight
- Could add: inner/outer relationship analysis

---

## Comparison with Our Detectors

### Table 2: Current Detector Coverage Matrix

| Our Detector | Stealth Evasions Addressed | Coverage Level |
|--------------|---------------------------|----------------|
| `browserFingerprint.js` | Most evasions | Comprehensive |
| `webGLfingerprint.js` | webgl.vendor | Excellent |
| `codecSupport.js` | media.codecs | Good |
| `permissionsDetector.js` | navigator.permissions | Good |
| `languageDetector.js` | navigator.languages | Good |
| `stackTraceFingerprint.js` | sourceurl | Partial |
| `functionIntegrityDetector.js` | All proxy-based evasions | Good |
| `agentDetector.js` | chrome.runtime, webdriver | Good |

### Table 3: Detection Techniques Comparison

| Detection Technique | Stealth Covers? | We Detect? | Notes |
|--------------------|-----------------|------------|-------|
| navigator.webdriver | ✅ Yes | ✅ Yes | Both handle well |
| HeadlessChrome UA | ✅ Yes | ✅ Yes | UA scanning implemented |
| window.chrome missing | ✅ Yes | ✅ Yes | Chrome object checks |
| Empty plugins array | ✅ Yes | ✅ Yes | Length check |
| Empty mimeTypes array | ✅ Yes | ⚠️ Partial | Need deep validation |
| WebGL SwiftShader | ✅ Yes | ✅ Yes | Renderer detection |
| Zero outer dimensions | ✅ Yes | ✅ Yes | Dimension checks |
| Permissions inconsistency | ✅ Yes | ✅ Yes | Permission detector |
| Chrome.csi missing | ✅ Yes | ⚠️ Partial | Existence only |
| Chrome.loadTimes missing | ✅ Yes | ❌ No | **GAP** |
| sourceURL in stack | ✅ Yes | ⚠️ Partial | Could improve |
| iframe.contentWindow | ✅ Yes | ❌ No | **GAP** |
| Chrome launch args effects | ✅ Yes | ❌ No | **GAP** |
| Codec canPlayType | ✅ Yes | ✅ Yes | Codec detector |
| Function toString native | ✅ Yes | ✅ Yes | Function integrity |

---

## Gap Analysis

### Table 4: Detection Gaps to Address

| Priority | Gap | Impact | Recommendation |
|----------|-----|--------|----------------|
| 🔴 HIGH | **chrome.loadTimes** not checked | Major detection surface | Add loadTimes detector |
| 🔴 HIGH | **iframe srcdoc** fresh window test | Bypasses evasions | Implement srcdoc testing |
| 🔴 HIGH | **Proxy detection** on toString | All evasions use proxies | Deep toString chain analysis |
| 🟡 MEDIUM | **Plugin structure validation** | Shallow checks only | Validate plugin properties |
| 🟡 MEDIUM | **CSI timing correlation** | Mock uses timing API | Cross-validate timing data |
| 🟡 MEDIUM | **Chrome runtime deep check** | Structure not validated | Method behavior testing |
| 🟢 LOW | **Extension presence testing** | Indirect indicator | Check default extension behavior |
| 🟢 LOW | **Client Hints validation** | Modern fingerprinting | Add UA Client Hints checks |

### Table 5: Metrics We Should Add

| New Metric | Category | What to Check | Why It Matters |
|------------|----------|---------------|----------------|
| `chrome.loadTimes()` | Chrome API | Return value structure, timing consistency | Missing in headless |
| `iframe.contentWindow.navigator.plugins` | Frame Analysis | Compare main vs iframe window | srcdoc bypass detection |
| `toString chain depth` | Function Integrity | Count proxy layers in toString | Proxy evasion detection |
| `plugins[0].description` | Navigator | Validate plugin property values | Mock validation |
| `mimeTypes[0].enabledPlugin` | Navigator | Cross-reference validation | Plugin↔MimeType link |
| `chrome.csi().pageT` correlation | Chrome API | Compare with performance.now() | Timing consistency |
| `navigator.userAgentData` | User Agent | Client Hints API data | Modern browser fingerprinting |
| `RegExp.$& in iframe` | Frame Analysis | Fresh window pollution check | Stealth leaves traces |

---

## Recommendations

### 1. Immediate Actions (High Priority)

#### 1.1 Add chrome.loadTimes Detection
```javascript
// Check chrome.loadTimes existence and validate structure
_checkChromeLoadTimes() {
    if (!window.chrome?.loadTimes) {
        return { missing: true, suspicious: true };
    }
    const times = window.chrome.loadTimes();
    // Validate timing values are realistic
    const isValid = times.requestTime > 0 && 
                    times.startLoadTime > 0 &&
                    times.finishLoadTime >= times.startLoadTime;
    return { 
        present: true, 
        valid: isValid,
        suspicious: !isValid 
    };
}
```

#### 1.2 Implement iframe srcdoc Detection
```javascript
// Create srcdoc iframe and test for main window pollution
_testIframeFreshWindow() {
    const iframe = document.createElement('iframe');
    iframe.srcdoc = 'blank';
    document.body.appendChild(iframe);
    
    // Tests:
    // 1. iframe.contentWindow.navigator.plugins.length should equal main window
    // 2. iframe.contentWindow !== window (if equal, proxy detected)
    // 3. RegExp patterns should not be polluted
    
    const result = {
        pluginsMatch: iframe.contentWindow.navigator.plugins.length === 
                      navigator.plugins.length,
        windowIsolated: iframe.contentWindow !== window,
        regexpClean: !iframe.contentWindow.RegExp['$&']
    };
    
    document.body.removeChild(iframe);
    return result;
}
```

#### 1.3 Enhanced Proxy Detection
```javascript
// Detect proxy-wrapped toString chains
_detectToStringProxy() {
    const testFns = [
        navigator.permissions.query,
        HTMLMediaElement.prototype.canPlayType,
        WebGLRenderingContext.prototype.getParameter
    ];
    
    return testFns.map(fn => {
        try {
            const str1 = fn.toString();
            const str2 = fn.toString.toString();
            const str3 = fn.toString.toString.toString();
            
            // Native functions should have specific patterns
            const isNative1 = str1.includes('[native code]');
            const isNative2 = str2.includes('[native code]');
            
            // Check for Proxy handler exposure
            const hasHandler = fn.toString.hasOwnProperty('[[Handler]]');
            
            return {
                function: fn.name,
                suspicious: !isNative1 || !isNative2 || hasHandler
            };
        } catch (e) {
            return { function: fn.name, error: true };
        }
    });
}
```

### 2. Medium Priority Enhancements

#### 2.1 Deep Plugin Validation
```javascript
_validatePluginStructure() {
    const plugins = navigator.plugins;
    const issues = [];
    
    for (let i = 0; i < plugins.length; i++) {
        const plugin = plugins[i];
        
        // Validate required properties
        if (!plugin.name || !plugin.filename) {
            issues.push('missing_required_props');
        }
        
        // Check plugin-mimeType cross-reference
        for (let j = 0; j < plugin.length; j++) {
            const mimeType = plugin[j];
            if (mimeType.enabledPlugin !== plugin) {
                issues.push('invalid_enabledPlugin_reference');
            }
        }
        
        // Known plugin fingerprint
        if (plugin.name === 'Chrome PDF Plugin' && 
            plugin.filename !== 'internal-pdf-viewer') {
            issues.push('unexpected_plugin_filename');
        }
    }
    
    return issues;
}
```

#### 2.2 Chrome CSI Correlation
```javascript
_validateCsiTiming() {
    if (!window.chrome?.csi) return { available: false };
    
    const csi = window.chrome.csi();
    const perfNow = performance.now();
    const navigationStart = performance.timing.navigationStart;
    
    // pageT should approximately equal performance.now()
    const timeDiff = Math.abs(csi.pageT - perfNow);
    const suspicious = timeDiff > 100; // More than 100ms discrepancy
    
    return {
        available: true,
        pageT: csi.pageT,
        perfNow: perfNow,
        difference: timeDiff,
        suspicious: suspicious
    };
}
```

### 3. Low Priority but Valuable

#### 3.1 User Agent Client Hints
```javascript
async _checkClientHints() {
    if (!navigator.userAgentData) {
        return { supported: false };
    }
    
    const highEntropy = await navigator.userAgentData.getHighEntropyValues([
        'architecture',
        'model', 
        'platform',
        'platformVersion',
        'fullVersionList'
    ]);
    
    // Validate consistency with navigator properties
    const platformMatch = highEntropy.platform.toLowerCase() === 
                          navigator.platform.toLowerCase().replace(/^(Win|Mac|Linux).*/i, '$1');
    
    return {
        supported: true,
        data: highEntropy,
        platformConsistent: platformMatch
    };
}
```

---

## Utility Functions Analysis

### Stealth's Utility Pattern (Worth Studying)

The stealth plugin uses sophisticated utility functions that make detection difficult:

| Utility | Purpose | Detection Countermeasure |
|---------|---------|-------------------------|
| `utils.stripProxyFromErrors` | Clean stack traces | Our stack trace analysis may miss |
| `utils.patchToString` | Native-looking toString | Function integrity needs deep analysis |
| `utils.replaceWithProxy` | Stealthy property replacement | Property descriptor checks |
| `utils.preloadCache` | Cache original functions | Can't intercept early enough |
| `utils.makeNativeString` | Generate native-looking strings | Pattern matching on toString |

### Key Insight
The stealth plugin preloads Reflect and Function.toString before applying any patches:
```javascript
utils.cache = {
    Reflect: {
        get: Reflect.get.bind(Reflect),
        apply: Reflect.apply.bind(Reflect)
    },
    nativeToStringStr: Function.toString + ''
}
```

**Implication:** Any detection that relies on checking if functions are "native" may be fooled because the stealth plugin caches the original native toString string and uses it for its mocks.

---

## Conclusion

The `puppeteer-extra-plugin-stealth` is a sophisticated evasion toolkit that addresses most common headless detection vectors. Our current detection capabilities cover approximately **70%** of what stealth evades, but critical gaps remain:

1. **iframe-based detection** - Not implemented
2. **chrome.loadTimes** - Not checked
3. **Deep proxy detection** - Incomplete
4. **Plugin/MimeType structure validation** - Shallow

By implementing the recommendations above, we can significantly improve our ability to detect automated browsers even when they use stealth plugins.

---

*Analysis Date: January 28, 2026*
*Analyst: Security Research Team*
*Version: 1.0*
