/**
 * Console Leak Probe
 *
 * Generic forensics for console output that does NOT originate from this
 * page's own scripts.
 *
 * Rationale: string-matching a known message is brittle - the emitter renames
 * it, gates it behind a flag, or drops it, and the signal dies silently. What
 * does not change is the *origin*. Anything evaluated into the page from
 * outside (debugger protocol evaluation, extension content script, injected
 * blob) produces stack frames that cannot look like a first-party script:
 * they have no page script URL, and appear as <anonymous>, VM<n>:<line>,
 * eval, blob:, data: or an extension scheme.
 *
 * So: hook every console method, classify the originating frame, and record
 * every foreign emission verbatim. No vendor list to maintain, no message
 * pattern to keep current. Classification happens offline on the captured
 * text, not here.
 *
 * Also records:
 *   - uncaught errors / rejections with the same origin classification
 *   - re-hooking of console methods after this probe installed
 *   - inter-arrival times, so periodic emissions (step loops) are visible
 *
 * Install as early as possible - anything emitted before this runs is lost.
 *
 *   <script src="consoleLeakProbe.js"></script>
 *   ...
 *   const report = window.__clp.snapshot();
 *
 * Never throws into the host page.
 */
(function installConsoleLeakProbe() {
  'use strict';
  if (typeof window === 'undefined' || window.__clp) return;

  var METHODS = ['log', 'info', 'warn', 'error', 'debug', 'trace', 'dir',
                 'table', 'group', 'groupCollapsed', 'assert', 'count', 'timeEnd'];

  // Unique token so we can drop our own frames when walking a stack.
  var SELF = '__clpFrame_' + Math.random().toString(36).slice(2, 10);

  var native = {};
  var wrappers = {};
  var records = [];
  var integrity = [];
  var listeners = [];
  var lastForeignTs = null;
  var pageScriptUrls = new Set();
  var docUrl = '';

  try { docUrl = String(location.href).split('#')[0]; } catch (e) {}

  function noteScript(src) {
    if (!src) return;
    try { pageScriptUrls.add(new URL(src, docUrl).href.split('#')[0]); } catch (e) {}
  }

  function collectScripts() {
    try {
      var els = document.getElementsByTagName('script');
      for (var i = 0; i < els.length; i++) noteScript(els[i].src);
    } catch (e) {}
  }

  /* ---------------------------------------------------------------- stacks */

  function parseFrames(stack) {
    if (!stack) return [];
    var out = [];
    var lines = String(stack).split('\n');
    for (var i = 0; i < lines.length; i++) {
      var l = lines[i].trim();
      if (!l || l.indexOf('at ') !== 0) continue;
      out.push(l);
    }
    return out;
  }

  // Pull the location token out of "at fn (LOC)" or "at LOC".
  function frameLocation(frame) {
    var m = /\(([^()]*)\)\s*$/.exec(frame);
    var loc = m ? m[1] : frame.replace(/^at\s+/, '');
    return loc.trim();
  }

  function isForeignLocation(loc) {
    if (!loc) return true;
    if (/^<anonymous>/.test(loc)) return true;
    if (/\bVM\d+:\d+/.test(loc)) return true;
    if (/^eval\b/.test(loc) || /\beval at\b/.test(loc)) return true;
    if (/^(blob|data):/.test(loc)) return true;
    if (/^(chrome|moz|safari|ms-browser)-extension:/.test(loc)) return true;
    if (/^about:/.test(loc)) return true;

    var urlMatch = /((?:https?|file):\/\/[^\s:]+(?::\d+)?[^\s:]*?)(?::\d+:\d+)?$/.exec(loc);
    if (!urlMatch) return true;                      // no resolvable origin at all
    var url = urlMatch[1].split('#')[0];
    if (url === docUrl) return false;                // inline page script
    if (pageScriptUrls.has(url)) return false;       // known first-party script
    // Same-origin but unseen: treat as first-party to keep precision high.
    try { if (new URL(url).origin === location.origin) return false; } catch (e) {}
    return true;
  }

  // Our own frames carry these function names. They must be dropped before
  // classifying, otherwise every emission looks first-party (this probe lives
  // at a page URL) and nothing is ever reported.
  var OWN_FRAME = /\b__clpW\b|\b__clpR\b/;

  function classify(stack) {
    var frames = parseFrames(stack).filter(function (f) {
      return f.indexOf(SELF) === -1 && !OWN_FRAME.test(f);
    });
    var first = frames.length ? frameLocation(frames[0]) : '';
    return {
      firstFrame: first,
      foreign: isForeignLocation(first),
      depth: frames.length,
      frames: frames.slice(0, 6)
    };
  }

  /* --------------------------------------------------------------- capture */

  function describe(a) {
    try {
      if (typeof a === 'string') return a;
      if (a instanceof Error) return a.name + ': ' + a.message;
      if (a && typeof a === 'object') {
        if (a.nodeType === 1) return '<' + a.tagName.toLowerCase() + '>';
        return JSON.stringify(a);
      }
      return String(a);
    } catch (e) { return '[unserialisable]'; }
  }

  function emit(rec) {
    records.push(rec);
    if (records.length > 500) records.shift();
    for (var i = 0; i < listeners.length; i++) {
      try { listeners[i](rec); } catch (e) {}
    }
    try {
      window.dispatchEvent(new CustomEvent('consoleLeak', { detail: rec }));
    } catch (e) {}
  }

  function __clpR(method, args) {
    var stack = '';
    try { throw new Error(SELF); } catch (e) { stack = e.stack || ''; }
    var org = classify(stack);
    if (!org.foreign) return;

    var now = 0;
    try { now = performance.now(); } catch (e) {}
    var gap = lastForeignTs === null ? null : Math.round(now - lastForeignTs);
    lastForeignTs = now;

    emit({
      method: method,
      text: Array.prototype.map.call(args, describe).join(' '),
      argTypes: Array.prototype.map.call(args, function (a) { return typeof a; }),
      argCount: args.length,
      firstFrame: org.firstFrame,
      frames: org.frames,
      sincePreviousMs: gap,
      tRelative: Math.round(now),
      tWall: Date.now(),
      readyState: (function () { try { return document.readyState; } catch (e) { return '?'; } })()
    });
  }

  METHODS.forEach(function (m) {
    if (typeof console === 'undefined' || typeof console[m] !== 'function') return;
    native[m] = console[m];
    // Named so classify() can drop our own frames. Do NOT rename to `m` -
    // that hides the frame and breaks origin classification.
    var w = function __clpW() {
      try { __clpR(m, arguments); } catch (e) {}
      return native[m].apply(console, arguments);
    };
    // toString still reports native code, which is what integrity checks probe
    try {
      Object.defineProperty(w, 'toString', {
        value: function () { return 'function ' + m + '() { [native code] }'; }
      });
    } catch (e) {}
    w[SELF] = true;
    wrappers[m] = w;
    console[m] = w;
  });

  /* ------------------------------------------------- errors and rejections */

  try {
    window.addEventListener('error', function (ev) {
      var loc = ev && ev.filename ? ev.filename : '';
      if (!loc || isForeignLocation(loc)) {
        emit({ method: 'uncaught-error', text: (ev && ev.message) || '',
               firstFrame: loc || '<none>', frames: [], sincePreviousMs: null,
               tRelative: 0, tWall: Date.now(), readyState: 'n/a' });
      }
    }, true);
    window.addEventListener('unhandledrejection', function (ev) {
      emit({ method: 'unhandled-rejection', text: describe(ev && ev.reason),
             firstFrame: '<promise>', frames: [], sincePreviousMs: null,
             tRelative: 0, tWall: Date.now(), readyState: 'n/a' });
    }, true);
  } catch (e) {}

  /* ------------------------------------------------------------- integrity */

  function checkIntegrity() {
    METHODS.forEach(function (m) {
      if (!wrappers[m]) return;
      if (console[m] !== wrappers[m] && !integrity.some(function (r) { return r.method === m; })) {
        integrity.push({
          method: m,
          at: Date.now(),
          replacementSource: (function () {
            try { return String(console[m]).slice(0, 160); } catch (e) { return '?'; }
          })()
        });
      }
    });
  }

  try {
    collectScripts();
    new MutationObserver(function (muts) {
      for (var i = 0; i < muts.length; i++) {
        var added = muts[i].addedNodes || [];
        for (var j = 0; j < added.length; j++) {
          if (added[j] && added[j].tagName === 'SCRIPT') noteScript(added[j].src);
        }
      }
    }).observe(document.documentElement, { childList: true, subtree: true });
  } catch (e) {}

  try {
    document.addEventListener('DOMContentLoaded', collectScripts);
    setInterval(checkIntegrity, 1000);
  } catch (e) {}

  /* ----------------------------------------------------------------- api */

  window.__clp = {
    snapshot: function () {
      checkIntegrity();
      var gaps = records.map(function (r) { return r.sincePreviousMs; })
                        .filter(function (g) { return typeof g === 'number'; });
      return {
        foreignEmissions: records.slice(),
        count: records.length,
        distinctTexts: Array.from(new Set(records.map(function (r) { return r.text; }))),
        interArrivalMs: gaps,
        consoleReplacedAfterInstall: integrity.slice(),
        knownPageScripts: Array.from(pageScriptUrls),
        documentUrl: docUrl
      };
    },
    onLeak: function (cb) { if (typeof cb === 'function') listeners.push(cb); },
    reset: function () { records.length = 0; lastForeignTs = null; },
    nativeConsole: native
  };

  // Other modules may want the untouched methods rather than flagging these
  // wrappers as tampering.
  if (!window.__nativeConsoleMethods) window.__nativeConsoleMethods = native;
})();
