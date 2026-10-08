/**
 * Device environment collector.
 *
 * Reads raw, comparable properties of the browser environment at page load: the same values in the
 * main document, a dedicated worker and a fresh iframe; text, graphics, audio, locale and engine
 * characteristics; and how a few built-in objects behave. Output is raw only, under short keys.
 * Nothing is scored here. Schema 3 adds translated shader text (gts), WebGL limits read back by behaviour
 * (gle), a text raster in an embedded font drawn in the worker (wft), WebCodecs HEVC and AAC support (wcd),
 * hyphenation (hyp), generic font widths (gff), voice count at start (vn0), raw doNotTrack (dnt), raw WebGPU
 * adapter values (wg.sg/feat/lim/wgsl/pcf) and per-probe milliseconds (pms). A probe that was still running
 * at the record's deadline reads 't'; null means the API is missing or the probe threw.
 *
 *   import { collectEnv } from './envCollect.js';
 *   const raw = await collectEnv({ timeoutMs: 2500, tag: el => el.setAttribute('data-own', '1') });
 */

const _fnToString = Function.prototype.toString;
const _getProto = Object.getPrototypeOf;
const _setProto = Object.setPrototypeOf;
const _struct = typeof structuredClone === 'function' ? structuredClone : null;
let _tag = null;

const _osFontSets = {
  windows: ['Segoe UI', 'Consolas', 'Tahoma', 'Segoe UI Symbol'],
  macos: ['Helvetica Neue', 'Menlo', 'Avenir Next', 'Geneva'],
  linux: ['DejaVu Sans', 'Liberation Sans', 'Ubuntu', 'Cantarell'],
};

const _protoTargets = ['Element', 'HTMLElement', 'Document', 'Navigator', 'Node', 'CSSStyleDeclaration', 'HTMLMediaElement',
  'SVGElement', 'Range', 'Performance', 'CanvasRenderingContext2D', 'WebGL2RenderingContext', 'BaseAudioContext',
  'RTCPeerConnection', 'Window', 'ShadowRoot', 'HTMLInputElement', 'Selection'];

// Generic and system font names measured against a missing family (key: CSS font-family value).
const _genericFonts = [['sui', 'system-ui'], ['aps', '-apple-system'], ['bms', 'BlinkMacSystemFont'], ['uss', 'ui-sans-serif'],
  ['uis', 'ui-serif'], ['uim', 'ui-monospace'], ['uir', 'ui-rounded'], ['srf', 'serif'], ['ssf', 'sans-serif'],
  ['mon', 'monospace'], ['seg', '"Segoe UI"']];

// Text raster font: a 21-glyph subset of DejaVu Sans as WOFF (Bitstream Vera licence, DejaVu changes public domain; the font's full licence text is kept in its name table).
const _wfFont = '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';
const _wfText = 'Hamburgefonstiv 0123';
// After a first voiceschanged event, wait for a second one at least _VOICE_MIN ms and at most _VOICE_MAX ms.
const _VOICE_MIN = 150, _VOICE_MAX = 700;

const _featTable = [
  ['f_at', () => !!Array.prototype.at, 92],
  ['f_hasOwn', () => !!Object.hasOwn, 93],
  ['f_urlpattern', () => 'URLPattern' in globalThis, 95],
  ['f_findLast', () => !!Array.prototype.findLast, 97],
  ['f_structClone', () => typeof globalThis.structuredClone === 'function', 98],
  ['f_navigation', () => 'navigation' in globalThis, 102],
  ['f_cssHighlights', () => !!(globalThis.CSS && globalThis.CSS.highlights), 105],
  ['f_toSorted', () => !!Array.prototype.toSorted, 110],
  ['f_viewTransition', () => typeof document !== 'undefined' && 'startViewTransition' in Document.prototype, 111],
  ['f_isWellFormed', () => !!String.prototype.isWellFormed, 111],
  ['f_withResolvers', () => typeof Promise.withResolvers === 'function', 119],
  ['f_closeWatcher', () => 'CloseWatcher' in globalThis, 120],
  ['f_fromAsync', () => typeof Array.fromAsync === 'function', 121],
  ['f_setOps', () => _nat(Set.prototype.union), 122],
  ['f_promiseTry', () => _nat(Promise.try), 128],
  ['f_durationFmt', () => _nat(Intl.DurationFormat), 129],
  ['f_atomicsPause', () => _nat(globalThis.Atomics && Atomics.pause), 133],
  ['f_isError', () => _nat(Error.isError), 134],
  ['f_disposable', () => _nat(globalThis.DisposableStack), 134],
  ['f_float16', () => _nat(globalThis.Float16Array), 135],
  ['f_rxEscape', () => _nat(RegExp.escape), 136],
  ['f_base64', () => _nat(Uint8Array.fromBase64), 140],
  ['f_temporal', () => !!globalThis.Temporal && _nat(globalThis.Temporal.PlainDate), 144],
  ['f_getOrInsert', () => _nat(Map.prototype.getOrInsert), 145],
  ['f_iterConcat', () => _nat(globalThis.Iterator && globalThis.Iterator.concat), 146],
  ['f_sumPrecise', () => _nat(Math.sumPrecise), 147],
  ['f_iterZip', () => _nat(globalThis.Iterator && globalThis.Iterator.zip), 153],
];

function _bit(b) { return b ? 1 : 0; }

function _nat(f) {
  try { return typeof f === 'function' && _fnToString.call(f).indexOf('[native code]') >= 0; } catch (e) { return false; }
}

function _yield() { return new Promise(function (r) { setTimeout(r, 0); }); }

function _ms(t) { return Math.round((performance.now() - t) * 10) / 10; }

/**
 * Resolve to the promise's value mapped by `map`, to `onTimeout` after ms, or to `onReject` if it rejects or throws.
 * With `late`, the ms count starts once the current synchronous block ends.
 */
function _race(fn, ms, map, onTimeout, onReject, late) {
  return new Promise(function (resolve) {
    let done = false, t = null;
    const end = function (v) { if (!done) { done = true; clearTimeout(t); resolve(v); } };
    const arm = function () { if (!done) t = setTimeout(function () { end(onTimeout); }, ms); };
    if (late) setTimeout(arm, 0); else arm();
    try { Promise.resolve(fn()).then(function (v) { end(map(v)); }, function () { end(onReject); }); } catch (e) { end(onReject); }
  });
}

function _rand() { return Math.random().toString(36).slice(2, 9); }

function _fnv(str) {
  let h = 0x811c9dc5;
  for (let i = 0; i < str.length; i++) { h ^= str.charCodeAt(i); h = (h + ((h << 1) + (h << 4) + (h << 7) + (h << 8) + (h << 24))) >>> 0; }
  return ('0000000' + h.toString(16)).slice(-8);
}

/** Resolve to p's value, or null after ms. With `late`, the ms count starts once the current synchronous block ends. */
function _bounded(p, ms, late) {
  return new Promise(function (resolve) {
    let done = false, t = null;
    const arm = function () { if (!done) t = setTimeout(function () { if (!done) { done = true; resolve(null); } }, ms); };
    if (late) setTimeout(arm, 0); else arm();
    Promise.resolve(p).then(
      function (v) { if (!done) { done = true; clearTimeout(t); resolve(v); } },
      function () { if (!done) { done = true; clearTimeout(t); resolve(null); } });
  });
}

function _s(fn) { try { const v = fn(); return v === undefined ? null : v; } catch (e) { return null; } }

function _try(fn) { try { return fn(); } catch (e) { return null; } }

function _glRenderer(contextName) {
  try {
    const c = document.createElement('canvas');
    const gl = c.getContext(contextName, { failIfMajorPerformanceCaveat: false });
    if (!gl) return null;
    let vendor = gl.getParameter(gl.VENDOR), renderer = gl.getParameter(gl.RENDERER);
    if (!renderer || renderer === 'WebKit WebGL') {
      const ext = gl.getExtension('WEBGL_debug_renderer_info');
      if (ext) { vendor = gl.getParameter(ext.UNMASKED_VENDOR_WEBGL); renderer = gl.getParameter(ext.UNMASKED_RENDERER_WEBGL); }
    }
    return { vendor: String(vendor || ''), renderer: String(renderer || '') };
  } catch (e) { return null; }
}

function _osFonts() {
  try {
    const ctx = document.createElement('canvas').getContext('2d');
    if (!ctx) return null;
    const text = 'mmmmmmmmmmlli 0O@#WwQq';
    const width = (family) => { ctx.font = family ? '64px "' + family + '", monospace' : '64px monospace'; return ctx.measureText(text).width; };
    const base = width(null);
    if (width(null) !== base || width('x' + _rand() + _rand()) !== base) return null;
    const hits = {};
    for (const os in _osFontSets) {
      let n = 0;
      for (let i = 0; i < _osFontSets[os].length; i++) if (width(_osFontSets[os][i]) !== base) n++;
      hits[os] = n;
    }
    return hits;
  } catch (e) { return null; }
}

function _protoCounts() {
  const out = {};
  for (let i = 0; i < _protoTargets.length; i++) {
    const name = _protoTargets[i];
    try {
      const C = globalThis[name];
      out[name] = C && C.prototype ? Object.getOwnPropertyNames(C.prototype).length : -1;
    } catch (e) { out[name] = -2; }
  }
  try { out.Intl = Object.getOwnPropertyNames(Intl).length; } catch (e) { out.Intl = -2; }
  return out;
}

function _glBackend() {
  try {
    const c = document.createElement('canvas');
    c.width = 64; c.height = 64;
    const gl = c.getContext('webgl2') || c.getContext('webgl');
    if (!gl) return null;
    const out = {};
    const P = ['MAX_TEXTURE_SIZE', 'MAX_RENDERBUFFER_SIZE', 'MAX_VERTEX_UNIFORM_VECTORS', 'MAX_FRAGMENT_UNIFORM_VECTORS',
      'MAX_VARYING_VECTORS', 'MAX_COMBINED_TEXTURE_IMAGE_UNITS', 'MAX_VERTEX_ATTRIBS', 'MAX_CUBE_MAP_TEXTURE_SIZE',
      'MAX_TEXTURE_IMAGE_UNITS', 'MAX_VERTEX_TEXTURE_IMAGE_UNITS', 'MAX_SAMPLES', 'MAX_3D_TEXTURE_SIZE', 'MAX_DRAW_BUFFERS',
      'MAX_UNIFORM_BLOCK_SIZE', 'MAX_ELEMENT_INDEX'];
    for (let i = 0; i < P.length; i++) { const k = gl[P[i]]; if (k !== undefined) { try { out[P[i]] = gl.getParameter(k); } catch (e) { /* ignore */ } } }
    try { out.VIEWPORT = Array.from(gl.getParameter(gl.MAX_VIEWPORT_DIMS)).join('x'); } catch (e) { /* ignore */ }
    try { out.LINE = Array.from(gl.getParameter(gl.ALIASED_LINE_WIDTH_RANGE)).join('-'); } catch (e) { /* ignore */ }
    try { out.POINT = Array.from(gl.getParameter(gl.ALIASED_POINT_SIZE_RANGE)).join('-'); } catch (e) { /* ignore */ }
    const prec = [];
    const shaders = ['VERTEX_SHADER', 'FRAGMENT_SHADER'], types = ['HIGH_FLOAT', 'MEDIUM_FLOAT', 'LOW_FLOAT', 'HIGH_INT'];
    for (let i = 0; i < shaders.length; i++) for (let j = 0; j < types.length; j++) {
      try { const f = gl.getShaderPrecisionFormat(gl[shaders[i]], gl[types[j]]); prec.push(f.rangeMin + '/' + f.rangeMax + '/' + f.precision); } catch (e) { prec.push('x'); }
    }
    out.PREC = prec.join(',');
    try { out.EXT = (gl.getSupportedExtensions() || []).slice().sort().join(','); } catch (e) { /* ignore */ }
    const render = _glRenderHash(gl, c);
    return { params: out, render: render, gl: gl, canvas: c };
  } catch (e) { return null; }
}

function _glLost(gl) { try { return gl.isContextLost(); } catch (e) { return true; } }

/**
 * Translated text of one tiny vertex and one tiny fragment shader, and the renderer read on the same context.
 * With KHR_parallel_shader_compile the compile is awaited without blocking the main thread (at most 300 ms).
 */
async function _glTranslated(gl) {
  const out = { ext: 0, r: null };
  try {
    const ri = gl.getExtension('WEBGL_debug_renderer_info');
    out.r = String(gl.getParameter(ri ? ri.UNMASKED_RENDERER_WEBGL : gl.RENDERER) || '');
  } catch (e) { /* ignore */ }
  const ext = gl.getExtension('WEBGL_debug_shaders');
  if (!ext) return out;
  out.ext = 1;
  const kpc = gl.getExtension('KHR_parallel_shader_compile');
  const vs = gl.createShader(gl.VERTEX_SHADER), fs = gl.createShader(gl.FRAGMENT_SHADER);
  try {
    gl.shaderSource(vs, 'attribute vec2 p;void main(){gl_Position=vec4(p,0.0,1.0);}');
    gl.shaderSource(fs, 'precision mediump float;uniform float u;void main(){gl_FragColor=vec4(sin(u),cos(u),0.0,1.0);}');
    gl.compileShader(vs); gl.compileShader(fs);
    if (kpc) {
      const t0 = performance.now();
      while (!(gl.getShaderParameter(vs, kpc.COMPLETION_STATUS_KHR) && gl.getShaderParameter(fs, kpc.COMPLETION_STATUS_KHR))) {
        if (performance.now() - t0 > 300 || _glLost(gl)) break;
        await new Promise(function (r) { setTimeout(r, 4); });
      }
    }
    const v = String(ext.getTranslatedShaderSource(vs) || ''), f = String(ext.getTranslatedShaderSource(fs) || '');
    out.vl = v.length; out.fl = f.length; out.vh = _fnv(v); out.fh = _fnv(f);
    out.vhd = v.replace(/\s+/g, ' ').trim().slice(0, 40);
    out.fhd = f.replace(/\s+/g, ' ').trim().slice(0, 40);
  } finally {
    try { gl.deleteShader(vs); gl.deleteShader(fs); } catch (e) { /* ignore */ }
  }
  return out;
}

/** Compile + link one program; with KHR_parallel_shader_compile, wait at most 50 ms. Returns vertex/fragment compile + link bits, or 't'. */
async function _linkProbe(gl, kpc, vsrc, fsrc) {
  const a = gl.createShader(gl.VERTEX_SHADER), b = gl.createShader(gl.FRAGMENT_SHADER), p = gl.createProgram();
  try {
    gl.shaderSource(a, vsrc); gl.compileShader(a);
    gl.shaderSource(b, fsrc); gl.compileShader(b);
    gl.attachShader(p, a); gl.attachShader(p, b); gl.linkProgram(p);
    if (kpc) {
      const t0 = performance.now();
      while (!gl.getProgramParameter(p, kpc.COMPLETION_STATUS_KHR)) {
        if (performance.now() - t0 > 50 || _glLost(gl)) return 't';
        await new Promise(function (r) { setTimeout(r, 4); });
      }
    }
    return '' + _bit(gl.getShaderParameter(a, gl.COMPILE_STATUS)) + _bit(gl.getShaderParameter(b, gl.COMPILE_STATUS)) +
      _bit(gl.getProgramParameter(p, gl.LINK_STATUS));
  } finally {
    try { gl.deleteProgram(p); gl.deleteShader(a); gl.deleteShader(b); } catch (e) { /* ignore */ }
  }
}

/** Reported limits read back by behaviour. Over-limit allocations are always N x 1. */
async function _glLimits(gl, c) {
  const out = {};
  const P = function (n) { return gl.getParameter(gl[n]); };
  const w = c.width, h = c.height;
  gl.getError();
  try { gl.viewport(0, 0, 100000, 100000); out.vp = Array.from(gl.getParameter(gl.VIEWPORT)).slice(2).join('x'); } catch (e) { /* ignore */ }
  try { gl.viewport(0, 0, w, h); } catch (e) { /* ignore */ }
  try { c.width = 70000; c.height = 1; out.dbw = gl.drawingBufferWidth + 'x' + gl.drawingBufferHeight; } catch (e) { /* ignore */ }
  try { c.width = w; c.height = h; gl.viewport(0, 0, w, h); } catch (e) { /* ignore */ }
  gl.getError();
  const mt = P('MAX_TEXTURE_SIZE'), mr = P('MAX_RENDERBUFFER_SIZE');
  const tex = gl.createTexture();
  try {
    gl.bindTexture(gl.TEXTURE_2D, tex);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, mt + 64, 1, 0, gl.RGBA, gl.UNSIGNED_BYTE, null); out.tov = gl.getError();
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, mt, 1, 0, gl.RGBA, gl.UNSIGNED_BYTE, null); out.toa = gl.getError();
  } finally { try { gl.bindTexture(gl.TEXTURE_2D, null); gl.deleteTexture(tex); } catch (e) { /* ignore */ } }
  const rb = gl.createRenderbuffer();
  try {
    const fmt = gl.RGBA8 || gl.RGBA4;
    gl.bindRenderbuffer(gl.RENDERBUFFER, rb);
    gl.renderbufferStorage(gl.RENDERBUFFER, fmt, mr + 64, 1); out.rov = gl.getError();
    gl.renderbufferStorage(gl.RENDERBUFFER, fmt, mr, 1); out.roa = gl.getError();
  } finally { try { gl.bindRenderbuffer(gl.RENDERBUFFER, null); gl.deleteRenderbuffer(rb); } catch (e) { /* ignore */ } }
  if (typeof gl.getInternalformatParameter === 'function') {
    try { out.smp = Array.from(gl.getInternalformatParameter(gl.RENDERBUFFER, gl.RGBA8, gl.SAMPLES) || []).join(','); } catch (e) { /* ignore */ }
  }
  gl.getError();
  if (typeof WebGL2RenderingContext !== 'undefined' && gl instanceof WebGL2RenderingContext) {
    const kpc = gl.getExtension('KHR_parallel_shader_compile');
    const nv = P('MAX_VERTEX_UNIFORM_VECTORS') + 64, nf = P('MAX_FRAGMENT_UNIFORM_VECTORS') + 64;
    const vsT = '#version 300 es\nin vec4 p;void main(){gl_Position=p;}';
    const fsT = '#version 300 es\nprecision highp float;out vec4 c;void main(){c=vec4(1);}';
    const vsU = '#version 300 es\nuniform vec4 u[' + nv + '];in float a;void main(){gl_Position=u[int(a)];}';
    const fsU = '#version 300 es\nprecision highp float;uniform vec4 u[' + nf + '];out vec4 c;void main(){c=u[int(gl_FragCoord.x)];}';
    out.uov = (await _linkProbe(gl, kpc, vsU, fsT)) + '/' + (await _linkProbe(gl, kpc, vsT, fsU));
  }
  return out;
}

/**
 * Runs after the synchronous block on the context _glBackend already made; releases the context at the end.
 * Each result is written to `res` (ts, le) once it is final, so the caller can stop waiting at its deadline.
 */
async function _glDeep(gl, c, pms, res) {
  if (!gl) { res.ts = null; res.le = null; return; }
  try {
    await _yield();
    if (_glLost(gl)) { res.ts = { lost: 1 }; res.le = { lost: 1 }; return; }
    let t = performance.now(), v = null;
    try { v = await _glTranslated(gl); } catch (e) { v = null; }
    pms.gts = _ms(t);
    res.ts = v;
    await _yield();
    if (_glLost(gl)) { res.le = { lost: 1 }; return; }
    t = performance.now();
    try { v = await _glLimits(gl, c); } catch (e) { v = null; }
    if (v && _glLost(gl)) v.lost = 1;
    pms.gle = _ms(t);
    res.le = v;
  } finally {
    try { const l = gl.getExtension('WEBGL_lose_context'); if (l) l.loseContext(); } catch (e) { /* ignore */ }
  }
}

function _glRenderHash(gl, c) {
  try {
    const vs = 'attribute vec2 p;varying vec2 v;void main(){v=p;gl_Position=vec4(p,0.0,1.0);}';
    const fs = 'precision highp float;varying vec2 v;void main(){float a=sin(v.x*37.3)*cos(v.y*91.7);' +
      'float b=fract(sin(dot(v,vec2(12.9898,78.233)))*43758.5453);gl_FragColor=vec4(a*0.5+0.5,b,pow(abs(v.x),1.7),1.0);}';
    const sh = (t, src) => { const o = gl.createShader(t); gl.shaderSource(o, src); gl.compileShader(o); return o; };
    const prog = gl.createProgram();
    gl.attachShader(prog, sh(gl.VERTEX_SHADER, vs)); gl.attachShader(prog, sh(gl.FRAGMENT_SHADER, fs));
    gl.linkProgram(prog); gl.useProgram(prog);
    const buf = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, buf);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]), gl.STATIC_DRAW);
    const loc = gl.getAttribLocation(prog, 'p');
    gl.enableVertexAttribArray(loc); gl.vertexAttribPointer(loc, 2, gl.FLOAT, false, 0, 0);
    gl.viewport(0, 0, c.width, c.height);
    gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
    const px = new Uint8Array(c.width * c.height * 4);
    gl.readPixels(0, 0, c.width, c.height, gl.RGBA, gl.UNSIGNED_BYTE, px);
    let str = '';
    for (let i = 0; i < px.length; i += 37) str += px[i].toString(16);
    return _fnv(str);
  } catch (e) { return null; }
}

function _emoji() {
  try {
    const ctx = document.createElement('canvas').getContext('2d');
    if (!ctx) return null;
    const set = ['\u{1F600}', '\u{1F468}‍\u{1F469}‍\u{1F467}', '\u{1F3F3}️‍\u{1F308}', '\u{1FAE0}', '\u{1FAE8}', '\u{1F426}‍\u{1F525}', '❤️'];
    ctx.font = '32px sans-serif';
    const out = [];
    for (let i = 0; i < set.length; i++) {
      const m = ctx.measureText(set[i]);
      out.push([Math.round(m.width * 100) / 100, Math.round((m.actualBoundingBoxAscent || 0) * 100) / 100, Math.round((m.actualBoundingBoxDescent || 0) * 100) / 100].join(':'));
    }
    return out.join('|');
  } catch (e) { return null; }
}

function _audio(timeoutMs) {
  return new Promise(function (resolve) {
    try {
      const OAC = globalThis.OfflineAudioContext || globalThis.webkitOfflineAudioContext;
      if (!OAC) { resolve(null); return; }
      const ctx = new OAC(1, 5000, 44100);
      const osc = ctx.createOscillator(); osc.type = 'triangle'; osc.frequency.value = 10000;
      const comp = ctx.createDynamicsCompressor();
      comp.threshold.value = -50; comp.knee.value = 40; comp.ratio.value = 12; comp.attack.value = 0; comp.release.value = 0.25;
      osc.connect(comp); comp.connect(ctx.destination); osc.start(0);
      const t = setTimeout(function () { resolve(null); }, timeoutMs);
      ctx.startRendering().then(function (buf) {
        clearTimeout(t);
        let sum = 0;
        const d = buf.getChannelData(0);
        for (let i = 4500; i < 5000; i++) sum += Math.abs(d[i]);
        let red = null;
        try { red = typeof comp.reduction === 'number' ? comp.reduction : comp.reduction.value; } catch (e) { /* ignore */ }
        resolve({ sum: Math.round(sum * 1e6) / 1e6, reduction: red === null ? null : Math.round(red * 1e4) / 1e4, sampleRate: ctx.sampleRate });
      }, function () { clearTimeout(t); resolve(null); });
    } catch (e) { resolve(null); }
  });
}

/**
 * Voice list after it settles. Ends on the second voiceschanged event. After a first event that brings voices it
 * waits for a second one (voice sources report separately; a cold browser can deliver the second one a few hundred
 * ms later, a warm one sends the whole list at once): at least _VOICE_MIN ms, longer while `rest` (the other
 * probes and the worker, which the record waits for anyway) is pending, at most _VOICE_MAX ms. If voices are already there at
 * the start and no event comes, it ends after 100 ms. Never later than timeoutMs after the current synchronous
 * block. Raw extras: ev (events seen before the list was read), n1 (count at the first event); pms.vn1 (ms to
 * the first event), pms.vn (ms until the list was read).
 */
function _voiceNames(timeoutMs, pms, rest) {
  return new Promise(function (resolve) {
    let ss = null, done = false, ev = 0, n1 = null, t1 = null, settle = null, least = null, cap = null;
    let restDone = !rest, minDone = false;
    const t0 = performance.now();
    const count = function () { return (ss.getVoices() || []).length; };
    const stop = function () {
      done = true;
      clearTimeout(settle); clearTimeout(least); clearTimeout(cap);
      try { ss.removeEventListener('voiceschanged', onChange); } catch (e) { /* ignore */ }
    };
    const fail = function () { if (!done) { stop(); resolve(null); } };
    const arm = function (ms) { clearTimeout(settle); settle = setTimeout(finish, ms); };
    function onChange() {
      try {
        ev++;
        if (ev === 1) { n1 = count(); t1 = Math.round(performance.now() - t0); }
        if (ev >= 2) { finish(); return; }
        if (!n1) return;
        arm(_VOICE_MAX);
        clearTimeout(least);
        least = setTimeout(function () { minDone = true; if (restDone) finish(); }, _VOICE_MIN);
      } catch (e) { fail(); }
    }
    function finish() {
      if (done) return;
      stop();
      try {
        const v = ss.getVoices() || [];
        const names = v.map(x => x.name + '|' + x.lang + '|' + (x.localService ? 'L' : 'R')).sort();
        const cls = { microsoft: 0, google: 0, apple: 0, espeak: 0, other: 0 };
        for (let i = 0; i < v.length; i++) {
          const n = String(v[i].name || '').toLowerCase();
          if (n.indexOf('microsoft') >= 0) cls.microsoft++;
          else if (n.indexOf('google') >= 0) cls.google++;
          else if (n.indexOf('espeak') >= 0) cls.espeak++;
          else if (/samantha|alex|daniel|karen|moira|tessa|fred|victoria|thomas|anna|yuna|kyoko|ting-ting|aaron|nicky/.test(n)) cls.apple++;
          else cls.other++;
        }
        if (pms) { pms.vn1 = t1; pms.vn = Math.round(performance.now() - t0); }
        resolve({ hash: names.length ? _fnv(names.join(';')) : null, count: names.length, cls: cls, ev: ev, n1: n1 });
      } catch (e) { resolve(null); }
    }
    try {
      ss = globalThis.speechSynthesis;
      if (!ss) { resolve(null); return; }
      const n0 = count();   // read before the listener is attached, so a throwing getVoices leaves nothing behind
      ss.addEventListener('voiceschanged', onChange);
      if (n0) arm(100);
      if (rest) rest.then(function () { restDone = true; if (minDone) finish(); });
      setTimeout(function () { if (!done) cap = setTimeout(finish, timeoutMs); }, 0);
    } catch (e) { fail(); }
  });
}

function _intl() {
  try {
    const out = {};
    const sv = Intl.supportedValuesOf;
    if (typeof sv === 'function') {
      for (const k of ['timeZone', 'currency', 'calendar', 'collation', 'numberingSystem', 'unit']) { try { out[k] = sv(k).length; } catch (e) { /* ignore */ } }
    }
    const d = new Date(Date.UTC(2023, 2, 26, 1, 30, 0));
    try { out.fmt1 = new Intl.DateTimeFormat('en-US', { dateStyle: 'full', timeStyle: 'long', timeZone: 'America/Santiago' }).format(d); } catch (e) { /* ignore */ }
    try { out.fmt2 = new Intl.DateTimeFormat('he-IL', { dateStyle: 'long', timeZone: 'Asia/Jerusalem', calendar: 'hebrew' }).format(d); } catch (e) { /* ignore */ }
    try { out.num = new Intl.NumberFormat('ar-EG', { style: 'unit', unit: 'kilometer-per-hour' }).format(1234567.891); } catch (e) { /* ignore */ }
    try { out.rel = new Intl.RelativeTimeFormat('fa', { numeric: 'auto' }).format(-1, 'day'); } catch (e) { /* ignore */ }
    try { out.list = new Intl.ListFormat('ja', { type: 'disjunction' }).format(['a', 'b', 'c']); } catch (e) { /* ignore */ }
    try { out.dn = new Intl.DisplayNames(['en'], { type: 'region' }).of('XK'); } catch (e) { /* ignore */ }
    return out;
  } catch (e) { return null; }
}

function _mathHash() {
  try {
    const vals = [Math.tan(-1e300), Math.sin(1e300), Math.cos(1e22), Math.exp(709.7), Math.sinh(1e-7), Math.expm1(1e-10),
      Math.log1p(1e-15), Math.atan2(1e-310, 2), Math.cbrt(Math.PI), Math.pow(Math.PI, -100), Math.acosh(1e300), Math.tanh(0.5)];
    return _fnv(vals.map(v => String(v)).join(','));
  } catch (e) { return null; }
}

async function _mainProfile() {
  const n = navigator;
  const p = {
    ua: _s(() => n.userAgent), hc: _s(() => n.hardwareConcurrency), dm: _s(() => n.deviceMemory),
    plat: _s(() => n.platform), lang: _s(() => n.language), langs: _s(() => (n.languages || []).join(',')),
    mtp: _s(() => n.maxTouchPoints), tz: _s(() => Intl.DateTimeFormat().resolvedOptions().timeZone),
    gpu: null, uadPlat: null, uadMobile: null,
  };
  const g = _glRenderer('webgl2') || _glRenderer('webgl');
  p.gpu = g ? g.renderer : null;
  try {
    if (n.userAgentData) { p.uadPlat = n.userAgentData.platform; p.uadMobile = _bit(n.userAgentData.mobile); }
  } catch (e) { /* ignore */ }
  return p;
}

/**
 * Dedicated worker. Message 1 is the navigator/GPU profile (unchanged); message 2 is the text raster of the
 * embedded font on an OffscreenCanvas ({wft: ...}). After message 1 the main side waits for message 2 until
 * 300 ms have passed and `release` (the other probes being done) has resolved, whichever is later.
 * wft is the raster, or a code: '-' API missing, 'e' font refused or failed to load, 'x' raster threw,
 * 't' message 2 had not arrived when the wait ended; null when the worker could not run at all.
 */
function _workerProfile(timeoutMs, late, release) {
  return new Promise(function (resolve) {
    let url = null, w = null, done = false, failed = false, p1, m2, t2 = null, waited = false, released = !release;
    const finish = function () {
      if (done) return; done = true;
      clearTimeout(t2);
      try { if (w) w.terminate(); } catch (e) { /* ignore */ }
      try { if (url) URL.revokeObjectURL(url); } catch (e) { /* ignore */ }
      resolve({ p: p1 === undefined ? null : p1, wft: m2 !== undefined ? m2 : (w && !failed ? 't' : null) });
    };
    const body = [
      'self.onmessage=function(ev){',
      ' var fl=_fload(ev.data);',
      ' var p={};',
      ' try{p.ua=self.navigator.userAgent}catch(e){}',
      ' try{p.hc=self.navigator.hardwareConcurrency}catch(e){}',
      ' try{p.dm=self.navigator.deviceMemory}catch(e){}',
      ' try{p.plat=self.navigator.platform}catch(e){}',
      ' try{p.lang=self.navigator.language}catch(e){}',
      ' try{p.tz=Intl.DateTimeFormat().resolvedOptions().timeZone}catch(e){}',
      ' try{var c=new OffscreenCanvas(1,1);var gl=c.getContext("webgl2")||c.getContext("webgl");',
      '   if(gl){p.gpuV=gl.getParameter(gl.VENDOR);p.gpu=gl.getParameter(gl.RENDERER);',
      '     if(!p.gpu||p.gpu==="WebKit WebGL"){var ext=gl.getExtension("WEBGL_debug_renderer_info");',
      '       if(ext){p.gpuV=gl.getParameter(ext.UNMASKED_VENDOR_WEBGL);p.gpu=gl.getParameter(ext.UNMASKED_RENDERER_WEBGL);}}}}catch(e){}',
      ' var sent=false;',
      ' function send(){if(sent)return;sent=true;try{self.postMessage(p)}catch(e){}_wft(fl,ev.data);}',
      ' try{if(self.navigator.userAgentData&&self.navigator.userAgentData.getHighEntropyValues){',
      '   self.navigator.userAgentData.getHighEntropyValues(["platform","platformVersion","architecture","bitness"]).then(function(h){p.uad=h;send();},send);',
      ' }else{send();}}catch(e){send();}',
      '};',
      // _fload: a promise of the load ms, or a code: "-" API missing, "e" the font was refused or failed to load.
      'function _fload(d){',
      ' try{if(!d||typeof FontFace!=="function"||!self.fonts||typeof OffscreenCanvas!=="function")return "-";',
      '   var t0=performance.now(),b=atob(d.f),u=new Uint8Array(b.length);for(var i=0;i<b.length;i++)u[i]=b.charCodeAt(i);',
      '   return new FontFace(d.n,u.buffer).load().then(function(f){self.fonts.add(f);return performance.now()-t0;});',
      ' }catch(e){return "e";}',
      '}',
      'function _wft(fl,d){',
      ' function post(v){try{self.postMessage({wft:v})}catch(e){}}',
      ' if(typeof fl==="string"){post(fl);return;}',
      ' fl.then(function(lms){',
      '  var t0=performance.now(),o={},font="16px \\""+d.n+"\\"";',
      '  try{',
      '   var W=200,H=28;',
      '   var st=function(opaque){',
      '    var c=new OffscreenCanvas(W,H),x=c.getContext("2d",opaque?{alpha:false,willReadFrequently:true}:{willReadFrequently:true});',
      '    if(opaque){x.fillStyle="#fff";x.fillRect(0,0,W,H);}',
      '    x.fillStyle="#000";x.font=font;x.textBaseline="alphabetic";x.fillText(d.t,2.3,20.4);',
      '    var px=x.getImageData(0,0,W,H).data,h=0x811c9dc5,ink=0,fr=0,lv={},n=0;',
      '    for(var i=0;i<px.length;i+=4){var r=px[i],g=px[i+1],b=px[i+2],a=px[i+3],v,k;',
      '     if(opaque){v=255-Math.round((r+g+b)/3);k=r+","+g+","+b;h=Math.imul(h^r,16777619)>>>0;h=Math.imul(h^g,16777619)>>>0;h=Math.imul(h^b,16777619)>>>0;if(Math.max(r,g,b)-Math.min(r,g,b)>8)fr++;}',
      '     else{v=a;k=a;h=Math.imul(h^a,16777619)>>>0;}',
      '     if(v){ink+=v;if(!lv[k]){lv[k]=1;n++;}}}',
      '    var m=x.measureText(d.t);',
      '    return {h:("0000000"+h.toString(16)).slice(-8),ink:ink,lv:n,fr:fr,m:m};',
      '   };',
      '   var tr=st(false),op=st(true),m=tr.m;',
      '   o.th=tr.h;o.ink=tr.ink;o.lv=tr.lv;o.oh=op.h;o.ofr=op.fr;o.olv=op.lv;',
      '   o.m=[m.width,m.actualBoundingBoxLeft,m.actualBoundingBoxRight,m.actualBoundingBoxAscent,m.actualBoundingBoxDescent,m.fontBoundingBoxAscent,m.fontBoundingBoxDescent].map(function(v){return typeof v==="number"?Math.round(v*1000)/1000:null}).join(",");',
      '   try{o.fc=self.fonts.check(font)?1:0}catch(e){}',
      '   o.lms=Math.round(lms*10)/10;o.ms=Math.round((performance.now()-t0)*10)/10;',
      '  }catch(e){o="x";}',
      '  post(o);',
      ' },function(){post("e");});',
      '}',
    ].join('\n');
    try {
      url = URL.createObjectURL(new Blob([body], { type: 'text/javascript' }));
      w = new Worker(url);
      w.onmessage = function (ev) {
        const d = ev.data;
        if (d && typeof d === 'object' && Object.prototype.hasOwnProperty.call(d, 'wft')) {
          m2 = d.wft;
          if (p1 !== undefined) finish();
          return;
        }
        if (p1 !== undefined) return;
        p1 = d || {};
        if (m2 !== undefined) finish();
        else t2 = setTimeout(function () { waited = true; if (released) finish(); }, 300);
      };
      if (release) release.then(function () { released = true; if (waited) finish(); });
      w.onerror = function () { failed = true; finish(); };
      w.postMessage({ f: _wfFont, t: _wfText, n: 'w' + _rand() });
    } catch (e) { failed = true; finish(); return; }
    if (late) setTimeout(function () { if (!done) setTimeout(finish, timeoutMs); }, 0); else setTimeout(finish, timeoutMs);
  });
}

function _iframeProfile(timeoutMs) {
  return new Promise(function (resolve) {
    let frame = null, done = false;
    const finish = function (v) {
      if (done) return; done = true;
      try { if (frame && frame.parentNode) frame.parentNode.removeChild(frame); } catch (e) { /* ignore */ }
      resolve(v);
    };
    try {
      frame = document.createElement('iframe');
      if (_tag) { try { _tag(frame); } catch (e) { /* ignore */ } }
      frame.setAttribute('aria-hidden', 'true');
      frame.tabIndex = -1;
      frame.style.cssText = 'position:absolute;width:0;height:0;border:0;visibility:hidden';
      frame.srcdoc = '<!doctype html><title></title>';
      frame.onload = function () {
        try {
          const w = frame.contentWindow, n = w.navigator, p = {};
          p.ua = _s(() => n.userAgent); p.hc = _s(() => n.hardwareConcurrency); p.dm = _s(() => n.deviceMemory);
          p.plat = _s(() => n.platform); p.lang = _s(() => n.language);
          p.tz = _s(() => w.Intl.DateTimeFormat().resolvedOptions().timeZone);
          p.globals = _s(() => Object.getOwnPropertyNames(w).length);
          try {
            const base = new Set(Object.getOwnPropertyNames(w));
            const extra = Object.getOwnPropertyNames(window).filter(function (n) { return !base.has(n) && !/^\d+$/.test(n); });
            p.extraCount = extra.length;
            p.extra = extra.sort().slice(0, 80);
          } catch (e) { /* ignore */ }
          try { if (n.userAgentData) { p.uadPlat = n.userAgentData.platform; p.uadMobile = _bit(n.userAgentData.mobile); } } catch (e) { /* ignore */ }
          try {
            const c = w.document.createElement('canvas');
            const gl = c.getContext('webgl2') || c.getContext('webgl');
            if (gl) {
              let r = gl.getParameter(gl.RENDERER);
              if (!r || r === 'WebKit WebGL') { const ext = gl.getExtension('WEBGL_debug_renderer_info'); if (ext) r = gl.getParameter(ext.UNMASKED_RENDERER_WEBGL); }
              p.gpu = String(r || '');
            }
          } catch (e) { /* ignore */ }
          finish(p);
        } catch (e) { finish(null); }
      };
      (document.body || document.documentElement).appendChild(frame);
    } catch (e) { finish(null); return; }
    setTimeout(function () { finish(null); }, timeoutMs);
  });
}

function _nlOs() {
  try {
    const sz = new Blob(['\n'], { endings: 'native' }).size;
    return sz === 2 ? 'crlf' : sz === 1 ? 'lf' : null;
  } catch (e) { return null; }
}

async function _uaChHighEntropy() {
  try {
    const uad = navigator.userAgentData;
    if (!uad || typeof uad.getHighEntropyValues !== 'function') return null;
    return await uad.getHighEntropyValues(['architecture', 'bitness', 'model', 'platform', 'platformVersion', 'uaFullVersion', 'fullVersionList', 'wow64', 'formFactors']);
  } catch (e) { return null; }
}

function _featWitness() {
  const bits = {};
  let min = 0;
  const presentMajors = [];
  const absentMajors = [];
  for (let i = 0; i < _featTable.length; i++) {
    const name = _featTable[i][0], present = _s(_featTable[i][1]) ? 1 : 0, major = _featTable[i][2];
    bits[name] = present;
    if (present) presentMajors.push(major); else absentMajors.push(major);
  }
  if (presentMajors.length) min = Math.max.apply(null, presentMajors);
  let max = null;
  if (absentMajors.length) max = Math.min.apply(null, absentMajors) - 1;
  return { bits: bits, min: min || null, max: max };
}

function _uaMajor() {
  const m = /(?:Chrome|Chromium|HeadlessChrome)\/(\d+)/.exec(String(navigator.userAgent || ''));
  return m ? Number(m[1]) : null;
}

async function _webgpu(timeoutMs, late) {
  try {
    if (!navigator.gpu || typeof navigator.gpu.requestAdapter !== 'function') return null;
    const adapter = await _bounded(navigator.gpu.requestAdapter(), timeoutMs, late);
    if (!adapter) return { present: 0 };
    const out = { present: 1, fallback: _bit(adapter.isFallbackAdapter) };
    try { if (adapter.info) { out.vendor = adapter.info.vendor; out.architecture = adapter.info.architecture; out.description = adapter.info.description; } } catch (e) { /* ignore */ }
    try {
      const lim = adapter.limits, keys = [];
      for (const k in lim) keys.push(k + ':' + lim[k]);
      out.limitsHash = _fnv(keys.sort().join('|'));
    } catch (e) { /* ignore */ }
    try { out.featuresHash = _fnv(Array.from(adapter.features || []).sort().join('|')); } catch (e) { /* ignore */ }
    try {
      const i = adapter.info;
      if (i) {
        out.sg = (typeof i.subgroupMinSize === 'number' && typeof i.subgroupMaxSize === 'number') ? i.subgroupMinSize + '/' + i.subgroupMaxSize : null;
        out.ifb = typeof i.isFallbackAdapter === 'boolean' ? _bit(i.isFallbackAdapter) : null;
      }
    } catch (e) { /* ignore */ }
    try { out.feat = Array.from(adapter.features || []).sort().join(','); } catch (e) { /* ignore */ }
    try {
      const L = adapter.limits;
      out.lim = ['maxTextureDimension2D', 'maxBufferSize', 'maxStorageBufferBindingSize', 'maxComputeWorkgroupStorageSize',
        'maxComputeInvocationsPerWorkgroup'].map(function (k) { return L[k]; }).join(',');
    } catch (e) { /* ignore */ }
    try { const wf = navigator.gpu.wgslLanguageFeatures; out.wgsl = wf ? wf.size : null; } catch (e) { /* ignore */ }
    try { out.pcf = navigator.gpu.getPreferredCanvasFormat(); } catch (e) { /* ignore */ }
    return out;
  } catch (e) { return null; }
}

/**
 * WebCodecs: HEVC 1080p decoder with prefer-hardware, and AAC audio encode/decode support (H.264, VP9 and AV1 decode
 * are hwd's). Queries start at once; each is capped at capMs counted from the end of the current synchronous block.
 */
async function _webCodecs(capMs) {
  const VD = globalThis.VideoDecoder, AE = globalThis.AudioEncoder, AD = globalThis.AudioDecoder;
  if (typeof VD !== 'function' && typeof AE !== 'function' && typeof AD !== 'function') return null;
  const q = function (C, cfg) {
    if (typeof C !== 'function' || typeof C.isConfigSupported !== 'function') return Promise.resolve('-');
    return _race(function () { return C.isConfigSupported(cfg); }, capMs, function (r) { return r && r.supported ? 1 : 0; }, 't', 'r', true);
  };
  const r = await Promise.all([
    q(VD, { codec: 'hvc1.1.6.L120.90', codedWidth: 1920, codedHeight: 1080, hardwareAcceleration: 'prefer-hardware' }),
    q(AE, { codec: 'mp4a.40.2', sampleRate: 48000, numberOfChannels: 2, bitrate: 128000 }),
    q(AD, { codec: 'mp4a.40.2', sampleRate: 48000, numberOfChannels: 2 })]);
  return { hev: r[0], aen: r[1], ade: r[2] };
}

/** Heights (px) of the same text in a narrow lang=en-US box with hyphens:auto vs hyphens:manual. */
function _hyphens() {
  const host = document.body || document.documentElement;
  const mk = function (mode) {
    const d = document.createElement('div');
    if (_tag) { try { _tag(d); } catch (e) { /* ignore */ } }
    d.lang = 'en-US';
    d.setAttribute('aria-hidden', 'true');
    d.style.cssText = 'position:absolute;left:-9999px;top:0;visibility:hidden;width:72px;font:16px/20px serif;word-break:normal;' +
      'hyphens:' + mode + ';-webkit-hyphens:' + mode;
    d.textContent = 'characteristically internationalization hyphenation responsibilities';
    host.appendChild(d);
    try { return d.offsetHeight; } finally { d.remove(); }
  };
  return mk('auto') + '/' + mk('manual');
}

/** measureText widths (64 px) of generic and system font names, and of a family that does not exist (fb). */
function _genericFontWidths() {
  const ctx = document.createElement('canvas').getContext('2d');
  if (!ctx) return null;
  try { if ('lang' in ctx) ctx.lang = 'en'; } catch (e) { /* ignore */ }
  const text = 'mmmmmmmmmmlli 0O@#WwQq';
  const w = function (fam) {
    ctx.font = '10px serif';
    ctx.font = '64px ' + fam;
    if (String(ctx.font).indexOf('64px') !== 0) return null;
    return Math.round(ctx.measureText(text).width * 100) / 100;
  };
  const out = { fb: w('"x' + _rand() + _rand() + '"') };
  for (let i = 0; i < _genericFonts.length; i++) out[_genericFonts[i][0]] = w(_genericFonts[i][1]);
  return out;
}

async function _hwDecode(timeoutMs) {
  try {
    const mc = navigator.mediaCapabilities;
    if (!mc || typeof mc.decodingInfo !== 'function') return null;
    const cfgs = {
      h264: { type: 'file', video: { contentType: 'video/mp4; codecs="avc1.42E01E"', width: 1920, height: 1080, bitrate: 4000000, framerate: 30 } },
      vp9: { type: 'file', video: { contentType: 'video/webm; codecs="vp09.00.10.08"', width: 1920, height: 1080, bitrate: 4000000, framerate: 30 } },
      av1: { type: 'file', video: { contentType: 'video/mp4; codecs="av01.0.08M.08"', width: 1920, height: 1080, bitrate: 4000000, framerate: 30 } },
    };
    const out = {};
    for (const k in cfgs) {
      const r = await _bounded(mc.decodingInfo(cfgs[k]), timeoutMs);
      out[k] = r ? (r.supported ? (r.powerEfficient ? 'hw' : 'sw') : 'no') : null;
    }
    return out;
  } catch (e) { return null; }
}

function _selfProto(target) {
  if (target === null || target === undefined || (typeof target !== 'object' && typeof target !== 'function')) return 'na';
  let orig;
  try { orig = _getProto(target); } catch (e) { return 'na'; }
  try {
    _setProto(target, target);
    try { _setProto(target, orig); } catch (e) { /* ignore */ }
    return 'set';
  } catch (e) {
    const n = e && e.name;
    if (n === 'TypeError') return 'native';
    if (n === 'RangeError') return 'proxy';
    return 'other:' + n;
  }
}

function _protoChain() {
  const targets = {
    navigator: _s(() => navigator),
    screen: _s(() => screen),
    permissionsQuery: _s(() => navigator.permissions && navigator.permissions.query),
    canvasToDataURL: _s(() => HTMLCanvasElement.prototype.toDataURL),
    getParameter: _s(() => globalThis.WebGLRenderingContext && WebGLRenderingContext.prototype.getParameter),
    fnToString: _s(() => Function.prototype.toString),
    getHighEntropy: _s(() => navigator.userAgentData && navigator.userAgentData.getHighEntropyValues),
  };
  const map = {};
  let proxies = 0;
  for (const k in targets) {
    const t = targets[k];
    const r = t === null ? 'na' : _selfProto(t);
    map[k] = r;
    if (r === 'proxy') proxies++;
  }
  return { map: map, proxies: proxies };
}

function _cloneProbe() {
  if (!_struct) return { map: null, clones: null };
  const targets = {
    plugins: _s(() => navigator.plugins),
    mimeTypes: _s(() => navigator.mimeTypes),
    userAgentData: _s(() => navigator.userAgentData),
    connection: _s(() => navigator.connection),
    screenObj: _s(() => screen),
  };
  const map = {};
  let clones = 0;
  for (const k in targets) {
    const t = targets[k];
    if (t === null || t === undefined) { map[k] = 'absent'; continue; }
    try { _struct(t); map[k] = 'cloned'; clones++; }
    catch (e) { map[k] = 'threw:' + (e && e.name); }
  }
  return { map: map, clones: clones };
}

function _srcShape() {
  const targets = {
    toDataURL: _s(() => HTMLCanvasElement.prototype.toDataURL),
    getImageData: _s(() => globalThis.CanvasRenderingContext2D && CanvasRenderingContext2D.prototype.getImageData),
    getParameter: _s(() => globalThis.WebGLRenderingContext && WebGLRenderingContext.prototype.getParameter),
    getChannelData: _s(() => globalThis.AudioBuffer && AudioBuffer.prototype.getChannelData),
    getHighEntropy: _s(() => navigator.userAgentData && navigator.userAgentData.getHighEntropyValues),
    permissionsQuery: _s(() => navigator.permissions && navigator.permissions.query),
    attachShadow: _s(() => Element.prototype.attachShadow),
    toString: _s(() => Function.prototype.toString),
  };
  const hashes = {};
  let count = 0;
  for (const k in targets) {
    const t = targets[k];
    if (typeof t !== 'function') continue;
    let src = '';
    try { src = _fnToString.call(t); } catch (e) { hashes[k] = 'threw'; count++; continue; }
    if (src.indexOf('[native code]') < 0) { hashes[k] = _fnv(src); count++; }
  }
  return { hashes: hashes, count: count };
}

function _historyDepth(timeoutMs) {
  return new Promise(function (resolve) {
    let frame = null, url = null, done = false;
    const finish = function (v) {
      if (done) return; done = true;
      try { if (frame && frame.parentNode) frame.parentNode.removeChild(frame); } catch (e) { /* ignore */ }
      try { if (url) URL.revokeObjectURL(url); } catch (e) { /* ignore */ }
      resolve(v);
    };
    try {
      url = URL.createObjectURL(new Blob(['<!doctype html><title></title>'], { type: 'text/html' }));
      frame = document.createElement('iframe');
      frame.hidden = true; frame.tabIndex = -1;
      if (_tag) { try { _tag(frame); } catch (e) { /* ignore */ } }
      frame.onload = function () {
        try {
          const w = frame.contentWindow;
          for (let i = 0; i < 300; i++) { try { w.history.replaceState(null, '', '#r' + i); } catch (e) { break; } }
          const idx = Number(String(w.location.hash).slice(2));
          finish(Number.isFinite(idx) ? idx : null);
        } catch (e) { finish(null); }
      };
      frame.src = url;
      (document.body || document.documentElement).appendChild(frame);
    } catch (e) { finish(null); }
    setTimeout(function () { finish(null); }, timeoutMs);
  });
}

function _requestPair(timeoutMs) {
  const one = function (u) {
    return _bounded(fetch(u, { mode: 'no-cors', cache: 'no-store', credentials: 'omit' })
      .then(function () { return 1; }, function () { return 0; }), timeoutMs);
  };
  const ctl = new URL('favicon.ico?r=' + _rand(), location.href).href;
  const prb = new URL('favicon.ico', location.href).href;
  return Promise.all([one(ctl), one(prb)]).then(function (r) { return r[0] + '/' + r[1]; });
}

function _animTiming() {
  const el = document.createElement('div');
  if (typeof el.animate !== 'function') return null;
  const a = el.animate([{ opacity: 0 }, { opacity: 1 }], { duration: 5000 });
  try { const t = a.effect.getComputedTiming(); return t.duration + '/' + t.activeDuration; }
  finally { try { a.cancel(); } catch (e) { /* ignore */ } }
}

function _fontFaceStatus() {
  if (typeof globalThis.FontFace !== 'function') return null;
  try { return new FontFace('f' + _rand(), 'local(x' + _rand() + ')').status; } catch (e) { return null; }
}

function _heap() {
  const m = performance.memory;
  if (!m) return null;
  return { limit: m.jsHeapSizeLimit, q: (m.usedJSHeapSize % 100000 === 0 && m.totalJSHeapSize % 100000 === 0) ? 1 : 0 };
}


/** Layout and text probes, each in its own task after the synchronous block; each value goes to `res` when done. */
async function _domLate(pms, res) {
  const step = async function (key, fn) {
    await _yield();
    const t = performance.now();
    const v = _try(fn);
    pms[key] = _ms(t);
    res[key] = v;
  };
  await step('gff', _genericFontWidths);
  await step('hyp', _hyphens);
}

/** A probe's value from its result holder, or 't' if it had not finished by the deadline. */
function _held(h, k) { return Object.prototype.hasOwnProperty.call(h, k) ? h[k] : 't'; }

function _dnt() {
  return {
    w: _try(function () { return String(window.doNotTrack); }),
    n: _try(function () { return String(navigator.doNotTrack); }),
    ms: _try(function () { return String(navigator.msDoNotTrack); }),
  };
}

export const ENV_SCHEMA = 3;

/** Collect the raw environment record. Never throws; every field is a value or null. */
export async function collectEnv(options) {
  const o = Object.assign({ timeoutMs: 2500, tag: null }, options || {});
  _tag = typeof o.tag === 'function' ? o.tag : null;
  const t0 = performance.now();
  const out = { v: ENV_SCHEMA };
  const pms = {};
  // Voice count before any wait, then the settled list (listener attached now, read in the parallel block).
  out.vn0 = _try(function () { return globalThis.speechSynthesis ? (speechSynthesis.getVoices() || []).length : null; });
  // The voice list may wait for a second voiceschanged event while the other probes and the worker still run.
  let restDone = null;
  const restP = new Promise(function (r) { restDone = r; });
  const vnP = _voiceNames(Math.min(o.timeoutMs, 1200), pms, restP);
  // Off-thread and GPU-process work starts now so it overlaps the synchronous block below; their time limits
  // count from the end of that block, as they did when these probes started after it.
  const tw = performance.now();
  let releaseWorker = null;
  const othersDone = new Promise(function (r) { releaseWorker = r; });
  const ewP = _bounded(_workerProfile(o.timeoutMs, true, othersDone), o.timeoutMs + 300, true).then(function (v) { pms.ew = _ms(tw); return v; });
  const wgP = _webgpu(o.timeoutMs, true).then(function (v) { pms.wg = _ms(tw); return v; });
  const wcdP = _webCodecs(300).then(function (v) { pms.wcd = _ms(tw); return v; });
  out.dnt = _try(_dnt);
  let t = performance.now();
  out.nos = _try(_nlOs);
  out.few = _try(_featWitness);
  pms.few = _ms(t);
  out.ecl = _try(_uaMajor);
  out.g1 = _glRenderer('webgl');
  out.g2 = _glRenderer('webgl2');
  out.ofn = _try(_osFonts);
  out.ppc = _try(_protoCounts);
  t = performance.now();
  const gb = _try(_glBackend);
  pms.gbk = _ms(t);
  out.gbk = gb ? gb.params : null;
  out.grh = gb ? gb.render : null;
  out.emj = _try(_emoji);
  out.itl = _try(_intl);
  out.mth = _try(_mathHash);
  const pc = _try(_protoChain);
  out.tpm = pc ? pc.map : null;
  const cl = _try(_cloneProbe);
  out.tcl = cl ? cl.map : null;
  const sh = _try(_srcShape);
  out.tnh = sh ? sh.hashes : null;
  out.lat = _try(_animTiming);
  out.lff = _try(_fontFaceStatus);
  out.lhm = _try(_heap);
  out.em = await _mainProfile();
  pms.sync = _ms(t0);
  // gts/gle and gff/hyp share the record's deadline (timeoutMs after this block); unfinished ones read 't'.
  const gd = {}, dl = {};
  const rest = Promise.all([
    _bounded(_iframeProfile(o.timeoutMs), o.timeoutMs + 300),
    _bounded(_uaChHighEntropy(), o.timeoutMs),
    wgP,
    _hwDecode(o.timeoutMs),
    _audio(o.timeoutMs),
    _historyDepth(o.timeoutMs),
    _bounded(_requestPair(o.timeoutMs), o.timeoutMs + 500),
    _bounded(_glDeep(gb ? gb.gl : null, gb ? gb.canvas : null, pms, gd), o.timeoutMs, true),
    wcdP,
    _bounded(_domLate(pms, dl), o.timeoutMs, true),
  ]);
  rest.then(releaseWorker, releaseWorker);
  Promise.all([rest, ewP]).then(restDone, restDone);
  const both = await Promise.all([ewP, rest, vnP]);
  const r = both[1];
  out.ew = both[0] ? both[0].p : null; out.ei = r[0]; out.uah = r[1]; out.wg = r[2]; out.hwd = r[3]; out.aud = r[4];
  out.vn = both[2];
  out.lfi = r[5]; out.lrp = r[6];
  out.gts = _held(gd, 'ts');
  out.gle = _held(gd, 'le');
  out.wft = both[0] ? both[0].wft : 't';
  out.wcd = r[8];
  out.gff = _held(dl, 'gff');
  out.hyp = _held(dl, 'hyp');
  // A copy, so probes that finish after the deadline cannot change the returned record.
  out.pms = Object.assign({}, pms);
  if (out.wft && typeof out.wft === 'object') { out.pms.wfl = out.wft.lms; out.pms.wfr = out.wft.ms; delete out.wft.lms; delete out.wft.ms; }
  out.ms = Math.round(performance.now() - t0);
  return out;
}

export default collectEnv;
