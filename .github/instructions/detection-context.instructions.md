---
description: "Use when: working on browser fingerprinting, automation detection, Playwright/Puppeteer detection, Electron detection, CDP analysis, or any file in this repository. Provides domain context about the detection research project."
applyTo: ["**/*.html", "**/*.js", "*.md"]
---

# Browser Fingerprinting & Automation Detection — Project Context

## Project Goal
Detect VS Code Copilot's embedded Playwright browser tool from inline page JavaScript, distinguishing it from genuine Chrome browsers with zero false positives on real users.

## Architecture
- **Target**: Electron 39.8.7 + Chrome 142 + Playwright CDP control
- **Detection page**: `copilot-detector.html` — standalone, zero dependencies
- **Knowledge base**: `COPILOT_DETECTION_RESEARCH.md`

## Key Technical Facts

### CDP Detection Mechanism
- `Runtime.enable` makes V8 serialize all console args → triggers Proxy traps
- `console.groupEnd(proxyObj)` is ideal because spec says it ignores args
- Proxy `ownKeys` fires 2x per console call with CDP active, 0x without
- **Also fires with Chrome DevTools open** (same CDP mechanism)

### Electron Fingerprint
- `window.chrome` exists but has 0 own properties (no runtime, app, loadTimes, csi)
- UA contains `Code/` and `Electron/`
- `navigator.userAgentData.brands` has only 2 entries (no "Google Chrome")
- `navigator.plugins.length === 0` and `pdfViewerEnabled === false`
- Permissions: notifications="granted", all others="denied", never "prompt"
- `maxTouchPoints > 0` but `ontouchstart` NOT in window (on touch hardware)

### Confirmed False Positives (DO NOT USE)
- `OfflineAudioContext.destination.maxChannelCount === 1` (spec mandates 1 always)
- `Error.prepareStackTrace !== undefined` (extensions set this)
- Stack trace containing "UtilityScript" (only from page.evaluate, not inline)
- Self-triggering monkey-patch tests
- `navigator.webdriver === true` (Copilot sets it false)

## External Resources for Research
See the references instruction file for a curated list of detection research sources.
