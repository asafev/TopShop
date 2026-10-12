/**
 * Platform-build witnesses (device record key `osx`, its own version `rv`).
 *
 * Three facts a browser build carries from the operating system it was compiled for, read through ordinary page
 * APIs. Raw values only; every step is bounded in time, cleans up after itself, and leaves a code on failure.
 *
 *   osx.rv     1
 *   osx.uas    form-control defaults from the browser's built-in style sheets
 *              { rng: range input `color` inside a closed shadow root with color-scheme light,
 *                rngI: the same in a same-origin about:blank iframe, rngD: with color-scheme dark,
 *                rngL: the same input in the light DOM (shows page CSS), txt: text input colour (control),
 *                sbw: classic scrollbar width of an overflow:scroll box (px), ms }
 *   osx.vm     canvas transform arithmetic { nan: { add, div, sqrt } NaN bit patterns from runtime operations,
 *                cv: [[hex(a), hex(b)], ...] getTransform() after setTransform(identity) + rotate(R[i]), ms }
 *   osx.edm    caret and selection steps in an isolated srcdoc iframe holding 'abc defgh ijk lmn'
 *              { ac1, ac: [anchor, focus] after collapse(6) + extend backward word, then + extend forward word;
 *                gb, gf: after collapse(4) + extend(9) + extend backward / forward lineboundary;
 *                nd: after a 4..9 range + extend backward character; ndd: Selection.direction there;
 *                wm: focus offsets of three forward word moves from 0; ms }
 *   codes      '-' API missing, 'u' could not run, 'x' threw, 't' not finished in time
 */

const R = [0.75857, 2.28161, 2.3304, 0.77363, 2.34994, 2.33182, 2.28107, 2.38765, 2.2874, 2.29807, 2.4054, 2.42482, 2.37175, 0.80657];

const _wait = (p, ms) => Promise.race([p, new Promise(r => setTimeout(() => r('t'), Math.max(0, ms)))]);
const _ms = t => Math.round((performance.now() - t) * 10) / 10;

function _hex(x) {
  const d = new DataView(new ArrayBuffer(8));
  d.setFloat64(0, x);
  let s = '';
  for (let i = 0; i < 8; i++) s += d.getUint8(i).toString(16).padStart(2, '0');
  return s;
}

function _uas() {
  const t0 = performance.now(), o = {};
  const cs = (el, p) => { try { return getComputedStyle(el)[p]; } catch (e) { return 'x'; } };
  let host = null, frame = null;
  try {
    host = document.createElement('div');
    host.setAttribute('aria-hidden', 'true');
    host.style.cssText = 'position:absolute;left:-10000px;top:0;width:200px;height:120px;overflow:hidden;contain:strict;';
    (document.body || document.documentElement).appendChild(host);
    const rL = document.createElement('input'); rL.type = 'range';
    host.appendChild(rL);
    o.rngL = cs(rL, 'color');
    const box = document.createElement('div');
    host.appendChild(box);
    const sr = box.attachShadow({ mode: 'closed' });
    const wrap = document.createElement('div');
    wrap.style.colorScheme = 'light';           // color-scheme is inherited from the page: pin it
    sr.appendChild(wrap);
    const r = document.createElement('input'); r.type = 'range';
    const rD = document.createElement('input'); rD.type = 'range'; rD.style.colorScheme = 'dark';
    const tx = document.createElement('input'); tx.type = 'text';
    const sc = document.createElement('div'); sc.style.cssText = 'width:100px;height:40px;overflow:scroll;';
    wrap.append(r, rD, tx, sc);
    o.rng = cs(r, 'color');
    o.rngD = cs(rD, 'color');
    o.txt = cs(tx, 'color');
    o.sbw = sc.offsetWidth - sc.clientWidth;
    try {
      frame = document.createElement('iframe');
      frame.style.cssText = 'position:absolute;left:-10000px;top:0;width:50px;height:50px;border:0;';
      host.appendChild(frame);
      const d = frame.contentDocument, w = frame.contentWindow;
      if (d && w) {
        if (!d.body) { d.open(); d.write('<!doctype html><body></body>'); d.close(); }
        const ri = d.createElement('input'); ri.type = 'range';
        d.body.appendChild(ri);
        o.rngI = w.getComputedStyle(ri).color;
      } else o.rngI = 'u';
    } catch (e) { o.rngI = 'x'; }
  } catch (e) { o.rng = o.rng || 'x'; } finally {
    try { if (frame) frame.remove(); } catch (e) { /* removed already */ }
    try { if (host) host.remove(); } catch (e) { /* removed already */ }
  }
  o.ms = _ms(t0);
  return o;
}

function _vm() {
  const t0 = performance.now(), o = {};
  try {
    const z = [Number('Infinity'), -Number('Infinity'), Number('0'), Number('-1')];   // built at run time
    o.nan = { add: _hex(z[0] + z[1]), div: _hex(z[2] / z[2]), sqrt: _hex(Math.sqrt(z[3])) };
  } catch (e) { o.nan = 'x'; }
  try {
    const c = document.createElement('canvas'); c.width = c.height = 4;
    const g = c.getContext('2d');
    if (!g || typeof g.getTransform !== 'function') o.cv = '-';
    else o.cv = R.map(r => { g.setTransform(1, 0, 0, 1, 0, 0); g.rotate(r); const m = g.getTransform(); return [_hex(m.a), _hex(m.b)]; });
  } catch (e) { o.cv = 'x'; }
  o.ms = _ms(t0);
  return o;
}

function _edm(capMs) {
  const TXT = 'abc defgh ijk lmn';
  return new Promise((resolve) => {
    let f = null, done = false;
    const fin = (v) => { if (done) return; done = true; try { if (f) f.remove(); } catch (e) { /* removed already */ } resolve(v); };
    const to = setTimeout(() => fin('t'), Math.max(0, capMs));
    try {
      f = document.createElement('iframe');
      f.setAttribute('aria-hidden', 'true'); f.tabIndex = -1;
      f.style.cssText = 'position:absolute;left:-10000px;top:0;width:400px;height:60px;border:0;';
      f.srcdoc = "<!doctype html><body style='margin:0'><div id=t style='white-space:pre;font:16px monospace;direction:ltr;" +
        "user-select:text;-webkit-user-select:text'>" + TXT + '</div></body>';
      f.addEventListener('load', () => {
        clearTimeout(to);
        const r = {}, t1 = performance.now();
        try {
          const win = f.contentWindow, doc = f.contentDocument, el = doc && doc.getElementById('t');
          const s = win && win.getSelection();
          if (!el || !s) return fin('u');
          if (typeof s.modify !== 'function') return fin('-');
          const t = el.firstChild, snap = () => [s.anchorOffset, s.focusOffset];
          const step = (k, fn) => { try { fn(); } catch (e) { r[k] = 'x'; } };
          step('ac', () => { s.collapse(t, 6); s.modify('extend', 'backward', 'word'); r.ac1 = snap(); s.modify('extend', 'forward', 'word'); r.ac = snap(); });
          step('gb', () => { s.collapse(t, 4); s.extend(t, 9); s.modify('extend', 'backward', 'lineboundary'); r.gb = snap(); });
          step('gf', () => { s.collapse(t, 4); s.extend(t, 9); s.modify('extend', 'forward', 'lineboundary'); r.gf = snap(); });
          step('nd', () => {
            s.removeAllRanges(); const rg = doc.createRange(); rg.setStart(t, 4); rg.setEnd(t, 9); s.addRange(rg);
            r.ndd = typeof s.direction === 'string' ? s.direction : '-';
            s.modify('extend', 'backward', 'character'); r.nd = snap();
          });
          step('wm', () => { s.collapse(t, 0); const w = []; for (let i = 0; i < 3; i++) { s.modify('move', 'forward', 'word'); w.push(s.focusOffset); } r.wm = w; });
          try { s.removeAllRanges(); } catch (e) { /* nothing selected */ }
        } catch (e) { return fin('x'); }
        r.ms = _ms(t1);
        fin(r);
      });
      (document.body || document.documentElement).appendChild(f);
    } catch (e) { clearTimeout(to); fin('x'); }
  });
}

/** Runs on an idle page (after the other stages). `budgetMs` bounds the asynchronous part. */
export async function collectPlatform(budgetMs = 3000) {
  const osx = { rv: 1 };
  try { osx.uas = _uas(); } catch (e) { osx.uas = 'x'; }
  try { osx.vm = _vm(); } catch (e) { osx.vm = 'x'; }
  try { osx.edm = await _wait(_edm(Math.min(3000, budgetMs)), budgetMs + 100); } catch (e) { osx.edm = 'x'; }
  return osx;
}
