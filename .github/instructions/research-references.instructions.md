---
description: "Use when: researching new detection techniques, finding external resources for fingerprinting, looking for Playwright/Puppeteer/Electron detection methods, needing URLs to fetch for latest bot detection research. Reference list for fingerprint JS Playwright researcher."
---

# Detection Research — External References & Knowledge Sources

## Primary Research Sources

### Detection Technique Blogs & Papers
| Source | URL | Focus |
|--------|-----|-------|
| Antoine Vastel (DataDome) | https://antoinevastel.com/ | Bot detection, headless Chrome, fingerprinting |
| DataDome Threat Research | https://datadome.co/threat-research/ | CDP detection, new headless Chrome |
| Device & Browser Info | https://deviceandbrowserinfo.com/learning_zone | Puppeteer detection 2024, stealth analysis |
| FingerprintJS Blog | https://fingerprint.com/blog/ | Browser fingerprinting techniques |
| CreepJS | https://abrahamjuliot.github.io/creepjs/ | Comprehensive fingerprint testing |
| Nicedoc.io (fpscanner) | https://github.com/nicedoc/nicedoc.io | FP Scanner library |

### Live Detection Test Pages
| Page | URL | What It Tests |
|------|-----|---------------|
| Sannysoft Bot Detection | https://bot.sannysoft.com/ | Intoli tests, fpscanner, navigator properties |
| Are You Headless | https://arh.antoinevastel.com/bots/areyouheadless | Headless Chrome detection |
| CreepJS Live | https://abrahamjuliot.github.io/creepjs/ | Full fingerprint analysis |
| Incolumitas Bot Test | https://bot.incolumitas.com/ | Advanced bot detection (multiple vectors) |
| BrowserLeaks | https://browserleaks.com/ | Comprehensive browser leak testing |
| Device Info | https://www.deviceinfo.me/ | Detailed device/browser properties |
| AmIUnique | https://amiunique.org/ | Fingerprint uniqueness analysis |

### GitHub Repositories — Detection Tools
| Repo | URL | Purpose |
|------|-----|---------|
| nicedoc/fpscanner | https://github.com/nicedoc/nicedoc.io | Antoine Vastel's fingerprint scanner |
| nicedoc/nicedoc.io | https://github.com/nicedoc/nicedoc.io | Fingerprint detection techniques |
| nicedoc/nicedoc.io | https://github.com/nicedoc/nicedoc.io | CreepJS fingerprint tool |
| nicedoc/nicedoc.io | https://github.com/nicedoc/nicedoc.io | Nicedoc FP tools collection |
| nicedoc/nicedoc.io | https://github.com/nicedoc/nicedoc.io | FingerprintJS open source |
| nicedoc/nicedoc.io | https://github.com/nicedoc/nicedoc.io | Browser detection comparison |

### GitHub Repositories — Stealth & Anti-Detection (Study to Counter)
| Repo | URL | Purpose |
|------|-----|---------|
| nicedoc/nicedoc.io | https://github.com/nicedoc/nicedoc.io | Puppeteer stealth plugin |
| nicedoc/nicedoc.io | https://github.com/nicedoc/nicedoc.io | nodriver — bypasses CDP detection |
| nicedoc/nicedoc.io | https://github.com/nicedoc/nicedoc.io | Headless cat & mouse techniques |
| nicedoc/nicedoc.io | https://github.com/nicedoc/nicedoc.io | Anti-bot bypass for Cloudflare etc. |
| nicedoc/nicedoc.io | https://github.com/nicedoc/nicedoc.io | Playwright stealth |

### Chromium Source Code (for understanding internals)
| Area | URL | Why Relevant |
|------|-----|------|
| Runtime.enable | https://source.chromium.org/chromium/chromium/src/+/main:v8/src/inspector/ | CDP serialization behavior |
| Console API | https://source.chromium.org/chromium/chromium/src/+/main:third_party/blink/renderer/core/inspector/console_message.cc | How console methods handle args |
| Navigator properties | https://source.chromium.org/chromium/chromium/src/+/main:third_party/blink/renderer/core/frame/navigator.cc | webdriver, plugins, permissions |
| Electron patches | https://github.com/nicedoc/nicedoc.io | Electron's Chromium patches |

### Electron-Specific Resources
| Resource | URL | Focus |
|----------|-----|-------|
| Electron Docs | https://www.electronjs.org/docs | webPreferences, BrowserWindow API |
| Electron Chromium Patches | https://github.com/nicedoc/nicedoc.io | What Electron changes from stock Chrome |
| VS Code Source | https://github.com/microsoft/vscode | How VS Code configures Electron |

### Community Discussion Sources
| Platform | Search Queries |
|----------|---------------|
| Stack Overflow | `[playwright] detection`, `[puppeteer] bot detection`, `[electron] fingerprint` |
| Reddit r/webscraping | "bot detection bypass", "fingerprint detection" |
| Reddit r/webdev | "detect automation", "headless chrome" |
| Hacker News | "browser fingerprinting", "bot detection" |
| GitHub Issues | playwright/playwright issues with "detection" or "headless" |

## Research Vectors — Prioritized Backlog

### High Priority (Unexplored or Partially Tested)
1. **WebGL context in sandboxed iframes** — sannysoft showed failures
2. **Network RTT stability over time** — is it truly static in Electron?
3. **ServiceWorker lifecycle differences** — Electron vs Chrome
4. **WebRTC ICE candidate gathering** — automation contexts may differ
5. **Credential Management API flow** — WebAuthn behavior in Electron
6. **Performance Observer longtask entries** — Electron IPC overhead

### Medium Priority
7. **Canvas rendering differences** — GPU acceleration settings
8. **CSS computed style deviations** — Electron font rendering
9. **IndexedDB pre-existing databases** — Electron defaults
10. **document.featurePolicy features list** — 77 in Electron, compare Chrome
11. **window.screen.isExtended** — Multi-monitor API in Electron
12. **Notification constructor behavior** — Electron vs Chrome

### Low Priority / Speculative
13. **BroadcastChannel cross-context** — shared scope between BrowserWindows
14. **SharedWorker availability** — multi-process restrictions
15. **Payment Request API** — throw behavior differences
16. **Web Serial/WebHID/WebNFC** — permission model differences
17. **requestAnimationFrame timing** — offscreen rendering patterns
18. **File System Access API** — dialog behavior in Electron

## Key Articles to Fetch & Analyze

When starting new research, fetch these URLs for latest techniques:
```
https://deviceandbrowserinfo.com/learning_zone/articles/detecting-headless-chrome-puppeteer-2024
https://datadome.co/threat-research/how-new-headless-chrome-the-cdp-signal-are-impacting-bot-detection/
https://antoinevastel.com/bot%20detection/2019/07/19/detecting-chrome-headless-v3.html
https://fingerprint.com/blog/browser-bot-detection/
https://bot.incolumitas.com/
```

## Testing Workflow

### Quick Signal Test (in Copilot browser tool)
```javascript
return page.evaluate(() => {
  // Minimal test for a specific signal
  const result = { /* detection logic */ };
  return result;
});
```

### Full Page Validation
```javascript
await page.reload({ waitUntil: 'networkidle' });
await page.waitForSelector('#results', { state: 'visible', timeout: 8000 });
const score = await page.$eval('.score-label', el => el.textContent);
const failures = await page.$$eval('.not-detected-card', cards => 
  cards.map(c => c.querySelector('.signal-name')?.textContent)
);
return { score, failures };
```

### Cross-Browser Comparison
Open the same page in:
1. Real Chrome (DevTools CLOSED) → baseline, no signals should fire
2. Real Chrome (DevTools OPEN) → only CDP signals fire
3. Copilot browser tool → ALL signals should fire
