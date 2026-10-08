/**
 * Passive Surface Probe
 *
 * Detects driving software that never touches the DOM and never needs the user
 * to do anything. Complements consoleLeakProbe.js; same origin-classification
 * idea, applied to API calls instead of console output.
 *
 * Premise: a controller that reads a page has to *read* it. Even when the tree
 * is captured over the debugger protocol, practical implementations still
 * evaluate small helper scripts into the page each cycle - to harvest iframe
 * scroll offsets, to enumerate candidates, to probe listeners. Those scripts
 * are evaluated, not loaded, so their stack frames can never resolve to a
 * first-party script URL: they appear as <anonymous>, VM<n>:<line> or eval.
 *
 * So we hook the query surface and classify the caller. Two properties make
 * this precise:
 *
 *   1. ORIGIN. First-party code has a real script URL. Injected code does not.
 *   2. SHAPE.  Whole-document enumeration - querySelectorAll('*') - and blanket
 *              iframe scans are rare in first-party code and routine in page
 *              readers. Recording the selector makes the signal near-unambiguous.
 *   3. CADENCE. A control loop repeats. Foreign calls arriving in evenly spaced
 *              bursts indicate a stepping process rather than a user.
 *
 * Nothing here depends on a log line, a DOM marker, an attribute, a flag, or on
 * the user clicking or typing. It fires while the page sits idle.
 *
 *   <script src="passiveSurfaceProbe.js"></script>
 *   ...
 *   const r = window.__psp.snapshot();
 *   r.fullDocumentEnumeration   // whole-DOM sweeps from injected code
 *   r.foreignCalls              // every foreign-origin call, with selector
 *   r.cadence                   // burst spacing, if periodic
 *
 * Never throws into the host page.
 */
(function installPassiveSurfaceProbe() {
  'use strict';
  if (typeof window === 'undefined' || window.__psp) return;

  var SELF = '__pspFrame_' + Math.random().toString(36).slice(2, 10);
  var OWN = /\b__pspW\b|\b__pspClassify\b/;

  var calls = [];            // foreign-origin calls
  var totals = {};           // api -> total call count (any origin)
  var listeners = [];
  var pageScripts = new Set();
  var docUrl = '';
  try { docUrl = String(location.href).split('#')[0]; } catch (e) {}

  function noteScript(s) {
    if (!s) return;
    try { pageScripts.add(new URL(s, docUrl).href.split('#')[0]); } catch (e) {}
  }
  function collectScripts() {
    try {
      var e = document.getElementsByTagName('script');
      for (var i = 0; i < e.length; i++) noteScript(e[i].src);
    } catch (x) {}
  }

  function stackFrames(st) {
    var out = [], l = String(st || '').split('\n');
    for (var i = 0; i < l.length; i++) {
      var t = l[i].trim();
      if (t.indexOf('at ') === 0 && !OWN.test(t)) out.push(t);
    }
    return out;
  }
  function frameLoc(f) {
    var m = /\(([^()]*)\)\s*$/.exec(f);
    return (m ? m[1] : f.replace(/^at\s+/, '')).trim();
  }
  function isForeign(L) {
    if (!L) return true;
    if (/^<anonymous>/.test(L) || /\bVM\d+:\d+/.test(L)) return true;
    if (/^eval\b/.test(L) || /\beval at\b/.test(L)) return true;
    if (/^(blob|data|about):/.test(L)) return true;
    if (/^(chrome|moz|safari|ms-browser)-extension:/.test(L)) return true;
    var m = /((?:https?|file):\/\/[^\s:]+(?::\d+)?[^\s:]*?)(?::\d+:\d+)?$/.exec(L);
    if (!m) return true;
    var u = m[1].split('#')[0];
    if (u === docUrl || pageScripts.has(u)) return false;
    try { if (new URL(u).origin === location.origin) return false; } catch (e) {}
    return true;
  }

  function __pspClassify(api, arg) {
    totals[api] = (totals[api] || 0) + 1;

    var st = ''; try { throw new Error(SELF); } catch (e) { st = e.stack || ''; }
    var fr = stackFrames(st);
    var first = fr.length ? frameLoc(fr[0]) : '';
    if (!isForeign(first)) return;

    var t = 0; try { t = performance.now(); } catch (e) {}
    var rec = {
      api: api,
      selector: typeof arg === 'string' ? arg.slice(0, 120) : null,
      frame: first,
      chain: fr.slice(0, 3),
      t: Math.round(t),
      wall: Date.now()
    };
    calls.push(rec);
    if (calls.length > 400) calls.shift();

    for (var i = 0; i < listeners.length; i++) {
      try { listeners[i](rec); } catch (e) {}
    }
    try { window.dispatchEvent(new CustomEvent('passiveSurfaceHit', { detail: rec })); } catch (e) {}
  }

  function hook(obj, name, label) {
    try {
      if (!obj || typeof obj[name] !== 'function') return;
      var orig = obj[name];
      var w = function __pspW(a) {
        try { __pspClassify(label, a); } catch (e) {}
        return orig.apply(this, arguments);
      };
      try {
        Object.defineProperty(w, 'toString',
          { value: function () { return 'function ' + name + '() { [native code] }'; } });
      } catch (e) {}
      obj[name] = w;
    } catch (e) {}
  }

  var E = Element.prototype, D = Document.prototype;
  hook(D, 'querySelectorAll', 'Document.querySelectorAll');
  hook(D, 'querySelector',    'Document.querySelector');
  hook(D, 'evaluate',         'Document.evaluate');
  hook(D, 'elementFromPoint',  'Document.elementFromPoint');
  hook(D, 'elementsFromPoint', 'Document.elementsFromPoint');
  hook(E, 'querySelectorAll', 'Element.querySelectorAll');
  hook(E, 'querySelector',    'Element.querySelector');
  hook(E, 'getBoundingClientRect', 'Element.getBoundingClientRect');
  hook(E, 'scrollIntoView',   'Element.scrollIntoView');
  hook(window, 'getComputedStyle', 'window.getComputedStyle');

  /* A DevTools-only symbol. If the controller probes for it *without* the
     command line API enabled, this getter fires. When the API is enabled the
     name is shadowed in the evaluation scope and this stays silent - so treat a
     hit as strong evidence and a miss as no information. */
  var cliProbe = 0;
  try {
    if (!(('getEventListeners') in window)) {
      Object.defineProperty(window, 'getEventListeners', {
        configurable: true,
        get: function () { cliProbe++; return undefined; }
      });
    }
  } catch (e) {}

  try {
    collectScripts();
    document.addEventListener('DOMContentLoaded', collectScripts);
    new MutationObserver(function (ms) {
      for (var i = 0; i < ms.length; i++) {
        var a = ms[i].addedNodes || [];
        for (var j = 0; j < a.length; j++) {
          if (a[j] && a[j].tagName === 'SCRIPT') noteScript(a[j].src);
        }
      }
    }).observe(document.documentElement, { childList: true, subtree: true });
  } catch (e) {}

  /* Group foreign calls into bursts and report spacing. A stepping control loop
     produces evenly spaced bursts; a human produces nothing at all. */
  function cadence() {
    if (calls.length < 4) return null;
    var bursts = [], cur = [calls[0]];
    for (var i = 1; i < calls.length; i++) {
      if (calls[i].t - calls[i - 1].t > 250) { bursts.push(cur); cur = []; }
      cur.push(calls[i]);
    }
    bursts.push(cur);
    if (bursts.length < 3) return null;
    var gaps = [];
    for (var k = 1; k < bursts.length; k++) gaps.push(bursts[k][0].t - bursts[k - 1][0].t);
    var mean = gaps.reduce(function (a, b) { return a + b; }, 0) / gaps.length;
    var sd = Math.sqrt(gaps.reduce(function (a, b) { return a + (b - mean) * (b - mean); }, 0) / gaps.length);
    return {
      bursts: bursts.length,
      callsPerBurst: Math.round(calls.length / bursts.length * 10) / 10,
      meanGapMs: Math.round(mean),
      sdMs: Math.round(sd),
      periodic: gaps.length >= 2 && sd < mean * 0.45
    };
  }

  window.__psp = {
    snapshot: function () {
      var full = calls.filter(function (c) { return c.selector === '*'; });
      var frames_ = calls.filter(function (c) {
        return c.selector && /^iframe\b/i.test(c.selector);
      });
      return {
        foreignCalls: calls.slice(),
        foreignCount: calls.length,
        fullDocumentEnumeration: full.length,
        iframeSweeps: frames_.length,
        distinctSelectors: Array.from(new Set(calls.map(function (c) { return c.selector; })
                                                   .filter(Boolean))),
        apiTotals: totals,
        commandLineApiProbes: cliProbe,
        cadence: cadence()
      };
    },
    onHit: function (cb) { if (typeof cb === 'function') listeners.push(cb); },
    reset: function () { calls.length = 0; }
  };
})();
