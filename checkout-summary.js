// checkout-summary.js — Builds and displays the order summary view

var _report = (function() {

  // Collect visible labels from prompt fieldSpecs (for BE traceability)
  function _collectFieldLabels(promptEntry) {
    var labels = {};
    if (promptEntry.fieldSpecs) {
      for (var i = 0; i < promptEntry.fieldSpecs.length; i++) {
        var spec = promptEntry.fieldSpecs[i];
        if (spec.label) labels[spec.id] = spec.label;
      }
    }
    // Fallback: read rendered label elements from DOM
    if (!Object.keys(labels).length) {
      var els = document.querySelectorAll('.pform-label');
      for (var j = 0; j < els.length; j++) {
        var forEl = els[j].nextElementSibling;
        var id = forEl ? (forEl.id || '') : '';
        if (id && els[j].textContent) labels[id] = els[j].textContent.trim();
      }
    }
    return labels;
  }

  function build(promptType, promptEntry, responseText) {
    var parsed = null;
    var isValid = false;
    try { parsed = JSON.parse(responseText); isValid = true; } catch(e) {}

    var session = _ux.snapshot();
    var mutations = _mut.report();

    // Collect task field change history
    var isPlainText = !!(promptEntry.isFormBased);
    var taskFieldName = promptEntry.taskField || 'task';
    var taskChanges = _mut.fieldHistory(taskFieldName, isPlainText);

    // ---- Compute signals from snapshot data (raw measurements, no verdicts) ----
    var signals = _buildSignals(session);

    return {
      _version: '1.3',
      promptType: promptType,
      promptId: promptEntry.id,
      promptMeta: promptEntry.meta ? promptEntry.meta(parsed, session) : undefined,
      promptConfig: {
        title: promptEntry.title || '',
        desc: promptEntry.desc || '',
        fields: promptEntry.fields || [],
        fieldLabels: _collectFieldLabels(promptEntry)
      },
      timestamp: new Date().toISOString(),
      session: {
        durationMs: session.sessionDurationMs,
        totalEvents: session.totalEvents,
        trustedEvents: session.trustedEvents,
        untrustedEvents: session.untrustedEvents,
        untrustedRatio: session.untrustedRatio,
        untrustedTypes: session.untrustedTypes
      },
      response: {
        raw: responseText,
        parsed: parsed,
        isValidJSON: isValid
      },
      taskHistory: taskChanges,
      mouse: session.mouse,
      typing: session.typing,
      focus: session.focus,
      scroll: session.scroll,
      intentMutations: mutations,
      rawEvents: {
        clicks: session.rawClicks,
        keydowns: session.rawKeydowns,
        keyHolds: session.rawKeyHolds,
        focusEvents: session.rawFocus,
        changes: session.rawChanges,
        pasteDetails: session.pasteDetails
      },
      signals: signals
    };
  }

  // ---- Signal computation (SG1, SG4, SG-FL, SG-TR, SG-MO, SG-MF, SG-RT, SG-PA) ----
  function _buildSignals(session) {
    return {
      sg1_select:   _computeSG1(session),
      sg4_timing:   _computeSG4(session),
      sgfl_float:   _computeSGFL(session),
      sgtr_trust:   _computeSGTR(session),
      sgmo_hover:   _computeSGMO(session),
      sgmf_rapid:   _computeSGMF(session),
      sgrt_replace: { count: session.typing.replacementTextCount || 0 },
      sgpa_paste:   { count: (session.pasteDetails || []).length, details: session.pasteDetails || [] }
    };
  }

  // SG1: Trusted click + Untrusted change on <select>
  function _computeSG1(session) {
    var sigs = session.selectSignals || {};
    var keys = Object.keys(sigs);
    var copilotPattern = false;
    var selects = [];
    for (var i = 0; i < keys.length; i++) {
      var s = sigs[keys[i]];
      var isCp = s.trClicks > 0 && s.untrChanges > 0 && s.optionClicks === 0;
      if (isCp) copilotPattern = true;
      selects.push({
        id: keys[i],
        trClicks: s.trClicks, untrClicks: s.untrClicks,
        trChanges: s.trChanges, untrChanges: s.untrChanges,
        optionClicks: s.optionClicks,
        isCopilotPattern: isCp
      });
    }
    return { copilotPattern: copilotPattern, selects: selects };
  }

  // SG4: 2000ms inter-action gap clustering
  function _computeSG4(session) {
    var tl = session.timeline || [];
    if (tl.length < 3) return { actionCount: tl.length, gaps: [], twoSecCount: 0, twoSecRatio: 0, gapCV: null, summary: 'insufficient actions' };
    var gaps = [];
    for (var i = 1; i < tl.length; i++) gaps.push(Math.round((tl[i].t - tl[i - 1].t) * 10) / 10);
    var twoSec = 0;
    for (var j = 0; j < gaps.length; j++) { if (gaps[j] >= 1700 && gaps[j] <= 2300) twoSec++; }
    var ratio = gaps.length ? Math.round(twoSec / gaps.length * 1000) / 1000 : 0;
    // CV of gaps
    var sum = 0; for (var k = 0; k < gaps.length; k++) sum += gaps[k];
    var mean = sum / gaps.length;
    var variance = 0; for (var k = 0; k < gaps.length; k++) variance += (gaps[k] - mean) * (gaps[k] - mean);
    variance /= gaps.length;
    var cv = mean > 0 ? Math.round(Math.sqrt(variance) / mean * 1000) / 1000 : null;
    return {
      actionCount: tl.length,
      gaps: gaps,
      twoSecCount: twoSec,
      twoSecRatio: ratio,
      gapCV: cv,
      summary: twoSec + ' of ' + gaps.length + ' gaps in 1700-2300ms range (ratio: ' + ratio.toFixed(3) + ')'
    };
  }

  // SG-FL: Float coordinate detection
  function _computeSGFL(session) {
    var clicks = session.rawClicks || [];
    var floatCount = 0;
    for (var i = 0; i < clicks.length; i++) { if (clicks[i].hasFloat) floatCount++; }
    var dpr = (typeof window !== 'undefined' && window.devicePixelRatio) || 1;
    return {
      floatCount: floatCount,
      totalClicks: clicks.length,
      floatRatio: clicks.length ? Math.round(floatCount / clicks.length * 1000) / 1000 : 0,
      dpr: dpr,
      dprIsInteger: dpr % 1 === 0
    };
  }

  // SG-TR: Per-field trust matrix
  function _computeSGTR(session) {
    var ft = session.fieldTrust || {};
    var fields = Object.keys(ft);
    var combos = [];
    var anyUntrusted = false;
    var allFieldsTrusted = true;
    for (var i = 0; i < fields.length; i++) {
      var fid = fields[i];
      var events = ft[fid];
      var parts = [];
      var fieldHasUntrusted = false;
      var evtTypes = Object.keys(events);
      for (var j = 0; j < evtTypes.length; j++) {
        var c = events[evtTypes[j]];
        var label = c.untrusted > 0 ? (c.trusted > 0 ? 'M' : 'U') : 'T';
        parts.push(evtTypes[j] + '=' + label);
        if (c.untrusted > 0) { fieldHasUntrusted = true; anyUntrusted = true; }
      }
      if (fieldHasUntrusted) allFieldsTrusted = false;
      if (parts.length) combos.push(fid + ': ' + parts.join(' '));
    }
    return {
      fields: ft,
      combos: combos,
      anyUntrusted: anyUntrusted,
      allFieldsTrusted: fields.length > 0 ? allFieldsTrusted : true
    };
  }

  // SG-MO: Mouseover before click
  function _computeSGMO(session) {
    var clicks = session.rawClicks || [];
    if (!clicks.length) return { total: 0, noHover: 0, noHoverRatio: 0 };
    var noHover = 0, counted = 0;
    for (var i = 0; i < clicks.length; i++) {
      if (typeof clicks[i].hadHover !== 'undefined') {
        counted++;
        if (!clicks[i].hadHover) noHover++;
      }
    }
    return {
      total: counted,
      noHover: noHover,
      noHoverRatio: counted ? Math.round(noHover / counted * 1000) / 1000 : 0
    };
  }

  // SG-MF: Multi-field rapid fill (<10ms apart on different fields)
  function _computeSGMF(session) {
    var changes = session.rawChanges || [];
    var inputs = (session.rawClicks || []).length ? [] : []; // use inp records from rawEvents if available
    // Merge changes with input records that have fieldId (from _inp buffer via snapshot)
    // For now, use rawChanges which have id and t
    if (changes.length < 2) return { pairs: 0, totalFieldEvents: changes.length };
    var rapid = 0;
    for (var i = 1; i < changes.length; i++) {
      if (changes[i].t - changes[i - 1].t < 10 && changes[i].id !== changes[i - 1].id) rapid++;
    }
    return { pairs: rapid, totalFieldEvents: changes.length };
  }

  function download(data) {
    var json = JSON.stringify(data, null, 2);
    var blob = new Blob([json], { type: 'application/json' });
    var url = URL.createObjectURL(blob);
    var a = document.createElement('a');
    a.href = url;
    a.download = 'session-' + Date.now() + '.json';
    document.body.appendChild(a);
    a.click();
    setTimeout(function() { document.body.removeChild(a); URL.revokeObjectURL(url); }, 200);
  }

  function inject(data) {
    var json = JSON.stringify(data, null, 2);
    var div = document.createElement('div');
    div.id = 'session-report';
    div.style.cssText = 'position:fixed;top:0;left:0;right:0;z-index:9999;background:#111;color:#0f0;'
      + 'font-family:monospace;font-size:11px;max-height:40vh;overflow:auto;padding:12px 16px;'
      + 'border-bottom:2px solid #0f0;';
    var btn = document.createElement('button');
    btn.textContent = 'Copy Report';
    btn.style.cssText = 'position:absolute;top:8px;right:16px;background:#0f0;color:#000;border:none;'
      + 'padding:4px 12px;border-radius:4px;cursor:pointer;font-size:12px;font-weight:600;';
    btn.onclick = function() {
      navigator.clipboard.writeText(json).then(function() { btn.textContent = 'Copied!'; });
    };
    var pre = document.createElement('pre');
    pre.style.cssText = 'margin:0;white-space:pre-wrap;word-break:break-all;';
    pre.textContent = json;
    div.appendChild(btn);
    div.appendChild(pre);
    document.body.insertBefore(div, document.body.firstChild);
  }

  return { build: build, download: download, inject: inject };
})();
