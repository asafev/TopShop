// shopSession.js — Lightweight session UX analytics
// Collects interaction signals for quality-of-experience reporting.
// Designed as a self-contained module with no external dependencies.

var _ux = (function() {
  var _t0 = Date.now();
  var _pn = function() { return typeof performance !== 'undefined' ? performance.now() : Date.now() - _t0; };

  // ---- storage ----
  var _ptr = [];        // pointer trail {t,x,y} last 120
  var _cl = [];         // clicks {t,x,y,cx,cy,cd,mv,tr,dur}
  var _kd = [];         // keydown {t,code,tr}
  var _ku = [];         // keyup {t,code,dur}
  var _kdMap = {};      // code -> timestamp for hold calc
  var _inp = [];        // input events {t,len,hadKey,isPaste,chars}
  var _fc = [];         // focus {t,hadInput}
  var _sc = [];         // scroll {t,dy}
  var _mdn = null;      // pending mousedown timestamp
  var _lastKeyT = 0;    // last keydown time
  var _lastPasteT = 0;  // last paste time
  var _charsTyped = 0;
  var _charsInjected = 0;
  var _pasteChars = 0;
  var _totalInputs = 0;
  var _inputsNoKey = 0;
  var _trustedN = 0;
  var _untrustedN = 0;
  var _untrustedTypes = {};
  var _mvSinceClick = 0;
  var _selectSigs = {};    // SG1: per-select trust pairing
  var _timeline = [];      // SG4: significant-event sequence {t,type}
  var _lastTimelineT = 0;  // SG4: 50ms dedup guard
  var _fieldTrust = {};    // SG-TR: {[fieldId]: {[eventType]: {trusted:N, untrusted:N}}}
  var _hoverSet = new WeakSet(); // SG-MO: elements that received mouseover
  var _pasteDetails = [];  // SG-PA: ring buffer 20 {t,fieldId,len,tr}
  var _replTextCount = 0;  // SG-RT: insertReplacementText counter
  var _ch = [];            // change events ring buffer 40 {t,tag,id,value,tr}

  // ---- helpers ----
  function _push(arr, item, max) { arr.push(item); if (arr.length > max) arr.shift(); }
  function _mean(a) { if (!a.length) return 0; var s = 0; for (var i = 0; i < a.length; i++) s += a[i]; return s / a.length; }
  function _cv(a) { if (a.length < 2) return 0; var m = _mean(a); if (m === 0) return 0; var v = 0; for (var i = 0; i < a.length; i++) v += (a[i] - m) * (a[i] - m); return Math.sqrt(v / a.length) / m; }

  function _countTrust(e) {
    if (e.isTrusted) _trustedN++; else { _untrustedN++; _untrustedTypes[e.type] = (_untrustedTypes[e.type] || 0) + 1; }
  }

  function _pushTimeline(type) {
    var t = _pn();
    if (t - _lastTimelineT > 50) {
      _timeline.push({ t: t, type: type });
      _lastTimelineT = t;
    }
  }

  function _trackFieldTrust(e) {
    var fid = e.target ? (e.target.id || e.target.name || '') : '';
    if (!fid) return;
    var tag = e.target.tagName;
    if (tag !== 'INPUT' && tag !== 'SELECT' && tag !== 'TEXTAREA' && tag !== 'BUTTON') return;
    if (!_fieldTrust[fid]) _fieldTrust[fid] = {};
    if (!_fieldTrust[fid][e.type]) _fieldTrust[fid][e.type] = { trusted: 0, untrusted: 0 };
    if (e.isTrusted) _fieldTrust[fid][e.type].trusted++;
    else _fieldTrust[fid][e.type].untrusted++;
  }

  function _trackSelect(e, eventType) {
    var tag = e.target.tagName;
    if (tag === 'OPTION' && eventType === 'click') {
      var parent = e.target.parentElement;
      if (parent && parent.tagName === 'SELECT') {
        var sid = parent.id;
        if (sid) {
          if (!_selectSigs[sid]) _selectSigs[sid] = { trClicks: 0, untrClicks: 0, trChanges: 0, untrChanges: 0, optionClicks: 0 };
          _selectSigs[sid].optionClicks++;
        }
      }
    }
    if (tag === 'SELECT') {
      var sid = e.target.id;
      if (sid) {
        if (!_selectSigs[sid]) _selectSigs[sid] = { trClicks: 0, untrClicks: 0, trChanges: 0, untrChanges: 0, optionClicks: 0 };
        if (eventType === 'click') {
          if (e.isTrusted) _selectSigs[sid].trClicks++; else _selectSigs[sid].untrClicks++;
        }
        if (eventType === 'change') {
          if (e.isTrusted) _selectSigs[sid].trChanges++; else _selectSigs[sid].untrChanges++;
        }
      }
    }
  }

  // ---- pointer ----
  function _onPM(e) {
    _countTrust(e);
    _push(_ptr, { t: _pn(), x: e.clientX, y: e.clientY }, 120);
    _mvSinceClick++;
  }

  // ---- click ----
  function _onCl(e) {
    _countTrust(e);
    var r = e.target.getBoundingClientRect();
    var cx = r.left + r.width / 2;
    var cy = r.top + r.height / 2;
    var cd = Math.sqrt((e.clientX - cx) * (e.clientX - cx) + (e.clientY - cy) * (e.clientY - cy));
    _push(_cl, {
      t: _pn(), x: e.clientX, y: e.clientY,
      cx: cd, mv: _mvSinceClick, tr: e.isTrusted ? 1 : 0,
      dur: _mdn ? (_pn() - _mdn) : 0,
      hasFloat: (e.clientX % 1 !== 0 || e.clientY % 1 !== 0),
      hadHover: _hoverSet.has(e.target),
      tag: e.target.tagName || '',
      id: e.target.id || ''
    }, 60);
    _mvSinceClick = 0;
    _mdn = null;
    _pushTimeline('click');
    _trackFieldTrust(e);
    _trackSelect(e, 'click');
  }

  function _onMD(e) { _countTrust(e); _mdn = _pn(); }
  function _onMU(e) { _countTrust(e); }

  // ---- keyboard ----
  function _onKD(e) {
    _countTrust(e);
    if (e.repeat) return;
    var t = _pn();
    _push(_kd, { t: t, code: e.code, tr: e.isTrusted ? 1 : 0 }, 200);
    _kdMap[e.code] = t;
    _lastKeyT = t;
    _pushTimeline('keydown');
    _trackFieldTrust(e);
  }

  function _onKU(e) {
    _countTrust(e);
    var t = _pn();
    var start = _kdMap[e.code];
    if (start) {
      _push(_ku, { t: t, code: e.code, dur: t - start }, 200);
      delete _kdMap[e.code];
    }
  }

  // ---- input ----
  function _onInp(e) {
    _countTrust(e);
    var t = _pn();
    var el = e.target;
    if (el.tagName !== 'TEXTAREA' && el.tagName !== 'INPUT') return;
    var data = e.data || '';
    var len = data.length;
    var hadKey = (t - _lastKeyT) < 150;
    var isPaste = (t - _lastPasteT) < 300;
    _totalInputs++;
    if (!hadKey && !isPaste && len > 0) { _inputsNoKey++; _charsInjected += len; }
    else if (isPaste) { _pasteChars += len; }
    else { _charsTyped += len; }
    _push(_inp, { t: t, len: len, hadKey: hadKey, isPaste: isPaste, chars: len > 1 ? len : 0, inputType: e.inputType || '', fieldId: el.id || el.name || '' }, 100);
    if (e.inputType === 'insertReplacementText') _replTextCount++;
    _trackFieldTrust(e);
  }

  function _onPaste(e) {
    _countTrust(e);
    _lastPasteT = _pn();
    var len = -1;
    try { len = (e.clipboardData || window.clipboardData).getData('text/plain').length; } catch(x) {}
    var fid = e.target ? (e.target.id || e.target.name || '') : '';
    _push(_pasteDetails, { t: _pn(), fieldId: fid, len: len, tr: e.isTrusted ? 1 : 0 }, 20);
  }

  // ---- focus ----
  function _onFI(e) {
    _countTrust(e);
    var t = _pn();
    var hadInput = (t - _lastKeyT) < 500 || _mvSinceClick > 0;
    _push(_fc, { t: t, had: hadInput ? 1 : 0 }, 40);
    _pushTimeline('focusin');
    _trackFieldTrust(e);
  }

  // ---- scroll ----
  function _onWh(e) {
    _countTrust(e);
    _push(_sc, { t: _pn(), dy: e.deltaY }, 50);
  }

  // ---- change (SG1) ----
  function _onChange(e) {
    _countTrust(e);
    _push(_ch, {
      t: _pn(),
      tag: e.target.tagName || '',
      id: e.target.id || '',
      value: (e.target.value || '').slice(0, 60),
      tr: e.isTrusted ? 1 : 0
    }, 40);
    _pushTimeline('change');
    _trackFieldTrust(e);
    _trackSelect(e, 'change');
  }

  // ---- hover (SG-MO) ----
  function _onHover(e) {
    _hoverSet.add(e.target);
  }

  // ---- attach ----
  function _attach() {
    var o = { passive: true, capture: true };
    document.addEventListener('pointermove', _onPM, o);
    document.addEventListener('click', _onCl, o);
    document.addEventListener('mousedown', _onMD, o);
    document.addEventListener('mouseup', _onMU, o);
    document.addEventListener('keydown', _onKD, o);
    document.addEventListener('keyup', _onKU, o);
    document.addEventListener('input', _onInp, o);
    document.addEventListener('paste', _onPaste, o);
    document.addEventListener('focusin', _onFI, o);
    document.addEventListener('wheel', _onWh, o);
    document.addEventListener('change', _onChange, o);
    document.addEventListener('mouseover', _onHover, { capture: true, passive: true });
  }

  // ---- metric computations ----
  function _noMvRatio() {
    if (!_cl.length) return 0;
    var c = 0; for (var i = 0; i < _cl.length; i++) if (_cl[i].mv === 0) c++;
    return c / _cl.length;
  }
  function _centerRatio() {
    if (!_cl.length) return 0;
    var c = 0; for (var i = 0; i < _cl.length; i++) if (_cl[i].cx < 3) c++;
    return c / _cl.length;
  }
  function _avgVel() {
    if (_ptr.length < 2) return 0;
    var totalD = 0, totalT = 0;
    for (var i = 1; i < _ptr.length; i++) {
      var dx = _ptr[i].x - _ptr[i-1].x, dy = _ptr[i].y - _ptr[i-1].y;
      totalD += Math.sqrt(dx*dx + dy*dy);
      totalT += _ptr[i].t - _ptr[i-1].t;
    }
    return totalT > 0 ? totalD / totalT : 0;
  }
  function _typingCPS() {
    var intervals = [];
    for (var i = 1; i < _kd.length; i++) {
      var d = _kd[i].t - _kd[i-1].t;
      if (d > 0 && d < 2000) intervals.push(d);
    }
    if (!intervals.length) return { cps: 0, verdict: 'NO_DATA' };
    var avg = _mean(intervals);
    var cps = avg > 0 ? 1000 / avg : 0;
    var verdict = cps > 15 ? 'FAST' : cps > 8 ? 'MODERATE' : 'NORMAL';
    return { cps: Math.round(cps * 100) / 100, cv: Math.round(_cv(intervals) * 1000) / 1000, verdict: verdict };
  }
  function _avgKeyHold() {
    if (!_ku.length) return { avg: 0, cv: 0, verdict: 'NO_DATA' };
    var durs = []; for (var i = 0; i < _ku.length; i++) durs.push(_ku[i].dur);
    var avg = _mean(durs);
    var cv = _cv(durs);
    var verdict = avg < 20 ? 'TOO_SHORT' : cv < 0.2 ? 'TOO_UNIFORM' : 'NORMAL';
    return { avg: Math.round(avg * 10) / 10, cv: Math.round(cv * 1000) / 1000, verdict: verdict };
  }
  function _effectiveTyping() {
    var kdn = _kd.length;
    if (kdn === 0 && (_charsTyped + _charsInjected) > 0) return { ratio: Infinity, verdict: 'GHOST' };
    if (kdn === 0) return { ratio: 0, verdict: 'NO_DATA' };
    var r = (_charsTyped + _charsInjected) / kdn;
    var verdict = r > 10 ? 'INJECTED' : r > 3 ? 'SUSPICIOUS' : 'NORMAL';
    return { ratio: Math.round(r * 100) / 100, verdict: verdict };
  }
  function _injectionRatio() {
    return _totalInputs > 0 ? _inputsNoKey / _totalInputs : 0;
  }
  function _multiCharRatio() {
    if (!_inp.length) return 0;
    var c = 0; for (var i = 0; i < _inp.length; i++) if (_inp[i].chars > 1) c++;
    return c / _inp.length;
  }
  function _focusJumpRatio() {
    if (!_fc.length) return 0;
    var c = 0; for (var i = 0; i < _fc.length; i++) if (!_fc[i].had) c++;
    return c / _fc.length;
  }
  function _scrollUniformity() {
    if (_sc.length < 3) return 0;
    var deltas = []; for (var i = 0; i < _sc.length; i++) deltas.push(Math.abs(_sc[i].dy));
    return 1 - Math.min(_cv(deltas), 1);
  }
  function _clickDurAvg() {
    if (!_cl.length) return { avg: 0, zeroPct: 0 };
    var durs = []; var z = 0;
    for (var i = 0; i < _cl.length; i++) { durs.push(_cl[i].dur); if (_cl[i].dur === 0) z++; }
    return { avg: Math.round(_mean(durs) * 10) / 10, zeroPct: Math.round(z / _cl.length * 100) };
  }
  function _keyupKeydownRatio() {
    return _kd.length > 0 ? _ku.length / _kd.length : (_ku.length > 0 ? Infinity : 0);
  }
  function _floatClickRatio() {
    if (!_cl.length) return 0;
    var c = 0; for (var i = 0; i < _cl.length; i++) if (_cl[i].hasFloat) c++;
    return c / _cl.length;
  }
  function _noHoverClickRatio() {
    if (!_cl.length) return 0;
    var total = 0, c = 0;
    for (var i = 0; i < _cl.length; i++) {
      if (typeof _cl[i].hadHover !== 'undefined') { total++; if (!_cl[i].hadHover) c++; }
    }
    return total > 0 ? c / total : 0;
  }

  // ---- full snapshot ----
  function _snapshot() {
    var dur = Date.now() - _t0;
    var typing = _typingCPS();
    var hold = _avgKeyHold();
    var eff = _effectiveTyping();
    var cdur = _clickDurAvg();
    return {
      sessionDurationMs: dur,
      totalEvents: _trustedN + _untrustedN,
      trustedEvents: _trustedN,
      untrustedEvents: _untrustedN,
      untrustedRatio: (_trustedN + _untrustedN) > 0 ? Math.round(_untrustedN / (_trustedN + _untrustedN) * 1000) / 1000 : 0,
      untrustedTypes: Object.keys(_untrustedTypes).length > 0 ? Object.assign({}, _untrustedTypes) : {},
      mouse: {
        noMovementClickRatio: Math.round(_noMvRatio() * 1000) / 1000,
        centerClickRatio: Math.round(_centerRatio() * 1000) / 1000,
        avgVelocityPxMs: Math.round(_avgVel() * 1000) / 1000,
        clickCount: _cl.length,
        clickDurAvgMs: cdur.avg,
        zeroDurationClickPct: cdur.zeroPct,
        floatClickRatio: Math.round(_floatClickRatio() * 1000) / 1000,
        noHoverClickRatio: Math.round(_noHoverClickRatio() * 1000) / 1000
      },
      typing: {
        keydowns: _kd.length,
        keyups: _ku.length,
        keyupKeydownRatio: Math.round(_keyupKeydownRatio() * 1000) / 1000,
        cps: typing.cps,
        cpsCV: typing.cv,
        cpsVerdict: typing.verdict,
        avgKeyHoldMs: hold.avg,
        keyHoldCV: hold.cv,
        keyHoldVerdict: hold.verdict,
        charsTyped: _charsTyped,
        charsInjected: _charsInjected,
        charsPasted: _pasteChars,
        effectiveRatio: eff.ratio,
        effectiveVerdict: eff.verdict,
        injectionRatio: Math.round(_injectionRatio() * 1000) / 1000,
        multiCharRatio: Math.round(_multiCharRatio() * 1000) / 1000,
        replacementTextCount: _replTextCount
      },
      focus: {
        focusJumpRatio: Math.round(_focusJumpRatio() * 1000) / 1000,
        totalFocusEvents: _fc.length
      },
      scroll: {
        uniformity: Math.round(_scrollUniformity() * 1000) / 1000,
        totalScrolls: _sc.length
      },
      rawClicks: _cl.slice(-30),
      rawKeydowns: _kd.slice(-50),
      rawKeyHolds: _ku.slice(-50),
      rawFocus: _fc.slice(-20),
      selectSignals: JSON.parse(JSON.stringify(_selectSigs)),
      timeline: _timeline.slice(),
      fieldTrust: JSON.parse(JSON.stringify(_fieldTrust)),
      rawChanges: _ch.slice(-20),
      pasteDetails: _pasteDetails.slice(-10)
    };
  }

  _attach();

  return { snapshot: _snapshot };
})();
