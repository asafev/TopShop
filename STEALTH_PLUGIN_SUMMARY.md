# Puppeteer-Extra-Plugin-Stealth: What It Does

## Overview

`puppeteer-extra-plugin-stealth` is a comprehensive anti-detection plugin for Puppeteer and Playwright that makes automated browsers appear as regular browsers. It consists of 17 independent evasion modules.

---

## How Stealth Works

### Architecture
```
puppeteer-extra-plugin-stealth/
├── index.js              # Main plugin loader
└── evasions/
    ├── chrome.app/        # Mock chrome.app object
    ├── chrome.csi/        # Mock chrome.csi() timing API
    ├── chrome.loadTimes/  # Mock chrome.loadTimes() timing API  
    ├── chrome.runtime/    # Mock chrome.runtime for extensions
    ├── defaultArgs/       # Remove detection-prone Chrome args
    ├── iframe.contentWindow/ # Fix iframe detection bypass
    ├── media.codecs/      # Spoof codec support
    ├── navigator.hardwareConcurrency/ # Set CPU cores
    ├── navigator.languages/ # Set browser languages
    ├── navigator.permissions/ # Fix permission quirks
    ├── navigator.plugins/ # Mock plugins & mimeTypes
    ├── navigator.vendor/  # Set vendor string
    ├── navigator.webdriver/ # Remove automation flag
    ├── sourceurl/         # Strip puppeteer source markers
    ├── user-agent-override/ # Fix UA and platform
    ├── webgl.vendor/      # Spoof WebGL renderer
    └── window.outerdimensions/ # Fix window dimensions
```

### Lifecycle Hooks
1. **beforeLaunch** - Modify Chrome launch arguments
2. **onPageCreated** - Inject page-level evasions
3. **beforeConnect** - Handle browser.connect() scenarios

---

## Evasion Summary

### 1. Chrome API Mocking

#### chrome.app
- **Problem:** Missing `window.chrome.app` in headless
- **Solution:** Create object with `isInstalled`, `getDetails()`, `getIsInstalled()`, `runningState()`
- **Data:** Static JSON with InstallState, RunningState enums

#### chrome.csi
- **Problem:** Missing `window.chrome.csi()` timing API
- **Solution:** Implement using Performance Timing API
- **Returns:** `{ onloadT, startE, pageT, tran: 15 }`

#### chrome.loadTimes
- **Problem:** Missing `window.chrome.loadTimes()` 
- **Solution:** Full implementation with timing + connection info
- **Returns:** Request timing, paint timing, connection protocol info

#### chrome.runtime
- **Problem:** Missing/incorrect `window.chrome.runtime`
- **Solution:** Full mock with static data + `sendMessage`/`connect` proxies
- **Validation:** Proper error messages for invalid extension IDs

---

### 2. Navigator Property Fixes

#### navigator.webdriver
- **Problem:** `navigator.webdriver === true` in automation
- **Solution:** 
  - Delete from Navigator prototype (pre-Chrome 88)
  - Add `--disable-blink-features=AutomationControlled` flag (post-Chrome 88)

#### navigator.plugins & mimeTypes
- **Problem:** Empty arrays in headless
- **Solution:** Full functional mock with:
  - 3 plugins: Chrome PDF Plugin, Chrome PDF Viewer, Native Client
  - 4 mimeTypes: PDF, Google Chrome PDF, NaCl, PNaCl
  - Working `item()`, `namedItem()`, `refresh()` methods
  - Proper cross-references between plugins and mimeTypes

#### navigator.languages
- **Problem:** Empty or wrong language array
- **Solution:** Set `['en-US', 'en']` with `Object.freeze()`

#### navigator.vendor
- **Problem:** Incorrect vendor string
- **Solution:** Set to `"Google Inc."` via getter proxy

#### navigator.hardwareConcurrency
- **Problem:** Odd/unusual CPU core count
- **Solution:** Set to 4 (configurable) via getter proxy

#### navigator.permissions
- **Problem:** Notification.permission inconsistencies
- **Solution:** 
  - Secure origins: Return `'default'` instead of `'denied'`
  - Insecure origins: Fix `Permissions.query()` response

---

### 3. Window/DOM Fixes

#### window.outerWidth/outerHeight
- **Problem:** Zero or missing in headless
- **Solution:** Set `outerWidth = innerWidth`, `outerHeight = innerHeight + 85`

#### iframe.contentWindow
- **Problem:** srcdoc iframes expose fresh window without evasions
- **Solution:** Proxy `contentWindow` getter, intercept `createElement('iframe')`
- **Handles:** `.self`, `.frameElement`, indexed access

---

### 4. Media/Graphics Fixes

#### media.codecs
- **Problem:** Chromium doesn't support proprietary codecs
- **Solution:** Proxy `canPlayType()` to return:
  - `video/mp4; codecs="avc1.42E01E"` → `'probably'`
  - `audio/x-m4a` → `'maybe'`
  - `audio/aac` → `'probably'`

#### webgl.vendor
- **Problem:** "Google Inc." / "Google SwiftShader" in headless
- **Solution:** Proxy `getParameter()`:
  - `UNMASKED_VENDOR_WEBGL (37445)` → `'Intel Inc.'`
  - `UNMASKED_RENDERER_WEBGL (37446)` → `'Intel Iris OpenGL Engine'`

---

### 5. User Agent & Platform

#### user-agent-override
- **Problem:** "HeadlessChrome" in UA, wrong platform
- **Solution:** CDP `Network.setUserAgentOverride` with:
  - Strip "HeadlessChrome" from UA
  - Mask Linux as Windows (optional)
  - Set Accept-Language header
  - Full Client Hints metadata (brands, platform, architecture)

---

### 6. Launch Arguments

#### defaultArgs
- **Problem:** Puppeteer default args reveal automation
- **Solution:** Add to `ignoreDefaultArgs`:
  - `--disable-extensions`
  - `--disable-default-apps`
  - `--disable-component-extensions-with-background-pages`

---

### 7. Source Markers

#### sourceurl
- **Problem:** `__puppeteer_evaluation_script__` in stack traces
- **Solution:** Intercept CDP commands and strip sourceURL:
  - `Runtime.evaluate` → strip from `expression`
  - `Runtime.callFunctionOn` → strip from `functionDeclaration`

---

## Utility Functions

The plugin uses sophisticated utilities to avoid detection:

### Core Utilities

| Function | Purpose |
|----------|---------|
| `utils.stripProxyFromErrors` | Remove Proxy traces from error stacks |
| `utils.patchToString` | Make functions appear native |
| `utils.replaceWithProxy` | Replace property with stealth Proxy |
| `utils.preloadCache` | Cache original Reflect/toString before patching |
| `utils.makeNativeString` | Generate `function X() { [native code] }` |
| `utils.redirectToString` | Redirect toString calls between objects |

### Anti-Detection Patterns

1. **Cache native functions before patching:**
```javascript
utils.cache = {
    Reflect: { get: Reflect.get.bind(Reflect), apply: Reflect.apply.bind(Reflect) },
    nativeToStringStr: Function.toString + ''
}
```

2. **Strip Proxy from error stacks:**
```javascript
const stripWithAnchor = (stack, anchor) => {
    const anchorIndex = stackArr.findIndex(line => line.trim().startsWith(anchor))
    stackArr.splice(1, anchorIndex)
    return stackArr.join('\n')
}
```

3. **Make proxied functions appear native:**
```javascript
utils.makeNativeString = (name = '') => {
    return utils.cache.nativeToStringStr.replace('toString', name || '')
}
// Result: "function getParameter() { [native code] }"
```

---

## Detection Bypasses Achieved

| Detection Test | Before Stealth | After Stealth |
|----------------|----------------|---------------|
| bot.sannysoft.com | ❌ Multiple fails | ✅ All pass |
| fpscanner | ❌ 7-8 fails | ✅ 0-1 fails |
| areyouheadless | ❌ Detected | ✅ Not detected |
| intoli tests | ❌ Fails | ✅ Pass |
| reCAPTCHA v3 score | 0.1-0.3 | 0.7-0.9 |

---

## Configuration Options

```javascript
const stealth = require('puppeteer-extra-plugin-stealth')()

// Disable specific evasions
stealth.enabledEvasions.delete('chrome.app')
stealth.enabledEvasions.delete('navigator.webdriver')

// Configure specific evasions
const ua = require('puppeteer-extra-plugin-stealth/evasions/user-agent-override')({
    userAgent: 'Custom UA',
    locale: 'de-DE,de',
    maskLinux: false
})

const webgl = require('puppeteer-extra-plugin-stealth/evasions/webgl.vendor')({
    vendor: 'NVIDIA Corporation',
    renderer: 'NVIDIA GeForce GTX 1080'
})

puppeteer.use(stealth)
puppeteer.use(ua)
puppeteer.use(webgl)
```

---

## Known Limitations

1. **Cannot hide all CDP traces** - Some detection methods work at network/TLS level
2. **Behavioral detection** - Mouse movements, timing patterns not addressed
3. **Memory footprint** - Doesn't modify heap/memory usage patterns
4. **Performance timing** - Some timing-based detection still possible
5. **Extension context** - chrome.runtime behaves differently in extensions

---

## Files Summary

| File | Size | Purpose |
|------|------|---------|
| `index.js` | 4KB | Main plugin, loads all evasions |
| `evasions/_utils/index.js` | 15KB | Core utility functions |
| `evasions/navigator.plugins/*` | 10KB+ | Most complex evasion |
| `evasions/chrome.runtime/*` | 7KB | Full chrome.runtime mock |
| `evasions/user-agent-override/*` | 6KB | UA and Client Hints |
| Other evasions | 1-3KB each | Simpler fixes |

---

*Analysis based on puppeteer-extra-plugin-stealth source code*
*Date: January 28, 2026*
