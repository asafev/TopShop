/*
 * Chrome GLIC selection overlay detector.
 *
 * The normal web page and chrome-untrusted://glic/ run in separate renderer
 * worlds. As a result, most page-only probes are diagnostic rather than strong
 * detection signals. Strong detection generally requires either execution in
 * the GLIC WebUI target itself or an extension with chrome.debugger access.
 */

(function initGlicDetector(global) {
  'use strict';

  const SIGNAL_WEIGHTS = {
    HIGH: 3,
    MEDIUM: 2,
    LOW: 1,
  };

  const GLIC_URL_RE = /^chrome-untrusted:\/\/glic(?:\/|$)/i;
  const GEMINI_URL_RE = /^https:\/\/gemini\.google\.com\/app(?:[/?#]|$)/i;

  function toPlainError(error) {
    if (!error) {
      return String(error);
    }
    return {
      name: error.name,
      message: error.message,
      code: error.code,
    };
  }

  function addSignal(state, confidence, label, detail) {
    state.signals.push(label);
    state.score += SIGNAL_WEIGHTS[confidence] || 0;
    state.signalDetails.push({ confidence, label, detail });
  }

  async function runProbe(state, name, fn) {
    try {
      state.raw[name] = await fn();
    } catch (error) {
      state.raw[name] = { error: toPlainError(error) };
    }
  }

  function getConfidence(score) {
    if (score >= 3) {
      return 'HIGH';
    }
    if (score >= 2) {
      return 'MEDIUM';
    }
    if (score >= 1) {
      return 'LOW';
    }
    return 'LOW';
  }

  function inspectCustomElements(state) {
    const names = [
      'selection-overlay-app',
      'glic-selection-overlay',
      'region-selection',
      'post-selection-renderer',
      'overlay-border-glow',
      'overlay-shimmer-canvas',
    ];
    const found = [];

    if (!global.customElements) {
      return { supported: false, found };
    }

    for (const name of names) {
      const ctor = global.customElements.get(name);
      if (ctor) {
        found.push({ name, constructorName: ctor.name || null });
      }
    }

    if (found.some(item => item.name === 'selection-overlay-app' || item.name === 'glic-selection-overlay')) {
      addSignal(
        state,
        'HIGH',
        'GLIC custom elements are registered in this JavaScript realm',
        found,
      );
    }

    return { supported: true, found };
  }

  function inspectDomMarkers(state) {
    const selectors = [
      'selection-overlay-app',
      'glic-selection-overlay',
      '#selectionOverlay',
      '#backgroundImageCanvas',
      '#selectionElements',
      '#postSelectionRenderer',
      '#regionSelectionLayer',
      '#overlayShimmerCanvas',
      '#overlayBorderGlow',
    ];
    const found = [];

    for (const selector of selectors) {
      const count = document.querySelectorAll(selector).length;
      if (count) {
        found.push({ selector, count });
      }
    }

    if (found.some(item => item.selector === 'selection-overlay-app' || item.selector === 'glic-selection-overlay')) {
      addSignal(state, 'HIGH', 'GLIC overlay DOM exists in this document', found);
    }

    return { found };
  }

  function inspectLocation(state) {
    const href = String(global.location && global.location.href || '');
    const origin = String(global.location && global.location.origin || '');
    const isGlicRealm = GLIC_URL_RE.test(href);
    const isGeminiApp = GEMINI_URL_RE.test(href);

    if (isGlicRealm) {
      addSignal(state, 'HIGH', 'Current realm URL is chrome-untrusted://glic', { href });
    }

    if (isGeminiApp) {
      addSignal(state, 'MEDIUM', 'Current realm is the Gemini app URL used by the GLIC side panel', { href });
    }

    return { href, origin, isGlicRealm, isGeminiApp };
  }

  function inspectMojoSurface(state) {
    const mojo = global.mojo;
    const hasMojoBindings = Boolean(
      mojo && mojo.internal && mojo.internal.interfaceSupport && mojo.internal.Struct,
    );
    const interfaceHints = [];

    for (const key of Object.getOwnPropertyNames(global)) {
      if (/SelectionOverlay(Page|PageHandler|PageHandlerFactory)/.test(key)) {
        interfaceHints.push(key);
      }
    }

    if (hasMojoBindings && GLIC_URL_RE.test(String(global.location && global.location.href || ''))) {
      addSignal(state, 'HIGH', 'Mojo bindings are present inside the GLIC WebUI realm', { interfaceHints });
    }

    return { hasMojoGlobal: Boolean(mojo), hasMojoBindings, interfaceHints };
  }

  function inspectWindowGlobals(state) {
    const detectorOwnedGlobals = new Set(['runGlicDetection']);
    const names = Object.getOwnPropertyNames(global);
    const suspiciousNames = names.filter(name => (
      /glic|gemini|selectionoverlay|selection_overlay/i.test(name) && !detectorOwnedGlobals.has(name)
    ));
    const chromeNames = global.chrome ? Object.getOwnPropertyNames(global.chrome) : [];
    const hasChromeWebview = Boolean(global.chrome && global.chrome.webview);

    if (hasChromeWebview && GLIC_URL_RE.test(String(global.location && global.location.href || ''))) {
      addSignal(state, 'MEDIUM', 'chrome.webview-like API is present in a GLIC realm', chromeNames);
    }

    return {
      suspiciousNames,
      ignoredDetectorGlobals: names.filter(name => detectorOwnedGlobals.has(name)),
      chromeNames,
      hasChromeWebview,
      note: 'GLIC-like page globals are diagnostic only. The detector ignores its own runGlicDetection global and does not treat arbitrary names as detection.',
    };
  }

  function inspectCssPaintSurface() {
    const supportsPaintApi = Boolean(global.CSS && CSS.paintWorklet && CSS.supports);
    const supportsPostSelectionPaint = Boolean(
      global.CSS && CSS.supports && CSS.supports('background-image', 'paint(post-selection)'),
    );
    const element = document.createElement('div');
    element.style.cssText = [
      'position:fixed',
      'left:-1px',
      'top:-1px',
      'width:1px',
      'height:1px',
      'pointer-events:none',
      'background-image:paint(post-selection)',
      '--post-selection-corner-horizontal-length:12px',
      '--post-selection-corner-vertical-length:12px',
      '--post-selection-corner-radius:4px',
      '--post-selection-corner-width:2px',
      '--post-selection-show-gradient:1',
    ].join(';');
    document.documentElement.appendChild(element);
    const inlineBackgroundImage = element.style.backgroundImage;
    const computedBackgroundImage = getComputedStyle(element).backgroundImage;
    element.remove();

    return {
      supportsPaintApi,
      supportsPostSelectionPaint,
      inlineBackgroundImage,
      computedBackgroundImage,
      note: 'post-selection is a per-document paint worklet name; support here is not proof that GLIC registered it elsewhere.',
    };
  }

  function inspectCssVariableLeak(state) {
    const names = [
      '--cursor-img-url',
      '--color-scrim',
      '--color-scrim-rgb',
      '--color-primary',
      '--color-selection-element',
      '--overlay-border-glow-color-1',
      '--overlay-border-glow-color-2',
      '--overlay-border-glow-color-3',
      '--overlay-border-glow-color-4',
      '--post-selection-corner-horizontal-length',
      '--post-selection-corner-vertical-length',
      '--post-selection-corner-radius',
      '--post-selection-corner-width',
      '--post-selection-show-gradient',
    ];
    const roots = [document.documentElement, document.body].filter(Boolean);
    const found = [];

    for (const root of roots) {
      const styles = getComputedStyle(root);
      for (const name of names) {
        const value = styles.getPropertyValue(name).trim();
        if (value) {
          found.push({ node: root.tagName, name, value });
        }
      }
    }

    if (found.length && GLIC_URL_RE.test(String(global.location && global.location.href || ''))) {
      addSignal(state, 'MEDIUM', 'GLIC overlay CSS custom properties are visible in this realm', found);
    }

    return { found };
  }

  function inspectFocusAndVisibility(state) {
    const result = {
      hasFocus: typeof document.hasFocus === 'function' ? document.hasFocus() : null,
      visibilityState: document.visibilityState,
      hidden: document.hidden,
      activeElement: document.activeElement ? document.activeElement.tagName : null,
      userActivation: global.navigator && global.navigator.userActivation ? {
        isActive: navigator.userActivation.isActive,
        hasBeenActive: navigator.userActivation.hasBeenActive,
      } : null,
    };

    if (result.visibilityState === 'visible' && result.hasFocus === false && result.userActivation && result.userActivation.isActive) {
      addSignal(
        state,
        'LOW',
        'Visible document lost focus during active user gesture; overlay or browser UI may own input',
        result,
      );
    }

    return result;
  }

  function inspectSelectionState() {
    const selection = global.getSelection ? global.getSelection() : null;
    return {
      supported: Boolean(selection),
      type: selection ? selection.type : null,
      rangeCount: selection ? selection.rangeCount : null,
      textLength: selection ? String(selection).length : null,
      anchorNodeName: selection && selection.anchorNode ? selection.anchorNode.nodeName : null,
      focusNodeName: selection && selection.focusNode ? selection.focusNode.nodeName : null,
      note: 'GLIC selection reading happens outside the page realm; page monkey patches cannot observe it.',
    };
  }

  function inspectHitTestSnapshot() {
    const points = [
      [Math.floor(global.innerWidth / 2), Math.floor(global.innerHeight / 2)],
      [8, 8],
      [Math.max(0, global.innerWidth - 8), 8],
      [8, Math.max(0, global.innerHeight - 8)],
    ];
    const samples = [];

    for (const [x, y] of points) {
      const element = document.elementFromPoint(x, y);
      samples.push({
        x,
        y,
        tagName: element ? element.tagName : null,
        id: element ? element.id || null : null,
        className: element && typeof element.className === 'string' ? element.className : null,
      });
    }

    return {
      samples,
      note: 'A native compositor overlay should not appear in elementFromPoint(); event occlusion requires a real user event to observe.',
    };
  }

  function describeStyleSheet(sheet) {
    const result = {
      disabled: sheet.disabled,
      href: sheet.href || null,
      ruleCount: null,
      ruleSample: [],
      error: null,
    };

    try {
      result.ruleCount = sheet.cssRules.length;
      result.ruleSample = Array.from(sheet.cssRules).slice(0, 8).map(rule => rule.cssText.slice(0, 220));
    } catch (error) {
      result.error = toPlainError(error);
    }

    return result;
  }

  function inspectAdoptedStyleSheets(state) {
    const documentSheets = Array.from(document.adoptedStyleSheets || []).map(describeStyleSheet);
    const shadowHosts = [];

    for (const element of document.querySelectorAll('*')) {
      if (!element.shadowRoot) {
        continue;
      }

      const sheets = Array.from(element.shadowRoot.adoptedStyleSheets || []).map(describeStyleSheet);
      shadowHosts.push({
        tagName: element.tagName,
        id: element.id || null,
        className: typeof element.className === 'string' ? element.className : null,
        sheetCount: sheets.length,
        sheets,
      });
    }

    const combinedText = JSON.stringify({ documentSheets, shadowHosts });
    const hasGlicCss = /google-blue|selectionOverlay|selection-corners|post-selection|glic-selection/i.test(combinedText);

    if (GLIC_URL_RE.test(String(global.location && global.location.href || '')) && hasGlicCss) {
      addSignal(state, 'HIGH', 'GLIC adoptedStyleSheets are visible in this realm', {
        documentSheetCount: documentSheets.length,
        shadowHostCount: shadowHosts.length,
      });
    }

    return {
      documentSheetCount: documentSheets.length,
      documentSheets,
      shadowHostCount: shadowHosts.length,
      shadowHosts,
      hasGlicCss,
      note: 'DevTools #adopted-style-sheets reflects constructed stylesheets in the inspected document/shadow root. Normal pages cannot read the GLIC document adoptedStyleSheets.',
    };
  }

  async function inspectExtensionDebuggerTargets(state) {
    const chromeObject = global.chrome;
    if (!chromeObject || !chromeObject.debugger || typeof chromeObject.debugger.getTargets !== 'function') {
      return { available: false };
    }

    const targets = await new Promise(resolve => {
      try {
        chromeObject.debugger.getTargets(resolve);
      } catch (error) {
        resolve({ error: toPlainError(error) });
      }
    });

    if (!Array.isArray(targets)) {
      return { available: true, targets };
    }

    const matches = targets
      .filter(target => GLIC_URL_RE.test(String(target.url || '')) || GEMINI_URL_RE.test(String(target.url || '')))
      .map(target => ({
        id: target.id,
        type: target.type,
        title: target.title,
        url: target.url,
        attached: target.attached,
      }));

    if (matches.some(target => GLIC_URL_RE.test(String(target.url || '')))) {
      addSignal(state, 'HIGH', 'chrome.debugger target list contains chrome-untrusted://glic', matches);
    } else if (matches.length) {
      addSignal(state, 'MEDIUM', 'chrome.debugger target list contains Gemini app target', matches);
    }

    return { available: true, matchCount: matches.length, matches };
  }

  async function runGlicDetection() {
    const state = {
      score: 0,
      signals: [],
      signalDetails: [],
      raw: {},
    };

    // selection_overlay_app.js / glic_selection_overlay.js: WebUI-only custom elements.
    await runProbe(state, 'customElements', () => inspectCustomElements(state));

    // glic_selection_overlay.html.js: overlay DOM marker names if running inside the WebUI document.
    await runProbe(state, 'domMarkers', () => inspectDomMarkers(state));

    // chrome-untrusted://glic/ architecture: direct realm identification.
    await runProbe(state, 'location', () => inspectLocation(state));

    // selection_overlay.mojom-webui.js: Mojo binding globals visible only in privileged WebUI-style realms.
    await runProbe(state, 'mojoSurface', () => inspectMojoSurface(state));

    // browser_proxy.js and generated bindings: accidental globals / chrome.* surface checks.
    await runProbe(state, 'windowGlobals', () => inspectWindowGlobals(state));

    // post_selection_paint_worklet.js: CSS Paint API and the registered paint name "post-selection".
    await runProbe(state, 'cssPaint', inspectCssPaintSurface);

    // glic_selection_overlay.css.js / post_selection_paint_worklet.js: custom property leakage check.
    await runProbe(state, 'cssVariables', () => inspectCssVariableLeak(state));

    // Native overlay input ownership: focus and visibility are weak ambient indicators only.
    await runProbe(state, 'focusVisibility', () => inspectFocusAndVisibility(state));

    // Selection API: snapshot only; page monkey patches cannot observe isolated-realm reads.
    await runProbe(state, 'selectionState', inspectSelectionState);

    // Compositor-layer model: page hit testing should continue to return page DOM, never overlay DOM.
    await runProbe(state, 'hitTestSnapshot', inspectHitTestSnapshot);

    // DevTools #adopted-style-sheets: useful only in the current document or open shadow roots.
    await runProbe(state, 'adoptedStyleSheets', () => inspectAdoptedStyleSheets(state));

    // Extension-only nuclear option: chrome.debugger target enumeration.
    await runProbe(state, 'extensionDebuggerTargets', () => inspectExtensionDebuggerTargets(state));

    return {
      detected: state.signals.length > 0,
      confidence: state.signals.length > 0 ? getConfidence(state.score) : 'LOW',
      signals: state.signals,
      raw: {
        ...state.raw,
        signalDetails: state.signalDetails,
        score: state.score,
      },
    };
  }

  global.runGlicDetection = runGlicDetection;

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = { runGlicDetection };
  }
})(typeof globalThis !== 'undefined' ? globalThis : window);